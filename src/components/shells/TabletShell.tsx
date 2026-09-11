/* ------------------------------------------------------------------ */
/*  TabletShell — mini sidebar (768–1023 px).                          */
/*  Renders ONLY the left sidebar; Header + content live in AppShell.  */
/* ------------------------------------------------------------------ */

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { MATURITY_LABEL, navForRole, roleLabel } from '@/lib/roles';
import type { NavLeaf } from '@/lib/roles';
import { Logo, Micro } from '@/lib/ui';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';

function LeafButton({ item, active, badge, onClick }: {
  item: NavLeaf; active: boolean; badge?: number; onClick: () => void;
}) {
  const b = badge ?? 0;
  return (
    <button key={item.key} onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`nav-leaf ${active ? (item.accent ? 'nav-atlas-active' : 'nav-active') : item.accent ? 'nav-atlas nav-atlas-pulse' : ''}`}>
      <item.icon className="w-[18px] h-[18px] nav-ico" aria-hidden="true" />
      <span className="flex-1 text-left truncate">{item.label}</span>
      {item.maturity && <span className={`dot ${MATURITY_LABEL[item.maturity].dot}`} title={MATURITY_LABEL[item.maturity].label} />}
      {b > 0 && <span className="nav-badge">{b > 9 ? '9+' : b}</span>}
      {active && <span className="nav-dot" aria-hidden="true" />}
    </button>
  );
}

interface TabletShellProps {
  counts: { leads: number; followups: number; backoffice: number };
}

export default function TabletShell({ counts }: TabletShellProps) {
  const { role, profile } = useAuth();
  const { view, go } = useNav();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('atlas.nav.collapsed') === '1');

  const sections = navForRole(role);

  const toggleCollapsed = () => setCollapsed(c => {
    const n = !c;
    localStorage.setItem('atlas.nav.collapsed', n ? '1' : '0');
    return n;
  });

  return (
    <aside className={`glass-nav flex flex-col shrink-0 z-20 transition-[width] duration-200 ${collapsed ? 'w-[68px]' : 'w-56'}`}>
      {/* Brand */}
      <div className={`flex items-center gap-2 h-14 shrink-0 border-b border-ink/5 ${collapsed ? 'justify-center px-0' : 'px-3'}`}>
        <Logo size={collapsed ? 'sm' : 'md'} />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold tracking-tight text-ink leading-none">ATLAS</div>
            </div>
            <button onClick={toggleCollapsed} aria-label="Σύμπτυξη" className="text-ink/35 hover:text-ink p-1 rounded-md hover:bg-ink/5">
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </>
        )}
        {collapsed && (
          <button onClick={toggleCollapsed} aria-label="Ανάπτυξη" className="text-ink/40 hover:text-ink p-1 rounded-md hover:bg-ink/5">
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3" aria-label="Πλοήγηση">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            {sections.flatMap(s => s.children).map((item: NavLeaf) => (
              <LeafButton key={item.key} item={item} active={view.page === item.page}
                badge={item.badge ? counts[item.badge] : 0} onClick={() => go(item.page)} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map(s => (
              <div key={s.id}>
                <div className={`flex items-center gap-1.5 px-2 mb-1 ${s.accent ? 'nav-cat-accent' : 'nav-cat-icon'}`}>
                  <s.icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <Micro>{s.label}</Micro>
                </div>
                <div className="space-y-0.5">
                  {s.children.map((item: NavLeaf) => (
                    <LeafButton key={item.key} item={item} active={view.page === item.page}
                      badge={item.badge ? counts[item.badge] : 0} onClick={() => go(item.page)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* User */}
      <div className={`shrink-0 border-t border-ink/5 py-3 ${collapsed ? 'flex justify-center' : 'px-3'}`}>
        {collapsed ? (
          <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center text-[11px] font-bold">
            {(profile?.full_name ?? 'Δ').slice(0, 1).toUpperCase()}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center text-[11px] font-bold shrink-0">
              {(profile?.full_name ?? 'Δ').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate">{profile?.full_name ?? 'Χρήστης'}</div>
              <Micro>{roleLabel(role)}</Micro>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}