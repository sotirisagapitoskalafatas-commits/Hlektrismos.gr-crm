import { createClient } from '@supabase/supabase-js';
import { isMutation, isPreviewActive, PREVIEW_BLOCKED_EVENT } from './role-preview';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/* During a role preview (presentation demo) every write is refused here, before it leaves the browser.
   The real account keeps its real permissions on the server; this only prevents accidental changes. */
const guardedFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
  if (isPreviewActive() && isMutation(url, method)) {
    try { window.dispatchEvent(new Event(PREVIEW_BLOCKED_EVENT)); } catch { /* non-browser */ }
    return Promise.resolve(new Response(JSON.stringify({
      code: 'PREVIEW_READ_ONLY', message: 'Προεπισκόπηση ρόλου: μόνο ανάγνωση — η ενέργεια δεν εκτελέστηκε.',
    }), { status: 403, headers: { 'Content-Type': 'application/json' } }));
  }
  return fetch(input, init);
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { fetch: guardedFetch } });

/** A client WITHOUT the user's session — used only for the Admin Center's "what can an anonymous visitor read" checks. */
export function anonymousClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'atlas-anon-check' },
  });
}
