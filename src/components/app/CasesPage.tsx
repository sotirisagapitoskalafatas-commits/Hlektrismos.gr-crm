import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { ACTIVE_STAGES, SERVICES, stageLabel } from '@/lib/roles';
import type { Stage } from '@/lib/roles';
import { Case, createCase, fetchCases } from '@/lib/api';
import { Btn, Card, EmptyState, Field, Micro, Modal, Pill, Spinner, StagePill, fmtDate, fmtMoney } from '@/lib/ui';
import { Briefcase, Plus, Search } from 'lucide-react';

const PROPERTY_TYPES = ['Διαμέρισμα', 'Μονοκατοικία', 'Κατάστημα', 'Γραφείο', 'Άλλο'];

function CreateCaseModal({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (id: string) => void;
}) {
  const { role } = useAuth();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '', phone: '', email: '', service_type: 'energy', property_type: 'Διαμέρισμα',
    priority: 'normal', value: '', notes: '', stage: 'new' as Stage,
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => { if (open) setForm({ full_name: '', phone: '', email: '', service_type: 'energy', property_type: 'Διαμέρισμα', priority: 'normal', value: '', notes: '', stage: 'new' }); }, [open]);

  const submit = async () => {
    if (!form.full_name.trim()) return;
    setSaving(true);
    const created = await createCase({
      title: `${form.full_name} — ${SERVICES[form.service_type]}`,
      customer: { full_name: form.full_name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null },
      service_type: form.service_type,
      property_type: form.property_type,
      priority: form.priority,
      value: form.value ? Number(form.value) : 0,
      notes: form.notes,
      stage: form.stage,
      role,
    });
    setSaving(false);
    if (created) { onClose(); onCreated(created.id); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Νέο Case" micro="Create case" wide>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Field label="Ονοματεπώνυμο *">
            <input className="field" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="π.χ. Γιώργος Παπαδόπουλος" />
          </Field>
        </div>
        <Field label="Τηλέφωνο">
          <input className="field" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="69########" />
        </Field>
        <Field label="Email">
          <input className="field" value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" />
        </Field>
        <Field label="Υπηρεσία">
          <select className="field" value={form.service_type} onChange={e => set('service_type', e.target.value)}>
            {Object.entries(SERVICES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Τύπος ακινήτου">
          <select className="field" value={form.property_type} onChange={e => set('property_type', e.target.value)}>
            {PROPERTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Αρχικό στάδιο">
          <select className="field" value={form.stage} onChange={e => set('stage', e.target.value)}>
            <option value="new">Νέο (lead)</option>
            <option value="contacted">Επικοινωνία</option>
            <option value="offer">Προσφορά</option>
          </select>
        </Field>
        <Field label="Προτεραιότητα">
          <select className="field" value={form.priority} onChange={e => set('priority', e.target.value)}>
            <option value="normal">Κανονικό</option>
            <option value="high">Υψηλή</option>
            <option value="critical">Κρίσιμη</option>
            <option value="low">Χαμηλή</option>
          </select>
        </Field>
        <div className="sm:col-span-2 grid sm:grid-cols-2 gap-4">
          <Field label="Εκτιμώμενη αξία (€)">
            <input className="field" type="number" value={form.value} onChange={e => set('value', e.target.value)} placeholder="0" />
          </Field>
          <Field label="Σημειώσεις">
            <input className="field" value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Σημείωση πρώτης επαφής…" />
          </Field>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Btn variant="ghost" onClick={onClose}>Ακύρωση</Btn>
        <Btn onClick={submit} disabled={saving || !form.full_name.trim()}>
          {saving ? <Spinner /> : <Plus className="w-4 h-4" />} Δημιουργία Case
        </Btn>
      </div>
    </Modal>
  );
}

export default function CasesPage() {
  const { openCase } = useNav();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState<'all' | Stage>('all');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await fetchCases({ includeDone: true });
    setCases(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const search = q.trim().toLowerCase();
  const filtered = cases.filter(c => {
    const okStage = stage === 'all' || c.current_stage === stage;
    const okQ = !search ||
      (c.case_no ?? '').toLowerCase().includes(search) ||
      (c.customer?.full_name ?? '').toLowerCase().includes(search) ||
      (c.customer?.phone ?? '').includes(search) ||
      c.title.toLowerCase().includes(search);
    return okStage && okQ;
  });

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">CRM</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Cases</h2>
        </div>
        <Btn onClick={() => setCreating(true)}><Plus className="w-4 h-4" /> Νέο Case</Btn>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/35" />
          <input className="field pl-10" value={q} onChange={e => setQ(e.target.value)} placeholder="Αναζήτηση με όνομα, τηλέφωνο ή # case…" />
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        <button onClick={() => setStage('all')}
          className={`pill px-3 py-1.5 text-[11px] font-mono uppercase rounded-lg border transition-colors ${stage === 'all' ? 'bg-ink text-paper border-ink' : 'bg-white border-line text-ink/50 hover:text-ink'}`}>
          Όλα
        </button>
        {ACTIVE_STAGES.map(s => (
          <button key={s} onClick={() => setStage(stage === s ? 'all' : s)}
            className={`pill px-3 py-1.5 text-[11px] rounded-lg border transition-colors ${stage === s ? 'bg-ink text-paper border-ink' : 'bg-white border-line text-ink/50 hover:text-ink'}`}>
            {stageLabel(s)}
          </button>
        ))}
      </div>

      <Card className="!p-0" pad={false}>
        {loading && <div className="flex items-center justify-center py-16"><Spinner /></div>}
        {!loading && filtered.length === 0 && (
          <EmptyState icon={Briefcase} title="Δεν βρέθηκαν cases" hint="Δοκιμάστε διαφορετικά φίλτρα ή δημιουργήστε ένα νέο case." />
        )}
        {!loading && filtered.length > 0 && (
          <div className="divide-y divide-line">
            {filtered.map(c => (
              <button key={c.id} onClick={() => openCase(c.id)}
                className="w-full text-left px-5 py-3.5 hover:bg-ink/[0.03] transition-colors flex items-center gap-4 flex-wrap">
                <span className="font-mono text-[11px] text-ink/35 w-20 shrink-0">{c.case_no}</span>
                <span className="flex-1 min-w-[160px]">
                  <span className="block text-[13px] font-medium text-ink truncate">{c.customer?.full_name ?? c.title}</span>
                  <span className="block text-xs text-ink/45 truncate">{SERVICES[c.service_type] ?? c.service_type} · {c.title}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0 flex-wrap">
                  <StagePill stage={c.current_stage} />
                  {c.priority === 'high' || c.priority === 'critical' ? <Pill tone="red">{c.priority === 'critical' ? 'κρίσιμο' : 'υψηλή'}</Pill> : null}
                  {c.next_follow_up_at && <span className="text-xs text-ink/45">FU: {fmtDate(c.next_follow_up_at)}</span>}
                  <span className="text-[13px] font-semibold text-ink/80 ml-2">{fmtMoney(c.value)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <CreateCaseModal open={creating} onClose={() => setCreating(false)} onCreated={id => { load(); openCase(id); }} />
    </div>
  );
}