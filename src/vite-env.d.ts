/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_MAP_STYLE_URL?: string;
  readonly VITE_CARTO_API_KEY?: string;
  readonly CRM_VITE_CARTO_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Safe, non-secret release metadata injected by vite.config.ts at build time.
declare const __APP_VERSION__: string;
declare const __BUILD_COMMIT__: string;
declare const __BUILD_REF__: string;
declare const __BUILD_ENVIRONMENT__: string;
declare const __BUILD_TIME__: string;
