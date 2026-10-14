/* B2B Prospecting — Discover → Screen → Review → Distribute (staged migration phase3/08 + scrape-b2b).
   Search results become PROSPECTS in a review queue (never leads, never permission to contact). Back Office /
   admin / manager approve, exclude or mark duplicates, then distribute approved prospects to sales agents, which
   creates internal work only. Inside Sales may search and see the queue. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Download, History, Radar, Search, ShieldAlert, UserPlus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { useToast } from '@/lib/toast';
import { useStaff } from '@/lib/useStaff';
import { fetchLeads } from '@/lib/api';
import { B2B_CATEGORIES, GREEK_REGIONS, categoryLabel } from '@/lib/scraper';
import { Modal, Spinner, fmtDateTime } from '@/lib/ui';
import {
  DUP_TEXT, QUALITY_TEXT, canReview, canSearch, deleteProfile, distributeProspects, listJobs, listProfiles, listProspects,
  planQueries, queriesToday, reviewProspects, runSearch, saveProfile, validateSearch,
} from '@/lib/b2b';
import type { DistributeMode, Prospect, ProspectStatus, SearchJob, SearchOutcome, SearchParams, SearchProfile } from '@/lib/b2b';

type Tab = 'search' | 'review' | 'assign' | 'jobs';
const TAB_TEXT: Record<Tab, string> = { search: 'Αναζήτηση', review: 'Έλεγχος', assign: 'Ανάθεση', jobs: 'Ιστορικό αναζητήσεων' };

export default function ProspectingPage() {
  const { role } = useAuth();
  const reviewer = canReview(role);
  const tabs: Tab[] = reviewer ? ['search', 'review', 'assign', 'jobs'] : ['search', 'review', 'jobs'];
  const [tab, setTab] = useState<Tab>('search');
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const [approvedCount, setApprovedCount] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    void listProspects(['new']).then(r => setReviewCount(r.error ? null : r.rows.length));
    void listProspects(['approved']).then(r => setApprovedCount(r.error ? null : r.rows.length));
  }, [version]);

  if (!canSearch(role)) {
    return <div className="atx-page"><div className="atx-panel"><div className="atx-empty"><strong>Δεν έχετε πρόσβαση</strong>Ο ρόλος σας δεν περιλαμβάνει την αναζήτηση επιχειρήσεων.</div></div></div>;
  }
  return (
    <div className="atx-page atx-admin">
      <div className="atx-head">
        <p className="atx-eyebrow">Πωλήσεις</p>
        <h1 className="atx-title">B2B Prospecting</h1>
        <p className="atx-sub">Εύρεση επιχειρήσεων → έλεγχος → ανάθεση σε πωλητή.</p>
      </div>
      <div className="atx-notice mt-3 flex gap-2" role="note">
        <ShieldAlert size={16} className="shrink-0 mt-0.5" />
        <span>Η εύρεση μιας επιχείρησης <strong>δεν</strong> αποτελεί άδεια επικοινωνίας. Οι αναθέσεις δημιουργούν μόνο εσωτερική εργασία — δεν στέλνεται κανένα μήνυμα. Πριν από τηλεφωνική προώθηση απαιτείται έλεγχος των μητρώων του Άρθρου 11.</span>
      </div>
      <div className="atx-pagetabs mt-4" role="tablist" aria-label="B2B ενότητες">
        {tabs.map(t => (
          <button key={t} role="tab" aria-selected={tab === t} className="atx-pagetab" onClick={() => setTab(t)}>
            {TAB_TEXT[t]}
            {t === 'review' && reviewCount ? <span className="atx-count">{reviewCount}</span> : null}
            {t === 'assign' && approvedCount ? <span className="atx-count">{approvedCount}</span> : null}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {tab === 'search' && <SearchTab onDone={() => { setVersion(v => v + 1); }} onOpenReview={() => setTab('review')} />}
        {tab === 'review' && <ReviewTab reviewer={reviewer} onChanged={() => setVersion(v => v + 1)} />}
        {tab === 'assign' && reviewer && <AssignTab onChanged={() => setVersion(v => v + 1)} />}
        {tab === 'jobs' && <JobsTab />}
      </div>
    </div>
  );
}

/* ───────────────────────── Αναζήτηση ───────────────────────── */
function Chips({ options, value, onChange, label }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(o => {
        const on = value.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} className={`atx-chip ${on ? 'is-on' : ''}`}
            onClick={() => onChange(on ? value.filter(x => x !== o.value) : [...value, o.value])}>{on && <Check size={12} className="inline mr-1" />}{o.label}</button>
        );
      })}
    </div>
  );
}

