import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import {
  BACK_OFFICE_STAGES, MATURITY_LABEL, PAGE_TITLES, ROLES, can,
  findNav, flattenNav, navForRole, roleLabel,
} from '@/lib/roles';
import type { NavLeaf, PageKey, Role } from '@/lib/roles';
import { Btn, IconBtn, Logo, Micro, Modal } from '@/lib/ui';
import {
  AppNotification, Case, fetchCases, fetchFollowUps, fetchLeads,
  fetchNotifications, markNotificationsRead,
} from '@/lib/api';
import {
  Bell, ChevronDown, ChevronsLeft, ChevronsRight, CircleHelp,
  LogOut, Menu, Plus, Search, SlidersHorizontal, UserCircle, X,
} from 'lucide-react';

import HomePage from './HomePage';
import CasesPage from './CasesPage';
import CaseDetailPage from './CaseDetailPage';
import FollowUpsPage from './FollowUpsPage';
import LeadsPage from './LeadsPage';
import PlaceholderPage from './PlaceholderPage';
import MyDayPage from './MyDayPage';
import MapPage from './MapPage';
import BackOfficePage from './BackOfficePage';

/* ---------------- Shell-wide counts (nav badges) ---------------- */
type ShellCounts = { leads: number; followups: number; backoffice: number };

function useShellCounts(): ShellCounts {
  const { role } = useAuth();
  const [counts, setCounts] = useState<ShellCounts>({ leads: 0, followups: 0, backoffice: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [leads, fus, cases] = await Promise.all([fetchLeads(), fetchFollowUps({ status: 'all' }), fetchCases()]);
      if (!alive) return;
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const followups = fus.filter(f => {
        if (f.status === 'completed' || f.status === 'cancelled') return false;
        if (f.status === 'snoozed') return f.snoozed_until ? new Date(f.snoozed_until).getTime() <= endOfToday.getTime() : false;
        return new Date(f.due_at).getTime() <= endOfToday.getTime();
      }).length;
      const backoffice = cases.filter(c => BACK_OFFICE_STAGES.includes(c.current_stage)).length;
      setCounts({ leads: leads.length, followups, backoffice: Math.max(0, backoffice) });
    })();
    return () => { alive = false; };
  }, [role]);

  return counts;
}

function useNotifications() {
  const { role } = useAuth();
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    const list = await fetchNotifications();
    setNotifs(list);
    setUnread(list.filter(n => !n.read_at).length);
  }, []);
  useEffect(() => { load(); }, [load, role]);
  return { notifs, unread, load };
}

/* ---------------- Shared navigation leaf (glass capsule) ---------------- */
function LeafButton({ item, active, compact, badge, onClick }: {
  item: NavLeaf; active: boolean; compact?: boolean; badge?: number; onClick: () => void;
}) {
  const b = badge ?? 0;
  const label = `${item.label}`;
  const cls = [
    'nav-leaf',
    active ? (item.accent ? 'nav-atlas-active' : 'nav-active')
      : item.accent ? 'nav-atlas nav-atlas-pulse' : '',
    compact ? 'justify-center relative' : '',
  ].join(' ');

  return (
    <button key={item.key} onClick={onClick}
      title={compact ? label : label}
      aria-label={compact ? label : undefined}
      aria-current={active ? 'page' : undefined}
      className={cls}>
      <item.icon className={compact ? 'w-[20px] h-[20px]' : 'nav-ico w-[18px] h-[18px]'} aria-hidden="true" />
      {!compact && <span className="flex-1 text-left truncate">{item.label}</span>}
      {!compact && item.maturity && <span className={`dot ${MATURITY_LABEL[item.maturity].dot}`} title={MATURITY_LABEL[item.maturity].label} />}
      {b > 0 && (
        <span className={`nav-badge ${compact ? 'absolute top-0 right-0 translate-x-1/3 -translate-y-1/3 !min-w-4 !h-4 !px-1 text-[8px]' : ''}`}>
          {b > 9 ? '9+' : b}
        </span>
      )}
      {active && <span className="nav-dot" aria-hidden="true" />}
    </button>
  );
}

