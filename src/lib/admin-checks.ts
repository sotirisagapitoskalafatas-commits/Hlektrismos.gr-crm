/* Ασφάλεια & Έλεγχοι: the browser wiring of the evidence model (security-evidence.ts holds every rule and is tested without a browser).
   Everything here is READ-ONLY: the live probes never write, and a secret VALUE is never read onto the page. See components/admin/AdminSecurity. */

import { anonymousClient, supabase } from './supabase';
import { buildChecks, runLiveChecks, validateCheck } from './security-evidence';
import type { Check, LiveRun, ProbeDeps } from './security-evidence';

export * from './security-evidence';

const AUTH_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const STORE = 'atlas.admin.security.live.v2';

/** Runs every live probe from THIS browser, as the signed-in Admin (and, for the anonymous section, with no session at all). */
export async function runSecurityChecks(): Promise<LiveRun> {
  const deps: ProbeDeps = {
    authUrl: AUTH_URL, anonKey: ANON_KEY, fetcher: (...a) => fetch(...a), now: () => new Date().toISOString(),
    appHost: typeof window === 'undefined' ? '' : window.location.hostname,
    anon: anonymousClient() as unknown as ProbeDeps['anon'],
    user: supabase as unknown as ProbeDeps['user'],
  };
  const run = await runLiveChecks(deps);
  try { localStorage.setItem(STORE, JSON.stringify(run)); } catch { /* the page still shows this run */ }
  return run;
}

/** The last run saved in this browser. Anything that would break the evidence rules (for example a tampered «verified») is dropped, never shown. */
export function lastLiveChecks(): LiveRun | null {
  try {
    const raw = localStorage.getItem(STORE);
    const v = raw ? JSON.parse(raw) as LiveRun : null;
    if (!v || typeof v.at !== 'string' || !Array.isArray(v.results)) return null;
    return { ...v, results: v.results.filter((c) => validateCheck(c).length === 0) };
  } catch { return null; }
}

/** Every check, with the last live run merged in. */
export const currentChecks = (): Check[] => buildChecks(lastLiveChecks()?.results ?? null);
