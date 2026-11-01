/* «Φάκελος πελάτη» (docs/product/UNIFIED_CUSTOMER_FOLDER.md §2, Part B): one header with a computed badge and the
   same tabs everywhere. Selecting a case scopes Έγγραφα … Back Office to it; those tabs reuse the case screen's own
   panels. Read paths: fetchCustomer, fetchCases, fetchDocuments, fetchTimeline, fetchLead (all RLS-scoped). Write
   paths: the existing ones only (updateCustomer here, the case panels' own writes). */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Briefcase, Clock, FileText, Mail, MapPin, Pencil, Phone, Sparkles } from 'lucide-react';
import { BackOfficeTab, FollowUpsTab, OffersTab, SignaturesTab, TimelineComposer, VisitsTab } from '@/components/app/CaseDetailPage';
import { CaseProgress } from '@/components/cases/CaseOverview';
import CaseDocuments from '@/components/documents/CaseDocuments';
import { leadFiles as toLeadFiles } from '@/lib/lead-files';
import { ORIGIN_TEXT, convertedNotice, folderBadge, folderOrigin, folderSubtitle, folderTabs, mostUrgentCase, selectedCase } from '@/lib/folder';
import type { FolderTab } from '@/lib/folder';
import { useStaff } from '@/lib/useStaff';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { activityLabel, can, leadSourceInfo, serviceLabel, STAGE_TRANSITIONS, TEAM_FILTERS } from '@/lib/roles';
import { leadStatusDisplay } from '@/lib/lead-status';
import type { Stage } from '@/lib/roles';
import { caseCountText } from '@/lib/status-text';
import { visitedStages } from '@/lib/case-flow';
import { mergeHistory } from '@/lib/history-text';
import { syncToast, syncWarningText } from '@/lib/lead-sync';
import { customerNamesAvailable, fetchCases, fetchSupplyPoints, fetchTariffCategories, fetchCustomer, fetchDocuments, fetchEntityActivity, fetchLead, fetchTimeline, getPosition, syncLeadsFromCustomer, updateCustomer } from '@/lib/api';
import { supplyLabelFor } from '@/lib/supply-points';
import type { SupplyPoint, TariffCategory } from '@/lib/supply-points';
import type { ActivityLogRow, Case, CaseDocument, Customer, Lead, TimelineEvent } from '@/lib/api';
import { buildChecklist, docLabel } from '@/lib/documents';
import { caseNextStep, customerSummary, journeySteps, stageText } from '@/lib/case-flow';
import { useToast } from '@/lib/toast';
import { InTrashBanner, TrashButton } from '@/components/trash/TrashControls';
import ContactEligibility from '@/components/contact/ContactEligibility';
import SupplyPointsTab from '@/components/customers/SupplyPointsTab';
import CustomerWork from '@/components/customers/CustomerWork';
import { applicationsAvailable, visitsExtendedAvailable } from '@/lib/field-api';
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/ui';

const DOC_TONE: Record<string, string> = { verified: 't-success', received: 't-warning', rejected: 't-danger' };
const DOC_TEXT: Record<string, string> = { verified: 'Ελέγχθηκε', received: 'Παραλήφθηκε', rejected: 'Απορρίφθηκε', required: 'Απαιτείται', missing: 'Λείπει' };


