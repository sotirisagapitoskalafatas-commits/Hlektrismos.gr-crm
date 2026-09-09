import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import CaptureModal from './CaptureModal';
import SignaturePad from './SignaturePad';
import {
  ACTIVITY_META, CHANNELS, DOC_CATEGORIES, DOC_STATUSES, SERVICES, STAGES,
  STAGE_TRANSITIONS, TEAM_FILTERS, activityLabel, can, stageLabel,
} from '@/lib/roles';
import type { ActivityType, Stage } from '@/lib/roles';
import {
  Case, CaseDocument, CaseOffer, CaseSignature, CaseVisit, FollowUp, TimelineEvent,
  addActivity, addDocument, captureSignature, changeStage, checkInVisit, checkOutVisit,
  completeFollowUp, createFollowUp, createOffer, createVisit, fetchCase, fetchDocuments,
  fetchFollowUps, fetchOffers, fetchSignatures, fetchTimeline, fetchVisits, getPosition,
  markOfferSent, setDocumentStatus, setSignatureStatus, snoozeFollowUp, uploadDocumentFile,
} from '@/lib/api';
import {
  Btn, Card, CardHeader, EmptyState, Field, IconBtn, Micro, Modal, Pill, Spinner, StagePill,
  fmtDate, fmtDateTime, fmtMoney,
} from '@/lib/ui';
import {
  ArrowLeft, CalendarClock, Camera, Check, CheckCircle2, ChevronRight, ClipboardCheck,
  FileText, FolderOpen, LogIn, LogOut, Mail, MapPin, MessageCircle, MessageSquare, PenLine,
  Phone, Plus, Send, StickyNote,
} from 'lucide-react';
import type { IconType } from '@/lib/ui';

