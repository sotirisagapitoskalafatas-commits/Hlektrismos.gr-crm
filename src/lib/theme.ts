// Shell themes (top bar + sidebar only; the content area is always light).
// The CSS variables live in src/styles/atlas-theme.css under :root[data-shell-theme='…']; this module is the
// typed list (for the pickers and previews) and the single place that sets the attribute. A test keeps the two in sync.

export type ShellThemeKey = 'navy' | 'ocean' | 'graphite' | 'forest' | 'plum' | 'light';

export interface ShellTheme {
  key: ShellThemeKey;
  name: string; // Greek display name
  top: string;
  side: string;
  accent: string;
  accent2: string;
  muted: string;
  light?: boolean; // dark text on a light shell
}

export const DEFAULT_THEME: ShellThemeKey = 'navy';

export const THEMES: readonly ShellTheme[] = [
  { key: 'navy', name: 'Navy', top: '#0b1d3a', side: '#13306a', accent: '#4da3ff', accent2: '#9a8cff', muted: '#b4c2d8' },
  { key: 'ocean', name: 'Ωκεανός', top: '#08303b', side: '#0e4a57', accent: '#2dd4bf', accent2: '#5bb8ff', muted: '#b6cdd3' },
  { key: 'graphite', name: 'Γραφίτης', top: '#17181c', side: '#2a2c34', accent: '#8ab4ff', accent2: '#c9a8ff', muted: '#bdbdc4' },
  { key: 'forest', name: 'Δάσος', top: '#0c2a20', side: '#14423a', accent: '#5fd39a', accent2: '#4dd0e1', muted: '#b5cfc2' },
  { key: 'plum', name: 'Δαμάσκηνο', top: '#2a1033', side: '#4a1f5e', accent: '#d8a6ff', accent2: '#ff9acb', muted: '#d0bcd8' },
  { key: 'light', name: 'Φωτεινό', top: '#ffffff', side: '#fbfbfd', accent: '#0066cc', accent2: '#5e5ce6', muted: '#3a3a3c', light: true },
];

export const THEME_KEYS: readonly ShellThemeKey[] = THEMES.map((t) => t.key);

export function isThemeKey(v: unknown): v is ShellThemeKey {
  return typeof v === 'string' && (THEME_KEYS as readonly string[]).includes(v);
}

/** Any stored/unknown value → a valid key (unknown values fall back to the default, never throw). */
export function resolveTheme(v: unknown): ShellThemeKey {
  return isThemeKey(v) ? v : DEFAULT_THEME;
}

export function themeByKey(v: unknown): ShellTheme {
  const key = resolveTheme(v);
  return THEMES.find((t) => t.key === key) as ShellTheme;
}

interface AttrTarget { setAttribute(name: string, value: string): void }

/** Applies the theme by setting <html data-shell-theme>. Returns the key actually applied. */
export function applyTheme(v: unknown, root?: AttrTarget): ShellThemeKey {
  const key = resolveTheme(v);
  const target = root ?? (typeof document !== 'undefined' ? document.documentElement : undefined);
  target?.setAttribute('data-shell-theme', key);
  return key;
}
