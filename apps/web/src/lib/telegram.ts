export type TelegramUser = { id: number; first_name: string; username?: string };

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        initDataUnsafe?: { user?: TelegramUser; start_param?: string };
        ready: () => void;
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


