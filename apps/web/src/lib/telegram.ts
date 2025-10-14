export type TelegramUser = { id: number; first_name: string; username?: string };

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: { user?: TelegramUser; start_param?: string };
        ready: () => void;
        openInvoice?: (url: string, cb?: (status: 'paid' | 'cancelled' | 'failed') => void) => void;
        openTelegramLink?: (url: string) => void;
        onEvent?: (event: 'invoiceClosed', cb: (data: { url: string; status: 'paid' | 'cancelled' | 'failed' }) => void) => void;
        offEvent?: (event: 'invoiceClosed', cb: (data: { url: string; status: 'paid' | 'cancelled' | 'failed' }) => void) => void;
      };
    };
  }
}

function getHashParams(): URLSearchParams | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
  if (!hash) return null;
  try {
    return new URLSearchParams(hash);
  } catch {
    return null;
  }
}

let cachedFallback: { initData: string; parsed: URLSearchParams } | null = null;
export const TELEGRAM_INIT_DATA_TTL_SECONDS = 24 * 60 * 60;

function scrubTgInitDataFromHash() {
  try {
    if (typeof window === 'undefined') return;
    const rawHash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    if (!rawHash) return;
    const params = new URLSearchParams(rawHash);
    if (!params.has('tgWebAppData')) return;
    params.delete('tgWebAppData');
    const newHash = params.toString();
    const url = new URL(window.location.href);
    url.hash = newHash ? `#${newHash}` : '';
    // Avoid navigation and history pollution; just replace the URL
    window.history.replaceState(window.history.state, document.title, url.toString());
  } catch {
    // best-effort scrub; ignore failures
  }
}

function getFallbackInitData(): { initData: string; parsed: URLSearchParams } | null {
  if (cachedFallback) return cachedFallback;
  const hashParams = getHashParams();
  if (!hashParams) return null;
  const tgData = hashParams.get('tgWebAppData');
  if (!tgData) return null;
  try {
    // Do NOT decode here. The raw Telegram initData is a percent-encoded
    // ASCII-safe query string. Keeping it encoded avoids non-ASCII characters
    // in headers (e.g., Cyrillic names) which iOS Safari rejects.
    const initData = tgData;
    const parsed = new URLSearchParams(initData);
    cachedFallback = { initData, parsed };
    // Scrub sensitive init payload from URL hash after parsing
    scrubTgInitDataFromHash();
    return cachedFallback;
  } catch {
    return null;
  }
}

// Cache initData client-side to bridge Telegram's occasional missing initData
// on reloads or when returning from in-app invoices. We enforce TTL locally.
const INITDATA_CACHE_KEY = 'tg_webapp_initdata_cache_v1';

