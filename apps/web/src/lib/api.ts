import { getInitDataRaw } from './telegram';

// Derive API base more robustly for production builds
const env: any = (import.meta as any)?.env || {};
const isProd = String(env?.MODE || '').toLowerCase() === 'production';
const win: any = (typeof window !== 'undefined' ? (window as any) : undefined);

const resolvedBase =
  (env?.VITE_API_BASE_URL as string | undefined) ||
  (win?.API_BASE_URL as string | undefined) ||
  // Fallback to same-origin in browsers
  (typeof location !== 'undefined' ? location.origin : undefined) ||
  // Final fallback for local dev
  'http://localhost:4000';

const resolvedPrefix = '/api';

export const apiBase = `${resolvedBase}${resolvedPrefix}`;
export const apiHostBase = resolvedBase as string;
export const apiPathPrefix = resolvedPrefix as string;

export async function fetchApi(path: string, init?: RequestInit) {
  const headers = new Headers(init?.headers || {});
  const initData = getInitDataRaw();
  if (initData) headers.set('X-Telegram-Init-Data', initData);
  try {
    if (/^\/(rooms(\/solo)?|profile|auth\/telegram\/verify)/.test(path)) {
      console.log('[api] request', path, {
        hasInitData: Boolean(initData),
        initDataLen: initData?.length || 0,
      });
    }
  } catch {}
  return fetch(`${apiBase}${path}`, { ...init, headers });
}
