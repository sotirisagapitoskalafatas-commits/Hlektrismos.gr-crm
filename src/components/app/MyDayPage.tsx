/* Ημέρα μου — mobile-first field workflow: next visit → navigate / call → Check In → outcome + notes →
   next follow-up → Check Out. Check-in/out use the server RPCs (idempotency, audit); success is shown only when the
   server accepts. Offline actions keep using the existing queue.
   Check-in (staged phase4/10): a manual check-in is always accepted; far from the stored address / no GPS / poor
   accuracy are recorded with a review flag for the manager. «Φτάσατε στο…;» appears within arrival_prompt_radius_m
   (75 m) while this page is open and location permission is already granted — no background tracking, nothing stored.
   The «χωρίς GPS» case-note fallback below is kept only for the older live server, which still refuses such check-ins. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, LogIn, LogOut, MapPin, Navigation, Phone, RefreshCw, Route } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { serviceLabel, can } from '@/lib/roles';
import {
  addActivity, createFollowUp, fetchArrivalRadius, fetchCases, fetchFollowUps, fetchTimeline, fetchVisits, fieldCheckin, fieldCheckout, updateVisitNotes,
} from '@/lib/api';
import type { Case, CaseVisit, FollowUp } from '@/lib/api';
import { GEO_ERRORS, getCurrentLocation, watchCurrentLocation } from '@/lib/geo/location';
import type { GeoErrorCode, UserLocation } from '@/lib/geo/location';
import { formatDistance, durationMinutes, distanceKm } from '@/lib/geo/distance';
import { enqueue, countQueue, isOnline } from '@/lib/offline/queue';
import { flushQueue } from '@/lib/offline/sync';
import { useToast } from '@/lib/toast';
import { fmtTime, todayLabel } from '@/lib/ui';
import { arrivalCandidate, checkoutNote, checkoutReady, DEFAULT_ARRIVAL_RADIUS_M, groupVisits, nearestCases, OUTCOMES, outcomeByLabel } from '@/lib/field-day';
import { handoverNewSale, managerFollowUp } from '@/lib/field-handover';
import { isOpenFollowUpFor } from '@/lib/work';
import { formatWhen } from '@/lib/work-format';
import { stageText } from '@/lib/case-flow';
import NavigationButton from '@/components/navigation/NavigationButton';

type Fallback = { visitId: string; message: string; reason: string };

export default function MyDayPage() {
  const { role, user } = useAuth();
  const { openCase, go } = useNav();
  const { toast } = useToast();
  const [visits, setVisits] = useState<CaseVisit[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loc, setLoc] = useState<UserLocation | null>(null);
  const [locErr, setLocErr] = useState<GeoErrorCode | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState({ outcome: '', reason: '', notes: '', fuAt: '', fuReason: '' });
  // «Νέο Sale» steps for the visit just checked out (customer details → documents → handover to Back Office).
  const [sale, setSale] = useState<{ caseId: string; customerId: string | null; name: string; handedOver: string | null } | null>(null);
  const [fallback, setFallback] = useState<Fallback | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [arrivalRadius, setArrivalRadius] = useState(DEFAULT_ARRIVAL_RADIUS_M);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    const [v, f, c] = await Promise.all([fetchVisits({ user: true }), fetchFollowUps({ status: 'all' }), fetchCases()]);
    setVisits(v); setFollowUps(f); setCases(c); setLoading(false); setNow(Date.now());
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setQueued(countQueue()); }, []);

  const locate = useCallback(async (silent = false) => {
    setLocErr(null); setLocBusy(true);
    try { setLoc(await getCurrentLocation()); }
    catch (e) {
      setLoc(null);
      const code = (e as Error).message as GeoErrorCode;
      setLocErr(code);
      if (!silent) toast(GEO_ERRORS[code] ?? 'Η θέση σας δεν είναι διαθέσιμη.', 'warn');
    } finally { setLocBusy(false); }
  }, [toast]);
  useEffect(() => { void locate(true); }, [locate]);
  useEffect(() => { void fetchArrivalRadius().then(r => { if (r) setArrivalRadius(r); }); }, []);

  // While this page is open and visible, follow the position ONLY if permission was already granted (no new prompt).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !navigator.permissions?.query) return;
    let stopWatch: (() => void) | null = null;
    let alive = true;
    const start = () => {
      if (stopWatch || document.visibilityState !== 'visible') return;
      stopWatch = watchCurrentLocation(setLoc, () => { /* keep the last position; manual check-in still works */ });
    };
    const stop = () => { stopWatch?.(); stopWatch = null; };
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop());
    void navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(st => {
      if (!alive || st.state !== 'granted') return;
      start();
      document.addEventListener('visibilitychange', onVis);
    }).catch(() => {});
    return () => { alive = false; stop(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const caseById = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);
  const coords = useCallback((v: CaseVisit) => {
    const c = caseById.get(v.case_id);
    if (c?.lat != null && c.lng != null) return { lat: c.lat, lng: c.lng };
    if (v.location?.lat != null && v.location.lng != null) return { lat: v.location.lat, lng: v.location.lng };
    return null;
  }, [caseById]);

  const g = useMemo(() => groupVisits(visits, now), [visits, now]);
  const myFollowUps = useMemo(() => {
    const uid = user?.id ?? '';
    return followUps.filter(f => isOpenFollowUpFor(f, uid, now))
      .filter(f => new Date(f.due_at).getTime() < new Date(now).setHours(23, 59, 59, 999))
      .sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
  }, [followUps, user?.id, now]);
  const near = useMemo(() => nearestCases(cases, loc), [cases, loc]);
  const arrival = useMemo(() => (can(role, 'check_in') ? arrivalCandidate(visits, coords, loc, arrivalRadius, dismissed) : null),
    [visits, coords, loc, arrivalRadius, dismissed, role]);

  // A position the page already holds (≤30 s old, e.g. from the arrival watch) is used as is; otherwise ask once.
  const getCoords = async () => {
    if (loc && Date.now() - loc.timestamp < 30_000) return { lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy };
    try { return await getCurrentLocation(); } catch { return undefined; }
  };

  const checkIn = async (v: CaseVisit) => {
    setBusyId(v.id);
    const c = await getCoords();
    if (!isOnline()) {
      enqueue('check_in', { visitId: v.id, coords: c });
      toast('Εκτός σύνδεσης — το Check In θα σταλεί μόλις επανέλθει η σύνδεση.', 'warn');
      setQueued(countQueue()); setBusyId(null); return;
    }
    const res = await fieldCheckin(v.id, c);
    setBusyId(null);
    if (res.accepted) {
      if (res.code === 'IDEMPOTENT') toast(res.message ?? 'Έχει ήδη γίνει Check In.', 'ok');
      else if (res.flag) toast(res.message ?? 'Check In ✓ — καταγράφηκε για έλεγχο από τον υπεύθυνο.', 'warn');
      else toast('Check In ✓', 'ok');
      setFallback(null);
      setOpenId(v.id); setForm({ outcome: '', reason: '', notes: '', fuAt: '', fuReason: '' }); void load();
    } else {
      toast(res.message ?? 'Το Check In δεν έγινε αποδεκτό.', 'warn');
      if (res.code === 'GPS_UNCERTAIN' || res.code === 'NO_TARGET' || res.code === 'OUTSIDE_RADIUS') {
        setFallback({ visitId: v.id, message: res.message ?? '', reason: '' });
      }
    }
  };

  const checkOut = async (v: CaseVisit) => {
    if (!form.outcome) return;
    setBusyId(v.id);
    const c = await getCoords();
    const out = outcomeByLabel(form.outcome);
    const note = checkoutNote(form.outcome, form.notes, out?.reasons ? form.reason : undefined);
    if (!isOnline()) {
      enqueue('check_out', { visitId: v.id, coords: c, notes: note });
      toast(`Εκτός σύνδεσης — το Check Out θα σταλεί αργότερα.${form.fuAt ? ' Το follow-up δεν αποθηκεύτηκε· καταχωρήστε το όταν έχετε σύνδεση.' : ''}`, 'warn');
      setQueued(countQueue()); setBusyId(null); setOpenId(null); return;
    }
    const res = await fieldCheckout(v.id, c, note);
    if (!res.accepted) { setBusyId(null); toast(res.message ?? 'Το Check Out απέτυχε. Δοκιμάστε ξανά.', 'bad'); return; }
    await updateVisitNotes(v.id, form.notes.trim(), out?.reasons ? `${form.outcome} — ${form.reason}` : form.outcome);
    let branchMsg = '';
    if (out?.next === 'sale') setSale({ caseId: v.case_id, customerId: v.case?.customer?.id ?? null, name: v.case?.customer?.full_name ?? v.case?.title ?? 'Πελάτης', handedOver: null });
    if (out?.next === 'manager') {
      const m = await managerFollowUp(v.case_id, form.notes);
      branchMsg = m.ok ? ` Follow-up για υπεύθυνο${m.assignee ? ` (${m.assignee})` : ''} στη Διεκπεραίωση.` : ' Το follow-up για υπεύθυνο δεν αποθηκεύτηκε — δοκιμάστε από το case.';
    }
    let fuOk = true;
    if (form.fuAt) {
      const fu = await createFollowUp({ case_id: v.case_id, due_at: new Date(form.fuAt).toISOString(), channel: 'phone', reason: form.fuReason.trim() || `Μετά την επίσκεψη: ${form.outcome}`, priority: 'normal' });
      fuOk = !!fu;
    }
    setBusyId(null); setOpenId(null);
    toast((fuOk ? 'Check Out ✓ — η επίσκεψη ολοκληρώθηκε' : 'Check Out ✓ — αλλά το follow-up δεν αποθηκεύτηκε, δοκιμάστε από το case.') + branchMsg, fuOk ? 'ok' : 'warn');
    void load();
  };

  const recordWithoutGps = async () => {
    if (!fallback) return;
    const v = visits.find(x => x.id === fallback.visitId);
    if (!v) return;
    setBusyId(v.id);
    const title = 'Επίσκεψη χωρίς επιβεβαίωση GPS';
    await addActivity(v.case_id, { role, activity_type: 'visit', title, description: fallback.reason.trim(), metadata: { visit_id: v.id, server_message: fallback.message } });
    const tl = await fetchTimeline(v.case_id);
    setBusyId(null);
    const ok = tl.some(e => e.title === title && Date.now() - new Date(e.occurred_at).getTime() < 5 * 60_000);
    if (ok) { toast('Καταγράφηκε στο case ως επίσκεψη χωρίς GPS (δεν είναι Check In).', 'ok'); setFallback(null); }
    else toast('Η καταγραφή δεν αποθηκεύτηκε. Δοκιμάστε ξανά.', 'bad');
  };

  const sync = async () => {
    setSyncing(true);
    const { done, failed } = await flushQueue();
    setQueued(countQueue()); setSyncing(false);
    if (done) toast(`Στάλθηκαν ${done} ενέργειες.`, 'ok');
    if (failed) toast(`${failed} ενέργειες απέτυχαν και παραμένουν στην ουρά.`, 'warn');
    void load();
  };

  const visitCard = (v: CaseVisit, hero = false) => {
    const pos = coords(v);
    const km = loc && pos ? distanceKm(loc, pos) : null;
    const phone = v.case?.customer?.phone ?? null;
    const name = v.case?.customer?.full_name ?? v.case?.title ?? 'Επίσκεψη';
    const inProgress = v.status === 'in_progress';
    const expanded = hero || openId === v.id || inProgress;
    return (
      <li key={v.id} className={hero ? '' : 'atx-row'} style={hero ? undefined : { alignItems: 'flex-start', flexDirection: 'column', gap: 10 }}>
        <div className="flex items-start gap-x-3 gap-y-1 w-full flex-wrap">
          <span className="atx-icon" aria-hidden="true"><MapPin size={16} /></span>
          <button className="atx-row-main" onClick={() => setOpenId(openId === v.id ? null : v.id)} aria-expanded={expanded}>
            <span className="atx-row-title" style={hero ? { fontSize: 19, whiteSpace: 'normal' } : { whiteSpace: 'normal' }}>{name}</span>
            <span className="atx-row-sub" style={{ whiteSpace: 'normal' }}>
              {[v.scheduled_at ? fmtTime(v.scheduled_at) : 'Χωρίς ώρα', v.purpose || 'Επίσκεψη', v.case?.case_no, km != null ? `${formatDistance(km)} · ~${durationMinutes(km)}′` : null].filter(Boolean).join(' · ')}
            </span>
          </button>
          <span className="order-last sm:order-none basis-full sm:basis-auto pl-[46px] sm:pl-0"><span className={`atx-tag ${inProgress ? 't-info' : ''}`}>{inProgress ? 'Σε εξέλιξη' : 'Προγραμματισμένη'}</span></span>
        </div>
        {expanded && (
          <div className="w-full grid gap-2" style={{ paddingLeft: hero ? 0 : 46 }}>
            <div className="flex flex-wrap gap-2">
              {pos ? <NavigationButton destination={{ ...pos, label: name }} caseId={v.case_id} label="Πλοήγηση" showSelector={false} />
                : <span className="text-[13px] text-[var(--atx-muted)]">Δεν υπάρχει αποθηκευμένη θέση για πλοήγηση.</span>}
              {phone && <a className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" style={{ height: 40 }} href={`tel:${phone.replace(/\s+/g, '')}`}><Phone size={15} /> Κλήση</a>}
              {v.status === 'planned' && can(role, 'check_in') && (
                <button className="atx-btn atx-btn-primary inline-flex items-center gap-1.5" style={{ height: 40 }} disabled={busyId === v.id} onClick={() => void checkIn(v)}>
                  <LogIn size={15} /> {busyId === v.id ? 'Αποστολή…' : 'Check In'}
                </button>
              )}
              <button className="atx-btn atx-btn-quiet" style={{ height: 40 }} onClick={() => openCase(v.case_id)}>Άνοιγμα case</button>
            </div>

            {fallback?.visitId === v.id && (
              <div className="atx-notice grid gap-2">
                <span><strong>Το Check In απορρίφθηκε.</strong> {fallback.message}</span>
                <span className="text-[13px]">Μπορείτε να καταγράψετε την επίσκεψη ως σημείωση στο case. Δεν μετράει ως Check In.</span>
                <input className="field" value={fallback.reason} onChange={e => setFallback({ ...fallback, reason: e.target.value })} placeholder="Αιτία (απαιτείται), π.χ. «Χωρίς σήμα GPS στο υπόγειο»" aria-label="Αιτία καταγραφής χωρίς GPS" />
                <div className="flex gap-2 flex-wrap">
                  <button className="atx-btn atx-btn-primary" disabled={busyId === v.id || fallback.reason.trim().length < 3} onClick={() => void recordWithoutGps()}>Καταγραφή χωρίς GPS</button>
                  <button className="atx-btn atx-btn-quiet" onClick={() => void locate()}>Νέα προσπάθεια θέσης</button>
                </div>
              </div>
            )}

            {inProgress && can(role, 'check_out') && (
              <div className="atx-panel grid gap-3" style={{ padding: 14 }}>
                <div className="text-[14px] font-semibold">Ολοκλήρωση επίσκεψης</div>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Αποτέλεσμα επίσκεψης">
                  {OUTCOMES.map(o => (
                    <button key={o.key} role="radio" aria-checked={form.outcome === o.label} className="atx-chip" aria-pressed={form.outcome === o.label} style={{ height: 38 }}
                      onClick={() => setForm(f => ({ ...f, outcome: o.label, reason: '' }))}>{o.label}</button>
                  ))}
                </div>
                {outcomeByLabel(form.outcome)?.reasons && (
                  <label className="text-[13px] font-medium">Αιτία (υποχρεωτικό)
                    <select className="field mt-1" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} aria-label="Αιτία αποτελέσματος">
                      <option value="">— Επιλέξτε —</option>
                      {outcomeByLabel(form.outcome)!.reasons!.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </label>
                )}
                {form.reason === 'Δεν θέλει επικοινωνία' && <div className="atx-notice text-[13px]">Καταγράψτε το και στο «Επικοινωνία & συγκαταθέσεις» του πελάτη, ώστε να μην ξανακληθεί.</div>}
                {outcomeByLabel(form.outcome)?.next === 'sale' && <div className="atx-notice text-[13px]">Μετά το Check Out: στοιχεία πελάτη → έγγραφα → παράδοση στο Back Office.</div>}
                {outcomeByLabel(form.outcome)?.next === 'manager' && <div className="atx-notice text-[13px]">Θα δημιουργηθεί follow-up για τον υπεύθυνο (ουρά Διεκπεραίωσης), με τις σημειώσεις σας.</div>}
                <textarea className="field" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Σημειώσεις επίσκεψης (έγγραφα που συλλέχθηκαν, τι συμφωνήθηκε…)" aria-label="Σημειώσεις επίσκεψης" />
                <div className="grid sm:grid-cols-2 gap-2">
                  <label className="text-[13px] font-medium">Επόμενο follow-up (προαιρετικό)
                    <input type="datetime-local" className="field mt-1" value={form.fuAt} onChange={e => setForm(f => ({ ...f, fuAt: e.target.value }))} />
                  </label>
                  <label className="text-[13px] font-medium">Αιτία follow-up
                    <input className="field mt-1" value={form.fuReason} onChange={e => setForm(f => ({ ...f, fuReason: e.target.value }))} placeholder="π.χ. Αποστολή υπογεγραμμένης αίτησης" />
                  </label>
                </div>
                <button className="atx-btn atx-btn-primary inline-flex items-center gap-1.5 justify-center" style={{ height: 44 }} disabled={!checkoutReady(form.outcome, form.reason) || busyId === v.id} onClick={() => void checkOut(v)}>
                  <LogOut size={15} /> {busyId === v.id ? 'Αποστολή…' : !form.outcome ? 'Επιλέξτε αποτέλεσμα' : !checkoutReady(form.outcome, form.reason) ? 'Επιλέξτε αιτία' : 'Check Out'}
                </button>
              </div>
            )}
          </div>
        )}
      </li>
    );
  };

  const restToday = g.today.filter(v => v.id !== g.next?.id);

  return (
    <div className="atx-page" style={{ maxWidth: 860 }}>
      <div className="atx-head">
        <p className="atx-eyebrow">{todayLabel()}</p>
        <h1 className="atx-title">Η ημέρα μου</h1>
        <p className="atx-sub">{loading ? 'Φόρτωση…' : `${g.today.length} επισκέψεις σήμερα · ${g.doneToday.length} ολοκληρώθηκαν${g.overdue.length ? ` · ${g.overdue.length} εκκρεμούν από προηγούμενες ημέρες` : ''}`}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`atx-tag ${loc ? 't-success' : 't-warning'}`}>{loc ? `GPS έτοιμο${loc.accuracy != null ? ` · ±${Math.round(loc.accuracy)} μ` : ''}` : locErr ? GEO_ERRORS[locErr] : 'Αναζήτηση θέσης…'}</span>
        <button className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" disabled={locBusy} onClick={() => void locate()}><RefreshCw size={14} /> Θέση</button>
        {queued > 0 && (
          <button className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" disabled={syncing} onClick={() => void sync()} style={{ color: 'var(--atx-amber)' }}>
            <RefreshCw size={14} /> {syncing ? 'Αποστολή…' : `${queued} σε αναμονή — αποστολή`}
          </button>
        )}
        <span className="flex-1" />
        <button className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" onClick={() => go('map', { focus: 'route' })}><Route size={14} /> Δρομολόγιο</button>
        <button className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" onClick={() => go('map', { focus: 'today' })}><Navigation size={14} /> Χάρτης</button>
      </div>

      {loading && <div className="atx-panel mt-5">{[0, 1, 2].map(i => <div key={i} className="atx-skeleton" />)}</div>}

      {sale && (
        <div className="atx-panel mt-4 grid gap-2" style={{ padding: 16 }} data-new-sale>
          <div className="text-[15px] font-semibold">Νέο Sale — {sale.name}</div>
          <ol className="m-0 pl-5 text-[13.5px] space-y-1">
            <li>Στοιχεία πελάτη {sale.customerId && <button className="atx-link !p-0" onClick={() => go('customers', { customer: sale.customerId! })}>Άνοιγμα →</button>}</li>
            <li>Έγγραφα (ταυτότητα, λογαριασμός, Ε9…) <button className="atx-link !p-0" onClick={() => openCase(sale.caseId)}>Άνοιγμα case →</button></li>
            <li>Παράδοση στο Back Office {sale.handedOver !== null && <strong>✓ {sale.handedOver || 'έγινε'}</strong>}</li>
          </ol>
          {sale.handedOver === null && (
            <button className="atx-btn atx-btn-primary" style={{ height: 42 }} disabled={busyId === sale.caseId} onClick={async () => {
              setBusyId(sale.caseId);
              const r = await handoverNewSale(sale.caseId, { id: user?.id ?? '', role }, '');
              setBusyId(null);
              if (!r.ok) { toast('Η παράδοση δεν αποθηκεύτηκε. Δοκιμάστε από το case.', 'bad'); return; }
              setSale(x => x && { ...x, handedOver: r.assignee ?? 'χωρίς ορισμένο υπεύθυνο' });
              toast(r.assignee ? `Παραδόθηκε στο Back Office: ${r.assignee}.` : 'Παραδόθηκε στο Back Office (δεν έχει οριστεί υπεύθυνος — το βλέπει όλη η ομάδα).', r.assignee ? 'ok' : 'warn');
            }}>Παράδοση στο Back Office</button>
          )}
          <button className="atx-btn atx-btn-quiet" onClick={() => setSale(null)}>Κλείσιμο</button>
        </div>
      )}

      {!loading && arrival && (
        <div className="atx-notice mt-4 flex items-center gap-3 flex-wrap" role="status" data-arrival>
          <MapPin size={16} className="shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-[180px]">
            <strong>Φτάσατε στο «{arrival.visit.case?.customer?.full_name ?? arrival.visit.case?.title ?? 'πελάτη'}»;</strong>
            <span className="block text-[12.5px] opacity-80">Περίπου {Math.round(arrival.meters)} μ από την αποθηκευμένη διεύθυνση.</span>
          </span>
          <button className="atx-btn atx-btn-primary inline-flex items-center gap-1.5" style={{ height: 40 }} disabled={busyId === arrival.visit.id}
            onClick={() => void checkIn(arrival.visit)}><LogIn size={15} /> Check In</button>
          <button className="atx-btn atx-btn-quiet" style={{ height: 40 }} onClick={() => setDismissed(d => new Set(d).add(arrival.visit.id))}>Όχι ακόμη</button>
        </div>
      )}

      {!loading && (
        <>
          <div className="atx-section">
            <div className="atx-section-head"><h2 className="atx-section-title">{g.next?.status === 'in_progress' ? 'Σε εξέλιξη' : 'Επόμενη επίσκεψη'}</h2></div>
            <div className="atx-panel" style={{ padding: 16, background: g.next ? 'linear-gradient(180deg, rgba(22,119,255,.06), #fff)' : undefined }}>
              {g.next ? <ul className="m-0 p-0 list-none">{visitCard(g.next, true)}</ul> : (
                <div className="atx-empty" style={{ padding: 24 }}><CheckCircle2 className="mx-auto mb-2" size={26} /><strong>Καμία επίσκεψη σε εκκρεμότητα</strong>Οι επισκέψεις προγραμματίζονται από το case (Επισκέψεις).</div>
              )}
            </div>
          </div>

          {restToday.length > 0 && (
            <div className="atx-section">
              <div className="atx-section-head"><h2 className="atx-section-title">Υπόλοιπες σήμερα</h2></div>
              <ul className="atx-panel m-0 p-0 list-none">{restToday.map(v => visitCard(v))}</ul>
            </div>
          )}

          {g.overdue.filter(v => v.id !== g.next?.id).length > 0 && (
            <div className="atx-section">
              <div className="atx-section-head"><h2 className="atx-section-title">Εκκρεμείς από προηγούμενες ημέρες</h2></div>
              <ul className="atx-panel m-0 p-0 list-none">{g.overdue.filter(v => v.id !== g.next?.id).map(v => visitCard(v))}</ul>
            </div>
          )}

          <div className="atx-section">
            <div className="atx-section-head">
              <h2 className="atx-section-title">Follow-ups σήμερα</h2>
              <button className="atx-link" onClick={() => go('mywork', { kind: 'followup' })}>Όλα</button>
            </div>
            <div className="atx-panel">
              {myFollowUps.length === 0 ? <div className="atx-empty" style={{ padding: 20 }}>Κανένα follow-up για σήμερα.</div> : (
                <ul className="m-0 p-0 list-none">
                  {myFollowUps.slice(0, 6).map(f => {
                    const due = new Date(f.due_at).getTime();
                    const over = due < now;
                    return (
                      <li key={f.id} className={`atx-row ${over ? 'is-overdue' : ''}`}>
                        <span className="atx-icon" aria-hidden="true"><CalendarClock size={16} /></span>
                        <button className="atx-row-main" onClick={() => openCase(f.case_id)}>
                          <span className="atx-row-title">{f.case?.customer?.full_name ?? f.case?.title ?? 'Follow-up'}</span>
                          <span className="atx-row-sub">{f.reason}</span>
                        </button>
                        <span className="atx-row-when">{formatWhen({ kind: 'followup', bucket: over ? 'overdue' : 'today', due, since: null }, now)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {g.doneToday.length > 0 && (
            <div className="atx-section">
              <div className="atx-section-head"><h2 className="atx-section-title">Ολοκληρώθηκαν σήμερα</h2></div>
              <ul className="atx-panel m-0 p-0 list-none">
                {g.doneToday.map(v => (
                  <li key={v.id} className="atx-row">
                    <span className="atx-icon" aria-hidden="true" style={{ color: 'var(--atx-green)' }}><CheckCircle2 size={16} /></span>
                    <button className="atx-row-main" onClick={() => openCase(v.case_id)}>
                      <span className="atx-row-title">{v.case?.customer?.full_name ?? 'Επίσκεψη'}</span>
                      <span className="atx-row-sub">{v.result || 'Χωρίς καταγεγραμμένο αποτέλεσμα'}</span>
                    </button>
                    <span className="atx-row-when">{v.ended_at ? fmtTime(v.ended_at) : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {g.upcoming.length > 0 && (
            <div className="atx-section">
              <div className="atx-section-head"><h2 className="atx-section-title">Προσεχώς</h2></div>
              <ul className="atx-panel m-0 p-0 list-none">
                {g.upcoming.slice(0, 5).map(v => (
                  <li key={v.id} className="atx-row">
                    <span className="atx-icon" aria-hidden="true"><MapPin size={16} /></span>
                    <button className="atx-row-main" onClick={() => openCase(v.case_id)}>
                      <span className="atx-row-title">{v.case?.customer?.full_name ?? 'Επίσκεψη'}</span>
                      <span className="atx-row-sub">{v.purpose || 'Επίσκεψη'}</span>
                    </button>
                    <span className="atx-row-when">{v.scheduled_at ? new Date(v.scheduled_at).toLocaleString('el-GR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="atx-section">
            <div className="atx-section-head"><h2 className="atx-section-title">{near.sorted ? 'Κοντά σας' : 'Cases με αποθηκευμένη θέση'}</h2></div>
            <div className="atx-panel">
              {near.items.length === 0 ? <div className="atx-empty" style={{ padding: 20 }}>Κανένα case με αποθηκευμένη θέση.</div> : (
                <ul className="m-0 p-0 list-none">
                  {near.items.map(({ c, km }) => (
                    <li key={c.id} className="atx-row">
                      <span className="atx-icon" aria-hidden="true"><MapPin size={16} /></span>
                      <button className="atx-row-main" onClick={() => openCase(c.id)}>
                        <span className="atx-row-title">{c.customer?.full_name ?? c.title}</span>
                        <span className="atx-row-sub">{serviceLabel(c.service_type)} · {stageText(c.current_stage)}{c.address ? ` · ${c.address}` : ''}</span>
                      </button>
                      <span className="atx-row-when">{km != null ? formatDistance(km) : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
