/* «Νέα επίσκεψη»: schedules a visit for an existing Lead or Customer, or for a NEW prospect, with NO Case. A prospect is stored on the visit as a controlled capture
   (name, optional phone / address) and can later be turned into a Lead without losing the visit. Before saving, the duplicate signal is shown: a record of the agent's
   own can be used instead; a record of another agent is only announced (no name, no phone), and taking it over goes through a request that Admin / Back Office decides. */
import { useEffect, useMemo, useState } from 'react';
import { fetchCustomers, fetchLeads } from '@/lib/api';
import type { Customer, Lead } from '@/lib/api';
import { createFieldVisit, prospectMatches, requestLeadOwnership, visitsExtendedAvailable } from '@/lib/field-api';
import type { ProspectMatch } from '@/lib/field-api';
import { hasErrors, validateSchedule } from '@/lib/field-visits';
import type { ScheduleErrors } from '@/lib/field-visits';
import { useToast } from '@/lib/toast';
import { Btn, Modal, Pill } from '@/lib/ui';

const leadName = (l: Lead) => l.full_name || l.client_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || 'Lead';
const tomorrow9 = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

export default function VisitScheduler({ open, onClose, onCreated, defaults }: { open: boolean; onClose: () => void; onCreated: () => void; defaults?: { leadId?: string; customerId?: string; label?: string } }) {
  const { toast } = useToast();
  const [who, setWho] = useState<'existing' | 'prospect'>(defaults?.leadId || defaults?.customerId ? 'existing' : 'existing');
  const [pick, setPick] = useState<{ kind: 'lead' | 'customer'; id: string; name: string } | null>(defaults?.leadId ? { kind: 'lead', id: defaults.leadId, name: defaults.label ?? 'Lead' } : defaults?.customerId ? { kind: 'customer', id: defaults.customerId, name: defaults.label ?? 'Πελάτης' } : null);
  const [q, setQ] = useState('');
  const [prospect, setProspect] = useState({ name: '', phone: '', address: '' });
  const [when, setWhen] = useState(tomorrow9);
  const [purpose, setPurpose] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [matches, setMatches] = useState<ProspectMatch[] | null>(null);
  const [errors, setErrors] = useState<ScheduleErrors>({});
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [ask, setAsk] = useState<{ id: string; reason: string } | null>(null);

  useEffect(() => { if (!open) return; void visitsExtendedAvailable().then(setAvailable); void fetchCustomers().then(setCustomers); void fetchLeads().then(setLeads); }, [open]);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase(); if (t.length < 2) return [];
    const m = (s: string | null | undefined) => (s ?? '').toLowerCase().includes(t);
    return [...customers.filter((c) => m(c.full_name) || m(c.phone)).slice(0, 5).map((c) => ({ kind: 'customer' as const, id: c.id, name: c.full_name })),
      ...leads.filter((l) => m(leadName(l)) || m(l.phone)).slice(0, 5).map((l) => ({ kind: 'lead' as const, id: l.id, name: leadName(l) }))];
  }, [q, customers, leads]);

  const check = async () => { if (prospect.name.trim().length < 2) return; setMatches(await prospectMatches(prospect.name, prospect.phone, prospect.address)); };
  const own = matches?.filter((m) => !m.owned_by_other) ?? [];
  const others = matches?.filter((m) => m.owned_by_other) ?? [];

  const save = async () => {
    const input = { who, leadId: pick?.kind === 'lead' ? pick.id : null, customerId: pick?.kind === 'customer' ? pick.id : null, prospect: who === 'prospect' ? prospect : null, scheduledAt: when, purpose };
    const e = validateSchedule(input); setErrors(e); if (hasErrors(e)) return;
    setBusy(true); const r = await createFieldVisit(input); setBusy(false);
    if (!r.ok) { toast(r.error, 'bad'); return; }
    toast('Η επίσκεψη προγραμματίστηκε.', 'ok'); onCreated(); onClose();
  };
  const request = async () => {
    if (!ask) return; setBusy(true); const r = await requestLeadOwnership(ask.id, ask.reason); setBusy(false);
    if (!r.ok) { toast(r.error ?? 'Το αίτημα δεν στάλθηκε.', 'bad'); return; }
    toast('Το αίτημα στάλθηκε στο Back Office. Η ανάθεση αλλάζει μόνο αν εγκριθεί.', 'ok'); setAsk(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Νέα επίσκεψη" micro="Δεν δημιουργείται Case" wide>
      {available === false && <p className="text-sm" role="status">Η λειτουργία δεν είναι ακόμη διαθέσιμη. Οι επισκέψεις προγραμματίζονται προς το παρόν από ένα Case.</p>}
      {available !== false && (
        <div className="space-y-3">
          <div role="radiogroup" aria-label="Με ποιον;" className="flex gap-2">
            {(['existing', 'prospect'] as const).map((w) => <button key={w} type="button" role="radio" aria-checked={who === w} onClick={() => setWho(w)}
              className={`rounded-full px-3 py-1.5 text-[13px] border min-h-[36px] ${who === w ? 'bg-ink text-white border-ink' : 'border-line text-ink/70'}`}>{w === 'existing' ? 'Υπάρχον Lead / Πελάτης' : 'Νέος υποψήφιος'}</button>)}
          </div>

          {who === 'existing' && (
            <div className="space-y-2">
              {pick ? <div className="rounded-xl border border-line p-3 flex items-center justify-between"><span><Pill tone={pick.kind === 'lead' ? 'blue' : 'green'}>{pick.kind === 'lead' ? 'Lead' : 'Πελάτης'}</Pill> <strong className="ml-1">{pick.name}</strong></span><Btn variant="outline" onClick={() => setPick(null)}>Αλλαγή</Btn></div>
                : (<>
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζήτηση ονόματος ή τηλεφώνου" aria-label="Αναζήτηση Lead ή πελάτη" />
                  <ul className="space-y-1">{hits.map((h) => <li key={`${h.kind}${h.id}`}><button type="button" className="w-full text-left rounded-xl border border-line px-3 py-2 min-h-[44px]" onClick={() => setPick(h)}><Pill tone={h.kind === 'lead' ? 'blue' : 'green'}>{h.kind === 'lead' ? 'Lead' : 'Πελάτης'}</Pill> <strong className="ml-1">{h.name}</strong></button></li>)}</ul>
                </>)}
              {errors.who && <p className="text-sm text-bad-600" role="alert">{errors.who}</p>}
            </div>
          )}

          {who === 'prospect' && (
            <div className="space-y-2">
              <div className="grid sm:grid-cols-3 gap-2">
                <label className="block"><span className="micro text-ink/40 mb-1 block">Όνομα / επωνυμία *</span><input className="field" value={prospect.name} onChange={(e) => { setProspect({ ...prospect, name: e.target.value }); setMatches(null); }} onBlur={() => void check()} aria-invalid={!!errors.name} /></label>
                <label className="block"><span className="micro text-ink/40 mb-1 block">Τηλέφωνο</span><input className="field" inputMode="tel" value={prospect.phone} onChange={(e) => { setProspect({ ...prospect, phone: e.target.value }); setMatches(null); }} onBlur={() => void check()} /></label>
                <label className="block"><span className="micro text-ink/40 mb-1 block">Διεύθυνση</span><input className="field" value={prospect.address} onChange={(e) => setProspect({ ...prospect, address: e.target.value })} onBlur={() => void check()} /></label>
              </div>
              {errors.name && <p className="text-sm text-bad-600" role="alert">{errors.name}</p>}
              {own.length > 0 && (
                <div className="rounded-xl border border-line p-3 text-sm" role="status"><strong>Υπάρχει ήδη στα δικά σας:</strong>
                  <ul className="mt-1 space-y-1">{own.map((m) => <li key={m.id} className="flex items-center justify-between gap-2"><span>{m.detail}: {m.label}</span>
                    {m.kind !== 'supply_point' && <Btn variant="outline" onClick={() => { setPick({ kind: m.kind as 'lead' | 'customer', id: m.id, name: m.label ?? '' }); setWho('existing'); }}>Χρήση αυτού</Btn>}</li>)}</ul></div>
              )}
              {others.length > 0 && (
                <div className="rounded-xl border border-line p-3 text-sm text-warn-600" role="status">
                  <strong>Υπάρχει εγγραφή που ανήκει σε άλλον πωλητή</strong> (δεν εμφανίζονται στοιχεία). Δεν συγχωνεύεται και δεν αλλάζει ιδιοκτήτη χωρίς έγκριση του Back Office.
                  {others.some((m) => m.kind === 'lead') && !ask && <div className="mt-2"><Btn variant="outline" onClick={() => setAsk({ id: others.find((m) => m.kind === 'lead')!.id, reason: '' })}>Αίτημα ανάθεσης στο Back Office</Btn></div>}
                  {ask && <div className="mt-2 space-y-1"><input className="field" value={ask.reason} onChange={(e) => setAsk({ ...ask, reason: e.target.value })} placeholder="Γιατί πρέπει να σας ανατεθεί;" aria-label="Λόγος αιτήματος ανάθεσης" />
                    <div className="flex gap-2"><Btn disabled={busy || ask.reason.trim().length < 3} onClick={() => void request()}>Αποστολή αιτήματος</Btn><Btn variant="outline" onClick={() => setAsk(null)}>Άκυρο</Btn></div></div>}
                </div>
              )}
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-2">
            <label className="block"><span className="micro text-ink/40 mb-1 block">Ημερομηνία και ώρα *</span><input type="datetime-local" className="field" value={when} onChange={(e) => setWhen(e.target.value)} aria-invalid={!!errors.scheduledAt} /></label>
            <label className="block"><span className="micro text-ink/40 mb-1 block">Σκοπός</span><input className="field" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="π.χ. Γνωριμία, προσφορά" /></label>
          </div>
          {errors.scheduledAt && <p className="text-sm text-bad-600" role="alert">{errors.scheduledAt}</p>}
          <div className="flex justify-end gap-2"><Btn variant="outline" onClick={onClose}>Άκυρο</Btn><Btn onClick={() => void save()} disabled={busy}>Προγραμματισμός</Btn></div>
        </div>
      )}
    </Modal>
  );
}
