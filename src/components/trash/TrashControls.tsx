/* Trash controls for leads, customers and cases. The database authorizes all mutations. */
import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Btn, Field, Modal, Spinner, fmtDateTime } from '@/lib/ui';
import { canPurge, canTrash, describeReferences, listTrash, purgeRecord, restoreRecord, trashRecord } from '@/lib/trash';
import type { TrashRow, TrashType } from '@/lib/trash';

const TYPE_TEXT: Record<TrashType, string> = { lead: 'Lead', customer: 'Πελάτης', case: 'Case' };

export function TrashButton({ type, id, name, onTrashed, compact }: { type: TrashType; id: string; name: string; onTrashed: () => Promise<boolean> | void; compact?: boolean }) {
  const { role } = useAuth();
  const [open, setOpen] = useState(false);
  if (!canTrash(role)) return null;
  return (
    <>
      {compact
        ? <button type="button" title="Διαγραφή (μεταφορά στον κάδο)" aria-label={'Διαγραφή ' + name} onClick={() => setOpen(true)}
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
    toast(verified === false ? 'Η μεταφορά δεν επιβεβαιώθηκε — ελέγξτε τη λίστα.' : '«' + name + '» μεταφέρθηκε στον κάδο.', verified === false ? 'bad' : 'ok');
    onClose();
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={'Διαγραφή: ' + name} micro={TYPE_TEXT[type]}>
      <div className="space-y-3">
        <p className="text-[14px] text-ink/75">
          {type === 'lead' ? 'Το lead' : type === 'case' ? 'Το case' : 'Ο πελάτης'} θα μεταφερθεί στον <strong>Κάδο</strong> και δεν θα εμφανίζεται στις λίστες.
          Μπορεί να επαναφερθεί από <em>Διαχείριση → Κάδος</em>. Την οριστική διαγραφή την κάνει μόνο ο διαχειριστής από τον κάδο.
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

/** Banner shown on records that are in Trash. */
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

/** Admin Center → Trash. Supports selecting and permanently deleting multiple records in one action. */
export function TrashTab() {
  const { role } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purge, setPurge] = useState<TrashRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkReport, setBulkReport] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await listTrash();
    setRows(r.rows); setError(r.error);
    return r.rows;
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rowKey = (r: TrashRow) => r.entity_type + ':' + r.id;
  const selectedRows = (rows ?? []).filter(r => selected.has(rowKey(r)));
  const allSelected = !!rows?.length && rows.every(r => selected.has(rowKey(r)));
  const toggleRow = (r: TrashRow, checked: boolean) => setSelected(prev => {
    const next = new Set(prev);
    if (checked) next.add(rowKey(r)); else next.delete(rowKey(r));
    return next;
  });
  const toggleAll = (checked: boolean) => setSelected(checked ? new Set((rows ?? []).map(rowKey)) : new Set());

  const bulkPurge = async () => {
    const candidates = selectedRows;
    let deleted = 0;
    let filesLeft = 0;
    const failures: string[] = [];
    for (const row of candidates) {
      const refs = describeReferences(row.references_json);
      if (refs) { failures.push((row.name || TYPE_TEXT[row.entity_type]) + ': συνδέεται με ' + refs); continue; }
      const result = await purgeRecord(row.entity_type, row.id);
      if (result.error) failures.push((row.name || TYPE_TEXT[row.entity_type]) + ': ' + result.error);
      else { deleted++; filesLeft += result.filesLeft; }
    }
    await load();
    setSelected(new Set());
    setBulkConfirmOpen(false);
    const summary = 'Διαγράφηκαν οριστικά ' + deleted + ' από ' + candidates.length + ' εγγραφές.'
      + (filesLeft ? ' Δεν αφαιρέθηκαν ' + filesLeft + ' αρχεία από την αποθήκευση.' : '')
      + (failures.length ? ' ' + failures.length + ' παραλείφθηκαν λόγω συνδέσεων ή σφάλματος.' : '');
    setBulkReport(failures.length ? summary + ' ' + failures.slice(0, 3).join(' · ') : summary);
    toast(summary, deleted > 0 && failures.length === 0 && filesLeft === 0 ? 'ok' : 'bad');
  };

  const restore = async (r: TrashRow) => {
    setBusyId(r.id);
    const e = await restoreRecord(r.entity_type, r.id);
    const fresh = e ? null : await load();
    setBusyId(null);
    if (e) toast(e, 'bad');
    else {
      setSelected(prev => { const next = new Set(prev); next.delete(rowKey(r)); return next; });
      toast(fresh && !fresh.some(x => x.id === r.id && x.entity_type === r.entity_type) ? '«' + (r.name ?? '') + '» επαναφέρθηκε.' : 'Η επαναφορά δεν επιβεβαιώθηκε.', fresh && !fresh.some(x => x.id === r.id && x.entity_type === r.entity_type) ? 'ok' : 'bad');
    }
  };

  if (!canPurge(role)) return <div className="atx-notice">Μόνο ο διαχειριστής έχει πρόσβαση στον Κάδο.</div>;

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-[var(--atx-muted)]">Leads, πελάτες και cases που μεταφέρθηκαν στον κάδο. Μπορείτε να επαναφέρετε εγγραφές ή να επιλέξετε πολλές για οριστική διαγραφή. Οι συνδεδεμένες εγγραφές προστατεύονται.</p>
      {error && <div className="atx-notice" role="alert">{error}</div>}
      {bulkReport && <div className="atx-notice" role="status">{bulkReport}</div>}
      {rows && rows.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="inline-flex items-center gap-2 text-[13px] text-[var(--atx-muted)]">
            <input type="checkbox" checked={allSelected} onChange={e => toggleAll(e.target.checked)} aria-label="Επιλογή όλων στον κάδο" />
            Επιλογή όλων ({rows.length})
          </label>
          <span className="flex-1" />
          <button type="button" className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5 text-[var(--atx-red)]"
            disabled={selectedRows.length === 0} onClick={() => setBulkConfirmOpen(true)}>
            <Trash2 size={14} /> Οριστική διαγραφή ({selectedRows.length})
          </button>
        </div>
      )}
      <div className="atx-panel" aria-busy={rows === null}>
        {rows === null && [0, 1].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}
        {rows && rows.length === 0 && !error && <div className="atx-empty !py-8"><strong>Ο κάδος είναι άδειος</strong>Δεν υπάρχουν διαγραμμένα leads, πελάτες ή cases.</div>}
        {rows && rows.length > 0 && (
          <table className="atx-table">
            <thead><tr><th aria-label="Επιλογή" /><th>Εγγραφή</th><th>Τύπος</th><th className="max-md:hidden">Διαγραφή</th><th className="max-md:hidden">Αιτία</th><th aria-label="Ενέργειες" /></tr></thead>
            <tbody>
              {rows.map(r => {
                const refs = describeReferences(r.references_json);
                return (
                  <tr key={r.entity_type + '-' + r.id} data-trash={r.name ?? r.id}>
                    <td><input type="checkbox" checked={selected.has(rowKey(r))} onChange={e => toggleRow(r, e.target.checked)}
                      aria-label={'Επιλογή ' + (r.name ?? TYPE_TEXT[r.entity_type])} /></td>
                    <td>
                      <span className="block font-medium">{r.name || '—'}</span>
                      <span className="block text-[12.5px] text-[var(--atx-muted)]">{[r.phone, r.email].filter(Boolean).join(' · ') || '—'}{refs ? ' · συνδέεται με ' + refs : ''}</span>
                    </td>
                    <td>{TYPE_TEXT[r.entity_type]}</td>
                    <td className="max-md:hidden text-[13px] text-[var(--atx-muted)]">{fmtDateTime(r.deleted_at)}{r.deleted_by_name ? ' · ' + r.deleted_by_name : ''}</td>
                    <td className="max-md:hidden text-[13px] text-[var(--atx-muted)]">{r.deleted_reason || '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <span className="inline-flex gap-1.5">
                        <button className="atx-btn atx-btn-quiet !h-8 inline-flex items-center gap-1" disabled={busyId === r.id} onClick={() => void restore(r)}><RotateCcw size={14} /> Επαναφορά</button>
                        {canPurge(role) && <button className="atx-btn atx-btn-quiet !h-8 inline-flex items-center gap-1 text-[var(--atx-red)]"
                          disabled={!!refs} title={refs || 'Οριστική διαγραφή'} onClick={() => setPurge(r)}><Trash2 size={14} /> Οριστική διαγραφή</button>}
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
        return !fresh.some(x => x.id === purge.id && x.entity_type === purge.entity_type);
      }} />}
      {bulkConfirmOpen && <BulkPurgeDialog count={selectedRows.length} onClose={() => setBulkConfirmOpen(false)} onConfirm={bulkPurge} />}
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
    toast(!gone ? 'Η διαγραφή δεν επιβεβαιώθηκε.' : r.filesLeft ? 'Διαγράφηκε οριστικά· ' + r.filesLeft + ' αρχεία δεν αφαιρέθηκαν από την αποθήκευση.' : 'Διαγράφηκε οριστικά.', gone && !r.filesLeft ? 'ok' : 'bad');
    if (gone) onClose();
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={'Οριστική διαγραφή: ' + (row.name ?? '')} micro="Κάδος">
      <div className="space-y-3">
        {refs ? (
          <div className="atx-notice">Δεν επιτρέπεται: η εγγραφή συνδέεται με {refs}. Τα συνδεδεμένα δεδομένα διατηρούνται.</div>
        ) : (
          <>
            <p className="text-[14px] text-ink/75">Η εγγραφή{row.entity_type === 'lead' ? ' και τα αρχεία που έστειλε από την ιστοσελίδα' : row.entity_type === 'case' ? ' και τα αρχεία που ανήκουν αποκλειστικά στο case' : ''} θα διαγραφούν οριστικά. Η ενέργεια δεν αναιρείται· καταγράφεται χωρίς προσωπικά δεδομένα.</p>
            <Field label={'Πληκτρολογήστε «' + word + '» για επιβεβαίωση'}><input className="field" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" /></Field>
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

function BulkPurgeDialog({ count, onClose, onConfirm }: { count: number; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const expected = 'ΔΙΑΓΡΑΦΗ ' + count;
  return (
    <Modal open onClose={() => !busy && onClose()} title={'Οριστική διαγραφή ' + count + ' εγγραφών'} micro="Μαζική ενέργεια στον Κάδο">
      <div className="space-y-3">
        <p className="text-[14px] text-ink/75">Η ενέργεια δεν αναιρείται. Κάθε εγγραφή ελέγχεται από τη βάση· εγγραφές που συνδέονται με άλλες εγγραφές θα παραμείνουν στον κάδο.</p>
        <Field label={'Πληκτρολογήστε «' + expected + '» για επιβεβαίωση'}>
          <input className="field" value={confirm} onChange={e => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn variant="danger" disabled={busy || confirm.trim() !== expected} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}>
            {busy ? <Spinner /> : <Trash2 className="w-3.5 h-3.5" />} Οριστική διαγραφή
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
