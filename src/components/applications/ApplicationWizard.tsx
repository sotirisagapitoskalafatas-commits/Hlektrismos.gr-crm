/* «Νέα αίτηση ενεργειακής υπηρεσίας»: five steps (Πελάτης → Παροχή → Υπηρεσία → Έγγραφα → Επιβεβαίωση). All state lives in one reducer, so moving between steps never
   loses anything; the draft is saved to the database after every step, so closing the browser loses nothing and the wizard resumes where it stopped.
   A Customer is never created here (a Lead is converted by the existing operation when the application is submitted). Missing documents warn, they never block.
   Provider / program / tariff are free text, filled only when known («Άγνωστο» is valid): no offer or price is invented. */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Check, FileUp, Plus } from 'lucide-react';
import { createLeadSupplyPoint, createSupplyPoint, fetchCustomers, fetchLeadSupplyPoints, fetchLeads, fetchSupplyPoints, findSupplyDuplicates } from '@/lib/api';
import type { Customer, Lead, SupplyDuplicate } from '@/lib/api';
import { applicationDocumentUrl, fetchApplicationDocuments, fetchServiceTypes, saveApplicationDraft, submitApplication, uploadApplicationDocument } from '@/lib/field-api';
import {
  DEFAULT_SERVICES, STEPS, canSaveDraft, canSubmit, checkUpload, checklistFor, checklistSummary, fieldsFor, groupDocuments, stepErrors, versionLabel, wizardReducer,
} from '@/lib/applications';
import type { AppDocument, ServiceType, WizardDraft } from '@/lib/applications';
import { DOC_TYPES, docLabel } from '@/lib/documents';
import { USAGES, USAGE_LABEL, draftErrors, emptyDraft } from '@/lib/supply-points';
import type { SupplyPoint, SupplyPointDraft, SupplyUsage } from '@/lib/supply-points';
import { PUBLIC_FORM_ACCEPT } from '@/lib/upload-files';
import { useToast } from '@/lib/toast';
import { Btn, Card, CardHeader, Pill, fmtDateTime } from '@/lib/ui';

const OPEN_LEAD = (l: Lead) => !['converted', 'lost', 'unqualified', 'duplicate'].includes(l.status ?? '');
const leadName = (l: Lead) => l.full_name || l.client_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Lead';
const supplyLine = (p: SupplyPoint, i: number) => `Παροχή ${i + 1} — ${USAGE_LABEL[p.usage]}${p.property_address ? ` · ${p.property_address}` : ''}${p.supply_number ? ` · ${p.supply_number}` : ''}`;

