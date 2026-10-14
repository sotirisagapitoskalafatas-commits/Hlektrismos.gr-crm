/* «Επιστροφή για διόρθωση» (Back Office → Inside/Field Sales) and the banner on a returned case with «Επανυποβολή».
   The database enforces who may do it, the mandatory reason and items, notifications and the audit trail
   (staged migration phase2/07). Success is shown only after re-reading the case. */

import { useMemo, useState } from 'react';
import { CornerUpLeft, Send, Undo2 } from 'lucide-react';
import { fetchCase, resubmitCase, returnCase } from '@/lib/api';
import type { Case, StaffProfile } from '@/lib/api';
import { Modal, fmtDateTime } from '@/lib/ui';
import { useToast } from '@/lib/toast';
import { stageText } from '@/lib/case-flow';
import { RETURN_TEAM_LABEL, defaultReturnTeam, stageErrorText } from '@/lib/case-return';
import type { ReturnTeam } from '@/lib/case-return';
import type { ChecklistItem } from '@/lib/documents';

const STATUS_HINT: Record<ChecklistItem['status'], string> = { missing: 'λείπει', rejected: 'απορρίφθηκε', received: 'δεν έχει ελεγχθεί', verified: 'ελέγχθηκε' };

export function ReturnDialog({ c, checklist, staff, onClose, onDone }: {
  c: Case; checklist: ChecklistItem[]; staff: StaffProfile[]; onClose: () => void; onDone: () => void;
}) {
  const { toast } = useToast();
  // Suggest the items that are not verified yet; the user can tick anything, and add their own.
  const options = useMemo(() => checklist.filter(i => i.required).map(i => ({ label: i.label, status: i.status })), [checklist]);
  const [picked, setPicked] = useState<string[]>(() => options.filter(o => o.status === 'missing' || o.status === 'rejected').map(o => o.label));
  const [other, setOther] = useState('');
  const [reason, setReason] = useState('');
  const items = [...picked, ...other.split('\n').map(s => s.trim()).filter(Boolean)];
  const [teamTouched, setTeamTouched] = useState(false);
  const [teamPick, setTeamPick] = useState<ReturnTeam>('inside_sales');
  const team = teamTouched ? teamPick : defaultReturnTeam(items);
  const ownerId = team === 'inside_sales' ? c.inside_sales_owner : c.field_sales_owner;
  const ownerName = ownerId ? staff.find(s => s.id === ownerId)?.full_name ?? 'ορισμένος συνάδελφος' : null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const valid = reason.trim().length >= 10 && items.length > 0;

  const toggle = (l: string) => setPicked(p => (p.includes(l) ? p.filter(x => x !== l) : [...p, l]));
  const submit = async () => {
    setBusy(true); setErr(null);
    const r = await returnCase(c.id, { reason, items, toTeam: team });
    if (r.error) { setBusy(false); setErr(stageErrorText(r.error)); return; }
    const fresh = await fetchCase(c.id);
    setBusy(false);
    if (fresh?.returned_at) { toast(`Επιστράφηκε σε ${RETURN_TEAM_LABEL[team]}${ownerName ? ` (${ownerName})` : ''}.`, 'ok'); onDone(); }
    else toast('Η επιστροφή δεν επιβεβαιώθηκε. Δοκιμάστε ξανά.', 'bad');
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title="Επιστροφή για διόρθωση" micro={c.case_no} wide>
      <div className="space-y-4">
        <p className="text-[14px] text-[var(--atx-muted)]">
          Το case μένει στο στάδιο «{stageText(c.current_stage)}» με το ίδιο ιστορικό. Την ευθύνη αναλαμβάνει η ομάδα που επιλέγετε· ειδοποιείται και το βλέπει στην «Η εργασία μου».
        </p>
        <fieldset>
          <legend className="text-[13px] font-semibold mb-1.5">Τι λείπει ή είναι λάθος <span className="text-[var(--atx-red)]">*</span></legend>
          <div className="grid sm:grid-cols-2 gap-1.5">
            {options.map(o => (
              <label key={o.label} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-[13.5px] cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={picked.includes(o.label)} onChange={() => toggle(o.label)} />
                <span>{o.label} <span className="text-[var(--atx-muted)]">· {STATUS_HINT[o.status]}</span></span>
              </label>
            ))}
          </div>
          <textarea className="field mt-2" rows={2} value={other} onChange={e => setOther(e.target.value)} placeholder="Άλλο (ένα ανά γραμμή), π.χ. «Λάθος ΑΦΜ στην αίτηση»" aria-label="Άλλα στοιχεία" />
        </fieldset>
        <div>
          <label className="text-[13px] font-semibold" htmlFor="return-reason">Αιτιολογία <span className="text-[var(--atx-red)]">*</span></label>
          <textarea id="return-reason" className="field mt-1" rows={3} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Τι πρέπει να γίνει για να προχωρήσει, π.χ. «Ο λογαριασμός είναι παλαιότερος των 3 μηνών — χρειάζεται νεότερος.»" />
          <span className="text-[12px] text-[var(--atx-muted)]">Τουλάχιστον 10 χαρακτήρες · εμφανίζεται στο χρονολόγιο και στον υπεύθυνο.</span>
        </div>
        <div role="radiogroup" aria-label="Επιστροφή σε" className="grid sm:grid-cols-2 gap-2">
          {(['inside_sales', 'field_sales'] as ReturnTeam[]).map(t => (
            <button key={t} type="button" role="radio" aria-checked={team === t} onClick={() => { setTeamTouched(true); setTeamPick(t); }}
              className={`text-left rounded-xl border px-3 py-2.5 ${team === t ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-line hover:bg-ink/[0.03]'}`}>
              <span className="block text-[14px] font-medium">{RETURN_TEAM_LABEL[t]}</span>
              <span className="block text-xs text-ink/50">{t === 'inside_sales' ? 'Έγγραφα/στοιχεία από τον πελάτη' : 'Υπογραφή ή επίσκεψη'}</span>
            </button>
          ))}
        </div>
        <p className="text-[13px]">Υπεύθυνος: <strong>{ownerName ?? 'κανείς ορισμένος — θα ειδοποιηθεί ο Διευθυντής για ανάθεση'}</strong></p>
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={onClose}>Άκυρο</button>
          <button className="atx-btn atx-btn-primary inline-flex items-center gap-1.5" disabled={busy || !valid} onClick={() => void submit()}>
            <Undo2 size={14} /> {busy ? '…' : 'Επιστροφή για διόρθωση'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function ReturnedBanner({ c, staff, canResubmit, onDone }: { c: Case; staff: StaffProfile[]; canResubmit: boolean; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!c.returned_at) return null;
  const who = staff.find(s => s.id === c.returned_by)?.full_name ?? 'Back Office';
  const to = c.return_to_team ? RETURN_TEAM_LABEL[c.return_to_team] : '—';
  const items = Array.isArray(c.return_items) ? c.return_items : [];
  const submit = async () => {
    setBusy(true);
    const r = await resubmitCase(c.id, note);
    if (r.error) { setBusy(false); toast(stageErrorText(r.error), 'bad'); return; }
    const fresh = await fetchCase(c.id);
    setBusy(false);
    if (fresh && !fresh.returned_at) { toast('Επανυποβλήθηκε στο Back Office.', 'ok'); setOpen(false); onDone(); }
    else toast('Η επανυποβολή δεν επιβεβαιώθηκε.', 'bad');
  };
  return (
    <div className="atx-returned" role="status" data-returned="true">
      <div className="flex items-start gap-3 flex-wrap">
        <CornerUpLeft size={18} className="shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-[240px]">
          <strong>Επιστράφηκε για διόρθωση → {to}</strong>
          <span className="block text-[13px]">από {who} · {fmtDateTime(c.returned_at)} · στάδιο «{stageText(c.return_from_stage ?? c.current_stage)}»</span>
          <p className="mt-1.5 text-[14px]">{c.return_reason}</p>
          {items.length > 0 && <ul className="mt-1.5 m-0 pl-4 text-[13.5px]">{items.map(i => <li key={i}>{i}</li>)}</ul>}
        </div>
        {canResubmit && !open && (
          <button className="atx-btn atx-btn-primary inline-flex items-center gap-1.5" onClick={() => setOpen(true)}><Send size={14} /> Επανυποβολή στο Back Office</button>
        )}
      </div>
      {open && (
        <div className="mt-3 flex gap-2 flex-wrap items-end">
          <textarea className="field flex-1 min-w-[240px]" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Τι διορθώθηκε (προαιρετικό)" aria-label="Σημείωση επανυποβολής" />
          <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={() => setOpen(false)}>Άκυρο</button>
          <button className="atx-btn atx-btn-primary" disabled={busy} onClick={() => void submit()}>{busy ? '…' : 'Επανυποβολή'}</button>
        </div>
      )}
    </div>
  );
}
