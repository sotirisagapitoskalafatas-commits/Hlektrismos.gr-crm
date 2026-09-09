import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { CHANNELS, can } from '@/lib/roles';
import { FollowUp, completeFollowUp, createFollowUp, fetchCases, fetchFollowUps, rescheduleFollowUp, snoozeFollowUp } from '@/lib/api';
import { Btn, Card, EmptyState, Field, Micro, Modal, Pill, Spinner, fmtDateTime, isToday } from '@/lib/ui';
import { CalendarClock, Check, Plus } from 'lucide-react';

type Filter = 'today' | 'overdue' | 'upcoming' | 'all';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'overdue', label: 'Εκπρόθεσμα' },
  { id: 'today', label: 'Σήμερα' },
  { id: 'upcoming', label: 'Επερχόμενα' },
  { id: 'all', label: 'Όλα' },
];

export default function FollowUpsPage() {
  const { role } = useAuth();
  const { openCase } = useNav();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('today');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ case_id: '', due_at: '', channel: 'phone', reason: '', priority: 'normal' });
  const [cases, setCases] = useState<{ id: string; case_no: string; label: string }[]>([]);

  const load = useCallback(async () => {
    const list = await fetchFollowUps({ status: 'all' });
    setItems(list.filter(f => f.status === 'pending'));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    fetchCasesForPicker();
  }, [open]);

  const fetchCasesForPicker = async () => {
    const list = await fetchCases();
    setCases(list.map(c => ({
      id: c.id, case_no: c.case_no,
      label: `${c.case_no} — ${c.customer?.full_name ?? c.title}`,
    })));
  };

  const now = Date.now();
  const filtered = items.filter(f => {
    const due = new Date(f.due_at).getTime();
    if (filter === 'overdue') return due < now;
    if (filter === 'today') return isToday(f.due_at);
    if (filter === 'upcoming') return due >= now && !isToday(f.due_at);
    return true;
  }).sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));

  const counts = {
    overdue: items.filter(f => new Date(f.due_at).getTime() < now).length,
    today: items.filter(f => isToday(f.due_at) && new Date(f.due_at).getTime() >= now).length,
    upcoming: items.filter(f => new Date(f.due_at).getTime() >= now && !isToday(f.due_at)).length,
    all: items.length,
  };

  const submit = async () => {
    if (!form.case_id || !form.due_at || !form.reason.trim()) return;
    await createFollowUp({
      case_id: form.case_id,
      due_at: new Date(form.due_at).toISOString(),
      channel: form.channel,
      reason: form.reason.trim(),
      priority: form.priority,
    });
    setOpen(false);
    setForm({ case_id: '', due_at: '', channel: 'phone', reason: '', priority: 'normal' });
    load();
  };

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">CRM</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Follow Ups</h2>
        </div>
        {can(role, 'create_followup') && (
          <Btn onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5" /> Νέο Follow Up</Btn>
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium border transition-colors ${filter === f.id ? 'bg-ink text-paper border-ink' : 'bg-white border-line text-ink/55 hover:text-ink'}`}>
            {f.label}
            {counts[f.id] > 0 && (
              <span className={`pill ${f.id === 'overdue' ? 'bg-bad-600 text-white' : f.id === 'all' ? 'bg-white/20 text-inherit' : 'bg-ink/10'}`}>{counts[f.id]}</span>
            )}
          </button>
        ))}
      </div>

      <Card className="!p-0" pad={false}>
        {loading && <div className="flex items-center justify-center py-16"><Spinner /></div>}
        {!loading && filtered.length === 0 && (
          <EmptyState icon={CalendarClock} title="Δεν υπάρχουν follow ups σε αυτή την κατηγορία" hint="Δημιουργήστε ένα follow up για να κρατήσετε τη ροή εργασιών." />
        )}
        {!loading && filtered.length > 0 && (
          <div className="divide-y divide-line">
            {filtered.map(f => {
              const overdue = new Date(f.due_at).getTime() < now;
              return (
                <div key={f.id} className="px-5 py-3.5 flex items-center gap-4 flex-wrap hover:bg-ink/[0.02]">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${overdue ? 'bg-bad-600' : 'bg-brand-500'}`} />
                  <button className="flex-1 min-w-[180px] text-left" onClick={() => f.case_id && openCase(f.case_id)}>
                    <span className="block text-[13px] font-medium text-ink truncate">
                      {f.case?.customer?.full_name ?? '—'}
                    </span>
                    <span className="block text-xs text-ink/45 truncate">
                      {f.case ? `${f.case.case_no} · ${f.case.title}` : '—'}
                    </span>
                  </button>
                  <div className="min-w-[120px]">
                    <div className="text-[13px] font-medium text-ink">{f.reason}</div>
                    <div className="text-xs text-ink/45">{CHANNELS[f.channel] ?? f.channel}</div>
                  </div>
                  <div className="min-w-[130px] text-right">
                    <div className={`text-[13px] font-medium ${overdue ? 'text-bad-600' : 'text-ink/70'}`}>{fmtDateTime(f.due_at)}</div>
                    <div className="text-xs text-ink/40">{overdue ? 'εκπρόθεσμο' : 'προγραμματισμένο'}</div>
                  </div>
                  {f.priority === 'high' && <Pill tone="red">υψηλή</Pill>}
                  {f.priority === 'critical' && <Pill tone="red">κρίσιμη</Pill>}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {can(role, 'complete_followup') && (
                      <Btn variant="ok" onClick={async () => { await completeFollowUp(f.id, f.case_id ?? undefined); load(); }}>
                        <Check className="w-3.5 h-3.5" />
                      </Btn>
                    )}
                    {can(role, 'create_followup') && (
                      <>
                        <Btn variant="ghost" title="Αναβολή 1 ημέρα" onClick={async () => {
                          const until = new Date(Date.now() + 86400000);
                          await snoozeFollowUp(f.id, until.toISOString());
                          load();
                        }}>+1d</Btn>
                        <Btn variant="ghost" title="Αναπρογραμματισμός για αύριο 09:00" onClick={async () => {
                          const t = new Date(Date.now() + 86400000);
                          t.setHours(9, 0, 0, 0);
                          await rescheduleFollowUp(f.id, t.toISOString());
                          load();
                        }}>αύριο</Btn>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="Νέο Follow Up" micro="Follow up">
        <div className="space-y-4">
          {cases.length === 0 && (
            <div className="text-xs text-ink/45 p-3 rounded-lg bg-paper border border-line">Δεν υπάρχουν ενεργά cases για follow up.</div>
          )}
          <Field label="Case">
            <select className="field" value={form.case_id} onChange={e => setForm(f => ({ ...f, case_id: e.target.value }))}>
              <option value="">— επιλέξτε case —</option>
              {cases.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Πότε">
            <input type="datetime-local" className="field" value={form.due_at}
              onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))} />
          </Field>
          <Field label="Κανάλι">
            <select className="field" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
              {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Λόγος">
            <input className="field" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="π.χ. υπενθύμιση προσφοράς" />
          </Field>
          <Field label="Προτεραιότητα">
            <select className="field" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
              <option value="normal">Κανονικό</option>
              <option value="high">Υψηλή</option>
              <option value="critical">Κρίσιμη</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => setOpen(false)}>Ακύρωση</Btn>
          <Btn onClick={submit} disabled={!form.case_id || !form.due_at || !form.reason.trim()}><Plus className="w-3.5 h-3.5" /> Δημιουργία</Btn>
        </div>
      </Modal>
    </div>
  );
}