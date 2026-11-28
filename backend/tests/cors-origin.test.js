import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAllowedOrigins } from '../cors-origin.js';

test('CORS allow-list normalizes GitHub Pages paths and trailing slashes to the origin', () => {
  const origins = normalizeAllowedOrigins('https://bakry-erp.github.io/Bakry-erp/, https://admin.example.com/');
  assert.equal(origins.has('https://bakry-erp.github.io'), true);
  assert.equal(origins.has('https://admin.example.com'), true);
  assert.equal(origins.has('https://bakry-erp.github.io/Bakry-erp'), false);
});

test('CORS allow-list ignores malformed, credentialed and insecure remote origins', () => {
  const origins = normalizeAllowedOrigins('not-a-url, http://bad.example.com, https://user:pass@example.com, http://localhost:3000');
  assert.equal(origins.has('http://localhost:3000'), true);
  assert.equal(origins.size, 1);
});