export default function CustomerDetail({ customerId, convertedNotice: notice = null }: { customerId: string; convertedNotice?: string | null }) {
  const { role } = useAuth();
  const { go, openCase } = useNav();
  const { toast } = useToast();
  const [cust, setCust] = useState<Customer | null | undefined>(undefined);
  const [cases, setCases] = useState<Case[]>([]);
  const [docs, setDocs] = useState<Record<string, CaseDocument[]>>({});
  const [events, setEvents] = useState<(TimelineEvent & { case_no: string })[]>([]);
  const [tab, setTab] = useState<FolderTab>('overview');
  // «Αιτήσεις & επισκέψεις» appears only once the staged SQL (phase7) is applied: until then the folder is exactly what it was.
  const [workAvail, setWorkAvail] = useState(false);
  useEffect(() => { void Promise.all([applicationsAvailable(), visitsExtendedAvailable()]).then(([a, v]) => setWorkAvail(a || v)); }, []);
  const [picked, setPicked] = useState<string | null>(null);
  const [leads, setLeads] = useState<Record<string, Lead | null>>({});
  const [leadActs, setLeadActs] = useState<Record<string, ActivityLogRow[] | null>>({});
  const [histTeam, setHistTeam] = useState('all');
  // undefined = loading; null = the staged SQL (phase5/17) is not applied yet
  const [supplyPoints, setSupplyPoints] = useState<SupplyPoint[] | null | undefined>(undefined);
  const [tariffs, setTariffs] = useState<TariffCategory[] | null>(null);
  const [syncWarn, setSyncWarn] = useState<string | null>(null);
  const staff = useStaff();
  const [editing, setEditing] = useState(false);
  const [names, setNames] = useState(false);
  useEffect(() => { void customerNamesAvailable().then(setNames); }, []);
  const [form, setForm] = useState({ first_name: '', last_name: '', full_name: '', phone: '', email: '', address: '', city: '', postal_code: '', notes: '', lat: '', lng: '' });
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now] = useState(() => Date.now());
  const canEdit = can(role, 'edit_case');

  const load = useCallback(async () => {
    const [c, all, sp, tc] = await Promise.all([fetchCustomer(customerId), fetchCases({ includeDone: true }), fetchSupplyPoints(customerId), fetchTariffCategories()]);
    setCust(c);
    setSupplyPoints(sp);
    setTariffs(tc);
    const mine = all.filter(k => k.customer_id === customerId).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    setCases(mine);
    const [d, t] = await Promise.all([
      Promise.all(mine.map(k => fetchDocuments(k.id))),
      Promise.all(mine.map(k => fetchTimeline(k.id))),
    ]);
    setDocs(Object.fromEntries(mine.map((k, i) => [k.id, d[i]])));
    // the leads the cases came from (website-form files, «Προέλευση»); null = not readable by this user
    const leadIds = [...new Set(mine.map(k => k.lead_id).filter((x): x is string => !!x))];
    const fetched = await Promise.all(leadIds.map(id => fetchLead(id)));
    setLeads(Object.fromEntries(leadIds.map((id, i) => [id, fetched[i]])));
    // the lead's own history; a failed read (null) leaves the case entries untouched
    const acts = await Promise.all(leadIds.map(id => fetchEntityActivity('lead', id)));
    setLeadActs(Object.fromEntries(leadIds.map((id, i) => [id, acts[i]])));
    setEvents(mine.flatMap((k, i) => t[i].map(e => ({ ...e, case_no: k.case_no }))));
  }, [customerId]);
  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => customerSummary(cases, now), [cases, now]);
  const sel = useMemo(() => selectedCase(cases, picked), [cases, picked]);
  const history = useMemo(() => mergeHistory({
    caseEvents: events,
    leads: Object.entries(leads).filter((e): e is [string, Lead] => !!e[1]).map(([id, l]) => ({
      lead: { id, created_at: l.created_at, converted_at: l.converted_at, source_label: leadSourceInfo(l.source).label }, activity: leadActs[id] ?? null,
    })),
    statusText: s => leadStatusDisplay(s).label,
    typeLabel: activityLabel,
  }), [events, leads, leadActs]);
  const focus = useMemo(() => {
    const pick = mostUrgentCase(cases);
    if (!pick) return null;
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
    const parts = (cust.full_name ?? '').trim().split(/\s+/);
    setForm({ first_name: cust.first_name ?? parts[0] ?? '', last_name: cust.last_name ?? parts.slice(1).join(' '), full_name: cust.full_name ?? '', phone: cust.phone ?? '', email: cust.email ?? '', address: cust.address ?? '', city: cust.city ?? '', postal_code: cust.postal_code ?? '', notes: cust.notes ?? '', lat: cust.lat != null ? String(cust.lat) : '', lng: cust.lng != null ? String(cust.lng) : '' });
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    const composed = [form.first_name.trim(), form.last_name.trim()].filter(Boolean).join(' ');
    const ok = await updateCustomer(cust.id, {
      ...(names ? { first_name: form.first_name, last_name: form.last_name } : {}),
      full_name: (names ? composed : form.full_name.trim()) || cust.full_name, phone: form.phone || null, email: form.email || null,
      address: form.address || null, city: form.city || null, postal_code: form.postal_code || null, notes: form.notes,
      lat: form.lat.trim() === '' ? null : Number(form.lat), lng: form.lng.trim() === '' ? null : Number(form.lng),
    });
    if (!ok) { setSaving(false); toast('Η αποθήκευση απέτυχε. Δοκιμάστε ξανά.', 'bad'); return; }
    // the customer is saved; the linked lead is a second write and is reported on its own (D3)
    const sync = await syncLeadsFromCustomer(cust.id, { full_name: (names ? composed : form.full_name.trim()) || cust.full_name, phone: form.phone, email: form.email });
    setSaving(false);
    setSyncWarn(syncWarningText(sync));
    setEditing(false);
    const t = syncToast(sync);
    toast(t.text, t.tone);
    void load();
  };

  const tel = cust.phone ? `tel:${cust.phone.replace(/\s+/g, '')}` : null;
  const initials = cust.full_name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const allDocs = cases.flatMap(k => (docs[k.id] ?? []).map(d => ({ ...d, case_no: k.case_no })));
  const counts: Partial<Record<FolderTab, number>> = { cases: cases.length, docs: allDocs.length, history: history.length, ...(supplyPoints ? { supply: supplyPoints.filter(p => !p.archived_at).length } : {}) };
  const shownHistory = histTeam === 'all' ? history : history.filter(e => e.team === histTeam);
  const tabs = folderTabs({ backOffice: can(role, 'create_application'), supply: true, work: workAvail });
  const badge = folderBadge({ isLead: false, cases });
  const subtitle = folderSubtitle({ city: cust.city, since: cust.created_at, cases, fmtDate, staffName: id => staff.find(x => x.id === id)?.full_name ?? null });
  const scopedTab = tabs.find(t => t.id === tab)?.scoped ?? false;
  const originInfo = folderOrigin(cases, id => !!leads[id]);
  const originLead = originInfo.leadId ? leads[originInfo.leadId] ?? null : null;
  const otherDocs = allDocs.filter(d => d.case_id !== sel?.id);

  const caseRow = (k: Case) => {
    const { steps, outcome } = journeySteps(k.current_stage, []);
    const n = steps.filter(s => s.state === 'done').length;
    return (
      <li key={k.id} className="atx-row">
        <span className="atx-icon" aria-hidden="true"><Briefcase size={16} /></span>
        <button className="atx-row-main" aria-pressed={sel?.id === k.id} data-folder-case={k.case_no} onClick={() => setPicked(k.id)} title="Επιλογή case για τις καρτέλες του φακέλου">
          <span className="atx-row-title">{serviceLabel(k.service_type)} · {k.case_no}{sel?.id === k.id && cases.length > 1 ? <span className="font-normal text-[var(--atx-muted)]"> · επιλεγμένο</span> : null}</span>
          <span className="atx-row-sub">{outcome ? `Έκλεισε: ${stageText(outcome)}` : `${stageText(k.current_stage)} · βήμα ${Math.min(n + 1, 9)} από 9`}{supplyLabelFor(supplyPoints, k.supply_point_id) ? ` · ${supplyLabelFor(supplyPoints, k.supply_point_id)}` : ''}{k.next_action ? ` · ${k.next_action}` : ''}</span>
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
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="atx-title" style={{ fontSize: 28 }}>{cust.full_name}</h1>
            <span className={`atx-tag ${badge.id === 'open' ? 't-warning' : badge.id === 'customer' ? 't-success' : ''}`} data-folder-badge={badge.id}>{badge.label}</span>
          </div>
          <p className="atx-sub flex items-center gap-x-3 gap-y-1 flex-wrap" style={{ marginTop: 4 }}>
            {tel && <a className="atx-link !p-0 inline-flex items-center gap-1" href={tel}><Phone size={13} aria-hidden="true" />{cust.phone}</a>}
            {cust.email && <a className="atx-link !p-0 inline-flex items-center gap-1 truncate" href={`mailto:${cust.email}`}><Mail size={13} aria-hidden="true" />{cust.email}</a>}
            <span data-folder-subtitle>{subtitle}</span>
          </p>
        </div>
        {canEdit && !editing && !cust.deleted_at && <button className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" onClick={openEdit}><Pencil size={14} /> Επεξεργασία</button>}
        {/* the destructive action is last, small and quiet: it does not compete with the main actions */}
        {!cust.deleted_at && <TrashButton compact type="customer" id={cust.id} name={cust.full_name} onTrashed={() => { go('customers'); }} />}
      </div>
      {notice !== null && <div className="atx-notice" data-folder-notice>{convertedNotice(notice)}</div>}
      {syncWarn && <div className="atx-notice" role="alert" data-sync-warning>{syncWarn}</div>}
      {cust.deleted_at && <InTrashBanner type="customer" id={cust.id} deletedAt={cust.deleted_at} onRestored={() => void load()} />}

      {editing && (
        <div className="atx-panel" style={{ padding: 20 }}>
          <h2 className="atx-section-title mb-3">Επεξεργασία στοιχείων</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {(names ? [['first_name', 'Όνομα'], ['last_name', 'Επώνυμο']] as const : [['full_name', 'Ονοματεπώνυμο']] as const).map(([k, l]) => (
              <label key={k} className="text-[13px] font-medium">{l}
                <input className="field mt-1" value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
              </label>
            ))}
            {([['phone', 'Τηλέφωνο'], ['email', 'Email'], ['address', 'Διεύθυνση'], ['city', 'Πόλη'], ['postal_code', 'Τ.Κ.']] as const).map(([k, l]) => (
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
            <button className="atx-btn atx-btn-primary" disabled={saving || !(names ? (form.first_name.trim() || form.last_name.trim()) : form.full_name.trim())} onClick={() => void save()}>{saving ? '…' : 'Αποθήκευση'}</button>
            <button className="atx-btn atx-btn-quiet" disabled={saving} onClick={() => setEditing(false)}>Άκυρο</button>
          </div>
        </div>
      )}

      <div className="atx-pagetabs" role="tablist" aria-label="Ενότητες φακέλου">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="atx-pagetab" onClick={() => setTab(t.id)}>
            {t.label}{counts[t.id] !== undefined && <span className="opacity-60">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      {scopedTab && cases.length > 1 && sel && (
        <div className="flex items-center gap-2 flex-wrap text-[13px]" data-folder-scope>
          <span className="text-[var(--atx-muted)]">Case:</span>
          {cases.map(k => (
            <button key={k.id} className="atx-chip" aria-pressed={sel.id === k.id} onClick={() => setPicked(k.id)}>{k.case_no} · {serviceLabel(k.service_type)}</button>
          ))}
        </div>
      )}
      {scopedTab && !sel && (
        <div className="atx-panel"><div className="atx-empty"><strong>Κανένα case</strong>Οι ενότητες αυτές αφορούν ένα case. Τα cases δημιουργούνται από τη μετατροπή ενός lead ή από τη σελίδα Cases.</div></div>
      )}
      {sel && tab === 'followups' && <FollowUpsTab key={sel.id} caseId={sel.id} load={() => void load()} />}
      {sel && tab === 'visits' && <VisitsTab key={sel.id} c={sel} />}
      {sel && tab === 'offers' && <OffersTab key={sel.id} caseId={sel.id} />}
      {sel && tab === 'signatures' && <SignaturesTab key={sel.id} caseId={sel.id} />}
      {sel && tab === 'backoffice' && <BackOfficeTab key={sel.id} c={sel} reload={() => void load()} />}

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
            {sel && (
              <div data-folder-progress={sel.case_no}>
                <CaseProgress c={sel} allowedNext={[]} canChange={false} onPick={() => undefined} visited={visitedStages(events.filter(e => e.case_id === sel.id), sel.current_stage)} />
                <p className="text-[12.5px] text-[var(--atx-muted)] mt-1.5 px-1">Case {sel.case_no} · {serviceLabel(sel.service_type)}. Η αλλαγή σταδίου γίνεται από το <button className="atx-link !p-0 text-[12.5px]" onClick={() => openCase(sel.id)}>case</button>.</p>
              </div>
            )}
            <div className="atx-panel">
              <div className="atx-section-head" style={{ padding: '16px 16px 0' }}><h2 className="atx-section-title">Cases</h2><span className="text-[13px] text-[var(--atx-muted)]">{caseCountText(summary)}</span></div>
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
            <div className="atx-panel" style={{ padding: 20 }} data-folder-origin>
              <h2 className="atx-section-title mb-2">Προέλευση</h2>
              {originLead ? (
                <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]" data-origin-lead>
                  <dt className="text-[var(--atx-muted)]">Πηγή</dt><dd className="m-0 font-medium">{leadSourceInfo(originLead.source).label}{originLead.campaign_name ? ` · ${originLead.campaign_name}` : ''}</dd>
                  <dt className="text-[var(--atx-muted)]">Καταχώρηση</dt><dd className="m-0 font-medium">{fmtDate(originLead.created_at)}</dd>
                  {originLead.converted_at && (<><dt className="text-[var(--atx-muted)]">Μετατροπή</dt><dd className="m-0 font-medium">{fmtDate(originLead.converted_at)}</dd></>)}
                  {originLead.partner && (<><dt className="text-[var(--atx-muted)]">Συνεργάτης</dt><dd className="m-0 font-medium">{originLead.partner}</dd></>)}
                </dl>
              ) : <p className="text-[14px] text-[var(--atx-muted)] m-0" data-origin-state={originInfo.kind}>{ORIGIN_TEXT[originInfo.kind === 'lead' ? 'unavailable' : originInfo.kind]}</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'supply' && <SupplyPointsTab owner={{ customerId: cust.id }} points={supplyPoints} tariffs={tariffs} cases={cases} docs={allDocs} leadFiles={Object.values(leads).flatMap(l => (l ? toLeadFiles(l.attached_files).filter(f => f.supply_point_id) : []))} canEdit={!cust.deleted_at} reload={() => void load()} />}

      {tab === 'work' && <CustomerWork customerId={cust.id} points={supplyPoints ?? null} />}

      {tab === 'cases' && (
        <div className="atx-panel">
          {cases.length === 0 ? <div className="atx-empty"><strong>Κανένα case</strong></div> : <ul className="m-0 p-0 list-none">{cases.map(caseRow)}</ul>}
        </div>
      )}

      {tab === 'docs' && sel && (
        <div className="space-y-4" data-folder-docs={sel.case_no}>
          <CaseDocuments key={sel.id} c={sel} onChanged={() => void load()} leadFiles={toLeadFiles(sel.lead_id ? leads[sel.lead_id]?.attached_files : null)} />
          {otherDocs.length > 0 && (
            <div className="atx-panel">
              <div className="atx-section-head" style={{ padding: '16px 16px 0' }}><h2 className="atx-section-title">Έγγραφα άλλων cases</h2><span className="text-[13px] text-[var(--atx-muted)]">{otherDocs.length}</span></div>
              <ul className="m-0 p-0 list-none">
                {otherDocs.map(d => (
                  <li key={d.id} className="atx-row">
                    <span className="atx-icon" aria-hidden="true"><FileText size={16} /></span>
                    <button className="atx-row-main" onClick={() => setPicked(d.case_id)}>
                      <span className="atx-row-title">{docLabel(d.category)}</span>
                      <span className="atx-row-sub">Case {d.case_no} · {fmtDateTime(d.created_at)}{d.description ? ` · ${d.description}` : ''}</span>
                    </button>
                    <span className={`atx-tag ${DOC_TONE[d.status] ?? ''}`}>{DOC_TEXT[d.status] ?? d.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {tab === 'docs' && !sel && (
        <div className="atx-panel"><div className="atx-empty"><strong>Δεν υπάρχουν έγγραφα</strong>Τα έγγραφα ανήκουν σε ένα case. Τα cases δημιουργούνται από τη μετατροπή ενός lead ή από τη σελίδα Cases.</div></div>
      )}

      {tab === 'history' && (
        <div className="atx-panel" style={{ padding: 20 }} data-folder-history>
          {sel && (
            <>
              {cases.length > 1 && <p className="text-[12.5px] text-[var(--atx-muted)] mt-0 mb-2">Η καταγραφή αφορά το case {sel.case_no}.</p>}
              <TimelineComposer key={sel.id} caseId={sel.id} onAdded={() => void load()} />
            </>
          )}
          <div className="flex gap-1.5 flex-wrap mb-4">
            {TEAM_FILTERS.map(t => (
              <button key={t.id} className="atx-chip" aria-pressed={histTeam === t.id} onClick={() => setHistTeam(t.id)}>{t.label}</button>
            ))}
          </div>
          {shownHistory.length === 0 ? <div className="atx-empty"><strong>Δεν υπάρχει ιστορικό</strong>Οι ενέργειες του lead και όλων των cases του πελάτη εμφανίζονται εδώ.</div> : (
            <ol className="m-0 p-0 list-none space-y-3">
              {shownHistory.map(e => (
                <li key={e.key} className="flex gap-3" data-history-source={e.source}>
                  <span className="atx-icon" style={{ width: 30, height: 30 }} aria-hidden="true"><Clock size={14} /></span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium">{e.title}</span>
                    <span className="block text-[12.5px] text-[var(--atx-muted)]">
                      {e.source === 'lead' ? 'Lead' : <>{e.typeLabel} · Case <button className="atx-link !p-0 text-[12.5px]" onClick={() => e.caseId && openCase(e.caseId)}>{e.label}</button></>} · {fmtDateTime(e.at)}{e.userName ? ` · ${e.userName}` : ''}
                    </span>
                    {e.description && <span className="block text-[13px] mt-0.5 whitespace-pre-line">{e.description}</span>}
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
