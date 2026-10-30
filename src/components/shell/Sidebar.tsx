// Floating sidebar panel: the items of the current module only (grouped), live badges, «Προσαρμογή CRM» and the
// user card. Three modes: full (232px), compact (icon tiles only, 58px) and strip (a horizontal pill row on phones).
import { ChevronsLeft, ChevronsRight, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import type { ShellCounts } from '@/lib/roles';
import type { AnyPage, ModuleDef, ModuleItem } from './ModuleMap';
import ShellAvatar from './ShellAvatar';

export type SidebarMode = 'full' | 'compact' | 'strip';
const STROKE = 1.6;

interface SidebarProps {
  module: ModuleDef | null;
  page: AnyPage;
  counts: ShellCounts;
  mode: SidebarMode;
  /** Toggles the compact preference (desktop only). */
  onToggleCompact?: () => void;
}

function Item({ item, page, counts, compact, onGo }: { item: ModuleItem; page: AnyPage; counts: ShellCounts; compact: boolean; onGo: (p: ModuleItem['page']) => void }) {
  const active = item.pages.includes(page);
  const n = item.badge ? counts[item.badge] : 0;
  return (
    <button className="shell-item" aria-current={active ? 'page' : undefined} onClick={() => onGo(item.page)}
      title={compact ? item.label : undefined} aria-label={compact ? item.label : undefined}>
      <span className="shell-item__tile"><item.icon className="w-[18px] h-[18px]" strokeWidth={STROKE} aria-hidden="true" /></span>
      <span className="shell-item__text">{item.label}</span>
      {n > 0 && <span className="shell-badge" aria-label={`${n} εκκρεμείς`}>{n > 9 ? '9+' : n}</span>}
    </button>
  );
}

export default function Sidebar({ module, page, counts, mode, onToggleCompact }: SidebarProps) {
  const { profile } = useAuth();
  const { go } = useNav();
  const compact = mode === 'compact';

  return (
    <aside className="shell-sidebar" data-mode={mode} aria-label={module ? `Πλοήγηση: ${module.label}` : 'Πλοήγηση'}>
      <div className="shell-sidebar__head">
        <span className="shell-label">{module?.label}</span>
        {onToggleCompact && (
          <button className="shell-icon !w-8 !h-8" onClick={onToggleCompact}
            title={compact ? 'Ανάπτυξη πλαϊνής μπάρας' : 'Σύμπτυξη πλαϊνής μπάρας'}
            aria-label={compact ? 'Ανάπτυξη πλαϊνής μπάρας' : 'Σύμπτυξη πλαϊνής μπάρας'}>
            {compact ? <ChevronsRight className="w-4 h-4" strokeWidth={STROKE} aria-hidden="true" /> : <ChevronsLeft className="w-4 h-4" strokeWidth={STROKE} aria-hidden="true" />}
          </button>
        )}
      </div>

      <nav className="shell-sidebar__nav" aria-label={module?.label ?? 'Πλοήγηση'}>
        {module?.groups.map((g, i) => (
          <div className="shell-group" key={g.label ?? `g${i}`}>
            {g.label && <div className="shell-label">{g.label}</div>}
            {g.items.map((item) => <Item key={item.key} item={item} page={page} counts={counts} compact={compact} onGo={(p) => go(p)} />)}
          </div>
        ))}
      </nav>

      <div className="shell-sidebar__foot">
        <button className="shell-item" aria-current={page === 'preferences' ? 'page' : undefined} onClick={() => go('preferences')}
          title={compact ? 'Προσαρμογή CRM' : undefined} aria-label={compact ? 'Προσαρμογή CRM' : undefined}>
          <span className="shell-item__tile"><SlidersHorizontal className="w-[18px] h-[18px]" strokeWidth={STROKE} aria-hidden="true" /></span>
          <span className="shell-item__text">Προσαρμογή CRM</span>
        </button>
        <div className="shell-usercard">
          <ShellAvatar name={profile?.full_name} path={profile?.avatar_url} />
          <span className="min-w-0">
            <span className="shell-usercard__name block">{profile?.full_name ?? 'Χρήστης'}</span>
            <span className="shell-usercard__sub block">Σε σύνδεση</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