/* ================= Timeline ================= */
function TimelineTab({ caseId, load }: { caseId: string; load: () => void }) {
  const { role } = useAuth();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [team, setTeam] = useState('all');
  const [type, setType] = useState<ActivityType>('note');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const loadEvents = useCallback(async () => {
    setEvents(await fetchTimeline(caseId));
  }, [caseId]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const visible = team === 'all' ? events : events.filter(e => e.role === team);

  const opts: { value: ActivityType; label: string; icon: IconType }[] = [];
  opts.push({ value: 'note', label: 'Σημείωση', icon: StickyNote });
  if (can(role, 'log_call')) opts.push({ value: 'call', label: 'Τηλέφωνο', icon: Phone });
  if (can(role, 'log_email')) opts.push({ value: 'email', label: 'Email', icon: Mail });
  if (can(role, 'log_sms')) opts.push({ value: 'sms', label: 'SMS', icon: MessageSquare });
  if (can(role, 'log_whatsapp')) opts.push({ value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle });
  if (can(role, 'meeting')) opts.push({ value: 'meeting', label: 'Συνάντηση', icon: MapPin });
  if (can(role, 'photo')) opts.push({ value: 'photo', label: 'Φωτογραφία', icon: Camera });

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    await addActivity(caseId, {
      role, activity_type: type,
      title: ACTIVITY_META[type].label ?? activityLabel(type),
      description: text.trim(),
    });
    setText('');
    setBusy(false);
    loadEvents();
    load();
  };

  return (
    <Card>
      <CardHeader micro="Timeline" title="Χρονολόγιο" />
      {opts.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-paper border border-line">
          <div className="flex items-center gap-2 flex-wrap">
            <select className="field !w-44 !py-1.5 text-[13px]" value={type} onChange={e => setType(e.target.value as ActivityType)}>
              {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input className="field flex-1 !py-1.5 text-[13px] min-w-[180px]" value={text} onChange={e => setText(e.target.value)}
              placeholder="Περιγράψτε την επικοινωνία / ενέργεια…" onKeyDown={e => { if (e.key === 'Enter' && text.trim()) submit(); }} />
            <Btn onClick={submit} disabled={busy || !text.trim()}><Plus className="w-3.5 h-3.5" /> Καταγραφή</Btn>
          </div>
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap mb-4">
        {TEAM_FILTERS.map(t => (
          <button key={t.id} onClick={() => setTeam(t.id)}
            className={`pill px-2.5 py-1 rounded-lg text-[10px] border transition-colors ${team === t.id ? 'bg-ink text-paper border-ink' : 'bg-white border-line text-ink/45 hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="relative">
        {visible.length === 0 && <EmptyState icon={StickyNote} title="Καμία δραστηριότητα ακόμα" hint="Καταγράψτε την πρώτη ενέργεια." />}
        <div className="space-y-0">
          {visible.map((e, i) => {
            const meta = ACTIVITY_META[e.activity_type] ?? { icon: StickyNote, label: e.activity_type, team: 'system' };
            const Icon = meta.icon;
            const isLast = i === visible.length - 1;
            return (
              <div key={e.id} className="flex gap-3 relative pb-5">
                {!isLast && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-line" />}
                <span className="w-7 h-7 rounded-lg bg-white border border-line flex items-center justify-center shrink-0 z-10">
                  <Icon className="w-3.5 h-3.5 text-ink/60" />
                </span>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-medium text-ink">{e.title}</span>
                    <span className="text-[11px] text-ink/35">{fmtDateTime(e.occurred_at)}</span>
                  </div>
                  {e.description && <p className="text-[13px] text-ink/60 mt-0.5">{e.description}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <Pill tone="gray">{TEAM_FILTERS.find(t => t.id === (meta.team ?? 'system'))?.label ?? meta.team}</Pill>
                    {e.user?.full_name && <span className="text-[11px] text-ink/40">{e.user.full_name}</span>}
                    {e.location?.label && <span className="text-[11px] text-ink/35"><MapPin className="w-3 h-3 inline -mt-0.5" /> {e.location.label}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/* ================= Follow Ups ================= */
function FollowUpsTab({ caseId, load }: { caseId: string; load: () => void }) {
  const { role } = useAuth();
  const [items, setItems] = useState<FollowUp[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ due_at: '', channel: 'phone', reason: '', priority: 'normal' });
  const now = new Date().toISOString().slice(0, 16);

  const loadItems = useCallback(async () => {
    const all = await fetchFollowUps({ status: 'all' });
    setItems(all.filter(f => f.case_id === caseId));
  }, [caseId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const submit = async () => {
    if (!form.reason.trim() || !form.due_at) return;
    await createFollowUp({ case_id: caseId, due_at: new Date(form.due_at).toISOString(), channel: form.channel, reason: form.reason.trim(), priority: form.priority });
    setOpen(false);
    setForm({ due_at: '', channel: 'phone', reason: '', priority: 'normal' });
    loadItems(); load();
  };

  const pending = items.filter(f => f.status === 'pending').sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
  const done = items.filter(f => f.status === 'completed');

  return (
    <Card>
      <CardHeader micro="Follow ups" title="Follow Ups"
        action={can(role, 'create_followup') ? <Btn onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5" /> Νέο</Btn> : undefined} />

      <div className="space-y-2 mb-5">
        {pending.length === 0 && <EmptyState icon={CalendarClock} title="Δεν υπάρχουν εκκρεμή follow ups" />}
        {pending.map(f => (
          <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl border border-line bg-paper/50">
            <span className="w-7 h-7 rounded-lg bg-white border border-line flex items-center justify-center shrink-0">
              <CalendarClock className="w-3.5 h-3.5 text-ink/60" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-ink">{f.reason}</div>
              <div className="text-xs text-ink/45">{CHANNELS[f.channel] ?? f.channel} · {fmtDateTime(f.due_at)}{new Date(f.due_at) < new Date() ? ' · εκπρόθεσμο' : ''}</div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {f.priority === 'high' && <Pill tone="red">υψηλή</Pill>}
              {f.priority === 'critical' && <Pill tone="red">κρίσιμη</Pill>}
              {can(role, 'complete_followup') && (
                <Btn variant="ok" onClick={async () => { await completeFollowUp(f.id, caseId); loadItems(); load(); }}>
                  <Check className="w-3.5 h-3.5" /> Ολοκλήρωση
                </Btn>
              )}
              <Btn variant="ghost" title="Αναβολή μιας ημέρας" onClick={async () => {
                const until = new Date(Date.now() + 86400000).toISOString().slice(0, 16);
                await snoozeFollowUp(f.id, new Date(until).toISOString());
                loadItems();
              }}>Αργότερα</Btn>
            </div>
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <>
          <div className="micro text-ink/35 mb-2">Ολοκληρωμένα ({done.length})</div>
          <div className="space-y-1.5">
            {done.slice(0, 5).map(f => (
              <div key={f.id} className="flex items-center gap-2 text-[13px] text-ink/50">
                <Check className="w-3.5 h-3.5 text-ok-600" />
                <span className="flex-1">{f.reason}</span>
                <span className="text-xs text-ink/35">{fmtDate(f.completed_at)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Νέο Follow Up" micro="Follow up">
        <div className="space-y-4">
          <Field label="Πότε">
            <input type="datetime-local" className="field" value={form.due_at} min={now}
              onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))} />
          </Field>
          <Field label="Κανάλι">
            <select className="field" value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value }))}>
              {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Λόγος">
            <input className="field" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="π.χ. αναμονή προσφοράς / επανεπικοινωνία" />
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
          <Btn onClick={submit} disabled={!form.reason.trim() || !form.due_at}><Plus className="w-3.5 h-3.5" /> Δημιουργία</Btn>
        </div>
      </Modal>
    </Card>
  );
}

/* ================= Documents ================= */
function DocumentsTab({ caseId }: { caseId: string }) {
  const { role } = useAuth();
  const [items, setItems] = useState<CaseDocument[]>([]);
  const [category, setCategory] = useState('identity');
  const [desc, setDesc] = useState('');
  const [up, setUp] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadItems = useCallback(async () => setItems(await fetchDocuments(caseId)), [caseId]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const saveFile = async (f: File) => {
    setUp(true);
    const up = await uploadDocumentFile(f);
    if (up) {
      await addDocument(caseId, { category, file_name: up.name, file_url: up.url, mime_type: up.mime, size: up.size, description: desc || undefined });
    }
    setUp(false);
    setDesc('');
    loadItems();
  };

  const onFile = (f: File | null) => { if (f) saveFile(f); };

  const canVerify = can(role, 'verify_document');

  return (
    <Card>
      <CardHeader micro="Documents" title="Έγγραφα"
        action={can(role, 'add_document')
          ? <div className="flex items-center gap-2">
              <Btn onClick={() => setCaptureOpen(true)}><Camera className="w-3.5 h-3.5" /> Κάμερα</Btn>
              <Btn onClick={() => fileRef.current?.click()}>{up ? <Spinner /> : <Plus className="w-3.5 h-3.5" />} Φόρτωση</Btn>
            </div>
          : undefined} />

      {can(role, 'add_document') && (
        <div className="mb-4 p-3 rounded-xl bg-paper border border-line flex items-center gap-2 flex-wrap">
          <select className="field !w-44 !py-1.5 text-[13px]" value={category} onChange={e => setCategory(e.target.value)}>
            {Object.entries(DOC_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="field flex-1 !py-1.5 text-[13px] min-w-[160px]" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Σύντομη περιγραφή / σχόλιο…" />
          <input ref={fileRef} type="file" className="hidden" onChange={e => onFile(e.target.files?.[0] ?? null)} />
        </div>
      )}

      <div className="space-y-2">
        {items.length === 0 && <EmptyState icon={FolderOpen} title="Δεν υπάρχουν έγγραφα" hint="Αντιστοιχήστε έγγραφα στο case." />}
        {items.map(d => (
          <div key={d.id} className={`flex items-center gap-3 p-3 rounded-xl border border-line ${d.status === 'verified' ? 'bg-ok-100/40' : d.status === 'rejected' ? 'bg-bad-100/40' : 'bg-paper/50'}`}>
            <span className="w-7 h-7 rounded-lg bg-white border border-line flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5 text-ink/60" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-ink truncate">{d.description || d.file_name}</div>
              <div className="text-xs text-ink/45">{DOC_CATEGORIES[d.category] ?? d.category} · {fmtDateTime(d.created_at)}</div>
              {d.file_url && (
                <a href={d.file_url} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline inline-block mt-0.5">
                  Άνοιγμα αρχείου ↗
                </a>
              )}
            </div>
            <Pill tone={d.status === 'verified' ? 'green' : d.status === 'rejected' ? 'red' : 'amber'}>{DOC_STATUSES[d.status] ?? d.status}</Pill>
            {canVerify && d.status !== 'verified' && (
              <Btn variant="ok" onClick={async () => { await setDocumentStatus(d.id, 'verified'); loadItems(); }}>
                <Check className="w-3.5 h-3.5" />
              </Btn>
            )}
            {canVerify && d.status !== 'rejected' && (
              <Btn variant="danger" onClick={async () => { await setDocumentStatus(d.id, 'rejected'); loadItems(); }}>
                Απόρριψη
              </Btn>
            )}
          </div>
        ))}
      </div>

      <CaptureModal open={captureOpen} title="Λήψη φωτογραφίας πεδίου" onClose={() => setCaptureOpen(false)} onCapture={saveFile} />
    </Card>
  );
}

/* ================= Visits ================= */
function VisitsTab({ caseId }: { caseId: string }) {
  const { role } = useAuth();
  const [items, setItems] = useState<CaseVisit[]>([]);
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState('');
  const [when, setWhen] = useState('');
  const now = new Date().toISOString().slice(0, 16);

  const loadItems = useCallback(async () => {
    const all = await fetchVisits();
    setItems(all.filter(v => v.case_id === caseId));
  }, [caseId]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const plan = async () => {
    if (!purpose.trim()) return;
    const coords = await getPosition();
    await createVisit(caseId, { purpose: purpose.trim(), scheduled_at: when ? new Date(when).toISOString() : undefined, location: coords ? { label: 'Σημείο συνάντησης', ...coords } : undefined });
    setOpen(false); setPurpose(''); setWhen('');
    loadItems();
  };

  const canCheck = can(role, 'check_in');

  return (
    <Card>
      <CardHeader micro="Field sales" title="Επισκέψεις"
        action={can(role, 'schedule_visit') ? <Btn onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5" /> Προγραμματισμός</Btn> : undefined} />

      <div className="space-y-2">
        {items.length === 0 && <EmptyState icon={MapPin} title="Δεν υπάρχουν επισκέψεις" />}
        {items.map(v => (
          <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl border border-line bg-paper/50 flex-wrap">
            <span className="w-7 h-7 rounded-lg bg-white border border-line flex items-center justify-center shrink-0">
              <MapPin className="w-3.5 h-3.5 text-ink/60" />
            </span>
            <div className="flex-1 min-w-[140px]">
              <div className="text-[13px] font-medium text-ink">{v.purpose || 'Επίσκεψη πεδίου'}</div>
              <div className="text-xs text-ink/45">
                {v.status === 'completed'
                  ? `Ολοκληρώθηκε ${v.ended_at ? fmtDateTime(v.ended_at) : ''}`
                  : v.scheduled_at
                    ? `Προγραμματισμένη ${fmtDateTime(v.scheduled_at)}`
                    : `Δημιουργήθηκε ${fmtDate(v.created_at)}`}
                {v.location?.label ? ` · ${v.location.label}` : ''}
              </div>
              {v.notes && <div className="text-xs text-ink/50 mt-0.5">{v.notes}</div>}
            </div>
            <Pill tone={v.status === 'completed' ? 'green' : v.status === 'in_progress' ? 'blue' : v.status === 'cancelled' ? 'red' : 'gray'}>
              {v.status === 'planned' ? 'Προγραμματισμένη' : v.status === 'in_progress' ? 'Σε εξέλιξη' : v.status === 'completed' ? 'Ολοκληρωμένη' : 'Ακυρωμένη'}
            </Pill>
            {canCheck && v.status === 'planned' && (
              <Btn variant="brand" onClick={async () => { const c = await getPosition(); await checkInVisit(v.id, c ?? undefined); loadItems(); }}>
                <LogIn className="w-3.5 h-3.5" /> Check In
              </Btn>
            )}
            {canCheck && v.status === 'in_progress' && (
              <Btn variant="ok" onClick={async () => { const c = await getPosition(); await checkOutVisit(v.id, c ?? undefined); loadItems(); }}>
                <LogOut className="w-3.5 h-3.5" /> Check Out
              </Btn>
            )}
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Προγραμματισμός Επίσκεψης" micro="Field sales">
        <div className="space-y-4">
          <Field label="Σκοπός">
            <input className="field" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="π.χ. κατάθεση προσφοράς, υπογραφή συμβολαίου" />
          </Field>
          <Field label="Πότε">
            <input type="datetime-local" className="field" value={when} min={now} onChange={e => setWhen(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => setOpen(false)}>Ακύρωση</Btn>
          <Btn onClick={plan} disabled={!purpose.trim()}><Plus className="w-3.5 h-3.5" /> Προγραμματισμός</Btn>
        </div>
      </Modal>
    </Card>
  );
}

/* ================= Offers ================= */
function OffersTab({ caseId }: { caseId: string }) {
  const { role } = useAuth();
  const [items, setItems] = useState<CaseOffer[]>([]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [valid, setValid] = useState('');

  const loadItems = useCallback(async () => setItems(await fetchOffers(caseId)), [caseId]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const create = async () => {
    if (!amount) return;
    await createOffer(caseId, { amount: Number(amount), valid_until: valid ? new Date(valid).toISOString() : undefined });
    setOpen(false); setAmount(''); setValid('');
    loadItems();
  };

  return (
    <Card>
      <CardHeader micro="Offers" title="Προσφορές"
        action={can(role, 'create_offer') ? <Btn onClick={() => setOpen(true)}><Plus className="w-3.5 h-3.5" /> Νέα</Btn> : undefined} />

      <div className="space-y-2">
        {items.length === 0 && <EmptyState icon={FileText} title="Δεν υπάρχουν προσφορές" />}
        {items.map(o => (
          <div key={o.id} className="flex items-center gap-3 p-3 rounded-xl border border-line bg-paper/50 flex-wrap">
            <span className="w-7 h-7 rounded-lg bg-white border border-line flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5 text-ink/60" />
            </span>
            <div className="flex-1 min-w-[140px]">
              <div className="text-[13px] font-medium text-ink flex items-center gap-2">
                {o.offer_no} <span className="font-semibold">{fmtMoney(o.amount)}</span>
              </div>
              <div className="text-xs text-ink/45">{fmtDateTime(o.created_at)}{o.valid_until ? ` · ισχύς έως ${fmtDate(o.valid_until)}` : ''}</div>
              {o.notes && <div className="text-xs text-ink/50 mt-0.5">{o.notes}</div>}
            </div>
            <Pill tone={o.status === 'sent' ? 'green' : o.status === 'accepted' ? 'green' : o.status === 'rejected' ? 'red' : 'blue'}>{o.status}</Pill>
            {o.status === 'draft' && can(role, 'send_offer') && (
              <Btn onClick={async () => { await markOfferSent(o.id, caseId); loadItems(); }}>
                <Send className="w-3.5 h-3.5" /> Αποστολή
              </Btn>
            )}
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Νέα Προσφορά" micro="Offers">
        <div className="space-y-4">
          <Field label="Ποσό (€)">
            <input className="field" type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
          </Field>
          <Field label="Ισχύς έως">
            <input type="date" className="field" value={valid} onChange={e => setValid(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Btn variant="ghost" onClick={() => setOpen(false)}>Ακύρωση</Btn>
          <Btn onClick={create} disabled={!amount}><Plus className="w-3.5 h-3.5" /> Δημιουργία</Btn>
        </div>
      </Modal>
    </Card>
  );
}

/* ================= Signatures ================= */
function SignaturesTab({ caseId }: { caseId: string }) {
  const { role } = useAuth();
  const [items, setItems] = useState<CaseSignature[]>([]);
  const [padOpen, setPadOpen] = useState(false);

  const loadItems = useCallback(async () => setItems(await fetchSignatures(caseId)), [caseId]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const onConfirm = async (file: File) => {
    const up = await uploadDocumentFile(file);
    if (up) await captureSignature(caseId, { image_url: up.url, notes: up.name || 'Υπογραφή πελάτη' });
    loadItems();
  };

  const canVerify = can(role, 'verify_document');

  return (
    <Card>
      <CardHeader micro="Signatures" title="Υπογραφές"
        action={can(role, 'capture_signature')
          ? <Btn onClick={() => setPadOpen(true)}><PenLine className="w-3.5 h-3.5" /> Νέα υπογραφή</Btn>
          : undefined} />

      <div className="space-y-2">
        {items.length === 0 && <EmptyState icon={PenLine as IconType} title="Δεν υπάρχουν υπογραφές" hint="Ο πωλητής πεδίου μπορεί να προσθέσει υπογραφή πελάτη." />}
        {items.map(s => (
          <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-line bg-paper/50 flex-wrap">
            {s.image_url
              ? <img src={s.image_url} alt="υπογραφή" className="w-9 h-9 rounded-lg object-contain bg-white border border-line shrink-0" />
              : <span className="w-9 h-9 rounded-lg bg-white border border-line flex items-center justify-center shrink-0"><PenLine className="w-4 h-4 text-ink/50" /></span>}
            <div className="flex-1 min-w-[140px]">
              <div className="text-[13px] font-medium text-ink">{s.notes || 'Υπογραφή πελάτη'}</div>
              <div className="text-xs text-ink/45">{fmtDateTime(s.captured_at ?? s.created_at)}</div>
            </div>
            <Pill tone={s.status === 'received' || s.status === 'captured' ? 'blue' : s.status === 'verified' ? 'green' : 'red'}>{s.status}</Pill>
            {canVerify && (s.status !== 'verified') && (
              <Btn variant="ok" onClick={async () => { await setSignatureStatus(s.id, 'verified', caseId); loadItems(); }}><Check className="w-3.5 h-3.5" /></Btn>
            )}
          </div>
        ))}
      </div>

      <SignaturePad open={padOpen} onClose={() => setPadOpen(false)} onConfirm={onConfirm} />
    </Card>
  );
}

/* ================= Back Office ================= */
function BackOfficeTab({ c, reload }: { c: Case; reload: () => void }) {
  const { role } = useAuth();
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchDocuments(c.id).then(setDocs); }, [c.id]);

  const doAction = async (type: ActivityType, title: string, desc: string) => {
    setBusy(true);
    await addActivity(c.id, { role, activity_type: type, title, description: desc });
    setNote('');
    setBusy(false);
    reload();
  };

  const verifiedCount = docs.filter(d => d.status === 'verified').length;
  const requiredMissing = docs.filter(d => d.status === 'missing' || d.status === 'rejected').length;

  return (
    <Card>
      <CardHeader micro="Back office" title="Λειτουργική Ολοκλήρωση" />
      {can(role, 'create_application') || can(role, 'submit_provider') || can(role, 'change_stage') ? (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-paper border border-line">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <div className="text-[13px] font-medium text-ink">Έλεγχος εγγράφων</div>
                <div className="text-xs text-ink/45">{verifiedCount} / {docs.length} ελεγχμένα{requiredMissing > 0 ? ` · ${requiredMissing} προς διόρθωση` : ''}</div>
              </div>
              <Pill tone={requiredMissing > 0 ? 'amber' : verifiedCount === docs.length && docs.length > 0 ? 'green' : 'gray'}>
                {requiredMissing > 0 ? 'μέρος ελλιπές' : verifiedCount === docs.length && docs.length > 0 ? 'έτοιμα' : 'εκκρεμεί'}
              </Pill>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {docs.map(d => (
                <button key={d.id} onClick={() => setDocumentStatus(d.id, d.status === 'verified' ? 'received' : 'verified').then(() => fetchDocuments(c.id).then(setDocs))}
                  title={`${DOC_CATEGORIES[d.category] ?? d.category} — ${DOC_STATUSES[d.status] ?? d.status} (κλικ για εναλλαγή)`}
                  className={`px-2 py-1 rounded-lg border text-[11px] font-mono uppercase transition-colors ${d.status === 'verified' ? 'bg-ok-100 text-ok-600 border-ok-600/20' : d.status === 'rejected' ? 'bg-bad-100 text-bad-600 border-bad-600/20' : 'bg-white border-line text-ink/45'}`}>
                  {DOC_CATEGORIES[d.category]?.split(' ')[0] ?? d.category}
                </button>
              ))}
              {docs.length === 0 && <span className="text-xs text-ink/40">Δεν έχουν ανέβει έγγραφα ακόμα.</span>}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-paper border border-line flex items-center gap-2 flex-wrap">
            <input className="field flex-1 !py-1.5 text-[13px] min-w-[160px]" value={note} onChange={e => setNote(e.target.value)} placeholder="Σημείωση δράσης (θα καταγραφεί στο timeline)…" />
            {can(role, 'create_application') && (
              <Btn variant="brand" disabled={busy} onClick={() => doAction('application', 'Δημιουργία αίτησης', note || 'Αίτηση δημιουργήθηκε για τον πάροχο.')}>
                <FileText className="w-3.5 h-3.5" /> Αίτηση
              </Btn>
            )}
            {can(role, 'submit_provider') && (
              <Btn variant="brand" disabled={busy} onClick={() => doAction('provider_submission', 'Καταχώρηση στον πάροχο', note || 'Αίτηση καταχωρήθηκε στην πλατφόρμα του παρόχου.')}>
                <Send className="w-3.5 h-3.5" /> Υποβολή παρόχου
              </Btn>
            )}
            {can(role, 'change_stage') && c.current_stage !== 'activation' && (
              <Btn variant="ok" disabled={busy} onClick={() => changeStage(c.id, 'activation', role, note || undefined).then(reload)}>
                <LogIn className="w-3.5 h-3.5" /> Ενεργοποίηση
              </Btn>
            )}
            {can(role, 'change_stage') && c.current_stage !== 'completed' && (
              <Btn variant="ok" disabled={busy} onClick={() => changeStage(c.id, 'completed', role, note || undefined).then(reload)}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Ολοκλήρωση
              </Btn>
            )}
          </div>
        </div>
      ) : null}

      {c.provider && <div className="mt-3 text-xs text-ink/45">Πάροχος: <span className="font-medium text-ink/70">{c.provider}</span></div>}
      {c.application_status && <div className="mt-1 text-xs text-ink/45">Κατάσταση αίτησης: {c.application_status}{c.activation_status ? ` · Ενεργοποίηση: ${c.activation_status}` : ''}</div>}
    </Card>
  );
}

/* ================= Main ================= */
export default function CaseDetailPage({ caseId }: { caseId: string }) {
  const { role } = useAuth();
  const { go } = useNav();
  const [c, setC] = useState<Case | null>(null);
  const [tab, setTab] = useState<'timeline' | 'followups' | 'docs' | 'visits' | 'offers' | 'signatures' | 'backoffice'>('timeline');
  const [stagePending, setStagePending] = useState<{ stage: Stage; note: string } | null>(null);

  const reload = useCallback(async () => {
    const data = await fetchCase(caseId);
    if (data) setC(data);
  }, [caseId]);

  useEffect(() => { reload(); }, [reload]);

  if (!c) {
    return <div className="flex items-center justify-center py-24"><Spinner /></div>;
  }

  const allowedNext = STAGE_TRANSITIONS[c.current_stage] ?? [];
  const canChange = can(role, 'change_stage');
  const isBO = can(role, 'create_application');
  const stages = STAGES.filter(s => s.id !== 'lost' && s.id !== 'cancelled');
  const stageIdx = stages.findIndex(s => s.id === c.current_stage);

  const tabs: { id: typeof tab; label: string; icon: IconType }[] = [
    { id: 'timeline', label: 'Χρονολόγιο', icon: CalendarClock },
    { id: 'followups', label: 'Follow Ups', icon: CalendarClock },
    { id: 'docs', label: 'Έγγραφα', icon: FolderOpen },
    { id: 'visits', label: 'Επισκέψεις', icon: MapPin },
    { id: 'offers', label: 'Προσφορές', icon: FileText },
    { id: 'signatures', label: 'Υπογραφές', icon: PenLine },
  ];
  if (isBO) tabs.push({ id: 'backoffice', label: 'Back Office', icon: ClipboardCheck });

  return (
    <div className="max-w-6xl space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <IconBtn title="Πίσω" onClick={() => go('cases')}>
          <ArrowLeft className="w-4 h-4" />
        </IconBtn>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Micro tone="brand">{c.case_no}</Micro>
            <StagePill stage={c.current_stage} />
            {c.priority === 'high' && <Pill tone="red">υψηλή προτεραιότητα</Pill>}
            {c.priority === 'critical' && <Pill tone="red">κρίσιμο</Pill>}
          </div>
          <h2 className="text-[17px] font-semibold text-ink tracking-tight mt-1">{c.customer?.full_name ?? c.title}</h2>
          <div className="text-xs text-ink/45 mt-0.5">
            {SERVICES[c.service_type] ?? c.service_type}
            {c.property_type ? ` · ${c.property_type}` : ''}
            {c.value ? ` · ${fmtMoney(c.value)}` : ''}
            {c.probability ? ` · ${c.probability}%` : ''}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-ink">{fmtMoney(c.value)}</div>
          <div className="text-xs text-ink/45">εδώ · {fmtDate(c.created_at)}</div>
        </div>
      </div>

      {/* Customer + Stage */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <Micro>Πελάτης</Micro>
          <div className="mt-2 space-y-1.5 text-[13px] text-ink/75">
            <div className="font-medium text-ink">{c.customer?.full_name ?? '—'}</div>
            {c.customer?.phone && <div>📞 {c.customer.phone}</div>}
            {c.customer?.email && <div>✉️ {c.customer.email}</div>}
            {(c.customer?.address || c.address) && <div>📍 {c.address || c.customer?.address}</div>}
            {c.next_follow_up_at && (
              <div className={`mt-2 flex items-center justify-between rounded-lg px-3 py-2 ${new Date(c.next_follow_up_at) < new Date() ? 'bg-bad-100 text-bad-600' : 'bg-warn-100 text-warn-600'}`}>
                <span className="text-xs font-medium">Επόμενο follow up</span>
                <span className="text-xs font-semibold">{fmtDateTime(c.next_follow_up_at)}</span>
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
            <Micro>Πορεία {stageIdx >= 0 ? `· βήμα ${stageIdx + 1}/${stages.length}` : ''}</Micro>
            {canChange && allowedNext.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-ink/40 mr-1">Μετάβαση:</span>
                {allowedNext.map(s => (
                  <Btn key={s} variant="outline" onClick={() => setStagePending({ stage: s, note: '' })}>
                    {stageLabel(s)} <ChevronRight className="w-3 h-3" />
                  </Btn>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {stages.map((s, i) => {
              const current = s.id === c.current_stage;
              const passed = i < stageIdx;
              const target = s.id === stagePending?.stage;
              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  {i > 0 && <span className={`w-4 h-px ${passed || current ? 'bg-ok-600' : 'bg-line'}`} />}
                  <button
                    onClick={() => { if (canChange && allowedNext.includes(s.id)) setStagePending({ stage: s.id, note: '' }); }}
                    disabled={!canChange || !allowedNext.includes(s.id)}
                    className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-mono uppercase tracking-wide transition-colors ${current ? 'bg-ink text-paper border-ink' : passed ? 'bg-ok-100 text-ok-600 border-ok-600/20' : target ? 'bg-brand-500 text-white border-brand-500' : 'bg-white border-line text-ink/40'}`}
                    title={passed ? 'Πέρασε' : current ? 'Τρέχον στάδιο' : allowedNext.includes(s.id) ? 'Διαθέσιμο επόμενο στάδιο' : s.short}>
                    {s.short}
                  </button>
                </div>
              );
            })}
          </div>
          {c.notes && <div className="mt-3 text-xs text-ink/50 border-t border-line pt-3">{c.notes}</div>}
        </Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${tab === t.id ? 'bg-ink text-paper' : 'bg-white border border-line text-ink/55 hover:text-ink'}`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'timeline' && <TimelineTab caseId={c.id} load={reload} />}
      {tab === 'followups' && <FollowUpsTab caseId={c.id} load={reload} />}
      {tab === 'docs' && <DocumentsTab caseId={c.id} />}
      {tab === 'visits' && <VisitsTab caseId={c.id} />}
      {tab === 'offers' && <OffersTab caseId={c.id} />}
      {tab === 'signatures' && <SignaturesTab caseId={c.id} />}
      {tab === 'backoffice' && <BackOfficeTab c={c} reload={reload} />}

      {/* Stage change confirm */}
      <Modal open={stagePending !== null} onClose={() => setStagePending(null)} title="Αλλαγή σταδίου" micro={`→ ${stagePending ? stageLabel(stagePending.stage) : ''}`}>
        {stagePending && (
          <>
            <p className="text-sm text-ink/60 mb-3">
              Αλλάξτε το case <span className="font-medium text-ink">{c.case_no}</span> σε <span className="font-semibold text-ink">{stageLabel(stagePending.stage)}</span>;
            </p>
            <input className="field" value={stagePending.note} onChange={e => setStagePending({ ...stagePending, note: e.target.value })}
              placeholder="Σημείωση αλλαγής (προαιρετικό)…" />
            <div className="flex justify-end gap-2 mt-5">
              <Btn variant="ghost" onClick={() => setStagePending(null)}>Ακύρωση</Btn>
              <Btn onClick={async () => {
                const target = stagePending.stage;
                setStagePending(null);
                await changeStage(c.id, target, role, stagePending.note || undefined);
                reload();
              }}>Επιβεβαίωση</Btn>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}