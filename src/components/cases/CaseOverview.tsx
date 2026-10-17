/* Case overview pieces: Greek-labelled progress stepper, "next step" card with blockers and owner,
   stage-change and handover dialogs. Only existing operations are used (changeStage, updateCase, addActivity);
   success is claimed only after re-reading the case from the server. */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRightLeft, CalendarClock, Check, ChevronRight, MapPin, Sparkles, Undo2 } from 'lucide-react';
import { addActivity, changeStage, fetchCase, fetchFollowUps, fetchStageBlockers, fetchVisits, setCaseException, updateCase } from '@/lib/api';
import { EXCEPTION_TEXT } from '@/lib/ops-queue';
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
            <span className="atx-step-dot" aria-hidden="true" data-n={i + 1}>{s.state === 'done' ? <Check size={12} /> : null}</span>
            <span className="atx-step-label"><span className="sr-only">Βήμα {i + 1}: </span>{s.label}</span>
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
      <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--atx-blue)' }}><Sparkles size={14} aria-hidden="true" /> Επόμενη ενέργεια</div>
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
  // What the server reports as missing for this move (null = not checked / not available yet). Information only: documents never block.
  const [blockers, setBlockers] = useState<StageBlocker[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setNote(''); setErr(null); setBlockers(null);
    if (!stage) return;
    let alive = true;
    void fetchStageBlockers(c.id, stage).then(b => { if (alive) setBlockers(b); });
    return () => { alive = false; };
  }, [stage, c.id]);
  if (!stage) return null;
  const exit = stage === 'lost' || stage === 'cancelled';
  const warnings = blockers && blockers.length > 0 ? blockers : [];

  const verify = async (ok: string) => {
    const fresh = await fetchCase(c.id);
    setBusy(false);
    if (fresh?.current_stage === stage) { toast(ok, 'ok'); onDone(); }
    else toast('Η αλλαγή σταδίου δεν αποθηκεύτηκε. Δοκιμάστε ξανά.', 'bad');
  };
  const submit = async () => {
    setBusy(true); setErr(null);
    const missing = warnings.map(b => `${b.label} — ${BLOCKER_TEXT[b.status]}`);
    const r = await changeStage(c.id, stage, role, note.trim() || undefined, missing);
    if (r.error) { setBusy(false); setErr(stageErrorText(r.error)); return; }
    await verify(`Στάδιο: ${stageText(stage)}${warnings.length ? ' — με ελλείψεις εγγράφων (καταγράφηκαν)' : ''}`);
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title={exit ? `Κλείσιμο case: ${stageText(stage)}` : 'Αλλαγή σταδίου'} micro={c.case_no}>
      <p className="text-[14px] text-[var(--atx-muted,#64748b)] mb-3">
        {stageText(c.current_stage)} → <strong>{stageText(stage)}</strong>
      </p>
      {warnings.length > 0 && (
        <div className="atx-notice mb-3" role="status" data-doc-warnings="true">
          <strong className="flex items-center gap-1.5"><AlertTriangle size={15} aria-hidden="true" /> Λείπουν έγγραφα — η μετάβαση επιτρέπεται</strong>
          <ul className="m-0 mt-1.5 p-0 list-none space-y-1">
            {warnings.map(b => <li key={b.label} className="text-[13.5px]">{b.label} — <span className="font-medium">{BLOCKER_TEXT[b.status]}</span></li>)}
          </ul>
          <span className="block text-[12px] mt-1.5 opacity-80">Οι ελλείψεις καταγράφονται στο ιστορικό του case, για να τις συμπληρώσει το Back Office.</span>
        </div>
      )}
      <textarea className="field" rows={3} value={note} onChange={e => setNote(e.target.value)}
        placeholder={exit ? 'Αιτία (απαιτείται), π.χ. «Επέλεξε άλλον πάροχο»' : 'Σημείωση (προαιρετική)'} aria-label={exit ? 'Αιτία' : 'Σημείωση'} />
      {err && <div className="atx-notice mt-3" role="alert">{err}</div>}
      <div className="flex justify-end gap-2 mt-4">
        <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={onClose}>Άκυρο</button>
        <button className="atx-btn atx-btn-primary" disabled={busy || (exit && note.trim().length < 3)} onClick={() => void submit()}>{busy ? '…' : warnings.length ? 'Συνέχεια με ελλείψεις' : 'Επιβεβαίωση'}</button>
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

/** «Επόμενες ενέργειες» on the case overview: open follow-ups and planned visits of this case, soonest first. */
export function CaseUpcoming({ caseId, version, onOpenTab }: { caseId: string; version: number; onOpenTab: (t: 'followups' | 'visits') => void }) {
  const [items, setItems] = useState<{ id: string; at: string | null; kind: 'followup' | 'visit'; text: string; overdue: boolean }[] | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([fetchFollowUps({ status: 'all' }), fetchVisits({ caseId })]).then(([f, v]) => {
      if (!alive) return;
      const now = Date.now();
      const fu = f.filter(x => x.case_id === caseId && (x.status === 'pending' || x.status === 'snoozed'))
        .map(x => ({ id: x.id, at: x.due_at, kind: 'followup' as const, text: x.reason || 'Follow-up', overdue: new Date(x.due_at).getTime() < now }));
      const vi = v.filter(x => x.status === 'planned')
        .map(x => ({ id: x.id, at: x.scheduled_at, kind: 'visit' as const, text: x.purpose || 'Επίσκεψη', overdue: !!x.scheduled_at && new Date(x.scheduled_at).getTime() < now }));
      setItems([...fu, ...vi].sort((a, b) => (a.at ? +new Date(a.at) : Infinity) - (b.at ? +new Date(b.at) : Infinity)));
    });
    return () => { alive = false; };
  }, [caseId, version]);
  return (
    <div className="atx-panel" style={{ padding: 20 }} data-case-upcoming>
      <h2 className="atx-section-title mb-2">Επόμενες ενέργειες</h2>
      {items === null && <div className="atx-skeleton" />}
      {items?.length === 0 && <p className="text-[13.5px] text-[var(--atx-muted)] m-0">Δεν υπάρχει προγραμματισμένο follow-up ή επίσκεψη.</p>}
      {items && items.length > 0 && (
        <ul className="m-0 p-0 list-none space-y-2">
          {items.slice(0, 5).map(i => (
            <li key={`${i.kind}-${i.id}`}>
              <button className="w-full text-left flex items-start gap-2 text-[13.5px]" onClick={() => onOpenTab(i.kind === 'visit' ? 'visits' : 'followups')}>
                {i.kind === 'visit' ? <MapPin size={15} className="shrink-0 mt-0.5 text-[var(--atx-muted)]" aria-hidden="true" /> : <CalendarClock size={15} className="shrink-0 mt-0.5 text-[var(--atx-muted)]" aria-hidden="true" />}
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{i.text}</span>
                  <span className="block text-[12.5px]" style={{ color: i.overdue ? 'var(--atx-red)' : 'var(--atx-muted)' }}>
                    {i.kind === 'visit' ? 'Επίσκεψη' : 'Follow-up'} · {i.at ? new Date(i.at).toLocaleString('el-GR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'χωρίς ώρα'}{i.overdue ? ' · εκπρόθεσμο' : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Back Office exception on the case (staged phase4/13): offer declined, no response, unsigned, provider rejection.
    It does not move or close the case; missing information uses «Επιστροφή για διόρθωση». */
export function CaseExceptionCard({ c, onChanged }: { c: Case; onChanged: () => void }) {
  const { toast } = useToast();
  const [state, setState] = useState<string>(c.exception_state ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setState(c.exception_state ?? ''); setNote(''); }, [c.exception_state]);
  const save = async (next: string) => {
    setBusy(true);
    const e = await setCaseException(c.id, (next || null) as Case['exception_state'], note);
    setBusy(false);
    if (e) { toast(e, 'bad'); return; }
    toast(next ? `Εξαίρεση: ${EXCEPTION_TEXT[next]}` : 'Η εξαίρεση έκλεισε.', 'ok');
    onChanged();
  };
  return (
    <div className="atx-panel mb-4" style={{ padding: 16 }} data-case-exception>
      <h3 className="text-[14px] font-semibold mb-1">Εξαίρεση</h3>
      {c.exception_state
        ? <p className="text-[13.5px] m-0 mb-2"><strong style={{ color: 'var(--atx-red)' }}>{EXCEPTION_TEXT[c.exception_state]}</strong>{c.exception_note ? ` — ${c.exception_note}` : ''}</p>
        : <p className="text-[13px] text-[var(--atx-muted)] m-0 mb-2">Χωρίς εξαίρεση. Για ελλείψεις στοιχείων χρησιμοποιήστε «Επιστροφή για διόρθωση».</p>}
      <div className="flex gap-2 flex-wrap items-center">
        <select className="field max-w-xs" value={state} onChange={e => setState(e.target.value)} aria-label="Εξαίρεση">
          <option value="">— Καμία —</option>
          {Object.entries(EXCEPTION_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {state && state !== (c.exception_state ?? '') && <input className="field max-w-sm" value={note} onChange={e => setNote(e.target.value)} placeholder="Τι συνέβη (υποχρεωτικό)" aria-label="Σημείωση εξαίρεσης" />}
        <button className="atx-btn atx-btn-quiet" disabled={busy || state === (c.exception_state ?? '') || (!!state && note.trim().length < 3)} onClick={() => void save(state)}>Αποθήκευση</button>
      </div>
    </div>
  );
}
