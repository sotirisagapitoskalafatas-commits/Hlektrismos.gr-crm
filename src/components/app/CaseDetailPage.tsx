import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import CaseDocuments from '@/components/documents/CaseDocuments';
import { leadFiles as toLeadFiles } from '@/lib/lead-files';
import { buildChecklist, docLabel } from '@/lib/documents';
import CaseSupplyHint from '@/components/cases/CaseSupplyHint';
import { CaseExceptionCard, CaseNextStepCard, CaseProgress, CaseUpcoming, HandoverDialog, StageChangeDialog } from '@/components/cases/CaseOverview';
import { ReturnDialog, ReturnedBanner } from '@/components/cases/CaseReturn';
import { canResubmit as canResubmitCase, canReturn as canReturnCase, stageErrorText } from '@/lib/case-return';
import { STAGE_SET_MIN_REASON, canReopenCase, canUseStageSet, checkJump, reopenTargets, stageSetTargets } from '@/lib/stage-jump';
import { stageText, visitedStages } from '@/lib/case-flow';
import { reopenAvailable, reopenCompletedCase, setCaseStage, stageSetAvailable } from '@/lib/api';
import ContactEligibility from '@/components/contact/ContactEligibility';
import { syncToast, syncWarningText } from '@/lib/lead-sync';
import { canOpenFolder, folderTabs } from '@/lib/folder';
import type { FolderTab } from '@/lib/folder';
import SupplyPointsTab from '@/components/customers/SupplyPointsTab';
import type { SupplyPoint, TariffCategory } from '@/lib/supply-points';
import { journeySteps } from '@/lib/case-flow';
import { casePatch, contactFormFrom, contactNameOk, contactSaveError, customerPatch } from '@/lib/contact-save';
import type { ContactForm } from '@/lib/contact-save';
import { APPLICATION_STATUS_TEXT, OFFER_STATUS_TEXT, SIGNATURE_STATUS_TEXT, statusText } from '@/lib/status-text';
import { entryTeam, entryTeamLabel, historyDescription, historyText, visibleHistory } from '@/lib/history-text';
import { useToast } from '@/lib/toast';
import { useStaff } from '@/lib/useStaff';
import { meetingPoint } from '@/lib/visit-location';
import SignaturePad from './SignaturePad';
import ProviderProgramPicker, { ProviderDot } from './ProviderProgramPicker';
import {
  ACTIVITY_META, CHANNELS, DOC_STATUSES, SERVICES, STAGE_TRANSITIONS, TEAM_FILTERS, activityLabel, can, leadSourceInfo, } from '@/lib/roles';
import type { ActivityType, Stage } from '@/lib/roles';
import {
  Case, CaseDocument, CaseOffer, CaseSignature, CaseVisit, FollowUp, Lead, TimelineEvent,
  addActivity, captureSignature, changeStage, checkInVisit, checkOutVisit,
  completeFollowUp, createFollowUp, createOffer, createVisit, fetchCase, fetchDocuments,
  fetchCases, fetchFollowUps, fetchLead, fetchOffers, fetchSupplyPoints, fetchTariffCategories, fetchSignatures, fetchTimeline, fetchVisits, getDocumentUrl,
  getPosition,
  markOfferSent, setDocumentStatus, setSignatureStatus, snoozeFollowUp, syncLeadsFromCustomer, updateCase, updateCustomer, customerNamesAvailable,
  uploadDocumentFile,
} from '@/lib/api';
import {
  Btn, Card, CardHeader, EmptyState, Field, Micro, Modal, Pill, Spinner, fmtDate, fmtDateTime, fmtMoney,
} from '@/lib/ui';
import {
  ArrowLeft, CalendarClock, Camera, Check, CheckCircle2,
  Crosshair, FileText, LogIn, LogOut, Mail, MapPin, MessageCircle, MessageSquare,
  Pencil, PenLine, Phone, Plus, Send, StickyNote, X,
} from 'lucide-react';
import type { IconType } from '@/lib/ui';

/* Add-entry box of the history: a note or a logged contact on one case. Used by the case history and the folder. */
export function TimelineComposer({ caseId, onAdded }: { caseId: string; onAdded: () => void }) {
  const { role } = useAuth();
  const [type, setType] = useState<ActivityType>('note');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

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
    onAdded();
  };

  if (opts.length === 0) return null;
  return (
    <div className="mb-4 p-3 rounded-xl bg-paper border border-line" data-timeline-composer>
      <div className="flex items-center gap-2 flex-wrap">
        <select className="field !w-44 !py-1.5 text-[13px]" value={type} onChange={e => setType(e.target.value as ActivityType)}>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input className="field flex-1 !py-1.5 text-[13px] min-w-[180px]" value={text} onChange={e => setText(e.target.value)}
          placeholder="Περιγράψτε την επικοινωνία / ενέργεια…" onKeyDown={e => { if (e.key === 'Enter' && text.trim()) submit(); }} />
        <Btn onClick={submit} disabled={busy || !text.trim()}><Plus className="w-3.5 h-3.5" /> Καταγραφή</Btn>
      </div>
    </div>
  );
}

