/** Normalize a comma-separated CORS allow-list to URL origins. Paths and trailing slashes are ignored. */
export function normalizeAllowedOrigins(value) {
  const result = new Set();
  for (const entry of String(value || '').split(',')) {
    const candidate = entry.trim();
    if (!candidate) continue;
    try {
      const url = new URL(candidate);
      const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.protocol !== 'https:' && !localHttp) continue;
      if (url.username || url.password) continue;
      result.add(url.origin);
    } catch { /* Ignore malformed allow-list entries. */ }
  }
  return result;
}
