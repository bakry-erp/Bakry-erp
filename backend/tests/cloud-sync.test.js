import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

function createHarness({ rows = {}, outbox = [], remote = {} } = {}) {
  const stores = new Map(Object.entries(rows).map(([name, values]) => [name, values.map(row => ({ ...row }))]));
  const queue = new Map(outbox.map(op => [op.operation_uuid, { ...op }]));
  const meta = new Map();
  const remoteStores = new Map(Object.entries(remote).map(([name, values]) => [name, values.map(item => structuredClone(item))]));
  const MotoDB = {
    async ensureReady() { return true; },
    async getAll(name) { return (stores.get(name) || []).map(row => ({ ...row })); },
    async getById(name, id) { return (stores.get(name) || []).find(row => Number(row.id) === Number(id)) || null; },
    async getMeta(key) { return meta.get(key) ?? null; },
    async putMeta(key, value) { meta.set(key, value); },
    async getOutbox() { return [...queue.values()].map(op => ({ ...op })); },
    async putOutbox(op) { queue.set(op.operation_uuid, { ...op }); },
    async deleteOutbox(id) { queue.delete(id); },
    async rawPut(name, item) {
      const list = stores.get(name) || [];
      const index = list.findIndex(row => Number(row.id) === Number(item.id));
      if (index >= 0) list[index] = { ...item }; else list.push({ ...item });
      stores.set(name, list);
      return item.id;
    },
    async rawDelete(name, id) { stores.set(name, (stores.get(name) || []).filter(row => Number(row.id) !== Number(id))); }
  };
  const window = { __bakryPendingCount: 0, addEventListener() {} };
  const context = {
    window, MotoDB, navigator: { onLine: true }, document: { getElementById() { return null; } },
    crypto: webcrypto, URL, Date, Set, Map, Promise, Error, Math, JSON, structuredClone,
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    BakryDialogs: { async confirm() { return false; } },
    fetch: async (url, options = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname.startsWith('/api/stores/')) {
        const name = decodeURIComponent(pathname.split('/').pop());
        return { ok: true, async json() { return { items: (remoteStores.get(name) || []).map(item => structuredClone(item)) }; } };
      }
      if (pathname === '/api/sync/batch' && options.method === 'POST') {
        const body = JSON.parse(options.body || '{}');
        for (const op of body.operations || []) {
          const list = remoteStores.get(op.store_name) || [];
          const existingIndex = list.findIndex(item => item.record_uuid === op.record_uuid);
          const currentRevision = existingIndex >= 0 ? Number(list[existingIndex].revision) || 0 : 0;
          if (op.base_revision !== currentRevision) {
            return { ok: false, status: 409, async json() { return { error: 'sync_conflict' }; } };
          }
          const next = {
            record_uuid: op.record_uuid,
            record_data: op.action === 'put' ? structuredClone(op.record_data) : (existingIndex >= 0 ? list[existingIndex].record_data : {}),
            revision: currentRevision + 1,
            deleted_at: op.action === 'delete' ? new Date().toISOString() : null
          };
          if (existingIndex >= 0) list[existingIndex] = next; else list.push(next);
          remoteStores.set(op.store_name, list);
        }
        return { ok: true, async json() { return { ok: true }; } };
      }
      throw new Error(`unexpected fetch ${pathname}`);
    }
  };
  vm.runInNewContext(fs.readFileSync(new URL('../../js/cloud-sync.js', import.meta.url), 'utf8'), context, { filename: 'cloud-sync.js' });
  return { CloudSync: window.CloudSync, MotoDB, stores, queue, meta, remoteStores, context };
}

test('server URL normalization avoids double slashes at the API root', async () => {
  const h = createHarness();
  assert.equal(h.CloudSync.normalizeBase('https://bakry-erp.onrender.com/'), 'https://bakry-erp.onrender.com');
  assert.equal(h.CloudSync.normalizeBase('https://bakry-erp.onrender.com/api/'), 'https://bakry-erp.onrender.com');
});