function getCachedInitData(): string | null {
  try {
    const raw = localStorage.getItem(INITDATA_CACHE_KEY);
    if (!raw) return null;
    // Validate TTL using embedded auth_date
    const params = new URLSearchParams(raw);
    const authDateStr = params.get('auth_date');
    const authDate = authDateStr ? Number(authDateStr) : NaN;
    if (!Number.isFinite(authDate)) return null;
    const now = Math.floor(Date.now() / 1000);
    const age = Math.max(0, now - authDate);
    if (age > TELEGRAM_INIT_DATA_TTL_SECONDS) {
      // Expired locally — drop cache
      try { localStorage.removeItem(INITDATA_CACHE_KEY); } catch {}
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}

function setCachedInitData(raw: string) {
  try {
    if (!raw || !raw.trim()) return;
    // Only cache strings that look like query strings and contain auth_date
    const params = new URLSearchParams(raw);
    const hasAuth = !!params.get('auth_date');
    if (!hasAuth) return;
    localStorage.setItem(INITDATA_CACHE_KEY, raw);
  } catch {
    // Ignore storage errors (e.g., Safari private mode)
  }
}

export function getInitDataRaw(): string | null {
  // 1) Prefer Telegram-provided initData
  const fromTelegram = window.Telegram?.WebApp?.initData;
  if (fromTelegram && fromTelegram.trim()) {
    // Keep a fresh copy to survive reloads
    setCachedInitData(fromTelegram);
    return fromTelegram;
  }
  // 2) Fallback to initData encoded in URL hash (tgWebAppData)
  const fromHash = getFallbackInitData()?.initData ?? null;
  if (fromHash && fromHash.trim()) {
    setCachedInitData(fromHash);
    return fromHash;
  }
  // 3) Last resort: use locally cached initData within TTL
  const cached = getCachedInitData();
  if (cached && cached.trim()) return cached;
  return null;
}

export function getUser(): TelegramUser | null {
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (tgUser?.id) return tgUser;
  const fallback = getFallbackInitData();
  const rawUser = fallback?.parsed.get('user');
  if (!rawUser) return null;
  try {
    const decoded = decodeURIComponent(rawUser);
    return JSON.parse(decoded) as TelegramUser;
  } catch {
    return null;
  }
}


export function getAuthDate(): number | null {
  const initDataRaw = getInitDataRaw();
  if (initDataRaw && initDataRaw.trim()) {
    try {
      const params = new URLSearchParams(initDataRaw);
      const authDate = params.get('auth_date');
      if (authDate) {
        const value = Number(authDate);
        if (Number.isFinite(value)) return value;
      }
    } catch {
      // ignore parsing errors
    }
  }
  const fallback = getFallbackInitData();
  const fallbackAuth = fallback?.parsed.get('auth_date');
  if (!fallbackAuth) return null;
  const value = Number(fallbackAuth);
  return Number.isFinite(value) ? value : null;
}

export function getInitDataDiagnostics() {
  const initDataRaw = getInitDataRaw() ?? '';
  let hasHash = false;
  let hasAuthDate = false;
  let hasUser = false;
  let authDate: number | null = null;
  let authDateIso: string | null = null;
  let ageSeconds: number | null = null;
  let expired: boolean | null = null;
  let queryId: string | null = null;
  let userId: number | null = null;
  let userFirstName: string | null = null;
  let userUsername: string | null = null;

  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    const a = params.get('auth_date');
    const u = params.get('user');
    queryId = params.get('query_id');
    hasHash = Boolean(hash);
    hasAuthDate = Boolean(a);
    hasUser = Boolean(u);
    if (a) {
      const n = Number(a);
      if (Number.isFinite(n)) {
        authDate = n;
        authDateIso = new Date(n * 1000).toISOString();
        const now = Math.floor(Date.now() / 1000);
        ageSeconds = Math.max(0, now - n);
        expired = ageSeconds > TELEGRAM_INIT_DATA_TTL_SECONDS;
      }
    }
    if (u) {
      try {
        const dec = decodeURIComponent(u);
        const obj = JSON.parse(dec);
        if (obj && typeof obj.id === 'number') userId = obj.id;
        if (obj && typeof obj.first_name === 'string') userFirstName = obj.first_name;
        if (obj && typeof obj.username === 'string') userUsername = obj.username;
      } catch {}
    }
  } catch {}

  return {
    initDataLen: initDataRaw.length,
    hasHash,
    hasAuthDate,
    hasUser,
    authDate,
    authDateIso,
    ageSeconds,
    ttlSeconds: TELEGRAM_INIT_DATA_TTL_SECONDS,
    expired,
    queryId,
    userId,
    userFirstName,
    userUsername,
  } as const;
}

export function logInitDataDiagnostics(context: string = 'diagnostics') {
  try {
    const d = getInitDataDiagnostics();
    console.log('[telegram]', context, 'initData diagnostics', d);
  } catch (e) {
    console.warn('[telegram]', context, 'initData diagnostics failed', e);
  }
}
export function openInvoice(url: string, cb?: (status: 'paid' | 'cancelled' | 'failed') => void) {
  const wa = window.Telegram?.WebApp;
  if (wa?.openInvoice) {
    wa.openInvoice(url, cb);
    return;
  }
  console.warn('Telegram WebApp.openInvoice not available; falling back to openTelegramLink');
  if (wa?.openTelegramLink) {
    wa.openTelegramLink(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  cb?.('cancelled');
}

export function onInvoiceClosed(cb: (data: { url: string; status: 'paid' | 'cancelled' | 'failed' }) => void) {
  const wa = window.Telegram?.WebApp;
  wa?.onEvent?.('invoiceClosed', cb as any);
}

export function offInvoiceClosed(cb: (data: { url: string; status: 'paid' | 'cancelled' | 'failed' }) => void) {
  const wa = window.Telegram?.WebApp;
  wa?.offEvent?.('invoiceClosed', cb as any);
}

// Explicit fallback to open invoice link directly in Telegram
export function openTelegramLink(url: string) {
  const wa = window.Telegram?.WebApp;
  if (wa?.openTelegramLink) {
    wa.openTelegramLink(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

