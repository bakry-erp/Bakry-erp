import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../auth-token.js';

const SECRET = 'test-only-secret-that-is-long-enough-for-signing';

test('same account can hold multiple independently issued sessions', () => {
  const first = signToken({ type: 'owner', sub: 'admin' }, SECRET);
  const second = signToken({ type: 'owner', sub: 'admin' }, SECRET);
  const firstPayload = verifyToken(first, SECRET);
  const secondPayload = verifyToken(second, SECRET);

  assert.ok(firstPayload);
  assert.ok(secondPayload);
  assert.equal(firstPayload.sub, 'admin');
  assert.equal(secondPayload.sub, 'admin');
  assert.notEqual(firstPayload.jti, secondPayload.jti);
  assert.ok(verifyToken(first, SECRET), 'issuing a second token must not revoke the first');
});

test('a session expires independently at its own expiration time', () => {
  const issuedAt = Date.parse('2026-11-28T00:00:00.000Z');
  const token = signToken({ type: 'tenant', sub: 'user-1' }, SECRET, { now: issuedAt, ttlSeconds: 60 });
  assert.ok(verifyToken(token, SECRET, { now: issuedAt + 59_000 }));
  assert.equal(verifyToken(token, SECRET, { now: issuedAt + 60_000 }), null);
});

test('tampered session tokens are rejected', () => {
  const token = signToken({ type: 'owner', sub: 'admin' }, SECRET);
  const altered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(verifyToken(altered, SECRET), null);
});
