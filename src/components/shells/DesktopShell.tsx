/* ------------------------------------------------------------------ */
/*  DesktopShell — full desktop rail (≥ 1024 px).                      */
/*  Renders ONLY the left sidebar; Header + content live in AppShell.  */
/* ------------------------------------------------------------------ */

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { MATURITY_LABEL, categoryColor, navForRole, roleLabel, sectionColor } from '@/lib/roles';
import type { NavLeaf } from '@/lib/roles';
import { Logo, Micro, rgbaOf } from '@/lib/ui';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';

function LeafButton({ item, active, compact, badge, color, onClick }: {
  item: NavLeaf; active: boolean; compact?: boolean; badge?: number; color: string; onClick: () => void;
}) {
  const b = badge ?? 0;
  const label = item.label;
  const cls = [
    'nav-leaf',
    active ? (item.accent ? 'nav-atlas-active' : 'nav-active') : item.accent ? 'nav-atlas nav-atlas-pulse' : '',
    compact ? 'justify-center relative' : '',
  ].join(' ');

  const activeStyle: React.CSSProperties = item.accent
    ? { background: rgbaOf('#0e7490', 0.14), color: '#0e7490', boxShadow: 'inset 0 0 0 1px rgba(8,145,178,0.3)' }
    : { background: rgbaOf(color, 0.16), color, boxShadow: 'inset 2px 0 0 0 ' + color };

  return (
    <button key={item.key} onClick={onClick}
      title={label}
      aria-label={compact ? label : undefined}
      aria-current={active ? 'page' : undefined}
      style={active ? activeStyle : undefined}
      className={cls}>
      <item.icon className={compact ? 'w-[20px] h-[20px]' : 'nav-ico w-[18px] h-[18px]'}
        style={active ? { color } : undefined} aria-hidden="true" />
      {!compact && <span className="flex-1 text-left truncate">{label}</span>}
      {!compact && item.maturity && <span className={`dot ${MATURITY_LABEL[item.maturity].dot}`} title={MATURITY_LABEL[item.maturity].label} />}
      {b > 0 && (
        <span className={`nav-badge ${compact ? 'absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 !min-w-4 !h-4 !px-1 text-[8px]' : ''}`}
          style={{ background: rgbaOf(color, 0.14), color }}>
          {b > 9 ? '9+' : b}
        </span>
      )}
      {active && <span className="nav-dot" style={{ background: color }} aria-hidden="true" />}
    </button>
  );
}

interface DesktopShellProps {
  counts: { leads: number; followups: number; backoffice: number };
}

export default function DesktopShell({ counts }: DesktopShellProps) {
  const { role, profile } = useAuth();
  const { view, go } = useNav();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('atlas.nav.collapsed') === '1');

  useEffectCollapsedSync(setCollapsed);

  const sections = navForRole(role);
  const leaves = sections.flatMap(s => s.children);

  const toggleCollapsed = () => setCollapsed(c => {
    const n = !c;
    localStorage.setItem('atlas.nav.collapsed', n ? '1' : '0');
    return n;
  });

  return (
    <aside id="shell-rail" className={`glass-nav hidden lg:flex flex-col shrink-0 z-20 transition-[width] duration-200 ${collapsed ? 'w-[68px]' : 'w-[246px]'}`}>
      {/* Brand */}
      <div className={`flex items-center gap-2.5 h-[60px] shrink-0 border-b border-ink/[0.06] sticky top-0 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
        <Logo size={collapsed ? 'sm' : 'md'} />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold tracking-tight text-ink leading-none font-[var(--font-display)]">ATLAS CRM</div>
              <div className="micro text-ink/35 mt-1">Ηlektrismos.gr</div>
            </div>
            <button onClick={toggleCollapsed} title="Σύμπτυξη sidebar" aria-label="Σύμπτυξη sidebar"
              className="text-ink/35 hover:text-ink p-1 rounded-md hover:bg-ink/5">
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </>
        )}
        {collapsed && (
          <button onClick={toggleCollapsed} title="Ανάπτυξη sidebar" aria-label="Ανάπτυξη sidebar"
            className="text-ink/40 hover:text-ink p-1 rounded-md hover:bg-ink/5">
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4" aria-label="Κύρια πλοήγηση">
        {!collapsed ? (
          <div className="space-y-5">
            {sections.map(s => {
              const c = sectionColor(s);
              return (
                <div key={s.id}>
                  <div className="flex items-center gap-1.5 px-2 mb-1.5">
                    <span className="w-5 h-5 rounded-md inline-flex items-center justify-center" style={{ background: rgbaOf(c, 0.12) }}>
                      <s.icon className="w-3.5 h-3.5" style={{ color: c }} aria-hidden="true" />
                    </span>
                    <span className="micro" style={{ color: c }}>{s.label}</span>
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
        ) : (
          <div className="flex flex-col items-center gap-1">
            {leaves.map((item: NavLeaf) => (
              <LeafButton key={item.key} item={item} active={view.page === item.page} compact
                color={categoryColor(item.page)} badge={item.badge ? counts[item.badge] : 0} onClick={() => go(item.page)} />
            ))}
          </div>
        )}
      </nav>

      {/* User footer */}
      <div className={`shrink-0 border-t border-ink/[0.06] py-3 ${collapsed ? 'flex justify-center px-0' : 'px-4'}`}>
        {collapsed ? (
          <div className="w-8 h-8 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center text-[11px] font-bold" aria-hidden="true">
            {(profile?.full_name ?? 'Δ').slice(0, 1).toUpperCase()}
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-500/10 text-brand-500 flex items-center justify-center text-[11px] font-bold shrink-0">
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

function useEffectCollapsedSync(set: (v: boolean) => void) {
  useEffect(() => {
    const onPrefs = () => set(localStorage.getItem('atlas.nav.collapsed') === '1');
    window.addEventListener('atlas:prefs', onPrefs);
    return () => window.removeEventListener('atlas:prefs', onPrefs);
  }, [set]);
}