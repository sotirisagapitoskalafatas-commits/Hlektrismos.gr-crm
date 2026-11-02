/* «Επισκέψεις χωρίς Case»: the agent's visits that do not belong to a Case (staged phase7/01). Same check-in / check-out operations as every visit (idempotent, audited
   on the server); the outcome decides the next step. Visits with a Case stay in the existing list above, untouched. Until the SQL is applied the panel renders nothing.
   Offline: only the visit id, the position and the outcome text are queued in the browser, never a prospect's name, phone or address. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, LogIn, LogOut, MapPin, Phone } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { createLead, fieldCheckin, fieldCheckoutWithOutcome } from '@/lib/api';
import { fetchDefaultBackofficeAssignee } from '@/lib/lead-intake';
import { assignFieldVisit, cancelFieldVisit, createVisitFollowUp, fetchFieldVisitAssignees, fetchFieldVisits, linkVisitToLead, markVisitNoShow, rescheduleFieldVisit, visitsExtendedAvailable } from '@/lib/field-api';
import type { FieldVisit } from '@/lib/field-api';
import { OUTCOMES, checkoutNote, checkoutReady, groupVisits, outcomeByLabel } from '@/lib/field-day';
import { SUBJECT_CHIP, isReadyToVisit, isRescheduled, nextStepFor, queuePayload, reasonError, reasonOf, validateFollowUp, visitStateText, visitSubject } from '@/lib/field-visits';
import { getCurrentLocation } from '@/lib/geo/location';
import { countQueue, enqueue, isOnline } from '@/lib/offline/queue';
import { flushQueue } from '@/lib/offline/sync';
import { useToast } from '@/lib/toast';
import { Btn, fmtTime } from '@/lib/ui';
import VisitScheduler from './VisitScheduler';

type Dialog = { id: string; kind: 'reschedule' | 'cancel' | 'no_show'; reason: string; when: string } | null;
const nameOf = (v: FieldVisit) => visitSubject(v, { customerName: v.customer?.full_name, leadName: v.lead?.full_name ?? v.lead?.client_name }).label;

export default function StandaloneVisitsPanel() {
  const { user, role } = useAuth();
  const isAdmin = role === 'admin';
  const { go } = useNav();
  const { toast } = useToast();
  const [available, setAvailable] = useState(false);
  const [visits, setVisits] = useState<FieldVisit[]>([]);
  const [assignees, setAssignees] = useState<Array<{ id: string; full_name: string; is_active: boolean }>>([]);
  const [now, setNow] = useState(() => Date.now());
  const [scheduler, setScheduler] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ outcome: '', reason: '', notes: '', fuAt: '', fuReason: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);

  const load = useCallback(async () => {
    const ok = await visitsExtendedAvailable(); setAvailable(ok); if (!ok || !user?.id) return;
    // RLS returns the whole team to Admin / Back Office, and only owned rows to a Sales Agent.
    const [all, team] = await Promise.all([
      fetchFieldVisits(isAdmin ? {} : { userId: user.id }),
      isAdmin ? fetchFieldVisitAssignees() : Promise.resolve([]),
    ]);
    setVisits((all ?? []).filter((v) => !v.case_id));
    setAssignees(team);
    setNow(Date.now()); setQueued(countQueue());
  }, [user?.id, isAdmin]);
  useEffect(() => { void load(); }, [load]);

  const g = useMemo(() => groupVisits(visits, now), [visits, now]);
  const coords = async () => { try { const p = await getCurrentLocation(); return { lat: p.lat, lng: p.lng, accuracy: p.accuracy }; } catch { return undefined; } };

  const reassign = async (visitId: string, agentId: string) => {
    if (!isAdmin || !agentId) return;
    setBusy(visitId);
    const result = await assignFieldVisit(visitId, agentId);
    setBusy(null);
    if (!result.ok) { toast(result.error, 'bad'); return; }
    toast('Η επίσκεψη ανατέθηκε στον Sales Agent. Η ενέργεια καταγράφηκε στο ιστορικό.', 'ok');
    void load();
  };

  const checkIn = async (v: FieldVisit) => {
    setBusy(v.id); const c = await coords();
    if (!isOnline()) { enqueue('check_in', queuePayload({ visitId: v.id, lat: c?.lat, lng: c?.lng, accuracy: c?.accuracy })); setQueued(countQueue()); setBusy(null); toast('Εκτός σύνδεσης: το Check In θα σταλεί όταν επανέλθει η σύνδεση.', 'warn'); return; }
    const r = await fieldCheckin(v.id, c); setBusy(null);
    if (r.accepted) { toast(r.flag ? (r.message ?? 'Check In ✓ — θα το δει ο υπεύθυνος.') : 'Check In ✓', r.flag ? 'warn' : 'ok'); setOpenId(v.id); setForm({ outcome: '', reason: '', notes: '', fuAt: '', fuReason: '' }); void load(); }
    else toast(r.message ?? 'Το Check In δεν έγινε αποδεκτό.', 'warn');
  };

  const out = outcomeByLabel(form.outcome);
  const step = nextStepFor(out, { hasCase: false });
  const fuErrors = step.needs.includes('due') ? validateFollowUp({ reason: form.fuReason, assigneeId: user?.id ?? null, dueAt: form.fuAt }) : {};
  const checkOut = async (v: FieldVisit) => {
    if (!out || !checkoutReady(form.outcome, form.reason) || Object.keys(fuErrors).length) return;
    setBusy(v.id);
    const c = await coords();
    const reason = out.reasons ? form.reason : undefined;
    const note = checkoutNote(form.outcome, form.notes, reason);
    const result = reason ? `${form.outcome} — ${reason}` : form.outcome;

    // Follow-up creation is an online-only write. Do not complete the visit and lose the required follow-up.
    if (!isOnline() && (step.kind === 'followup' || step.kind === 'manager')) {
      setBusy(null);
      toast('Απαιτείται σύνδεση για να αποθηκευτεί και το follow-up. Η επίσκεψη παραμένει ανοιχτή.', 'warn');
      return;
    }
    if (!isOnline()) {
      enqueue('check_out', queuePayload({
        visitId: v.id, lat: c?.lat, lng: c?.lng, accuracy: c?.accuracy,
        notes: note, outcomeKey: out.key, outcomeReason: reason, result,
      }));
      setQueued(countQueue());
      setBusy(null);
      setOpenId(null);
      toast('Εκτός σύνδεσης: το Check Out και το αποτέλεσμα μπήκαν στην ουρά για συγχρονισμό.', 'warn');
      return;
    }

    const r = await fieldCheckoutWithOutcome(v.id, c, note, out.key, reason, result);
    if (!r.accepted) {
      setBusy(null);
      toast(r.message ?? 'Το Check Out και το αποτέλεσμα δεν αποθηκεύτηκαν. Δοκιμάστε ξανά.', 'bad');
      return;
    }

    let msg = 'Check Out ✓ — η επίσκεψη και το αποτέλεσμα αποθηκεύτηκαν.';
    let followUpFailed = false;
    if (step.kind === 'followup') {
      const f = await createVisitFollowUp(v, { reason: form.fuReason, assigneeId: user?.id ?? null, dueAt: form.fuAt });
      msg += f.ok ? ' Το follow-up αποθηκεύτηκε.' : ' Το follow-up δεν αποθηκεύτηκε — απαιτείται καταχώριση από τη Διεκπεραίωση.';
      followUpFailed = !f.ok;
    }
    if (step.kind === 'manager') {
      const bo = await fetchDefaultBackofficeAssignee();
      const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(10, 0, 0, 0);
      const f = await createVisitFollowUp(v, { reason: form.notes.trim() || 'Από επίσκεψη πεδίου', assigneeId: bo?.id ?? null, dueAt: due.toISOString() }, 'manager');
      msg += f.ok ? ` Follow-up για υπεύθυνο${bo ? ` (${bo.full_name})` : ''} στη Διεκπεραίωση.` : ' Το follow-up για υπεύθυνο δεν αποθηκεύτηκε — απαιτείται καταχώριση από τη Διεκπεραίωση.';
      followUpFailed = !f.ok;
    }
    setBusy(null);
    setOpenId(null);
    toast(msg, followUpFailed ? 'warn' : 'ok');
    void load();
  };

  const confirmDialog = async () => {
    if (!dialog) return; const e = reasonError(dialog.reason); if (e) { toast(e, 'warn'); return; }
    setBusy(dialog.id);
    const r = dialog.kind === 'cancel' ? await cancelFieldVisit(dialog.id, dialog.reason)
      : dialog.kind === 'no_show' ? await markVisitNoShow(dialog.id, dialog.reason)
      : await rescheduleFieldVisit(dialog.id, dialog.when, dialog.reason);
    setBusy(null);
    if (!r.ok) { toast(('error' in r && r.error) || 'Η ενέργεια δεν ολοκληρώθηκε.', 'bad'); return; }
    toast(dialog.kind === 'reschedule' ? 'Η επίσκεψη επαναπρογραμματίστηκε. Το ιστορικό διατηρείται.' : dialog.kind === 'cancel' ? 'Η επίσκεψη ακυρώθηκε.' : 'Σημειώθηκε «δεν εμφανίστηκε».', 'ok');
    setDialog(null); void load();
  };

  const prospectToLead = async (v: FieldVisit) => {
    if (!v.prospect?.name) return; setBusy(v.id);
    const r = await createLead({ full_name: v.prospect.name, phone: v.prospect.phone ?? null, address: v.prospect.address ?? null, source: 'field_sales' });
    if (!r.lead) { setBusy(null); toast(r.error ?? 'Το Lead δεν δημιουργήθηκε.', 'bad'); return; }
    const l = await linkVisitToLead(v.id, r.lead.id); setBusy(null);
    toast(l.ok ? 'Δημιουργήθηκε Lead. Η επίσκεψη και το ιστορικό της συνδέθηκαν.' : (l.error ?? 'Η σύνδεση δεν έγινε.'), l.ok ? 'ok' : 'bad'); void load();
  };
  const sync = async () => { const { done, failed, conflicts } = await flushQueue(); setQueued(countQueue()); if (done) toast(`Στάλθηκαν ${done} ενέργειες.`, 'ok'); if (failed) toast(`${failed} ενέργειες απέτυχαν και παραμένουν στην ουρά.`, 'warn'); if (conflicts) toast(`${conflicts} ενέργειες είχαν σύγκρουση: η επίσκεψη ακυρώθηκε/αφαιρέθηκε ή είχε ήδη διαφορετικό αποτέλεσμα.`, 'warn'); void load(); };

  if (!available) return null;
  const card = (v: FieldVisit) => {
    const subject = visitSubject(v, { customerName: v.customer?.full_name, leadName: v.lead?.full_name ?? v.lead?.client_name });
    const phone = v.customer?.phone ?? v.lead?.phone ?? v.prospect?.phone ?? null;
    const ready = isReadyToVisit(v, now);
    const closed = v.status === 'completed' || v.status === 'cancelled' || v.status === 'no_show';
    const step2 = nextStepFor(outcomeByLabel(v.result.split(' — ')[0]) ?? OUTCOMES.find((o) => o.key === v.outcome_key) ?? null, { hasCase: false });
    return (
      <li key={v.id} className="rounded-2xl border border-line bg-white p-3 space-y-2" data-testid="standalone-visit">
        <div className="flex flex-wrap items-start gap-2 justify-between">
          <button type="button" className="text-left" onClick={() => setOpenId(openId === v.id ? null : v.id)} aria-expanded={openId === v.id || v.status === 'in_progress'}>
            <span className="font-medium flex items-center gap-1.5"><MapPin size={15} aria-hidden="true" />{nameOf(v)}</span>
            <span className="text-xs text-ink/55 block">{[v.scheduled_at ? fmtTime(v.scheduled_at) : 'Χωρίς ώρα', v.purpose || 'Επίσκεψη', v.prospect?.address].filter(Boolean).join(' · ')}</span>
          </button>
          <span className="flex flex-wrap gap-1 items-center">
            {subject.chips.map((c) => <span key={c} className="atx-tag">{SUBJECT_CHIP[c]}</span>)}
            {ready && <span className="atx-tag t-success">Έτοιμη (στον χώρο)</span>}
            <span className={`atx-tag ${v.status === 'in_progress' ? 't-info' : ''}`}>{visitStateText(v)}</span>
          </span>
        </div>
        {isRescheduled(v) && <p className="text-xs text-ink/55">Επαναπρογραμματίστηκε: {reasonOf(v)}</p>}
        {v.status === 'cancelled' && !isRescheduled(v) && v.status_reason && <p className="text-xs text-ink/55">Λόγος: {v.status_reason}</p>}
        {v.status === 'no_show' && v.status_reason && <p className="text-xs text-ink/55">Λόγος: {v.status_reason}</p>}
        {v.rescheduled_from_id && <p className="text-xs text-ink/55">Νέα ώρα μετά από επαναπρογραμματισμό.</p>}

        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink/60">
            <span>Υπεύθυνος επίσκεψης</span>
            {(v.status === 'planned' || v.status === 'in_progress') ? (
              <select
                className="field"
                style={{ minWidth: 190, width: 'auto', minHeight: 36, paddingTop: 6, paddingBottom: 6 }}
                aria-label={`Ανάθεση επίσκεψης ${nameOf(v)}`}
                value={v.user_id ?? ''}
                disabled={busy === v.id || assignees.length === 0}
                onChange={(e) => void reassign(v.id, e.target.value)}
              >
                <option value="" disabled>Χωρίς ανάθεση</option>
                {assignees.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.full_name}{agent.is_active ? '' : ' (ανενεργός λογαριασμός)'}
                  </option>
                ))}
              </select>
            ) : (
              <span>{assignees.find((agent) => agent.id === v.user_id)?.full_name ?? '—'}</span>
            )}
          </div>
        )}

        {v.status === 'planned' && !isAdmin && (
        {v.status === 'planned' && (
          <div className="flex flex-wrap gap-2">
            {phone && <a className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" href={`tel:${phone.replace(/\s+/g, '')}`}><Phone size={15} aria-hidden="true" /> Κλήση</a>}
            <Btn onClick={() => void checkIn(v)} disabled={busy === v.id}><LogIn size={15} className="inline mr-1" aria-hidden="true" />{busy === v.id ? 'Αποστολή…' : 'Check In'}</Btn>
            <Btn variant="outline" onClick={() => setDialog({ id: v.id, kind: 'reschedule', reason: '', when: v.scheduled_at ? v.scheduled_at.slice(0, 16) : '' })}>Επαναπρογραμματισμός</Btn>
            <Btn variant="outline" onClick={() => setDialog({ id: v.id, kind: 'cancel', reason: '', when: '' })}>Ακύρωση</Btn>
            <Btn variant="outline" onClick={() => setDialog({ id: v.id, kind: 'no_show', reason: '', when: '' })}>Δεν εμφανίστηκε</Btn>
          </div>
        )}

        {dialog?.id === v.id && (
          <div className="rounded-xl border border-line p-3 space-y-2" role="group" aria-label={dialog.kind === 'reschedule' ? 'Επαναπρογραμματισμός' : dialog.kind === 'cancel' ? 'Ακύρωση' : 'Δεν εμφανίστηκε'}>
            {dialog.kind === 'reschedule' && <label className="block text-sm">Νέα ημερομηνία και ώρα<input type="datetime-local" className="field mt-1" value={dialog.when} onChange={(e) => setDialog({ ...dialog, when: e.target.value })} /></label>}
            <label className="block text-sm">Λόγος (απαιτείται)<input className="field mt-1" value={dialog.reason} onChange={(e) => setDialog({ ...dialog, reason: e.target.value })} /></label>
            <div className="flex gap-2"><Btn onClick={() => void confirmDialog()} disabled={busy === v.id || !!reasonError(dialog.reason) || (dialog.kind === 'reschedule' && !dialog.when)}>Επιβεβαίωση</Btn><Btn variant="outline" onClick={() => setDialog(null)}>Άκυρο</Btn></div>
          </div>
        )}

        {v.status === 'in_progress' && !isAdmin && (
          <div className="rounded-xl border border-line p-3 grid gap-2" data-testid="standalone-checkout">
            <div className="text-sm font-semibold">Ολοκλήρωση επίσκεψης</div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Αποτέλεσμα επίσκεψης">{OUTCOMES.map((o) => <button key={o.key} type="button" role="radio" aria-checked={form.outcome === o.label} className="atx-chip" aria-pressed={form.outcome === o.label} style={{ height: 38 }} onClick={() => setForm((f) => ({ ...f, outcome: o.label, reason: '' }))}>{o.label}</button>)}</div>
            {out?.reasons && <label className="text-[13px] font-medium">Αιτία (υποχρεωτικό)<select className="field mt-1" value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} aria-label="Αιτία αποτελέσματος"><option value="">— Επιλέξτε —</option>{out.reasons.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>}
            {step.text && <div className="atx-notice text-[13px]">{step.text}</div>}
            {step.needs.includes('due') && (
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="text-[13px] font-medium">Λόγος follow-up *<input className="field mt-1" value={form.fuReason} onChange={(e) => setForm((f) => ({ ...f, fuReason: e.target.value }))} aria-invalid={!!fuErrors.reason} /></label>
                <label className="text-[13px] font-medium">Ημερομηνία *<input type="datetime-local" className="field mt-1" value={form.fuAt} onChange={(e) => setForm((f) => ({ ...f, fuAt: e.target.value }))} aria-invalid={!!fuErrors.due} /></label>
                <p className="text-xs text-ink/55 sm:col-span-2">Υπεύθυνος: εσείς.</p>
              </div>
            )}
            <textarea className="field" rows={3} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Σημειώσεις επίσκεψης" aria-label="Σημειώσεις επίσκεψης" />
            <Btn onClick={() => void checkOut(v)} disabled={!out || !checkoutReady(form.outcome, form.reason) || Object.keys(fuErrors).length > 0 || busy === v.id}><LogOut size={15} className="inline mr-1" aria-hidden="true" />{busy === v.id ? 'Αποστολή…' : !out ? 'Επιλέξτε αποτέλεσμα' : 'Check Out'}</Btn>
          </div>
        )}

        {closed && v.status === 'completed' && (
          <div className="flex flex-wrap gap-2 items-center">
            {v.result && <span className="text-xs text-ink/55">{v.result}</span>}
            {v.prospect && !v.lead_id && !v.customer_id && <Btn variant="outline" onClick={() => void prospectToLead(v)} disabled={busy === v.id}>Δημιουργία Lead από τον υποψήφιο</Btn>}
            {step2.kind === 'application' && (v.lead_id || v.customer_id) && <Btn onClick={() => go('applications', { new: '1', ...(v.customer_id ? { customer: v.customer_id } : { lead: v.lead_id! }), visit: v.id })}>Συνέχεια στην Αίτηση</Btn>}
            {step2.kind === 'application' && !v.lead_id && !v.customer_id && <span className="text-xs text-ink/55">Για να συνεχίσετε στην Αίτηση, δημιουργήστε πρώτα Lead.</span>}
            {step2.kind === 'reschedule' && <Btn variant="outline" onClick={() => setScheduler(true)}>Νέα επίσκεψη</Btn>}
          </div>
        )}
      </li>
    );
  };

  const section = (title: string, list: FieldVisit[]) => list.length > 0 && <section aria-label={title}><h3 className="text-sm font-semibold mb-1.5">{title} ({list.length})</h3><ul className="space-y-2">{list.map(card)}</ul></section>;
  const empty = !g.today.length && !g.overdue.length && !g.upcoming.length && !g.doneToday.length;
  return (
    <section className="atx-panel mt-5" style={{ padding: 14 }} aria-label="Επισκέψεις χωρίς Case" data-testid="standalone-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div><h2 className="text-base font-semibold">Επισκέψεις χωρίς Case</h2><p className="text-xs text-ink/55">Γνωριμίες και προσφορές σε υποψήφιους. Δεν χρειάζεται Case για να προγραμματίσετε επίσκεψη.</p></div>
        <Btn onClick={() => setScheduler(true)}><CalendarPlus size={15} className="inline mr-1" aria-hidden="true" />Νέα επίσκεψη</Btn>
      </div>
      <p className="text-xs text-ink/55 mb-2" role="status">Συγχρονισμός: {queued ? `⏳ ${queued} σε αναμονή` : '✓ όλα συγχρονισμένα'} {queued > 0 && isOnline() && <button type="button" className="underline ml-1" onClick={() => void sync()}>Αποστολή τώρα</button>}</p>
      {empty && <p className="text-sm text-ink/60">Καμία επίσκεψη χωρίς Case.</p>}
      <div className="space-y-3">{section('Σήμερα', g.today)}{section('Εκπρόθεσμες', g.overdue)}{section('Επόμενες', g.upcoming)}{section('Ολοκληρώθηκαν σήμερα', g.doneToday)}</div>
      <VisitScheduler open={scheduler} onClose={() => setScheduler(false)} onCreated={() => void load()} />
    </section>
  );
}
