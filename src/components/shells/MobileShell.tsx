/* ------------------------------------------------------------------ */
/*  MobileShell — bottom tab bar + field quick actions (< 768 px).     */
/*  Renders ONLY fixed overlay chrome; content lives in AppShell.      */
/*  "Περισσότερα" tab calls onMore → AppShell opens shared drawer.     */
/* ------------------------------------------------------------------ */

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import type { PageKey } from '@/lib/roles';
import {
  Briefcase, Compass, Home, Map, MoreHorizontal, Plus, Route, X,
} from 'lucide-react';

type Counts = { leads: number; followups: number; backoffice: number };

const TABS: { page: PageKey; label: string; icon: typeof Home; badge?: keyof Counts }[] = [
  { page: 'home',      label: 'Αρχική',     icon: Home },
  { page: 'cases',     label: 'Cases',      icon: Briefcase },
  { page: 'myday',     label: 'Ημέρα μου',  icon: Compass, badge: 'followups' },
  { page: 'map',       label: 'Χάρτης',     icon: Map },
];

function BottomTabBar({ current, counts, onMore }: {
  current: string; counts: Counts; onMore: () => void;
}) {
  const { go } = useNav();

  return (
    <nav aria-label="Γρήγορη πλοήγηση"
      className="fixed inset-x-0 bottom-0 z-40 bg-white/90 backdrop-blur-xl backdrop-saturate-150 border-t border-ink/[0.08]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="grid grid-cols-5">
        {TABS.map(t => {
          const active = current === t.page;
          const b = t.badge ? counts[t.badge] : 0;
          return (
            <button key={t.page} onClick={() => go(t.page)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[10px] font-medium transition-colors ${active ? 'text-brand-500' : 'text-ink/45'}`}>
              <span className="relative">
                <t.icon className="w-5 h-5" />
                {b > 0 && (
                  <span className="absolute -top-1 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-bad-600 text-white text-[9px] font-semibold flex items-center justify-center">
                    {b > 9 ? '9+' : b}
                  </span>
                )}
              </span>
              {t.label}
            </button>
          );
        })}
        <button onClick={onMore} aria-label="Περισσότερα"
          className="flex flex-col items-center justify-center gap-0.5 min-h-[56px] text-[10px] font-medium text-ink/45 transition-colors">
          <MoreHorizontal className="w-5 h-5" />
          Περισσότερα
        </button>
      </div>
    </nav>
  );
}

function FieldQuickActions({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { go } = useNav();
  const actions = [
    { label: 'Ημέρα μου',    sub: 'πρόγραμμα & check-in', icon: Compass,    run: () => go('myday') },
    { label: 'Χάρτης',       sub: 'cases & επισκέψεις',   icon: Map,        run: () => go('map') },
    { label: 'Δρομολόγιο',   sub: 'βέλτιστη σειρά',       icon: Route,      run: () => go('map', { focus: 'route' }) },
    { label: 'Όλες οι εργασίες', sub: 'cases & follow ups', icon: Briefcase, run: () => go('cases') },
  ];

  return (
    <div aria-hidden={!open}>
      <button onClick={onToggle} aria-expanded={open}
        aria-label={open ? 'Κλείσιμο γρήγορων ενεργειών' : 'Γρήγορες ενέργειες'}
        className="fixed right-4 z-50 w-[52px] h-[52px] rounded-full bg-gradient-to-br from-brand-500 to-cyan-600 text-white shadow-[0_10px_26px_rgba(0,102,204,0.4)] flex items-center justify-center active:scale-95 transition-transform"
        style={{ bottom: 'calc(env(safe-area-inset-bottom) + 84px)' }}>
        {open ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </button>

      <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`}>
        <div className={`absolute inset-0 bg-ink/30 backdrop-blur-[2px] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onToggle} />
        <div role="dialog" aria-modal="true" aria-label="Γρήγορες ενέργειες"
          className="absolute inset-x-0 bottom-0 z-10 max-w-lg mx-auto bg-paper rounded-t-3xl border-t border-line shadow-cardlg transition-transform duration-250"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)', transform: open ? 'translateY(0)' : 'translateY(100%)' }}>
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div>
              <div className="text-[15px] font-semibold text-ink">Γρήγορες ενέργειες</div>
              <div className="micro text-ink/40">Field Sales</div>
            </div>
            <button onClick={onToggle} aria-label="Κλείσιμο"
              className="w-9 h-9 rounded-full bg-ink/5 flex items-center justify-center text-ink/60 hover:bg-ink/10">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-5 pt-1 pb-6 grid grid-cols-2 gap-3">
            {actions.map(a => (
              <button key={a.label} onClick={() => { a.run(); onToggle(); }}
                className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left min-h-[64px] active:scale-[0.99]">
                <span className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
                  <a.icon className="w-5 h-5 text-brand-600" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-ink leading-tight">{a.label}</span>
                  <span className="block text-[11px] text-ink/45 truncate">{a.sub}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface MobileShellProps {
  current: string;
  counts: Counts;
  onMore: () => void;
}

export default function MobileShell({ current, counts, onMore }: MobileShellProps) {
  const { role } = useAuth();
  const [sheet, setSheet] = useState(false);

  return (
    <>
      <BottomTabBar current={current} counts={counts} onMore={onMore} />
      {role === 'field_sales' && (
        <FieldQuickActions open={sheet} onToggle={() => setSheet(s => !s)} />
      )}
    </>
  );
}