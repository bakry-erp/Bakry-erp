import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../../js/db.js', import.meta.url), 'utf8');

function createFakeDatabase() {
  const stores = new Set();
  return {
    objectStoreNames: { contains(name) { return stores.has(name); } },
    createObjectStore(name) { stores.add(name); return {}; },
    transaction() { return { objectStore() { return {}; } }; },
    close() { this.closed = true; }
  };
}

function loadMotoDB(open, { fastBlockedTimeout = false } = {}) {
  const window = { indexedDB: { open }, BroadcastChannel: undefined };
  const context = {
    window,
    console,
    setTimeout: (callback, ms) => setTimeout(callback, fastBlockedTimeout && ms === 6000 ? 0 : ms),
    clearTimeout,
    Uint32Array,
    Uint8Array,
    crypto: { getRandomValues(value) { return value; }, randomUUID() { return 'test-uuid'; } }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'db.js' });
  return vm.runInContext('MotoDB', context);
}

test('local database initialization creates missing stores and shares one in-flight open', async () => {
  let opens = 0;
  const fakeDb = createFakeDatabase();
  const MotoDB = loadMotoDB((_name, _version) => {
    opens += 1;
    const request = { result: fakeDb, error: null };
    queueMicrotask(() => {
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  });

  const [first, second] = await Promise.all([MotoDB.init(), MotoDB.init()]);
  assert.equal(first, true);
  assert.equal(second, true);
  assert.equal(opens, 1);
  assert.equal(MotoDB.db, fakeDb);
  assert.equal(fakeDb.objectStoreNames.contains('cloud_outbox'), true);
  assert.equal(fakeDb.objectStoreNames.contains('sales'), true);
});

test('a blocked database open clears the failed promise so the user can retry', async () => {
  let opens = 0;
  const fakeDb = createFakeDatabase();
  const MotoDB = loadMotoDB((_name, _version) => {
    opens += 1;
    const request = { result: fakeDb, error: null };
    queueMicrotask(() => {
      if (opens === 1) request.onblocked?.();
      else {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      }
    });
    return request;
  }, { fastBlockedTimeout: true });

  await assert.rejects(MotoDB.init(), /محجوزة بواسطة تبويب قديم/);
  assert.equal(MotoDB.initPromise, null);
  assert.equal(await MotoDB.init(), true);
  assert.equal(opens, 2);
});
