/* Lead details — identity, recommended next action (a suggestion), contact details, history.
   Uses ONLY existing lead operations: updateLeadStage, convertLeadToCase, updateLead (via the page's edit form).
   Status changes are audited with the existing logAudit helper. Stored status values are never rewritten for display. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clock, FileText, Mail, MapPin, Pencil, Phone, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { can, LEAD_STATUSES, leadSourceInfo, propertyLabel, serviceLabel } from '@/lib/roles';
import { convertLeadToCase, fetchCase, fetchEntityActivity, fetchLead, fetchLeadSupplyPoints, fetchTariffCategories, getLeadFileUrl, logAudit, updateLeadStage } from '@/lib/api';
import SupplyPointsTab from '@/components/customers/SupplyPointsTab';
import type { SupplyPoint, TariffCategory } from '@/lib/supply-points';
import { fileSizeText, leadFiles } from '@/lib/lead-files';
import { tagLeadFile } from '@/lib/lead-intake';
import { supplyLabelFor } from '@/lib/supply-points';
import { InTrashBanner, TrashButton } from '@/components/trash/TrashControls';
import ContactEligibility from '@/components/contact/ContactEligibility';
import type { ActivityLogRow, Lead } from '@/lib/api';
import { leadStatusDisplay } from '@/lib/lead-status';
import { leadNextAction } from '@/lib/lead-next';
import { leadName } from '@/lib/work';
import { useToast } from '@/lib/toast';
import { fmtDateTime } from '@/lib/ui';
import { leadActionText } from '@/lib/history-text';
import { FOLDER_TABS, NEEDS_CASE_TEXT, folderBadge, folderTabs, shouldRedirectLead } from '@/lib/folder';
import type { FolderTab } from '@/lib/folder';


export default function LeadDetail({ leadId, version, onEdit }: { leadId: string; version: number; onEdit: (l: Lead) => void }) {
  const { role, user } = useAuth();
  const { go, openCase } = useNav();
  const { toast } = useToast();
  const [lead, setLead] = useState<Lead | null | undefined>(undefined);
  // «Παροχές» on the lead (staged phase5/17 + 18): undefined = loading, null = the SQL is not applied yet
  const [supplyPoints, setSupplyPoints] = useState<SupplyPoint[] | null | undefined>(undefined);
  const [tariffs, setTariffs] = useState<TariffCategory[] | null>(null);
  const [activity, setActivity] = useState<ActivityLogRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [now] = useState(() => Date.now());
  const [tab, setTab] = useState<FolderTab>('overview');
  const [noFolder, setNoFolder] = useState(false);
  const redirected = useRef(false);
  // Back Office may work (and convert) a lead routed to them with documents; the server allows any active staff.
  const isStaff = can(role, 'create_case') || (role === 'back_office' && !!lead && lead.assigned_to_user_id === user?.id);

  const load = useCallback(async () => {
    const [l, a, sp, tc] = await Promise.all([fetchLead(leadId), fetchEntityActivity('lead', leadId), fetchLeadSupplyPoints(leadId), fetchTariffCategories()]);
    setLead(l);
    setActivity(a);
    setSupplyPoints(sp);
    setTariffs(tc);
  }, [leadId]);
  useEffect(() => { void load(); }, [load, version]);

  // Files the visitor attached on the website form (private bucket; links are short-lived).
  const files = useMemo(() => leadFiles(lead?.attached_files), [lead]);
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r: Record<string, string> = {};
      for (const f of files) { const u = await getLeadFileUrl(f.path); if (u) r[f.path] = u; }
      if (alive) setFileUrls(r);
    })();
    return () => { alive = false; };
  }, [files]);

  // A converted lead has no screen of its own: open the customer folder (Part B). If the folder cannot be found
  // (the case is not readable), the lead stays readable with a link to the case.
  useEffect(() => {
    if (!lead || redirected.current || !shouldRedirectLead(lead)) return;
    redirected.current = true;
    void fetchCase(lead.converted_case_id!).then(k => {
      if (k?.customer_id) go('customers', { customer: k.customer_id, notice: 'lead-converted', since: lead.converted_at ?? '' });
      else setNoFolder(true);
    });
  }, [lead, go]);

  if (lead === undefined || (lead && shouldRedirectLead(lead) && !noFolder)) return <div className="atx-page"><div className="atx-panel" data-lead-redirect>{[0, 1, 2].map(i => <div key={i} className="atx-skeleton" />)}</div></div>;
  if (lead === null) {
    return (
      <div className="atx-page">
        <button className="atx-link inline-flex items-center gap-1" onClick={() => go('leads')}><ArrowLeft size={15} /> Επιστροφή στα leads</button>
        <div className="atx-panel mt-4"><div className="atx-empty"><strong>Το lead δεν βρέθηκε</strong>Μπορεί να έχει διαγραφεί ή να μην έχετε πρόσβαση σε αυτό.</div></div>
      </div>
    );
  }

  const name = leadName(lead);
  const st = leadStatusDisplay(lead.status);
  const next = leadNextAction(lead, now);
  const src = leadSourceInfo(lead.source);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const setStatus = async (status: string) => {
    if (busy || status === (lead.status ?? 'new')) return;
    setBusy(true);
    const ok = await updateLeadStage(lead.id, status);
    if (ok) await logAudit('lead', lead.id, 'status_change', { from: lead.status, to: status });
    await load();
    setBusy(false);
    toast(ok ? `Κατάσταση: ${leadStatusDisplay(status).label}` : 'Η αλλαγή δεν αποθηκεύτηκε. Δοκιμάστε ξανά.', ok ? 'ok' : 'bad');
  };

  const convert = async () => {
    if (busy) return;
    setBusy(true);
    const caseId = await convertLeadToCase(lead.id);
    setBusy(false);
    if (caseId) { toast('Δημιουργήθηκε Case', 'ok'); openCase(caseId); }
    else toast('Η μετατροπή απέτυχε. Δοκιμάστε ξανά.', 'bad');
  };

  const runPrimary = () => {
    const a = next.primary?.action;
    if (a === 'mark-contacted') void setStatus('contacted');
    else if (a === 'mark-qualified') void setStatus('qualified');
    else if (a === 'convert') void convert();
    else if (a === 'open-case' && lead.converted_case_id) openCase(lead.converted_case_id);
  };

  const tel = lead.phone ? `tel:${lead.phone.replace(/\s+/g, '')}` : null;
  const history: { at: string; text: string }[] = [
    ...(activity ?? []).map(a => ({
      at: a.created_at,
      text: leadActionText(a, s => leadStatusDisplay(s).label),
    })),
    ...(lead.converted_at ? [{ at: lead.converted_at, text: 'Μετατράπηκε σε Case' }] : []),
    { at: lead.created_at, text: `Νέο lead · ${src.label}` },
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

  const converted = lead.status === 'converted';
  const tabs = folderTabs({ backOffice: can(role, 'create_application'), supply: true });
  const counts: Partial<Record<FolderTab, number>> = { docs: files.length, history: history.length, ...(supplyPoints ? { supply: supplyPoints.filter(p => !p.archived_at).length } : {}) };
  const needsCase = tabs.find(t => t.id === tab)?.needsCase ?? false;

  return (
    <div className="atx-page" style={{ maxWidth: 1040 }}>
      <button className="atx-link inline-flex items-center gap-1" onClick={() => go('leads')}><ArrowLeft size={15} /> Επιστροφή στα leads</button>

      <div className="atx-head mt-3 flex items-center gap-4 flex-wrap">
        <span className="w-14 h-14 rounded-full grid place-items-center text-[18px] font-bold" style={{ background: 'var(--atx-blue-soft)', color: 'var(--atx-blue)' }} aria-hidden="true">{initials || '?'}</span>
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="atx-title" style={{ fontSize: 28 }}>{name}</h1>
            <span className="atx-tag t-warning" data-folder-badge="lead">{folderBadge({ isLead: true, cases: [] }).label}</span>
            <span className={`atx-tag t-${st.tone}`} title={st.raw ? `Τιμή βάσης: ${st.raw}` : undefined}>{st.label}{st.detail ? ` · ${st.detail}` : ''}</span>
          </div>
          <p className="atx-sub flex items-center gap-x-3 gap-y-1 flex-wrap" style={{ marginTop: 4 }}>
            {tel && <a className="atx-link !p-0 inline-flex items-center gap-1" href={tel}><Phone size={13} aria-hidden="true" />{lead.phone}</a>}
            {lead.email && <a className="atx-link !p-0 inline-flex items-center gap-1 truncate" href={`mailto:${lead.email}`}><Mail size={13} aria-hidden="true" />{lead.email}</a>}
            <span data-folder-subtitle>
              {serviceLabel(lead.service_category)}
              {lead.assigned_to?.full_name ? ` · Υπεύθυνος: ${lead.assigned_to.full_name}` : ' · Χωρίς υπεύθυνο'}
            </span>
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
        {isStaff && !converted && !lead.deleted_at && (
          <>
            <button className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" onClick={() => onEdit(lead)}><Pencil size={14} /> Επεξεργασία</button>
            <label className="sr-only" htmlFor="lead-status">Κατάσταση</label>
            <select id="lead-status" className="atx-chip" value={lead.status ?? 'new'} disabled={busy} onChange={e => void setStatus(e.target.value)}>
              {!st.known && lead.status && <option value={lead.status}>{lead.status}</option>}
              {LEAD_STATUSES.filter(s => s.id !== 'converted').map(s => <option key={s.id} value={s.id}>{leadStatusDisplay(s.id).label}{leadStatusDisplay(s.id).detail ? ` · ${leadStatusDisplay(s.id).detail}` : ''}</option>)}
            </select>
          </>
        )}
        {/* the destructive action is last, small and quiet: it does not compete with the main actions */}
        {!lead.deleted_at && <TrashButton compact type="lead" id={lead.id} name={name} onTrashed={() => { go('leads'); }} />}
        </div>
      </div>

      {lead.deleted_at && <InTrashBanner type="lead" id={lead.id} deletedAt={lead.deleted_at} onRestored={() => void load()} />}

      {converted && lead.converted_case_id && (
        <div className="atx-notice mt-4 flex items-center gap-3 flex-wrap" data-lead-converted>
          <span className="flex-1 min-w-[200px]">Το lead έχει μετατραπεί σε Case. Ο φάκελος του πελάτη δεν είναι διαθέσιμος εδώ· συνεχίστε από το Case.</span>
          <button className="atx-btn atx-btn-quiet" onClick={() => openCase(lead.converted_case_id!)}>Άνοιγμα Case</button>
        </div>
      )}

      <div className="atx-pagetabs mt-4" role="tablist" aria-label="Ενότητες φακέλου">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="atx-pagetab" onClick={() => setTab(t.id)}>
            {t.label}{counts[t.id] !== undefined && <span className="opacity-60">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      {needsCase && (
        <div className="atx-panel mt-4" data-needs-case><div className="atx-empty"><strong>{FOLDER_TABS.find(t => t.id === tab)?.label}</strong>{NEEDS_CASE_TEXT}</div></div>
      )}

      {tab === 'supply' && <SupplyPointsTab owner={{ leadId: lead.id }} points={supplyPoints} tariffs={tariffs} canEdit={!lead.deleted_at} reload={() => void load()} />}

      {tab === 'docs' && (
        files.length > 0 ? (
          <div className="atx-panel mt-4" style={{ padding: 20 }} aria-label="Αρχεία από τη φόρμα">
            <h2 className="atx-section-title mb-1">Αρχεία από τη φόρμα ({files.length})</h2>
            <p className="text-[13px] text-[var(--atx-muted)] mb-3">
              {lead.converted_case_id ? 'Καταχωρήστε τα ως δικαιολογητικά στο Case → Έγγραφα.' : 'Μετά τη μετατροπή σε Case θα εμφανίζονται στα Έγγραφα του φακέλου, όπου καταχωρούνται ως δικαιολογητικά.'}
            </p>
            <ul className="m-0 p-0 list-none space-y-2">
              {files.map(f => (
                <li key={f.path} className="flex items-center gap-3 text-[14px]">
                  <span className="atx-icon" style={{ width: 30, height: 30 }} aria-hidden="true"><FileText size={14} /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{f.name}</span>
                    <span className="block text-[12.5px] text-[var(--atx-muted)]">{fileSizeText(f.size) || '—'}{f.supply_point_id && supplyLabelFor(supplyPoints, f.supply_point_id) ? ` · ${supplyLabelFor(supplyPoints, f.supply_point_id)}` : ''}</span>
                  </span>
                  {supplyPoints && supplyPoints.some(p => !p.archived_at) && !lead.converted_case_id && (
                    <select className="field !py-1 text-[12.5px] w-48" value={f.supply_point_id ?? ''} aria-label={`Παροχή για το αρχείο ${f.name}`} data-lead-file-tag={f.path}
                      onChange={e => { void tagLeadFile(lead.id, f.path, e.target.value || null).then(err => { if (err) toast(err, 'bad'); else { toast('Η παροχή του αρχείου αποθηκεύτηκε.', 'ok'); void load(); } }); }}>
                      <option value="">Χωρίς παροχή</option>
                      {supplyPoints.filter(p => !p.archived_at).map(p => <option key={p.id} value={p.id}>{supplyLabelFor(supplyPoints, p.id)}</option>)}
                    </select>
                  )}
                  {fileUrls[f.path]
                    ? <a className="atx-btn atx-btn-quiet" href={fileUrls[f.path]} target="_blank" rel="noreferrer">Άνοιγμα</a>
                    : <span className="text-[12.5px] text-[var(--atx-faint)]">Μη διαθέσιμο</span>}
                </li>
              ))}
            </ul>
          </div>
        ) : <div className="atx-panel mt-4"><div className="atx-empty"><strong>Δεν υπάρχουν αρχεία</strong>Τα έγγραφα και τα αρχεία της φόρμας εμφανίζονται εδώ. Ο έλεγχος δικαιολογητικών ανοίγει μετά τη μετατροπή σε Case.</div></div>
      )}

      {tab === 'history' && (
        <div className="atx-panel mt-4" style={{ padding: 20 }}>
          <h2 className="atx-section-title mb-3">Ιστορικό</h2>
          {activity === null && <p className="text-[13px] text-[var(--atx-muted)] mb-2">Το πλήρες ιστορικό ενεργειών δεν είναι διαθέσιμο αυτή τη στιγμή.</p>}
          <ol className="m-0 p-0 list-none space-y-3">
            {history.map((h, i) => (
              <li key={i} className="flex gap-3">
                <span className="atx-icon" style={{ width: 30, height: 30 }} aria-hidden="true"><Clock size={14} /></span>
                <span><span className="block text-[14px] font-medium">{h.text}</span><span className="block text-[12.5px] text-[var(--atx-muted)]">{fmtDateTime(h.at)}</span></span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === 'overview' && (
        <div className="grid gap-4 mt-4 lg:grid-cols-[1fr_360px]">
          <div className="space-y-4 min-w-0">
            <div className="atx-panel" style={{ padding: 20 }}>
              <h2 className="atx-section-title mb-3">Στοιχεία</h2>
              <dl className="grid sm:grid-cols-[160px_1fr] gap-x-4 gap-y-2.5 text-[14px]">
                {[
                  ['Ονοματεπώνυμο', name],
                  ['Τηλέφωνο', lead.phone],
                  ['Email', lead.email],
                  ['Διεύθυνση', lead.address],
                  ['Ενδιαφέρον', serviceLabel(lead.service_category, '')],
                  ['Ακίνητο', propertyLabel(lead.property_type)],
                  ['Εταιρεία', lead.company],
                  ['Συνεργάτης', lead.partner],
                  ['Πάροχος', [lead.provider, lead.program].filter(Boolean).join(' · ') || null],
                  ['Πηγή', `${src.label}${lead.campaign_name ? ` · ${lead.campaign_name}` : ''}`],
                  ['Καταχώρηση', fmtDateTime(lead.created_at)],
                ].map(([k, v]) => (
                  <div key={k as string} className="contents">
                    <dt className="text-[var(--atx-muted)]">{k}</dt>
                    <dd className="m-0 font-medium">{v || <span className="text-[var(--atx-faint)] font-normal">—</span>}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="space-y-4">
            {!converted && (
              <div className="atx-panel" style={{ padding: 20, background: next.tone === 'attention' ? 'linear-gradient(180deg, rgba(22,119,255,.06), #fff)' : undefined }}>
                <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: 'var(--atx-blue)' }}><Sparkles size={14} aria-hidden="true" /> Προτεινόμενη ενέργεια</div>
                <h2 className="text-[18px] font-semibold mt-1.5">{next.title}</h2>
                <p className="text-[14px] text-[var(--atx-muted)] mt-1">{next.reason}</p>
                {(next.primary || (next.secondary && tel)) && (
                  <div className="flex gap-2 flex-wrap mt-4">
                    {next.primary && isStaff && <button className="atx-btn atx-btn-primary" disabled={busy} onClick={runPrimary}>{busy ? '…' : next.primary.label}</button>}
                    {next.primary?.action === 'open-case' && !isStaff && <button className="atx-btn atx-btn-primary" onClick={runPrimary}>{next.primary.label}</button>}
                    {next.secondary?.action === 'call' && tel && <a className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" href={tel}><Phone size={14} /> Κλήση</a>}
                  </div>
                )}
                <p className="text-[12px] text-[var(--atx-faint)] mt-3">Πρόταση με βάση την κατάσταση του lead. Τίποτα δεν γίνεται αυτόματα.</p>
              </div>
            )}

            <div className="atx-panel" style={{ padding: 20 }}>
              <h2 className="atx-section-title mb-3">Επικοινωνία</h2>
              <ul className="m-0 p-0 list-none space-y-2.5 text-[14px]">
                <li className="flex items-center gap-2.5"><Phone size={15} className="text-[var(--atx-muted)]" />{tel ? <a className="atx-link !p-0" href={tel}>{lead.phone}</a> : '—'}</li>
                <li className="flex items-center gap-2.5"><Mail size={15} className="text-[var(--atx-muted)]" />{lead.email ? <a className="atx-link !p-0 truncate" href={`mailto:${lead.email}`}>{lead.email}</a> : '—'}</li>
                <li className="flex items-center gap-2.5"><MapPin size={15} className="text-[var(--atx-muted)]" />{lead.address || '—'}</li>
              </ul>
            </div>

            {!lead.deleted_at && <ContactEligibility subject={{ phone: lead.phone, email: lead.email, leadId: lead.id }} />}
          </div>
        </div>
      )}
    </div>
  );
}
