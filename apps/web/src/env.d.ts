/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PATH_PREFIX?: string; // e.g. '/api' when behind reverse proxy
  readonly VITE_DEBUG_CONSOLE?: string;   // 'true' | 'false'
  readonly VITE_TEST_HINTS?: string;
  // Stars pricing shown in the Shop (Telegram Stars)
  // If unset, UI falls back to defaults.
  readonly VITE_STARS_PRICE_PER_LETTER?: string;    // e.g. '10'
  readonly VITE_STARS_PRICE_TWO_LETTERS?: string;   // e.g. '18'
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}


