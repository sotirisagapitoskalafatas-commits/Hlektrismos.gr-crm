import { lazy, Suspense, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { preferencesStore } from '@/lib/preferences';
import { useDeviceContext } from '@/lib/device-context';
import { useNav } from '@/lib/nav';
import { cacheAppShell } from '@/lib/pwa';
import {
  PAGE_TITLES, can, flattenNav, labsPageAllowed, leadStatusInfo, navForRole, stageLabel,
} from '@/lib/roles';
import type { PageKey } from '@/lib/roles';
import { Modal, Spinner, fmtMoney, rgbaOf } from '@/lib/ui';
import type { Customer, Lead } from '@/lib/api';
import { Case, fetchCases, fetchCustomers, fetchLeads } from '@/lib/api';
import { FileText, Plus, Search, UsersRound, X } from 'lucide-react';
import MobileShell from '@/components/shells/MobileShell';
import TopBar from '@/components/shell/TopBar';
import Sidebar from '@/components/shell/Sidebar';
import type { SidebarMode } from '@/components/shell/Sidebar';
import { activeItem, modulesForRole, moduleOfPage, settingsModule } from '@/components/shell/ModuleMap';
import { useCompactPref, useShellCounts } from '@/components/shell/useShellData';
import '@/styles/atlas-ux.css';
import '@/styles/atlas-shell.css';
import '@/styles/atlas-home.css';
import CrmAssistant from '@/components/assistant/CrmAssistant';
import { PreviewBanner } from './RoleSwitcher';

import HomePage from './HomePage';
import CasesPage from './CasesPage';
import CaseDetailPage from './CaseDetailPage';
import LeadsPage from './LeadsPage';

const WorkHub = lazy(() => import('./WorkHub'));
const ProspectingPage = lazy(() => import('./ProspectingPage'));
const ProvidersPage = lazy(() => import('./ProvidersPage'));
const RevenuePage = lazy(() => import('./RevenuePage'));

const CustomersPage = lazy(() => import('./CustomersPage'));
const ReportsPage = lazy(() => import('./ReportsPage'));
const CustomizePage = lazy(() => import('./CustomizePage'));
const SettingsPage = lazy(() => import('./SettingsPage'));
const AutomationBuilderPage = lazy(() => import('./AutomationBuilderPage'));
const AIWorkforcePage = lazy(() => import('./AIWorkforcePage'));
const MyDayPage = lazy(() => import('./MyDayPage'));
const MapPage = lazy(() => import('./MapPage'));
const BackOfficePage = lazy(() => import('./BackOfficePage'));
const FieldModePage = lazy(() => import('@/components/field-sales/FieldModePage'));

/* The shell chrome lives in components/shell (TopBar, Sidebar, ModuleMap). This file composes it with the page body
   and the ⌘K palette. Every page draws its own visible title; the ones below draw an H1 themselves, and for the
   rest the shell adds a visually hidden H1 so each screen still has exactly one top-level heading. */
const OWN_HEADING = new Set<string>(['cases', 'leads', 'account', 'preferences', 'homelayout', 'home', 'mywork', 'followups', 'backoffice', 'case', 'customers', 'myday', 'prospecting']);

/* ---------------- ⌘K palette + global search ---------------- */
function Palette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role } = useAuth();
  const { go, openCase } = useNav();
  const [q, setQ] = useState('');
  const [caseHits, setCaseHits] = useState<Case[]>([]);
  const [leadHits, setLeadHits] = useState<Lead[]>([]);
  const [customerHits, setCustomerHits] = useState<Customer[]>([]);

  const nav = navForRole(role);
  const items = flattenNav(nav);
  const hay = q.toLowerCase().trim();

  useEffect(() => {
    if (open) { setQ(''); setCaseHits([]); setLeadHits([]); setCustomerHits([]); }
  }, [open]);

  useEffect(() => {
    if (!open || hay.length < 2) { setCaseHits([]); setLeadHits([]); setCustomerHits([]); return; }
    const t = setTimeout(async () => {
      const [cs, ls, customers] = await Promise.all([fetchCases({ search: hay }), fetchLeads(), fetchCustomers()]);
      setCaseHits(cs.slice(0, 5));
      setLeadHits(ls.filter(l =>
        (l.full_name ?? '').toLowerCase().includes(hay) ||
        (l.phone ?? '').toLowerCase().includes(hay)
      ).slice(0, 5));
      setCustomerHits(customers.filter(c =>
        (c.full_name ?? '').toLowerCase().includes(hay) ||
        (c.phone ?? '').toLowerCase().includes(hay) ||
        (c.company ?? '').toLowerCase().includes(hay)
      ).slice(0, 5));
    }, 200);
    return () => clearTimeout(t);
  }, [hay, open]);

  const modules = items.filter(i => !hay || i.item.label.toLowerCase().includes(hay) || i.item.key.includes(hay));

  const commands = [
    { id: 'case', label: 'Νέο Case', page: 'cases' as PageKey, gate: can(role, 'create_case') },
    { id: 'lead', label: 'Νέο Lead', page: 'leads' as PageKey, gate: items.some(x => x.item.page === 'leads') },
    { id: 'customer', label: 'Νέος Πελάτης', page: 'customers' as PageKey, gate: items.some(x => x.item.page === 'customers') },
    { id: 'followup', label: 'Νέο Follow Up', page: 'followups' as PageKey, gate: can(role, 'create_followup') },
  ].filter(c => c.gate && (!hay || c.label.toLowerCase().includes(hay)));

  const offerHits = caseHits.filter(c => c.current_stage === 'offer');
  const searching = hay.length >= 2;
  const hasResults = caseHits.length > 0 || offerHits.length > 0 || leadHits.length > 0 || customerHits.length > 0;

  return (
    <Modal open={open} onClose={onClose} title="Command Center" micro={`⌘K — Search`}>
      <div className="flex items-center gap-2 border border-line rounded-lg px-3 py-2 bg-paper/60">
        <Search className="w-4 h-4 text-ink/40" />
        <input autoFocus value={q} onChange={e => setQ(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink/35"
          placeholder="Πληκτρολογήστε για να πλοηγηθείτε ή αναζητήστε…" />
        <button onClick={onClose} className="text-ink/40 hover:text-ink"><X className="w-4 h-4" /></button>
      </div>

      <div className="mt-3 max-h-80 overflow-y-auto -mx-1">
        {commands.length > 0 && (
          <>
            <div className="micro text-ink/30 px-3 pt-1 pb-1">Μεταβάσεις</div>
            <div className="grid grid-cols-2 gap-1 px-1">
              {commands.map(c => (
                <button key={c.id} onClick={() => { go(c.page); onClose(); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-white hover:bg-ink/5 text-[13px] font-medium text-ink/80 text-left">
                  <Plus className="w-4 h-4 text-ink/40 shrink-0" /> <span className="truncate">{c.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="micro text-ink/30 px-3 pt-3 pb-1">Μονάδες</div>
        {modules.length > 0 ? modules.map(({ item }) => (
          <button key={item.key} onClick={() => { go(item.page); onClose(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-ink/5 text-[13px] text-ink/80">
            <item.icon className="w-4 h-4 text-ink/40" /> <span className="font-medium">{item.label}</span>
          </button>
        )) : (
          <div className="px-3 py-2 text-xs text-ink/40">Καμία ενότητα δεν ταιριάζει.</div>
        )}

        {searching && (
          <>
            {(caseHits.length > 0 || offerHits.length > 0) && (
              <>
                <div className="micro text-ink/30 px-3 pt-3 pb-1">Cases</div>
                {caseHits.map(c => (
                  <button key={c.id} onClick={() => { openCase(c.id); onClose(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-ink/5 text-[13px] text-ink/80">
                    <span className="font-mono text-[11px] text-ink/45 w-20 truncate">{c.case_no}</span>
                    <span className="font-medium truncate flex-1">{c.customer?.full_name ?? c.title}</span>
                    <span className="pill" style={{ background: rgbaOf('#0066cc', 0.12), color: '#0066cc' }}>{stageLabel(c.current_stage)}</span>
                  </button>
                ))}
                {offerHits.length > 0 && (
                  <>
                    <div className="micro text-ink/30 px-3 pt-2 pb-1">Προσφορές</div>
                    {offerHits.map(c => (
                      <button key={c.id} onClick={() => { openCase(c.id); onClose(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-ink/5 text-[13px] text-ink/80">
                        <FileText className="w-4 h-4 text-ink/40" />
                        <span className="font-mono text-[11px] text-ink/45 w-20 truncate">{c.case_no}</span>
                        <span className="font-medium truncate flex-1">{c.customer?.full_name ?? c.title}</span>
                        <span className="micro text-ink/35">{fmtMoney(c.value)}</span>
                      </button>
                    ))}
                  </>
                )}
              </>
            )}

            {leadHits.length > 0 && (
              <>
                <div className="micro text-ink/30 px-3 pt-3 pb-1">Leads</div>
                {leadHits.map(l => {
                  const st = leadStatusInfo(l.status);
                  return (
                    <button key={l.id} onClick={() => { go('leads'); onClose(); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-ink/5 text-[13px] text-ink/80">
                      <span className="text-sm" aria-hidden="true">{st.emoji}</span>
                      <span className="font-medium truncate flex-1">{l.full_name ?? l.phone ?? 'Ανώνυμος'}</span>
                      <span className="pill" style={{ background: rgbaOf('#0066cc', 0.1), color: '#0066cc' }}>{st.label}</span>
                    </button>
                  );
                })}
              </>
            )}

            {customerHits.length > 0 && (
              <>
                <div className="micro text-ink/30 px-3 pt-3 pb-1">Πελάτες</div>
                {customerHits.map(c => (
                  <button key={c.id} onClick={() => { go('customers'); onClose(); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-ink/5 text-[13px] text-ink/80">
                    <UsersRound className="w-4 h-4 text-ink/40 shrink-0" />
                    <span className="font-medium truncate flex-1">{c.full_name}</span>
                    <span className="micro text-ink/35 truncate max-w-[120px]">{c.company ?? c.city ?? c.phone}</span>
                  </button>
                ))}
              </>
            )}

            {searching && !hasResults && modules.length > 0 && (
              <div className="px-3 py-2 text-xs text-ink/40">Κανένα αποτέλεσμα για «{hay}».</div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Shell ---------------- */

export default function AppShell() {
  const { signOut, role, user } = useAuth();
  const userId = user?.id;
  // Load the account's preferences once after login (theme etc. were already applied from the local copy).
  useEffect(() => {
    if (!userId) return;
    void preferencesStore.loadForUser(userId);
    return () => { void preferencesStore.flush(); preferencesStore.signOut(); };
  }, [userId]);
  const { view } = useNav();
  const { device } = useDeviceContext();
  const isMobile = device === 'PHONE';
  const isTablet = device === 'TABLET';
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  // Pages (e.g. Home «Atlas AI» panel) open the same assistant via a window event.
  useEffect(() => { const h = () => setAssistantOpen(true); window.addEventListener('atlas:open-assistant', h); return () => window.removeEventListener('atlas:open-assistant', h); }, []);
  const counts = useShellCounts();
  const { compact, toggle: toggleCompact } = useCompactPref();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
      if (e.key === 'Escape') setPaletteOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { void cacheAppShell(); }, []);
  // Portaled dialogs render under <body>, outside .atx-shell; this class lets them share the CRM look.
  useEffect(() => { document.body.classList.add('atx-app'); return () => document.body.classList.remove('atx-app'); }, []);

  const onSignOut = () => { signOut(); window.location.hash = '/'; };

  // Labs modules (lib/labs.ts): an address typed or linked directly falls back to Αρχική for everyone else.
  const labsBlocked = !labsPageAllowed(view.page, role);
  const fieldBlocked = view.page === 'field' && !can(role, 'check_in');
  const body = (() => {
    if (labsBlocked) return <HomePage />;
    switch (view.page) {
      case 'home': return <HomePage />;
      case 'mywork': return <WorkHub tab="tasks" />;
      case 'followups': return <WorkHub tab="followups" />;
      case 'cases': return <CasesPage />;
      case 'case': return <CaseDetailPage caseId={view.caseId!} />;
      case 'leads': return <LeadsPage />;
      case 'prospecting': return <ProspectingPage />;
      case 'providers': return <ProvidersPage />;
      case 'myday': return <MyDayPage />;
      case 'field': return can(role, 'check_in') ? <FieldModePage /> : <HomePage />;
      case 'map': return <MapPage />;
      case 'backoffice': return <BackOfficePage />;
      case 'customers': return <CustomersPage />;
      case 'reports': return <ReportsPage />;
      case 'revenue': return <RevenuePage />;
      case 'account': return <CustomizePage section="profile" />;
      case 'preferences': return <CustomizePage section="appearance" />;
      case 'homelayout': return <CustomizePage section="home" />;
      case 'admin': return <SettingsPage />;
      case 'automations': return <AutomationBuilderPage />;
      case 'aiworkforce': return <AIWorkforcePage />;
      default: return <HomePage />;
    }
  })();
  const ownHeading = labsBlocked || fieldBlocked || OWN_HEADING.has(view.page);

  // Navigation model: the five top-bar modules (hidden when empty) + the settings area, all from navForRole(role).
  const modules = modulesForRole(role);
  const settings = settingsModule(role);
  const current = moduleOfPage(labsBlocked ? 'home' : view.page, modules, settings);
  const sidebarModule = current ?? modules[0] ?? null;
  const activeTopId = current && current.id !== 'settings' ? current.id : null;
  const hasAdmin = !!activeItem(settings, 'admin');
  const desktop = !isMobile && !isTablet;
  const mode: SidebarMode = isMobile ? 'strip' : isTablet || compact ? 'compact' : 'full';

  return (
    <div className="atx-shell ui-aurora relative min-h-screen text-ink">
      <TopBar modules={modules} activeId={activeTopId} hasAdmin={hasAdmin}
        onOpenPalette={() => setPaletteOpen(true)} onOpenAssistant={() => setAssistantOpen(true)} onSignOut={onSignOut} />
      <div className="mx-3.5 mt-3 empty:hidden"><PreviewBanner /></div>
      <div className="shell-body">
        <Sidebar module={sidebarModule} page={labsBlocked ? 'home' : view.page} counts={counts} mode={mode}
          onToggleCompact={desktop ? toggleCompact : undefined} />
        <main className={`shell-main ${isMobile ? 'pb-[calc(env(safe-area-inset-bottom)+84px)]' : ''}`}>
          <div key={view.page === 'case' ? `case-${view.caseId}` : view.page} className="animate-fadein">
            {!ownHeading && <h1 className="sr-only">{PAGE_TITLES[view.page as PageKey] ?? 'ATLAS'}</h1>}
            <Suspense fallback={<div className="flex items-center justify-center py-24"><Spinner /></div>}>
              {body}
            </Suspense>
          </div>
        </main>
      </div>
      {isMobile && <MobileShell current={view.page} counts={counts} />}
      <Palette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <CrmAssistant open={assistantOpen} onClose={() => setAssistantOpen(false)} />
    </div>
  );
}
