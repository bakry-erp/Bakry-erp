import test from 'node:test';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import {
  normalizeTenantIdentity, encryptSetting, decryptSetting,
  validateWebhookUrl, uploadCloudBackup
} from '../storage-services.js';

const secret = 'test-only-jwt-secret-that-is-at-least-32-chars';
function mockHttpsRequest(capture, statusCode = 200) {
  return (requestOptions, onResponse) => {
    const listeners = {};
    return {
      on(name, handler) { listeners[name] = handler; return this; },
      setTimeout() { return this; },
      destroy(error) { listeners.error?.(error); },
      end(body) {
        capture({ requestOptions, body });
        const responseListeners = {};
        onResponse({ statusCode, resume() {}, on(name, handler) { responseListeners[name] = handler; if (name === 'end') queueMicrotask(handler); return this; } });
      }
    };
  };
}

test('tenant identity normalization validates and normalizes a usable facility code', () => {
  assert.deepEqual(normalizeTenantIdentity({ displayName: 'معرض البكري', slug: 'Bakry-Moto' }), {
    displayName: 'معرض البكري', slug: 'bakry-moto'
  });
  assert.throws(() => normalizeTenantIdentity({ displayName: 'X', slug: 'bad code' }), /invalid_tenant/);
});

test('sensitive settings are authenticated-encrypted and round-trip correctly', () => {
  const encrypted = encryptSetting('s3-secret-value', secret);
  assert.notEqual(encrypted, 's3-secret-value');
  assert.equal(decryptSetting(encrypted, secret), 's3-secret-value');
  assert.throws(() => decryptSetting(encrypted, 'different-jwt-secret-that-is-at-least-32-chars'));
});

test('webhook URL validation blocks non-HTTPS and private destinations', async () => {
  await assert.rejects(() => validateWebhookUrl('http://example.com/backup', async () => [{ address: '93.184.216.34' }]));
  await assert.rejects(() => validateWebhookUrl('https://127.0.0.1/backup', async () => [{ address: '127.0.0.1' }]));
  await assert.rejects(() => validateWebhookUrl('https://backup.example/backup', async () => [{ address: '10.0.0.4' }]));
  await assert.rejects(() => validateWebhookUrl('https://backup.example/backup', async () => [{ address: '192.0.2.10' }]));
  const valid = await validateWebhookUrl('https://backup.example/receive', async () => [{ address: '93.184.216.34', family: 4 }]);
  assert.equal(valid.hostname, 'backup.example');
});

test('S3 compatible backup upload signs a gzip PUT without exposing secret in response', async () => {
  let captured;
  const result = await uploadCloudBackup({
    backup_cloud_provider: 's3', s3_endpoint: 'https://account.r2.cloudflarestorage.com',
    s3_bucket: 'bakry-backups', s3_region: 'auto', s3_access_key: 'ACCESS123',
    s3_secret_key: 'very-secret-key', tenant_id: 'tenant-123'
  }, { format: 'bakry-erp-tenant-backup', records: [{ id: 1 }] }, {
    now: new Date('2026-11-28T12:00:00.000Z'),
    lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
    httpsRequestImpl: mockHttpsRequest(value => { captured = value; })
  });
  assert.equal(result.destination, 's3');
  assert.match(result.object_key, /tenant-123/);
  assert.match(captured.requestOptions.headers.Authorization, /^AWS4-HMAC-SHA256 Credential=ACCESS123/);
  assert.ok(captured.requestOptions.headers.Authorization.includes('Signature='));
  assert.equal(typeof captured.requestOptions.lookup, 'function');
  assert.equal(JSON.parse(gunzipSync(captured.body).toString()).format, 'bakry-erp-tenant-backup');
  assert.equal(JSON.stringify(result).includes('very-secret-key'), false);
});

test('Webhook upload transmits a compressed backup only to validated public HTTPS URL', async () => {
  let captured;
  const result = await uploadCloudBackup({ backup_cloud_provider: 'webhook', webhook_url: 'https://backup.example/receive' }, { record_count: 2 }, {
    lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
    httpsRequestImpl: mockHttpsRequest(value => { captured = value; }, 204)
  });
  assert.equal(result.destination, 'webhook');
  assert.equal(JSON.parse(gunzipSync(captured.body).toString()).record_count, 2);
  assert.match(captured.requestOptions.headers['X-Bakry-Backup-SHA256'], /^[a-f0-9]{64}$/);
  assert.equal(typeof captured.requestOptions.lookup, 'function');
});


test('cloud backup pins the validated public IP for the HTTPS request', async () => {
  let captured;
  await uploadCloudBackup({ backup_cloud_provider: 'webhook', webhook_url: 'https://backup.example/receive' }, { ok: true }, {
    lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }],
    httpsRequestImpl: mockHttpsRequest(value => { captured = value; })
  });
  const resolved = await new Promise((resolve, reject) => {
    captured.requestOptions.lookup('backup.example', {}, (error, address, family) => error ? reject(error) : resolve({ address, family }));
  });
  assert.deepEqual(resolved, { address: '93.184.216.34', family: 4 });
});

test('cloud backup sanitizes failed HTTP responses and network errors', async () => {
  const config = { backup_cloud_provider: 'webhook', webhook_url: 'https://backup.example/receive' };
  const options = { lookupImpl: async () => [{ address: '93.184.216.34', family: 4 }] };
  await assert.rejects(() => uploadCloudBackup(config, { ok: true }, {
    ...options, httpsRequestImpl: mockHttpsRequest(() => {}, 403)
  }), /backup_upload_failed_403/);
  const failingRequest = () => {
    const listeners = {};
    return {
      on(name, handler) { listeners[name] = handler; if (name === 'error') queueMicrotask(() => handler(new Error('secret host and credential details'))); return this; },
      setTimeout() { return this; },
      destroy() {}, end() {}
    };
  };
  await assert.rejects(() => uploadCloudBackup(config, { ok: true }, {
    ...options, httpsRequestImpl: failingRequest
  }), error => error.message === 'backup_upload_network_error');
});