/* ================= Timeline ================= */
function TimelineTab({ caseId, load }: { caseId: string; load: () => void }) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [team, setTeam] = useState('all');

  const loadEvents = useCallback(async () => {
    setEvents(await fetchTimeline(caseId));
  }, [caseId]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const shown = visibleHistory(events);
  const visible = team === 'all' ? shown : shown.filter(e => entryTeam(e) === team);

  return (
    <Card>
      <CardHeader title="Ιστορικό" />
      <TimelineComposer caseId={caseId} onAdded={() => { void loadEvents(); load(); }} />

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
                    <span className="text-[13px] font-medium text-ink">{historyText(e.title)}</span>
                    <span className="text-[11px] text-ink/35">{fmtDateTime(e.occurred_at)}</span>
                  </div>
                  {historyDescription(e) && <p className="text-[13px] text-ink/60 mt-0.5 whitespace-pre-line">{historyDescription(e)}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <Pill tone="gray">{entryTeamLabel(e)}</Pill>
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

/* ================= Follow-ups ================= */
export function FollowUpsTab({ caseId, load }: { caseId: string; load: () => void }) {
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
      <CardHeader title="Follow-ups"
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

      <Modal open={open} onClose={() => setOpen(false)} title="Νέο follow-up">
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


/* ================= Visits ================= */
export function VisitsTab({ c }: { c: Case }) {
  const caseId = c.id;
  const { role } = useAuth();
  const point = meetingPoint(c);
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
    // The case's (or customer's) stored address — never the planner's own position.
    await createVisit(caseId, { purpose: purpose.trim(), scheduled_at: when ? new Date(when).toISOString() : undefined, location: point ?? undefined });
    setOpen(false); setPurpose(''); setWhen('');
    loadItems();
  };

  const canCheck = can(role, 'check_in');

  return (
    <Card>
      <CardHeader title="Επισκέψεις"
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

      <Modal open={open} onClose={() => setOpen(false)} title="Προγραμματισμός επίσκεψης">
        <div className="space-y-4">
          <Field label="Σκοπός">
            <input className="field" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="π.χ. κατάθεση προσφοράς, υπογραφή συμβολαίου" />
          </Field>
          <Field label="Πότε">
            <input type="datetime-local" className="field" value={when} min={now} onChange={e => setWhen(e.target.value)} />
          </Field>
          <p className="text-xs text-ink/50" data-visit-point>
            {point ? `Σημείο συνάντησης: ${point.label}` : 'Δεν υπάρχει αποθηκευμένη διεύθυνση με συντεταγμένες για αυτό το case. Το check-in θα καταγραφεί και θα σημειωθεί για έλεγχο.'}
          </p>
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
export function OffersTab({ caseId }: { caseId: string }) {
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
      <CardHeader title="Προσφορές"
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
            <Pill tone={o.status === 'sent' ? 'green' : o.status === 'accepted' ? 'green' : o.status === 'rejected' ? 'red' : 'blue'}>{statusText(OFFER_STATUS_TEXT, o.status)}</Pill>
            {o.status === 'draft' && can(role, 'send_offer') && (
              <Btn onClick={async () => { await markOfferSent(o.id, caseId); loadItems(); }}>
                <Send className="w-3.5 h-3.5" /> Αποστολή
              </Btn>
            )}
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Νέα προσφορά">
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
export function SignaturesTab({ caseId }: { caseId: string }) {
  const { role } = useAuth();
  const [items, setItems] = useState<CaseSignature[]>([]);
  const [padOpen, setPadOpen] = useState(false);
  const [imgs, setImgs] = useState<Record<string, string>>({});

  const loadItems = useCallback(async () => {
    const sigs = await fetchSignatures(caseId);
    setItems(sigs);
    const resolved: Record<string, string> = {};
    for (const s of sigs) {
      const u = await getDocumentUrl(s.image_url);
      if (u) resolved[s.id] = u;
    }
    setImgs(resolved);
  }, [caseId]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const onConfirm = async (file: File) => {
    const up = await uploadDocumentFile(file);
    if (up) await captureSignature(caseId, { image_url: up.path, notes: up.name || 'Υπογραφή πελάτη' });
    loadItems();
  };

  const canVerify = can(role, 'verify_document');

  return (
    <Card>
      <CardHeader title="Υπογραφές"
        action={can(role, 'capture_signature')
          ? <Btn onClick={() => setPadOpen(true)}><PenLine className="w-3.5 h-3.5" /> Νέα υπογραφή</Btn>
          : undefined} />

      <div className="space-y-2">
        {items.length === 0 && <EmptyState icon={PenLine as IconType} title="Δεν υπάρχουν υπογραφές" hint="Ο πωλητής πεδίου μπορεί να προσθέσει υπογραφή πελάτη." />}
        {items.map(s => (
          <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-line bg-paper/50 flex-wrap">
            {imgs[s.id] || (s.image_url && /^https?:/i.test(s.image_url))
              ? <img src={imgs[s.id] ?? s.image_url} alt="υπογραφή" className="w-9 h-9 rounded-lg object-contain bg-white border border-line shrink-0" />
              : <span className="w-9 h-9 rounded-lg bg-white border border-line flex items-center justify-center shrink-0"><PenLine className="w-4 h-4 text-ink/50" /></span>}
            <div className="flex-1 min-w-[140px]">
              <div className="text-[13px] font-medium text-ink">{s.notes || 'Υπογραφή πελάτη'}</div>
              <div className="text-xs text-ink/45">{fmtDateTime(s.captured_at ?? s.created_at)}</div>
            </div>
            <Pill tone={s.status === 'received' || s.status === 'captured' ? 'blue' : s.status === 'verified' ? 'green' : 'red'}>{statusText(SIGNATURE_STATUS_TEXT, s.status)}</Pill>
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
/* «Αλλαγή σταδίου από Back Office» (staged phase2/07b): the case continues from where it really is. Any other stage, with a
   written reason; recorded with the user. It does not touch documents and does not pretend the skipped stages were done. */
/* «Επαναφορά ολοκληρωμένου case» (staged phase2/07c): only an admin, only for a completed case, with a written reason.
   Until the SQL is applied it is a neutral note, like the stage control. */
function ReopenControl({ c, reload }: { c: Case; reload: () => void }) {
  const { toast: notify } = useToast();
  const targets = useMemo(() => reopenTargets(), []);
  const [target, setTarget] = useState<Stage | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => { setTarget(''); setReason(''); setMsg(null); }, [c.id, c.current_stage]);
  useEffect(() => {
    let alive = true;
    void reopenAvailable().then(ok => { if (alive) setAvailable(ok); });
    return () => { alive = false; };
  }, []);
  const submit = async () => {
    if (!target || busy) return;
    setBusy(true); setMsg(null);
    const err = await reopenCompletedCase(c.id, target, reason);
    setBusy(false);
    if (err) {
      setMsg(err); notify(err, 'bad');
      void reopenAvailable().then(setAvailable);
      return;
    }
    notify(`Το case άνοιξε ξανά: ${stageText(target)}`, 'ok');
    reload();
  };
  return (
    <div className="p-3 rounded-xl bg-paper border border-line" data-reopen>
      <div className="text-[13px] font-medium text-ink">Επαναφορά ολοκληρωμένου case (διαχειριστής)</div>
      <p className="text-xs text-ink/55 mt-1 mb-2">
        Ανοίγει ξανά ένα case που έχει ολοκληρωθεί, από το στάδιο που θα επιλέξετε. Καταγράφεται με την αιτιολογία και τον χρήστη.
        Η ενεργοποίηση δεν θεωρείται πλέον επιβεβαιωμένη.
      </p>
      {available === null ? (
        <div className="atx-skeleton" data-reopen-checking />
      ) : available === false ? (
        <p className="text-xs text-ink/55 m-0" data-reopen-unavailable>Η λειτουργία δεν είναι ακόμη διαθέσιμη.</p>
      ) : (
        <div className="space-y-2">
          <select className="field !py-1.5 text-[13px]" value={target} onChange={e => setTarget(e.target.value as Stage | '')} aria-label="Στάδιο επαναφοράς" id="reopen-target">
            <option value="">Επιλέξτε στάδιο…</option>
            {targets.map(s => <option key={s} value={s}>{stageText(s)}</option>)}
          </select>
          <textarea className="field text-[13px]" rows={2} id="reopen-reason" value={reason} onChange={e => setReason(e.target.value)} aria-label="Αιτιολογία"
            placeholder={`Γιατί ανοίγει ξανά; (τουλάχιστον ${STAGE_SET_MIN_REASON} χαρακτήρες — καταγράφεται)`} />
          {msg && <p role="alert" data-reopen-error className="text-[13px] text-bad-600 m-0">{msg}</p>}
          <Btn variant="brand" disabled={busy || !target || reason.trim().length < STAGE_SET_MIN_REASON} onClick={() => void submit()}>{busy ? '…' : 'Επαναφορά case'}</Btn>
        </div>
      )}
    </div>
  );
}

function StageSetControl({ c, reload }: { c: Case; reload: () => void }) {
  const { role } = useAuth();
  const { toast: notify } = useToast();
  const targets = useMemo(() => stageSetTargets(role, c.current_stage), [role, c.current_stage]);
  const [target, setTarget] = useState<Stage | ''>('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // null = still asking; false = the SQL is not applied yet (the normal state for weeks): a neutral note instead of a form that cannot work
  const [available, setAvailable] = useState<boolean | null>(null);
  const allowed = canUseStageSet(role);
  useEffect(() => { setTarget(''); setReason(''); setMsg(null); }, [c.id, c.current_stage]);
  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    void stageSetAvailable().then(ok => { if (alive) setAvailable(ok); });
    return () => { alive = false; };
  }, [allowed]);
  if (!allowed) return null;
  const submit = async () => {
    if (!target || busy) return;
    setBusy(true); setMsg(null);
    const err = await setCaseStage(c.id, target, reason);
    setBusy(false);
    if (err) {
      setMsg(err); notify(err, 'bad');
      void stageSetAvailable().then(setAvailable); // the SQL may have been removed since the page opened: fall back to the note
      return;
    }
    notify(`Στάδιο: ${stageText(target)}`, 'ok');
    reload();
  };
  return (
    <div className="p-3 rounded-xl bg-paper border border-line" data-stage-set>
      <div className="text-[13px] font-medium text-ink">Αλλαγή σταδίου (Back Office)</div>
      <p className="text-xs text-ink/55 mt-1 mb-2">
        Για case που πρέπει να συνεχίσει από άλλο στάδιο, π.χ. ήρθε με πλήρη φάκελο ή γυρίζει πίσω για διόρθωση. Καταγράφεται με την αιτιολογία και τον χρήστη.
        Δεν αλλάζει τα έγγραφα και τα στάδια που παραλείπονται δεν θεωρούνται ολοκληρωμένα.
      </p>
      {available === null ? (
        <div className="atx-skeleton" data-stage-set-checking />
      ) : available === false ? (
        <p className="text-xs text-ink/55 m-0" data-stage-set-unavailable>Η λειτουργία δεν είναι ακόμη διαθέσιμη.</p>
      ) : targets.length === 0 ? (
        <p className="text-xs text-ink/55 m-0" data-stage-set-final>Το case έχει ολοκληρωθεί· δεν αλλάζει στάδιο.</p>
      ) : (
        <div className="space-y-2">
          <select className="field !py-1.5 text-[13px]" value={target} onChange={e => setTarget(e.target.value as Stage | '')} aria-label="Νέο στάδιο" id="stage-set-target">
            <option value="">Επιλέξτε στάδιο…</option>
            {targets.map(s => <option key={s} value={s}>{stageText(s)}</option>)}
          </select>
          <textarea className="field text-[13px]" rows={2} id="stage-set-reason" value={reason} onChange={e => setReason(e.target.value)} aria-label="Αιτιολογία"
            placeholder={`Γιατί συνεχίζει από αυτό το στάδιο; (τουλάχιστον ${STAGE_SET_MIN_REASON} χαρακτήρες — καταγράφεται)`} />
          {msg && <p role="alert" data-stage-set-error className="text-[13px] text-bad-600 m-0">{msg}</p>}
          <Btn variant="brand" disabled={busy || !target || reason.trim().length < STAGE_SET_MIN_REASON} onClick={() => void submit()}>{busy ? '…' : 'Αλλαγή σταδίου'}</Btn>
        </div>
      )}
    </div>
  );
}

export function BackOfficeTab({ c, reload }: { c: Case; reload: () => void }) {
  const { role } = useAuth();
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [supply, setSupply] = useState({ provider: c.provider ?? '', program: c.program ?? '' });
  const [savingSupply, setSavingSupply] = useState(false);
  const { toast: notify } = useToast();
  const [jumpMsg, setJumpMsg] = useState<string | null>(null);
  useEffect(() => { setJumpMsg(null); }, [c.current_stage]);
  const jumpHint = (target: Stage) => { const j = checkJump(c.current_stage as Stage, target); return j.allowed ? undefined : j.message; };
  // Only an allowed next stage is attempted (same list as the database after phase2/07); any refusal is shown.
  const jump = async (target: Stage) => {
    const j = checkJump(c.current_stage as Stage, target);
    if (!j.allowed) { setJumpMsg(j.message); return; }
    setBusy(true); setJumpMsg(null);
    const r = await changeStage(c.id, target, role, note || undefined);
    setBusy(false);
    if (r.error) { const m = stageErrorText(r.error); setJumpMsg(m); notify(m, 'bad'); return; }
    notify(`Στάδιο: ${stageText(target)}`, 'ok');
    reload();
  };

  useEffect(() => { fetchDocuments(c.id).then(setDocs); }, [c.id]);
  useEffect(() => { setSupply({ provider: c.provider ?? '', program: c.program ?? '' }); }, [c.provider, c.program]);

  const canEditSupply = can(role, 'submit_provider') || can(role, 'create_application') || can(role, 'edit_case');
  const supplyDirty = supply.provider !== (c.provider ?? '') || supply.program !== (c.program ?? '');

  const saveSupply = async () => {
    setSavingSupply(true);
    await updateCase(c.id, { provider: supply.provider || null, program: supply.program || null }, { log: true, role });
    await addActivity(c.id, {
      role,
      activity_type: 'note',
      title: 'Πάροχος & πρόγραμμα',
      description: `${supply.provider || '—'}${supply.program ? ` · ${supply.program}` : ''}`,
    });
    setSavingSupply(false);
    reload();
  };

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
    <>
    <CaseExceptionCard c={c} onChanged={reload} />
    <Card>
      <CardHeader title="Διεκπεραίωση" />
      {can(role, 'create_application') || can(role, 'submit_provider') || can(role, 'change_stage') ? (
        <div className="space-y-4">
          <StageSetControl c={c} reload={reload} />
          {canReopenCase(role, c.current_stage) && <ReopenControl c={c} reload={reload} />}
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
                  title={`${docLabel(d.category)} — ${DOC_STATUSES[d.status] ?? d.status} (κλικ για εναλλαγή)`}
                  className={`px-2 py-1 rounded-lg border text-[12px] transition-colors ${d.status === 'verified' ? 'bg-ok-100 text-ok-600 border-ok-600/20' : d.status === 'rejected' ? 'bg-bad-100 text-bad-600 border-bad-600/20' : 'bg-white border-line text-ink/45'}`}>
                  {docLabel(d.category)}
                </button>
              ))}
              {docs.length === 0 && <span className="text-xs text-ink/40">Δεν έχουν ανέβει έγγραφα ακόμα.</span>}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-paper border border-line flex items-center gap-2 flex-wrap" data-bo-actions>
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
            {can(role, 'change_stage') && c.current_stage !== 'activation' && c.current_stage !== 'completed' && (
              <Btn variant="ok" disabled={busy} onClick={() => void jump('activation')} title={jumpHint('activation')}>
                <LogIn className="w-3.5 h-3.5" /> Ενεργοποίηση
              </Btn>
            )}
            {can(role, 'change_stage') && c.current_stage !== 'completed' && (
              <Btn variant="ok" disabled={busy} onClick={() => void jump('completed')} title={jumpHint('completed')}>
                <CheckCircle2 className="w-3.5 h-3.5" /> Ολοκλήρωση
              </Btn>
            )}
          </div>
          {jumpMsg && <div className="atx-notice text-[13px]" role="alert" data-jump-msg>{jumpMsg}</div>}
        </div>
      ) : null}

      {/* Πάροχος & πρόγραμμα — από τον κατάλογο ενέργειας */}
      <div className="mt-4 p-3 rounded-xl bg-paper border border-line">
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div>
            <div className="text-[13px] font-medium text-ink">Πάροχος & πρόγραμμα</div>
            <div className="text-xs text-ink/45">
              {c.provider
                ? <span className="inline-flex items-center gap-1.5"><ProviderDot provider={c.provider} />{c.provider}{c.program ? ` · ${c.program}` : ''}</span>
                : 'Δεν έχει οριστεί πάροχος για αυτό το case.'}
            </div>
          </div>
          {canEditSupply && supplyDirty && (
            <Btn variant="brand" disabled={savingSupply} onClick={saveSupply}>
              <Check className="w-3.5 h-3.5" /> Αποθήκευση
            </Btn>
          )}
        </div>
        {canEditSupply ? (
          <ProviderProgramPicker
            provider={supply.provider}
            program={supply.program}
            service={c.service_type ?? 'energy'}
            onChange={next => setSupply(next)}
          />
        ) : null}
      </div>

      {c.application_status && <div className="mt-1 text-xs text-ink/45">Κατάσταση αίτησης: {statusText(APPLICATION_STATUS_TEXT, c.application_status)}{c.activation_status ? ` · Ενεργοποίηση: ${statusText(APPLICATION_STATUS_TEXT, c.activation_status)}` : ''}</div>}
    </Card>
    </>
  );
}

/* ================= Folder tabs that belong to the customer (the case page shows the same folder tabs) ================= */
function CaseSupplyPanel({ c, lead, canEdit }: { c: Case; lead: Lead | null; canEdit: boolean }) {
  const [data, setData] = useState<{ points: SupplyPoint[] | null; tariffs: TariffCategory[] | null; cases: Case[]; docs: (CaseDocument & { case_no: string })[] } | undefined>(undefined);
  const load = useCallback(async () => {
    if (!c.customer_id) return;
    const [points, tariffs, all] = await Promise.all([fetchSupplyPoints(c.customer_id), fetchTariffCategories(), fetchCases({ includeDone: true })]);
    const cases = all.filter(k => k.customer_id === c.customer_id);
    const docs = (await Promise.all(cases.map(async k => (await fetchDocuments(k.id)).map(d => ({ ...d, case_no: k.case_no }))))).flat();
    setData({ points, tariffs, cases, docs });
  }, [c.customer_id]);
  useEffect(() => { void load(); }, [load]);
  return (
    <SupplyPointsTab owner={{ customerId: c.customer_id! }} points={data === undefined ? undefined : data.points} tariffs={data?.tariffs ?? null}
      cases={data?.cases ?? []} docs={data?.docs ?? []} leadFiles={lead ? toLeadFiles(lead.attached_files).filter(f => f.supply_point_id) : []}
      canEdit={canEdit} reload={() => void load()} />
  );
}

/** «Υποθέσεις»: every case of this customer, this one marked; the others open from here. */
function CustomerCasesPanel({ c }: { c: Case }) {
  const { openCase } = useNav();
  const [cases, setCases] = useState<Case[] | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void fetchCases({ includeDone: true }).then(all => {
      if (!alive) return;
      setCases(c.customer_id ? all.filter(k => k.customer_id === c.customer_id).sort((x, y) => +new Date(y.created_at) - +new Date(x.created_at)) : [c]);
    });
    return () => { alive = false; };
  }, [c]);
  return (
    <div className="atx-panel" data-folder-cases>
      {cases === undefined ? <div className="atx-skeleton" aria-hidden="true" />
        : cases === null || cases.length === 0 ? <div className="atx-empty"><strong>Καμία υπόθεση</strong></div>
        : (
          <ul className="m-0 p-0 list-none">
            {cases.map(k => {
              const { steps, outcome } = journeySteps(k.current_stage, []);
              const n = steps.filter(x => x.state === 'done').length;
              const here = k.id === c.id;
              return (
                <li key={k.id} className="atx-row">
                  <span className="atx-icon" aria-hidden="true"><FileText size={16} /></span>
                  <span className="atx-row-main">
                    <span className="atx-row-title">{SERVICES[k.service_type] ?? k.service_type} · {k.case_no}{here ? <span className="font-normal text-[var(--atx-muted)]"> · αυτή η υπόθεση</span> : null}</span>
                    <span className="atx-row-sub">{outcome ? `Έκλεισε: ${stageText(outcome)}` : `${stageText(k.current_stage)} · βήμα ${Math.min(n + 1, 9)} από 9`}</span>
                  </span>
                  <span className="atx-row-when">{k.value > 0 ? fmtMoney(k.value) : 'Χωρίς αξία'}</span>
                  {!here && <button className="atx-btn atx-btn-quiet" onClick={() => openCase(k.id)}>Άνοιγμα</button>}
                </li>
              );
            })}
          </ul>
        )}
    </div>
  );
}

/* ================= Main ================= */
export default function CaseDetailPage({ caseId }: { caseId: string }) {
  const { role, user } = useAuth();
  const { go } = useNav();
  const [c, setC] = useState<Case | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const websiteFiles = useMemo(() => toLeadFiles(lead?.attached_files), [lead]);
  const [tab, setTab] = useState<FolderTab>('overview');
  const [stagePending, setStagePending] = useState<Stage | null>(null);
  const [handoverOpen, setHandoverOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const staff = useStaff();
  const [editContact, setEditContact] = useState(false);
  const [contactForm, setContactForm] = useState<ContactForm>(contactFormFrom(null, {}));
  const [contactSaving, setContactSaving] = useState(false);
  const [contactErr, setContactErr] = useState<string | null>(null);
  const [syncWarn, setSyncWarn] = useState<string | null>(null);
  const { toast: notify } = useToast();
  const [names, setNames] = useState(false);
  useEffect(() => { void customerNamesAvailable().then(setNames); }, []);
  const [contactLocating, setContactLocating] = useState(false);

  const openContactEdit = () => {
    setContactForm(contactFormFrom(c?.customer, { address: c?.address, lat: c?.lat, lng: c?.lng }));
    setContactErr(null);
    setEditContact(true);
  };

  const fillContactLocation = async () => {
    setContactLocating(true);
    const coords = await getPosition();
    setContactLocating(false);
    if (coords) setContactForm(f => ({ ...f, lat: String(coords.lat), lng: String(coords.lng) }));
  };

  // A failed save keeps the form open with a Greek message (D4); nothing closes as if it worked.
  const saveContact = async () => {
    if (!c) return;
    setContactSaving(true); setContactErr(null);
    const cPatch = customerPatch(contactForm, names, c.customer?.full_name || '—');
    const customerSaved = c.customer_id ? await updateCustomer(c.customer_id, cPatch) : true;
    const { error: caseError } = await updateCase(c.id, casePatch(contactForm));
    setContactSaving(false);
    const err = contactSaveError(customerSaved, caseError);
    if (err) { setContactErr(err); notify(err, 'bad'); return; }
    // the customer is saved; the linked lead is a second write and is reported on its own (D3)
    const sync = c.customer_id ? await syncLeadsFromCustomer(c.customer_id, { full_name: cPatch.full_name, phone: cPatch.phone, email: cPatch.email }) : { linked: 0, updated: 0, failed: [] as string[] };
    setSyncWarn(syncWarningText(sync));
    setEditContact(false);
    const st = syncToast(sync);
    notify(st.text, st.tone);
    await reload();
  };

  const [upcomingVersion, setUpcomingVersion] = useState(0);
  const [stageHistory, setStageHistory] = useState<TimelineEvent[] | null>(null);
  const reload = useCallback(async () => {
    const data = await fetchCase(caseId);
    setUpcomingVersion(v => v + 1);
    if (data) {
      setC(data);
      setLead(data.lead_id ? await fetchLead(data.lead_id) : null);
      setDocs(await fetchDocuments(caseId));
      setStageHistory(await fetchTimeline(caseId));
    }
  }, [caseId]);

  useEffect(() => { reload(); }, [reload]);

  if (!c) {
    return <div className="flex items-center justify-center py-24"><Spinner /></div>;
  }

  const allowedNext = STAGE_TRANSITIONS[c.current_stage] ?? [];
  const canChange = can(role, 'change_stage');
  const canEditContact = can(role, 'edit_case');
  const isBO = can(role, 'create_application');
  const checklist = buildChecklist(c, docs);

  // Same tabs, same order and same labels as the customer and lead folders (lib/folder.ts). «Παροχές» belongs to the customer.
  const tabs = folderTabs({ backOffice: isBO, supply: !!c.customer_id });

  return (
    <div className="atx-page space-y-5" style={{ maxWidth: 1040 }} data-folder="case">
      <button className="atx-link inline-flex items-center gap-1" onClick={() => go('cases')}><ArrowLeft size={15} /> Επιστροφή στα cases</button>

      {/* Identity */}
      <div className="flex items-center gap-4 flex-wrap">
        <span className="w-14 h-14 rounded-full grid place-items-center text-[18px] font-bold shrink-0" style={{ background: 'var(--atx-blue-soft)', color: 'var(--atx-blue)' }} aria-hidden="true">
          {(c.customer?.full_name ?? c.title).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
        </span>
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="atx-title" style={{ fontSize: 28 }}>{c.customer?.full_name ?? c.title}</h1>
            <span className={`atx-tag ${['lost', 'cancelled'].includes(c.current_stage) ? 't-danger' : c.current_stage === 'completed' ? 't-success' : 't-info'}`} data-folder-badge="case">{stageText(c.current_stage)}</span>
            {(c.priority === 'high' || c.priority === 'critical') && <span className="atx-tag t-danger">{c.priority === 'critical' ? 'Κρίσιμο' : 'Υψηλή προτεραιότητα'}</span>}
          </div>
          <p className="atx-sub" style={{ marginTop: 2 }}>
            Case {c.case_no} · {SERVICES[c.service_type] ?? c.service_type}{c.property_type ? ` · ${c.property_type}` : ''}
            {c.source ? ` · ${leadSourceInfo(c.source).label}` : ''} · από {fmtDate(c.created_at)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[20px] font-semibold">{c.value > 0 ? fmtMoney(c.value) : <span className="text-[15px] text-[var(--atx-faint)] font-medium">Χωρίς καταχωρημένη αξία</span>}</div>
          {c.value > 0 && c.probability ? <div className="text-[12.5px] text-[var(--atx-muted)]">πιθανότητα {c.probability}%</div> : null}
        </div>
      </div>

      {/* Tabs: same order and labels as the customer and lead folders */}
      <div className="atx-pagetabs" role="tablist" aria-label="Ενότητες φακέλου">
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className="atx-pagetab" onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5" data-case-overview>
      <CaseProgress c={c} allowedNext={allowedNext} canChange={canChange} onPick={setStagePending} visited={stageHistory ? visitedStages(stageHistory, c.current_stage) : null} />

      <CaseSupplyHint c={c} onLinked={() => void reload()} />

      {/* Next step + customer */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ReturnedBanner c={c} staff={staff} canResubmit={canResubmitCase(role, user?.id, c)} onDone={() => void reload()} />
          <CaseNextStepCard c={c} allowedNext={allowedNext} checklist={checklist} staff={staff}
            canChange={canChange} canAssign={can(role, 'assign')} onPick={setStagePending}
            onHandover={() => setHandoverOpen(true)} onDocs={() => setTab('docs')}
            onReturn={canReturnCase(role, c) ? () => setReturnOpen(true) : undefined} />
          <div className="mt-4"><CaseUpcoming caseId={c.id} version={upcomingVersion} onOpenTab={setTab} /></div>
        </div>
        <Card>
          <div className="flex items-center justify-between gap-2">
            <Micro>Στοιχεία επαφής</Micro>
            {canEditContact && (
              editContact
                ? <button onClick={() => setEditContact(false)} title="Ακύρωση" className="p-1.5 rounded-lg border border-line bg-white text-ink/60 hover:text-ink transition-colors"><X className="w-3.5 h-3.5" /></button>
                : <button onClick={openContactEdit} title="Επεξεργασία στοιχείων" className="p-1.5 rounded-lg border border-line bg-white text-ink/60 hover:text-ink transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
            )}
          </div>

          {editContact ? (
            <div className="mt-3 space-y-2.5">
              {names ? (
                <div className="grid sm:grid-cols-2 gap-2.5">
                  <Field label="Όνομα">
                    <input className="field" value={contactForm.first_name} onChange={e => setContactForm(f => ({ ...f, first_name: e.target.value }))} />
                  </Field>
                  <Field label="Επώνυμο">
                    <input className="field" value={contactForm.last_name} onChange={e => setContactForm(f => ({ ...f, last_name: e.target.value }))} />
                  </Field>
                </div>
              ) : (
                <Field label="Ονοματεπώνυμο">
                  <input className="field" value={contactForm.full_name} onChange={e => setContactForm(f => ({ ...f, full_name: e.target.value }))} />
                </Field>
              )}
              <div className="grid sm:grid-cols-2 gap-2.5">
                <Field label="Τηλέφωνο">
                  <input type="tel" className="field" value={contactForm.phone ?? ''} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} placeholder="69…" />
                </Field>
                <Field label="Email">
                  <input type="email" className="field" value={contactForm.email ?? ''} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.gr" />
                </Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-2.5">
                <Field label="Διεύθυνση">
                  <input className="field" value={contactForm.address ?? ''} onChange={e => setContactForm(f => ({ ...f, address: e.target.value }))} placeholder="Οδός, αριθμός…" />
                </Field>
                <Field label="Πόλη">
                  <input className="field" value={contactForm.city ?? ''} onChange={e => setContactForm(f => ({ ...f, city: e.target.value }))} />
                </Field>
              </div>
              <Field label="Τοποθεσία (συντεταγμένες)">
                <div className="grid grid-cols-2 gap-2.5">
                  <input type="number" step="any" className="field" value={contactForm.lat ?? ''} onChange={e => setContactForm(f => ({ ...f, lat: e.target.value }))} placeholder="lat" />
                  <input type="number" step="any" className="field" value={contactForm.lng ?? ''} onChange={e => setContactForm(f => ({ ...f, lng: e.target.value }))} placeholder="lng" />
                </div>
                <button type="button" onClick={fillContactLocation} disabled={contactLocating}
                  className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-600 hover:underline">
                  <Crosshair className="w-3.5 h-3.5" /> {contactLocating ? 'Εντοπισμός…' : 'Χρήση τρέχουσας τοποθεσίας'}
                </button>
              </Field>
              {contactErr && <p role="alert" data-contact-error className="text-[13px] text-bad-600">{contactErr}</p>}
              <div className="flex gap-2 pt-1">
                <Btn onClick={saveContact} disabled={contactSaving || !contactNameOk(contactForm, names)}>
                  {contactSaving ? <Spinner /> : <Check className="w-3.5 h-3.5" />} Αποθήκευση
                </Btn>
                <Btn variant="ghost" onClick={() => setEditContact(false)}>Ακύρωση</Btn>
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-1.5 text-[13px] text-ink/75">
              <div className="font-medium text-ink">{c.customer?.full_name ?? '—'}</div>
              {c.customer_id && <button className="atx-link !p-0 text-[13px]" onClick={() => go('customers', { customer: c.customer_id! })}>Προφίλ πελάτη →</button>}
              {c.customer?.phone && <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-ink/40" aria-hidden="true" /><a className="hover:underline" href={`tel:${c.customer.phone.replace(/\s+/g, '')}`}>{c.customer.phone}</a></div>}
              {c.customer?.email && <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 text-ink/40" aria-hidden="true" /><a className="hover:underline truncate" href={`mailto:${c.customer.email}`}>{c.customer.email}</a></div>}
              {(c.customer?.address || c.address) && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-ink/40" aria-hidden="true" />{c.address || c.customer?.address}</div>}
              {c.next_follow_up_at && (
                <div className={`mt-2 flex items-center justify-between rounded-lg px-3 py-2 ${new Date(c.next_follow_up_at) < new Date() ? 'bg-bad-100 text-bad-600' : 'bg-warn-100 text-warn-600'}`}>
                  <span className="text-xs font-medium">Επόμενο follow up</span>
                  <span className="text-xs font-semibold">{fmtDateTime(c.next_follow_up_at)}</span>
                </div>
              )}
              {lead && (
                <div className="mt-3 pt-3 border-t border-line">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="micro text-ink/40">Προέλευση · Lead</div>
                    {c.customer_id && canOpenFolder(role) && <button type="button" data-open-folder className="text-[12px] font-medium text-brand-600 hover:underline" onClick={() => go('customers', { customer: c.customer_id! })}>Φάκελος πελάτη</button>}
                  </div>
                  <div className="text-xs text-ink/70 space-y-0.5">
                    <div>{leadSourceInfo(lead.source).emoji} {leadSourceInfo(lead.source).label}{lead.campaign_name ? ` · 📢 ${lead.campaign_name}` : ''}</div>
                    <div>Καταχωρήθηκε {fmtDate(lead.created_at)}{lead.converted_at ? ` · μετατροπή ${fmtDate(lead.converted_at)}` : ''}</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {syncWarn && <p role="alert" data-sync-warning className="text-[13px] text-bad-600 mt-2 px-1">{syncWarn}</p>}

        {c.customer_id && <ContactEligibility subject={{ phone: c.customer?.phone ?? null, email: c.customer?.email ?? null, customerId: c.customer_id }} />}

      </div>

        </div>
      )}
      {tab === 'supply' && c.customer_id && <CaseSupplyPanel c={c} lead={lead} canEdit={can(role, 'edit_case')} />}
      {tab === 'docs' && <CaseDocuments c={c} onChanged={reload} leadFiles={websiteFiles} />}
      {tab === 'cases' && <CustomerCasesPanel c={c} />}
      {tab === 'history' && <TimelineTab caseId={c.id} load={reload} />}
      {tab === 'followups' && <FollowUpsTab caseId={c.id} load={reload} />}
      {tab === 'visits' && <VisitsTab c={c} />}
      {tab === 'offers' && <OffersTab caseId={c.id} />}
      {tab === 'signatures' && <SignaturesTab caseId={c.id} />}
      {tab === 'backoffice' && <BackOfficeTab c={c} reload={reload} />}

      <StageChangeDialog c={c} stage={stagePending} role={role} onClose={() => setStagePending(null)}
        onDone={() => { setStagePending(null); void reload(); }} />
      <HandoverDialog c={c} open={handoverOpen} staff={staff} role={role} onClose={() => setHandoverOpen(false)}
        onDone={() => { setHandoverOpen(false); void reload(); }} />
      {returnOpen && <ReturnDialog c={c} checklist={checklist} staff={staff} onClose={() => setReturnOpen(false)}
        onDone={() => { setReturnOpen(false); void reload(); }} />}
    </div>
  );
}