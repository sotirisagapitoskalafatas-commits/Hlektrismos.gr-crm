/* Case overview pieces: Greek-labelled progress stepper, "next step" card with blockers and owner,
   stage-change and handover dialogs. Only existing operations are used (changeStage, updateCase, addActivity);
   success is claimed only after re-reading the case from the server. */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, Check, ChevronRight, ShieldAlert, Sparkles, Undo2 } from 'lucide-react';
import { addActivity, changeStage, fetchCase, fetchStageBlockers, overrideStage, updateCase } from '@/lib/api';
import type { Case, StaffProfile } from '@/lib/api';
import type { Role, Stage } from '@/lib/roles';
import { Modal } from '@/lib/ui';
import { useToast } from '@/lib/toast';
import { caseNextStep, journeySteps, stageText, TEAM_LABEL } from '@/lib/case-flow';
import type { Team } from '@/lib/case-flow';
import type { ChecklistItem } from '@/lib/documents';
import { BLOCKER_TEXT, stageErrorText } from '@/lib/case-return';
import type { StageBlocker } from '@/lib/case-return';


export function CaseProgress({ c, allowedNext, canChange, onPick }: {
  c: Case; allowedNext: Stage[]; canChange: boolean; onPick: (s: Stage) => void;
}) {
  const { steps, outcome } = journeySteps(c.current_stage, allowedNext);
  const done = steps.filter(s => s.state === 'done').length;
  const forward = allowedNext.filter(s => s !== 'lost' && s !== 'cancelled');
  const exits = allowedNext.filter(s => s === 'lost' || s === 'cancelled');
  return (
    <div className="atx-panel" style={{ padding: 20 }}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <h2 className="atx-section-title">Πορεία</h2>
        <span className="text-[13px] text-[var(--atx-muted)]">{outcome ? `Έκλεισε: ${stageText(outcome)}` : `Βήμα ${Math.min(done + 1, steps.length)} από ${steps.length}`}</span>
      </div>
      {outcome && <div className="atx-notice mb-4">Το case είναι «{stageText(outcome)}».</div>}
      <ol className="atx-stepper" aria-label="Στάδια case">
        {steps.map((s, i) => (
          <li key={s.stage} className={`atx-step is-${s.state}`} aria-current={s.state === 'current' ? 'step' : undefined}>
            <span className="atx-step-dot" aria-hidden="true">{s.state === 'done' ? <Check size={12} /> : i + 1}</span>
            <span className="atx-step-label">{s.label}</span>
          </li>
        ))}
      </ol>
      {canChange && (forward.length > 0 || exits.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap mt-4">
          {forward.map(s => (
            <button key={s} className="atx-btn atx-btn-quiet inline-flex items-center gap-1" onClick={() => onPick(s)}>
              {stageText(s)} <ChevronRight size={14} aria-hidden="true" />
            </button>
          ))}
          {exits.length > 0 && <span className="flex-1" />}
          {exits.map(s => (
            <button key={s} className="atx-btn" style={{ color: 'var(--atx-red)', background: 'rgba(209,52,47,.08)' }} onClick={() => onPick(s)}>{stageText(s)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CaseNextStepCard({ c, allowedNext, checklist, staff, canChange, canAssign, onPick, onHandover, onDocs, onReturn }: {
  c: Case; allowedNext: Stage[]; checklist: ChecklistItem[]; staff: StaffProfile[];
  canChange: boolean; canAssign: boolean; onPick: (s: Stage) => void; onHandover: () => void; onDocs: () => void;
  /** Back Office «Επιστροφή για διόρθωση» — offered only when allowed. */
  onReturn?: () => void;
}) {
  const [now] = useState(() => Date.now());
  const n = caseNextStep(c, allowedNext, checklist, now);
  const ownerText = !n.owner ? null
    : n.owner.kind === 'person' ? (staff.find(s => s.id === (n.owner as { id: string }).id)?.full_name ?? 'Ορισμένος συνάδελφος')
    : `${TEAM_LABEL[n.owner.team]} (με βάση το στάδιο)`;
  const docBlock = n.blockers.some(b => b.startsWith('Λείπει') || b.startsWith('Απορρίφθηκε'));
  return (
    <div className="atx-panel" style={{ padding: 20, background: n.done ? undefined : 'linear-gradient(180deg, rgba(22,119,255,.06), #fff)' }}>
      <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--atx-blue)' }}><Sparkles size={14} aria-hidden="true" /> Επόμενο βήμα</div>
      <h2 className="text-[18px] font-semibold mt-1.5">{n.title}</h2>
      <p className="text-[14px] text-[var(--atx-muted)] mt-1">{n.reason}</p>
      {ownerText && <p className="text-[13px] mt-2"><span className="text-[var(--atx-muted)]">Υπεύθυνος: </span><strong>{ownerText}</strong></p>}
      {n.blockers.length > 0 && (
        <ul className="mt-3 space-y-1.5 m-0 p-0 list-none">
          {n.blockers.map(b => (
            <li key={b} className="flex items-start gap-2 text-[13.5px]" style={{ color: 'var(--atx-amber)' }}>
              <AlertTriangle size={15} className="shrink-0 mt-0.5" aria-hidden="true" /> {b}
            </li>
          ))}
        </ul>
      )}
      {!n.done && (
        <div className="flex gap-2 flex-wrap mt-4">
          {docBlock && <button className="atx-btn atx-btn-primary" onClick={onDocs}>Δικαιολογητικά</button>}
          {/* Missing documents warn but do not stop the move (gate mode 'warn'); the stage dialog shows what the server says. */}
          {n.suggestedStage && canChange && (
            <button className={`atx-btn ${docBlock ? 'atx-btn-quiet' : 'atx-btn-primary'}`} onClick={() => onPick(n.suggestedStage as Stage)}>Μετάβαση σε «{stageText(n.suggestedStage)}»</button>
          )}
          {canAssign && <button className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" onClick={onHandover}><ArrowRightLeft size={14} /> Παράδοση</button>}
          {onReturn && <button className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" onClick={onReturn}><Undo2 size={14} /> Επιστροφή για διόρθωση</button>}
        </div>
      )}
    </div>
  );
}

export function StageChangeDialog({ c, stage, role, onClose, onDone }: {
  c: Case; stage: Stage | null; role: Role; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // What the SERVER says blocks this move (null = not checked / check not available yet).
  const [blockers, setBlockers] = useState<StageBlocker[] | null>(null);
  const [override, setOverride] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setNote(''); setOverride(''); setErr(null); setBlockers(null);
    if (!stage) return;
    let alive = true;
    void fetchStageBlockers(c.id, stage).then(b => { if (alive) setBlockers(b); });
    return () => { alive = false; };
  }, [stage, c.id]);
  if (!stage) return null;
  const exit = stage === 'lost' || stage === 'cancelled';
  // 'warn' gates (the default) list what is missing but never stop the move; only 'block' gates do.
  const blocked = !!blockers && blockers.some(b => b.mode !== 'warn');
  const warnings = !blocked && !!blockers && blockers.length > 0 ? blockers : [];
  const canOverride = role === 'admin' || role === 'manager';

  const verify = async (ok: string) => {
    const fresh = await fetchCase(c.id);
    setBusy(false);
    if (fresh?.current_stage === stage) { toast(ok, 'ok'); onDone(); }
    else toast('Η αλλαγή σταδίου δεν αποθηκεύτηκε. Δοκιμάστε ξανά.', 'bad');
  };
  const submit = async () => {
    setBusy(true); setErr(null);
    const r = await changeStage(c.id, stage, role, note.trim() || undefined);
    if (r.error) {
      setBusy(false);
      if (r.error.kind === 'documents') setBlockers(r.error.blockers.map(b => ({ ...b, mode: 'block' as const })));
      setErr(stageErrorText(r.error));
      return;
    }
    if (warnings.length) {
      await addActivity(c.id, { role, activity_type: 'note', title: 'Μετάβαση με ελλείψεις εγγράφων',
        description: warnings.map(b => `${b.label} — ${BLOCKER_TEXT[b.status]}`).join(' · '), metadata: { stage, missing: warnings } });
    }
    await verify(`Στάδιο: ${stageText(stage)}${warnings.length ? ' — με ελλείψεις εγγράφων (καταγράφηκαν)' : ''}`);
  };
  const submitOverride = async () => {
    setBusy(true); setErr(null);
    const r = await overrideStage(c.id, stage, override);
    if (r.error) { setBusy(false); setErr(stageErrorText(r.error)); return; }
    await verify(`Στάδιο: ${stageText(stage)} (με παράκαμψη — καταγράφηκε)`);
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title={exit ? `Κλείσιμο case: ${stageText(stage)}` : 'Αλλαγή σταδίου'} micro={c.case_no}>
      <p className="text-[14px] text-[var(--atx-muted,#64748b)] mb-3">
        {stageText(c.current_stage)} → <strong>{stageText(stage)}</strong>
      </p>
      {blocked && (
        <div className="atx-blockers" role="alert" data-blockers="true">
          <strong className="flex items-center gap-1.5"><ShieldAlert size={15} aria-hidden="true" /> Δεν μπορεί να προχωρήσει ακόμη</strong>
          <ul className="m-0 mt-1.5 p-0 list-none space-y-1">
            {blockers!.map(b => <li key={b.label} className="text-[13.5px]">{b.label} — <span className="font-medium">{BLOCKER_TEXT[b.status]}</span></li>)}
          </ul>
          <span className="block text-[12px] mt-1.5 opacity-80">Ελέγχεται από τον server· ανεβάστε/ελέγξτε τα έγγραφα στην καρτέλα «Έγγραφα».</span>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="atx-notice mb-3" role="status" data-doc-warnings="true">
          <strong className="flex items-center gap-1.5"><AlertTriangle size={15} aria-hidden="true" /> Λείπουν έγγραφα — η μετάβαση επιτρέπεται</strong>
          <ul className="m-0 mt-1.5 p-0 list-none space-y-1">
            {warnings.map(b => <li key={b.label} className="text-[13.5px]">{b.label} — <span className="font-medium">{BLOCKER_TEXT[b.status]}</span></li>)}
          </ul>
          <span className="block text-[12px] mt-1.5 opacity-80">Οι ελλείψεις καταγράφονται στο ιστορικό του case, για να τις συμπληρώσει το Back Office.</span>
        </div>
      )}
      {!blocked && (
        <textarea className="field" rows={3} value={note} onChange={e => setNote(e.target.value)}
          placeholder={exit ? 'Αιτία (απαιτείται), π.χ. «Επέλεξε άλλον πάροχο»' : 'Σημείωση (προαιρετική)'} aria-label={exit ? 'Αιτία' : 'Σημείωση'} />
      )}
      {blocked && canOverride && (
        <div className="mt-3">
          <label className="text-[13px] font-semibold" htmlFor="override-reason">Παράκαμψη (Διαχειριστής / Διευθυντής)</label>
          <textarea id="override-reason" className="field mt-1" rows={2} value={override} onChange={e => setOverride(e.target.value)}
            placeholder="Γιατί προχωράει χωρίς τα έγγραφα; (τουλάχιστον 10 χαρακτήρες — καταγράφεται)" />
        </div>
      )}
      {err && !blocked && <div className="atx-notice mt-3" role="alert">{err}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={onClose}>Άκυρο</button>
        {blocked && canOverride && (
          <button className="atx-btn atx-btn-quiet" disabled={busy || override.trim().length < 10} onClick={() => void submitOverride()}>{busy ? '…' : 'Παράκαμψη & μετάβαση'}</button>
        )}
        {!blocked && <button className="atx-btn atx-btn-primary" disabled={busy || (exit && note.trim().length < 3)} onClick={() => void submit()}>{busy ? '…' : warnings.length ? 'Συνέχεια με ελλείψεις' : 'Επιβεβαίωση'}</button>}
      </div>
    </Modal>
  );
}

const TEAM_ROLE: Record<Team, Role> = { inside_sales: 'inside_sales', field_sales: 'field_sales', back_office: 'back_office' };
const TEAM_FIELD: Record<Team, 'inside_sales_owner' | 'field_sales_owner' | 'back_office_owner'> = {
  inside_sales: 'inside_sales_owner', field_sales: 'field_sales_owner', back_office: 'back_office_owner',
};

export function HandoverDialog({ c, open, staff, role, onClose, onDone }: {
  c: Case; open: boolean; staff: StaffProfile[]; role: Role; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const [team, setTeam] = useState<Team>('back_office');
  const [person, setPerson] = useState('');
  const [need, setNeed] = useState('');
  const [busy, setBusy] = useState(false);
  const people = useMemo(() => staff.filter(s => s.role === TEAM_ROLE[team]), [staff, team]);
  useEffect(() => { setPerson(''); }, [team]);
  useEffect(() => { if (open) { setNeed(''); setPerson(''); } }, [open]);
  if (!open) return null;

  const submit = async () => {
    const who = staff.find(s => s.id === person);
    if (!who) return;
    setBusy(true);
    await updateCase(c.id, { next_action_owner_id: who.id, next_action: need.trim(), [TEAM_FIELD[team]]: who.id } as Partial<Case>);
    const fresh = await fetchCase(c.id);
    const ok = fresh?.next_action_owner_id === who.id;
    if (ok) {
      await addActivity(c.id, {
        role, activity_type: 'assignment',
        title: `Παράδοση σε ${who.full_name} (${TEAM_LABEL[team]})`,
        description: need.trim(),
        metadata: { from_owner: c.next_action_owner_id, to_owner: who.id, team },
      });
    }
    setBusy(false);
    if (ok) { toast(`Παραδόθηκε σε ${who.full_name}`, 'ok'); onDone(); }
    else toast('Η παράδοση δεν αποθηκεύτηκε. Δοκιμάστε ξανά.', 'bad');
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title="Παράδοση case" micro={c.case_no}>
      <p className="text-[14px] text-[var(--atx-muted,#64748b)] mb-3">Το ίδιο case συνεχίζει σε άλλο τμήμα — δεν δημιουργείται νέο.</p>
      <div className="grid gap-3">
        <label className="text-[13px] font-medium">Τμήμα
          <select className="field mt-1" value={team} onChange={e => setTeam(e.target.value as Team)}>
            {(Object.keys(TEAM_LABEL) as Team[]).map(t => <option key={t} value={t}>{TEAM_LABEL[t]}</option>)}
          </select>
        </label>
        <label className="text-[13px] font-medium">Συνάδελφος
          <select className="field mt-1" value={person} onChange={e => setPerson(e.target.value)}>
            <option value="">— Επιλέξτε —</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          {people.length === 0 && <span className="block text-xs text-[#b25e09] mt-1">Δεν βρέθηκαν συνάδελφοι σε αυτό το τμήμα.</span>}
        </label>
        <label className="text-[13px] font-medium">Τι χρειάζεται (απαιτείται)
          <textarea className="field mt-1" rows={3} value={need} onChange={e => setNeed(e.target.value)} placeholder="π.χ. Έλεγχος εγγράφων και καταχώρηση στον πάροχο" />
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={onClose}>Άκυρο</button>
        <button className="atx-btn atx-btn-primary" disabled={busy || !person || need.trim().length < 3} onClick={() => void submit()}>{busy ? '…' : 'Παράδοση'}</button>
      </div>
    </Modal>
  );
}