const splitList = (s: string) => s.split(/[,\n]/).map(x => x.trim()).filter(Boolean);

function SearchTab({ onDone, onOpenReview }: { onDone: () => void; onOpenReview: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [categories, setCategories] = useState<string[]>(['hotel']);
  const [regions, setRegions] = useState<string[]>(['Αττική']);
  const [cities, setCities] = useState('');
  const [keywords, setKeywords] = useState('');
  const [perQuery, setPerQuery] = useState(20);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [used, setUsed] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<SearchProfile[]>([]);
  const [profileName, setProfileName] = useState('');
  const loadMeta = useCallback(() => { void queriesToday().then(setUsed); void listProfiles().then(setProfiles); }, []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const body = { categories, regions, cities: splitList(cities), keywords: splitList(keywords), max_per_query: perQuery };
  const v = validateSearch(body);
  const plan = v.ok ? planQueries(v.params) : null;

  const run = async () => {
    if (!v.ok) return;
    setRunning(true); setOutcome(null);
    const r = await runSearch(v.params);
    setRunning(false); setOutcome(r); loadMeta();
    if (r.success) onDone();
  };
  const applyProfile = (p: SearchProfile) => {
    setCategories(p.params.categories ?? []); setRegions(p.params.regions ?? []); setCities((p.params.cities ?? []).join(', '));
    setKeywords((p.params.keywords ?? []).join(', ')); setPerQuery(p.params.max_per_query ?? 20);
  };
  const save = async () => {
    if (!v.ok || !user || !profileName.trim()) return;
    const e = await saveProfile(profileName, v.params as SearchParams, user.id);
    if (e) toast(e, 'bad'); else { toast('Η αναζήτηση αποθηκεύτηκε.', 'ok'); setProfileName(''); loadMeta(); }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-4 items-start">
      <div className="atx-panel atx-form">
        <div><div className="atx-form-label">Κατηγορίες επιχειρήσεων</div>
          <Chips label="Κατηγορίες" value={categories} onChange={setCategories} options={B2B_CATEGORIES.map(c => ({ value: c.value, label: c.label }))} /></div>
        <div><div className="atx-form-label">Περιοχές</div>
          <Chips label="Περιοχές" value={regions} onChange={setRegions} options={GREEK_REGIONS.map(r => ({ value: r, label: r }))} /></div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block"><span className="atx-form-label">Πόλεις / δήμοι (προαιρετικό)</span>
            <input className="field" value={cities} onChange={e => setCities(e.target.value)} placeholder="π.χ. Γλυφάδα, Βούλα, Βάρη" /></label>
          <label className="block"><span className="atx-form-label">Λέξεις-κλειδιά (προαιρετικό)</span>
            <input className="field" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="π.χ. ψυκτικοί θάλαμοι, πισίνα" /></label>
        </div>
        <label className="block w-64"><span className="atx-form-label">Αποτελέσματα ανά αναζήτηση</span>
          <select className="field" value={perQuery} onChange={e => setPerQuery(Number(e.target.value))}>{[5, 10, 20].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <button className="atx-btn atx-btn-primary inline-flex items-center gap-1.5" disabled={!v.ok || running} onClick={() => void run()}>
            {running ? <Spinner /> : <Search size={15} />} Αναζήτηση
          </button>
          <span className="text-[13px] text-[var(--atx-muted)]">
            {v.ok ? `${plan!.queries.length} αναζητήσεις${plan!.truncated ? ` (+${plan!.truncated} πάνω από το όριο)` : ''}` : v.error}
            {used !== null ? ` · σήμερα έχουν γίνει ${used}` : ''}
          </span>
        </div>
        {outcome && (
          outcome.success
            ? <div className="atx-result" role="status" data-outcome="ok">
                <strong>Βρέθηκαν {outcome.found} επιχειρήσεις · {outcome.new} νέες για έλεγχο{outcome.duplicates ? ` · ${outcome.duplicates} πιθανά διπλότυπα` : ''}</strong>
                <span className="block text-[13px]">Έγιναν {outcome.ran} αναζητήσεις{outcome.truncated ? ` · ${outcome.truncated} δεν έγιναν λόγω ορίου` : ''}{outcome.errors?.length ? ` · ${outcome.errors.length} με σφάλμα` : ''}.</span>
                {!!outcome.new && <button className="atx-link" onClick={onOpenReview}>Προς έλεγχο →</button>}
              </div>
            : <div className="atx-notice" role="alert">{outcome.error ?? 'Η αναζήτηση απέτυχε.'}</div>
        )}
      </div>
      <div className="atx-panel atx-form">
        <div className="atx-form-label flex items-center gap-1.5"><History size={14} /> Αποθηκευμένες αναζητήσεις</div>
        {profiles.length === 0 && <p className="text-[13px] text-[var(--atx-muted)]">Καμία ακόμη.</p>}
        <ul className="m-0 p-0 list-none space-y-1">
          {profiles.map(p => (
            <li key={p.id} className="flex items-center gap-2">
              <button className="atx-link text-left flex-1 truncate" onClick={() => applyProfile(p)}>{p.name}</button>
              {p.created_by === user?.id && <button className="atx-icon-btn" aria-label={`Διαγραφή ${p.name}`} onClick={() => void deleteProfile(p.id).then(loadMeta)}><X size={14} /></button>}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input className="field" value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Όνομα, π.χ. «Ξενοδοχεία νότια»" aria-label="Όνομα αναζήτησης" />
          <button className="atx-btn atx-btn-quiet" disabled={!v.ok || !profileName.trim()} onClick={() => void save()}>Αποθήκευση</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Έλεγχος ───────────────────────── */
const STATUS_FILTERS: { id: ProspectStatus; label: string }[] = [
  { id: 'new', label: 'Προς έλεγχο' }, { id: 'excluded', label: 'Εξαιρέθηκαν' }, { id: 'duplicate', label: 'Διπλότυπα' }, { id: 'assigned', label: 'Ανατέθηκαν' },
];

function prospectsCsv(rows: Prospect[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Επωνυμία', 'Κατηγορία', 'Πόλη', 'Περιοχή', 'Τηλέφωνο', 'Ιστοσελίδα', 'Κατάσταση', 'Συλλογή'];
  return [head.join(','), ...rows.map(r => [r.company_name, categoryLabel(r.category ?? ''), r.city, r.region, r.phone, r.domain, r.status, r.collected_at].map(esc).join(','))].join('\n');
}

function ProspectTable({ rows, selected, onToggle, onToggleAll, extra }: {
  rows: Prospect[]; selected: Set<string>; onToggle: (id: string) => void; onToggleAll: () => void; extra?: (p: Prospect) => React.ReactNode;
}) {
  return (
    <table className="atx-table">
      <thead><tr>
        <th className="w-8"><input type="checkbox" aria-label="Επιλογή όλων" checked={rows.length > 0 && selected.size === rows.length} onChange={onToggleAll} /></th>
        <th>Επιχείρηση</th><th className="max-md:hidden">Κατηγορία · περιοχή</th><th>Έλεγχοι</th><th className="max-md:hidden">Συλλογή</th>{extra && <th />}
      </tr></thead>
      <tbody>
        {rows.map(p => (
          <tr key={p.id} data-prospect={p.company_name}>
            <td><input type="checkbox" aria-label={`Επιλογή ${p.company_name}`} checked={selected.has(p.id)} onChange={() => onToggle(p.id)} /></td>
            <td>
              <span className="block font-medium">{p.company_name}</span>
              <span className="block text-[12.5px] text-[var(--atx-muted)]">{[p.phone, p.domain].filter(Boolean).join(' · ') || '—'}</span>
            </td>
            <td className="max-md:hidden text-[13px]">{categoryLabel(p.category ?? '') || '—'} · {p.city ?? p.region ?? '—'}</td>
            <td className="text-[12.5px]">
              {p.duplicate_of && <span className="atx-tag t-warning mr-1 inline-flex items-center gap-1"><AlertTriangle size={11} /> {DUP_TEXT(p.duplicate_of)}</span>}
              {p.quality.map(q => <span key={q} className="atx-tag mr-1">{QUALITY_TEXT[q] ?? q}</span>)}
              {p.review_reason && <span className="block text-[var(--atx-muted)]">«{p.review_reason}»</span>}
              {!p.duplicate_of && p.quality.length === 0 && !p.review_reason && <span className="atx-tag t-success">πλήρη στοιχεία</span>}
            </td>
            <td className="max-md:hidden text-[13px] text-[var(--atx-muted)]">{fmtDateTime(p.collected_at)}</td>
            {extra && <td className="text-right">{extra(p)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReviewTab({ reviewer, onChanged }: { reviewer: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<ProspectStatus>('new');
  const [rows, setRows] = useState<Prospect[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [onlyDup, setOnlyDup] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reasonFor, setReasonFor] = useState<'exclude' | 'duplicate' | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await listProspects([status]);
    setRows(r.rows); setError(r.error); setSelected(new Set());
  }, [status]);
  useEffect(() => { setRows(null); void load(); }, [load]);

  const visible = useMemo(() => (rows ?? []).filter(p => (!onlyDup || p.duplicate_of)
    && (!q.trim() || `${p.company_name} ${p.phone ?? ''} ${p.city ?? ''} ${p.domain ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [rows, q, onlyDup]);

  const act = async (action: 'approve' | 'exclude' | 'duplicate' | 'reopen', reason?: string) => {
    setBusy(true);
    const r = await reviewProspects([...selected], action, reason);
    setBusy(false); setReasonFor(null);
    if (r.error) { toast(r.error, 'bad'); return; }
    toast(`${r.changed} ${action === 'approve' ? 'εγκρίθηκαν' : action === 'exclude' ? 'εξαιρέθηκαν' : action === 'duplicate' ? 'σημειώθηκαν ως διπλότυπα' : 'επανήλθαν για έλεγχο'}.`, r.changed ? 'ok' : 'bad');
    await load(); onChanged();
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob(['﻿' + prospectsCsv(visible)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `b2b-${status}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="atx-tabs" role="tablist" aria-label="Κατάσταση">
          {STATUS_FILTERS.map(f => <button key={f.id} role="tab" aria-selected={status === f.id} className="atx-tab" onClick={() => setStatus(f.id)}>{f.label}</button>)}
        </div>
        <label className="atx-search"><Search size={15} aria-hidden="true" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Αναζήτηση" aria-label="Αναζήτηση επιχειρήσεων" /></label>
        <label className="text-[13px] inline-flex items-center gap-1.5"><input type="checkbox" checked={onlyDup} onChange={e => setOnlyDup(e.target.checked)} /> Μόνο πιθανά διπλότυπα</label>
        <span className="flex-1" />
        <button className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" disabled={!visible.length} onClick={exportCsv}><Download size={14} /> CSV</button>
      </div>
      {reviewer && selected.size > 0 && (
        <div className="atx-bulk" role="toolbar" aria-label="Μαζικές ενέργειες">
          <span>{selected.size} επιλεγμένα</span>
          {status === 'new' && <button className="atx-btn atx-btn-primary inline-flex items-center gap-1" disabled={busy} onClick={() => void act('approve')}><Check size={14} /> Έγκριση</button>}
          {status === 'new' && <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={() => setReasonFor('duplicate')}>Διπλότυπο</button>}
          {status === 'new' && <button className="atx-btn atx-btn-quiet text-[var(--atx-red)]" disabled={busy} onClick={() => setReasonFor('exclude')}>Εξαίρεση</button>}
          {(status === 'excluded' || status === 'duplicate') && <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={() => void act('reopen')}>Επαναφορά για έλεγχο</button>}
        </div>
      )}
      {!reviewer && <p className="text-[13px] text-[var(--atx-muted)]">Τον έλεγχο και την ανάθεση τα κάνει το Back Office.</p>}
      {error && <div className="atx-notice" role="alert">{error}</div>}
      <div className="atx-panel" aria-busy={rows === null}>
        {rows === null && [0, 1, 2].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}
        {rows && visible.length === 0 && !error && <div className="atx-empty !py-8"><strong>Τίποτα εδώ</strong>{status === 'new' ? 'Κάντε μια αναζήτηση για να γεμίσει η λίστα ελέγχου.' : 'Δεν υπάρχουν εγγραφές.'}</div>}
        {rows && visible.length > 0 && (
          <ProspectTable rows={visible} selected={selected}
            onToggle={id => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
            onToggleAll={() => setSelected(s => (s.size === visible.length ? new Set() : new Set(visible.map(p => p.id))))} />
        )}
      </div>
      {reasonFor && <ReasonDialog action={reasonFor} count={selected.size} onClose={() => setReasonFor(null)} onSubmit={r => void act(reasonFor, r)} busy={busy} />}
    </div>
  );
}

function ReasonDialog({ action, count, onClose, onSubmit, busy }: { action: 'exclude' | 'duplicate'; count: number; onClose: () => void; onSubmit: (r: string) => void; busy: boolean }) {
  const [reason, setReason] = useState('');
  return (
    <Modal open onClose={() => !busy && onClose()} title={action === 'exclude' ? `Εξαίρεση ${count} επιχειρήσεων` : `Διπλότυπα: ${count}`} micro="B2B Prospecting">
      <div className="space-y-3">
        {action === 'exclude' && <p className="text-[14px] text-[var(--atx-muted)]">Κρατάμε μόνο ό,τι χρειάζεται για να μην ξαναεισαχθούν (επωνυμία, τηλέφωνο, αιτία)· διεύθυνση, ιστοσελίδα και συντεταγμένες διαγράφονται.</p>}
        <label className="block"><span className="atx-form-label">Αιτία *</span>
          <input className="field" value={reason} onChange={e => setReason(e.target.value)} placeholder={action === 'exclude' ? 'π.χ. εκτός στόχου, έκλεισε, ζήτησε να μην επικοινωνήσουμε' : 'π.χ. ίδιο με υπάρχον lead'} /></label>
        <div className="flex justify-end gap-2">
          <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={onClose}>Άκυρο</button>
          <button className="atx-btn atx-btn-primary" disabled={busy || reason.trim().length < 3} onClick={() => onSubmit(reason)}>{busy ? '…' : 'Επιβεβαίωση'}</button>
        </div>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Ανάθεση ───────────────────────── */
const MODE_TEXT: Record<DistributeMode, { label: string; hint: string }> = {
  manual: { label: 'Σε έναν πωλητή', hint: 'Όλα τα επιλεγμένα στον ίδιο.' },
  round_robin: { label: 'Εκ περιτροπής', hint: 'Ένα-ένα με τη σειρά των πωλητών.' },
  workload: { label: 'Μικρότερος φόρτος', hint: 'Κάθε επιχείρηση στον πωλητή με τα λιγότερα ανοιχτά leads.' },
};

function AssignTab({ onChanged }: { onChanged: () => void }) {
  const { toast } = useToast();
  const { go } = useNav();
  const staff = useStaff();
  const [rows, setRows] = useState<Prospect[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<DistributeMode>('workload');
  const [agents, setAgents] = useState<string[]>([]);
  const [openLeads, setOpenLeads] = useState<Map<string, number>>(new Map());
  const [busy, setBusy] = useState(false);
  const sales = staff.filter(s => s.role === 'inside_sales' || s.role === 'field_sales');
  const load = useCallback(async () => {
    const r = await listProspects(['approved']);
    setRows(r.rows); setError(r.error); setSelected(new Set());
    const leads = await fetchLeads();
    const m = new Map<string, number>();
    for (const l of leads) if (l.assigned_to_user_id && ['new', 'contacted', 'qualified', 'meeting', 'offer'].includes(l.status ?? 'new')) m.set(l.assigned_to_user_id, (m.get(l.assigned_to_user_id) ?? 0) + 1);
    setOpenLeads(m);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const toggleAgent = (id: string) => setAgents(a => (mode === 'manual' ? [id] : a.includes(id) ? a.filter(x => x !== id) : [...a, id]));
  const valid = selected.size > 0 && agents.length > 0 && (mode !== 'manual' || agents.length === 1);

  const assign = async () => {
    setBusy(true);
    const r = await distributeProspects([...selected], mode, agents);
    setBusy(false);
    if (r.error) { toast(r.error, 'bad'); return; }
    const name = (id: string) => staff.find(s => s.id === id)?.full_name ?? 'πωλητή';
    const per = new Map<string, number>();
    for (const a of r.assigned) per.set(a.agent, (per.get(a.agent) ?? 0) + 1);
    toast(`Ανατέθηκαν ${r.assigned.length}: ${[...per.entries()].map(([a, n]) => `${name(a)} ${n}`).join(' · ')}`, r.assigned.length ? 'ok' : 'bad');
    await load(); onChanged();
  };

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
      <div className="space-y-3">
        {error && <div className="atx-notice" role="alert">{error}</div>}
        <div className="atx-panel" aria-busy={rows === null}>
          {rows === null && [0, 1].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}
          {rows && rows.length === 0 && !error && <div className="atx-empty !py-8"><strong>Δεν υπάρχουν εγκεκριμένες επιχειρήσεις</strong>Εγκρίνετε από την καρτέλα «Έλεγχος».</div>}
          {rows && rows.length > 0 && (
            <ProspectTable rows={rows} selected={selected}
              onToggle={id => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
              onToggleAll={() => setSelected(s => (s.size === rows.length ? new Set() : new Set(rows.map(p => p.id))))} />
          )}
        </div>
      </div>
      <div className="atx-panel atx-form">
        <div className="atx-form-label">Τρόπος ανάθεσης</div>
        <div role="radiogroup" aria-label="Τρόπος ανάθεσης" className="space-y-1.5">
          {(Object.keys(MODE_TEXT) as DistributeMode[]).map(m => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); if (m === 'manual') setAgents(a => a.slice(0, 1)); }}
              className={`w-full text-left rounded-xl border px-3 py-2 ${mode === m ? 'border-brand-600 bg-brand-50' : 'border-line'}`}>
              <span className="block text-[14px] font-medium">{MODE_TEXT[m].label}</span><span className="block text-xs text-ink/50">{MODE_TEXT[m].hint}</span>
            </button>
          ))}
        </div>
        <div className="atx-form-label">Πωλητές</div>
        <ul className="m-0 p-0 list-none space-y-1" aria-label="Πωλητές">
          {sales.map(s => (
            <li key={s.id}>
              <label className="flex items-center gap-2 text-[14px] cursor-pointer">
                <input type={mode === 'manual' ? 'radio' : 'checkbox'} name="agent" checked={agents.includes(s.id)} onChange={() => toggleAgent(s.id)} />
                <span className="flex-1">{s.full_name} <span className="text-[var(--atx-muted)] text-[12.5px]">· {s.role === 'inside_sales' ? 'Inside' : 'Field'} · {openLeads.get(s.id) ?? 0} ανοιχτά leads</span></span>
              </label>
            </li>
          ))}
          {sales.length === 0 && <li className="text-[13px] text-[var(--atx-muted)]">Δεν υπάρχουν ενεργοί πωλητές.</li>}
        </ul>
        <button className="atx-btn atx-btn-primary inline-flex items-center gap-1.5 justify-center" disabled={!valid || busy} onClick={() => void assign()}>
          {busy ? <Spinner /> : <UserPlus size={15} />} Ανάθεση {selected.size || ''}
        </button>
        <p className="text-[12px] text-[var(--atx-muted)]">Κάθε επιχείρηση γίνεται ένα lead στον πωλητή, που ειδοποιείται. Δεν στέλνεται τίποτα στην επιχείρηση. <button className="atx-link !p-0" onClick={() => go('leads')}>Leads →</button></p>
      </div>
    </div>
  );
}

/* ───────────────────────── Ιστορικό ───────────────────────── */
function JobsTab() {
  const staff = useStaff();
  const [rows, setRows] = useState<SearchJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void listJobs().then(r => { setRows(r.rows); setError(r.error); }); }, []);
  const who = (id: string | null) => (id ? staff.find(s => s.id === id)?.full_name ?? 'χρήστης' : 'Atlas AI / σύστημα');
  const what = (p: SearchParams) => [p.categories.map(c => categoryLabel(c)).join(', '), p.keywords.join(', '), (p.cities.length ? p.cities : p.regions).join(', ')].filter(Boolean).join(' · ');
  return (
    <div className="atx-panel" aria-busy={rows === null}>
      {error && <div className="atx-notice m-3" role="alert">{error}</div>}
      {rows === null && [0, 1].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}
      {rows && rows.length === 0 && !error && <div className="atx-empty !py-8"><Radar className="mx-auto mb-2" size={22} /><strong>Καμία αναζήτηση ακόμη</strong></div>}
      {rows && rows.length > 0 && (
        <table className="atx-table">
          <thead><tr><th>Πότε</th><th>Ποιος</th><th>Τι</th><th>Αναζητήσεις</th><th>Αποτελέσματα</th><th>Κατάσταση</th></tr></thead>
          <tbody>
            {rows.map(j => (
              <tr key={j.id}>
                <td className="whitespace-nowrap text-[13px]">{fmtDateTime(j.created_at)}</td>
                <td className="text-[13px]">{who(j.created_by)}</td>
                <td className="text-[13px]">{what(j.params)}</td>
                <td className="text-[13px]">{j.queries_done} / {j.queries_planned}</td>
                <td className="text-[13px]">{j.results_found} · {j.results_new} νέες{j.results_duplicate ? ` · ${j.results_duplicate} διπλ.` : ''}</td>
                <td><span className={`atx-tag ${j.status === 'done' ? 't-success' : j.status === 'failed' ? 't-danger' : ''}`} title={j.error ?? undefined}>{j.status === 'done' ? 'Ολοκληρώθηκε' : j.status === 'failed' ? 'Απέτυχε' : j.status === 'running' ? 'Σε εξέλιξη' : 'Ακυρώθηκε'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
