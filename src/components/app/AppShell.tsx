import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useDeviceContext } from '@/lib/device-context';
import { useNav } from '@/lib/nav';
import { usePwaInstall, isStandalone, cacheAppShell } from '@/lib/pwa';
import {
  BACK_OFFICE_STAGES, MATURITY_LABEL, PAGE_TITLES, ROLE_COLOR, ROLES, can,
  findNav, flattenNav, navForRole, roleLabel, sectionColor,
} from '@/lib/roles';
import type { NavLeaf } from '@/lib/roles';
import { Btn, IconBtn, Logo, Micro, Modal, Spinner, rgbaOf, timeUntil } from '@/lib/ui';
import {
  AppNotification, Case, fetchCases, fetchFollowUps, fetchLeads,
  fetchNotifications, markNotificationsRead,
} from '@/lib/api';
import {
  Bell, ChevronDown, ChevronRight, CircleHelp, Download, LogOut, Menu, Plus, Search,
  SlidersHorizontal, UserCircle, X,
} from 'lucide-react';
import MobileShell from '@/components/shells/MobileShell';
import TabletShell from '@/components/shells/TabletShell';
import DesktopShell from '@/components/shells/DesktopShell';
import QuickAdd from './QuickAdd';
import RoleSwitcher from './RoleSwitcher';

import HomePage from './HomePage';
import CasesPage from './CasesPage';
import CaseDetailPage from './CaseDetailPage';
import FollowUpsPage from './FollowUpsPage';
import LeadsPage from './LeadsPage';

const MyWorkPage = lazy(() => import('./MyWorkPage'));
const ProspectingPage = lazy(() => import('./ProspectingPage'));
const RevenuePage = lazy(() => import('./RevenuePage'));

