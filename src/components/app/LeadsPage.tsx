import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import LeadDetail from '@/components/leads/LeadDetail';
import { TrashButton } from '@/components/trash/TrashControls';
import { LEAD_SOURCES, LEAD_STATUSES, SERVICES, can, leadSourceInfo, leadStatusInfo, propertyLabel, serviceLabel } from '@/lib/roles';
import { leadStatusDisplay } from '@/lib/lead-status';
import { Lead, convertLeadToCase, createLead, createLeadSupplyPoint, fetchLeads, fetchTariffCategories, getPosition, leadSupplyAvailable, updateLeadChecked, updateLeadStage } from '@/lib/api';
import LeadSupplySection from '@/components/leads/LeadSupplySection';
import { leadSupplyBlocking, supplyPointTitle } from '@/lib/supply-points';
import type { SupplyPointDraft, TariffCategory } from '@/lib/supply-points';
import { useToast } from '@/lib/toast';
import { attachLeadFiles, routeLeadToBackoffice } from '@/lib/lead-intake';
import { classifyUpload, MAX_FORM_FILES, PUBLIC_FORM_ACCEPT } from '@/lib/upload-files';
import { Btn, Card, CardHeader, EmptyState, Field, Micro, Modal, Pill, Spinner } from '@/lib/ui';
import ProviderProgramPicker, { ProviderDot } from './ProviderProgramPicker';
import { ArrowRight, Crosshair, ExternalLink, Pencil, Plus, Users } from 'lucide-react';

const EMPTY_FORM = {
  full_name: '', phone: '', email: '', address: '', service_category: 'energy', source: 'inside_sales',
  property_type: '', campaign_name: '', comments: '', lead_type: 'B2C', provider: '', program: '', partner: '',
};