test('an edit made while a row operation is in flight advances to the next server revision', async () => {
  const sending = { operation_uuid: 'sending-op', record_uuid: 'record-1', store_name: 'sales', action: 'put', base_revision: 3, created_at: '2026-01-01T00:00:00.000Z' };
  const h = createHarness({ outbox: [sending] });
  h.CloudSync.configure({ apiBase: 'https://example.test', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  h.CloudSync.inFlight.add('sending-op');
  await h.CloudSync.enqueue('sales', 'put', { id: 99, _cloudUuid: 'record-1', _cloudRevision: 3, salePrice: 200 });
  const queued = [...h.queue.values()].find(op => op.operation_uuid !== 'sending-op');
  assert.equal(queued.base_revision, 4);
  assert.equal(queued.record_data.salePrice, 200);
});

test('unsent edits coalesce without losing their original base revision', async () => {
  const existing = { operation_uuid: 'pending-op', record_uuid: 'record-2', store_name: 'sales', action: 'put', base_revision: 2, created_at: '2026-01-01T00:00:00.000Z', record_data: { id: 2, salePrice: 10 } };
  const h = createHarness({ outbox: [existing] });
  h.CloudSync.configure({ apiBase: 'https://example.test', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  await h.CloudSync.enqueue('sales', 'put', { id: 2, _cloudUuid: 'record-2', _cloudRevision: 2, salePrice: 25 });
  assert.equal(h.queue.size, 1);
  assert.equal(h.queue.get('pending-op').base_revision, 2);
  assert.equal(h.queue.get('pending-op').record_data.salePrice, 25);
});

test('local-mode edits are kept in the outbox even while cloud mode is inactive', async () => {
  const h = createHarness();
  assert.equal(h.CloudSync.isActive(), false);
  await h.CloudSync.enqueue('sales', 'put', { id: 74, _cloudUuid: 'offline-record', _cloudRevision: 0, salePrice: 12500 });
  assert.equal(h.queue.size, 1);
  assert.equal(h.queue.get([...h.queue.keys()][0]).record_data.salePrice, 12500);
});

test('switching from local to cloud automatically uploads legacy local records', async () => {
  const h = createHarness({ rows: { customers: [{ id: 7, name: 'عميل محلي', phone: '01000000000' }] } });
  h.CloudSync.configure({ apiBase: 'https://example.test', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  await h.CloudSync.bootstrap();
  const remote = h.remoteStores.get('customers') || [];
  assert.equal(remote.length, 1);
  assert.equal(remote[0].record_data.name, 'عميل محلي');
  assert.equal((await h.MotoDB.getOutbox()).length, 0);
  const local = await h.MotoDB.getById('customers', 7);
  assert.ok(local._cloudUuid);
  assert.equal(local._cloudRevision, 1);
  assert.equal(await h.MotoDB.getMeta('cloud_initialized'), true);
});

test('a local-mode edit to a previously synced row is uploaded before the cloud snapshot is applied', async () => {
  const remoteItem = { record_uuid: 'shared-sales-row', record_data: { id: 21, salePrice: 5000, notes: 'قبل التعديل' }, revision: 3, deleted_at: null };
  const h = createHarness({
    rows: { sales: [{ id: 21, _cloudUuid: 'shared-sales-row', _cloudRevision: 3, salePrice: 5000, notes: 'تعديل محلي غير مرفوع' }] },
    remote: { sales: [remoteItem] }
  });
  h.CloudSync.configure({ apiBase: 'https://example.test', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  await h.CloudSync.bootstrap();
  const updated = (h.remoteStores.get('sales') || []).find(item => item.record_uuid === 'shared-sales-row');
  assert.equal(updated.record_data.notes, 'تعديل محلي غير مرفوع');
  assert.equal(updated.revision, 4);
  assert.equal((await h.MotoDB.getById('sales', 21))._cloudRevision, 4);
});

test('a legacy local delete is translated to the matching cloud record before upload', async () => {
  const deletedSnapshot = { id: 31, name: 'عميل سيتم حذفه', phone: '01011111111' };
  const remoteItem = { record_uuid: 'remote-customer-31', record_data: deletedSnapshot, revision: 2, deleted_at: null };
  const h = createHarness({
    outbox: [{ operation_uuid: 'local-delete-op', record_uuid: 'local-temp-uuid', store_name: 'customers', action: 'delete', base_revision: 0, record_id: 31, record_snapshot: deletedSnapshot, created_at: '2026-11-28T00:00:00.000Z' }],
    remote: { customers: [remoteItem] }
  });
  h.CloudSync.configure({ apiBase: 'https://example.test', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  await h.CloudSync.bootstrap();
  const tombstone = (h.remoteStores.get('customers') || []).find(item => item.record_uuid === 'remote-customer-31');
  assert.ok(tombstone.deleted_at);
  assert.equal((await h.MotoDB.getOutbox()).length, 0);
});

test('legacy ID collision is rejected before changing or queuing local rows', async () => {
  const remoteItem = { record_uuid: 'remote-customer', record_data: { id: 7, name: 'عميل سحابي مختلف' }, revision: 1, deleted_at: null };
  const h = createHarness({
    rows: { customers: [{ id: 7, name: 'عميل محلي مختلف' }] },
    remote: { customers: [remoteItem] }
  });
  h.CloudSync.configure({ apiBase: 'https://example.test', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  await assert.rejects(() => h.CloudSync.bootstrap(), /تعارض/);
  const local = await h.MotoDB.getById('customers', 7);
  assert.equal(local._cloudUuid, undefined);
  assert.equal((await h.MotoDB.getOutbox()).length, 0);
});

test('an unexpectedly empty server table never deletes confirmed local records', async () => {
  const h = createHarness({ rows: { sales: [{ id: 12, _cloudUuid: 'record-12', _cloudRevision: 4, salePrice: 45000 }] } });
  h.CloudSync.configure({ apiBase: 'https://example.test', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  await assert.rejects(() => h.CloudSync.applyRemote({ sales: [] }), /حماية البيانات/);
  assert.equal((await h.stores.get('sales'))[0].salePrice, 45000);
});

test('an unsent local record missing from the server is re-queued instead of discarded', async () => {
  const h = createHarness({ rows: { sales: [{ id: 77, _cloudUuid: 'new-record', _cloudRevision: 0, salePrice: 900 }] } });
  h.CloudSync.configure({ apiBase: 'https://example.test', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  await h.CloudSync.applyRemote({ sales: [] });
  const recovered = [...h.queue.values()].find(op => op.record_uuid === 'new-record');
  assert.ok(recovered);
  assert.equal(recovered.action, 'put');
  assert.equal(recovered.base_revision, 0);
  assert.equal((await h.stores.get('sales'))[0].id, 77);
});
