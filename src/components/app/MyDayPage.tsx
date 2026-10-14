/* Ημέρα μου — mobile-first field workflow: next visit → navigate / call → Check In → outcome + notes →
   next follow-up → Check Out. Check-in/out use the existing server-validated RPCs (geofence, idempotency, audit);
   success is shown only when the server accepts. Offline actions keep using the existing queue.
   GPS fallback: the server does not accept a check-in without GPS, so the fallback is an explicitly labelled
   case note («Επίσκεψη χωρίς επιβεβαίωση GPS»), never a fake check-in. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, LogIn, LogOut, MapPin, Navigation, Phone, RefreshCw, Route } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { SERVICES, can } from '@/lib/roles';
import {
  addActivity, createFollowUp, fetchCases, fetchFollowUps, fetchTimeline, fetchVisits, fieldCheckin, fieldCheckout, updateVisitNotes,
} from '@/lib/api';
import type { Case, CaseVisit, FollowUp } from '@/lib/api';
import { GEO_ERRORS, getCurrentLocation } from '@/lib/geo/location';
import type { GeoErrorCode, UserLocation } from '@/lib/geo/location';
import { formatDistance, durationMinutes, distanceKm } from '@/lib/geo/distance';
import { enqueue, countQueue, isOnline } from '@/lib/offline/queue';
import { flushQueue } from '@/lib/offline/sync';
import { useToast } from '@/lib/toast';
import { fmtTime, todayLabel } from '@/lib/ui';
import { checkoutNote, groupVisits, nearestCases, VISIT_OUTCOMES } from '@/lib/field-day';
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
  const [form, setForm] = useState({ outcome: '', notes: '', fuAt: '', fuReason: '' });
  const [fallback, setFallback] = useState<Fallback | null>(null);
  const [now, setNow] = useState(() => Date.now());

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

  const getCoords = async () => { try { return await getCurrentLocation(); } catch { return undefined; } };

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
      toast(res.code === 'IDEMPOTENT' ? (res.message ?? 'Έχει ήδη γίνει Check In.') : 'Check In ✓', 'ok');
      setOpenId(v.id); setForm({ outcome: '', notes: '', fuAt: '', fuReason: '' }); void load();
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
    const note = checkoutNote(form.outcome, form.notes);
    if (!isOnline()) {
      enqueue('check_out', { visitId: v.id, coords: c, notes: note });
      toast(`Εκτός σύνδεσης — το Check Out θα σταλεί αργότερα.${form.fuAt ? ' Το follow-up δεν αποθηκεύτηκε· καταχωρήστε το όταν έχετε σύνδεση.' : ''}`, 'warn');
      setQueued(countQueue()); setBusyId(null); setOpenId(null); return;
    }
    const res = await fieldCheckout(v.id, c, note);
    if (!res.accepted) { setBusyId(null); toast(res.message ?? 'Το Check Out απέτυχε. Δοκιμάστε ξανά.', 'bad'); return; }
    await updateVisitNotes(v.id, form.notes.trim(), form.outcome);
    let fuOk = true;
    if (form.fuAt) {
      const fu = await createFollowUp({ case_id: v.case_id, due_at: new Date(form.fuAt).toISOString(), channel: 'phone', reason: form.fuReason.trim() || `Μετά την επίσκεψη: ${form.outcome}`, priority: 'normal' });
      fuOk = !!fu;
    }
    setBusyId(null); setOpenId(null);
    toast(fuOk ? 'Check Out ✓ — η επίσκεψη ολοκληρώθηκε' : 'Check Out ✓ — αλλά το follow-up δεν αποθηκεύτηκε, δοκιμάστε από το case.', fuOk ? 'ok' : 'warn');
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
        <div className="flex items-start gap-3 w-full">
          <span className="atx-icon" aria-hidden="true"><MapPin size={16} /></span>
          <button className="atx-row-main" onClick={() => setOpenId(openId === v.id ? null : v.id)} aria-expanded={expanded}>
            <span className="atx-row-title" style={hero ? { fontSize: 19 } : undefined}>{name}</span>
            <span className="atx-row-sub" style={{ whiteSpace: 'normal' }}>
              {[v.scheduled_at ? fmtTime(v.scheduled_at) : 'Χωρίς ώρα', v.purpose || 'Επίσκεψη', v.case?.case_no, km != null ? `${formatDistance(km)} · ~${durationMinutes(km)}′` : null].filter(Boolean).join(' · ')}
            </span>
          </button>
          <span className={`atx-tag ${inProgress ? 't-info' : ''}`}>{inProgress ? 'Σε εξέλιξη' : 'Προγραμματισμένη'}</span>
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
                  {VISIT_OUTCOMES.map(o => (
                    <button key={o} role="radio" aria-checked={form.outcome === o} className="atx-chip" aria-pressed={form.outcome === o} style={{ height: 38 }}
                      onClick={() => setForm(f => ({ ...f, outcome: o }))}>{o}</button>
                  ))}
                </div>
                <textarea className="field" rows={3} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Σημειώσεις επίσκεψης (έγγραφα που συλλέχθηκαν, τι συμφωνήθηκε…)" aria-label="Σημειώσεις επίσκεψης" />
                <div className="grid sm:grid-cols-2 gap-2">
                  <label className="text-[13px] font-medium">Επόμενο follow-up (προαιρετικό)
                    <input type="datetime-local" className="field mt-1" value={form.fuAt} onChange={e => setForm(f => ({ ...f, fuAt: e.target.value }))} />
                  </label>
                  <label className="text-[13px] font-medium">Αιτία follow-up
                    <input className="field mt-1" value={form.fuReason} onChange={e => setForm(f => ({ ...f, fuReason: e.target.value }))} placeholder="π.χ. Αποστολή υπογεγραμμένης αίτησης" />
                  </label>
                </div>
                <button className="atx-btn atx-btn-primary inline-flex items-center gap-1.5 justify-center" style={{ height: 44 }} disabled={!form.outcome || busyId === v.id} onClick={() => void checkOut(v)}>
                  <LogOut size={15} /> {busyId === v.id ? 'Αποστολή…' : form.outcome ? 'Check Out' : 'Επιλέξτε αποτέλεσμα'}
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
                        <span className="atx-row-sub">{SERVICES[c.service_type] ?? c.service_type} · {stageText(c.current_stage)}{c.address ? ` · ${c.address}` : ''}</span>
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
