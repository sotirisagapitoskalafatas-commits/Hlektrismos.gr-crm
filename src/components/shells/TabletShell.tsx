/* ------------------------------------------------------------------ */
/*  TabletShell — mini sidebar (768–1023 px).                          */
/*  Renders ONLY the left sidebar; Header + content live in AppShell.  */
/* ------------------------------------------------------------------ */

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { MATURITY_LABEL, ROLE_COLOR, categoryColor, navForRole, roleLabel, sectionColor } from '@/lib/roles';
import type { NavLeaf, ShellCounts } from '@/lib/roles';
import { Logo, rgbaOf } from '@/lib/ui';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';

function LeafButton({ item, active, badge, color, onClick }: {
  item: NavLeaf; active: boolean; badge?: number; color: string; onClick: () => void;
}) {
  const b = badge ?? 0;
  return (
    <button key={item.key} onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={active ? (item.accent
        ? { background: 'rgba(34,211,238,0.16)', color: '#22d3ee', boxShadow: 'inset 0 0 0 1px rgba(34,211,238,0.3)' }
        : { background: rgbaOf(color, 0.22), color: '#fff', boxShadow: 'inset 2px 0 0 0 ' + color }) : undefined}
      className={`nav-leaf ${active ? (item.accent ? 'nav-atlas-active' : 'nav-active') : item.accent ? 'nav-atlas nav-atlas-pulse' : ''}`}>
      <item.icon className="w-[18px] h-[18px] nav-ico" style={active ? { color: '#fff' } : undefined} aria-hidden="true" />
      <span className="flex-1 text-left truncate">{item.label}</span>
      {item.maturity && <span className={`dot ${MATURITY_LABEL[item.maturity].dot}`} title={MATURITY_LABEL[item.maturity].label} />}
      {b > 0 && <span className="nav-badge" style={{ background: rgbaOf(color, 0.32), color: '#fff' }}>{b > 9 ? '9+' : b}</span>}
      {active && <span className="nav-dot" style={{ background: color }} aria-hidden="true" />}
    </button>
  );
}

interface TabletShellProps {
  counts: ShellCounts;
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
    <aside className={`glass-nav flex flex-col shrink-0 z-20 transition-[width] duration-200 ${collapsed ? 'w-[68px]' : 'w-[220px]'}`}>
      {/* Brand */}
      <div className={`flex items-center gap-2 h-[60px] shrink-0 border-b border-white/10 ${collapsed ? 'justify-center px-0' : 'px-3'}`}>
        <Logo size={collapsed ? 'sm' : 'md'} />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold tracking-tight text-white leading-none font-[var(--font-display)]">ATLAS</div>
            </div>
            <button onClick={toggleCollapsed} aria-label="Σύμπτυξη" className="text-white/45 hover:text-white p-1 rounded-md hover:bg-white/10">
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </>
        )}
        {collapsed && (
          <button onClick={toggleCollapsed} aria-label="Ανάπτυξη" className="text-white/50 hover:text-white p-1 rounded-md hover:bg-white/10">
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
                color={categoryColor(item.page)} badge={item.badge ? counts[item.badge] : 0} onClick={() => go(item.page)} />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map(s => {
              const c = sectionColor(s);
              return (
                <div key={s.id}>
                  <div className="flex items-center gap-1.5 px-2 mb-1">
                    <span className="w-5 h-5 rounded-md inline-flex items-center justify-center" style={{ background: rgbaOf(c, 0.2) }}>
                      <s.icon className="w-3.5 h-3.5" style={{ color: '#fff' }} aria-hidden="true" />
                    </span>
                    <span className="micro text-white/60">{s.label}</span>
                  </div>
                  <div className="space-y-0.5">
                    {s.children.map((item: NavLeaf) => (
                      <LeafButton key={item.key} item={item} active={view.page === item.page}
                        color={c} badge={item.badge ? counts[item.badge] : 0} onClick={() => go(item.page)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </nav>

      {/* User */}
      <div className={`shrink-0 border-t border-white/10 py-3 ${collapsed ? 'flex justify-center' : 'px-3'}`}>
        {collapsed ? (
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold" aria-hidden="true"
            style={{ background: rgbaOf(ROLE_COLOR[role], 0.28), color: '#fff' }}>
            {(profile?.full_name ?? 'Δ').slice(0, 1).toUpperCase()}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
              style={{ background: rgbaOf(ROLE_COLOR[role], 0.28), color: '#fff' }}>
              {(profile?.full_name ?? 'Δ').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">{profile?.full_name ?? 'Χρήστης'}</div>
              <span className="micro text-white/55">{roleLabel(role)}</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}