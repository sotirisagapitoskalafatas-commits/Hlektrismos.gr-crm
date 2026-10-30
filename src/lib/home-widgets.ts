// Home widgets: which boxes exist, which roles may have them, default layout, and the pure layout operations used by
// the edit mode. A saved layout is only {id,size} per box (public.user_preferences.dashboard_layout); everything here
// re-validates it against the registry, so a stale, hand-edited or foreign layout can never show a box the role may
// not have, never throws, and an empty layout means "the default for my role".
import type { Role } from './roles';
import { validateLayout } from './preferences';
import type { LayoutItem, TileSize } from './preferences';

/** Set by the settings page («Προσαρμογή της αρχικής»); Home reads and clears it to open straight in edit mode. */
export const HOME_EDIT_FLAG = 'atlas.home.edit';

export type WidgetId = 'kpi-urgent' | 'kpi-followups' | 'kpi-offers' | 'kpi-signatures' | 'kpi-new' | 'tasks' | 'pipeline' | 'team' | 'ai' | 'summary';

export interface WidgetMeta {
  id: WidgetId;
  title: string;
  sizes: readonly TileSize[];
  defaultSize: TileSize;
  /** Roles that may have this box; omitted = everyone. */
  roles?: readonly Role[];
}

/** Grid is 10 columns on desktop: S = 2, M = 5, L = 7, XL = 10 (see atlas-home.css). */
export const SIZE_LABEL: Record<TileSize, string> = { S: 'Μικρό', M: 'Μεσαίο', L: 'Μεγάλο', XL: 'Πλήρες πλάτος' };

const KPI_SIZES: readonly TileSize[] = ['S', 'M'];

export const WIDGETS: readonly WidgetMeta[] = [
  { id: 'kpi-urgent', title: 'Επείγοντα', sizes: KPI_SIZES, defaultSize: 'S' },
  { id: 'kpi-followups', title: 'Follow Up σήμερα', sizes: KPI_SIZES, defaultSize: 'S' },
  { id: 'kpi-offers', title: 'Προσφορές', sizes: KPI_SIZES, defaultSize: 'S' },
  { id: 'kpi-signatures', title: 'Υπογραφές', sizes: KPI_SIZES, defaultSize: 'S' },
  { id: 'kpi-new', title: 'Νέα Cases', sizes: KPI_SIZES, defaultSize: 'S' },
  { id: 'tasks', title: 'Σημερινά Tasks', sizes: ['M', 'L', 'XL'], defaultSize: 'M' },
  { id: 'pipeline', title: 'Pipeline', sizes: ['M', 'L', 'XL'], defaultSize: 'M' },
  { id: 'team', title: 'Η ομάδα', sizes: ['M', 'L', 'XL'], defaultSize: 'M', roles: ['admin'] },
  { id: 'ai', title: 'Atlas AI', sizes: ['M', 'L', 'XL'], defaultSize: 'M' },
  { id: 'summary', title: 'Σύνοψη διαχειριστή', sizes: ['L', 'XL'], defaultSize: 'XL', roles: ['admin'] },
];

const BY_ID = new Map<string, WidgetMeta>(WIDGETS.map((w) => [w.id, w]));
export const widgetMeta = (id: string): WidgetMeta | undefined => BY_ID.get(id);

export function widgetsForRole(role: Role): WidgetMeta[] {
  return WIDGETS.filter((w) => !w.roles || w.roles.includes(role));
}

export function defaultLayout(role: Role): LayoutItem[] {
  const teamView = role === 'admin';
  return widgetsForRole(role).map((w) => ({ id: w.id, size: w.id === 'ai' && !teamView ? 'XL' : w.defaultSize }));
}

/** Saved layout (any shape) → the layout to render for this role. Empty/invalid → the role default. */
export function resolveLayout(saved: unknown, role: Role): LayoutItem[] {
  const allowed = new Map(widgetsForRole(role).map((w) => [w.id as string, w]));
  const out: LayoutItem[] = [];
  for (const it of validateLayout(saved)) {
    const meta = allowed.get(it.id);
    if (!meta) continue;
    out.push({ id: it.id, size: meta.sizes.includes(it.size) ? it.size : meta.defaultSize });
  }
  return out.length ? out : defaultLayout(role);
}

export const sameLayout = (a: readonly LayoutItem[], b: readonly LayoutItem[]) => a.length === b.length && a.every((x, i) => x.id === b[i].id && x.size === b[i].size);

/** What to persist: the default is stored as [] so later changes to the default reach people who never customised. */
export const layoutToSave = (layout: LayoutItem[], role: Role): LayoutItem[] => (sameLayout(layout, defaultLayout(role)) ? [] : layout);

export function moveBy(layout: LayoutItem[], id: string, delta: -1 | 1): LayoutItem[] {
  const i = layout.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= layout.length) return layout;
  const next = layout.slice();
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Drag and drop: take `id` and put it where `targetId` is. */
export function moveTo(layout: LayoutItem[], id: string, targetId: string): LayoutItem[] {
  const from = layout.findIndex((x) => x.id === id);
  const to = layout.findIndex((x) => x.id === targetId);
  if (from < 0 || to < 0 || from === to) return layout;
  const next = layout.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function setSize(layout: LayoutItem[], id: string, size: TileSize): LayoutItem[] {
  const meta = widgetMeta(id);
  if (!meta || !meta.sizes.includes(size)) return layout;
  return layout.map((x) => (x.id === id ? { ...x, size } : x));
}

/** The last box cannot be removed (an empty saved layout would mean "default"). */
export function removeWidget(layout: LayoutItem[], id: string): LayoutItem[] {
  return layout.length <= 1 ? layout : layout.filter((x) => x.id !== id);
}

export function addWidget(layout: LayoutItem[], id: string, role: Role): LayoutItem[] {
  const meta = widgetsForRole(role).find((w) => w.id === id);
  if (!meta || layout.some((x) => x.id === id)) return layout;
  return [...layout, { id, size: meta.defaultSize }];
}

export function hiddenWidgets(layout: LayoutItem[], role: Role): WidgetMeta[] {
  const shown = new Set(layout.map((x) => x.id));
  return widgetsForRole(role).filter((w) => !shown.has(w.id));
}
