// The CRM's current view, carried in the URL hash so a refresh, a new tab and the browser's Back/Forward keep the section.
//   #/dashboard?view=customers
//   #/dashboard?view=leads&f.status=new
//   #/dashboard?view=case&caseId=<uuid>
// Dependency-free so Node tests can drive it with a fake window. Nothing personal is ever written: only page keys, an identifier of the
// UUID/slug shape, and filter values of the same shape (a name, e-mail address or phone number does not match and is silently left out).
// Access is NOT decided here: the page-access guard in AppShell still checks whatever page the URL names.
import type { PageKey } from './roles';

export type PageFilters = Record<string, string>;
export type AppView = { page: PageKey | 'case'; caseId: string | null; filters?: PageFilters | null };

export const PAGE_KEYS: readonly PageKey[] = [
  'home', 'mywork', 'leads', 'prospecting', 'providers', 'cases', 'followups', 'customers',
  'map', 'myday', 'field', 'backoffice', 'reports', 'revenue', 'admin',
  'automations', 'aiworkforce', 'account', 'preferences', 'homelayout', 'guide', 'applications',
];
const PAGES = new Set<string>(PAGE_KEYS);

export const HOME: AppView = { page: 'home', caseId: null, filters: null };

/** An identifier or slug: letters, digits, "-" and "_" only, at most 64 characters. Not a place for names, addresses or numbers. */
const SAFE = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_KEY = /^[a-z][A-Za-z0-9_]{0,29}$/;
const FILTER_PREFIX = 'f.';
const MAX_FILTERS = 8;

/** The view a hash names, or null when it does not name a CRM view at all. A named but unknown or malformed view falls back to home. */
export function parseView(hash: string): AppView | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  const [path, query = ''] = h.split('?');
  if (path !== '/dashboard' && path !== '/app') return null;
  let params: URLSearchParams;
  try { params = new URLSearchParams(query); } catch { return HOME; }
  const view = params.get('view');
  if (view === 'case') {
    const id = params.get('caseId');
    return id && SAFE.test(id) ? { page: 'case', caseId: id, filters: null } : HOME;
  }
  if (!view || !PAGES.has(view)) return HOME;
  const filters: PageFilters = {};
  for (const [k, v] of params) {
    if (!k.startsWith(FILTER_PREFIX) || Object.keys(filters).length >= MAX_FILTERS) continue;
    const key = k.slice(FILTER_PREFIX.length);
    if (SAFE_KEY.test(key) && SAFE.test(v)) filters[key] = v;
  }
  return { page: view as PageKey, caseId: null, filters: Object.keys(filters).length ? filters : null };
}

/** The hash for a view. Filters that are not safe to put in a URL are left out (the page then opens unfiltered). */
export function buildHash(view: AppView): string {
  if (view.page === 'case') {
    return view.caseId && SAFE.test(view.caseId) ? `#/dashboard?view=case&caseId=${view.caseId}` : '#/dashboard';
  }
  const params = new URLSearchParams({ view: view.page });
  let n = 0;
  for (const [k, v] of Object.entries(view.filters ?? {})) {
    if (n >= MAX_FILTERS || !SAFE_KEY.test(k) || !SAFE.test(v)) continue;
    params.set(FILTER_PREFIX + k, v); n++;
  }
  return `#/dashboard?${params}`;
}

export const sameView = (a: AppView, b: AppView) => buildHash(a) === buildHash(b);

/** The part of `window` the store needs; a test supplies a fake. */
export interface NavWindow {
  location: { hash: string };
  addEventListener(type: 'hashchange', fn: () => void): void;
  removeEventListener(type: 'hashchange', fn: () => void): void;
}

/**
 * Holds the current view. The URL is the source of truth: go() and openCase() write the hash (which also makes a history entry), and the
 * hashchange that follows, from them or from Back/Forward, is what updates the view. Reading a new store from the same window is a refresh.
 * A bare #/dashboard (what the login redirect writes) is Home. A hash for another route, such as #/login, names no CRM view and keeps the current one.
 */
export function createNavStore(win: NavWindow) {
  let view: AppView = parseView(win.location.hash) ?? HOME;
  const listeners = new Set<() => void>();
  const onHash = () => {
    const next = parseView(win.location.hash);
    if (next && !sameView(next, view)) { view = next; listeners.forEach((l) => l()); }
  };
  const write = (next: AppView) => {
    // The view changes at once, so a filter that cannot go in the URL still applies in this session; the hashchange that follows describes the
    // same view (sameView ignores what the URL cannot carry) and changes nothing.
    view = next; listeners.forEach((l) => l());
    const hash = buildHash(next);
    if (win.location.hash !== hash) win.location.hash = hash; // makes a history entry for Back/Forward
  };
  return {
    get: () => view,
    subscribe(fn: () => void) { listeners.add(fn); if (listeners.size === 1) win.addEventListener('hashchange', onHash); return () => { listeners.delete(fn); if (!listeners.size) win.removeEventListener('hashchange', onHash); }; },
    go: (page: PageKey, filters?: PageFilters) => write({ page, caseId: null, filters: filters ?? null }),
    openCase: (id: string) => write({ page: 'case', caseId: id, filters: null }),
  };
}
