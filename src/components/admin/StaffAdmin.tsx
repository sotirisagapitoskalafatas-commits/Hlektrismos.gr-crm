/* Χρήστες & Ρόλοι — create, edit, (de)activate and delete staff accounts.
   Every action is authorized on the server (SQL functions / admin-users edge function); the UI only offers what
   the matrix allows and shows success only after re-reading the directory. Deletion is refused for anyone who
   appears in CRM history — deactivation keeps the history and blocks access. */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Mail, Plus, Search, ShieldAlert, UserCheck, UserX, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ACCESS_GROUPS, ROLE_COLOR, accessGroupLabel, roleLabel } from '@/lib/roles';
import type { Role } from '@/lib/roles';
import { Btn, Field, Modal, Spinner, fmtDate, rgbaOf } from '@/lib/ui';
import { useToast } from '@/lib/toast';
import {
  ROLE_DESCRIPTION, CREATEABLE_SALES_ROLES, canManage, createStaff, deleteStaff, generatePassword, isSalesAgentRole, listStaff, manageableRoles, resetStaffPassword, setStaffActive,
  staffReferenceCount, updateStaff,
} from '@/lib/staff-admin';
import type { StaffMember, StaffSource } from '@/lib/staff-admin';
import { pendingText } from '@/lib/pending-text';

type Dialog =
  | { kind: 'create' }
  | { kind: 'edit'; s: StaffMember; refs: number | null }
  | { kind: 'status'; s: StaffMember }
  | { kind: 'reset'; s: StaffMember }
  | { kind: 'delete'; s: StaffMember; refs: number | null }
  | null;

const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]?.toUpperCase()).join('') || '·';