export default function ApplicationWizard({ initial, onClose, onDone }: { initial: WizardDraft; onClose: () => void; onDone: (id: string) => void }) {
  const { toast } = useToast();
  const [d, dispatch] = useReducer(wizardReducer, initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [q, setQ] = useState('');
  const [services, setServices] = useState<ServiceType[]>(DEFAULT_SERVICES);
  const [points, setPoints] = useState<SupplyPoint[] | null>(null);
  const [docs, setDocs] = useState<AppDocument[]>([]);
  const [adding, setAdding] = useState<SupplyPointDraft | null>(null);
  const [dups, setDups] = useState<SupplyDuplicate[]>([]);
  const [result, setResult] = useState<{ caseId: string | null; no: string } | null>(null);
  const stepRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => { void fetchCustomers().then(setCustomers); void fetchLeads().then(setLeads); void fetchServiceTypes().then(setServices); }, []);
  useEffect(() => { stepRef.current?.focus(); }, [d.step]);

  const loadPoints = useCallback(async () => {
    if (d.customerId) setPoints(await fetchSupplyPoints(d.customerId));
    else if (d.leadId) setPoints(await fetchLeadSupplyPoints(d.leadId));
    else setPoints(null);
  }, [d.customerId, d.leadId]);
  useEffect(() => { void loadPoints(); }, [loadPoints]);
  const loadDocs = useCallback(async () => { if (d.id) setDocs(await fetchApplicationDocuments(d.id)); }, [d.id]);
  useEffect(() => { void loadDocs(); }, [loadDocs]);

  const hits = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const m = (s: string | null | undefined) => (s ?? '').toLowerCase().includes(t);
    return [
      ...customers.filter((c) => m(c.full_name) || m(c.phone)).slice(0, 6).map((c) => ({ kind: 'customer' as const, id: c.id, name: c.full_name, phone: c.phone })),
      ...leads.filter(OPEN_LEAD).filter((l) => m(leadName(l)) || m(l.phone)).slice(0, 6).map((l) => ({ kind: 'lead' as const, id: l.id, name: leadName(l), phone: l.phone })),
    ];
  }, [q, customers, leads]);

  const errors = stepErrors(d.step, d);
  /** Saves the draft; returns the id (creating the row the first time). */
  const save = useCallback(async (next?: WizardDraft): Promise<string | null> => {
    const draft = next ?? d;
    if (!canSaveDraft(draft)) return draft.id;
    const r = await saveApplicationDraft(draft);
    if (!r.ok) { setErr(r.error); return null; }
    dispatch({ t: 'saved', id: r.id }); setSavedAt(new Date().toISOString()); setErr(null);
    return r.id;
  }, [d]);

  const go = async (step: number) => {
    setErr(null);
    if (step > d.step && Object.keys(stepErrors(d.step, d)).length) { setShowErrors(true); return; }
    setShowErrors(false); setBusy(true);
    const stepped = { ...d, step };
    const id = await save(stepped);
    setBusy(false);
    if (id === null && canSaveDraft(d)) return;          // the save failed: stay and show why
    dispatch({ t: 'go', step });
  };

  const addSupply = async () => {
    if (!adding) return;
    const e = draftErrors(adding);
    if (e.supply_number || !adding.property_address.trim()) { setShowErrors(true); return; }
    setBusy(true);
    const r = d.customerId ? await createSupplyPoint(d.customerId, adding) : d.leadId ? await createLeadSupplyPoint(d.leadId, adding) : { point: null, error: 'Επιλέξτε πρώτα πελάτη ή lead.' };
    setBusy(false);
    if (r.error || !r.point) { setErr(r.error ?? 'Η παροχή δεν αποθηκεύτηκε.'); return; }
    dispatch({ t: 'supply', id: r.point.id, label: supplyLine(r.point, (points?.length ?? 0)), usage: r.point.usage });
    setAdding(null); setDups([]); await loadPoints();
  };
  const checkDup = async (n: string) => { setDups(n.replace(/\D/g, '').length >= 8 ? (await findSupplyDuplicates(n)) ?? [] : []); };

  const upload = async (docType: string, file: File | undefined, supplyId: string | null) => {
    if (!file || !d.id) return;
    const v = checkUpload(file);
    if (!v.ok) { toast(v.error ?? 'Μη αποδεκτό αρχείο.', 'warn'); return; }
    const version = Math.max(0, ...docs.filter((x) => x.doc_type === docType && x.supply_point_id === supplyId).map((x) => x.version)) + 1;
    setBusy(true);
    const r = await uploadApplicationDocument(d.id, file, docType, version, supplyId);
    setBusy(false);
    if (!r.ok) { toast(r.error, 'bad'); return; }
    toast(version > 1 ? `Νέα έκδοση v${version} αποθηκεύτηκε. Η προηγούμενη διατηρείται.` : 'Το έγγραφο αποθηκεύτηκε.', 'ok');
    await loadDocs();
  };
  const open = async (path: string) => { const u = await applicationDocumentUrl(path); if (u) window.open(u, '_blank', 'noopener'); else toast('Το αρχείο δεν είναι διαθέσιμο.', 'warn'); };

  const submit = async () => {
    const id = d.id ?? (await save());
    if (!id) return;
    setBusy(true); const r = await submitApplication(id); setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setResult({ caseId: r.caseId, no: r.applicationNo }); toast('Η αίτηση υποβλήθηκε.', 'ok');
  };

  const items = checklistFor(d.serviceType, d.supplyUsage, docs);
  const sum = checklistSummary(items);
  const serviceLabel = services.find((s) => s.code === d.serviceType)?.label ?? d.serviceType ?? '—';
  const who = d.customerName ?? d.leadName ?? '—';

  if (result) {
    return (
      <Card><CardHeader micro="Αίτηση" title={`Η αίτηση ${result.no} υποβλήθηκε`} className="mb-3" />
        <p className="text-sm text-ink/70" role="status">Επόμενο βήμα: το Back Office παραλαμβάνει την αίτηση, ελέγχει τα στοιχεία και τα έγγραφα και τη διεκπεραιώνει. Αν λείπουν έγγραφα θα δείτε εκκρεμότητα στα follow-ups σας.</p>
        <div className="flex gap-2 mt-4">{d.id && <Btn onClick={() => onDone(d.id!)}>Άνοιγμα αίτησης</Btn>}<Btn variant="outline" onClick={onClose}>Λίστα αιτήσεων</Btn></div>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="application-wizard">
      <ol className="flex flex-wrap gap-2" aria-label="Βήματα αίτησης">
        {STEPS.map((s) => (
          <li key={s.n}><button type="button" onClick={() => void go(s.n)} aria-current={d.step === s.n ? 'step' : undefined} disabled={busy}
            className={`rounded-full px-3 py-1.5 text-[13px] border min-h-[36px] ${d.step === s.n ? 'bg-ink text-white border-ink' : 'border-line text-ink/70'}`}>{s.n} · {s.label}</button></li>
        ))}
      </ol>
      <p className="text-xs text-ink/50" role="status">{savedAt ? `Αποθηκεύτηκε ${fmtDateTime(savedAt)}. Μπορείτε να συνεχίσετε αργότερα.` : 'Το πρόχειρο αποθηκεύεται μόλις επιλέξετε πελάτη ή lead.'}</p>
      {err && <div className="atx-notice" role="alert">{err}</div>}

      <Card>
        <h2 ref={stepRef} tabIndex={-1} className="text-lg font-semibold mb-3 outline-none">{STEPS[d.step - 1].n}. {STEPS[d.step - 1].label}</h2>

        {d.step === 1 && (
          <div className="space-y-3">
            {(d.customerId || d.leadId) && (
              <div className="rounded-xl border border-line p-3 flex items-center justify-between gap-2" data-testid="wizard-origin">
                <span><Pill tone={d.customerId ? 'green' : 'blue'}>{d.customerId ? 'Πελάτης' : 'Lead'}</Pill> <strong className="ml-1">{who}</strong></span>
                <Btn variant="outline" onClick={() => dispatch({ t: 'origin', customer: null, lead: null })}>Αλλαγή</Btn>
              </div>
            )}
            {!d.customerId && !d.leadId && (
              <>
                <label className="block"><span className="micro text-ink/40 mb-1.5 block">Αναζήτηση πελάτη ή lead (όνομα ή τηλέφωνο)</span>
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="π.χ. Παπαδοπούλου ή 69…" aria-label="Αναζήτηση πελάτη ή lead" /></label>
                {q.trim().length >= 2 && hits.length === 0 && <p className="text-sm text-ink/60">Δεν βρέθηκε. Ένας νέος πελάτης δημιουργείται μόνο από lead (Leads → Νέο Lead → Μετατροπή σε Case): η αίτηση δεν δημιουργεί πελάτες.</p>}
                <ul className="space-y-1.5">{hits.map((h) => (
                  <li key={`${h.kind}-${h.id}`}><button type="button" className="w-full text-left rounded-xl border border-line px-3 py-2 min-h-[44px] hover:bg-ink/[0.03]"
                    onClick={() => dispatch({ t: 'origin', customer: h.kind === 'customer' ? { id: h.id, name: h.name } : null, lead: h.kind === 'lead' ? { id: h.id, name: h.name } : null })}>
                    <Pill tone={h.kind === 'customer' ? 'green' : 'blue'}>{h.kind === 'customer' ? 'Πελάτης' : 'Lead'}</Pill> <strong className="ml-1">{h.name}</strong> <span className="text-ink/50 text-xs">{h.phone ?? ''}</span></button></li>))}</ul>
              </>
            )}
            {showErrors && errors.origin && <p className="text-sm text-bad-600" role="alert">{errors.origin}</p>}
          </div>
        )}

        {d.step === 2 && (
          <div className="space-y-3">
            <p className="text-sm text-ink/60">Η αίτηση αφορά <strong>μία</strong> παροχή. Ένας πελάτης μπορεί να έχει πολλές· κάθε παροχή έχει δικές της αιτήσεις και έγγραφα.</p>
            {points === null && <p className="text-sm text-ink/60">Οι παροχές δεν είναι ακόμη διαθέσιμες.</p>}
            <ul className="space-y-1.5" role="radiogroup" aria-label="Παροχές">{(points ?? []).filter((p) => !p.archived_at).map((p, i) => (
              <li key={p.id}><label className={`flex items-start gap-2 rounded-xl border px-3 py-2 min-h-[44px] cursor-pointer ${d.supplyPointId === p.id ? 'border-ink bg-ink/[0.03]' : 'border-line'}`}>
                <input type="radio" name="supply" checked={d.supplyPointId === p.id} onChange={() => dispatch({ t: 'supply', id: p.id, label: supplyLine(p, i), usage: p.usage })} />
                <span className="text-sm">{supplyLine(p, i)} {p.needs_review && <Pill tone="amber">Προς έλεγχο</Pill>}</span></label></li>))}</ul>
            {!adding && <Btn variant="outline" onClick={() => setAdding(emptyDraft())}><Plus className="w-4 h-4 inline mr-1" aria-hidden="true" />Προσθήκη νέας παροχής</Btn>}
            {adding && (
              <div className="rounded-xl border border-line p-3 space-y-2" data-testid="wizard-new-supply">
                <div className="grid sm:grid-cols-2 gap-2">
                  <label className="block"><span className="micro text-ink/40 mb-1 block">Είδος</span>
                    <select className="field" value={adding.usage} onChange={(e) => setAdding({ ...adding, usage: e.target.value as SupplyUsage })}>{USAGES.map((u) => <option key={u} value={u}>{USAGE_LABEL[u]}</option>)}</select></label>
                  <label className="block"><span className="micro text-ink/40 mb-1 block">Διεύθυνση ακινήτου *</span>
                    <input className="field" value={adding.property_address} onChange={(e) => setAdding({ ...adding, property_address: e.target.value })} aria-invalid={showErrors && !adding.property_address.trim()} /></label>
                  <label className="block"><span className="micro text-ink/40 mb-1 block">Αριθμός Παροχής (11 ψηφία)</span>
                    <input className="field" inputMode="numeric" value={adding.supply_number} onChange={(e) => { setAdding({ ...adding, supply_number: e.target.value }); void checkDup(e.target.value); }} aria-invalid={!!draftErrors(adding).supply_number} /></label>
                  <label className="block"><span className="micro text-ink/40 mb-1 block">Αριθμός μετρητή</span>
                    <input className="field" value={adding.meter_identifier} onChange={(e) => setAdding({ ...adding, meter_identifier: e.target.value })} /></label>
                </div>
                {draftErrors(adding).supply_number && <p className="text-xs text-warn-600">{draftErrors(adding).supply_number} Δεν σας εμποδίζει να συνεχίσετε.</p>}
                {dups.length > 0 && <p className="text-xs text-warn-600" role="status">Υπάρχει ήδη παροχή με αυτόν τον αριθμό ({dups.length}). Θα σημειωθεί «Προς έλεγχο»· τίποτα δεν συγχωνεύεται αυτόματα.</p>}
                <div className="flex gap-2"><Btn onClick={() => void addSupply()} disabled={busy}>Αποθήκευση παροχής</Btn><Btn variant="outline" onClick={() => { setAdding(null); setDups([]); }}>Άκυρο</Btn></div>
              </div>
            )}
            {showErrors && errors.supply && <p className="text-sm text-bad-600" role="alert">{errors.supply}</p>}
          </div>
        )}

        {d.step === 3 && (
          <div className="space-y-3">
            <label className="block"><span className="micro text-ink/40 mb-1.5 block">Υπηρεσία *</span>
              <select className="field" value={d.serviceType ?? ''} onChange={(e) => dispatch({ t: 'service', code: e.target.value || null })} aria-invalid={showErrors && !!errors.service}>
                <option value="">— Επιλέξτε —</option>{services.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}</select></label>
            {showErrors && errors.service && <p className="text-sm text-bad-600" role="alert">{errors.service}</p>}
            {fieldsFor(d.serviceType).length > 0 && (
              <div className="grid sm:grid-cols-3 gap-2">
                {fieldsFor(d.serviceType).includes('provider') && <label className="block"><span className="micro text-ink/40 mb-1 block">Πάροχος</span><input className="field" value={d.provider} onChange={(e) => dispatch({ t: 'field', field: 'provider', value: e.target.value })} placeholder="Άγνωστο" /></label>}
                {fieldsFor(d.serviceType).includes('program') && <label className="block"><span className="micro text-ink/40 mb-1 block">Πρόγραμμα</span><input className="field" value={d.program} onChange={(e) => dispatch({ t: 'field', field: 'program', value: e.target.value })} placeholder="Άγνωστο" /></label>}
                {fieldsFor(d.serviceType).includes('tariff') && <label className="block"><span className="micro text-ink/40 mb-1 block">Τιμολόγιο</span><input className="field" value={d.tariff} onChange={(e) => dispatch({ t: 'field', field: 'tariff', value: e.target.value })} placeholder="Άγνωστο" /></label>}
              </div>
            )}
            <p className="text-xs text-ink/50">Συμπληρώστε πάροχο, πρόγραμμα και τιμολόγιο μόνο όταν είναι γνωστά και επιβεβαιωμένα. Δεν υπάρχουν προεπιλεγμένες προσφορές ή τιμές.</p>
            <label className="block"><span className="micro text-ink/40 mb-1.5 block">Σημειώσεις</span>
              <textarea className="field min-h-[80px]" value={d.notes} onChange={(e) => dispatch({ t: 'field', field: 'notes', value: e.target.value })} /></label>
          </div>
        )}

        {d.step === 4 && (
          <div className="space-y-3">
            {!d.id && <p className="text-sm text-ink/60">Αποθηκεύστε πρώτα το πρόχειρο (επιλέξτε πελάτη ή lead) για να ανεβάσετε έγγραφα.</p>}
            <p className="text-sm text-ink/60">Ενδεικτική λίστα για παρόχους ενέργειας στην Ελλάδα· τα ακριβή δικαιολογητικά διαφέρουν ανά πάροχο. <strong>Μπορείτε να συνεχίσετε και χωρίς όλα τα έγγραφα.</strong></p>
            <p className="text-sm" role="status">{sum.done} από {sum.total} απαιτούμενα έγγραφα{sum.missing.length ? ` · λείπουν: ${sum.missing.join(', ')}` : ''}</p>
            <ul className="space-y-1.5" aria-label="Έγγραφα που απαιτούνται">{items.map((it) => (
              <li key={it.label} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
                <span className="text-sm">{it.label}{!it.required && <span className="text-ink/40"> (προαιρετικό)</span>}</span>
                <span className="flex items-center gap-2">
                  <Pill tone={it.status === 'verified' ? 'green' : it.status === 'received' ? 'blue' : it.status === 'rejected' ? 'red' : 'amber'}>{{ verified: 'Ελέγχθηκε', received: 'Παραλήφθηκε', rejected: 'Απορρίφθηκε', missing: 'Λείπει' }[it.status]}</Pill>
                  <label className="cursor-pointer text-[13px] underline"><FileUp className="inline w-4 h-4 mr-1" aria-hidden="true" />Ανέβασμα
                    <input type="file" className="sr-only" accept={PUBLIC_FORM_ACCEPT} disabled={!d.id || busy} aria-label={`Ανέβασμα: ${it.label}`}
                      onChange={(e) => { void upload(it.anyOf[0], e.target.files?.[0], d.supplyPointId); e.target.value = ''; }} /></label>
                </span></li>))}</ul>
            <label className="block"><span className="micro text-ink/40 mb-1 block">Άλλο έγγραφο</span>
              <select className="field" defaultValue="" disabled={!d.id || busy} aria-label="Τύπος άλλου εγγράφου" onChange={(e) => { const t = e.target.value; const inp = document.getElementById('wizard-other-file') as HTMLInputElement | null; if (t && inp) { inp.dataset.type = t; inp.click(); } e.target.value = ''; }}>
                <option value="">— Επιλέξτε τύπο και αρχείο —</option>{DOC_TYPES.filter((t) => !t.legacy).map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
              <input id="wizard-other-file" type="file" className="sr-only" accept={PUBLIC_FORM_ACCEPT} onChange={(e) => { void upload(e.target.dataset.type ?? 'other', e.target.files?.[0], d.supplyPointId); e.target.value = ''; }} /></label>
            <DocumentHistory docs={docs} onOpen={open} />
          </div>
        )}

        {d.step === 5 && (
          <div className="space-y-3" data-testid="wizard-summary">
            <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><dt className="micro text-ink/40">Πελάτης / Lead</dt><dd>{who}</dd></div>
              <div><dt className="micro text-ink/40">Παροχή</dt><dd>{d.supplyLabel ?? '—'}</dd></div>
              <div><dt className="micro text-ink/40">Υπηρεσία</dt><dd>{serviceLabel}{d.provider ? ` · ${d.provider}` : ''}{d.program ? ` · ${d.program}` : ''}{d.tariff ? ` · ${d.tariff}` : ''}</dd></div>
              <div><dt className="micro text-ink/40">Έγγραφα</dt><dd>{sum.done}/{sum.total} απαιτούμενα{sum.missing.length ? <span className="text-warn-600"> · λείπουν: {sum.missing.join(', ')}</span> : null}</dd></div>
            </dl>
            {sum.missing.length > 0 && <p className="text-sm text-warn-600" role="note">Λείπουν έγγραφα. Μπορείτε να υποβάλετε ή να αποθηκεύσετε ως πρόχειρο· το Back Office θα ζητήσει ό,τι χρειάζεται.</p>}
            {Object.keys(stepErrors(3, d)).length > 0 && <ul className="text-sm text-bad-600" role="alert">{Object.values(stepErrors(3, d)).map((m) => <li key={m}>{m}</li>)}</ul>}
            <p className="text-xs text-ink/50">Με την υποβολή δημιουργείται το Case διεκπεραίωσης για το Back Office. Μέχρι τότε η αίτηση παραμένει πρόχειρη.</p>
            <div className="flex flex-wrap gap-2"><Btn onClick={() => void submit()} disabled={busy || !canSubmit({ ...d, id: d.id ?? 'x' })}><Check className="w-4 h-4 inline mr-1" aria-hidden="true" />Υποβολή</Btn>
              <Btn variant="outline" onClick={() => void save().then((id) => { if (id) toast('Αποθηκεύτηκε ως πρόχειρο.', 'ok'); })} disabled={busy || !canSaveDraft(d)}>Αποθήκευση πρόχειρου</Btn></div>
          </div>
        )}
      </Card>

      <div className="flex justify-between">
        <Btn variant="outline" onClick={() => (d.step === 1 ? onClose() : void go(d.step - 1))} disabled={busy}>{d.step === 1 ? 'Άκυρο' : 'Πίσω'}</Btn>
        {d.step < 5 && <Btn onClick={() => void go(d.step + 1)} disabled={busy}>Επόμενο</Btn>}
      </div>
    </div>
  );
}

/** Every document with its full version history; a replacement never hides the previous file. */
export function DocumentHistory({ docs, onOpen }: { docs: AppDocument[]; onOpen: (path: string) => void }) {
  const groups = groupDocuments(docs);
  if (!groups.length) return <p className="text-sm text-ink/50">Δεν έχουν ανέβει έγγραφα ακόμη.</p>;
  return (
    <ul className="space-y-2" aria-label="Έγγραφα και εκδόσεις">{groups.map((g) => (
      <li key={g.key} className="rounded-xl border border-line p-3">
        <div className="text-sm font-medium">{g.label}</div>
        {g.current && <div className="text-sm flex items-center gap-2 mt-1"><Pill tone="green">{versionLabel(g.current)}</Pill><button type="button" className="underline text-left" onClick={() => onOpen(g.current!.storage_path)}>{g.current.file_name || docLabel(g.docType)}</button></div>}
        {g.history.length > 0 && (
          <details className="mt-1.5"><summary className="text-xs text-ink/60 cursor-pointer">Ιστορικό εκδόσεων ({g.history.length})</summary>
            <ul className="mt-1 space-y-1">{g.history.map((h) => <li key={h.id} className="text-xs flex items-center gap-2"><Pill tone="gray">{versionLabel(h)}</Pill><button type="button" className="underline" onClick={() => onOpen(h.storage_path)}>{h.file_name}</button></li>)}</ul></details>
        )}
      </li>))}
    </ul>
  );
}
