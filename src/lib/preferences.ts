// Per-user interface preferences: shell theme, compact sidebar, home layout, pipeline lane.
//
// Source of truth is public.user_preferences (own row, RLS). This browser keeps a copy in localStorage so the theme
// can be applied before the first paint and the app still works offline, when storage is blocked, or while the
// staged migration is not applied yet (then everything stays local and `remote` reports 'unavailable').
// Changes apply immediately (optimistic) and are saved in one debounced write. Nothing here ever throws into the UI.
import { useSyncExternalStore } from 'react';
import { applyTheme, DEFAULT_THEME, resolveTheme } from './theme';
import type { ShellThemeKey } from './theme';
import { supabase } from './supabase';

export type TileSize = 'S' | 'M' | 'L' | 'XL';
export interface LayoutItem { id: string; size: TileSize }
export interface Preferences {
  shell_theme: ShellThemeKey;
  sidebar_compact: boolean;
  dashboard_layout: LayoutItem[];
  pipeline_lane: string | null;
}

export const DEFAULT_PREFERENCES: Preferences = { shell_theme: DEFAULT_THEME, sidebar_compact: false, dashboard_layout: [], pipeline_lane: null };

const SIZES: readonly TileSize[] = ['S', 'M', 'L', 'XL'];
const MAX_TILES = 40;
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Anything → a clean layout: unknown shapes, bad ids/sizes and duplicates are dropped, order is kept. Never throws. */
export function validateLayout(v: unknown): LayoutItem[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: LayoutItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const { id, size } = raw as Record<string, unknown>;
    if (typeof id !== 'string' || !ID_RE.test(id) || seen.has(id)) continue;
    if (typeof size !== 'string' || !(SIZES as readonly string[]).includes(size)) continue;
    seen.add(id);
    out.push({ id, size: size as TileSize });
    if (out.length >= MAX_TILES) break;
  }
  return out;
}

/** Row from the server or the local copy → complete, valid preferences (missing/odd fields fall back to defaults). */
export function normalizePreferences(raw: unknown): Preferences {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const lane = typeof r.pipeline_lane === 'string' && r.pipeline_lane.trim() ? r.pipeline_lane.trim().slice(0, 60) : null;
  return {
    shell_theme: resolveTheme(r.shell_theme),
    sidebar_compact: r.sidebar_compact === true,
    dashboard_layout: validateLayout(r.dashboard_layout),
    pipeline_lane: lane,
  };
}

const samePrefs = (a: Preferences, b: Preferences) => JSON.stringify(a) === JSON.stringify(b);

/* ───────── local copy ───────── */
export const CACHE_KEY = 'atlas.prefs.v1';
export const COMPACT_KEY = 'atlas.nav.collapsed'; // pre-existing key, still mirrored so older code and tabs agree

interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void }
const defaultStorage = (): KV | null => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export function readCache(storage: KV | null = defaultStorage()): { uid: string | null; prefs: Preferences } | null {
  try {
    const text = storage?.getItem(CACHE_KEY);
    if (text) {
      const j = JSON.parse(text) as Record<string, unknown>;
      return { uid: typeof j.uid === 'string' ? j.uid : null, prefs: normalizePreferences(j) };
    }
    // first run after this release: honour the old sidebar key
    if (storage?.getItem(COMPACT_KEY) === '1') return { uid: null, prefs: { ...DEFAULT_PREFERENCES, sidebar_compact: true } };
  } catch { /* blocked or corrupt: behave as if there is no local copy */ }
  return null;
}

function writeCache(uid: string | null, p: Preferences, storage: KV | null = defaultStorage()) {
  try {
    storage?.setItem(CACHE_KEY, JSON.stringify({ uid, ...p }));
    storage?.setItem(COMPACT_KEY, p.sidebar_compact ? '1' : '0');
  } catch { /* storage full or blocked: the change still applies for this page view */ }
}

/* ───────── store ───────── */
export type RemoteState = 'idle' | 'ready' | 'unavailable';
export interface PrefsState { prefs: Preferences; remote: RemoteState; saving: boolean; saveFailed: boolean }

export interface PrefsRemote {
  load(userId: string): Promise<{ row: unknown | null; unavailable?: boolean }>;
  save(userId: string, p: Preferences): Promise<{ ok: boolean; unavailable?: boolean }>;
}

const isMissingTable = (e: { code?: string; status?: number } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || e.code === 'PGRST202' || e.status === 404);

