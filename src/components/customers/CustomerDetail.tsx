/* Customer details — one place for the customer: overview, next step, cases with progress, documents across cases
   and a chronological communication history (from the existing case timelines). Read paths: fetchCustomer,
   fetchCases, fetchDocuments, fetchTimeline (all RLS-scoped). Write path: the existing updateCustomer only. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, Clock, FileText, Mail, MapPin, Pencil, Phone, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { activityLabel, can, SERVICES, STAGE_TRANSITIONS } from '@/lib/roles';
import type { Stage } from '@/lib/roles';
import { fetchCases, fetchCustomer, fetchDocuments, fetchTimeline, getPosition, updateCustomer } from '@/lib/api';
import type { Case, CaseDocument, Customer, TimelineEvent } from '@/lib/api';
import { buildChecklist, docLabel } from '@/lib/documents';
import { caseNextStep, customerSummary, journeySteps, stageText } from '@/lib/case-flow';
import { useToast } from '@/lib/toast';
import { InTrashBanner, TrashButton } from '@/components/trash/TrashControls';
import ContactEligibility from '@/components/contact/ContactEligibility';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/ui';

const COMMS = ['call', 'email', 'sms', 'whatsapp', 'meeting', 'visit', 'check_in', 'note', 'comment', 'offer', 'send_offer', 'signature', 'document', 'status_change', 'assignment', 'follow_up', 'completed'];
const DOC_TONE: Record<string, string> = { verified: 't-success', received: 't-warning', rejected: 't-danger' };
const DOC_TEXT: Record<string, string> = { verified: 'Ελέγχθηκε', received: 'Παραλήφθηκε', rejected: 'Απορρίφθηκε', required: 'Απαιτείται', missing: 'Λείπει' };

type Tab = 'overview' | 'cases' | 'docs' | 'history';

export default function CustomerDetail({ customerId }: { customerId: string }) {
  const { role } = useAuth();
  const { go, openCase } = useNav();
  const { toast } = useToast();
  const [cust, setCust] = useState<Customer | null | undefined>(undefined);
  const [cases, setCases] = useState<Case[]>([]);
  const [docs, setDocs] = useState<Record<string, CaseDocument[]>>({});
  const [events, setEvents] = useState<(TimelineEvent & { case_no: string })[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', address: '', city: '', postal_code: '', notes: '', lat: '', lng: '' });
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now] = useState(() => Date.now());
  const canEdit = can(role, 'edit_case');

  const load = useCallback(async () => {
    const [c, all] = await Promise.all([fetchCustomer(customerId), fetchCases({ includeDone: true })]);
    setCust(c);
    const mine = all.filter(k => k.customer_id === customerId).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    setCases(mine);
    const [d, t] = await Promise.all([
      Promise.all(mine.map(k => fetchDocuments(k.id))),
      Promise.all(mine.map(k => fetchTimeline(k.id))),
    ]);
    setDocs(Object.fromEntries(mine.map((k, i) => [k.id, d[i]])));
    setEvents(mine.flatMap((k, i) => t[i].map(e => ({ ...e, case_no: k.case_no })))
      .filter(e => COMMS.includes(e.activity_type))
      .sort((a, b) => +new Date(b.occurred_at) - +new Date(a.occurred_at)));
  }, [customerId]);
  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => customerSummary(cases, now), [cases, now]);
  const focus = useMemo(() => {
    const active = cases.filter(k => !['completed', 'lost', 'cancelled'].includes(k.current_stage));
    if (!active.length) return null;
    const pick = [...active].sort((a, b) => {
      const fa = a.next_follow_up_at ? +new Date(a.next_follow_up_at) : Infinity;
      const fb = b.next_follow_up_at ? +new Date(b.next_follow_up_at) : Infinity;
      return fa - fb || +new Date(a.updated_at) - +new Date(b.updated_at);
    })[0];
    return { kase: pick, step: caseNextStep(pick, STAGE_TRANSITIONS[pick.current_stage as Stage] ?? [], buildChecklist(pick, docs[pick.id] ?? []), now) };
  }, [cases, docs, now]);

  if (cust === undefined) return <div className="atx-page"><div className="atx-panel">{[0, 1, 2].map(i => <div key={i} className="atx-skeleton" />)}</div></div>;
  if (cust === null) {
    return (
      <div className="atx-page">
        <button className="atx-link inline-flex items-center gap-1" onClick={() => go('customers')}><ArrowLeft size={15} /> Επιστροφή στους πελάτες</button>
        <div className="atx-panel mt-4"><div className="atx-empty"><strong>Ο πελάτης δεν βρέθηκε</strong>Μπορεί να έχει διαγραφεί ή να μην έχετε πρόσβαση.</div></div>
      </div>
    );
  }

  const openEdit = () => {
    setForm({ full_name: cust.full_name ?? '', phone: cust.phone ?? '', email: cust.email ?? '', address: cust.address ?? '', city: cust.city ?? '', postal_code: cust.postal_code ?? '', notes: cust.notes ?? '', lat: cust.lat != null ? String(cust.lat) : '', lng: cust.lng != null ? String(cust.lng) : '' });
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    const ok = await updateCustomer(cust.id, {
      full_name: form.full_name.trim() || cust.full_name, phone: form.phone || null, email: form.email || null,
      address: form.address || null, city: form.city || null, postal_code: form.postal_code || null, notes: form.notes,
      lat: form.lat.trim() === '' ? null : Number(form.lat), lng: form.lng.trim() === '' ? null : Number(form.lng),
    });
    setSaving(false);
    if (ok) { setEditing(false); toast('Τα στοιχεία αποθηκεύτηκαν', 'ok'); void load(); }
    else toast('Η αποθήκευση απέτυχε. Δοκιμάστε ξανά.', 'bad');
  };

  const tel = cust.phone ? `tel:${cust.phone.replace(/\s+/g, '')}` : null;
  const initials = cust.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const allDocs = cases.flatMap(k => (docs[k.id] ?? []).map(d => ({ ...d, case_no: k.case_no })));
  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: 'overview', label: 'Σύνοψη' }, { id: 'cases', label: 'Cases', n: cases.length },
    { id: 'docs', label: 'Έγγραφα', n: allDocs.length }, { id: 'history', label: 'Ιστορικό', n: events.length },
  ];

  const caseRow = (k: Case) => {
    const { steps, outcome } = journeySteps(k.current_stage, []);
    const n = steps.filter(s => s.state === 'done').length;
    return (
      <li key={k.id} className="atx-row">
        <span className="atx-icon" aria-hidden="true"><Briefcase size={16} /></span>
        <button className="atx-row-main" onClick={() => openCase(k.id)}>
          <span className="atx-row-title">{SERVICES[k.service_type] ?? k.service_type} · {k.case_no}</span>
          <span className="atx-row-sub">{outcome ? `Έκλεισε: ${stageText(outcome)}` : `${stageText(k.current_stage)} · βήμα ${Math.min(n + 1, 9)} από 9`}{k.next_action ? ` · ${k.next_action}` : ''}</span>
        </button>
        <span className="atx-row-when">{k.value > 0 ? fmtMoney(k.value) : 'Χωρίς αξία'}</span>
        <button className="atx-btn atx-btn-quiet" onClick={() => openCase(k.id)}>Άνοιγμα</button>
      </li>
    );
  };

  return (
    <div className="atx-page space-y-5" style={{ maxWidth: 1040 }}>
      <button className="atx-link inline-flex items-center gap-1" onClick={() => go('customers')}><ArrowLeft size={15} /> Επιστροφή στους πελάτες</button>

      <div className="flex items-center gap-4 flex-wrap">
        <span className="w-14 h-14 rounded-full grid place-items-center text-[18px] font-bold shrink-0" style={{ background: 'var(--atx-blue-soft)', color: 'var(--atx-blue)' }} aria-hidden="true">{initials || '?'}</span>
        <div className="flex-1 min-w-[220px]">
          <h1 className="atx-title" style={{ fontSize: 28 }}>{cust.full_name}</h1>
          <p className="atx-sub" style={{ marginTop: 2 }}>
            Πελάτης{cust.city ? ` · ${cust.city}` : ''} · από {fmtDate(cust.created_at)} · {summary.active} ενεργά από {summary.total} cases
          </p>
        </div>
        {!cust.deleted_at && <TrashButton type="customer" id={cust.id} name={cust.full_name} onTrashed={() => { go('customers'); }} />}
        {canEdit && !editing && !cust.deleted_at && <button className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" onClick={openEdit}><Pencil size={14} /> Επεξεργασία</button>}
      </div>
      {cust.deleted_at && <InTrashBanner type="customer" id={cust.id} deletedAt={cust.deleted_at} onRestored={() => void load()} />}

      {editing && (
        <div className="atx-panel" style={{ padding: 20 }}>
          <h2 className="atx-section-title mb-3">Επεξεργασία στοιχείων</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {([['full_name', 'Ονοματεπώνυμο'], ['phone', 'Τηλέφωνο'], ['email', 'Email'], ['address', 'Διεύθυνση'], ['city', 'Πόλη'], ['postal_code', 'Τ.Κ.']] as const).map(([k, l]) => (
              <label key={k} className="text-[13px] font-medium">{l}
                <input className="field mt-1" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
              </label>
            ))}
            <label className="text-[13px] font-medium">Γεωγρ. πλάτος (lat)
              <input className="field mt-1" inputMode="decimal" value={form.lat} onChange={e => setForm(f => ({ ...f, lat: e.target.value }))} />
            </label>
            <label className="text-[13px] font-medium">Γεωγρ. μήκος (lng)
              <input className="field mt-1" inputMode="decimal" value={form.lng} onChange={e => setForm(f => ({ ...f, lng: e.target.value }))} />
            </label>
            <button type="button" className="atx-link !p-0 text-left sm:col-span-2" disabled={locating}
              onClick={async () => { setLocating(true); const p = await getPosition(); setLocating(false); if (p) setForm(f => ({ ...f, lat: String(p.lat), lng: String(p.lng) })); else toast('Η τοποθεσία δεν είναι διαθέσιμη.', 'bad'); }}>
              {locating ? 'Εντοπισμός…' : 'Χρήση τρέχουσας τοποθεσίας'}
            </button>
            <label className="text-[13px] font-medium sm:col-span-2">Σημειώσεις
              <textarea className="field mt-1" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </label>
          </div>
          <div className="flex gap-2 mt-4">
            <button className="atx-btn atx-btn-primary" disabled={saving || !form.full_name.trim()} onClick={() => void save()}>{saving ? '…' : 'Αποθήκευση'}</button>
            <button className="atx-btn atx-btn-quiet" disabled={saving} onClick={() => setEditing(false)}>Άκυρο</button>
          </div>
        </div>
      )}

      <div className="atx-pagetabs" role="tablist" aria-label="Ενότητες πελάτη">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="atx-pagetab" onClick={() => setTab(t.id)}>
            {t.label}{t.n !== undefined && <span className="opacity-60">{t.n}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4 min-w-0">
            <div className="atx-panel" style={{ padding: 20, background: focus ? 'linear-gradient(180deg, rgba(22,119,255,.06), #fff)' : undefined }}>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--atx-blue)' }}><Sparkles size={14} aria-hidden="true" /> Επόμενο βήμα</div>
              {focus ? (
                <>
                  <h2 className="text-[18px] font-semibold mt-1.5">{focus.step.title}</h2>
                  <p className="text-[14px] text-[var(--atx-muted)] mt-1">Case {focus.kase.case_no}: {focus.step.reason}</p>
                  {focus.step.blockers.length > 0 && <p className="text-[13.5px] mt-2" style={{ color: 'var(--atx-amber)' }}>{focus.step.blockers.join(' · ')}</p>}
                  <button className="atx-btn atx-btn-primary mt-4" onClick={() => openCase(focus.kase.id)}>Άνοιγμα case</button>
                </>
              ) : <p className="text-[14px] text-[var(--atx-muted)] mt-1.5">Δεν υπάρχει ενεργό case για αυτόν τον πελάτη.</p>}
            </div>
            <div className="atx-panel">
              <div className="atx-section-head" style={{ padding: '16px 16px 0' }}><h2 className="atx-section-title">Cases</h2></div>
              {cases.length === 0 ? <div className="atx-empty"><strong>Κανένα case</strong>Τα cases δημιουργούνται από τη μετατροπή ενός lead ή από τη σελίδα Cases.</div>
                : <ul className="m-0 p-0 list-none">{cases.slice(0, 3).map(caseRow)}</ul>}
              {cases.length > 3 && <button className="atx-link m-3" onClick={() => setTab('cases')}>Όλα τα cases ({cases.length})</button>}
            </div>
          </div>
          <div className="space-y-4">
            <div className="atx-panel" style={{ padding: 20 }}>
              <h2 className="atx-section-title mb-3">Επικοινωνία</h2>
              <ul className="m-0 p-0 list-none space-y-2.5 text-[14px]">
                <li className="flex items-center gap-2.5"><Phone size={15} className="text-[var(--atx-muted)]" />{tel ? <a className="atx-link !p-0" href={tel}>{cust.phone}</a> : '—'}</li>
                <li className="flex items-center gap-2.5"><Mail size={15} className="text-[var(--atx-muted)]" />{cust.email ? <a className="atx-link !p-0 truncate" href={`mailto:${cust.email}`}>{cust.email}</a> : '—'}</li>
                <li className="flex items-center gap-2.5"><MapPin size={15} className="text-[var(--atx-muted)]" />{[cust.address, cust.postal_code, cust.city].filter(Boolean).join(', ') || '—'}</li>
              </ul>
              {cust.notes && <p className="text-[13px] text-[var(--atx-muted)] mt-3 border-t border-[var(--atx-line)] pt-3">{cust.notes}</p>}
            </div>
            <ContactEligibility subject={{ phone: cust.phone, email: cust.email, customerId: cust.id }} />
            <div className="atx-panel" style={{ padding: 20 }}>
              <h2 className="atx-section-title mb-3">Με μια ματιά</h2>
              <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-[14px] m-0">
                <dt className="text-[var(--atx-muted)]">Ενεργά cases</dt><dd className="m-0 font-semibold">{summary.active}</dd>
                <dt className="text-[var(--atx-muted)]">Ολοκληρωμένα</dt><dd className="m-0 font-semibold">{summary.completed}</dd>
                <dt className="text-[var(--atx-muted)]">Καταγεγραμμένη αξία</dt><dd className="m-0 font-semibold">{summary.knownValue > 0 ? fmtMoney(summary.knownValue) : '—'}</dd>
                <dt className="text-[var(--atx-muted)]">Επόμενο follow-up</dt>
                <dd className="m-0 font-semibold" style={summary.overdueFollowUp ? { color: 'var(--atx-red)' } : undefined}>{summary.nextFollowUp ? fmtDateTime(summary.nextFollowUp) : '—'}</dd>
              </dl>
              {summary.withoutValue > 0 && <p className="text-[12px] text-[var(--atx-faint)] mt-2">{summary.withoutValue} case χωρίς καταχωρημένη αξία δεν περιλαμβάνονται.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'cases' && (
        <div className="atx-panel">
          {cases.length === 0 ? <div className="atx-empty"><strong>Κανένα case</strong></div> : <ul className="m-0 p-0 list-none">{cases.map(caseRow)}</ul>}
        </div>
      )}

      {tab === 'docs' && (
        <div className="atx-panel">
          {allDocs.length === 0 ? <div className="atx-empty"><strong>Δεν υπάρχουν έγγραφα</strong>Τα έγγραφα ανεβαίνουν μέσα από κάθε case (Έγγραφα).</div> : (
            <ul className="m-0 p-0 list-none">
              {allDocs.map(d => (
                <li key={d.id} className="atx-row">
                  <span className="atx-icon" aria-hidden="true"><FileText size={16} /></span>
                  <button className="atx-row-main" onClick={() => openCase(d.case_id)}>
                    <span className="atx-row-title">{docLabel(d.category)}</span>
                    <span className="atx-row-sub">Case {d.case_no} · {fmtDateTime(d.created_at)}{d.description ? ` · ${d.description}` : ''}</span>
                  </button>
                  <span className={`atx-tag ${DOC_TONE[d.status] ?? ''}`}>{DOC_TEXT[d.status] ?? d.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="atx-panel" style={{ padding: 20 }}>
          {events.length === 0 ? <div className="atx-empty"><strong>Δεν υπάρχει ιστορικό επικοινωνίας</strong>Κλήσεις, emails, σημειώσεις και αλλαγές εμφανίζονται εδώ από όλα τα cases του πελάτη.</div> : (
            <ol className="m-0 p-0 list-none space-y-3">
              {events.map(e => (
                <li key={e.id} className="flex gap-3">
                  <span className="atx-icon" style={{ width: 30, height: 30 }} aria-hidden="true"><Clock size={14} /></span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium">{e.title || activityLabel(e.activity_type)}</span>
                    <span className="block text-[12.5px] text-[var(--atx-muted)]">
                      {activityLabel(e.activity_type)} · Case <button className="atx-link !p-0 text-[12.5px]" onClick={() => openCase(e.case_id)}>{e.case_no}</button> · {fmtDateTime(e.occurred_at)}{e.user?.full_name ? ` · ${e.user.full_name}` : ''}
                    </span>
                    {e.description && <span className="block text-[13px] mt-0.5">{e.description}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
