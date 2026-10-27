/* Admin Center («Διαχείριση») — grouped tabs instead of one long page of static claims.
   Tabs per displayed role (a presentation preview only changes the view; it never grants administration):
     admin        → Επισκόπηση · Χρήστες & Ρόλοι · Κάδος · Δικαιώματα · Cases & Ροή · Έγγραφα · B2B Scraper · Ασφάλεια & Έλεγχοι · Audit Log
     manager      → Επισκόπηση · Χρήστες & Ρόλοι · Κάδος · Δικαιώματα · Cases & Ροή · Έγγραφα · Audit Log
     back_office  → Χρήστες & Ρόλοι (Back Office colleagues only)
   Every status shown is either read live, or labelled «Δεν έχει επαληθευτεί ζωντανά». */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { ACCESS_GROUPS, roleLabel } from '@/lib/roles';
import type { Role } from '@/lib/roles';
import { fetchScraperSettings } from '@/lib/scraper';
import { fetchStaffAudit, listStaff } from '@/lib/staff-admin';
import type { StaffAuditRow, StaffMember, StaffSource } from '@/lib/staff-admin';
import StaffAdmin from './StaffAdmin';
import AdminSecurity, { CheckList } from './AdminSecurity';
import { SOURCE_FINDINGS, lastAnonChecks } from '@/lib/admin-checks';
import { fetchSalesScope } from '@/lib/sales-scope';
import type { SalesScope } from '@/lib/sales-scope';
import { DocumentsTab, PermissionsTab, WorkflowTab } from './AdminReference';
import ScraperSettingsCard from './ScraperSettings';
import { TrashTab } from '@/components/trash/TrashControls';
import { pendingText } from '@/lib/pending-text';

type Tab = 'overview' | 'users' | 'trash' | 'permissions' | 'workflow' | 'documents' | 'scraper' | 'security' | 'audit';
const TAB_LABEL: Record<Tab, string> = {
  overview: 'Επισκόπηση', users: 'Χρήστες & Ρόλοι', trash: 'Κάδος', permissions: 'Δικαιώματα', workflow: 'Cases & Ροή εργασίας',
  documents: 'Έγγραφα', scraper: 'B2B Scraper', security: 'Ασφάλεια & Έλεγχοι', audit: 'Audit Log',
};
function tabsFor(role: Role | null | undefined): Tab[] {
  if (role === 'admin') return ['overview', 'users', 'trash', 'permissions', 'workflow', 'documents', 'scraper', 'security', 'audit'];
  if (role === 'manager') return ['overview', 'users', 'trash', 'permissions', 'workflow', 'documents', 'audit'];
  if (role === 'back_office') return ['users'];
  return [];
}