export const supabaseRemote: PrefsRemote = {
  async load(userId) {
    if (!supabase) return { row: null, unavailable: true };
    try {
      const { data, error } = await supabase.from('user_preferences')
        .select('shell_theme, sidebar_compact, dashboard_layout, pipeline_lane').eq('user_id', userId).maybeSingle();
      if (error) return { row: null, unavailable: true };
      return { row: data ?? null };
    } catch { return { row: null, unavailable: true }; }
  },
  async save(userId, p) {
    if (!supabase) return { ok: false, unavailable: true };
    try {
      const { error } = await supabase.from('user_preferences').upsert({ user_id: userId, ...p }, { onConflict: 'user_id' });
      if (error) return { ok: false, unavailable: isMissingTable(error as { code?: string; status?: number }) };
      return { ok: true };
    } catch { return { ok: false }; }
  },
};

export interface StoreDeps {
  remote?: PrefsRemote;
  storage?: KV | null;
  debounceMs?: number;
  apply?: (theme: ShellThemeKey) => void;
  onChange?: () => void; // after a change that other parts of the page mirror (sidebar)
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export function createPreferencesStore(deps: StoreDeps = {}) {
  const remote = deps.remote ?? supabaseRemote;
  const storage = deps.storage === undefined ? defaultStorage() : deps.storage;
  const debounceMs = deps.debounceMs ?? 600;
  const apply = deps.apply ?? ((t: ShellThemeKey) => { applyTheme(t); });
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));

  let userId: string | null = null;
  let state: PrefsState = { prefs: DEFAULT_PREFERENCES, remote: 'idle', saving: false, saveFailed: false };
  let timer: unknown = null;
  let dirty = false;
  let loadToken = 0;
  const listeners = new Set<() => void>();

  const set = (next: Partial<PrefsState>) => { state = { ...state, ...next }; listeners.forEach((l) => l()); };
  const setPrefs = (prefs: Preferences) => {
    if (samePrefs(prefs, state.prefs)) return;
    const compactChanged = prefs.sidebar_compact !== state.prefs.sidebar_compact;
    set({ prefs });
    apply(prefs.shell_theme);
    writeCache(userId, prefs, storage);
    if (compactChanged) deps.onChange?.();
  };

  async function flush() {
    if (timer != null) { clearTimer(timer); timer = null; }
    if (!dirty || !userId || state.remote === 'unavailable') { dirty = false; return; }
    dirty = false;
    set({ saving: true });
    const res = await remote.save(userId, state.prefs);
    if (res.unavailable) set({ saving: false, saveFailed: false, remote: 'unavailable' });
    else set({ saving: false, saveFailed: !res.ok, remote: res.ok ? 'ready' : state.remote });
    if (!res.ok && !res.unavailable) dirty = true; // keep it; the next change (or pagehide) retries
  }

  return {
    getState: () => state,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },

    /** Before first paint: apply the local copy (if any). */
    initFromCache() {
      const c = readCache(storage);
      if (c) { state = { ...state, prefs: c.prefs }; }
      apply(state.prefs.shell_theme);
    },

    /** After login: the server row wins; with no row (or no table) the local copy stays. */
    async loadForUser(id: string) {
      userId = id;
      const token = ++loadToken;
      const cached = readCache(storage);
      if (cached && cached.uid && cached.uid !== id) setPrefs(DEFAULT_PREFERENCES); // another person used this browser
      const res = await remote.load(id);
      if (token !== loadToken) return;
      if (res.unavailable) { set({ remote: 'unavailable' }); writeCache(id, state.prefs, storage); return; }
      set({ remote: 'ready' });
      if (res.row) setPrefs(normalizePreferences(res.row));
      else writeCache(id, state.prefs, storage);
    },

    /** Optimistic change → applied now, saved after a short pause. */
    update(patch: Partial<Preferences>) {
      const next = normalizePreferences({ ...state.prefs, ...patch });
      if (samePrefs(next, state.prefs)) return;
      setPrefs(next);
      dirty = true;
      if (timer != null) clearTimer(timer);
      timer = setTimer(() => { void flush(); }, debounceMs);
    },

    flush,

    resetHomeLayout() { this.update({ dashboard_layout: [] }); },

    signOut() { loadToken++; userId = null; if (timer != null) { clearTimer(timer); timer = null; } dirty = false; set({ remote: 'idle', saving: false, saveFailed: false }); },
  };
}

/* ───────── app singleton + hook ───────── */
export const preferencesStore = createPreferencesStore({
  onChange: () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('atlas:prefs')); },
});

/** Call once before rendering. */
export function initPreferences() {
  preferencesStore.initFromCache();
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { void preferencesStore.flush(); });
}

export function usePreferences() {
  const state = useSyncExternalStore(preferencesStore.subscribe, preferencesStore.getState, preferencesStore.getState);
  return {
    ...state.prefs,
    remote: state.remote,
    saving: state.saving,
    saveFailed: state.saveFailed,
    update: preferencesStore.update.bind(preferencesStore),
    resetHomeLayout: preferencesStore.resetHomeLayout.bind(preferencesStore),
  };
}