export default function StaffAdmin() {
  const { role: viewRole, user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<StaffMember[]>([]);
  const [source, setSource] = useState<StaffSource>('server');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [roleF, setRoleF] = useState<'all' | Role>('all');
  const [statusF, setStatusF] = useState<'active' | 'inactive' | 'all'>('active');
  const [dialog, setDialog] = useState<Dialog>(null);

  // The displayed role decides what is OFFERED; the server decides what is ALLOWED (real session), and a
  // presentation preview blocks every write anyway.
  const allowedRoles = manageableRoles(viewRole, true) as Role[];
  const createableRoles = allowedRoles.filter(r => CREATEABLE_SALES_ROLES.includes(r as (typeof CREATEABLE_SALES_ROLES)[number]));
  const canCreate = source === 'server' && createableRoles.length > 0;

  const load = useCallback(async () => {
    const r = await listStaff();
    const scoped = r.rows
      .filter(x => viewRole === 'admin' || isSalesAgentRole(x.role))
      .map(x => ({ ...x, can_manage: x.can_manage && canManage(viewRole, true, x.role) }));
    setRows(scoped); setSource(r.source); setError(r.error); setLoading(false);
    return scoped;
  }, [viewRole]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const n = q.trim().toLocaleLowerCase('el');
    return rows.filter(r =>
      (roleF === 'all' || r.role === roleF)
      && (statusF === 'all' || (statusF === 'active' ? r.is_active : !r.is_active))
      && (!n || `${r.full_name} ${r.email ?? ''} ${r.phone ?? ''}`.toLocaleLowerCase('el').includes(n)));
  }, [rows, q, roleF, statusF]);

  const counts = useMemo(() => ({ active: rows.filter(r => r.is_active).length, inactive: rows.filter(r => !r.is_active).length }), [rows]);

  const open = async (kind: 'edit' | 'delete', s: StaffMember) => {
    setDialog({ kind, s, refs: null });
    const refs = (await staffReferenceCount(s.id)) ?? -1; // -1 = check failed → treated as «has history» (fail closed)
    setDialog(d => (d && d.kind === kind && d.s.id === s.id ? { ...d, refs } : d));
  };

  return (
    <div className="space-y-3">
      {source === 'fallback' && (
        <div className="atx-notice" role="status">
          <strong>Μόνο προβολή.</strong> {pendingText(viewRole, 'Η διαχείριση χρηστών ενεργοποιείται μετά την ενημέρωση της βάσης «Διαχείριση χρηστών» (phase2/05) και την ανάπτυξη της function admin-users.', 'Η διαχείριση χρηστών ενεργοποιείται μετά την επόμενη ενημέρωση.')}
        </div>
      )}
      {error && <div className="atx-notice" role="alert">{error}</div>}
      {source === 'server' && allowedRoles.length === 0 && (
        <div className="atx-notice" role="status" data-testid="admin-only-note">Το Back Office μπορεί να διαχειρίζεται λογαριασμούς Sales Agent. Οι Sales Agents δεν μπορούν να δημιουργούν ή να διαχειρίζονται λογαριασμούς.</div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="atx-search">
          <Search size={15} aria-hidden="true" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Αναζήτηση ονόματος, email, τηλεφώνου" aria-label="Αναζήτηση χρηστών" />
        </label>
        <select className="atx-chip" value={roleF} onChange={e => setRoleF(e.target.value as 'all' | Role)} aria-label="Ρόλος">
          <option value="all">Όλοι οι ρόλοι</option>
          {ACCESS_GROUPS.map(g => <optgroup key={g.id} label={g.label}>{g.roles.map(r => <option key={r} value={r}>{roleLabel(r)}</option>)}</optgroup>)}
        </select>
        <div className="atx-tabs" role="tablist" aria-label="Κατάσταση">
          {([['active', `Ενεργοί ${counts.active}`], ['inactive', `Ανενεργοί ${counts.inactive}`], ['all', 'Όλοι']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={statusF === k} className="atx-tab" onClick={() => setStatusF(k)}>{l}</button>
          ))}
        </div>
        <span className="flex-1" />
        {canCreate && <Btn onClick={() => setDialog({ kind: 'create' })}><Plus className="w-3.5 h-3.5" /> Νέος χρήστης</Btn>}
      </div>

      <div className="atx-panel" aria-busy={loading}>
        {loading && [0, 1, 2].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}
        {!loading && visible.length === 0 && <div className="atx-empty !py-8"><strong>Κανένας χρήστης</strong>Αλλάξτε την αναζήτηση ή τα φίλτρα.</div>}
        {!loading && visible.length > 0 && (
          <table className="atx-table">
            <thead>
              <tr><th>Χρήστης</th><th>Ρόλος</th><th>Κατάσταση</th><th className="max-md:hidden">Δημιουργία</th><th className="max-md:hidden">Τελευταία σύνδεση</th><th aria-label="Ενέργειες" /></tr>
            </thead>
            <tbody>
              {visible.map(s => {
                const c = ROLE_COLOR[s.role] ?? '#64748b';
                const me = s.id === user?.id;
                return (
                  <tr key={s.id} data-staff={s.email ?? s.full_name} className={s.is_active ? '' : 'is-muted'}>
                    <td>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="atx-avatar" style={{ background: rgbaOf(c, 0.14), color: c }} aria-hidden="true">{initials(s.full_name)}</span>
                        <span className="min-w-0">
                          <span className="block font-medium truncate">{s.full_name}{me && <span className="text-ink/40 font-normal"> · εσείς</span>}</span>
                          <span className="block text-[12.5px] text-[var(--atx-muted)] truncate">{s.email ?? '—'}{s.phone ? ` · ${s.phone}` : ''}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="atx-role" style={{ background: rgbaOf(c, 0.12), color: c }}>{roleLabel(s.role)}</span>
                      <span className="block text-[11.5px] text-[var(--atx-faint)] mt-0.5" data-group>{accessGroupLabel(s.role)}</span>
                    </td>
                    <td><span className={`atx-tag ${s.is_active ? 't-success' : ''}`}>{s.is_active ? 'Ενεργός' : 'Ανενεργός'}</span></td>
                    <td className="max-md:hidden text-[13px] text-[var(--atx-muted)]">{s.created_at ? fmtDate(s.created_at) : '—'}</td>
                    <td className="max-md:hidden text-[13px] text-[var(--atx-muted)]">{source === 'server' ? (s.last_sign_in_at ? fmtDate(s.last_sign_in_at) : 'Ποτέ') : '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      {s.can_manage && (
                        <span className="inline-flex gap-1">
                          <button className="atx-icon-btn" title="Επεξεργασία" aria-label={`Επεξεργασία ${s.full_name}`} onClick={() => void open('edit', s)}><Pencil size={15} /></button>
                          <button className="atx-icon-btn" title="Επαναφορά κωδικού" aria-label={`Επαναφορά κωδικού ${s.full_name}`} onClick={() => setDialog({ kind: 'reset', s })}><KeyRound size={15} /></button>
                          <button className="atx-icon-btn" title={s.is_active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'} aria-label={`${s.is_active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'} ${s.full_name}`} onClick={() => setDialog({ kind: 'status', s })}>
                            {s.is_active ? <UserX size={15} /> : <UserCheck size={15} />}
                          </button>
                          <button className="atx-icon-btn is-danger" title="Διαγραφή" aria-label={`Διαγραφή ${s.full_name}`} onClick={() => void open('delete', s)}><Trash2 size={15} /></button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[12px] text-[var(--atx-faint)]">
        Το Back Office μπορεί να δημιουργεί/προσκαλεί Sales Agents, να στέλνει email ανάκτησης και να ενεργοποιεί ή απενεργοποιεί λογαριασμούς. Οι νέοι λογαριασμοί δημιουργούνται ως Field Sales, με χάρτη και δρομολόγια. Δεν υπάρχει δημόσια εγγραφή ή αυτο-εγγραφή. Οι προνομιακές αλλαγές παραμένουν server-side και καταγράφονται στο Audit Log.
      </p>

      {dialog?.kind === 'create' && (
        <CreateDialog roles={createableRoles} onClose={() => setDialog(null)} onDone={async (email, invited) => {
          const fresh = await load();
          const ok = fresh.some(r => r.email?.toLowerCase() === email.toLowerCase());
          toast(ok ? (invited ? `Στάλθηκε πρόσκληση στο ${email}.` : `Ο λογαριασμός ${email} δημιουργήθηκε.`) : 'Η δημιουργία δεν επιβεβαιώθηκε — ελέγξτε τη λίστα.', ok ? 'ok' : 'bad');
          if (ok) setDialog(null);
        }} />
      )}
      {dialog?.kind === 'edit' && (
        <EditDialog s={dialog.s} refs={dialog.refs} roles={allowedRoles} isSelf={dialog.s.id === user?.id} onClose={() => setDialog(null)}
          onDone={async (want) => {
            const fresh = await load();
            const now = fresh.find(r => r.id === dialog.s.id);
            const ok = !!now && now.role === want.role && now.full_name === want.full_name;
            toast(ok ? 'Οι αλλαγές αποθηκεύτηκαν.' : 'Η αποθήκευση δεν επιβεβαιώθηκε.', ok ? 'ok' : 'bad');
            if (ok) setDialog(null);
          }} />
      )}
      {dialog?.kind === 'status' && (
        <StatusDialog s={dialog.s} onClose={() => setDialog(null)} onDone={async () => {
          const fresh = await load();
          const ok = fresh.find(r => r.id === dialog.s.id)?.is_active === !dialog.s.is_active;
          toast(ok ? (dialog.s.is_active ? 'Ο χρήστης απενεργοποιήθηκε.' : 'Ο χρήστης ενεργοποιήθηκε.') : 'Η αλλαγή δεν επιβεβαιώθηκε.', ok ? 'ok' : 'bad');
          if (ok) setDialog(null);
        }} />
      )}
      {dialog?.kind === 'reset' && (
        <ResetDialog s={dialog.s} onClose={() => setDialog(null)} onDone={() => { toast(`Στάλθηκε email επαναφοράς κωδικού στο ${dialog.s.email}.`, 'ok'); setDialog(null); }} />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteDialog s={dialog.s} refs={dialog.refs} onClose={() => setDialog(null)}
          onDeactivate={() => setDialog({ kind: 'status', s: dialog.s })}
          onDone={async () => {
            const fresh = await load();
            const ok = !fresh.some(r => r.id === dialog.s.id);
            toast(ok ? 'Ο λογαριασμός διαγράφηκε οριστικά.' : 'Η διαγραφή δεν επιβεβαιώθηκε.', ok ? 'ok' : 'bad');
            if (ok) setDialog(null);
          }} />
      )}
    </div>
  );
}

function RolePicker({ roles, value, onChange, disabled }: { roles: Role[]; value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return (
    <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Ρόλος">
      {ACCESS_GROUPS.map(g => {
        const inGroup = roles.filter(r => g.roles.includes(r));
        if (!inGroup.length) return null;
        return (
          <Fragment key={g.id}>
            <p className="sm:col-span-2 m-0 mt-1 text-[12px] font-semibold uppercase tracking-wide text-ink/50" data-role-group={g.id}>{g.label} <span className="font-normal normal-case tracking-normal">· {g.hint}</span></p>
            {inGroup.map(r => (
              <button key={r} type="button" role="radio" aria-checked={value === r} disabled={disabled} onClick={() => onChange(r)}
                className={`text-left rounded-xl border px-3 py-2.5 transition-colors disabled:opacity-60 ${value === r ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-line hover:bg-ink/[0.03]'}`}>
                <span className="block text-[14px] font-medium text-ink">{roleLabel(r)}</span>
                <span className="block text-xs text-ink/50 leading-snug">{ROLE_DESCRIPTION[r]}</span>
              </button>
            ))}
          </Fragment>
        );
      })}
    </div>
  );
}

function CreateDialog({ roles, onClose, onDone }: { roles: Role[]; onClose: () => void; onDone: (email: string, invited: boolean) => Promise<void> }) {
  const [full_name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>(roles.includes('inside_sales') ? 'inside_sales' : roles[0]);
  const [mode, setMode] = useState<'invite' | 'password'>('invite');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = full_name.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) && (mode === 'invite' || password.length >= 12);

  const submit = async () => {
    setBusy(true); setErr(null);
    const r = await createStaff({ full_name: full_name.trim(), email: email.trim(), phone: phone.trim(), role, mode, password: mode === 'password' ? password : undefined });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    await onDone(email.trim(), mode === 'invite');
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title="Νέος χρήστης" micro="Χρήστες & Ρόλοι" wide>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Ονοματεπώνυμο"><input className="field" value={full_name} onChange={e => setName(e.target.value)} autoComplete="off" /></Field>
          <Field label="Email εργασίας"><input className="field" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /></Field>
          <Field label="Τηλέφωνο (προαιρετικό)"><input className="field" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+30…" /></Field>
        </div>
        <Field label="Ρόλος"><RolePicker roles={roles} value={role} onChange={setRole} /></Field>
        <Field label="Πρόσβαση">
          <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Τρόπος πρόσβασης">
            <button type="button" role="radio" aria-checked={mode === 'invite'} onClick={() => setMode('invite')}
              className={`text-left rounded-xl border px-3 py-2.5 ${mode === 'invite' ? 'border-brand-600 bg-brand-50' : 'border-line'}`}>
              <span className="flex items-center gap-1.5 text-[14px] font-medium"><Mail size={14} /> Πρόσκληση με email</span>
              <span className="block text-xs text-ink/50">Ο χρήστης ορίζει μόνος του τον κωδικό του (συνιστάται).</span>
            </button>
            <button type="button" role="radio" aria-checked={mode === 'password'} onClick={() => { setMode('password'); if (!password) setPassword(generatePassword()); }}
              className={`text-left rounded-xl border px-3 py-2.5 ${mode === 'password' ? 'border-brand-600 bg-brand-50' : 'border-line'}`}>
              <span className="flex items-center gap-1.5 text-[14px] font-medium"><KeyRound size={14} /> Προσωρινός κωδικός</span>
              <span className="block text-xs text-ink/50">Τον δίνετε στον χρήστη ιδιωτικά· να τον αλλάξει στην πρώτη σύνδεση.</span>
            </button>
          </div>
          {mode === 'password' && (
            <div className="mt-2 flex gap-2">
              <input className="field font-mono" value={password} onChange={e => setPassword(e.target.value)} aria-label="Προσωρινός κωδικός" autoComplete="new-password" />
              <Btn variant="outline" onClick={() => setPassword(generatePassword())}>Νέος</Btn>
            </div>
          )}
        </Field>
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn disabled={!valid || busy} onClick={() => void submit()}>{busy ? <Spinner /> : <Plus className="w-3.5 h-3.5" />} Δημιουργία</Btn>
        </div>
      </div>
    </Modal>
  );
}

function EditDialog({ s, refs, roles, isSelf, onClose, onDone }: {
  s: StaffMember; refs: number | null; roles: Role[]; isSelf: boolean; onClose: () => void; onDone: (want: { full_name: string; role: Role }) => Promise<void>;
}) {
  const [full_name, setName] = useState(s.full_name);
  const [phone, setPhone] = useState(s.phone ?? '');
  const [role, setRole] = useState<Role>(s.role);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const roleChoices = isSalesAgentRole(s.role) ? (roles.includes(s.role) ? roles : [s.role, ...roles]) : [s.role];
  const submit = async () => {
    setBusy(true); setErr(null);
    const e = await updateStaff(s.id, { full_name: full_name.trim(), phone: phone.trim(), role });
    setBusy(false);
    if (e) { setErr(e); return; }
    await onDone({ full_name: full_name.trim() || s.full_name, role });
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={`Επεξεργασία: ${s.full_name}`} micro={s.email ?? 'Χρήστες & Ρόλοι'} wide>
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Ονοματεπώνυμο"><input className="field" value={full_name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Τηλέφωνο"><input className="field" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
        </div>
        <Field label="Ρόλος">
          <RolePicker roles={roleChoices} value={role} onChange={setRole} disabled={isSelf || !isSalesAgentRole(s.role)} />
          {isSelf && <p className="text-xs text-ink/50 mt-1">Δεν μπορείτε να αλλάξετε τον δικό σας ρόλο.</p>}
          {!isSelf && !isSalesAgentRole(s.role) && <p className="text-xs text-ink/50 mt-1">Οι υφιστάμενοι ρόλοι γραφείου διατηρούνται για συμβατότητα. Δεν δημιουργούνται νέοι λογαριασμοί γραφείου από αυτή την οθόνη.</p>}
        </Field>
        <p className="text-[13px] text-[var(--atx-muted)]">Συνδέσεις στο CRM: {refs === null ? '…' : refs < 0 ? 'μη διαθέσιμο' : `${refs} εγγραφές (cases, follow-ups, δραστηριότητα κ.λπ.)`}</p>
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn disabled={busy || full_name.trim().length < 2} onClick={() => void submit()}>{busy ? <Spinner /> : null} Αποθήκευση</Btn>
        </div>
      </div>
    </Modal>
  );
}

function StatusDialog({ s, onClose, onDone }: { s: StaffMember; onClose: () => void; onDone: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const deactivate = s.is_active;
  const submit = async () => {
    setBusy(true); setErr(null);
    const e = await setStaffActive(s.id, !deactivate);
    setBusy(false);
    if (e) { setErr(e); return; }
    await onDone();
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={deactivate ? `Απενεργοποίηση: ${s.full_name}` : `Ενεργοποίηση: ${s.full_name}`} micro="Χρήστες & Ρόλοι">
      <div className="space-y-3">
        <p className="text-[14px] text-ink/75">
          {deactivate
            ? 'Ο χρήστης δεν θα έχει πρόσβαση στα δεδομένα του CRM. Το ιστορικό του (cases, σημειώσεις, δραστηριότητα) διατηρείται και μπορεί να ενεργοποιηθεί ξανά.'
            : 'Ο χρήστης θα αποκτήσει ξανά πρόσβαση με τον ρόλο του.'}
        </p>
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn variant={deactivate ? 'danger' : 'primary'} disabled={busy} onClick={() => void submit()}>{busy ? <Spinner /> : null} {deactivate ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ResetDialog({ s, onClose, onDone }: { s: StaffMember; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    const r = await resetStaffPassword(s.id);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    onDone();
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={`Επαναφορά κωδικού: ${s.full_name}`} micro="Χρήστες & Ρόλοι">
      <div className="space-y-3">
        <p className="text-[14px] text-ink/75">
          Ο χρήστης θα λάβει email{s.email ? ` στο ${s.email}` : ''} για να ορίσει νέο κωδικό. Δεν βλέπετε ούτε στέλνετε εσείς κωδικό. Η ενέργεια καταγράφεται στο Audit Log.
        </p>
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn disabled={busy || !s.email} onClick={() => void submit()}>{busy ? <Spinner /> : <Mail className="w-3.5 h-3.5" />} Αποστολή email</Btn>
        </div>
      </div>
    </Modal>
  );
}

function DeleteDialog({ s, refs, onClose, onDeactivate, onDone }: {
  s: StaffMember; refs: number | null; onClose: () => void; onDeactivate: () => void; onDone: () => Promise<void>;
}) {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const word = (s.email ?? s.full_name).trim();
  const submit = async () => {
    setBusy(true); setErr(null);
    const r = await deleteStaff(s.id);
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    await onDone();
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={`Διαγραφή: ${s.full_name}`} micro="Χρήστες & Ρόλοι">
      <div className="space-y-3">
        {refs === null && <div className="flex justify-center py-4"><Spinner /></div>}
        {refs !== null && refs !== 0 && (
          <>
            <div className="atx-notice flex gap-2"><ShieldAlert size={16} className="shrink-0 mt-0.5" />
              <span>{refs < 0 ? 'Δεν ήταν δυνατός ο έλεγχος των συνδέσεων του χρήστη.' : <>Ο χρήστης συνδέεται με <strong>{refs}</strong> εγγραφές του CRM.</>} Η οριστική διαγραφή δεν επιτρέπεται, ώστε να μη χαθεί το ιστορικό. Απενεργοποιήστε τον λογαριασμό: η πρόσβαση κόβεται, το ιστορικό μένει.</span>
            </div>
            <div className="flex justify-end gap-2">
              <Btn variant="outline" onClick={onClose}>Άκυρο</Btn>
              {s.is_active && <Btn variant="danger" onClick={onDeactivate}><UserX className="w-3.5 h-3.5" /> Απενεργοποίηση</Btn>}
            </div>
          </>
        )}
        {refs === 0 && (
          <>
            <p className="text-[14px] text-ink/75">Ο λογαριασμός και η σύνδεσή του θα διαγραφούν οριστικά. Η ενέργεια δεν αναιρείται και καταγράφεται στο audit log.</p>
            <Field label={`Πληκτρολογήστε «${word}» για επιβεβαίωση`}>
              <input className="field" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" />
            </Field>
            {err && <div className="atx-notice" role="alert">{err}</div>}
            <div className="flex justify-end gap-2">
              <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
              <Btn variant="danger" disabled={busy || confirm.trim() !== word} onClick={() => void submit()}>{busy ? <Spinner /> : <Trash2 className="w-3.5 h-3.5" />} Οριστική διαγραφή</Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
