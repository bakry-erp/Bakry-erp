import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

const { Pool } = pg;
const app = express();
const allowedStores = new Set(['customers','guarantors','suppliers','products','units','sales','installments','transactions','supplier_dues','audit_logs','branches','defaults','traffic','notifications','collection_notes']);
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true }, max: 5 });
app.use(helmet());
app.use(cors({ origin: process.env.APP_ORIGIN?.split(',').map(x=>x.trim()) || false }));
app.use(express.json({ limit: '5mb' }));
app.get('/api/health', async (_req,res) => {
  try { const q = await pool.query('SELECT current_database() AS database, version() AS version'); res.json({ok:true,...q.rows[0]}); }
  catch { res.status(503).json({ok:false,error:'database_unavailable'}); }
});
app.get('/api/stores/:store', async (req,res) => {
  const { store } = req.params; if (!allowedStores.has(store)) return res.status(400).json({error:'unknown_store'});
  try { const q=await pool.query('SELECT record_uuid, record_data, revision, updated_at FROM app_records WHERE store_name=$1 AND deleted_at IS NULL ORDER BY created_at', [store]); res.json({items:q.rows}); }
  catch { res.status(503).json({error:'database_unavailable'}); }
});
// Idempotent batch endpoint: repeated operation_uuid values are ignored safely.
app.post('/api/sync/batch', async (req,res) => {
  const ops=req.body?.operations;
  if (!Array.isArray(ops) || ops.length>500) return res.status(400).json({error:'invalid_batch'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN'); let applied=0, skipped=0;
    for (const op of ops) {
      if (!op || !op.operation_uuid || !op.record_uuid || !allowedStores.has(op.store_name) || !['put','delete'].includes(op.action)) throw new Error('invalid_operation');
      const marker=await client.query('INSERT INTO sync_operations(operation_uuid) VALUES($1) ON CONFLICT DO NOTHING RETURNING operation_uuid',[op.operation_uuid]);
      if (!marker.rowCount) { skipped++; continue; }
      if (op.action==='delete') {
        await client.query('UPDATE app_records SET deleted_at=now(), updated_at=now(), revision=revision+1 WHERE record_uuid=$1 AND store_name=$2',[op.record_uuid,op.store_name]);
      } else {
        if (typeof op.record_data!=='object' || op.record_data===null || Array.isArray(op.record_data)) throw new Error('invalid_record_data');
        await client.query(`INSERT INTO app_records(record_uuid,store_name,record_data) VALUES($1,$2,$3::jsonb)
          ON CONFLICT(record_uuid) DO UPDATE SET record_data=EXCLUDED.record_data, updated_at=now(), revision=app_records.revision+1, deleted_at=NULL
          WHERE app_records.store_name=EXCLUDED.store_name`,[op.record_uuid,op.store_name,JSON.stringify(op.record_data)]);
      }
      applied++;
    }
    await client.query('COMMIT'); res.json({ok:true,applied,skipped});
  } catch(e) { await client.query('ROLLBACK'); res.status(400).json({error:e.message==='invalid_operation'||e.message==='invalid_record_data'?'invalid_operation':'sync_failed'}); }
  finally { client.release(); }
});
const port=Number(process.env.PORT||3000); app.listen(port,()=>console.log(`Bakry ERP API listening on ${port}`));