const CustomersPage = lazy(() => import('./CustomersPage'));
const ReportsPage = lazy(() => import('./ReportsPage'));
const AccountPage = lazy(() => import('./AccountPage'));
const PreferencesPage = lazy(() => import('./PreferencesPage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const MyDayPage = lazy(() => import('./MyDayPage'));
const MapPage = lazy(() => import('./MapPage'));
const BackOfficePage = lazy(() => import('./BackOfficePage'));
const FieldModePage = lazy(() => import('@/components/field-sales/FieldModePage'));

/* NOTE: Rail, Drawer, MobileTabBar, MobileQuickActions are now in
   DesktopShell, MobileShell respectively.  Header + Palette remain
   here as shared chrome across all shells. */

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

/* Notification type chips (CRM Shell Redesign) */
const NOTIF_TYPE: Record<string, { label: string; color: string }> = {
  followup: { label: 'Follow Up', color: '#0066cc' },
  visit: { label: 'Επίσκεψη', color: '#b45309' },
  document: { label: 'Έγγραφο', color: '#7c3aed' },
};
function notifMeta(type: string) {
  return NOTIF_TYPE[type] ?? { label: 'Σύστημα', color: '#0e7490' };
}

/* ---------------- Mobile slide-over drawer (shared "more" menu) ---------------- */
function Drawer({ open, onClose }: {
  open: boolean; onClose: () => void;
}) {
  const { role, profile, signOut } = useAuth();
  const { view, go } = useNav();
  const sections = navForRole(role);

  return (
    <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-ink/30 backdrop-blur-[2px] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside className={`glass-drawer absolute left-0 top-0 bottom-0 w-72 max-w-[85vw] flex flex-col transition-transform duration-250 ${open ? 'translate-x-0' : '-translate-x-full'}`} aria-label="Πλοήγηση">
        <div className="flex items-center gap-2.5 h-[60px] shrink-0 px-4 border-b border-ink/[0.06]">
          <Logo size="md" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold tracking-tight text-ink leading-none font-[var(--font-display)]">ATLAS CRM</div>
            <div className="micro text-ink/35 mt-1">Ηlektrismos.gr</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο μενού" className="text-ink/45 hover:text-ink p-1 rounded-md hover:bg-ink/5">
            <X className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Πλοήγηση">
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
                    <button key={item.key} onClick={() => { go(item.page); onClose(); }}
                      style={view.page === item.page ? (item.accent
                        ? { background: 'rgba(8,145,178,0.14)', color: '#0e7490', boxShadow: 'inset 0 0 0 1px rgba(8,145,178,0.3)' }
                        : { background: rgbaOf(c, 0.16), color: c, boxShadow: `inset 2px 0 0 0 ${c}` }) : undefined}
                      className={`nav-leaf w-full ${view.page === item.page ? (item.accent ? 'nav-atlas-active' : 'nav-active') : item.accent ? 'nav-atlas nav-atlas-pulse' : ''}`}>
                      <item.icon className="w-[18px] h-[18px] nav-ico" style={view.page === item.page ? { color: c } : undefined} aria-hidden="true" />
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      {item.maturity && <span className={`dot ${MATURITY_LABEL[item.maturity].dot}`} title={MATURITY_LABEL[item.maturity].label} />}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
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
            <RoleSwitcher />
            <Btn variant="danger" onClick={() => { signOut(); window.location.hash = '/'; onClose(); }} className="w-full justify-center">
              <LogOut className="w-3.5 h-3.5" /> Αποσύνδεση
            </Btn>
          </div>
      </aside>
    </div>
  );
}

/* ---------------- Header (shared across shells) ---------------- */
function Header({ onOpenPalette, onOpenDrawer, onSignOut }: {
  onOpenPalette: () => void; onOpenDrawer: () => void; onSignOut: () => void;
}) {
  const { role, profile, user } = useAuth();
  const { view, openCase, go } = useNav();
  const { notifs, unread, load } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const [acctOpen, setAcctOpen] = useState(false);
  const { canInstall, install } = usePwaInstall();
  const showInstall = canInstall && !isStandalone();

  const sim = role !== profile?.role;
  const nav = findNav(view.page);
  const title = view.page === 'case' ? 'Case' : PAGE_TITLES[view.page] ?? 'ATLAS';
  const crumb = view.page === 'case'
    ? ['Cases', 'Case Detail']
    : nav ? [nav.section.label, nav.item.label] : ['ATLAS'];

  const navCat = view.page === 'case' ? '#0066cc' : nav ? sectionColor(nav.section) : '#475569';

  const openNotifs = async () => {
    const next = !notifOpen;
    setNotifOpen(next);
    if (next) { await markNotificationsRead(); load(); }
  };

  return (
    <header className="flex items-center gap-2.5 sm:gap-3 px-3 sm:px-6 h-[60px] border-b border-ink/[0.06] bg-white/70 backdrop-blur-xl backdrop-saturate-150 shrink-0 z-30 [box-shadow:0_2px_16px_rgba(15,23,42,0.05)]">
      <button className="lg:hidden text-ink/60 hover:text-ink p-1 rounded-md hover:bg-ink/5" onClick={onOpenDrawer} aria-label="Άνοιγμα μενού">
        <Menu className="w-4.5 h-4.5" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="micro truncate leading-tight inline-flex items-center gap-1">
          {crumb.map((c, i) => (
            <span key={`${view.page}-${i}`} className="inline-flex items-center gap-1">
              <span style={i === 0 ? { color: navCat } : undefined} className={i === 0 ? 'font-semibold' : 'text-ink/55'}>{c}</span>
              {i < crumb.length - 1 && <ChevronRight className="w-3 h-3 text-ink/25" aria-hidden="true" />}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <h1 className="text-[17px] font-bold text-ink tracking-tight truncate leading-tight font-[var(--font-display)]">{title}</h1>
          {sim && <span className="pill text-[11px]" style={{ background: rgbaOf(ROLE_COLOR[role], 0.12), color: ROLE_COLOR[role] }}>sim {roleLabel(role)}</span>}
        </div>
      </div>

      <button onClick={onOpenPalette}
        className="flex items-center gap-2 h-9 px-3 rounded-[10px] bg-ink/[0.045] text-ink/45 hover:text-ink/75 hover:bg-ink/[0.07] text-[13px] transition-colors w-[280px] max-w-[38vw]">
        <Search className="w-4 h-4 shrink-0" />
        <span className="flex-1 text-left truncate">Αναζήτηση…</span>
        <kbd className="micro bg-white/70 text-ink/40 rounded px-1.5 py-0.5 border border-ink/10">⌘K</kbd>
      </button>

      <QuickAdd />

      {showInstall && (
        <button onClick={() => void install()}
          title="Εγκατάσταση εφαρμογής στον υπολογιστή σας"
          className="flex items-center gap-1.5 h-9 px-2.5 rounded-[9px] bg-ink/[0.05] text-ink/70 text-[12px] font-medium hover:bg-ink/[0.09] transition-colors">
          <Download className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Εγκατάσταση</span>
        </button>
      )}

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
              {notifs.map(n => {
                const m = notifMeta(n.type);
                return (
                  <button key={n.id}
                    onClick={() => { if (n.case_id) openCase(n.case_id); setNotifOpen(false); }}
                    className="w-full text-left px-2 py-2 rounded-lg hover:bg-ink/5">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="min-w-[6px] w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: n.read_at ? 'rgba(15,23,42,0.15)' : m.color }} />
                      <span className="pill !px-1.5 !py-0 !text-[10px]"
                        style={{ background: rgbaOf(m.color, 0.12), color: m.color }}>
                        {m.label}
                      </span>
                      <span className="ml-auto micro text-ink/35 whitespace-nowrap">{timeUntil(n.created_at)}</span>
                    </div>
                    <span className="block text-[13px] font-medium text-ink leading-tight">{n.title}</span>
                    {n.body && <span className="block text-xs text-ink/50 truncate">{n.body}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Account menu */}
      <div className="relative pl-1.5">
        <button onClick={() => setAcctOpen(o => !o)} aria-label="Λογαριασμός" aria-haspopup="menu"
          className="flex items-center gap-2 rounded-full bg-ink/[0.045] hover:bg-ink/[0.08] pl-1 pr-2 py-1 transition-colors">
          <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold"
            style={{ background: rgbaOf(ROLE_COLOR[role], 0.14), color: ROLE_COLOR[role] }}>
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

              <button onClick={() => { go('account'); setAcctOpen(false); }}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] text-ink/70 hover:bg-ink/5">
                <UserCircle className="w-4 h-4 text-ink/40" /> Λογαριασμός
              </button>
              <button onClick={() => { go('preferences'); setAcctOpen(false); }}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] text-ink/70 hover:bg-ink/5">
                <SlidersHorizontal className="w-4 h-4 text-ink/40" /> Προτιμήσεις
              </button>
              <button onClick={() => { setAcctOpen(false); window.location.hash = '/faq'; }}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-[13px] text-ink/70 hover:bg-ink/5">
                <CircleHelp className="w-4 h-4 text-ink/40" /> Κέντρο βοήθειας
              </button>

              <div className="px-2 py-2 border-t border-line mt-1.5">
                <RoleSwitcher />
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

export default function AppShell() {
  const { signOut, role } = useAuth();
  const { view } = useNav();
  const { device } = useDeviceContext();
  const isMobile = device === 'PHONE';
  const isTablet = device === 'TABLET';
  const isDesktop = device === 'DESKTOP';
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

  useEffect(() => { void cacheAppShell(); }, []);

  const onSignOut = () => { signOut(); window.location.hash = '/'; };

  const body = (() => {
    switch (view.page) {
      case 'home': return <HomePage />;
      case 'mywork': return <MyWorkPage />;
      case 'cases': return <CasesPage />;
      case 'case': return <CaseDetailPage caseId={view.caseId!} />;
      case 'followups': return <FollowUpsPage />;
      case 'leads': return <LeadsPage />;
      case 'prospecting': return <ProspectingPage />;
      case 'myday': return <MyDayPage />;
      case 'field': return can(role, 'check_in') ? <FieldModePage /> : <HomePage />;
      case 'map': return <MapPage />;
      case 'backoffice': return <BackOfficePage />;
      case 'customers': return <CustomersPage />;
      case 'reports': return <ReportsPage />;
      case 'revenue': return <RevenuePage />;
      case 'account': return <AccountPage />;
      case 'preferences': return <PreferencesPage />;
      case 'admin': return <SettingsPage />;
      default: return <HomePage />;
    }
  })();

  return (
    <div className="relative min-h-screen bg-paper text-ink flex">
      <div className="shell-backdrop" aria-hidden="true" />
      {isDesktop && <DesktopShell counts={counts} />}
      {isTablet && <TabletShell counts={counts} />}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <Header onOpenPalette={() => setPaletteOpen(true)} onOpenDrawer={() => setDrawer(true)} onSignOut={onSignOut} />
        <main className={`flex-1 overflow-y-auto px-4 sm:px-7 pt-6 ${isMobile ? 'pb-[calc(env(safe-area-inset-bottom)+78px)]' : 'pb-10'}`}>
          <div key={view.page === 'case' ? `case-${view.caseId}` : view.page} className="animate-fadein">
            <Suspense fallback={<div className="flex items-center justify-center py-24"><Spinner /></div>}>
              {body}
            </Suspense>
          </div>
        </main>
      </div>
      {isMobile ? (
        <>
          <MobileShell current={view.page} counts={counts} onMore={() => setDrawer(true)} />
          <Drawer open={drawer} onClose={() => setDrawer(false)} />
        </>
      ) : (
        <Drawer open={drawer} onClose={() => setDrawer(false)} />
      )}
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}