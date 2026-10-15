/* «+ Task» from Σημερινά Tasks. A task is a follow-up assigned to the current user on a case (follow_ups.case_id is
   NOT NULL in the database, so a task always belongs to a case). Shows in Η εργασία μου / Follow-ups like any other. */

import { useEffect, useMemo, useState } from 'react';
import { Btn, Field, Modal, Spinner } from '@/lib/ui';
import { useToast } from '@/lib/toast';
import { createFollowUp } from '@/lib/api';
import type { Case } from '@/lib/api';
import { isActive } from '@/lib/home-insights';
import { stageText } from '@/lib/case-flow';

const pad = (n: number) => String(n).padStart(2, '0');
/** Next full hour today (or 09:00 tomorrow after 19:00), as a datetime-local value. */
function defaultDue(now = new Date()): string {
  const d = new Date(now);
  if (d.getHours() >= 19) { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); } else { d.setHours(d.getHours() + 1, 0, 0, 0); }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function TaskQuickAdd({ open, cases, onClose, onSaved }: { open: boolean; cases: Case[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const options = useMemo(() => cases.filter(isActive).sort((a, b) => (a.customer?.full_name ?? a.title).localeCompare(b.customer?.full_name ?? b.title, 'el')), [cases]);
  const [caseId, setCaseId] = useState('');
  const [due, setDue] = useState(defaultDue);
  const [what, setWhat] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setCaseId(''); setDue(defaultDue()); setWhat(''); setErr(null); } }, [open]);

  const save = async () => {
    setBusy(true); setErr(null);
    const f = await createFollowUp({ case_id: caseId, due_at: new Date(due).toISOString(), channel: 'other', reason: what.trim(), priority: 'normal' });
    setBusy(false);
    if (!f) { setErr('Το task δεν αποθηκεύτηκε. Δοκιμάστε ξανά.'); return; }
    toast('Το task προστέθηκε.', 'ok');
    onSaved();
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Νέο task" micro="Σημερινά Tasks">
      <div className="space-y-3">
        <Field label="Τι πρέπει να γίνει (υποχρεωτικό)">
          <input className="field" value={what} onChange={e => setWhat(e.target.value)} placeholder="π.χ. Κλήση για τα έγγραφα που λείπουν" />
        </Field>
        <Field label="Case">
          <select className="field" value={caseId} onChange={e => setCaseId(e.target.value)} aria-label="Case">
            <option value="">— Επιλέξτε case —</option>
            {options.map(c => <option key={c.id} value={c.id}>{c.customer?.full_name ?? c.title} · {c.case_no} · {stageText(c.current_stage)}</option>)}
          </select>
        </Field>
        <Field label="Πότε">
          <input type="datetime-local" className="field" value={due} onChange={e => setDue(e.target.value)} />
        </Field>
        {options.length === 0 && <div className="atx-notice">Δεν υπάρχει ενεργό case. Ένα task συνδέεται πάντα με case.</div>}
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn disabled={busy || !caseId || what.trim().length < 2 || !due} onClick={() => void save()}>{busy ? <Spinner /> : null} Προσθήκη</Btn>
        </div>
      </div>
    </Modal>
  );
}
