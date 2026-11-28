import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pg from 'pg';
import {
  createHash, randomBytes, randomUUID, scrypt as scryptCallback,
  timingSafeEqual
} from 'node:crypto';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { calculateSubscriptionEnd } from './domain.js';
import { normalizeAllowedOrigins } from './cors-origin.js';
import { signToken, verifyToken } from './auth-token.js';

const { Pool } = pg;
const scrypt = promisify(scryptCallback);

const STORE_NAMES = new Set([
  'customers', 'guarantors', 'suppliers', 'products', 'units', 'sales',
  'installments', 'transactions', 'supplier_dues', 'audit_logs', 'branches',
  'defaults', 'traffic', 'notifications', 'collection_notes'
]);
const ROLES = new Set(['admin', 'sales', 'accounting', 'viewer']);
const DURATIONS = new Set(['month_1', 'month_2', 'month_4', 'year_1', 'lifetime']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

export { calculateSubscriptionEnd };

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(String(password), salt, 64);
  return `scrypt$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, saltText, hashText] = String(stored || '').split('$');
    if (scheme !== 'scrypt' || !saltText || !hashText) return false;
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    const actual = Buffer.from(await scrypt(String(password), salt, expected.length));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function readBearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

function rateLimitLogin(req, res) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let entry = loginAttempts.get(key);
  if (!entry || entry.resetAt <= now) entry = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    loginAttempts.set(key, entry);
    res.status(429).json({ error: 'too_many_attempts', retry_after_seconds: Math.ceil((entry.resetAt - now) / 1000) });
    return false;
  }
  entry.count += 1;
  loginAttempts.set(key, entry);
  return true;
}

function roleCanWrite(role, store) {
  if (role === 'admin') return true;
  const permissions = {
    sales: new Set(['customers', 'guarantors', 'products', 'units', 'sales', 'installments', 'traffic', 'defaults', 'notifications']),
    accounting: new Set(['customers', 'guarantors', 'suppliers', 'products', 'units', 'sales', 'installments', 'transactions', 'supplier_dues', 'audit_logs', 'branches', 'defaults', 'traffic', 'notifications', 'collection_notes']),
    viewer: new Set()
  };
  return permissions[role]?.has(store) || false;
}

function roleCanRead(role, store) {
  if (!STORE_NAMES.has(store)) return false;
  if (role === 'admin' || role === 'accounting' || role === 'viewer') return true;
  const salesReadable = new Set(['customers','guarantors','products','units','sales','installments','traffic','defaults','notifications']);
  return role === 'sales' && salesReadable.has(store);
}

function normalizeCode(code) {
  return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateActivationCode() {
  const raw = randomBytes(15).toString('hex').toUpperCase();
  return `BKRY-${raw.match(/.{1,5}/g).join('-')}`;
}

function makeSlug() {
  return `bakry-${randomBytes(6).toString('hex')}`;
}

function durationMonths(duration) {
  return ({ month_1: 1, month_2: 2, month_4: 4, year_1: 12 })[duration] || 0;
}

export function createApp({ pool, env = process.env } = {}) {
  if (!pool) throw new Error('pool_required');
  for (const key of ['DATABASE_URL', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'JWT_SECRET', 'APP_ORIGIN']) {
    if (!env[key]) throw new Error(`${key} is required`);
  }
  if (String(env.JWT_SECRET).length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  const origins = normalizeAllowedOrigins(env.APP_ORIGIN);
  // The production frontend is fixed on GitHub Pages. Keep it explicitly
  // allow-listed even if Render's APP_ORIGIN value contains an old path/value.
  // This is a single trusted origin, not a wildcard.
  origins.add('https://bakry-erp.github.io');
  if (!origins.size) throw new Error('APP_ORIGIN must contain at least one valid HTTPS origin');

  // Trace before CORS so failed OPTIONS preflights are visible too. Never log
  // request bodies, credentials, authorization headers, cookies or query strings.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const requestId = randomUUID();
    const requestOrigin = req.get('origin') || null;
    const requestOriginAllowed = !requestOrigin || origins.has(requestOrigin);
    res.setHeader('X-Request-Id', requestId);
    res.on('finish', () => {
      if (req.path.startsWith('/api/auth/') || req.path.startsWith('/api/owner/')) {
        console.log(JSON.stringify({
          event: 'api_request',
          request_id: requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          origin: requestOrigin,
          origin_allowed: requestOriginAllowed,
          duration_ms: Date.now() - startedAt
        }));
      }
    });
    next();
  });

  app.use(cors({
    origin(origin, callback) {
      if (!origin || origins.has(origin)) return callback(null, true);
      return callback(new Error('origin_not_allowed'));
    },
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
    optionsSuccessStatus: 204
  }));
  app.use(express.json({ limit: '1mb' }));

  function requireOwner(req, res, next) {
    const payload = verifyToken(readBearer(req), env.JWT_SECRET);
    if (!payload || payload.type !== 'owner' || payload.sub !== env.ADMIN_USERNAME) {
      return res.status(401).json({ error: 'owner_unauthorized' });
    }
    req.owner = payload;
    return next();
  }

  async function requireTenant(req, res, next) {
    const payload = verifyToken(readBearer(req), env.JWT_SECRET);
    if (!payload || payload.type !== 'tenant' || !UUID_RE.test(payload.tenantId || '') || !UUID_RE.test(payload.userId || '')) {
      return res.status(401).json({ error: 'tenant_unauthorized' });
    }
    try {
      const result = await pool.query(`
        SELECT u.id AS user_id, u.username, u.role, u.is_active,
               t.id AS tenant_id, t.slug, t.display_name, t.status AS tenant_status,
               s.id AS subscription_id, s.status AS subscription_status,
               s.starts_at, s.ends_at, s.user_limit, s.user_limit_unlimited
        FROM tenant_users u
        JOIN tenants t ON t.id = u.tenant_id
        LEFT JOIN LATERAL (
          SELECT id, status, starts_at, ends_at, user_limit, user_limit_unlimited
          FROM tenant_subscriptions
          WHERE tenant_id = t.id
          ORDER BY created_at DESC
          LIMIT 1
        ) s ON TRUE
        WHERE u.id = $1 AND u.tenant_id = $2
      `, [payload.userId, payload.tenantId]);
      const row = result.rows[0];
      if (!row || !row.is_active || row.tenant_status !== 'active' || row.subscription_status !== 'active') {
        return res.status(403).json({ error: 'license_inactive' });
      }
      if (row.starts_at && new Date(row.starts_at).getTime() > Date.now()) {
        return res.status(403).json({ error: 'subscription_not_started' });
      }
      if (row.ends_at && new Date(row.ends_at).getTime() <= Date.now()) {
        await pool.query("UPDATE tenant_subscriptions SET status='expired' WHERE id=$1 AND status='active'", [row.subscription_id]);
        return res.status(403).json({ error: 'subscription_expired' });
      }
      req.tenant = {
        id: row.tenant_id,
        slug: row.slug,
        name: row.display_name,
        userId: row.user_id,
        username: row.username,
        role: row.role,
        userLimit: row.user_limit,
        userLimitUnlimited: row.user_limit_unlimited
      };
      return next();
    } catch (error) {
      if (error.code === '42P01' || error.code === '42703') return res.status(503).json({ error: 'subscription_schema_not_migrated' });
      return next(error);
    }
  }

  function requireRoles(...roles) {
    return (req, res, next) => roles.includes(req.tenant?.role)
      ? next()
      : res.status(403).json({ error: 'forbidden' });
  }

  app.get('/api/health', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await pool.query('SELECT 1');
      let schemaReady = false;
      try {
        const check = await pool.query(`
          SELECT to_regclass('public.tenants') IS NOT NULL
             AND to_regclass('public.tenant_users') IS NOT NULL
             AND to_regclass('public.tenant_subscriptions') IS NOT NULL
             AND to_regclass('public.activation_codes') IS NOT NULL
             AND to_regclass('public.license_audit_events') IS NOT NULL
             AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='app_records' AND column_name='tenant_id')
             AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sync_operations' AND column_name='tenant_id')
             AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenant_subscriptions' AND column_name='user_limit_unlimited')
             AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='activation_codes' AND column_name='user_limit_unlimited') AS ready
        `);
        schemaReady = Boolean(check.rows[0]?.ready);
      } catch { schemaReady = false; }
      res.json({
        ok: true,
        database: 'connected',
        subscriptions_schema_ready: schemaReady,
        api_version: '9.2.0',
        auth_routes: { owner_login: true, tenant_login: true },
        owner_login_paths: ['/api/auth/login', '/api/owner/login', '/api/auth/owner-login'],
        concurrent_sessions: 'independent'
      });
    } catch {
      res.status(503).json({
        ok: false,
        database: 'unavailable',
        api_version: '9.2.0',
        auth_routes: { owner_login: true, tenant_login: true },
        owner_login_paths: ['/api/auth/login', '/api/owner/login', '/api/auth/owner-login'],
        concurrent_sessions: 'independent'
      });
    }
  });

  // Explicit, cache-free route check used by the owner dashboard before diagnosing a 404.
  app.get('/api/auth/owner-login-status', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const paths = ['/api/auth/login', '/api/owner/login', '/api/auth/owner-login'];
    const registeredPaths = paths.filter(path => app._router.stack.some(layer =>
      layer.route?.path === path && layer.route.methods?.post === true
    ));
    const requestOrigin = req.get('origin') || null;
    return res.json({
      ok: true,
      api_version: '9.2.0',
      owner_login_ready: registeredPaths.length === paths.length,
      owner_login_paths: paths,
      registered_owner_login_paths: registeredPaths,
      cors_configured: origins.size > 0,
      request_origin: requestOrigin,
      request_origin_allowed: !requestOrigin || origins.has(requestOrigin)
    });
  });

  // All supported owner-login URLs share exactly the same validation, rate limit and token logic.
  const ownerLoginHandler = (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!rateLimitLogin(req, res)) return;
    const usernameOk = safeEqual(req.body?.username || '', env.ADMIN_USERNAME);
    const passwordOk = safeEqual(req.body?.password || '', env.ADMIN_PASSWORD);
    if (!usernameOk || !passwordOk) return res.status(401).json({ error: 'invalid_credentials' });
    loginAttempts.delete(req.ip || req.socket.remoteAddress || 'unknown');
    const token = signToken({ type: 'owner', sub: env.ADMIN_USERNAME }, env.JWT_SECRET);
    return res.json({ token, token_type: 'Bearer', expires_in: 28800, role: 'owner' });
  };
  // Register each alias explicitly to make the deployed route table unambiguous.
  app.post('/api/auth/login', ownerLoginHandler);
  app.post('/api/owner/login', ownerLoginHandler);
  app.post('/api/auth/owner-login', ownerLoginHandler);

  app.post('/api/auth/tenant-login', async (req, res, next) => {
    if (!rateLimitLogin(req, res)) return;
    const tenantSlug = String(req.body?.tenantSlug || '').trim().toLowerCase();
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    if (!tenantSlug || username.length > 64 || !password || password.length > 256) return res.status(400).json({ error: 'invalid_credentials' });
    try {
      const result = await pool.query(`
        SELECT u.id AS user_id, u.username, u.password_hash, u.role, u.is_active,
               t.id AS tenant_id, t.slug, t.display_name, t.status AS tenant_status,
               s.status AS subscription_status, s.starts_at, s.ends_at
        FROM tenant_users u
        JOIN tenants t ON t.id = u.tenant_id
        LEFT JOIN LATERAL (
          SELECT status, starts_at, ends_at FROM tenant_subscriptions
          WHERE tenant_id = t.id ORDER BY created_at DESC LIMIT 1
        ) s ON TRUE
        WHERE t.slug = $1 AND u.username = $2
      `, [tenantSlug, username]);
      const row = result.rows[0];
      if (!row || !row.is_active || !(await verifyPassword(password, row.password_hash))) {
        loginAttempts.set(req.ip || 'unknown', loginAttempts.get(req.ip || 'unknown') || { count: 1, resetAt: Date.now() + LOGIN_WINDOW_MS });
        return res.status(401).json({ error: 'invalid_credentials' });
      }
      if (row.tenant_status !== 'active' || row.subscription_status !== 'active' || (row.starts_at && new Date(row.starts_at).getTime() > Date.now()) || (row.ends_at && new Date(row.ends_at).getTime() <= Date.now())) {
        return res.status(403).json({ error: 'license_inactive' });
      }
      loginAttempts.delete(req.ip || req.socket.remoteAddress || 'unknown');
      const token = signToken({
        type: 'tenant', sub: row.user_id, userId: row.user_id, tenantId: row.tenant_id,
        username: row.username, role: row.role
      }, env.JWT_SECRET);
      res.set('Cache-Control', 'no-store');
      return res.json({
        token, token_type: 'Bearer', expires_in: 28800,
        user: { id: row.user_id, username: row.username, role: row.role },
        tenant: { id: row.tenant_id, slug: row.slug, name: row.display_name }
      });
    } catch (error) { return next(error); }
  });

  app.get('/api/auth/me', requireTenant, (req, res) => {
    res.json({ user: { id: req.tenant.userId, username: req.tenant.username, role: req.tenant.role }, tenant: { id: req.tenant.id, slug: req.tenant.slug, name: req.tenant.name } });
  });

  app.post('/api/owner/activation-codes', requireOwner, async (req, res, next) => {
    const duration = String(req.body?.duration || '');
    const monthMode = req.body?.monthMode ?? null;
    const userLimitProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'userLimit');
    const userLimit = req.body?.userLimit;
    if (!DURATIONS.has(duration)) return res.status(400).json({ error: 'invalid_duration' });
    if (duration.startsWith('month_') && !['calendar', '30_days'].includes(monthMode)) {
      return res.status(400).json({ error: 'month_mode_required', allowed: ['calendar', '30_days'] });
    }
    if (!userLimitProvided || !(userLimit === 'unlimited' || (Number.isInteger(userLimit) && userLimit >= 1))) {
      return res.status(400).json({ error: 'user_limit_decision_required', allowed: 'positive_integer_or_unlimited' });
    }
    const userLimitUnlimited = userLimit === 'unlimited';
    const finiteUserLimit = userLimitUnlimited ? null : userLimit;
    const code = generateActivationCode();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        INSERT INTO activation_codes (code_hash, code_hint, duration_code, month_mode, user_limit, user_limit_unlimited, status, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,'unused',$7)
        RETURNING id, duration_code, month_mode, user_limit, user_limit_unlimited, status, created_at
      `, [sha256(normalizeCode(code)), code.slice(-4), duration, monthMode, finiteUserLimit, userLimitUnlimited, req.owner.sub]);
      await client.query(`INSERT INTO license_audit_events(tenant_id,action,actor,details) VALUES(NULL,'activation_code_created',$1,$2::jsonb)`, [req.owner.sub, JSON.stringify({ codeId: result.rows[0].id, codeHint: code.slice(-4), duration, monthMode, userLimit })]);
      await client.query('COMMIT');
      return res.status(201).json({ code, activation: result.rows[0], warning: 'يظهر الكود مرة واحدة فقط. احتفظ به في مكان آمن.' });
    } catch (error) {
      await client.query('ROLLBACK');
      return next(error);
    } finally { client.release(); }
  });

  app.post('/api/owner/activation-codes/:codeId/cancel', requireOwner, async (req, res, next) => {
    if (!UUID_RE.test(req.params.codeId)) return res.status(400).json({ error: 'invalid_code_id' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        UPDATE activation_codes SET status='cancelled'
        WHERE id=$1 AND status='unused'
        RETURNING id, code_hint, duration_code, status, created_at
      `, [req.params.codeId]);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'code_not_unused_or_not_found' });
      }
      await client.query(`INSERT INTO license_audit_events(tenant_id,action,actor,details) VALUES(NULL,'activation_code_cancelled',$1,$2::jsonb)`, [req.owner.sub, JSON.stringify({ codeId: result.rows[0].id, codeHint: result.rows[0].code_hint })]);
      await client.query('COMMIT');
      return res.json({ activation: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      return next(error);
    } finally { client.release(); }
  });

  app.get('/api/owner/activation-codes', requireOwner, async (_req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT id, code_hint, duration_code, month_mode, user_limit, user_limit_unlimited, status, tenant_id, created_at, activated_at
        FROM activation_codes ORDER BY created_at DESC LIMIT 500
      `);
      return res.json({ items: result.rows });
    } catch (error) { return next(error); }
  });

  app.get('/api/owner/tenants', requireOwner, async (_req, res, next) => {
    try {
      const result = await pool.query(`
        SELECT t.id, t.slug, t.display_name, t.status, t.created_at,
               s.duration_code, s.status AS subscription_status, s.starts_at, s.ends_at, s.user_limit, s.user_limit_unlimited,
               (SELECT COUNT(*)::int FROM tenant_users u WHERE u.tenant_id=t.id AND u.is_active=true) AS active_users
        FROM tenants t
        LEFT JOIN LATERAL (SELECT * FROM tenant_subscriptions WHERE tenant_id=t.id ORDER BY created_at DESC LIMIT 1) s ON TRUE
        ORDER BY t.created_at DESC
      `);
      return res.json({ items: result.rows });
    } catch (error) { return next(error); }
  });

  app.post('/api/owner/tenants/:tenantId/suspend', requireOwner, async (req, res, next) => {
    if (!UUID_RE.test(req.params.tenantId)) return res.status(400).json({ error: 'invalid_tenant_id' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const update = await client.query("UPDATE tenants SET status='suspended', updated_at=now() WHERE id=$1 RETURNING id", [req.params.tenantId]);
      if (!update.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'tenant_not_found' }); }
      await client.query("UPDATE tenant_subscriptions SET status='suspended' WHERE tenant_id=$1 AND status='active'", [req.params.tenantId]);
      await client.query(`INSERT INTO license_audit_events(tenant_id, action, actor, details) VALUES($1,'tenant_suspended',$2,'{}'::jsonb)`, [req.params.tenantId, req.owner.sub]);
      await client.query('COMMIT');
      return res.json({ ok: true, tenant_id: req.params.tenantId, status: 'suspended' });
    } catch (error) { await client.query('ROLLBACK'); return next(error); }
    finally { client.release(); }
  });

  app.post('/api/owner/tenants/:tenantId/user-limit', requireOwner, async (req, res, next) => {
    if (!UUID_RE.test(req.params.tenantId)) return res.status(400).json({ error: 'invalid_tenant_id' });
    const limit = req.body?.userLimit;
    if (!(limit === 'unlimited' || (Number.isInteger(limit) && limit >= 1))) return res.status(400).json({ error: 'invalid_user_limit' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        UPDATE tenant_subscriptions
        SET user_limit=$2, user_limit_unlimited=$3
        WHERE id=(SELECT id FROM tenant_subscriptions WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1)
        RETURNING tenant_id, user_limit, user_limit_unlimited
      `, [req.params.tenantId, limit === 'unlimited' ? null : limit, limit === 'unlimited']);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'subscription_not_found' });
      }
      await client.query(`INSERT INTO license_audit_events(tenant_id,action,actor,details) VALUES($1,'user_limit_changed',$2,$3::jsonb)`, [req.params.tenantId, req.owner.sub, JSON.stringify({ userLimit: limit })]);
      await client.query('COMMIT');
      return res.json({ plan: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      return next(error);
    } finally { client.release(); }
  });

  app.post('/api/owner/tenants/:tenantId/extend', requireOwner, async (req, res, next) => {
    if (!UUID_RE.test(req.params.tenantId)) return res.status(400).json({ error: 'invalid_tenant_id' });
    const duration = String(req.body?.duration || '');
    const monthMode = req.body?.monthMode ?? null;
    if (!DURATIONS.has(duration)) return res.status(400).json({ error: 'invalid_duration' });
    if (duration.startsWith('month_') && !['calendar', '30_days'].includes(monthMode)) return res.status(400).json({ error: 'month_mode_required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(`SELECT ends_at FROM tenant_subscriptions WHERE tenant_id=$1 AND status IN ('active','expired','suspended') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [req.params.tenantId]);
      const tenant = await client.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', [req.params.tenantId]);
      if (!tenant.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'tenant_not_found' }); }
      const now = new Date();
      const prevEnd = current.rows[0]?.ends_at ? new Date(current.rows[0].ends_at) : null;
      const startsAt = prevEnd && prevEnd > now ? prevEnd : now;
      const endsAt = calculateSubscriptionEnd(startsAt, duration, monthMode);
      await client.query(`UPDATE tenant_subscriptions SET status='renewed' WHERE tenant_id=$1 AND status IN ('active','expired','suspended')`, [req.params.tenantId]);
      const inserted = await client.query(`
        INSERT INTO tenant_subscriptions(tenant_id,duration_code,month_mode,starts_at,ends_at,status,user_limit,user_limit_unlimited,created_by)
        SELECT $1,$2,$3,$4,$5,'active',user_limit,user_limit_unlimited,$6 FROM tenant_subscriptions WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1
        RETURNING id, duration_code, starts_at, ends_at, status
      `, [req.params.tenantId, duration, monthMode, startsAt, endsAt, req.owner.sub]);
      if (!inserted.rowCount) throw new Error('subscription_missing');
      await client.query("UPDATE tenants SET status='active', updated_at=now() WHERE id=$1", [req.params.tenantId]);
      await client.query(`INSERT INTO license_audit_events(tenant_id, action, actor, details) VALUES($1,'subscription_extended',$2,$3::jsonb)`, [req.params.tenantId, req.owner.sub, JSON.stringify({ duration, monthMode })]);
      await client.query('COMMIT');
      return res.json({ ok: true, subscription: inserted.rows[0] });
    } catch (error) { await client.query('ROLLBACK'); return next(error); }
    finally { client.release(); }
  });

  app.post('/api/license/activate', async (req, res, next) => {
    const code = normalizeCode(req.body?.code || req.body?.key || '');
    const tenantName = String(req.body?.tenantName || '').trim();
    const adminUsername = String(req.body?.adminUsername || '').trim();
    const adminPassword = String(req.body?.adminPassword || '');
    if (code.length < 20 || tenantName.length < 2 || adminUsername.length < 3 || adminUsername.length > 64 || adminPassword.length < 10 || adminPassword.length > 256) {
      return res.status(400).json({ error: 'invalid_activation_details' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query('SELECT * FROM activation_codes WHERE code_hash=$1 FOR UPDATE', [sha256(code)]);
      const license = found.rows[0];
      if (!license || license.status !== 'unused') {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'invalid_or_used_code' });
      }
      const startsAt = new Date();
      const endsAt = calculateSubscriptionEnd(startsAt, license.duration_code, license.month_mode);
      const tenantId = randomUUID();
      const tenantSlug = makeSlug();
      const userId = randomUUID();
      const passwordHash = await hashPassword(adminPassword);
      await client.query(`INSERT INTO tenants(id,slug,display_name,status) VALUES($1,$2,$3,'active')`, [tenantId, tenantSlug, tenantName]);
      await client.query(`INSERT INTO tenant_subscriptions(tenant_id,duration_code,month_mode,starts_at,ends_at,status,user_limit,user_limit_unlimited,created_by)
        VALUES($1,$2,$3,$4,$5,'active',$6,$7,'activation-code')`, [tenantId, license.duration_code, license.month_mode, startsAt, endsAt, license.user_limit, license.user_limit_unlimited]);
      await client.query(`INSERT INTO tenant_users(id,tenant_id,username,password_hash,role,is_active)
        VALUES($1,$2,$3,$4,'admin',true)`, [userId, tenantId, adminUsername, passwordHash]);
      await client.query(`UPDATE activation_codes SET status='activated', tenant_id=$2, activated_at=now() WHERE id=$1`, [license.id, tenantId]);
      await client.query(`INSERT INTO license_audit_events(tenant_id, action, actor, details) VALUES($1,'license_activated','activation-code',$2::jsonb)`, [tenantId, JSON.stringify({ duration: license.duration_code })]);
      await client.query('COMMIT');
      const token = signToken({ type: 'tenant', sub: userId, userId, tenantId, username: adminUsername, role: 'admin' }, env.JWT_SECRET);
      res.set('Cache-Control', 'no-store');
      return res.status(201).json({
        ok: true, token, token_type: 'Bearer', expires_in: 28800,
        tenant: { id: tenantId, slug: tenantSlug, name: tenantName },
        subscription: { duration: license.duration_code, starts_at: startsAt, ends_at: endsAt, status: 'active' },
        warning: 'احتفظ باسم المنشأة واسم المستخدم. لا يمكن استرجاع كود التفعيل بعد استخدامه.'
      });
    } catch (error) { await client.query('ROLLBACK'); return next(error); }
    finally { client.release(); }
  });

  app.get('/api/license/status', async (req, res, next) => {
    const payload = verifyToken(readBearer(req), env.JWT_SECRET);
    if (!payload || payload.type !== 'tenant') return res.json({ is_licensed: false, status: 'not_authenticated' });
    try {
      const result = await pool.query(`
        SELECT t.status AS tenant_status, s.status AS subscription_status, s.duration_code, s.starts_at, s.ends_at
        FROM tenants t LEFT JOIN LATERAL (
          SELECT status,duration_code,starts_at,ends_at FROM tenant_subscriptions
          WHERE tenant_id=t.id ORDER BY created_at DESC LIMIT 1
        ) s ON TRUE WHERE t.id=$1
      `, [payload.tenantId]);
      const row = result.rows[0];
      const active = Boolean(row && row.tenant_status === 'active' && row.subscription_status === 'active' && (!row.starts_at || new Date(row.starts_at).getTime() <= Date.now()) && (!row.ends_at || new Date(row.ends_at).getTime() > Date.now()));
      return res.json({ is_licensed: active, status: active ? 'active' : 'inactive', subscription: row || null });
    } catch (error) { return next(error); }
  });

  app.get('/api/stores/:store', requireTenant, async (req, res, next) => {
    const { store } = req.params;
    if (!STORE_NAMES.has(store)) return res.status(400).json({ error: 'unknown_store' });
    if (!roleCanRead(req.tenant.role, store)) return res.status(403).json({ error: 'forbidden' });
    try {
      const result = await pool.query(`
        SELECT record_uuid, record_data, revision, updated_at, deleted_at
        FROM app_records WHERE tenant_id=$1 AND store_name=$2 ORDER BY updated_at, record_uuid
      `, [req.tenant.id, store]);
      return res.json({ items: result.rows });
    } catch (error) { return next(error); }
  });

  // Permanently clear only the authenticated tenant's application records.
  // The tenant, users, subscription, activation history and audit trail are deliberately preserved.
  app.post('/api/admin/data/clear', requireTenant, requireRoles('admin'), async (req, res, next) => {
    if (!rateLimitLogin(req, res)) return;
    const password = String(req.body?.password || '');
    if (!password || password.length > 256) return res.status(400).json({ error: 'password_required' });

    try {
      const adminResult = await pool.query(`
        SELECT password_hash FROM tenant_users
        WHERE id=$1 AND tenant_id=$2 AND role='admin' AND is_active=true
      `, [req.tenant.userId, req.tenant.id]);
      if (!adminResult.rowCount || !(await verifyPassword(password, adminResult.rows[0].password_hash))) {
        return res.status(401).json({ error: 'invalid_password' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Serialize with sync batches for this tenant so a concurrent sync cannot recreate rows mid-clear.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [req.tenant.id]);
        const records = await client.query('DELETE FROM app_records WHERE tenant_id=$1', [req.tenant.id]);
        const operations = await client.query('DELETE FROM sync_operations WHERE tenant_id=$1', [req.tenant.id]);
        await client.query(`
          INSERT INTO license_audit_events(tenant_id, action, actor, details)
          VALUES($1, 'tenant_application_data_cleared', $2, $3::jsonb)
        `, [req.tenant.id, req.tenant.username, JSON.stringify({
          deletedRecords: records.rowCount,
          deletedSyncOperations: operations.rowCount,
          actorUserId: req.tenant.userId
        })]);
        await client.query('COMMIT');
        loginAttempts.delete(req.ip || req.socket.remoteAddress || 'unknown');
        return res.json({
          ok: true,
          deleted: { records: records.rowCount, syncOperations: operations.rowCount },
          preserved: ['tenant', 'tenant_users', 'tenant_subscriptions', 'license_audit_events']
        });
      } catch (error) {
        await client.query('ROLLBACK');
        return next(error);
      } finally {
        client.release();
      }
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/sync/batch', requireTenant, async (req, res, next) => {
    const operations = req.body?.operations;
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 500) return res.status(400).json({ error: 'invalid_batch' });
    for (const op of operations) {
      if (!op || !UUID_RE.test(op.operation_uuid || '') || !UUID_RE.test(op.record_uuid || '') || !STORE_NAMES.has(op.store_name) || !['put', 'delete'].includes(op.action)) {
        return res.status(400).json({ error: 'invalid_operation' });
      }
      if (!roleCanWrite(req.tenant.role, op.store_name)) return res.status(403).json({ error: 'forbidden' });
      if (op.action === 'put' && (!op.record_data || typeof op.record_data !== 'object' || Array.isArray(op.record_data))) return res.status(400).json({ error: 'invalid_record_data' });
      if (!Number.isInteger(op.base_revision) || op.base_revision < 0) return res.status(400).json({ error: 'base_revision_required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Use the same tenant-scoped lock as the destructive clear endpoint.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))', [req.tenant.id]);
      let applied = 0;
      let skipped = 0;
      const conflicts = [];
      for (const op of operations) {
        const seen = await client.query('SELECT tenant_id FROM sync_operations WHERE operation_uuid=$1', [op.operation_uuid]);
        if (seen.rowCount) {
          if (seen.rows[0].tenant_id !== req.tenant.id) throw new Error('idempotency_collision');
          skipped++;
          continue;
        }
        const current = await client.query(`
          SELECT revision FROM app_records WHERE tenant_id=$1 AND record_uuid=$2 AND store_name=$3 FOR UPDATE
        `, [req.tenant.id, op.record_uuid, op.store_name]);
        const currentRevision = current.rows[0]?.revision ?? 0;
        if (op.base_revision !== undefined && op.base_revision !== currentRevision) {
          conflicts.push({ operation_uuid: op.operation_uuid, record_uuid: op.record_uuid, store_name: op.store_name, server_revision: currentRevision, client_base_revision: op.base_revision });
          continue;
        }
        await client.query('INSERT INTO sync_operations(operation_uuid,tenant_id) VALUES($1,$2)', [op.operation_uuid, req.tenant.id]);
        if (op.action === 'delete') {
          if (current.rowCount) {
            await client.query(`UPDATE app_records SET deleted_at=now(), updated_at=now(), revision=revision+1 WHERE tenant_id=$1 AND record_uuid=$2 AND store_name=$3`, [req.tenant.id, op.record_uuid, op.store_name]);
          }
        } else if (current.rowCount) {
          await client.query(`UPDATE app_records SET record_data=$4::jsonb, updated_at=now(), revision=revision+1, deleted_at=NULL WHERE tenant_id=$1 AND record_uuid=$2 AND store_name=$3`, [req.tenant.id, op.record_uuid, op.store_name, JSON.stringify(op.record_data)]);
        } else {
          await client.query(`INSERT INTO app_records(record_uuid,tenant_id,store_name,record_data) VALUES($1,$2,$3,$4::jsonb)`, [op.record_uuid, req.tenant.id, op.store_name, JSON.stringify(op.record_data)]);
        }
        applied++;
      }
      if (conflicts.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'sync_conflict', conflicts, applied: 0, skipped: 0, retry_required: true });
      }
      await client.query('COMMIT');
      return res.json({ ok: true, applied, skipped });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.message === 'idempotency_collision') return res.status(409).json({ error: 'idempotency_collision' });
      return next(error);
    } finally { client.release(); }
  });

  app.get('/api/users', requireTenant, requireRoles('admin'), async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT id, username, role, is_active, created_at FROM tenant_users WHERE tenant_id=$1 ORDER BY created_at`, [req.tenant.id]);
      return res.json({ items: result.rows });
    } catch (error) { return next(error); }
  });

  app.post('/api/users', requireTenant, requireRoles('admin'), async (req, res, next) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');
    const role = String(req.body?.role || '');
    if (username.length < 3 || username.length > 64 || password.length < 10 || password.length > 256 || !ROLES.has(role)) return res.status(400).json({ error: 'invalid_user_data' });
    if (role === 'admin' && req.body?.allowAdmin !== true) return res.status(400).json({ error: 'explicit_admin_role_required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize employee additions for this tenant so two simultaneous requests
      // cannot exceed the subscription's configured user limit.
      const subscription = await client.query(`
        SELECT id, user_limit, user_limit_unlimited
        FROM tenant_subscriptions
        WHERE tenant_id=$1 AND status='active'
        ORDER BY created_at DESC LIMIT 1 FOR UPDATE
      `, [req.tenant.id]);
      const sub = subscription.rows[0];
      if (!sub || (!sub.user_limit_unlimited && (!Number.isInteger(sub.user_limit) || sub.user_limit < 1))) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'user_limit_not_configured' });
      }
      const count = await client.query(`SELECT COUNT(*)::int AS total FROM tenant_users WHERE tenant_id=$1 AND is_active=true`, [req.tenant.id]);
      if (!sub.user_limit_unlimited && count.rows[0].total >= sub.user_limit) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'user_limit_reached', user_limit: sub.user_limit });
      }
      const passwordHash = await hashPassword(password);
      const created = await client.query(`INSERT INTO tenant_users(tenant_id,username,password_hash,role,is_active)
        VALUES($1,$2,$3,$4,true) RETURNING id,username,role,is_active,created_at`, [req.tenant.id, username, passwordHash, role]);
      await client.query('COMMIT');
      return res.status(201).json({ user: created.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      if (error.code === '23505') return res.status(409).json({ error: 'username_already_exists' });
      return next(error);
    } finally { client.release(); }
  });

  app.patch('/api/users/:userId', requireTenant, requireRoles('admin'), async (req, res, next) => {
    if (!UUID_RE.test(req.params.userId)) return res.status(400).json({ error: 'invalid_user_id' });
    const { isActive, role } = req.body || {};
    if (isActive === undefined && role === undefined) return res.status(400).json({ error: 'no_changes' });
    if (role !== undefined && !ROLES.has(role)) return res.status(400).json({ error: 'invalid_role' });
    if (req.params.userId === req.tenant.userId && isActive === false) return res.status(400).json({ error: 'cannot_disable_current_admin' });
    if (req.params.userId === req.tenant.userId && role !== undefined && role !== 'admin') return res.status(400).json({ error: 'cannot_demote_current_admin' });
    try {
      const result = await pool.query(`
        UPDATE tenant_users SET is_active=COALESCE($3,is_active), role=COALESCE($4,role)
        WHERE id=$1 AND tenant_id=$2 RETURNING id,username,role,is_active,created_at
      `, [req.params.userId, req.tenant.id, typeof isActive === 'boolean' ? isActive : null, role ?? null]);
      if (!result.rowCount) return res.status(404).json({ error: 'user_not_found' });
      return res.json({ user: result.rows[0] });
    } catch (error) { return next(error); }
  });

  // This is deliberately explicit: old local/cloud records are never assigned to a tenant automatically.
  app.post('/api/owner/tenants/:tenantId/adopt-legacy-records', requireOwner, async (req, res, next) => {
    if (!UUID_RE.test(req.params.tenantId) || req.body?.confirm !== 'ASSIGN_NULL_TENANT_RECORDS') return res.status(400).json({ error: 'explicit_confirmation_required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const exists = await client.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', [req.params.tenantId]);
      if (!exists.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'tenant_not_found' }); }
      const records = await client.query('UPDATE app_records SET tenant_id=$1 WHERE tenant_id IS NULL', [req.params.tenantId]);
      const operations = await client.query('UPDATE sync_operations SET tenant_id=$1 WHERE tenant_id IS NULL', [req.params.tenantId]);
      await client.query(`INSERT INTO license_audit_events(tenant_id,action,actor,details) VALUES($1,'legacy_records_adopted',$2,$3::jsonb)`, [req.params.tenantId, req.owner.sub, JSON.stringify({ records: records.rowCount, operations: operations.rowCount })]);
      await client.query('COMMIT');
      return res.json({ ok: true, adopted_records: records.rowCount, adopted_operations: operations.rowCount });
    } catch (error) { await client.query('ROLLBACK'); return next(error); }
    finally { client.release(); }
  });

  app.use((error, _req, res, _next) => {
    if (error.message === 'origin_not_allowed') return res.status(403).json({ error: 'origin_not_allowed' });
    if (error.code === '42P01' || error.code === '42703') return res.status(503).json({ error: 'subscription_schema_not_migrated' });
    // Log the error server-side without echoing SQL, credentials or stack details to clients.
    console.error('Bakry ERP API error:', error.message || 'unknown_error');
    return res.status(500).json({ error: 'internal_error' });
  });

  return app;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const required = ['DATABASE_URL', 'ADMIN_USERNAME', 'ADMIN_PASSWORD', 'JWT_SECRET'];
  required.push('APP_ORIGIN');
  for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: process.env.PGSSL_REJECT_UNAUTHORIZED !== 'false' },
    max: Number(process.env.PG_POOL_MAX || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  const app = createApp({ pool });
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log(`Bakry ERP API listening on ${port}`));
}
