/* Case documents — "what is this file?" comes FIRST.
   Every upload (file or camera) starts by choosing the document type from the Greek energy-provider catalog
   (lib/documents.ts); only then is the file chosen. A checklist shows the typical documents for this case and
   what is still missing. Uses the existing upload/insert/verify API; no schema change. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Check, FileText, FolderOpen, Plus, Upload, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { can, DOC_STATUSES } from '@/lib/roles';
import { addDocument, fetchDocuments, getDocumentUrl, setDocumentStatus, uploadDocumentFile } from '@/lib/api';
import type { Case, CaseDocument } from '@/lib/api';
import { buildChecklist, docLabel, DOC_GROUP_LABEL, uploadableDocTypes } from '@/lib/documents';
import type { DocGroup } from '@/lib/documents';
import { Btn, Card, CardHeader, EmptyState, Modal, Pill, Spinner, fmtDateTime } from '@/lib/ui';
import { useToast } from '@/lib/toast';
import CaptureModal from '@/components/app/CaptureModal';

const ACCEPT = 'image/*,application/pdf';
const MAX_MB = 15;

const STATUS_TONE: Record<string, 'green' | 'amber' | 'red' | 'gray'> = { verified: 'green', received: 'amber', rejected: 'red', missing: 'gray' };
const STATUS_TEXT: Record<string, string> = { verified: 'Ελέγχθηκε', received: 'Παραλήφθηκε', rejected: 'Απορρίφθηκε', missing: 'Λείπει' };

export default function CaseDocuments({ c, onChanged }: { c: Case; onChanged?: () => void }) {
  const { role } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<CaseDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [picker, setPicker] = useState<{ open: boolean; type: string; note: string }>({ open: false, type: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const canAdd = can(role, 'add_document');
  const canVerify = can(role, 'verify_document');

  const load = useCallback(async () => {
    const docs = await fetchDocuments(c.id);
    setItems(docs);
    setLoading(false);
    const resolved: Record<string, string> = {};
    for (const d of docs) {
      const u = await getDocumentUrl(d.file_url);
      if (u) resolved[d.id] = u;
    }
    setUrls(resolved);
  }, [c.id]);
  useEffect(() => { void load(); }, [load]);

  const checklist = useMemo(() => buildChecklist(c, items), [c, items]);
  const missingRequired = checklist.filter(i => i.required && (i.status === 'missing' || i.status === 'rejected')).length;

  const openPicker = (type = '') => setPicker({ open: true, type, note: '' });
  const closePicker = () => { if (!busy) setPicker(p => ({ ...p, open: false })); };

  const save = async (file: File) => {
    if (!picker.type) return;
    if (file.size > MAX_MB * 1024 * 1024) { toast(`Το αρχείο ξεπερνά τα ${MAX_MB} MB.`, 'bad'); return; }
    setBusy(true);
    const up = await uploadDocumentFile(file);
    const row = up
      ? await addDocument(c.id, { category: picker.type, file_name: up.name, file_url: up.path, mime_type: up.mime, size: up.size, description: picker.note || undefined })
      : null;
    setBusy(false);
    if (!row) { toast('Το έγγραφο δεν αποθηκεύτηκε. Δοκιμάστε ξανά.', 'bad'); return; }
    toast(`Αποθηκεύτηκε: ${docLabel(picker.type)}`, 'ok');
    setPicker({ open: false, type: '', note: '' });
    void load();
    onChanged?.();
  };

  const setStatus = async (d: CaseDocument, status: 'verified' | 'rejected') => {
    await setDocumentStatus(d.id, status);
    await load();
    onChanged?.();
  };

  const groups = useMemo(() => {
    const m = new Map<DocGroup, ReturnType<typeof uploadableDocTypes>>();
    for (const t of uploadableDocTypes()) m.set(t.group, [...(m.get(t.group) ?? []), t]);
    return [...m.entries()];
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader micro="Δικαιολογητικά" title="Τι χρειάζεται αυτό το case"
          action={<Pill tone={missingRequired ? 'amber' : 'green'}>{missingRequired ? `Λείπουν ${missingRequired}` : 'Πλήρη'}</Pill>} />
        <ul className="divide-y divide-line">
          {checklist.map(i => (
            <li key={i.anyOf.join('|')} className="flex items-center gap-3 py-2.5 flex-wrap">
              <span className="flex-1 min-w-[200px]">
                <span className="block text-[14px] font-medium text-ink">{i.label}{!i.required && <span className="text-ink/45 font-normal"> · προαιρετικό</span>}</span>
                {i.viaLegacy && <span className="block text-xs text-ink/50">Καλύπτεται από έγγραφο παλαιάς, γενικής κατηγορίας — επιβεβαιώστε.</span>}
              </span>
              <Pill tone={STATUS_TONE[i.status]}>{STATUS_TEXT[i.status]}</Pill>
              {canAdd && (i.status === 'missing' || i.status === 'rejected') && (
                <Btn variant="outline" onClick={() => openPicker(i.anyOf[0])}><Upload className="w-3.5 h-3.5" /> Ανέβασμα</Btn>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink/50 mt-3">Ενδεικτική λίστα για παρόχους ενέργειας στην Ελλάδα. Τα ακριβή δικαιολογητικά διαφέρουν ανά πάροχο — επιβεβαιώστε με την αίτηση του παρόχου.</p>
      </Card>

      <Card>
        <CardHeader micro="Αρχεία" title="Έγγραφα"
          action={canAdd ? <Btn onClick={() => openPicker()}><Plus className="w-3.5 h-3.5" /> Προσθήκη εγγράφου</Btn> : undefined} />
        {loading && <div className="flex justify-center py-8"><Spinner /></div>}
        {!loading && items.length === 0 && <EmptyState icon={FolderOpen} title="Δεν υπάρχουν έγγραφα" hint="Πατήστε «Προσθήκη εγγράφου» και επιλέξτε πρώτα τον τύπο του εγγράφου." />}
        <div className="space-y-2">
          {items.map(d => (
            <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl border border-line bg-white flex-wrap">
              <span className="w-8 h-8 rounded-lg bg-ink/[0.05] flex items-center justify-center shrink-0"><FileText className="w-4 h-4 text-ink/60" /></span>
              <div className="flex-1 min-w-[180px]">
                <div className="text-[14px] font-medium text-ink">{docLabel(d.category)}</div>
                <div className="text-xs text-ink/50 truncate">{[d.description, d.file_name, fmtDateTime(d.created_at)].filter(Boolean).join(' · ')}</div>
                {urls[d.id] && <a href={urls[d.id]} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">Άνοιγμα αρχείου ↗</a>}
              </div>
              <Pill tone={STATUS_TONE[d.status] ?? 'gray'}>{DOC_STATUSES[d.status] ?? d.status}</Pill>
              {canVerify && d.status !== 'verified' && <Btn variant="ok" onClick={() => void setStatus(d, 'verified')}><Check className="w-3.5 h-3.5" /> Έλεγχος</Btn>}
              {canVerify && d.status !== 'rejected' && <Btn variant="danger" onClick={() => void setStatus(d, 'rejected')}>Απόρριψη</Btn>}
            </div>
          ))}
        </div>
      </Card>

      <Modal open={picker.open} onClose={closePicker} title="Τι έγγραφο ανεβάζετε;" micro="Βήμα 1 από 2" wide>
        <div className="space-y-4 max-h-[52vh] overflow-y-auto pr-1" role="radiogroup" aria-label="Τύπος εγγράφου">
          {groups.map(([g, types]) => (
            <div key={g}>
              <div className="text-xs font-semibold text-ink/50 mb-1.5">{DOC_GROUP_LABEL[g]}</div>
              <div className="grid sm:grid-cols-2 gap-2">
                {types.map(t => (
                  <button key={t.key} type="button" role="radio" aria-checked={picker.type === t.key}
                    onClick={() => setPicker(p => ({ ...p, type: t.key }))}
                    className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${picker.type === t.key ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100' : 'border-line hover:bg-ink/[0.03]'}`}>
                    <span className="block text-[14px] font-medium text-ink">{t.label}</span>
                    <span className="block text-xs text-ink/50">{t.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <input className="field mt-4" value={picker.note} onChange={e => setPicker(p => ({ ...p, note: e.target.value }))}
          placeholder={picker.type === 'other' ? 'Τι είναι το έγγραφο; (απαιτείται)' : 'Σχόλιο (προαιρετικό)'} aria-label="Σχόλιο εγγράφου" />
        <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs text-ink/50">Βήμα 2: επιλέξτε αρχείο (PDF ή εικόνα, έως {MAX_MB} MB) ή φωτογραφίστε.</span>
          <div className="flex gap-2">
            <Btn variant="outline" disabled={busy} onClick={closePicker}><X className="w-3.5 h-3.5" /> Άκυρο</Btn>
            <Btn variant="outline" disabled={!picker.type || busy || (picker.type === 'other' && !picker.note.trim())} onClick={() => setCaptureOpen(true)}>
              <Camera className="w-3.5 h-3.5" /> Κάμερα
            </Btn>
            <Btn disabled={!picker.type || busy || (picker.type === 'other' && !picker.note.trim())} onClick={() => fileRef.current?.click()}>
              {busy ? <Spinner /> : <Upload className="w-3.5 h-3.5" />} Επιλογή αρχείου
            </Btn>
          </div>
        </div>
        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void save(f); }} />
      </Modal>

      <CaptureModal open={captureOpen} title={picker.type ? `Φωτογραφία: ${docLabel(picker.type)}` : 'Φωτογραφία'}
        onClose={() => setCaptureOpen(false)} onCapture={async f => { setCaptureOpen(false); await save(f); }} />
    </div>
  );
}
