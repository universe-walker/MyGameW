export type TelegramUser = { id: number; first_name: string; username?: string };

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: { user?: TelegramUser; start_param?: string };
        ready: () => void;
        openInvoice?: (url: string, cb?: (status: 'paid' | 'cancelled' | 'failed') => void) => void;
        onEvent?: (event: 'invoiceClosed', cb: (data: { url: string; status: 'paid' | 'cancelled' | 'failed' }) => void) => void;
        offEvent?: (event: 'invoiceClosed', cb: (data: { url: string; status: 'paid' | 'cancelled' | 'failed' }) => void) => void;
      };
    };
  }
}

export function getInitDataRaw(): string | null {
  return window.Telegram?.WebApp?.initData ?? null;
}

export function getStartParam(): string | null {
  return window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;
}

export function getUser(): TelegramUser | null {
  return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}

export function openInvoice(url: string, cb?: (status: 'paid' | 'cancelled' | 'failed') => void) {
  const wa = window.Telegram?.WebApp;
  if (!wa?.openInvoice) throw new Error('Telegram WebApp.openInvoice not available');
  wa.openInvoice(url, cb);
}

export function onInvoiceClosed(cb: (data: { url: string; status: 'paid' | 'cancelled' | 'failed' }) => void) {
  const wa = window.Telegram?.WebApp;
  wa?.onEvent?.('invoiceClosed', cb as any);
}

export function offInvoiceClosed(cb: (data: { url: string; status: 'paid' | 'cancelled' | 'failed' }) => void) {
  const wa = window.Telegram?.WebApp;
  wa?.offEvent?.('invoiceClosed', cb as any);
}


