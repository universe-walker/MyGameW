export function getAllowedOrigins(): string[] {
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const raw = (process.env.ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || '').trim();
  const list = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (list.length > 0) return list;

  if (!isProd) {
    // Reasonable defaults for local dev (Vite)
    return [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174',
    ];
  }

  // In production with no explicit allowlist, deny all cross-origin by default.
  return [];
}

export function warnIfProdAndNoOrigins(allowed: string[]) {
  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  if (isProd && allowed.length === 0) {
    try {
      // eslint-disable-next-line no-console
      console.error('[CORS] No ALLOWED_ORIGINS configured. Cross-origin requests will be blocked.');
    } catch {}
  }
}

