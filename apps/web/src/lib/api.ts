const base =
  import.meta.env.VITE_API_BASE_URL ||
  (window as any).API_BASE_URL ||
  'http://localhost:4000';
const prefix = ((import.meta as any).env?.VITE_API_PATH_PREFIX || (window as any).API_PATH_PREFIX || '') as string;

export const apiBase = `${base}${prefix}`;

export async function fetchApi(path: string, init?: RequestInit) {
  return fetch(`${apiBase}${path}`, init);
}
