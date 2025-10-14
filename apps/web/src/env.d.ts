/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_PATH_PREFIX?: string; // e.g. '/api' when behind reverse proxy
  readonly VITE_DEBUG_CONSOLE?: string;   // 'true' | 'false'
  readonly VITE_TEST_HINTS?: string;
  // UI no longer needs pricing env; packs are fetched from API
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}


