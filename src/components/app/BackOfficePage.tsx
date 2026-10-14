/* Λειτουργίες — one prioritised Back Office queue instead of stage columns.
   Each row: customer, stage, days in stage, who is responsible, and exactly what blocks it (missing/rejected/unchecked
   documents, overdue follow-up). The forward action uses the existing transitions and the verified stage-change
   dialog; blocked cases open the case instead of being pushed forward. Server-side rules are unchanged. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, ClipboardCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { STAGE_TRANSITIONS, can } from '@/lib/roles';
import type { Stage } from '@/lib/roles';
import { fetchCases, fetchDocumentsForCases } from '@/lib/api';
import type { Case, CaseDocument } from '@/lib/api';
import { buildOpsQueue, OPS_STAGES } from '@/lib/ops-queue';
import { stageText } from '@/lib/case-flow';
import { useStaff } from '@/lib/useStaff';
import { StageChangeDialog } from '@/components/cases/CaseOverview';

type Filter = 'all' | 'mine' | 'blocked' | 'ready';

export default function BackOfficePage() {
  const { role, user } = useAuth();
  const { openCase } = useNav();
  const staff = useStaff();
  const [cases, setCases] = useState<Case[]>([]);
  const [docs, setDocs] = useState<Record<string, CaseDocument[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');
  const [stage, setStage] = useState<string>('all');
  const [pending, setPending] = useState<{ c: Case; to: Stage } | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const list = (await fetchCases()).filter(c => (OPS_STAGES as readonly string[]).includes(c.current_stage));
    setCases(list);
    setDocs(await fetchDocumentsForCases(list.map(c => c.id)));
    setLoading(false);
    setNow(Date.now());
  }, []);
  useEffect(() => { void load(); }, [load]);

  const queue = useMemo(() => buildOpsQueue(cases, docs, user?.id ?? '', now), [cases, docs, user?.id, now]);
  const visible = queue.filter(i =>
    (stage === 'all' || i.stage === stage)
    && (filter === 'all' || (filter === 'mine' && i.mine) || (filter === 'blocked' && i.blockers.length > 0) || (filter === 'ready' && i.blockers.length === 0)));
  const count = (f: Filter) => queue.filter(i => f === 'all' || (f === 'mine' && i.mine) || (f === 'blocked' && i.blockers.length > 0) || (f === 'ready' && i.blockers.length === 0)).length;
  const name = (id: string | null) => (id ? staff.find(s => s.id === id)?.full_name ?? 'Ορισμένος συνάδελφος' : 'Χωρίς υπεύθυνο');
  const canChange = can(role, 'change_stage');
  const caseById = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Όλα' }, { id: 'mine', label: 'Δικά μου' }, { id: 'blocked', label: 'Με εκκρεμότητες' }, { id: 'ready', label: 'Έτοιμα να προχωρήσουν' },
  ];

  return (
    <div className="atx-page" style={{ maxWidth: 1040 }}>
      <div className="atx-head">
        <h1 className="atx-title">Λειτουργίες</h1>
        <p className="atx-sub">{loading ? 'Φόρτωση…' : `${queue.length} cases σε επεξεργασία · ${count('blocked')} με εκκρεμότητες · ${count('ready')} έτοιμα`}</p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 justify-between">
        <div className="atx-tabs" role="tablist" aria-label="Φίλτρο ουράς">
          {filters.map(f => (
            <button key={f.id} role="tab" aria-selected={filter === f.id} className="atx-tab" onClick={() => setFilter(f.id)}>
              {f.label}{!loading && <span className="ml-1.5 opacity-60">{count(f.id)}</span>}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13px] text-[var(--atx-muted)]">Στάδιο
          <select className="atx-chip" value={stage} onChange={e => setStage(e.target.value)} aria-label="Στάδιο">
            <option value="all">Όλα</option>
            {OPS_STAGES.map(s => <option key={s} value={s}>{stageText(s)}</option>)}
          </select>
        </label>
      </div>

      <div className="atx-panel mt-4" aria-busy={loading}>
        {loading && [0, 1, 2, 3].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}
        {!loading && visible.length === 0 && (
          <div className="atx-empty">
            <ClipboardCheck className="mx-auto mb-3" size={28} aria-hidden="true" />
            <strong>{queue.length === 0 ? 'Η ουρά είναι άδεια' : 'Τίποτα σε αυτή την προβολή'}</strong>
            {queue.length === 0 ? 'Cases από «Αίτηση» έως «Ενεργοποίηση» θα εμφανιστούν εδώ.' : 'Αλλάξτε φίλτρο ή στάδιο.'}
          </div>
        )}
        {!loading && visible.length > 0 && (
          <ul className="m-0 p-0 list-none">
            {visible.map(i => {
              const c = caseById.get(i.id)!;
              const forward = (STAGE_TRANSITIONS[c.current_stage as Stage] ?? []).find(s => (['application', 'signed', 'document_check', 'submitted', 'activation', 'completed'] as string[]).indexOf(s) > (['application', 'signed', 'document_check', 'submitted', 'activation', 'completed'] as string[]).indexOf(c.current_stage));
              const blocked = i.blockers.length > 0;
              return (
                <li key={i.id} className={`atx-row ${blocked ? 'is-overdue' : ''}`} style={{ alignItems: 'flex-start' }}>
                  <span className="atx-icon" aria-hidden="true">{blocked ? <AlertTriangle size={16} /> : <ClipboardCheck size={16} />}</span>
                  <button className="atx-row-main" onClick={() => openCase(i.id)}>
                    <span className="atx-row-title">
                      {i.title}
                      {i.urgent && <span className="atx-tag t-danger ml-2">Επείγον</span>}
                    </span>
                    <span className="atx-row-sub">{i.stageLabel} · {i.caseNo} · {i.daysInStage === 0 ? 'σήμερα στο στάδιο' : `${i.daysInStage} ${i.daysInStage === 1 ? 'ημέρα' : 'ημέρες'} στο στάδιο`} · {name(i.ownerId)}</span>
                    {blocked
                      ? <span className="block text-[13px] mt-1" style={{ color: 'var(--atx-amber)', whiteSpace: 'normal' }}>{i.blockers.join(' · ')}</span>
                      : <span className="block text-[13px] mt-1" style={{ color: 'var(--atx-green)' }}>{i.nextAction || 'Χωρίς εκκρεμότητες'}</span>}
                  </button>
                  <span className="atx-row-act flex items-center gap-2">
                    {!blocked && forward && canChange
                      ? <button className="atx-btn atx-btn-primary inline-flex items-center gap-1" onClick={() => setPending({ c, to: forward })}>{stageText(forward)} <ChevronRight size={14} /></button>
                      : <button className="atx-btn atx-btn-quiet" onClick={() => openCase(i.id)}>{blocked ? 'Επίλυση' : 'Άνοιγμα'}</button>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-[12px] text-[var(--atx-faint)] mt-3">Οι εκκρεμότητες εγγράφων βασίζονται στην ενδεικτική λίστα δικαιολογητικών· επιβεβαιώστε με τον πάροχο.</p>

      {pending && (
        <StageChangeDialog c={pending.c} stage={pending.to} role={role} onClose={() => setPending(null)}
          onDone={() => { setPending(null); void load(); }} />
      )}
    </div>
  );
}
