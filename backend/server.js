import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pg from 'pg';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

const { Pool } = pg;
const app = express();
const PORT = Number(process.env.PORT || 3000);
const allowedStores = new Set(['customers','guarantors','suppliers','products','units','sales','installments','transactions','supplier_dues','audit_logs','branches','defaults','traffic','notifications','collection_notes']);

for (const key of ['DATABASE_URL', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'JWT_SECRET']) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}
if (process.env.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, max: 5 });
app.disable('x-powered-by');
app.use(helmet());
const origins = (process.env.APP_ORIGIN || '').split(',').map(x => x.trim()).filter(Boolean);
app.use(cors({ origin(origin, cb) {
  if (!origin || origins.includes(origin)) return cb(null, true);
  return cb(new Error('origin_not_allowed'));
}}));
app.use(express.json({ limit: '1mb' }));

const loginAttempts = new Map();
function safeEqual(a, b) {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const input = `${header}.${body}`;
  const sig = createHmac('sha256', process.env.JWT_SECRET).update(input).digest('base64url');
  return `${input}.${sig}`;
}
function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const input = `${parts[0]}.${parts[1]}`;
  const expected = createHmac('sha256', process.env.JWT_SECRET).update(input).digest();
  let actual;
  try { actual = Buffer.from(parts[2], 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload || payload.sub !== process.env.ADMIN_USERNAME) return res.status(401).json({ error: 'unauthorized' });
  req.user = payload;
  next();
}
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, service: 'bakry-erp-api' }); }
  catch { res.status(503).json({ ok: false, error: 'database_unavailable' }); }
});

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
  if (entry.until <= now) { entry.count = 0; entry.until = now + 15 * 60 * 1000; }
  if (entry.count >= 10) return res.status(429).json({ error: 'too_many_attempts' });
  const usernameOk = safeEqual(req.body?.username || '', process.env.ADMIN_USERNAME);
  const passwordOk = safeEqual(req.body?.password || '', process.env.ADMIN_PASSWORD);
  if (!usernameOk || !passwordOk) {
    entry.count++; loginAttempts.set(ip, entry);
    return res.status(401).json({ error: 'invalid_credentials' });
  }
  loginAttempts.delete(ip);
  const nowSec = Math.floor(now / 1000);
  const token = signToken({ sub: process.env.ADMIN_USERNAME, iat: nowSec, exp: nowSec + 8 * 60 * 60, jti: randomUUID() });
  res.json({ token, token_type: 'Bearer', expires_in: 28800 });
});

app.get('/api/stores/:store', requireAuth, async (req, res) => {
  const { store } = req.params;
  if (!allowedStores.has(store)) return res.status(400).json({ error: 'unknown_store' });
  try {
    const q = await pool.query('SELECT record_uuid, record_data, revision, updated_at FROM app_records WHERE store_name=$1 AND deleted_at IS NULL ORDER BY created_at', [store]);
    res.json({ items: q.rows });
  } catch { res.status(503).json({ error: 'database_unavailable' }); }
});

app.post('/api/sync/batch', requireAuth, async (req, res) => {
  const ops = req.body?.operations;
  if (!Array.isArray(ops) || ops.length > 500) return res.status(400).json({ error: 'invalid_batch' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN'); let applied = 0, skipped = 0;
    for (const op of ops) {
      if (!op || !uuidPattern.test(op.operation_uuid || '') || !uuidPattern.test(op.record_uuid || '') || !allowedStores.has(op.store_name) || !['put','delete'].includes(op.action)) throw new Error('invalid_operation');
      const marker = await client.query('INSERT INTO sync_operations(operation_uuid) VALUES($1) ON CONFLICT DO NOTHING RETURNING operation_uuid', [op.operation_uuid]);
      if (!marker.rowCount) { skipped++; continue; }
      if (op.action === 'delete') {
        await client.query('UPDATE app_records SET deleted_at=now(), updated_at=now(), revision=revision+1 WHERE record_uuid=$1 AND store_name=$2', [op.record_uuid, op.store_name]);
      } else {
        if (typeof op.record_data !== 'object' || op.record_data === null || Array.isArray(op.record_data)) throw new Error('invalid_record_data');
        await client.query(`INSERT INTO app_records(record_uuid,store_name,record_data) VALUES($1,$2,$3::jsonb)
          ON CONFLICT(record_uuid) DO UPDATE SET record_data=EXCLUDED.record_data, updated_at=now(), revision=app_records.revision+1, deleted_at=NULL
          WHERE app_records.store_name=EXCLUDED.store_name`, [op.record_uuid, op.store_name, JSON.stringify(op.record_data)]);
      }
      applied++;
    }
    await client.query('COMMIT'); res.json({ ok: true, applied, skipped });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: ['invalid_operation','invalid_record_data'].includes(e.message) ? e.message : 'sync_failed' });
  } finally { client.release(); }
});

app.use((err, _req, res, _next) => {
  if (err.message === 'origin_not_allowed') return res.status(403).json({ error: 'origin_not_allowed' });
  res.status(500).json({ error: 'internal_error' });
});
app.listen(PORT, () => console.log(`Bakry ERP API listening on ${PORT}`));