export default function LeadsPage() {
  const { role } = useAuth();
  const { openCase, view, go } = useNav();
  const detailId = view.filters?.lead ?? null;
  const [detailVersion, setDetailVersion] = useState(0);
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<string>('new');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '', phone: '', email: '', address: '', lat: '', lng: '', comments: '',
  });
  const [locating, setLocating] = useState(false);
  // Errors are shown INSIDE the dialog that caused them (the page-level message was hidden behind the open modal).
  const [createErr, setCreateErr] = useState('');
  const [creating, setCreating] = useState(false);
  // «Γρήγορο lead» (name only) or «Lead με έγγραφα» (details + files → default Back Office assignee).
  const [mode, setMode] = useState<'quick' | 'docs'>('quick');
  const [files, setFiles] = useState<File[]>([]);
  // for each file: the number (in the connections list below) of the connection it belongs to, or null
  const [fileTags, setFileTags] = useState<(number | null)[]>([]);
  // «Παροχές ρεύματος» (staged phase5/17 + 18): optional; collapsed in «Γρήγορο lead», open in «Lead με έγγραφα»
  const [supplyDrafts, setSupplyDrafts] = useState<SupplyPointDraft[]>([]);
  const [supplyOpen, setSupplyOpen] = useState(false);
  const [supplyAvail, setSupplyAvail] = useState<boolean | null>(null);
  const [tariffs, setTariffs] = useState<TariffCategory[] | null>(null);
  useEffect(() => {
    if (!modal) return;
    let alive = true;
    void leadSupplyAvailable().then(ok => { if (alive) setSupplyAvail(ok); });
    void fetchTariffCategories().then(t => { if (alive) setTariffs(t); });
    return () => { alive = false; };
  }, [modal]);
  const switchMode = (m: 'quick' | 'docs') => { setMode(m); setSupplyOpen(m === 'docs'); };
  const closeCreate = () => { setModal(false); setCreateErr(''); setSupplyDrafts([]); setSupplyOpen(false); setMode('quick'); setFiles([]); setFileTags([]); };
  // removing connection i: files tagged to it become untagged, later tags shift down
  const removeSupply = (i: number) => { setSupplyDrafts(supplyDrafts.filter((_, j) => j !== i)); setFileTags(fileTags.map(t => (t == null || t === i ? null : t > i ? t - 1 : t))); };
  const [editErr, setEditErr] = useState('');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const openEdit = (l: Lead) => {
    setEditErr('');
    setEditing(l);
    setEditForm({
      full_name: l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || '',
      phone: l.phone || '',
      email: l.email || '',
      address: l.address || '',
      lat: l.lat ?? '',
      lng: l.lng ?? '',
      comments: l.comments || '',
    });
  };

  const fillMyLocation = async () => {
    setLocating(true);
    const coords = await getPosition();
    setLocating(false);
    if (coords) setEditForm(f => ({ ...f, lat: String(coords.lat), lng: String(coords.lng) }));
  };

  const saveEdit = async () => {
    if (!editing || saving) return;
    setSaving(true); setEditErr('');
    const e = await updateLeadChecked(editing.id, {
      full_name: editForm.full_name || null,
      phone: editForm.phone || null,
      email: editForm.email || null,
      address: editForm.address || null,
      lat: editForm.lat === '' ? null : Number(editForm.lat),
      lng: editForm.lng === '' ? null : Number(editForm.lng),
      comments: editForm.comments || null,
    });
    setSaving(false);
    if (e) { setEditErr(e); return; }
    setEditing(null); await load(); setDetailVersion(v => v + 1);
    toast('Το lead ενημερώθηκε.', 'ok');
  };

  const load = useCallback(async () => {
    const list = await fetchLeads();
    setItems(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = new Map<string, number>();
  for (const l of items) counts.set(l.status ?? 'new', (counts.get(l.status ?? 'new') ?? 0) + 1);

  const visible = tab === 'all' ? items : items.filter(l => (l.status ?? 'new') === tab);

  const onConvert = async (l: Lead) => {
    setBusyId(l.id);
    setErr('');
    const caseId = await convertLeadToCase(l.id);
    setBusyId(null);
    if (caseId) {
      await load();
      openCase(caseId);
    } else {
      setErr('Η μετατροπή απέτυχε. Δοκιμάστε ξανά.');
    }
  };

  const onStage = async (l: Lead, status: string) => {
    if (status === (l.status ?? 'new')) return;
    const ok = await updateLeadStage(l.id, status);
    if (!ok) setErr('Δεν ήταν δυνατή η ενημέρωση της κατάστασης.');
    else await load();
  };

  const submitLead = async () => {
    if (creating) return; // no double submit
    setCreating(true); setCreateErr('');
    const { lead, error } = await createLead({
      full_name: form.full_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      service_category: form.service_category,
      source: form.source,
      address: form.address.trim() || null,
      property_type: form.property_type.trim() || null,
      campaign_name: form.campaign_name.trim() || null,
      comments: form.comments.trim() || null,
      lead_type: form.lead_type,
      provider: form.provider || null,
      program: form.program || null,
      partner: form.partner.trim() || null,
    });
    if (error || !lead) { setCreating(false); setCreateErr(error ?? 'Η δημιουργία απέτυχε. Δοκιμάστε ξανά.'); return; }
    // The lead exists now. Its connections come first (their ids are what documents are tagged with), then the files under
    // leads/<id>/ and the routing. A failed connection or file never removes the lead and is reported by name.
    let extra = '';
    let tone: 'ok' | 'warn' = 'ok';
    const supplyIds: (string | null)[] = [];
    if (supplyAvail && supplyDrafts.length) {
      const failedSupply: string[] = [];
      for (const [i, d] of supplyDrafts.entries()) {
        const r = await createLeadSupplyPoint(lead.id, d);
        supplyIds.push(r.point?.id ?? null);
        if (r.error) failedSupply.push(`παροχή ${i + 1} (${r.error})`);
      }
      if (failedSupply.length) { tone = 'warn'; extra += ` Δεν αποθηκεύτηκε: ${failedSupply.join(', ')} — προσθέστε την από το lead.`; }
    }
    if (mode === 'docs' && files.length) {
      const up = await attachLeadFiles(lead, files, fileTags.map(t => (t == null ? null : supplyIds[t] ?? null)));
      if (up.failed.length) { tone = 'warn'; extra += ` Δεν ανέβηκαν: ${up.failed.join(', ')} — ανεβάστε τα ξανά από το case.`; }
      if (up.saved.length) {
        const r = await routeLeadToBackoffice(lead.id);
        if (r.error) { tone = 'warn'; extra += ` ${r.error}`; }
        else if (r.assignee) extra += ` Στάλθηκε στο Back Office: ${r.assignee.full_name}.`;
        else { tone = 'warn'; extra += ' Δεν έχει οριστεί υπεύθυνος Back Office — ορίστε τον στη Διαχείριση → Cases & Ροή.'; }
      }
    }
    setCreating(false);
    setFiles([]); setFileTags([]);
    setModal(false);
    setSupplyDrafts([]); setSupplyOpen(false); setMode('quick');
    setForm(EMPTY_FORM);
    setErr('');
    await load();
    setTab(lead.status ?? 'new');
    toast(`Δημιουργήθηκε το lead «${lead.full_name ?? form.full_name.trim()}».${extra}`, tone);
  };

  const tabs = [{ id: 'all', label: 'Όλα', emoji: '🗂️', short: 'Όλα' }, ...LEAD_STATUSES];

  return (
    <div className="max-w-6xl space-y-4">
      {detailId ? <LeadDetail leadId={detailId} version={detailVersion} onEdit={openEdit} /> : (<>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">CRM</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Leads</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Pill tone="gray">{items.length} εγγραφές</Pill>
          {can(role, 'create_case') && (
            <Btn onClick={() => setModal(true)}><Plus className="w-3.5 h-3.5" /> Νέο Lead</Btn>
          )}
        </div>
      </div>

      {err && <div className="rounded-xl bg-bad-100 text-bad-600 text-[13px] px-4 py-2.5">{err}</div>}

      {/* Pipeline tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map(t => {
          const count = t.id === 'all' ? items.length : (counts.get(t.id) ?? 0);
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${tab === t.id ? 'bg-ink text-paper' : 'bg-white border border-line text-ink/55 hover:text-ink'}`}>
              <span aria-hidden="true">{t.emoji}</span> {t.id === 'all' ? t.label : leadStatusDisplay(t.id).label}{t.id !== 'all' && leadStatusDisplay(t.id).detail ? ` · ${leadStatusDisplay(t.id).detail}` : ''}
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${tab === t.id ? 'bg-paper/15' : 'bg-ink/5 text-ink/50'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <Card className="!p-0" pad={false}>
        <CardHeader micro="Πορεία leads" title={`${tab === 'all' ? 'Όλα τα leads' : leadStatusInfo(tab).label}`}
          className="px-5 pt-5" action={<Pill tone="gray">{visible.length}</Pill>} />
        {loading && <div className="flex items-center justify-center py-16"><Spinner /></div>}
        {!loading && visible.length === 0 && (
          <EmptyState icon={Users} title="Καμία εγγραφή σε αυτό το στάδιο"
            hint="Τα leads φθάνουν από την ιστοσελίδα hlektrismos.gr ή δημιουργούνται χειροκίνητα." />
        )}
        {!loading && visible.length > 0 && (
          <div className="divide-y divide-line">
            {visible.map(l => {
              const info = leadStatusInfo(l.status);
              const src = leadSourceInfo(l.source);
              const name = l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || l.client_name || '—';
              const converted = l.status === 'converted';
              const isStaff = can(role, 'create_case');
              return (
                <div key={l.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                  <span className="w-8 h-8 rounded-lg bg-ink/5 flex items-center justify-center shrink-0 text-sm" title={src.label}>
                    {src.emoji}
                  </span>
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button type="button" onClick={() => go('leads', { lead: l.id })} className="text-[13px] font-medium text-ink hover:text-brand-600 hover:underline text-left">{name}</button>
                      <Pill tone={info.id === 'new' ? 'blue' : info.id === 'converted' ? 'green' : info.id === 'lost' || info.id === 'unqualified' ? 'red' : info.id === 'duplicate' ? 'amber' : 'gray'}>
                        {info.emoji} {info.label}
                      </Pill>
                    </div>
                    <div className="text-xs text-ink/45 mt-0.5">
                      {l.phone || 'χωρίς τηλέφωνο'}
                      {(l.email ? ` · ${l.email}` : '')}
                      {l.property_type ? ` · ${propertyLabel(l.property_type)}` : ''}
                    </div>
                    {(l.campaign_name || l.provider || l.company || l.assigned_to?.full_name || l.created_by?.full_name) && (
                      <div className="text-[11px] text-ink/35 mt-0.5 flex items-center gap-2 flex-wrap">
                        {l.company && <span>🏢 {l.company}</span>}
                        {l.provider && (
                          <span className="inline-flex items-center gap-1">
                            <ProviderDot provider={l.provider} /> {l.provider}{l.program ? ` · ${l.program}` : ''}
                          </span>
                        )}
                        {l.campaign_name && <span>📢 {l.campaign_name}</span>}
                        {l.assigned_to?.full_name && <span>👤 {l.assigned_to.full_name}</span>}
                        {!l.assigned_to?.full_name && l.created_by?.full_name && <span>✍️ {l.created_by.full_name}</span>}
                      </div>
                    )}
                  </div>
                  {/* On a phone the actions drop to their own line (min 44px targets) instead of squeezing the name */}
                  <div className="flex items-center gap-2 flex-wrap max-sm:w-full max-sm:pt-1 max-sm:[&_button]:min-h-[40px] max-sm:[&_select]:min-h-[40px]" data-lead-actions>
                    <Pill tone="gray">{serviceLabel(l.service_category)}</Pill>
                    <span className="text-xs text-ink/40">
                      {l.converted_at
                        ? `Μετατροπή ${new Date(l.converted_at).toLocaleDateString('el-GR', { day: '2-digit', month: 'short' })}`
                        : l.created_at ? new Date(l.created_at).toLocaleDateString('el-GR', { day: '2-digit', month: 'short' }) : ''}
                    </span>
                    {isStaff && !converted && (
                      <>
                        <button onClick={() => openEdit(l)} title="Επεξεργασία Lead"
                          className="p-1.5 rounded-lg border border-line bg-white text-ink/60 hover:text-ink transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <select className="field !w-auto !py-1.5 text-xs" value={l.status ?? 'new'}
                          onChange={e => onStage(l, e.target.value)}>
                          {LEAD_STATUSES.filter(s => s.id !== 'converted').map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                        <Btn variant="outline" onClick={() => onConvert(l)} disabled={busyId === l.id}>
                          {busyId === l.id ? <Spinner /> : <ArrowRight className="w-3.5 h-3.5" />} Μετατροπή
                        </Btn>
                      </>
                    )}
                    {converted && l.converted_case_id && (
                      <span data-lead-to-folder>
                        <Btn variant="outline" onClick={() => go('leads', { lead: l.id })} title="Ανοίγει τον φάκελο του πελάτη">
                          <ExternalLink className="w-3.5 h-3.5" /> Μετατράπηκε → Φάκελος
                        </Btn>
                      </span>
                    )}
                    <TrashButton compact type="lead" id={l.id} name={name}
                      onTrashed={async () => { const list = await fetchLeads(); setItems(list); return !list.some(x => x.id === l.id); }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      </>)}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Επεξεργασία Lead" micro="Στοιχεία επικοινωνίας">
        <div className="space-y-4">
          <Field label="Ονοματεπώνυμο">
            <input className="field" value={editForm.full_name ?? ''} onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Τηλέφωνο">
              <input type="tel" className="field" value={editForm.phone ?? ''} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} placeholder="69…" />
            </Field>
            <Field label="Email">
              <input type="email" className="field" value={editForm.email ?? ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.gr" />
            </Field>
          </div>
          <Field label="Διεύθυνση κατοικίας">
            <input className="field" value={editForm.address ?? ''} onChange={e => setEditForm(f => ({ ...f, address: e.target.value }))} placeholder="Οδός, αριθμός…" />
          </Field>
          <p className="text-[12px] text-ink/55 -mt-2">Οι διευθύνσεις παροχών είναι στην καρτέλα Παροχές.</p>
          <Field label="Τοποθεσία (γεωγραφικές συντεταγμένες)">
            <div className="grid sm:grid-cols-2 gap-3">
              <input type="number" step="any" className="field" value={editForm.lat ?? ''} onChange={e => setEditForm(f => ({ ...f, lat: e.target.value }))} placeholder="lat" />
              <input type="number" step="any" className="field" value={editForm.lng ?? ''} onChange={e => setEditForm(f => ({ ...f, lng: e.target.value }))} placeholder="lng" />
            </div>
            <button type="button" onClick={fillMyLocation} disabled={locating}
              className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-600 hover:underline">
              <Crosshair className="w-3.5 h-3.5" /> {locating ? 'Εντοπισμός…' : 'Χρήση τρέχουσας τοποθεσίας'}
            </button>
          </Field>
          <Field label="Σχόλια">
            <textarea className="field" rows={2} value={editForm.comments ?? ''} onChange={e => setEditForm(f => ({ ...f, comments: e.target.value }))} />
          </Field>
        </div>
        {editErr && <div className="atx-notice mt-4" role="alert" data-lead-error>{editErr}</div>}
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => setEditing(null)}>Ακύρωση</Btn>
          <Btn onClick={saveEdit} disabled={saving || !editForm.full_name?.trim()}>{saving ? <Spinner /> : null} Αποθήκευση</Btn>
        </div>
      </Modal>

      <Modal open={modal} onClose={() => { if (!creating) closeCreate(); }} title="Νέο Lead" micro="Χειροκίνητη εισαγωγή">
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Τύπος καταχώρησης" className="flex gap-2 flex-wrap -mt-1">
            {([['quick', 'Γρήγορο lead'], ['docs', 'Lead με έγγραφα']] as const).map(([m, l]) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className={`atx-chip ${mode === m ? 'is-on' : ''}`} onClick={() => switchMode(m)}>{l}</button>
            ))}
          </div>
          <p className="text-[12.5px] text-ink/55">{mode === 'quick'
            ? 'Αρκεί το όνομα. Τηλέφωνο, email και πρόγραμμα συμπληρώνονται και αργότερα.'
            : 'Με έγγραφα (λογαριασμό, ταυτότητα κ.λπ.) το lead πηγαίνει στον υπεύθυνο Back Office που έχει οριστεί στη Διαχείριση.'}</p>
          <Field label="Ονοματεπώνυμο ή επωνυμία (υποχρεωτικό)">
            <input className="field" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Όνομα πελάτη" />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Τηλέφωνο">
              <input className="field" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="69…" />
            </Field>
            <Field label="Email">
              <input type="email" className="field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.gr" />
            </Field>
          </div>
          <Field label="Διεύθυνση κατοικίας (προαιρετικό)">
            <input className="field" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Η διεύθυνση του πελάτη — όχι της παροχής" data-lead-address />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Υπηρεσία">
              <select className="field" value={form.service_category} onChange={e => setForm(f => ({ ...f, service_category: e.target.value }))}>
                {Object.entries(SERVICES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Πηγή">
              <select className="field" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
                {Object.entries(LEAD_SOURCES).filter(([k]) => k !== 'website').map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
              </select>
            </Field>
          </div>
          <Field label={form.source === 'partner' ? 'Συνεργάτης' : 'Συνεργάτης (αν υπάρχει)'}>
            <input className="field" value={form.partner} onChange={e => setForm(f => ({ ...f, partner: e.target.value }))} placeholder="Όνομα συνεργάτη που έφερε τον πελάτη" />
          </Field>
          <LeadSupplySection drafts={supplyDrafts} setDrafts={setSupplyDrafts} onRemove={removeSupply} tariffs={tariffs} available={supplyAvail} open={supplyOpen} setOpen={setSupplyOpen} disabled={creating} />
          {mode === 'docs' && (<>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Τύπος πελάτη">
              <select className="field" value={form.lead_type}
                onChange={e => setForm(f => ({ ...f, lead_type: e.target.value, provider: '', program: '' }))}>
                <option value="B2C">B2C — Οικιακός</option>
                <option value="B2B">B2B — Επιχείρηση</option>
              </select>
            </Field>
            <Field label="Τύπος ιδιοκτησίας">
              <input className="field" value={form.property_type} onChange={e => setForm(f => ({ ...f, property_type: e.target.value }))} placeholder="π.χ. μονοκατοικία" />
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Καμπάνια">
              <input className="field" value={form.campaign_name} onChange={e => setForm(f => ({ ...f, campaign_name: e.target.value }))} placeholder="π.χ. Facebook Ads" />
            </Field>
          </div>
          <ProviderProgramPicker
            provider={form.provider}
            program={form.program}
            service={form.service_category}
            customerType={form.lead_type === 'B2B' ? 'B2B' : 'B2C'}
            onChange={next => setForm(f => ({ ...f, provider: next.provider, program: next.program }))}
            labels={{ provider: 'Πάροχος ενδιαφέροντος (προαιρετικό)', program: 'Πρόγραμμα (προαιρετικό — επιλέγεται στην προσφορά)' }}
          />
          <Field label="Σχόλια">
            <textarea className="field" rows={2} value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} placeholder="Λεπτομέρειες ενδιαφέροντος…" />
          </Field>
          <Field label={`Έγγραφα (έως ${MAX_FORM_FILES})`}>
            <input type="file" multiple accept={PUBLIC_FORM_ACCEPT} className="field" aria-label="Έγγραφα lead" data-lead-files
              onChange={e => {
                const picked = Array.from(e.target.files ?? []);
                const bad = picked.filter(f => !classifyUpload(f).ok).map(f => f.name);
                const ok = picked.filter(f => classifyUpload(f).ok);
                setFiles([...files, ...ok].slice(0, MAX_FORM_FILES));
                setFileTags([...fileTags, ...ok.map(() => null)].slice(0, MAX_FORM_FILES));
                setCreateErr(bad.length ? `Μη υποστηριζόμενα αρχεία: ${bad.join(', ')} (PDF ή φωτογραφία).` : '');
                e.target.value = '';
              }} />
            {files.length > 0 && (
              <ul className="m-0 mt-2 p-0 list-none space-y-1 text-[13px]">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-2">
                    <span className="flex-1 truncate">{f.name}</span>
                    {supplyAvail && supplyDrafts.length > 0 && (
                      <select className="field !py-1 text-[12.5px] w-48" value={fileTags[i] == null ? '' : String(fileTags[i])} aria-label={`Παροχή για το αρχείο ${f.name}`} data-lead-file-tag
                        onChange={e => setFileTags(fileTags.map((t, j) => (j === i ? (e.target.value === '' ? null : Number(e.target.value)) : t)))}>
                        <option value="">Χωρίς παροχή</option>
                        {supplyDrafts.map((d, n) => <option key={n} value={n}>{supplyPointTitle(n + 1, d.usage)}</option>)}
                      </select>
                    )}
                    <button type="button" className="atx-link !p-0 text-[12.5px]" onClick={() => { setFiles(files.filter((_, j) => j !== i)); setFileTags(fileTags.filter((_, j) => j !== i)); }}>Αφαίρεση</button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
          </>)}
        </div>
        {createErr && <div className="atx-notice mt-4" role="alert" data-lead-error>{createErr}</div>}
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" disabled={creating} onClick={closeCreate}>Ακύρωση</Btn>
          <Btn onClick={submitLead} disabled={creating || !form.full_name.trim() || (!!supplyAvail && leadSupplyBlocking(supplyDrafts))}>{creating ? <Spinner /> : <Plus className="w-3.5 h-3.5" />} Δημιουργία</Btn>
        </div>
      </Modal>
    </div>
  );
}