/* Trash UI pieces shared by leads and customers: the «Διαγραφή» dialog (moves to the trash), the banner on a trashed
   record, and the «Κάδος» list for the Admin Center. Success is shown only after the caller re-reads the data. */

import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Btn, Field, Modal, Spinner, fmtDateTime } from '@/lib/ui';
import { canPurge, canTrash, describeReferences, listTrash, purgeRecord, restoreRecord, trashRecord } from '@/lib/trash';
import type { TrashRow, TrashType } from '@/lib/trash';

const TYPE_TEXT: Record<TrashType, string> = { lead: 'Lead', customer: 'Πελάτης' };

export function TrashButton({ type, id, name, onTrashed, compact }: { type: TrashType; id: string; name: string; onTrashed: () => Promise<boolean> | void; compact?: boolean }) {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  if (!canTrash(role)) return null;
  return (
    <>
      {compact
        ? <button type="button" title="Διαγραφή (μεταφορά στον κάδο)" aria-label={`Διαγραφή ${name}`} onClick={() => setOpen(true)}
            className="p-1.5 rounded-lg border border-line bg-white text-ink/50 hover:text-bad-600 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
        : <button type="button" className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" onClick={() => setOpen(true)}><Trash2 size={14} /> Διαγραφή</button>}
      {open && <TrashDialog type={type} id={id} name={name} onClose={() => setOpen(false)} onTrashed={onTrashed} />}
    </>
  );
}

function TrashDialog({ type, id, name, onClose, onTrashed }: { type: TrashType; id: string; name: string; onClose: () => void; onTrashed: () => Promise<boolean> | void }) {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setErr(null);
    const e = await trashRecord(type, id, reason);
    if (e) { setBusy(false); setErr(e); return; }
    const verified = await onTrashed();
    setBusy(false);
    toast(verified === false ? 'Η μεταφορά δεν επιβεβαιώθηκε — ελέγξτε τη λίστα.' : `«${name}» μεταφέρθηκε στον κάδο.`, verified === false ? 'bad' : 'ok');
    onClose();
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={`Διαγραφή: ${name}`} micro={TYPE_TEXT[type]}>
      <div className="space-y-3">
        <p className="text-[14px] text-ink/75">
          {type === 'lead' ? 'Το lead' : 'Ο πελάτης'} θα μεταφερθεί στον <strong>Κάδο</strong> και δεν θα εμφανίζεται στις λίστες. Μπορεί να επαναφερθεί από
          {' '}<em>Διαχείριση → Κάδος</em>. Την οριστική διαγραφή την κάνει μόνο ο διαχειριστής από τον κάδο.
        </p>
        <Field label="Αιτία (προαιρετική)">
          <input className="field" value={reason} onChange={e => setReason(e.target.value)} placeholder="π.χ. διπλότυπο, λάθος στοιχεία, αίτημα πελάτη" />
        </Field>
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn variant="danger" disabled={busy} onClick={() => void submit()}>{busy ? <Spinner /> : <Trash2 className="w-3.5 h-3.5" />} Μεταφορά στον κάδο</Btn>
        </div>
      </div>
    </Modal>
  );
}

/** Shown on a record that is in the trash (only admins/managers can open one). */
export function InTrashBanner({ type, id, deletedAt, onRestored }: { type: TrashType; id: string; deletedAt: string; onRestored: () => void }) {
  const { role } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    setBusy(true);
    const e = await restoreRecord(type, id);
    setBusy(false);
    if (e) { toast(e, 'bad'); return; }
    toast('Η εγγραφή επαναφέρθηκε.', 'ok');
    onRestored();
  };
  return (
    <div className="atx-notice flex items-center gap-3 flex-wrap mt-3" role="status">
      <Trash2 size={16} className="shrink-0" />
      <span className="flex-1">Βρίσκεται στον κάδο από {fmtDateTime(deletedAt)}. Δεν εμφανίζεται στις λίστες.</span>
      {canTrash(role) && <button className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" disabled={busy} onClick={() => void restore()}><RotateCcw size={14} /> Επαναφορά</button>}
    </div>
  );
}

