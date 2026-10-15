/* «Επικοινωνία & συγκαταθέσεις» — on a lead or a customer. Before anyone phones or writes for sales, it says per channel
   whether promotional contact is allowed and why not (objection, Article 11 register, consent, hours), from the same
   decision the server enforces. Anyone on staff can record «δεν θέλει επικοινωνία»; consent and register checks need
   evidence and Back Office / manager / admin; lifting an objection is admin-only. Display is not authorization. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, ShieldCheck, ShieldOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Btn, Field, Modal, Spinner, fmtDateTime } from '@/lib/ui';
import {
  CHANNEL_TEXT, SCOPE_TEXT, SOURCE_TEXT, canLiftObjection, canRecordEvidence, evaluate, fetchContactFacts, groupObjections, liftObjection,
  reasonText, recordArticle11, recordConsent, recordObjection, withdrawConsent,
} from '@/lib/contact-eligibility';
import type { Channel, ContactFacts, Subject } from '@/lib/contact-eligibility';

type Dialog = null | 'objection' | 'article11' | 'consent' | 'withdraw' | { lift: string };

const today = () => new Date().toISOString().slice(0, 10);

export default function ContactEligibility({ subject }: { subject: Subject }) {
  const { role } = useAuth();
  const [facts, setFacts] = useState<ContactFacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    const r = await fetchContactFacts(subject.phone, subject.email);
    setFacts(r.facts);
    setError(r.error);
  }, [subject.phone, subject.email]);
  useEffect(() => { void load(); }, [load]);

  const verdicts = useMemo(() => (facts ? evaluate(facts) : []), [facts]);
  const objections = useMemo(() => (facts ? groupObjections(facts.objections) : []), [facts]);
  const evidence = canRecordEvidence(role);

  return (
    <div className="atx-panel" style={{ padding: 20 }} aria-label="Επικοινωνία και συγκαταθέσεις" data-contact-eligibility>
      <h2 className="atx-section-title mb-1 flex items-center gap-1.5"><ShieldCheck size={15} aria-hidden="true" /> Επικοινωνία & συγκαταθέσεις</h2>
      <p className="text-[12.5px] text-[var(--atx-muted)] mb-3">Για προωθητική επικοινωνία. Απάντηση σε δικό του αίτημα δεν είναι προώθηση.</p>

      {error && <div className="atx-notice" role="status">{error}</div>}
      {!error && !facts && <div className="atx-skeleton" />}

      {facts && (
        <>
          <ul className="m-0 p-0 list-none space-y-2.5">
            {verdicts.map(v => (
              <li key={v.channel} className="flex gap-2.5" data-channel={v.channel} data-allowed={v.allowed ? 'yes' : 'no'}>
                {v.allowed
                  ? <CheckCircle2 size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--atx-green, #15803d)' }} aria-hidden="true" />
                  : <Ban size={16} className="shrink-0 mt-0.5" style={{ color: 'var(--atx-red, #b42318)' }} aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium">{v.label}: {v.allowed ? (v.automated ? 'το πρόσωπο συναινεί · οι αποστολές είναι κλειστές' : 'επιτρέπεται') : 'όχι'}</span>
                  {v.reasons.map(r => <span key={r} className="block text-[12.5px] text-[var(--atx-muted)]">{reasonText(r)}</span>)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-[var(--atx-faint)] mt-3">
            Οι αυτόματες αποστολές (SMS, email, AI κλήσεις) είναι κλειστές σε όλο το σύστημα μέχρι τη νομική έγκριση — ό,τι κι αν δείχνει η γραμμή του προσώπου.
          </p>

          {objections.length > 0 && (
            <div className="mt-3 space-y-2" aria-label="Ενεργές αντιρρήσεις">
              {objections.map(o => (
                <div key={o.id} className="atx-notice flex items-start gap-2" data-objection>
                  <ShieldOff size={15} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="flex-1 text-[13px]">
                    <strong>{SCOPE_TEXT[o.scope]}</strong>{o.channels ? ` · ${o.channels.map(c => CHANNEL_TEXT[c]).join(', ')}` : ' · όλα τα κανάλια'}
                    <span className="block text-[var(--atx-muted)]">{o.reason} · {SOURCE_TEXT[o.source] ?? o.source} · {o.kinds.map(k => (k === 'phone' ? 'τηλέφωνο' : 'email')).join(' + ')} · {fmtDateTime(o.created_at)}</span>
                  </span>
                  {canLiftObjection(role) && <button className="atx-link !p-0 text-[12.5px]" onClick={() => setDialog({ lift: o.id })}>Άρση</button>}
                </div>
              ))}
            </div>
          )}

          {facts.article11 && (
            <p className="text-[12.5px] text-[var(--atx-muted)] mt-3">
              Μητρώο Άρθρου 11: {facts.article11.result === 'listed' ? 'εγγεγραμμένος' : 'δεν είναι εγγεγραμμένος'} · έλεγχος {fmtDateTime(facts.article11.screened_at)} · πηγή: {facts.article11.register_source}
            </p>
          )}

          <div className="flex gap-2 flex-wrap mt-4">
            <button className="atx-btn atx-btn-quiet" onClick={() => setDialog('objection')}>Δεν θέλει επικοινωνία</button>
            {evidence && facts.has_phone && <button className="atx-btn atx-btn-quiet" onClick={() => setDialog('article11')}>Έλεγχος Άρθρου 11</button>}
            {evidence && <button className="atx-btn atx-btn-quiet" onClick={() => setDialog('consent')}>Καταγραφή συγκατάθεσης</button>}
            {Object.values(facts.consents).some(c => c?.status === 'granted') && <button className="atx-btn atx-btn-quiet" onClick={() => setDialog('withdraw')}>Ανάκληση συγκατάθεσης</button>}
          </div>
        </>
      )}

      {dialog === 'objection' && facts && <ObjectionDialog subject={subject} facts={facts} onClose={() => setDialog(null)} onDone={load} />}
      {dialog === 'article11' && <Article11Dialog subject={subject} onClose={() => setDialog(null)} onDone={load} />}
      {dialog === 'consent' && facts && <ConsentDialog subject={subject} facts={facts} onClose={() => setDialog(null)} onDone={load} />}
      {dialog === 'withdraw' && facts && <WithdrawDialog subject={subject} facts={facts} onClose={() => setDialog(null)} onDone={load} />}
      {dialog && typeof dialog === 'object' && <LiftDialog id={dialog.lift} onClose={() => setDialog(null)} onDone={load} />}
    </div>
  );
}

/* ---------- dialogs ---------- */

