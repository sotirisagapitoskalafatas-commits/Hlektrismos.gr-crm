import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { LEAD_SOURCES, LEAD_STATUSES, SERVICES, can, leadSourceInfo, leadStatusInfo } from '@/lib/roles';
import { Lead, convertLeadToCase, createLead, fetchLeads, updateLeadStage } from '@/lib/api';
import { Btn, Card, CardHeader, EmptyState, Field, Micro, Modal, Pill, Spinner } from '@/lib/ui';
import ProviderProgramPicker, { ProviderDot } from './ProviderProgramPicker';
import { ArrowRight, ExternalLink, Plus, Users } from 'lucide-react';

const EMPTY_FORM = {
  full_name: '', phone: '', email: '', service_category: 'energy', source: 'inside_sales',
  property_type: '', campaign_name: '', comments: '', lead_type: 'B2C', provider: '', program: '',
};

export default function LeadsPage() {
  const { role } = useAuth();
  const { openCase } = useNav();
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState<string>('new');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

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
    const lead = await createLead({
      full_name: form.full_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      service_category: form.service_category,
      source: form.source,
      property_type: form.property_type.trim() || null,
      campaign_name: form.campaign_name.trim() || null,
      comments: form.comments.trim() || null,
      lead_type: form.lead_type,
      provider: form.provider || null,
      program: form.program || null,
    });
    if (!lead) { setErr('Δεν ήταν δυνατή η δημιουργία του lead.'); return; }
    setModal(false);
    setForm(EMPTY_FORM);
    setErr('');
    await load();
    setTab(lead.status ?? 'new');
  };

  const tabs = [{ id: 'all', label: 'Όλα', emoji: '🗂️', short: 'Όλα' }, ...LEAD_STATUSES];

  return (
    <div className="max-w-6xl space-y-4">
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
              <span>{t.emoji}</span> {t.short}
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${tab === t.id ? 'bg-paper/15' : 'bg-ink/5 text-ink/50'}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <Card className="!p-0" pad={false}>
        <CardHeader micro="Lead Pipeline" title={`${tab === 'all' ? 'Όλα τα leads' : leadStatusInfo(tab).label}`}
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
                      <span className="text-[13px] font-medium text-ink">{name}</span>
                      <Pill tone={info.id === 'new' ? 'blue' : info.id === 'converted' ? 'green' : info.id === 'lost' || info.id === 'unqualified' ? 'red' : info.id === 'duplicate' ? 'amber' : 'gray'}>
                        {info.emoji} {info.label}
                      </Pill>
                    </div>
                    <div className="text-xs text-ink/45 mt-0.5">
                      {l.phone || 'χωρίς τηλέφωνο'}
                      {(l.email ? ` · ${l.email}` : '')}
                      {l.property_type ? ` · ${l.property_type}` : ''}
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
                  <Pill tone="gray">{SERVICES[l.service_category ?? ''] ?? l.service_category ?? 'Ενέργεια'}</Pill>
                  <span className="text-xs text-ink/40">
                    {l.converted_at
                      ? `Μετατροπή ${new Date(l.converted_at).toLocaleDateString('el-GR', { day: '2-digit', month: 'short' })}`
                      : l.created_at ? new Date(l.created_at).toLocaleDateString('el-GR', { day: '2-digit', month: 'short' }) : ''}
                  </span>
                  {isStaff && !converted && (
                    <>
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
                    <Btn variant="outline" onClick={() => openCase(l.converted_case_id!)}>
                      <ExternalLink className="w-3.5 h-3.5" /> Άνοιγμα Case
                    </Btn>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Νέο Lead" micro="Χειροκίνητη εισαγωγή">
        <div className="space-y-4">
          <Field label="Ονοματεπώνυμο">
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
            labels={{ provider: 'Πάροχος ενδιαφέροντος', program: 'Πρόγραμμα' }}
          />
          <Field label="Σχόλια">
            <textarea className="field" rows={2} value={form.comments} onChange={e => setForm(f => ({ ...f, comments: e.target.value }))} placeholder="Λεπτομέρειες ενδιαφέροντος…" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => setModal(false)}>Ακύρωση</Btn>
          <Btn onClick={submitLead} disabled={!form.full_name.trim()}><Plus className="w-3.5 h-3.5" /> Δημιουργία</Btn>
        </div>
      </Modal>
    </div>
  );
}