import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

function createHarness({ rows = {}, outbox = [] } = {}) {
  const stores = new Map(Object.entries(rows).map(([name, values]) => [name, values.map(row => ({ ...row }))]));
  const queue = new Map(outbox.map(op => [op.operation_uuid, { ...op }]));
  const MotoDB = {
    async getAll(name) { return (stores.get(name) || []).map(row => ({ ...row })); },
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
    async rawDelete(name, id) {
      stores.set(name, (stores.get(name) || []).filter(row => Number(row.id) !== Number(id)));
    }
  };
  const window = { __bakryPendingCount: 0, addEventListener() {} };
  const context = {
    window, MotoDB, navigator: { onLine: true }, document: { getElementById() { return null; } },
    crypto: webcrypto, URL, Date, Set, Map, Promise, Error, Math, JSON,
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    BakryDialogs: { async confirm() { return false; } }, fetch: async () => { throw new Error('unexpected fetch'); }
  };
  vm.runInNewContext(fs.readFileSync(new URL('../../js/cloud-sync.js', import.meta.url), 'utf8'), context, { filename: 'cloud-sync.js' });
  return { CloudSync: window.CloudSync, stores, queue };
}

test('an edit made while a row operation is in flight advances to the next server revision', async () => {
  const sending = { operation_uuid: 'sending-op', record_uuid: 'record-1', store_name: 'sales', action: 'put', base_revision: 3, created_at: '2026-01-01T00:00:00.000Z' };
  const h = createHarness({ outbox: [sending] });
  h.CloudSync.configure({ apiBase: 'https://api.example.com', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  h.CloudSync.inFlight.add('sending-op');
  await h.CloudSync.enqueue('sales', 'put', { id: 99, _cloudUuid: 'record-1', _cloudRevision: 3, salePrice: 200 });
  const queued = [...h.queue.values()].find(op => op.operation_uuid !== 'sending-op');
  assert.equal(queued.base_revision, 4);
  assert.equal(queued.record_data.salePrice, 200);
});

test('unsent edits coalesce without losing their original base revision', async () => {
  const existing = { operation_uuid: 'pending-op', record_uuid: 'record-2', store_name: 'sales', action: 'put', base_revision: 2, created_at: '2026-01-01T00:00:00.000Z', record_data: { id: 2, salePrice: 10 } };
  const h = createHarness({ outbox: [existing] });
  h.CloudSync.configure({ apiBase: 'https://api.example.com', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  await h.CloudSync.enqueue('sales', 'put', { id: 2, _cloudUuid: 'record-2', _cloudRevision: 2, salePrice: 25 });
  assert.equal(h.queue.size, 1);
  assert.equal(h.queue.get('pending-op').base_revision, 2);
  assert.equal(h.queue.get('pending-op').record_data.salePrice, 25);
});

test('an unexpectedly empty server table never deletes confirmed local records', async () => {
  const h = createHarness({ rows: { sales: [{ id: 12, _cloudUuid: 'record-12', _cloudRevision: 4, salePrice: 45000 }] } });
  h.CloudSync.configure({ apiBase: 'https://api.example.com', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  await assert.rejects(() => h.CloudSync.applyRemote({ sales: [] }), /حماية البيانات/);
  assert.equal((await h.stores.get('sales'))[0].salePrice, 45000);
});

test('an unsent local record missing from the server is re-queued instead of discarded', async () => {
  const h = createHarness({ rows: { sales: [{ id: 77, _cloudUuid: 'new-record', _cloudRevision: 0, salePrice: 900 }] } });
  h.CloudSync.configure({ apiBase: 'https://api.example.com', token: 't', user: { role: 'admin' }, tenant: { id: 'tenant-1' } });
  await h.CloudSync.applyRemote({ sales: [] });
  const recovered = [...h.queue.values()].find(op => op.record_uuid === 'new-record');
  assert.ok(recovered);
  assert.equal(recovered.action, 'put');
  assert.equal(recovered.base_revision, 0);
  assert.equal((await h.stores.get('sales'))[0].id, 77);
});
