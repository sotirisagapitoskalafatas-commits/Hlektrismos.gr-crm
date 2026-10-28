// Role-aware grouping of the existing navigation into the five top-bar modules (docs: simplified navigation map).
// Nothing here decides who may see a page: everything is derived from navForRole(role), so a module or item a role
// could not see before can never appear. Every page stays reachable; pages that are not sidebar items are hosted
// by another item (Follow-ups inside «Η εργασία μου», «Λειτουργία Πεδίου» inside «Ημέρα μου»).
import type { ComponentType } from 'react';
import { navForRole } from '@/lib/roles';
import type { NavBadge, NavLeaf, PageKey, Role } from '@/lib/roles';

export type ModuleId = 'home' | 'crm' | 'field' | 'analytics' | 'ai';
export type AnyPage = PageKey | 'case';
/** The nav icons are lucide icons; this is the part of their props the shell uses. */
export type NavIcon = ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;

export interface ModuleItem {
  key: string;
  label: string;
  icon: NavIcon;
  /** Where a click goes. */
  page: PageKey;
  /** Pages for which this item is highlighted (its own page plus the pages it hosts). */
  pages: AnyPage[];
  badge?: NavBadge;
  accent?: boolean;
}
export interface ModuleGroup { label?: string; items: ModuleItem[] }
export interface ModuleDef { id: ModuleId | 'settings'; label: string; groups: ModuleGroup[] }

interface LayoutGroup { label?: string; keys: string[] }
interface LayoutModule { id: ModuleId | 'settings'; label: string; groups: LayoutGroup[] }

// leaf keys are the `key` fields of NAV_SECTIONS in lib/roles.ts
const LAYOUT: LayoutModule[] = [
  { id: 'home', label: 'Αρχική', groups: [{ keys: ['dashboard', 'mywork'] }] },
  { id: 'crm', label: 'CRM', groups: [
    { label: 'Πελάτες', keys: ['leads', 'customers'] },
    { label: 'Δουλειά', keys: ['cases', 'backoffice'] },
    { label: 'Κατάλογος', keys: ['providers', 'prospecting'] },
  ] },
  { id: 'field', label: 'Πεδίο', groups: [{ keys: ['myday', 'map'] }] },
  { id: 'analytics', label: 'Ανάλυση', groups: [{ keys: ['reports', 'revenue'] }] },
  { id: 'ai', label: 'Atlas AI', groups: [{ keys: ['automations', 'aiworkforce'] }] },
];

const SETTINGS_LAYOUT: LayoutModule = {
  id: 'settings', label: 'Ο λογαριασμός μου', groups: [
    { keys: ['account', 'preferences'] },
    { label: 'Μόνο για διαχειριστές', keys: ['settings'] },
  ],
};

/** Leaves that are not sidebar items, and the item that hosts them (the page must stay reachable through it). */
export const HOSTED: Record<string, string> = { followups: 'mywork', fieldmode: 'myday' };

const LABEL_OVERRIDE: Record<string, string> = { account: 'Προφίλ & λογαριασμός', preferences: 'Εμφάνιση & προτιμήσεις', settings: 'Διαχείριση' };
const BADGE_OVERRIDE: Record<string, NavBadge> = { mywork: 'followups' }; // Η εργασία μου: follow-ups due
const EXTRA_PAGES: Record<string, AnyPage[]> = {
  mywork: ['followups'], myday: ['field'], cases: ['case'],
};

function build(layout: LayoutModule, leaves: Map<string, NavLeaf>): ModuleDef | null {
  const groups = layout.groups
    .map((g): ModuleGroup => ({
      label: g.label,
      items: g.keys.flatMap((k) => {
        const leaf = leaves.get(k);
        if (!leaf) return [];
        return [{
          key: leaf.key, label: LABEL_OVERRIDE[leaf.key] ?? leaf.label, icon: leaf.icon, page: leaf.page,
          pages: [leaf.page, ...(EXTRA_PAGES[leaf.key] ?? [])], badge: BADGE_OVERRIDE[leaf.key] ?? leaf.badge, accent: leaf.accent,
        } satisfies ModuleItem];
      }),
    }))
    .filter((g) => g.items.length > 0);
  return groups.length ? { id: layout.id, label: layout.label, groups } : null;
}

function leafMap(role: Role): Map<string, NavLeaf> {
  return new Map(navForRole(role).flatMap((s) => s.children).map((l) => [l.key, l]));
}

/** The modules this role may see, in top-bar order. A module with no allowed page is not returned. */
export function modulesForRole(role: Role): ModuleDef[] {
  const leaves = leafMap(role);
  return LAYOUT.map((m) => build(m, leaves)).filter((m): m is ModuleDef => m !== null);
}

/** «Ο λογαριασμός μου» sidebar (profile, appearance, and the admin area for roles that have it), or null. */
export function settingsModule(role: Role): ModuleDef | null {
  return build(SETTINGS_LAYOUT, leafMap(role));
}

export const flatItems = (m: ModuleDef): ModuleItem[] => m.groups.flatMap((g) => g.items);

/** The first page a module link opens. */
export const firstPage = (m: ModuleDef): PageKey => flatItems(m)[0].page;

/** Which module (or the settings area) a page belongs to; null when the role has no item for it. */
export function moduleOfPage(page: AnyPage, modules: ModuleDef[], settings: ModuleDef | null): ModuleDef | null {
  for (const m of [...modules, ...(settings ? [settings] : [])]) {
    if (flatItems(m).some((i) => i.pages.includes(page))) return m;
  }
  return null;
}

/** Item highlighted for a page inside a module. */
export const activeItem = (m: ModuleDef | null, page: AnyPage): ModuleItem | undefined =>
  m ? flatItems(m).find((i) => i.pages.includes(page)) : undefined;