export default function AdminCenter() {
  const { profile, role } = useAuth();
  const { view } = useNav();
  // Tabs follow the role being SHOWN (a presentation preview shows that role's view); server data and every write
  // are still authorized by the real session — and writes are blocked while previewing.
  const realRole = role;
  const tabs = tabsFor(realRole);
  const wanted = view.filters?.tab as Tab | undefined;
  const [tab, setTab] = useState<Tab>(() => (wanted && tabs.includes(wanted) ? wanted : tabs[0] ?? 'users'));
  useEffect(() => { if (!tabs.includes(tab) && tabs[0]) setTab(tabs[0]); }, [tabs, tab]);

  if (!profile) return null;
  if (tabs.length === 0) {
    return <div className="atx-page"><div className="atx-panel"><div className="atx-empty"><strong>Δεν έχετε πρόσβαση στη Διαχείριση</strong>Ο ρόλος σας δεν περιλαμβάνει διαχειριστικές λειτουργίες.</div></div></div>;
  }

  return (
    <div className="atx-page atx-admin">
      <div className="atx-head">
        <p className="atx-eyebrow">Διαχείριση</p>
        <h1 className="atx-title">{realRole === 'back_office' ? 'Ομάδα Back Office' : 'Κέντρο διαχείρισης'}</h1>
        <p className="atx-sub">Χρήστες, ρόλοι, ροή εργασίας και έλεγχοι — με πραγματική κατάσταση, όχι στατικές δηλώσεις.</p>
      </div>
      {tabs.length > 1 && (
        <div className="atx-pagetabs mt-4" role="tablist" aria-label="Ενότητες διαχείρισης">
          {tabs.map(t => <button key={t} role="tab" aria-selected={tab === t} className="atx-pagetab" onClick={() => setTab(t)}>{TAB_LABEL[t]}</button>)}
        </div>
      )}
      <div className="mt-4" role="tabpanel" aria-label={TAB_LABEL[tab]}>
        {tab === 'overview' && <Overview role={realRole} onOpen={setTab} />}
        {tab === 'users' && <StaffAdmin />}
        {tab === 'trash' && <TrashTab />}
        {tab === 'permissions' && <PermissionsTab />}
        {tab === 'workflow' && <WorkflowTab />}
        {tab === 'documents' && <DocumentsTab />}
        {tab === 'scraper' && <ScraperSettingsCard />}
        {tab === 'security' && <AdminSecurity />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  );
}

function Overview({ role, onOpen }: { role: Role | null; onOpen: (t: Tab) => void }) {
  const [staff, setStaff] = useState<{ rows: StaffMember[]; source: StaffSource } | null>(null);
  const [keySet, setKeySet] = useState<boolean | null | 'n/a'>(null);
  const [scope, setScope] = useState<SalesScope | null | 'loading'>('loading');
  useEffect(() => {
    let alive = true;
    if (role === 'admin' || role === 'manager') void fetchSalesScope().then(s => alive && setScope(s));
    void listStaff().then(r => alive && setStaff({ rows: r.rows, source: r.source }));
    if (role === 'admin' || role === 'manager') void fetchScraperSettings().then(s => alive && setKeySet(s ? s.keySet : 'n/a'));
    return () => { alive = false; };
  }, [role]);
  const byGroup = useMemo(() => ACCESS_GROUPS.map(group => ({ group, n: staff?.rows.filter(s => group.roles.includes(s.role) && s.is_active).length ?? 0 })), [staff]);
  const last = lastAnonChecks();
  const issues = last?.results.filter(r => r.status === 'action').length ?? 0;

  return (
    <div className="space-y-4">
      <div className="atx-ov-grid">
        <button type="button" className="atx-ov" onClick={() => onOpen('users')}>
          <span className="atx-ov-k">Ενεργοί χρήστες</span>
          <span className="atx-ov-v">{staff ? staff.rows.filter(s => s.is_active).length : '…'}</span>
          <span className="atx-ov-s">{byGroup.filter(x => x.n).map(x => `${x.group.label} ${x.n}`).join(' · ') || '—'}</span>
        </button>
        <button type="button" className="atx-ov" onClick={() => onOpen('users')}>
          <span className="atx-ov-k">Διαχείριση χρηστών</span>
          <span className={`atx-ov-v ${staff?.source === 'server' ? '' : 'is-warn'}`}>{!staff ? '…' : staff.source === 'server' ? 'Ενεργή' : 'Εκκρεμεί'}</span>
          <span className="atx-ov-s">{staff?.source === 'server' ? 'Ο server απαντά στις ενέργειες διαχείρισης.' : pendingText(role, 'Εκκρεμεί η ενημέρωση της βάσης «Διαχείριση χρηστών» (phase2/05) και η function admin-users.', 'Η διαχείριση χρηστών ενεργοποιείται μετά την επόμενη ενημέρωση.')}</span>
        </button>
        {(role === 'admin' || role === 'manager') && (
          <button type="button" className="atx-ov" data-testid="sales-scope" onClick={() => onOpen('users')}>
            <span className="atx-ov-k">Ορατότητα πωλητών</span>
            <span className={`atx-ov-v ${scope === 'loading' ? '' : scope?.enabled ? 'is-ok' : 'is-warn'}`}>{scope === 'loading' ? '…' : scope === null ? 'Εκκρεμεί' : scope.enabled ? 'Μόνο τα δικά τους' : 'Βλέπουν όλα'}</span>
            <span className="atx-ov-s">{scope === 'loading' ? ' ' : scope === null
              ? pendingText(role, 'Εκκρεμεί η ενημέρωση βάσης «Ορατότητα πωλητών» (phase4/18): μέχρι τότε οι πωλητές βλέπουν όλα τα leads, cases και πελάτες.')
              : scope.enabled ? 'Οι Inside και Field Sales βλέπουν μόνο τα δικά τους leads, cases και πελάτες· Back Office / Admin βλέπουν όλα.'
                : 'Η ορατότητα δεν είναι ενεργή: οι πωλητές βλέπουν όλα τα δεδομένα.'}</span>
          </button>
        )}
        {role === 'admin' && (
          <button type="button" className="atx-ov" onClick={() => onOpen('security')}>
            <span className="atx-ov-k">Έλεγχοι ανώνυμης πρόσβασης</span>
            <span className={`atx-ov-v ${!last ? '' : issues ? 'is-warn' : 'is-ok'}`}>{!last ? 'Δεν έχουν εκτελεστεί' : issues ? `${issues} θέματα` : 'Χωρίς θέματα'}</span>
            <span className="atx-ov-s">{last ? `Τελευταίος έλεγχος ${new Date(last.at).toLocaleString('el-GR')}` : 'Εκτελέστε τους από «Ασφάλεια & Έλεγχοι».'}</span>
          </button>
        )}
        {(role === 'admin' || role === 'manager') && (
          <button type="button" className="atx-ov" onClick={() => role === 'admin' && onOpen('scraper')}>
            <span className="atx-ov-k">Κλειδί SerpApi</span>
            <span className="atx-ov-v">{keySet === null ? '…' : keySet === 'n/a' ? 'Μη διαθέσιμο' : keySet ? 'Ρυθμισμένο' : 'Λείπει'}</span>
            <span className="atx-ov-s">Δείχνει μόνο αν υπάρχει· η τιμή δεν επιστρέφεται ποτέ στον browser.</span>
          </button>
        )}
      </div>
      {role === 'admin' && (
        <div className="atx-panel">
          <div className="atx-card-head"><h2 className="atx-section-title">Εκκρεμότητες ασφαλείας από τον κώδικα</h2><button className="atx-link" onClick={() => onOpen('security')}>Όλοι οι έλεγχοι →</button></div>
          <CheckList items={SOURCE_FINDINGS} />
        </div>
      )}
    </div>
  );
}

const ACTION_TEXT: Record<string, string> = {
  create: 'Δημιουργία χρήστη', update: 'Επεξεργασία στοιχείων', role_change: 'Αλλαγή ρόλου', deactivate: 'Απενεργοποίηση', reactivate: 'Ενεργοποίηση',
  delete: 'Οριστική διαγραφή', password_reset: 'Επαναφορά κωδικού (email)', denied: 'Άρνηση (χωρίς δικαίωμα)', role_preview_start: 'Έναρξη επίδειξης ρόλου', role_preview_end: 'Λήξη επίδειξης ρόλου',
};

function AuditTab() {
  const [rows, setRows] = useState<StaffAuditRow[] | null | undefined>(undefined);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    void fetchStaffAudit().then(setRows);
    void listStaff().then(r => setNames(new Map(r.rows.map(s => [s.id, s.full_name]))));
  }, []);
  const who = (id: string | null, email?: string | null) => (id ? names.get(id) ?? email ?? 'χρήστης' : email ?? '—');
  const rl = (v: unknown) => roleLabel(String(v ?? '') as Role);
  const describe = (r: StaffAuditRow) => {
    if (r.action === 'role_change') return `${rl(r.before?.role)} → ${rl(r.after?.role)}`;
    if (r.action.startsWith('role_preview')) return r.note ? `προβολή ως ${rl(r.note)}` : '';
    if (r.action === 'create') return `ρόλος ${rl(r.after?.role)}`;
    return r.note ?? '';
  };
  return (
    <div className="atx-panel" aria-busy={rows === undefined}>
      <div className="atx-card-head"><h2 className="atx-section-title">Ενέργειες διαχείρισης χρηστών</h2></div>
      {rows === undefined && [0, 1, 2].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}
      {rows === null && <p className="px-4 pb-4 text-[14px] text-[var(--atx-muted)]">Το ιστορικό διαχείρισης χρηστών θα είναι διαθέσιμο μετά την επόμενη ενημέρωση της βάσης.</p>}
      {rows && rows.length === 0 && <p className="px-4 pb-4 text-[14px] text-[var(--atx-muted)]">Δεν υπάρχουν καταγραφές ακόμη.</p>}
      {rows && rows.length > 0 && (
        <table className="atx-table">
          <thead><tr><th>Πότε</th><th>Ποιος</th><th>Ενέργεια</th><th>Σε ποιον</th><th>Λεπτομέρειες</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-[13px]">{new Date(r.created_at).toLocaleString('el-GR')}</td>
                <td>{who(r.actor_id)}</td>
                <td>{ACTION_TEXT[r.action] ?? r.action}</td>
                <td>{who(r.target_id, r.target_email)}</td>
                <td className="text-[13px] text-[var(--atx-muted)]">{describe(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
