import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { SERVICES, can } from '@/lib/roles';
import { Case, CaseVisit, FollowUp, fieldCheckin, fieldCheckout, fetchCases, fetchFollowUps, fetchVisits } from '@/lib/api';
import { Btn, Card, CardHeader, EmptyState, Micro, Spinner, StagePill, fmtTime, isToday, timeUntil, todayLabel } from '@/lib/ui';
import { GEO_ERRORS, getCurrentLocation } from '@/lib/geo/location';
import type { GeoErrorCode, UserLocation } from '@/lib/geo/location';
import { distanceKm, durationMinutes, formatDistance } from '@/lib/geo/distance';
import { openNavigation } from '@/lib/maps/navigate';
import type { MapCoordinate } from '@/lib/maps/types';
import { enqueue, countQueue, isOnline } from '@/lib/offline/queue';
import { flushQueue } from '@/lib/offline/sync';
import { useToast } from '@/lib/toast';
import { CalendarClock, ChevronDown, Compass, LogIn, LogOut, MapPin, Navigation, RefreshCw, Sun } from 'lucide-react';

function CheckDone() {
  return (
    <span className="w-5 h-5 rounded-full bg-ok-100 text-ok-600 flex items-center justify-center">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
    </span>
  );
}

export default function MyDayPage() {
  const { role } = useAuth();
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
  const [selId, setSelId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    const [v, f, c] = await Promise.all([
      fetchVisits({ user: true }),
      fetchFollowUps({ status: 'all' }),
      fetchCases(),
    ]);
    setVisits(v);
    setFollowUps(f.filter(x => x.status === 'pending'));
    setCases(c);
    setLoading(false);
  }, []);

  const caseById = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);
  const visitCoords = useCallback((v: CaseVisit): MapCoordinate | null => {
    const c = caseById.get(v.case_id);
    if (c?.lat != null && c.lng != null) return { lat: c.lat, lng: c.lng };
    if (v.location?.lat != null && v.location.lng != null) return { lat: v.location.lat, lng: v.location.lng };
    return null;
  }, [caseById]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setQueued(countQueue()); }, []);

  const locate = useCallback(async (silent = false) => {
    setLocErr(null);
    setLocBusy(true);
    try {
      const l = await getCurrentLocation();
      setLoc(l);
    } catch (e) {
      setLoc(null);
      setLocErr((e as Error).message as GeoErrorCode);
      if (!silent) toast(GEO_ERRORS[(e as Error).message as GeoErrorCode] ?? 'Δεν είναι διαθέσιμη η θέση σας.', 'warn');
    } finally {
      setLocBusy(false);
    }
  }, [toast]);

  useEffect(() => { locate(true); }, [locate]);

  const doCheckIn = async (v: CaseVisit) => {
    setBusyId(v.id);
    let coords: { lat: number; lng: number; accuracy?: number } | undefined;
    try { coords = await getCurrentLocation(); } catch { /* coords undefined */ }
    if (!isOnline()) {
      enqueue('check_in', { visitId: v.id, coords });
      toast('Εκτός σύνδεσης — το Check In αποθηκεύτηκε για συγχρονισμό.', 'warn');
      setBusyId(null);
      setQueued(countQueue());
      return;
    }
    const res = await fieldCheckin(v.id, coords);
    setBusyId(null);
    if (res.accepted || res.code === 'IDEMPOTENT') {
      toast(res.code === 'IDEMPOTENT' ? res.message ?? 'Έχει ήδη γίνει Check In.' : (res.message ?? `Check In ✓${coords?.accuracy != null ? ` (ακρίβεια ±${Math.round(coords.accuracy)} μ)` : ''}`), 'ok');
      load();
    } else {
      toast(res.message ?? 'Το Check In δεν έγινε αποδεκτό.', 'warn');
    }
  };

  const doCheckOut = async (v: CaseVisit) => {
    setBusyId(v.id);
    let coords: { lat: number; lng: number; accuracy?: number } | undefined;
    try { coords = await getCurrentLocation(); } catch { /* coords undefined */ }
    const note = notes.trim() || undefined;
    if (!isOnline()) {
      enqueue('check_out', { visitId: v.id, coords, notes: note });
      toast('Εκτός σύνδεσης — το Check Out αποθηκεύτηκε για συγχρονισμό.', 'warn');
      setBusyId(null);
      setQueued(countQueue());
      return;
    }
    const res = await fieldCheckout(v.id, coords, note);
    setBusyId(null);
    setNotes('');
    setSelId(null);
    if (res.accepted || res.code === 'IDEMPOTENT') {
      toast(res.message ?? 'Check Out ✓ — Καλή συνέχεια!', 'ok');
      load();
    } else {
      toast(res.message ?? 'Το Check Out απέτυχε.', 'bad');
    }
  };

  const doSync = async () => {
    setSyncing(true);
    const { done, failed } = await flushQueue();
    setQueued(countQueue());
    setSyncing(false);
    if (done > 0) toast(`Συγχρονίστηκαν ${done} ενέργειες εκτός σύνδεσης.`, 'ok');
    if (failed > 0) toast(`${failed} ενέργειες απέτυχαν — θα μείνουν στην ουρά.`, 'warn');
    load();
  };

  const now = new Date();
  const todayVisits = visits.filter(v => v.status === 'planned' || v.status === 'in_progress')
    .sort((a, b) => +(a.scheduled_at ?? a.created_at) - +(b.scheduled_at ?? b.created_at));
  const doneToday = visits.filter(v => v.status === 'completed' && v.ended_at && isToday(v.ended_at));
  const overdueFU = followUps.filter(f => new Date(f.due_at) < now).sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
  const todayFU = followUps.filter(f => isToday(f.due_at) && new Date(f.due_at) >= now);
  const nearby = cases.filter(c => c.lat != null && c.lng != null).slice(0, 6);

  const distTo = (v: CaseVisit) => {
    const c = visitCoords(v);
    if (!loc || !c) return null;
    return distanceKm(loc, c);
  };

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Field sales</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Ημέρα μου · {todayLabel()}</h2>
        </div>
        <div className="flex gap-2">
          <Btn variant="outline" onClick={() => go('map', { focus: 'route' })}>
            <Navigation className="w-3.5 h-3.5" /> Δρομολόγιο
          </Btn>
          <Btn variant="outline" onClick={() => go('map', { focus: 'today' })}>
            <MapPin className="w-3.5 h-3.5" /> Χάρτης
          </Btn>
        </div>
      </div>

      {/* Location status */}
      <Card className={`!p-0 ${loc ? 'border-ok-200' : 'border-bad-200'}`} pad={false}>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${loc ? 'bg-ok-600' : 'bg-bad-600'} ${loc ? 'pulse-online' : ''}`} />
          <div className="flex-1 min-w-0">
            {loc ? (
              <>
                <div className="text-[13px] font-medium text-ink">GPS: έτοιμο</div>
                <div className="text-xs text-ink/45">
                  {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}{loc.accuracy != null ? ` · ±${loc.accuracy} μ` : ''}
                </div>
              </>
            ) : (
              <>
                <div className="text-[13px] font-medium text-ink">LOCATION UNAVAILABLE</div>
                <div className="text-xs text-ink/45">{locErr ? GEO_ERRORS[locErr] : 'Αναζήτηση θέσης…'}</div>
              </>
            )}
          </div>
          {locBusy ? <Spinner /> : (
            <Btn variant="ghost" onClick={() => locate()}><RefreshCw className="w-3.5 h-3.5" /> Θέση</Btn>
          )}
        </div>
        {queued > 0 && (
          <div className="flex items-center gap-2 px-4 pb-3">
            <span className="pill bg-warn-100 text-warn-600">{queued} ενέργεια(ες) εκτός σύνδεσης</span>
            <Btn variant="outline" onClick={doSync} disabled={syncing}>
              {syncing ? <Spinner /> : <RefreshCw className="w-3.5 h-3.5" />} Συγχρονισμός
            </Btn>
          </div>
        )}
      </Card>

      {loading && <div className="flex items-center justify-center py-24"><Spinner /></div>}
      {!loading && (
        <div className="grid lg:grid-cols-5 gap-4">
          <Card className="lg:col-span-3 !p-0" pad={false}>
            <CardHeader micro="Visits" title="Σημερινές επισκέψεις" className="px-5 pt-5"
              action={<Pill2 tone={todayVisits.length > 0 ? 'blue' : 'green'}>{todayVisits.length} μπροστά · {doneToday.length} έγιναν</Pill2>} />
            <div className="px-3 pb-3">
              {todayVisits.length === 0 && doneToday.length === 0 && (
                <EmptyState icon={Compass} title="Καμία προγραμματισμένη επίσκεψη σήμερα" hint="Προγραμματίστε επισκέψεις από το case ή επιλέξτε από τον χάρτη." />
              )}
              <div className="space-y-2">
                {todayVisits.map(v => {
                  const d = distTo(v);
                  const pos = visitCoords(v);
                  const open = selId === v.id;
                  return (
                    <div key={v.id} className={`rounded-xl border ${open ? 'border-ink/20' : 'border-line'} bg-paper/50 ${visitCoords(v) ? 'cursor-pointer' : ''}`}>
                      <button className="w-full flex items-center gap-3 p-3 flex-wrap text-left" onClick={() => setSelId(open ? null : v.id)} disabled={!v.case}>
                        <span className="w-8 h-8 rounded-lg bg-white border border-line flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4 text-ink/60" />
                        </span>
                        <span className="flex-1 min-w-[140px]">
                          <button className="block text-[13px] font-medium text-ink truncate hover:text-brand-600" onClick={e => { e.stopPropagation(); if (v.case_id) openCase(v.case_id); }}>{v.case?.customer?.full_name ?? '—'}</button>
                          <span className="block text-xs text-ink/45 truncate">{v.case ? `${v.case.case_no} · ${v.case.title}` : ''}</span>
                          <span className="block text-xs text-ink/45 truncate">{v.purpose || 'Επίσκεψη πεδίου'}</span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          {d != null ? (
                            <span className={`pill ${d < 2 ? 'bg-ok-100 text-ok-600' : d < 10 ? 'bg-warn-100 text-warn-600' : 'bg-bad-100 text-bad-600'}`}>
                              {formatDistance(d)}
                            </span>
                          ) : null}
                          {v.scheduled_at
                            ? <span className="text-[13px] font-medium text-ink">{fmtTime(v.scheduled_at)}</span>
                            : <span className="text-xs text-ink/45">χωρίς ώρα</span>}
                          <ChevronDown className={`w-4 h-4 text-ink/35 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </span>
                      </button>
                      {open && (
                        <div className="px-3 pb-3 pt-0.5 space-y-2 border-t border-line/60">
                          <div className="flex items-center gap-2 flex-wrap pt-2.5">
                            <span className="text-xs text-ink/45">{v.status === 'planned' ? 'προγραμματισμένη' : 'σε εξέλιξη'}{v.started_at ? ` · ξεκίνησε ${fmtTime(v.started_at)}` : ''}</span>
                            {d != null && <span className="text-xs text-ink/45">· ~{durationMinutes(d)} λεπτά διαδρομή</span>}
                          </div>
                          {pos && (
                            <Btn variant="outline" onClick={() => openNavigation(pos, { label: v.case?.customer?.full_name ?? undefined })}>
                              <Navigation className="w-3.5 h-3.5" /> Πλοήγηση (Google Maps)
                            </Btn>
                          )}
                          {v.status === 'in_progress' && (
                            <div>
                              <textarea className="field w-full min-h-[64px] text-[13px]" placeholder="Σημειώσεις / αποτέλεσμα επίσκεψης…" value={notes} onChange={e => setNotes(e.target.value)} />
                            </div>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            {v.status === 'planned' && can(role, 'check_in') && (
                              <Btn variant="brand" onClick={() => doCheckIn(v)} disabled={busyId === v.id}>
                                {busyId === v.id ? <Spinner /> : <LogIn className="w-3.5 h-3.5" />} Check In
                              </Btn>
                            )}
                            {v.status === 'in_progress' && can(role, 'check_out') && (
                              <Btn variant="ok" onClick={() => doCheckOut(v)} disabled={busyId === v.id}>
                                {busyId === v.id ? <Spinner /> : <LogOut className="w-3.5 h-3.5" />} Check Out
                              </Btn>
                            )}
                            {v.case_id && (
                              <Btn variant="ghost" onClick={() => openCase(v.case_id)}>Άνοιγμα Case</Btn>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {doneToday.slice(0, 3).map(v => (
                  <div key={v.id} className="flex items-center gap-3 px-3 py-2 text-[13px] text-ink/45">
                    <CheckDone /> <span className="flex-1">{v.case?.customer?.full_name ?? 'Επίσκεψη'}</span>
                    <span className="text-xs">{v.ended_at ? fmtTime(v.ended_at) : ''} ✓</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader micro="Follow ups" title="Επικοινωνίες σήμερα" action={<Btn variant="ghost" onClick={() => go('followups', { status: 'today' })}>όλα</Btn>} />
              <div className="space-y-1.5">
                {overdueFU.length === 0 && todayFU.length === 0 && (
                  <p className="text-xs text-ink/40 py-2">Κανένα follow up για σήμερα.</p>
                )}
                {[...overdueFU, ...todayFU].slice(0, 5).map(f => {
                  const over = new Date(f.due_at) < now;
                  return (
                    <button key={f.id} onClick={() => f.case_id && openCase(f.case_id)}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 shrink-0 border ${over ? 'spine spine-critical bg-bad-100/50' : 'bg-paper/60 border-line'}`}>
                      <CalendarClock className="w-3.5 h-3.5 text-ink/40 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium text-ink truncate">{f.case?.customer?.full_name ?? '—'}</span>
                        <span className="block text-xs text-ink/45 truncate">{f.reason}</span>
                      </span>
                      <span className={`text-[11px] shrink-0 ${over ? 'text-bad-600' : 'text-ink/40'}`}>{timeUntil(f.due_at)}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card>
              <CardHeader micro="Nearby" title="Κοντινά cases (GPS)" action={<Btn variant="ghost" onClick={() => go('map')}><MapPin className="w-3 h-3" /> χάρτης</Btn>} />
              <div className="space-y-1.5">
                {nearby.length === 0 && <p className="text-xs text-ink/40 py-2">Κανένα case με αποθηκευμένη θέση.</p>}
                {nearby.map(c => (
                  <button key={c.id} onClick={() => openCase(c.id)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-ink/5 flex items-center gap-2.5">
                    <Sun className="w-3.5 h-3.5 text-warn-600 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-ink truncate">{c.customer?.full_name ?? c.title}</span>
                      <span className="block text-xs text-ink/45 truncate">{SERVICES[c.service_type] ?? c.service_type}{c.address ? ` · ${c.address}` : ''}</span>
                    </span>
                    <StagePill stage={c.current_stage} />
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Pill2({ children, tone }: { children: ReactNode; tone?: string }) {
  const cls = tone === 'blue' ? 'bg-brand-100 text-brand-600' : tone === 'green' ? 'bg-ok-100 text-ok-600' : 'bg-ink/10 text-ink/70';
  return <span className={`pill ${cls}`}>{children}</span>;
}