const apiBase =
  import.meta.env.VITE_API_BASE_URL ||
  (window as any).API_BASE_URL ||
  'http://localhost:4000';

export async function fetchApi(path: string, init?: RequestInit) {
  const primary = `${apiBase}${path}`;
  try {
    const r = await fetch(primary, init);
    if (r.status !== 404) return r;
    console.warn('[api] 404 on', primary, '-> trying /api prefix');
  } catch (e) {
    console.warn('[api] error on', primary, e, '-> trying /api prefix');
  }
  const secondary = `${apiBase}/api${path}`;
  try {
    const r2 = await fetch(secondary, init);
    return r2;
  } catch (e2) {
    console.error('[api] error on', secondary, e2);
    throw e2;
  }
}

export { apiBase };