function useSubmit(onClose: () => void, onDone: () => Promise<void>, ok: string) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true); setErr(null);
    const e = await fn();
    if (e) { setBusy(false); setErr(e); return; }
    await onDone();
    setBusy(false);
    toast(ok, 'ok');
    onClose();
  };
  return { busy, err, run };
}

const PHONE_CHANNELS: Channel[] = ['call', 'sms', 'voice'];

function ObjectionDialog({ subject, facts, onClose, onDone }: { subject: Subject; facts: ContactFacts; onClose: () => void; onDone: () => Promise<void> }) {
  const { busy, err, run } = useSubmit(onClose, onDone, 'Καταγράφηκε: δεν θέλει επικοινωνία.');
  const [scope, setScope] = useState<'marketing' | 'all'>('marketing');
  const [all, setAll] = useState(true);
  const [chosen, setChosen] = useState<Channel[]>([]);
  const [reason, setReason] = useState('');
  const [source, setSource] = useState('customer_request');
  const options = ([...(facts.has_phone ? PHONE_CHANNELS : []), ...(facts.has_email ? ['email' as Channel] : [])]);
  const toggle = (c: Channel) => setChosen(x => (x.includes(c) ? x.filter(y => y !== c) : [...x, c]));
  const valid = reason.trim().length >= 3 && (all || chosen.length > 0);
  return (
    <Modal open onClose={() => !busy && onClose()} title="Δεν θέλει επικοινωνία" micro="Αντίρρηση">
      <div className="space-y-3">
        <p className="text-[13.5px] text-ink/75">Ισχύει για τον αριθμό και το email σε <strong>κάθε</strong> εγγραφή του CRM, από τώρα. Το email μπαίνει και στη λίστα «μη αποστολής».</p>
        <div role="radiogroup" aria-label="Τι δεν θέλει" className="flex gap-2 flex-wrap">
          {(['marketing', 'all'] as const).map(s => (
            <button key={s} role="radio" aria-checked={scope === s} className={`atx-chip ${scope === s ? 'is-on' : ''}`} onClick={() => setScope(s)}>{SCOPE_TEXT[s]}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[13.5px]"><input type="checkbox" checked={all} onChange={e => setAll(e.target.checked)} /> Σε όλα τα κανάλια</label>
        {!all && (
          <div className="flex gap-3 flex-wrap" aria-label="Κανάλια">
            {options.map(c => <label key={c} className="flex items-center gap-1.5 text-[13.5px]"><input type="checkbox" checked={chosen.includes(c)} onChange={() => toggle(c)} /> {CHANNEL_TEXT[c]}</label>)}
          </div>
        )}
        <Field label="Πηγή">
          <select className="field" value={source} onChange={e => setSource(e.target.value)}>
            {Object.entries(SOURCE_TEXT).filter(([k]) => k !== 'register').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Τι είπε / αιτιολογία (υποχρεωτικό)">
          <input className="field" value={reason} onChange={e => setReason(e.target.value)} placeholder="π.χ. «Μην με ξαναπάρετε για προσφορές»" />
        </Field>
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn variant="danger" disabled={busy || !valid} onClick={() => void run(() => recordObjection(subject, scope, all ? null : chosen, reason, source))}>{busy ? <Spinner /> : null} Καταγραφή</Btn>
        </div>
      </div>
    </Modal>
  );
}

function Article11Dialog({ subject, onClose, onDone }: { subject: Subject; onClose: () => void; onDone: () => Promise<void> }) {
  const { busy, err, run } = useSubmit(onClose, onDone, 'Καταγράφηκε ο έλεγχος του μητρώου.');
  const [result, setResult] = useState<'not_listed' | 'listed'>('not_listed');
  const [register, setRegister] = useState('Μητρώο Άρθρου 11 (ν. 3471/2006)');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(today());
  return (
    <Modal open onClose={() => !busy && onClose()} title="Έλεγχος μητρώου Άρθρου 11" micro="Τηλεφωνική προώθηση">
      <div className="space-y-3">
        <p className="text-[13.5px] text-ink/75">Καταγράψτε το αποτέλεσμα του ελέγχου του αριθμού στο μητρώο όσων δεν δέχονται τηλεφωνική προώθηση. Ισχύει 30 ημέρες.</p>
        <div role="radiogroup" aria-label="Αποτέλεσμα" className="flex gap-2 flex-wrap">
          <button role="radio" aria-checked={result === 'not_listed'} className={`atx-chip ${result === 'not_listed' ? 'is-on' : ''}`} onClick={() => setResult('not_listed')}>Δεν είναι στο μητρώο</button>
          <button role="radio" aria-checked={result === 'listed'} className={`atx-chip ${result === 'listed' ? 'is-on' : ''}`} onClick={() => setResult('listed')}>Είναι στο μητρώο</button>
        </div>
        <Field label="Μητρώο / πηγή που ελέγχθηκε"><input className="field" value={register} onChange={e => setRegister(e.target.value)} /></Field>
        <Field label="Αποδεικτικό (προαιρετικό, π.χ. αρχείο λίστας)"><input className="field" value={ref} onChange={e => setRef(e.target.value)} /></Field>
        <Field label="Ημερομηνία ελέγχου"><input className="field" type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} /></Field>
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn disabled={busy || register.trim().length < 2 || !date} onClick={() => void run(() => recordArticle11(subject, result, register, ref, screenedAtIso(date)))}>{busy ? <Spinner /> : null} Καταγραφή</Btn>
        </div>
      </div>
    </Modal>
  );
}

/** A date picked today means «now»; an earlier date means that day at noon (Athens). */
function screenedAtIso(d: string): string {
  return d === today() ? new Date().toISOString() : new Date(`${d}T12:00:00+03:00`).toISOString();
}

function ConsentDialog({ subject, facts, onClose, onDone }: { subject: Subject; facts: ContactFacts; onClose: () => void; onDone: () => Promise<void> }) {
  const { busy, err, run } = useSubmit(onClose, onDone, 'Η συγκατάθεση καταγράφηκε με το αποδεικτικό της.');
  const options = ([...(facts.has_phone ? PHONE_CHANNELS : []), ...(facts.has_email ? ['email' as Channel] : [])]);
  const [channel, setChannel] = useState<Channel>(options[0] ?? 'call');
  const [basis, setBasis] = useState<'consent' | 'existing_customer'>('consent');
  const [ref, setRef] = useState('');
  const [date, setDate] = useState(today());
  const [version, setVersion] = useState('');
  const objected = facts.objections.length > 0;
  return (
    <Modal open onClose={() => !busy && onClose()} title="Καταγραφή συγκατάθεσης" micro="Με αποδεικτικό">
      <div className="space-y-3">
        <p className="text-[13.5px] text-ink/75">Μόνο με αποδεικτικό: υπογεγραμμένο έντυπο, ηχογράφηση ή καταχώρηση φόρμας. Χωρίς αυτό η βάση δεν δέχεται συγκατάθεση.</p>
        {objected && <div className="atx-notice" role="status">Υπάρχει ενεργή αντίρρηση: μέχρι να την άρει ο διαχειριστής, η επικοινωνία μένει κλειστή.</div>}
        {options.length === 0 && <div className="atx-notice" role="status">Δεν υπάρχει τηλέφωνο ή email.</div>}
        <Field label="Κανάλι">
          <select className="field" value={channel} onChange={e => setChannel(e.target.value as Channel)}>{options.map(c => <option key={c} value={c}>{CHANNEL_TEXT[c]}</option>)}</select>
        </Field>
        <Field label="Βάση">
          <select className="field" value={basis} onChange={e => setBasis(e.target.value as 'consent' | 'existing_customer')}>
            <option value="consent">Ρητή συγκατάθεση</option>
            <option value="existing_customer">Υφιστάμενος πελάτης (παρόμοια προϊόντα)</option>
          </select>
        </Field>
        <Field label="Αποδεικτικό (υποχρεωτικό)"><input className="field" value={ref} onChange={e => setRef(e.target.value)} placeholder="π.χ. Έντυπο 0042, ηχογράφηση #318" /></Field>
        <Field label="Ημερομηνία αποδεικτικού"><input className="field" type="date" value={date} max={today()} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Έκδοση κειμένου συγκατάθεσης (προαιρετικό)"><input className="field" value={version} onChange={e => setVersion(e.target.value)} placeholder="π.χ. v1" /></Field>
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn disabled={busy || ref.trim().length < 3 || !date || options.length === 0} onClick={() => void run(() => recordConsent(subject, channel, basis, ref, screenedAtIso(date), version))}>{busy ? <Spinner /> : null} Καταγραφή</Btn>
        </div>
      </div>
    </Modal>
  );
}

function WithdrawDialog({ subject, facts, onClose, onDone }: { subject: Subject; facts: ContactFacts; onClose: () => void; onDone: () => Promise<void> }) {
  const { busy, err, run } = useSubmit(onClose, onDone, 'Η συγκατάθεση ανακλήθηκε.');
  const granted = (Object.entries(facts.consents) as [Channel, NonNullable<ContactFacts['consents'][Channel]>][]).filter(([, c]) => c.status === 'granted').map(([ch]) => ch);
  const [channel, setChannel] = useState<Channel>(granted[0] ?? 'call');
  const [reason, setReason] = useState('');
  return (
    <Modal open onClose={() => !busy && onClose()} title="Ανάκληση συγκατάθεσης" micro="Ισχύει αμέσως">
      <div className="space-y-3">
        <Field label="Κανάλι">
          <select className="field" value={channel} onChange={e => setChannel(e.target.value as Channel)}>{granted.map(c => <option key={c} value={c}>{CHANNEL_TEXT[c]}</option>)}</select>
        </Field>
        <Field label="Τι είπε / αιτιολογία (υποχρεωτικό)"><input className="field" value={reason} onChange={e => setReason(e.target.value)} placeholder="π.χ. «Σταματήστε τα SMS»" /></Field>
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => void run(() => withdrawConsent(subject, channel, reason))}>{busy ? <Spinner /> : null} Ανάκληση</Btn>
        </div>
      </div>
    </Modal>
  );
}

function LiftDialog({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { busy, err, run } = useSubmit(onClose, onDone, 'Η αντίρρηση άρθηκε.');
  const [reason, setReason] = useState('');
  return (
    <Modal open onClose={() => !busy && onClose()} title="Άρση αντίρρησης" micro="Μόνο διαχειριστής">
      <div className="space-y-3">
        <p className="text-[13.5px] text-ink/75">Μόνο όταν το ίδιο το πρόσωπο το ζήτησε ή έδωσε νέα συγκατάθεση. Η αιτιολογία καταγράφεται.</p>
        <Field label="Αιτιολογία (υποχρεωτικό)"><input className="field" value={reason} onChange={e => setReason(e.target.value)} placeholder="π.χ. Νέα έγγραφη συγκατάθεση 12/11, αρ. 0042" /></Field>
        {err && <div className="atx-notice" role="alert">{err}</div>}
        <div className="flex justify-end gap-2">
          <Btn variant="outline" disabled={busy} onClick={onClose}>Άκυρο</Btn>
          <Btn disabled={busy || reason.trim().length < 3} onClick={() => void run(() => liftObjection(id, reason))}>{busy ? <Spinner /> : null} Άρση</Btn>
        </div>
      </div>
    </Modal>
  );
}
