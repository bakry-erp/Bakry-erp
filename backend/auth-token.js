import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const DEFAULT_TOKEN_TTL_SECONDS = 8 * 60 * 60;

export function signToken(payload, secret, options = {}) {
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const ttlSeconds = Number.isInteger(options.ttlSeconds) && options.ttlSeconds > 0
    ? options.ttlSeconds
    : DEFAULT_TOKEN_TTL_SECONDS;
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    jti: randomUUID(),
    ...payload
  })).toString('base64url');
  const content = `${header}.${body}`;
  const signature = createHmac('sha256', secret).update(content).digest('base64url');
  return `${content}.${signature}`;
}

export function verifyToken(token, secret, options = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const input = `${parts[0]}.${parts[1]}`;
  const expected = createHmac('sha256', secret).update(input).digest();
  let actual;
  try { actual = Buffer.from(parts[2], 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
    if (!payload.exp || payload.exp <= nowSeconds) return null;
    return payload;
  } catch { return null; }
}