/** Admin Center → «Κάδος». */
export function TrashTab() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purge, setPurge] = useState<TrashRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await listTrash();
    setRows(r.rows); setError(r.error);
    return r.rows;
  }, []);
  useEffect(() => { void load(); }, [load]);

  const restore = async (r: TrashRow) => {
    setBusyId(r.id);
    const e = await restoreRecord(r.entity_type, r.id);
    const fresh = e ? null : await load();
    setBusyId(null);
    if (e) toast(e, 'bad');
    else toast(fresh && !fresh.some(x => x.id === r.id) ? `«${r.name ?? ''}» επαναφέρθηκε.` : 'Η επαναφορά δεν επιβεβαιώθηκε.', fresh && !fresh.some(x => x.id === r.id) ? 'ok' : 'bad');
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[var(--atx-muted)]">Leads και πελάτες που διαγράφηκαν. Η επαναφορά τους επιστρέφει αμετάβλητους. Οριστική διαγραφή μόνο από διαχειριστή και μόνο όταν δεν συνδέονται με cases ή άλλες εγγραφές.</p>
      {error && <div className="atx-notice" role="alert">{error}</div>}
      <div className="atx-panel" aria-busy={rows === null}>
        {rows === null && [0, 1].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}
        {rows && rows.length === 0 && !error && <div className="atx-empty !py-8"><strong>Ο κάδος είναι άδειος</strong>Δεν υπάρχουν διαγραμμένα leads ή πελάτες.</div>}
        {rows && rows.length > 0 && (
          <table className="atx-table">
            <thead><tr><th>Εγγραφή</th><th>Τύπος</th><th className="max-md:hidden">Διαγραφή</th><th className="max-md:hidden">Αιτία</th><th aria-label="Ενέργειες" /></tr></thead>
            <tbody>
              {rows.map(r => {
                const refs = describeReferences(r.references_json);
                return (
                  <tr key={`${r.entity_type}-${r.id}`} data-trash={r.name ?? r.id}>
                    <td>
                      <span className="block font-medium">{r.name || '—'}</span>
                      <span className="block text-[12.5px] text-[var(--atx-muted)]">{[r.phone, r.email].filter(Boolean).join(' · ') || '—'}{refs ? ` · συνδέεται με ${refs}` : ''}</span>
                    </td>
                    <td>{TYPE_TEXT[r.entity_type]}</td>
                    <td className="max-md:hidden text-[13px] text-[var(--atx-muted)]">{fmtDateTime(r.deleted_at)}{r.deleted_by_name ? ` · ${r.deleted_by_name}` : ''}</td>
                    <td className="max-md:hidden text-[13px] text-[var(--atx-muted)]">{r.deleted_reason || '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <span className="inline-flex gap-1.5">
                        <button className="atx-btn atx-btn-quiet !h-8 inline-flex items-center gap-1" disabled={busyId === r.id} onClick={() => void restore(r)}><RotateCcw size={14} /> Επαναφορά</button>
                        {canPurge(role) && <button className="atx-btn atx-btn-quiet !h-8 inline-flex items-center gap-1 text-[var(--atx-red)]" onClick={() => setPurge(r)}><Trash2 size={14} /> Οριστική διαγραφή</button>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {purge && <PurgeDialog row={purge} onClose={() => setPurge(null)} onDone={async () => {
        const fresh = await load();
        return !fresh.some(x => x.id === purge.id);
      }} />}
    </div>
  );
}

function PurgeDialog({ row, onClose, onDone }: { row: TrashRow; onClose: () => void; onDone: () => Promise<boolean> }) {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const word = (row.name ?? '').trim() || 'ΔΙΑΓΡΑΦΗ';
  const refs = describeReferences(row.references_json);
  const submit = async () => {
    setBusy(true); setErr(null);
    const r = await purgeRecord(row.entity_type, row.id);
    if (r.error) { setBusy(false); setErr(r.error); return; }
    const gone = await onDone();
    setBusy(false);
    toast(!gone ? 'Η διαγραφή δεν επιβεβαιώθηκε.' : r.filesLeft ? `Διαγράφηκε οριστικά· ${r.filesLeft} αρχεία δεν αφαιρέθηκαν από την αποθήκευση.` : 'Διαγράφηκε οριστικά.', gone && !r.filesLeft ? 'ok' : 'bad');
    if (gone) onClose();
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={`Οριστική διαγραφή: ${row.name ?? ''}`} micro="Κάδος">
      <div className="space-y-3">
        {refs ? (
          <div className="atx-notice">Δεν επιτρέπεται: η εγγραφή συνδέεται με {refs}. Το ιστορικό του CRM και οι συγκαταθέσεις διατηρούνται.</div>
        ) : (
          <>
            <p className="text-[14px] text-ink/75">Η εγγραφή{row.entity_type === 'lead' ? ' και τα αρχεία που έστειλε από την ιστοσελίδα' : ''} θα διαγραφούν οριστικά. Η ενέργεια δεν αναιρείται· καταγράφεται χωρίς προσωπικά δεδομένα.</p>
            <Field label={`Πληκτρολογήστε «${word}» για επιβεβαίωση`}><input className="field" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" /></Field>
          </>
        )}
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          {!refs && <Btn variant="danger" disabled={busy || confirm.trim() !== word} onClick={() => void submit()}>{busy ? <Spinner /> : <Trash2 className="w-3.5 h-3.5" />} Οριστική διαγραφή</Btn>}
        </div>
      </div>
    </Modal>
  );
}
