import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';

export const DATABASE_ENGINES = new Set(['sqlite', 'mysql', 'postgres']);

export function normalizeTenantIdentity(input = {}) {
  const displayName = String(input.displayName ?? input.display_name ?? '').trim();
  const slug = String(input.slug ?? input.code ?? '').trim().toLowerCase();
  if (displayName.length < 2 || displayName.length > 120) {
    const error = new Error('invalid_tenant_name'); error.code = 'invalid_tenant_name'; throw error;
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(slug)) {
    const error = new Error('invalid_tenant_slug'); error.code = 'invalid_tenant_slug'; throw error;
  }
  return { displayName, slug };
}

function settingsKey(secret) {
  if (!secret || String(secret).length < 32) throw new Error('settings_encryption_key_unavailable');
  return createHash('sha256').update(`Bakry ERP tenant settings v1:${secret}`).digest();
}

export function encryptSetting(value, secret) {
  if (value === undefined || value === null || value === '') return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', settingsKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptSetting(value, secret) {
  if (!value) return '';
  const [version, ivText, tagText, dataText] = String(value).split('.');
  if (version !== 'v1' || !ivText || !tagText || !dataText) throw new Error('stored_setting_invalid');
  const decipher = createDecipheriv('aes-256-gcm', settingsKey(secret), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]).toString('utf8');
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function hmac(key, value, encoding) { return createHmac('sha256', key).update(value).digest(encoding); }
function awsEncode(value) { return encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`); }

function isPrivateIPv4(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 192 && (b === 0 || b === 88 && c === 99)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
    (a === 203 && b === 0 && c === 113);
}

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) return !isPrivateIPv4(address);
  if (family === 6) {
    const value = address.toLowerCase();
    // Restrict webhook destinations to global-unicast IPv6 (2000::/3).
    return /^[23]/.test(value) && !value.startsWith('2001:db8:');
  }
  return false;
}

export async function validateWebhookUrl(value, lookupImpl = lookup) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('webhook_url_invalid'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.hostname || isIP(url.hostname)) {
    throw new Error('webhook_url_must_be_public_https');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('webhook_url_must_be_public_https');
  }
  let addresses;
  try { addresses = await lookupImpl(host, { all: true, verbatim: true }); } catch { throw new Error('webhook_host_unresolved'); }
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('webhook_url_must_be_public_https');
  Object.defineProperties(url, { resolvedAddress: { value: addresses[0].address }, resolvedFamily: { value: addresses[0].family || isIP(addresses[0].address) } });
  return url;
}

function postOrPutHttpsPinned({ url, address, family, method, headers, body, requestImpl = https.request }) {
  return new Promise((resolve, reject) => {
    const request = requestImpl({
      protocol: 'https:', hostname: url.hostname, port: url.port || 443,
      path: `${url.pathname}${url.search}`, method, servername: url.hostname,
      headers: { ...headers, Host: url.host, 'Content-Length': String(body.length) },
      lookup: (_hostname, options, callback) => {
        if (options?.all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
      rejectUnauthorized: true
    }, response => {
      response.resume?.();
      response.on('end', () => {
        const status = Number(response.statusCode) || 0;
        if (status < 200 || status >= 300) reject(new Error(`backup_upload_failed_${status}`));
        else resolve({ statusCode: status });
      });
    });
    request.setTimeout?.(30000, () => request.destroy(new Error('backup_upload_timeout')));
    request.on('error', error => {
      const code = error?.message === 'backup_upload_timeout' ? 'backup_upload_timeout' : 'backup_upload_network_error';
      reject(new Error(code));
    });
    request.end(body);
  });
}

async function uploadS3(config, body, now, options) {
  let endpoint;
  try { endpoint = await validateWebhookUrl(config.s3_endpoint, options.lookupImpl); } catch { throw new Error('s3_endpoint_invalid'); }
  if (endpoint.pathname !== '/' && endpoint.pathname !== '') throw new Error('s3_endpoint_invalid');
  const bucket = String(config.s3_bucket || '').trim();
  const accessKey = String(config.s3_access_key || '').trim();
  const secretKey = String(config.s3_secret_key || '');
  const region = String(config.s3_region || 'auto').trim();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/i.test(bucket)) throw new Error('s3_bucket_invalid');
  if (!accessKey || !secretKey || !/^[a-z0-9-]{2,32}$/i.test(region)) throw new Error('s3_credentials_missing');

  const date = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = date.slice(0, 8);
  const objectKey = String(config.object_key || `bakry-erp-backups/${config.tenant_id}/${day}/${date}.json.gz`).split('/').map(awsEncode).join('/');
  const payloadHash = sha256(body);
  const canonicalUri = `/${awsEncode(bucket)}/${objectKey}`;
  const canonicalHeaders = `content-encoding:gzip\ncontent-type:application/json\nhost:${endpoint.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${date}\n`;
  const signedHeaders = 'content-encoding;content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${day}/${region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${date}\n${scope}\n${sha256(canonicalRequest)}`;
  const kDate = hmac(`AWS4${secretKey}`, day);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  const kSigning = hmac(kService, 'aws4_request');
  const signature = hmac(kSigning, stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  endpoint.pathname = canonicalUri;
  await postOrPutHttpsPinned({
    url: endpoint, address: endpoint.resolvedAddress, family: endpoint.resolvedFamily,
    method: 'PUT', requestImpl: options.httpsRequestImpl,
    body,
    headers: {
      Authorization: authorization,
      'Content-Encoding': 'gzip', 'Content-Type': 'application/json',
      'X-Amz-Content-Sha256': payloadHash, 'X-Amz-Date': date
    }
  });
  return { destination: 's3', object_key: objectKey, bytes: body.length };
}

async function uploadWebhook(config, body, options) {
  const url = await validateWebhookUrl(config.webhook_url, options.lookupImpl);
  const digest = sha256(body);
  await postOrPutHttpsPinned({
    url, address: url.resolvedAddress, family: url.resolvedFamily,
    method: 'POST', requestImpl: options.httpsRequestImpl, body,
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'X-Bakry-Backup-SHA256': digest }
  });
  return { destination: 'webhook', object_key: null, bytes: body.length };
}

export async function uploadCloudBackup(config, backup, options = {}) {
  const now = options.now || new Date();
  const gzip = options.gzip || (await import('node:zlib')).gzipSync;
  const json = Buffer.from(JSON.stringify(backup));
  if (json.length > 25 * 1024 * 1024) throw new Error('backup_too_large');
  const body = gzip(json);
  const serviceOptions = { ...options, lookupImpl: options.lookupImpl || lookup };
  if (config.backup_cloud_provider === 's3') return uploadS3(config, body, now, serviceOptions);
  if (config.backup_cloud_provider === 'webhook') return uploadWebhook(config, body, serviceOptions);
  throw new Error('backup_provider_invalid');
}