/* ---------------- Desktop rail ---------------- */
function Rail({ collapsed, onToggle, counts }: {
  collapsed: boolean; onToggle: () => void; counts: ShellCounts;
}) {
  const { role, profile } = useAuth();
  const { view, go } = useNav();
  const sections = navForRole(role);
  const leaves = flattenNav(sections);

  return (
    <aside id="shell-rail" className={`glass-nav hidden lg:flex flex-col shrink-0 z-20 transition-[width] duration-200 ${collapsed ? 'w-[68px]' : 'w-64'}`}>
      <div className={`flex items-center gap-2.5 h-14 shrink-0 border-b border-ink/5 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
        <Logo size={collapsed ? 'sm' : 'md'} />
        {!collapsed && (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold tracking-tight text-ink leading-none">ATLAS CRM</div>
              <div className="micro text-ink/35 mt-1">Ηlektrismos.gr</div>
            </div>
            <button onClick={onToggle} title="Σύμπτυξη sidebar" aria-label="Σύμπτυξη sidebar"
              className="text-ink/35 hover:text-ink p-1 rounded-md hover:bg-ink/5">
              <ChevronsLeft className="w-4 h-4" />
            </button>
          </>
        )}
        {collapsed && (
          <button onClick={onToggle} title="Ανάπτυξη sidebar" aria-label="Ανάπτυξη sidebar"
            className="text-ink/40 hover:text-ink p-1 rounded-md hover:bg-ink/5">
            <ChevronsRight className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4" aria-label="Κύρια πλοήγηση">
        {!collapsed && (
          <div className="space-y-5">
            {sections.map(s => (
              <div key={s.id}>
                <div className={`flex items-center gap-1.5 px-2 mb-1.5 ${s.accent ? 'nav-cat-accent' : 'nav-cat-icon'}`}>
                  <s.icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <Micro>{s.label}</Micro>
                </div>
                <div className="space-y-0.5">
                  {s.children.map(item => (
                    <LeafButton key={item.key} item={item} active={view.page === item.page}
                      badge={item.badge ? counts[item.badge] : 0} onClick={() => go(item.page)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {collapsed && (
          <div className="flex flex-col items-center gap-1">
            {leaves.map(({ item }) => (
              <LeafButton key={item.key} item={item} active={view.page === item.page} compact
                badge={item.badge ? counts[item.badge] : 0} onClick={() => go(item.page)} />
            ))}
          </div>
        )}
      </nav>

      <div className={`shrink-0 border-t border-ink/5 py-3 ${collapsed ? 'flex justify-center px-0' : 'px-4'}`}>
        {collapsed ? (
          <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center text-[11px] font-bold" aria-hidden="true">
            {(profile?.full_name ?? 'Δ').slice(0, 1).toUpperCase()}
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center text-[11px] font-bold shrink-0">
              {(profile?.full_name ?? 'Δ').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate">{profile?.full_name ?? 'Χρήστης'}</div>
              <Micro>{roleLabel(role)}{role !== profile?.role ? ' · sim' : ''}</Micro>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ---------------- Mobile slide-over drawer ---------------- */
function Drawer({ open, onClose, counts }: {
  open: boolean; onClose: () => void; counts: ShellCounts;
}) {
  const { role, profile, setRoleOverride, signOut } = useAuth();
  const { view, go } = useNav();
  const sections = navForRole(role);

  return (
    <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-ink/30 backdrop-blur-[2px] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside className={`glass-drawer absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] flex flex-col transition-transform duration-250 ${open ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Πλοήγηση">
        <div className="flex items-center gap-2.5 h-14 shrink-0 px-4 border-b border-ink/5">
          <Logo size="md" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold tracking-tight text-ink leading-none">ATLAS CRM</div>
            <div className="micro text-ink/35 mt-1">Ηlektrismos.gr</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο μενού" className="text-ink/45 hover:text-ink p-1 rounded-md hover:bg-ink/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Πλοήγηση">
          {sections.map(s => (
            <div key={s.id}>
              <div className={`flex items-center gap-1.5 px-2 mb-1.5 ${s.accent ? 'nav-cat-accent' : 'nav-cat-icon'}`}>
                <s.icon className="w-3.5 h-3.5" aria-hidden="true" />
                <Micro>{s.label}</Micro>
              </div>
              <div className="space-y-0.5">
                {s.children.map(item => (
                  <LeafButton key={item.key} item={item} active={view.page === item.page}
                    badge={item.badge ? counts[item.badge] : 0} onClick={() => { go(item.page); onClose(); }} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-ink/5 px-4 py-4 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center text-[11px] font-bold shrink-0">
              {(profile?.full_name ?? 'Δ').slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-ink truncate">{profile?.full_name ?? 'Χρήστης'}</div>
              <Micro>{roleLabel(role)}{role !== profile?.role ? ' · sim' : ''}</Micro>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select value={role} onChange={e => setRoleOverride(e.target.value as Role)}
              aria-label="Επίδειξη ρόλου (demo)" title="Προσομοίωση ρόλου (demo)"
              className="flex-1 text-[12px] font-medium bg-white border border-line rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:border-brand-500 appearance-none">
              {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <Btn variant="ghost" onClick={() => { signOut(); window.location.hash = '/'; }} className="!px-2">
              <LogOut className="w-3.5 h-3.5" />
            </Btn>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ---------------- Header ---------------- */
function Header({ onOpenPalette, onOpenDrawer, onSignOut }: {
  onOpenPalette: () => void; onOpenDrawer: () => void; onSignOut: () => void;
}) {
  const { role, profile, user, setRoleOverride } = useAuth();
  const { view, openCase } = useNav();
  const { notifs, unread, load } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);

  const sim = role !== profile?.role;
  const nav = findNav(view.page);
  const title = view.page === 'case' ? 'Case' : PAGE_TITLES[view.page] ?? 'ATLAS';
  const crumb = view.page === 'case'
    ? ['Cases', 'Case Detail']
    : nav ? [nav.section.label, nav.item.label] : ['ATLAS'];

  const openNotifs = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) { await markNotificationsRead(); load(); }
  };

  return (
    <header className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-6 h-14 border-b border-line bg-paper/80 backdrop-blur-sm shrink-0 z-30">
      <button className="lg:hidden text-ink/60 hover:text-ink p-1 rounded-md hover:bg-ink/5" onClick={onOpenDrawer} aria-label="Άνοιγμα μενού">
        <Menu className="w-4.5 h-4.5" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="micro text-ink/35 truncate leading-tight">{crumb.join(' / ')}</div>
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold text-ink tracking-tight truncate leading-tight">{title}</h1>
          {sim && <span className="pill bg-warn-100 text-warn-600">sim {roleLabel(role)}</span>}
        </div>
      </div>

      <button onClick={onOpenPalette}
        className="hidden sm:flex items-center gap-2 px-2.5 h-8 rounded-lg border border-line bg-white text-ink/45 hover:text-ink/80 hover:border-ink/30 text-[12px] transition-colors">
        <Search className="w-3.5 h-3.5" />
        <span>Γρήγορη αναζήτηση</span>
        <kbd className="micro bg-ink/5 rounded px-1 py-0.5">⌘K</kbd>
      </button>

      {/* Notifications */}
      <div className="relative">
        <IconBtn title="Ειδοποιήσεις" onClick={openNotifs}>
          <Bell className="w-4 h-4" />
          {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-bad-600" />}
        </IconBtn>
        {notifOpen && (
          <div className="absolute right-0 top-10 w-80 card p-2 shadow-cardlg z-40 animate-fadein">
            <div className="px-2 py-1.5 flex items-center justify-between">
              <Micro>Ειδοποιήσεις</Micro>
              {unread > 0 && <span className="pill bg-brand-600 text-white">{unread}</span>}
            </div>
            <div className="max-h-72 overflow-y-auto mt-1">
              {notifs.length === 0 && (
                <div className="text-center text-xs text-ink/40 py-6">Καμία ειδοποίηση</div>
              )}
              {notifs.map(n => (
                <button key={n.id}
                  onClick={() => { if (n.case_id) openCase(n.case_id); setNotifOpen(false); }}
                  className="w-full text-left px-2 py-2 rounded-lg hover:bg-ink/5 flex gap-2.5 items-start">
                  <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.read_at ? 'bg-ink/15' : 'bg-brand-500'}`} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink leading-tight">{n.title}</span>
                    {n.body && <span className="block text-xs text-ink/50 mt-0.5 truncate">{n.body}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Account menu */}
      <div className="relative pl-2 border-l border-line">
        <button onClick={() => setAcctOpen(o => !o)} aria-label="Λογαριασμός" aria-haspopup="menu"
          className="flex items-center gap-2 rounded-lg hover:bg-ink/5 px-1.5 py-1 transition-colors">
          <span className="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center text-[11px] font-bold">
            {(profile?.full_name ?? 'Δ').slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden md:block text-left">
            <span className="block text-[13px] font-semibold text-ink leading-tight max-w-[140px] truncate">{profile?.full_name ?? 'Χρήστης'}</span>
            <span className="block micro text-ink/40 leading-tight">{roleLabel(role)}{sim ? ' · sim' : ''}</span>
          </span>
          <ChevronDown className="hidden md:block w-3.5 h-3.5 text-ink/40" />
        </button>
        {acctOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setAcctOpen(false)} />
            <div className="absolute right-0 top-full mt-2 w-72 card p-2 shadow-cardlg z-50 animate-fadein" role="menu">
              <div className="flex items-center gap-3 px-2 py-2 border-b border-line mb-1.5">
                <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center text-[14px] font-bold">
                  {(profile?.full_name ?? 'Δ').slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink truncate">{profile?.full_name ?? 'Χρήστης'}</div>
                  <div className="text-xs text-ink/50 truncate">{user?.email ?? ''}</div>
                </div>
              </div>

              <div className="px-2 py-2 flex items-center justify-between gap-2 border-b border-line mb-1">
                <div>
                  <div className="text-[13px] font-medium text-ink">{roleLabel(role)}</div>
                  <div className="micro text-ink/40">{ROLES.find(r => r.id === role)?.hint}</div>
                </div>
                <span className={`pill ${sim ? 'bg-warn-100 text-warn-600' : 'bg-ok-100 text-ok-600'}`}>{sim ? 'sim' : 'πραγματικός'}</span>
              </div>

              <button disabled title="Σύντομα διαθέσιμο" className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] text-ink/70 hover:bg-ink/5 disabled:opacity-50 disabled:cursor-not-allowed">
                <UserCircle className="w-4 h-4 text-ink/40" /> Λογαριασμός
              </button>
              <button disabled title="Σύντομα διαθέσιμο" className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] text-ink/70 hover:bg-ink/5 disabled:opacity-50 disabled:cursor-not-allowed">
                <SlidersHorizontal className="w-4 h-4 text-ink/40" /> Προτιμήσεις
              </button>
              <button disabled title="Σύντομα διαθέσιμο" className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] text-ink/70 hover:bg-ink/5 disabled:opacity-50 disabled:cursor-not-allowed">
                <CircleHelp className="w-4 h-4 text-ink/40" /> Κέντρο βοήθειας
              </button>

              <div className="px-2 py-2 border-t border-line mt-1.5">
                <div className="micro text-ink/40 mb-1.5">Επίδειξη ρόλου (demo)</div>
                <select value={role} onChange={e => setRoleOverride(e.target.value as Role)}
                  aria-label="Επίδειξη ρόλου"
                  className="w-full text-[13px] font-medium bg-white border border-line rounded-lg px-2 py-1.5 text-ink focus:outline-none focus:border-brand-500 appearance-none">
                  {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
                <p className="text-[11px] text-ink/40 mt-1.5">Ο φυσικός ρόλος προέρχεται από τον λογαριασμό σας. Η προσομοίωση είναι προσωρινή, μόνο για επίδειξη.</p>
              </div>

              <Btn variant="danger" onClick={onSignOut} className="w-full justify-center mt-1">
                <LogOut className="w-3.5 h-3.5" /> Αποσύνδεση
              </Btn>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

/* ---------------- ⌘K palette + global search ---------------- */
function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role } = useAuth();
  const { go, openCase } = useNav();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Case[]>([]);

  const items = flattenNav(navForRole(role));
  const hay = q.toLowerCase().trim();

  useEffect(() => { if (open) { setQ(''); setHits([]); } }, [open]);

  useEffect(() => {
    if (!open) return;
    if (hay.length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      setHits((await fetchCases({ search: hay })).slice(0, 5));
    }, 180);
    return () => clearTimeout(t);
  }, [hay, open]);

  const modules = items.filter(i => !hay || i.item.label.toLowerCase().includes(hay) || i.item.key.includes(hay));
  const canCreate = can(role, 'create_case');

  return (
    <Modal open={open} onClose={onClose} title="Command Center" micro={`⌘K — Search`}>
      <div className="flex items-center gap-2 border border-line rounded-lg px-3 py-2 bg-paper/60">
        <Search className="w-4 h-4 text-ink/40" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink/35"
          placeholder="Πληκτρολογήστε για να πλοηγηθείτε ή αναζητήστε case…" />
        <button onClick={onClose} className="text-ink/40 hover:text-ink"><X className="w-4 h-4" /></button>
      </div>

      <div className="mt-3 max-h-80 overflow-y-auto -mx-1">
        {!hay && canCreate && (
          <>
            <button onClick={() => { go('cases'); onClose(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-ink/5 text-[13px] text-ink/80">
              <Plus className="w-4 h-4 text-ink/40" /> <span className="font-medium">Νέο Case</span>
            </button>
            <div className="micro text-ink/30 px-3 pt-2 pb-1">Μονάδες</div>
          </>
        )}

        {modules.length > 0 && modules.map(({ item }) => (
          <button key={item.key} onClick={() => { go(item.page); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-ink/5 text-[13px] text-ink/80">
            <item.icon className="w-4 h-4 text-ink/40" /> <span className="font-medium">{item.label}</span>
          </button>
        ))}

        {hay.length >= 2 && (
          <>
            <div className="micro text-ink/30 px-3 pt-3 pb-1">Cases</div>
            {hits.map(c => (
              <button key={c.id} onClick={() => { openCase(c.id); onClose(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-ink/5 text-[13px] text-ink/80">
                <span className="font-mono text-[11px] text-ink/45 w-20 truncate">{c.case_no}</span>
                <span className="font-medium truncate">{c.customer?.full_name ?? c.title}</span>
              </button>
            ))}
            {hits.length === 0 && <div className="px-3 py-2 text-xs text-ink/40">Κανένα case δεν ταιριάζει.</div>}
          </>
        )}

        {!hay && modules.length === 0 && <div className="text-center text-xs text-ink/40 py-4">Δεν υπάρχουν διαθέσιμες ενότητες για τον ρόλο σας.</div>}
      </div>
    </Modal>
  );
}

/* ---------------- Shell ---------------- */
const PLACEHOLDERS: Record<string, { page: PageKey; kind: string }> = {
  customers: { page: 'customers', kind: 'customers' },
  providers: { page: 'providers', kind: 'providers' },
  reports: { page: 'reports', kind: 'reports' },
  admin: { page: 'admin', kind: 'admin' },
};

export default function AppShell() {
  const { signOut } = useAuth();
  const { view } = useNav();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('atlas.nav.collapsed') === '1');
  const [drawer, setDrawer] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const counts = useShellCounts();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
      if (e.key === 'Escape') { setPaletteOpen(false); setDrawer(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawer ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [drawer]);

  const toggleCollapsed = () => setCollapsed(c => {
    const n = !c;
    localStorage.setItem('atlas.nav.collapsed', n ? '1' : '0');
    return n;
  });

  const onSignOut = () => { signOut(); window.location.hash = '/'; };

  const body = (() => {
    switch (view.page) {
      case 'home': return <HomePage />;
      case 'cases': return <CasesPage />;
      case 'case': return <CaseDetailPage caseId={view.caseId!} />;
      case 'followups': return <FollowUpsPage />;
      case 'leads': return <LeadsPage />;
      case 'myday': return <MyDayPage />;
      case 'map': return <MapPage />;
      case 'backoffice': return <BackOfficePage />;
      default: {
        const ph = PLACEHOLDERS[view.page];
        return ph ? <PlaceholderPage kind={ph.kind} /> : <HomePage />;
      }
    }
  })();

  return (
    <div className="relative min-h-screen bg-paper text-ink flex">
      <div className="shell-backdrop" aria-hidden="true" />
      <Rail collapsed={collapsed} onToggle={toggleCollapsed} counts={counts} />
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <Header onOpenPalette={() => setPaletteOpen(true)} onOpenDrawer={() => setDrawer(true)} onSignOut={onSignOut} />
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
          <div key={view.page === 'case' ? `case-${view.caseId}` : view.page} className="animate-fadein">
            {body}
          </div>
        </main>
      </div>
      <Drawer open={drawer} onClose={() => setDrawer(false)} counts={counts} />
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}