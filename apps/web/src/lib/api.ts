import { getInitDataRaw } from './telegram';

const base =
  import.meta.env.VITE_API_BASE_URL ||
  (window as any).API_BASE_URL ||
  'http://localhost:4000';
const prefix = ((import.meta as any).env?.VITE_API_PATH_PREFIX || (window as any).API_PATH_PREFIX || '') as string;

export const apiBase = `${base}${prefix}`;
export const apiHostBase = base as string;
export const apiPathPrefix = prefix as string;

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
