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

function getFallbackInitData(): { initData: string; parsed: URLSearchParams } | null {
  if (cachedFallback) return cachedFallback;
  const hashParams = getHashParams();
  if (!hashParams) return null;
  const tgData = hashParams.get('tgWebAppData');
  if (!tgData) return null;
  try {
    const initData = decodeURIComponent(tgData);
    const parsed = new URLSearchParams(initData);
    cachedFallback = { initData, parsed };
    return cachedFallback;
  } catch {
    return null;
  }
}

export function getInitDataRaw(): string | null {
  const fromTelegram = window.Telegram?.WebApp?.initData;
  if (fromTelegram && fromTelegram.trim()) return fromTelegram;
  return getFallbackInitData()?.initData ?? null;
}

export function getStartParam(): string | null {
  const startFromTelegram = window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;
  if (startFromTelegram) return startFromTelegram;
  const fallback = getFallbackInitData();
  return fallback?.parsed.get('start_param') ?? null;
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
