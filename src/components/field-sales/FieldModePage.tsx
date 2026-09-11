/* ------------------------------------------------------------------ */
/*  FieldModePage — mobile-first FIELD MODE for field_sales.           */
/*  A guided 8-step sequence (NOT compressed desktop):                 */
/*   Ημέρα μου → Επόμενη ενέργεια → Χάρτης → Πελάτης → Case →          */
/*   Check-in → Έγγραφα → Επικοινωνία.                                 */
/*  Reuses the existing api / geo / offline-queue / maps / documents   */
/*  plumbing — no fabricated data sources.                             */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { SERVICES, can } from '@/lib/roles';
import type { Role } from '@/lib/roles';
import {
  Case, CaseDocument, CaseVisit, FollowUp, addActivity, addDocument,
  checkInVisit, checkOutVisit, fetchCases, fetchDocuments, fetchFollowUps,
  fetchVisits, getDocumentUrl, uploadDocumentFile,
} from '@/lib/api';
import { Btn, Card, EmptyState, Micro, Spinner, StagePill, fmtTime, isToday, timeUntil, todayLabel } from '@/lib/ui';
import { GEO_ERRORS, getCurrentLocation } from '@/lib/geo/location';
import type { GeoErrorCode, UserLocation } from '@/lib/geo/location';
import { distanceKm, durationMinutes, formatDistance } from '@/lib/geo/distance';
import { openNavigation } from '@/lib/maps/navigate';
import { createMap } from '@/lib/maps/map-provider';
import type { MapCoordinate, MapMarkerData, MapProvider } from '@/lib/maps/types';
import { enqueue, countQueue, isOnline } from '@/lib/offline/queue';
import { flushQueue } from '@/lib/offline/sync';
import { useToast } from '@/lib/toast';
import RoutePanel from '@/components/field-sales/RoutePanel';
import type { RouteStopInput } from '@/components/field-sales/RoutePanel';
import CaptureModal from '@/components/app/CaptureModal';
import {
  CalendarClock, Camera, CheckCircle2, ChevronRight, Compass, FileText,
  LogIn, LogOut, Mail, MapPin, Navigation, Phone, Plus, RefreshCw,
} from 'lucide-react';

const STEPS = ['Ημέρα μου', 'Επόμενη ενέργεια', 'Χάρτης', 'Πελάτης', 'Case', 'Check-in', 'Έγγραφα', 'Επικοινωνία'] as const;

const DOC_CATEGORIES = ['Ταυτότητα', 'Λογαριασμός ρεύματος', 'Δικαιολογητικά', 'Σύμβαση', 'Λοιπά'] as const;

function ll(lat?: number | null, lng?: number | null): MapCoordinate | null {
  return lat != null && lng != null ? { lat, lng } : null;
}

function telHref(phone: string | null): string | null {
  return phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null;
}

function waHref(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits.startsWith('30') ? digits : `30${digits}`}`;
}

function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/* ---------------- Embedded map (single target + user location) ---------------- */
function FieldMap({ coord, label, myLoc }: {
  coord: MapCoordinate | null; label?: string; myLoc: UserLocation | null;
}) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapProvider | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await createMap();
        if (cancelled) { p.destroy(); return; }
        await p.init(node, { center: coord ?? { lat: 37.9838, lng: 23.7275 }, zoom: 14 });
        if (cancelled) { p.destroy(); return; }
        mapRef.current = p;
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, [coord]);

  useEffect(() => {
    const p = mapRef.current;
    if (!p) return;
    const t = window.setTimeout(() => p.invalidateSize(), 300);
    p.clearMarkers();
    const markers: MapMarkerData[] = [];
    if (myLoc) markers.push({ id: 'me', position: myLoc, title: 'Εσείς', color: '#3B82F6', pulse: true });
    if (coord) markers.push({ id: 'target', position: coord, title: label ?? 'Στόχος', color: '#22C55E', size: 'lg' });
    p.addMarkers(markers);
    if (coord) p.fitBounds(myLoc ? [myLoc, coord] : [coord], { padding: 60 });
    else if (myLoc) p.setViewport(myLoc, 14);
    return () => window.clearTimeout(t);
  }, [coord, label, myLoc]);

  if (err) {
    return <div className="text-xs text-bad-600 p-4 rounded-xl border border-bad-200 bg-bad-100/40">Ο χάρτης δεν είναι διαθέσιμος: {err}</div>;
  }
  return <div ref={el} className="w-full h-64 rounded-xl overflow-hidden border border-line bg-paper/50" />;
}

/* ---------------- Stepper chips ---------------- */
function Stepper({ step, onGo }: { step: number; onGo: (i: number) => void }) {
  return (
    <div className="field-step-scroll flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
      {STEPS.map((s, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <button key={s} onClick={() => onGo(i)}
            className={`flex items-center gap-1.5 shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
              active ? 'bg-brand-600 text-white'
              : done ? 'bg-ok-100 text-ok-600'
              : 'bg-ink/5 text-ink/50'
            }`}>
            {done ? <span className="w-3.5 h-3.5 rounded-full bg-ok-600 text-white grid place-items-center text-[8px]">✓</span>
              : <span className={`w-3.5 h-3.5 rounded-full grid place-items-center text-[9px] ${active ? 'bg-white/20' : 'bg-ink/10'}`}>{i + 1}</span>}
            {s}
          </button>
        );
      })}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 text-[13px]">
      <span className="w-24 shrink-0 text-ink/40 text-xs pt-0.5">{label}</span>
      <span className="flex-1 text-ink/80 font-medium min-w-0">{value}</span>
    </div>
  );
}

export default function FieldModePage() {
  const { role } = useAuth();
  const { openCase } = useNav();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [visits, setVisits] = useState<CaseVisit[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | null>(null);
  const [loc, setLoc] = useState<UserLocation | null>(null);
  const [locErr, setLocErr] = useState<GeoErrorCode | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [queued, setQueued] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const [redirect, setRedirect] = useState<Record<string, string>>({});
  const [docCat, setDocCat] = useState<(typeof DOC_CATEGORIES)[number]>('Λογαριασμός ρεύματος');
  const [docDesc, setDocDesc] = useState('');
  const [captureOpen, setCaptureOpen] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [routeOpen, setRouteOpen] = useState(false);

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

  const loadDocs = useCallback(async (caseId: string) => {
    const d = await fetchDocuments(caseId);
    setDocs(d);
    const resolved: Record<string, string> = {};
    await Promise.all(d.map(async doc => {
      const u = await getDocumentUrl(doc.file_url);
      if (u) resolved[doc.id] = u;
    }));
    setRedirect(resolved);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setQueued(countQueue()); }, []);

  const caseById = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);

  const visitCoords = useCallback((v: CaseVisit): MapCoordinate | null => {
    const c = caseById.get(v.case_id);
    const p = ll(c?.lat, c?.lng) ?? ll(v.location?.lat, v.location?.lng);
    return p;
  }, [caseById]);

  const selectedVisit = useMemo(
    () => visits.find(v => v.id === selId) ?? null,
    [visits, selId],
  );
  const selCase = useMemo(
    () => (selectedVisit?.case_id ? caseById.get(selectedVisit.case_id) ?? null : null),
    [selectedVisit, caseById],
  );
  const selCaseId = selectedVisit?.case_id ?? null;
  useEffect(() => {
    if (step === 6 && selCaseId) void loadDocs(selCaseId);
  }, [step, selCaseId, loadDocs]);
  const selCoord = useMemo(() => ll(selCase?.lat, selCase?.lng), [selCase]);
  const cust = useMemo(
    () => selectedVisit?.case?.customer ?? selCase?.customer ?? null,
    [selectedVisit, selCase],
  );

  // Visit lists
  const todayVisits = useMemo(() => visits
    .filter(v => v.status === 'planned' || v.status === 'in_progress')
    .sort((a, b) => +(a.scheduled_at ?? a.created_at) - +(b.scheduled_at ?? b.created_at)), [visits]);
  const doneToday = useMemo(() => visits.filter(v => v.status === 'completed' && v.ended_at && isToday(v.ended_at)), [visits]);
  const now = new Date();
  const overdueFU = followUps.filter(f => new Date(f.due_at) < now)
    .sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));

  const distTo = useCallback((v: CaseVisit): number | null => {
    const c = visitCoords(v);
    if (!loc || !c) return null;
    return distanceKm(loc, c);
  }, [loc, visitCoords]);

  // Smart "next action": nearest upcoming visit by GPS when location is known.
  const smartNext = useMemo(() => {
    let best: CaseVisit | null = null;
    let bestD = Infinity;
    for (const v of todayVisits) {
      const c = visitCoords(v);
      if (!loc || !c) continue;
      const d = distanceKm(loc, c);
      if (d < bestD) { bestD = d; best = v; }
    }
    return best ?? todayVisits[0] ?? null;
  }, [loc, todayVisits, visitCoords]);

  const routeStops = useMemo<RouteStopInput[]>(() => {
    const out: RouteStopInput[] = [];
    for (const v of todayVisits) {
      const p = visitCoords(v);
      const c = caseById.get(v.case_id);
      if (!p) continue;
      out.push({
        id: v.id,
        label: v.case?.customer?.full_name ?? 'Επίσκεψη',
        subtitle: c?.address ?? c?.title ?? undefined,
        lat: p.lat, lng: p.lng,
        scheduledAt: v.scheduled_at,
      });
    }
    return out;
  }, [todayVisits, visitCoords, caseById]);

  const locate = useCallback(async (silent = false) => {
    setLocErr(null);
    setLocBusy(true);
    try {
      setLoc(await getCurrentLocation());
    } catch (e) {
      const code = (e as Error).message as GeoErrorCode;
      setLoc(null);
      setLocErr(code);
      if (!silent) toast(GEO_ERRORS[code] ?? 'Δεν είναι διαθέσιμη η θέση σας.', 'warn');
    } finally {
      setLocBusy(false);
    }
  }, [toast]);

  useEffect(() => { void locate(true); }, [locate]);

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
    const ok = await checkInVisit(v.id, coords);
    setBusyId(null);
    if (ok) {
      toast(coords ? `Check In ✓ (ακρίβεια ±${coords.accuracy ?? '?'} μ)` : 'Check In ✓', 'ok');
      await load();
    } else {
      toast('Το Check In απέτυχε. Προσπαθήστε ξανά.', 'bad');
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
    const ok = await checkOutVisit(v.id, coords, note);
    setBusyId(null);
    setNotes('');
    if (ok) {
      toast('Check Out ✓ — Καλή συνέχεια!', 'ok');
      await load();
    } else {
      toast('Το Check Out απέτυχε. Προσπαθήστε ξανά.', 'bad');
    }
  };

  const doSync = async () => {
    setSyncing(true);
    const { done, failed } = await flushQueue();
    setQueued(countQueue());
    setSyncing(false);
    if (done > 0) toast(`Συγχρονίστηκαν ${done} ενέργειες εκτός σύνδεσης.`, 'ok');
    if (failed > 0) toast(`${failed} ενέργειες απέτυχαν — θα μείνουν στην ουρά.`, 'warn');
    void load();
  };

  const saveFile = async (f: File) => {
    if (!selCase) return;
    setSavingDoc(true);
    const up = await uploadDocumentFile(f);
    if (up) await addDocument(selCase.id, { category: docCat, file_name: up.name, file_url: up.path, mime_type: up.mime, size: up.size, description: docDesc || undefined });
    setSavingDoc(false);
    setDocDesc('');
    await loadDocs(selCase.id);
  };

  const onFile = (f: File | null) => { if (f) void saveFile(f); };

  const logCommunication = async () => {
    if (!selCase || !cust) return;
    const note = notes.trim();
    await addActivity(selCase.id, {
      role: role as Role,
      activity_type: 'communication',
      title: 'Επικοινωνία πεδίου',
      description: note || `${cust.full_name} — τηλεφωνική/WhatsApp επικοινωνία`,
    });
    toast('Καταγράφηκε η επικοινωνία στο case.', 'ok');
    setNotes('');
  };

  /* ---- render helpers per step ---- */
  const renderMyDay = () => (
    <>
      {loading && <div className="flex items-center justify-center py-16"><Spinner /></div>}
      {!loading && (
        <>
          {todayVisits.length === 0 && doneToday.length === 0 && (
            <EmptyState icon={Compass} title="Καμία επίσκεψη σήμερα"
              hint="Επιλέξτε Επόμενη ενέργεια για follow-ups ή δείτε κοντινά cases." />
          )}
          <div className="space-y-2">
            {todayVisits.map(v => {
              const d = distTo(v);
              return (
                <button key={v.id} onClick={() => { setSelId(v.id); setStep(1); }}
                  className={`w-full text-left flex items-center gap-3 p-3 rounded-xl border ${v.status === 'in_progress' ? 'border-ok-300 bg-ok-100/40' : 'border-line bg-paper/60'}`}>
                  <span className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${v.status === 'in_progress' ? 'bg-ok-100 text-ok-600' : 'bg-brand-100 text-brand-600'}`}>
                    <MapPin className="w-4 h-4" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate">{v.case?.customer?.full_name ?? '—'}</span>
                    <span className="block text-xs text-ink/45 truncate">{selCaseTitle(v)}</span>
                    <span className="block text-xs text-ink/40 truncate">{v.purpose || 'Επίσκεψη πεδίου'}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    {v.scheduled_at ? <span className="text-[13px] font-medium text-ink">{fmtTime(v.scheduled_at)}</span>
                      : <span className="text-xs text-ink/40">ανοιχτό</span>}
                    {d != null && (
                      <span className={`pill ${d < 2 ? 'bg-ok-100 text-ok-600' : d < 10 ? 'bg-warn-100 text-warn-600' : 'bg-bad-100 text-bad-600'}`}>
                        {formatDistance(d)}
                      </span>
                    )}
                    {v.status === 'in_progress' && <span className="pill bg-ok-100 text-ok-600">Σε εξέλιξη</span>}
                  </span>
                  <ChevronRight className="w-4 h-4 text-ink/30 shrink-0" />
                </button>
              );
            })}
          </div>

          {doneToday.length > 0 && (
            <div className="pt-2 space-y-1">
              {doneToday.slice(0, 3).map(v => (
                <div key={v.id} className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-ink/45">
                  <CheckCircle2 className="w-4 h-4 text-ok-600 shrink-0" />
                  <span className="flex-1 truncate">{v.case?.customer?.full_name ?? 'Επίσκεψη'}</span>
                  <span className="text-xs">{v.ended_at ? fmtTime(v.ended_at) : ''}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 space-y-2">
            <Btn variant="brand" className="w-full justify-center" onClick={() => setStep(1)}>
              Επόμενη ενέργεια <ChevronRight className="w-3.5 h-3.5" />
            </Btn>
            {overdueFU.length > 0 && (
              <div className="space-y-1.5">
                {overdueFU.slice(0, 3).map(f => (
                  <button key={f.id} onClick={() => f.case_id && openCase(f.case_id)}
                    className="w-full text-left px-3 py-2 rounded-lg text-[13px] spine spine-critical bg-bad-100/50 flex items-center gap-2.5">
                    <CalendarClock className="w-3.5 h-3.5 text-bad-600 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium text-ink truncate">{f.case?.customer?.full_name ?? '—'}</span>
                      <span className="block text-xs text-ink/45 truncate">{f.reason}</span>
                    </span>
                    <span className="text-[11px] text-bad-600 shrink-0">{timeUntil(f.due_at)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );

  const selCaseTitle = (v: CaseVisit) => {
    const c = caseById.get(v.case_id);
    return c ? `${c.case_no} · ${c.title}` : (v.case ? `${v.case.case_no} · ${v.case.title}` : '');
  };

  const renderNextAction = () => {
    const target = selectedVisit ?? smartNext;
    if (!target) {
      return (
        <EmptyState icon={Compass} title="Καμία ενέργεια"
          hint="Δεν υπάρχουν επισκέψεις ή follow-ups για σήμερα. Επιστρέψτε στην Ημέρα μου ή στην Αρχική." />
      );
    }
    const d = distTo(target);
    const c = caseById.get(target.case_id);
    return (
      <div className="space-y-3">
        <div onClick={() => setSelId(target.id)} className={selectedVisit ? 'cursor-pointer' : 'cursor-pointer'}>
          <Card className={selectedVisit ? '!border-brand-300' : undefined}>
            <div className="flex items-center justify-between">
              <Micro tone="brand">{selectedVisit ? 'Επιλεγμένη ενέργεια' : 'Προτεινόμενη (πλησιέστερη)'}</Micro>
              {target.status === 'in_progress' && <span className="pill bg-ok-100 text-ok-600">Σε εξέλιξη</span>}
            </div>
            <div className="text-[15px] font-semibold text-ink mt-1">{target.case?.customer?.full_name ?? '—'}</div>
            <div className="text-xs text-ink/45 mt-0.5">{selCaseTitle(target)}</div>
            {c?.service_type && <div className="text-xs text-ink/50 mt-0.5">{SERVICES[c.service_type] ?? c.service_type}</div>}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              {target.scheduled_at && <span className="pill bg-ink/10 text-ink/70">{fmtTime(target.scheduled_at)}</span>}
              {d != null && <span className="pill bg-brand-100 text-brand-600">~{durationMinutes(d)} λεπτά · {formatDistance(d)}</span>}
              {c?.address && <span className="text-[11px] text-ink/40">📍 {c.address}</span>}
            </div>
          </Card>
        </div>

        {todayVisits.length > 1 && (
          <div className="space-y-1">
            <Micro>Άλλες σημερινές επισκέψεις</Micro>
            {todayVisits.filter(v => v.id !== target.id).map(v => (
              <button key={v.id} onClick={() => { setSelId(v.id); }}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg bg-paper/60 border border-line">
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium text-ink truncate">{v.case?.customer?.full_name ?? '—'}</span>
                  <span className="block text-xs text-ink/45 truncate">{v.purpose || 'Επίσκεψη πεδίου'}</span>
                </span>
                {v.scheduled_at && <span className="text-xs text-ink/45">{fmtTime(v.scheduled_at)}</span>}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Btn variant="brand" onClick={() => setStep(2)}><MapPin className="w-3.5 h-3.5" /> Χάρτης</Btn>
          <Btn variant="outline" onClick={() => { const p = visitCoords(target); if (p) openNavigation(p, { label: target.case?.customer?.full_name ?? undefined }); }}>
            <Navigation className="w-3.5 h-3.5" /> Οδηγίες
          </Btn>
          <Btn variant="outline" onClick={() => setStep(3)}>Πελάτης</Btn>
          <Btn variant="outline" onClick={() => setStep(4)}>Case</Btn>
        </div>
        {can(role, 'check_in') && (
          <Btn variant="ok" className="w-full justify-center" disabled={busyId === target.id}
            onClick={() => { void doCheckIn(target); setStep(5); }}>
            {busyId === target.id ? <Spinner /> : <LogIn className="w-3.5 h-3.5" />} Ξεκινήστε επίσκεψη (Check In)
          </Btn>
        )}
      </div>
    );
  };

  const renderMap = () => (
    <div className="space-y-3">
      {selCoord ? (
        <FieldMap coord={selCoord} label={cust?.full_name ?? selCase?.title} myLoc={loc} />
      ) : (
        <div className="rounded-xl border border-line bg-paper/50 p-4 text-xs text-ink/45">
          Το case δεν έχει αποθηκευμένη γεωγραφική θέση. Επιλέξτε «Οδηγίες» για πλοήγηση με τη διεύθυνση στη Google Maps, ή ρυθμίστε τη θέση από τη λεπτομέρεια του case.
        </div>
      )}
      <div className="flex gap-2">
        <Btn variant="outline" className="flex-1 justify-center"
          onClick={() => setRouteOpen(o => !o)}>
          <Navigation className="w-3.5 h-3.5" /> {routeOpen ? 'Κλείσιμο διαδρομής' : 'Δρομολόγιο'}
        </Btn>
        {selCase?.address && (
          <Btn variant="outline" className="flex-1 justify-center"
            onClick={() => { window.open(mapsSearchUrl(selCase.address), '_blank', 'noopener'); }}>
            <MapPin className="w-3.5 h-3.5" /> Διεύθυνση
          </Btn>
        )}
      </div>
      {routeOpen && <RoutePanel stops={routeStops} />}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <Btn variant="ghost" onClick={() => setStep(1)}>Πίσω</Btn>
        <Btn variant="brand" onClick={() => setStep(5)}>Συνέχεια: Επίσκεψη <ChevronRight className="w-3.5 h-3.5" /></Btn>
      </div>
    </div>
  );

  const renderCustomer = () => {
    if (!cust) {
      return <EmptyState icon={Compass} title="Κανένα στοιχείο πελάτη" hint="Δεν βρέθηκε πελάτης για την επιλεγμένη ενέργεια." />;
    }
    const tel = telHref(cust.phone);
    const wa = waHref(cust.phone);
    const addr = [cust.address, cust.city, cust.postal_code].filter(Boolean).join(', ') || '—';
    return (
      <div className="space-y-3">
        <Card>
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-brand-100 text-brand-600 grid place-items-center text-[15px] font-bold shrink-0">
              {(cust.full_name || '?').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-ink truncate">{cust.full_name}</div>
              {cust.company && <Micro>{cust.company}</Micro>}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            <InfoRow label="Τηλέφωνο" value={cust.phone ?? '—'} />
            <InfoRow label="Email" value={cust.email ?? '—'} />
            <InfoRow label="Διεύθυνση" value={addr} />
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-2">
          {tel && <Btn variant="brand" onClick={() => { window.location.href = tel; }}><Phone className="w-3.5 h-3.5" /> Κλήση</Btn>}
          {wa && <Btn variant="ok" onClick={() => { window.open(wa, '_blank', 'noopener'); }}>WhatsApp</Btn>}
        </div>
        {cust.email && (
          <Btn variant="outline" className="w-full justify-center"
            onClick={() => { window.location.href = `mailto:${cust.email}`; }}>
            <Mail className="w-3.5 h-3.5" /> Email
          </Btn>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Btn variant="ghost" onClick={() => setStep(1)}>Πίσω</Btn>
          <Btn variant="brand" onClick={() => setStep(4)}>Συνέχεια: Case <ChevronRight className="w-3.5 h-3.5" /></Btn>
        </div>
      </div>
    );
  };

  const renderCase = () => {
    if (!selCase) {
      return <EmptyState icon={Compass} title="Κανένα case" hint="Δεν βρέθηκε case για την επιλεγμένη ενέργεια." />;
    }
    return (
      <div className="space-y-3">
        <Card>
          <div className="flex items-center justify-between">
            <Micro tone="brand">{selCase.case_no}</Micro>
            <StagePill stage={selCase.current_stage} />
          </div>
          <div className="text-[15px] font-semibold text-ink mt-1">{selCase.title}</div>
          <div className="mt-2.5 space-y-2">
            <InfoRow label="Υπηρεσία" value={SERVICES[selCase.service_type] ?? selCase.service_type} />
            {selCase.priority && <InfoRow label="Προτεραιότητα" value={selCase.priority} />}
            <InfoRow label="Διεύθυνση" value={selCase.address || '—'} />
            {selCase.program && <InfoRow label="Πρόγραμμα" value={selCase.program} />}
          </div>
          {selCase.next_action && (
            <div className="mt-3 rounded-lg bg-brand-50/60 border border-brand-100 px-3 py-2 text-[13px] text-ink/70">
              <span className="text-[11px] text-brand-600 font-medium block mb-0.5">Επόμενη ενέργεια</span>
              {selCase.next_action}
            </div>
          )}
        </Card>
        {selCase.notes && (
          <Card>
            <Micro>Σημειώσεις</Micro>
            <p className="text-[13px] text-ink/70 mt-1 whitespace-pre-wrap">{selCase.notes}</p>
          </Card>
        )}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Btn variant="ghost" onClick={() => setStep(3)}>Πίσω</Btn>
          <Btn variant="brand" onClick={() => setStep(5)}>Συνέχεια: Check In <ChevronRight className="w-3.5 h-3.5" /></Btn>
        </div>
      </div>
    );
  };

  const renderCheckin = () => {
    const v = selectedVisit;
    if (!v) {
      return <EmptyState icon={LogIn} title="Καμία ενέργεια" hint="Επιλέξτε μια επίσκεψη από την Ημέρα μου πρώτα." />;
    }
    return (
      <div className="space-y-3">
        <Card className={`!p-0 ${loc ? 'border-ok-200' : 'border-bad-200'}`} pad={false}>
          <div className="flex items-center gap-3 px-4 py-3">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${loc ? 'bg-ok-600 pulse-online' : 'bg-bad-600'}`} />
            <div className="flex-1 min-w-0">
              {loc ? (
                <>
                  <div className="text-[13px] font-medium text-ink">GPS: έτοιμο</div>
                  <div className="text-xs text-ink/45">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}{loc.accuracy != null ? ` · ±${loc.accuracy} μ` : ''}</div>
                </>
              ) : (
                <>
                  <div className="text-[13px] font-medium text-ink">LOCATION UNAVAILABLE</div>
                  <div className="text-xs text-ink/45">{locErr ? GEO_ERRORS[locErr] : 'Αναζήτηση θέσης…'}</div>
                </>
              )}
            </div>
            {locBusy ? <Spinner /> : <Btn variant="ghost" onClick={() => void locate()}><RefreshCw className="w-3.5 h-3.5" /> Θέση</Btn>}
          </div>
        </Card>

        <Card className="!p-0" pad={false}>
          <div className="px-4 py-3 flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 grid place-items-center"><MapPin className="w-4 h-4" /></span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-ink truncate">{v.case?.customer?.full_name ?? '—'}</div>
              <div className="text-xs text-ink/45 truncate">{v.purpose || 'Επίσκεψη πεδίου'}</div>
              <div className="text-[11px] text-ink/35 mt-0.5">
                {v.status === 'planned' ? 'Προγραμματισμένη' : `Σε εξέλιξη${v.started_at ? ` · από ${fmtTime(v.started_at)}` : ''}`}
              </div>
            </div>
          </div>
          <div className="px-4 pb-4 space-y-2.5">
            {v.status === 'planned' && can(role, 'check_in') && (
              <Btn variant="ok" className="w-full justify-center" disabled={busyId === v.id}
                onClick={() => void doCheckIn(v)}>
                {busyId === v.id ? <Spinner /> : <LogIn className="w-3.5 h-3.5" />} Check In
              </Btn>
            )}
            {v.status === 'in_progress' && (
              <>
                <textarea className="field w-full min-h-[80px] text-[13px]" placeholder="Σημειώσεις / αποτέλεσμα επίσκεψης…" value={notes} onChange={e => setNotes(e.target.value)} />
                {can(role, 'check_out') && (
                  <Btn variant="ok" className="w-full justify-center" disabled={busyId === v.id}
                    onClick={() => void doCheckOut(v)}>
                    {busyId === v.id ? <Spinner /> : <LogOut className="w-3.5 h-3.5" />} Check Out
                  </Btn>
                )}
              </>
            )}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Btn variant="ghost" onClick={() => setStep(4)}>Πίσω</Btn>
          <Btn variant="brand" onClick={() => setStep(6)}>Συνέχεια: Έγγραφα <ChevronRight className="w-3.5 h-3.5" /></Btn>
        </div>
      </div>
    );
  };

  const renderDocs = () => {
    if (!selCase) {
      return <EmptyState icon={FileText} title="Κανένα case" hint="Επιλέξτε μια επίσκεψη πρώτα." />;
    }
    return (
      <div className="space-y-3">
        <Card>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Micro tone="brand">Έγγραφα · {selCase.case_no}</Micro>
            <div className="flex items-center gap-1.5">
              <select value={docCat} onChange={e => setDocCat(e.target.value as (typeof DOC_CATEGORIES)[number])}
                className="text-[12px] font-medium bg-white border border-line rounded-lg px-2 py-1.5 text-ink appearance-none">
                {DOC_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="mt-2" />
          <input className="field w-full text-[12px] mb-2" placeholder="Περιγραφή (προαιρετικό)" value={docDesc} onChange={e => setDocDesc(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Btn onClick={() => setCaptureOpen(true)} disabled={savingDoc}>
              {savingDoc ? <Spinner /> : <Camera className="w-3.5 h-3.5" />} Κάμερα
            </Btn>
            <Btn onClick={() => fileRef.current?.click()} disabled={savingDoc}>
              {savingDoc ? <Spinner /> : <Plus className="w-3.5 h-3.5" />} Φόρτωση
            </Btn>
            <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" hidden onChange={e => { onFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          </div>
        </Card>

        <div className="space-y-1.5">
          {docs.length === 0 && <p className="text-xs text-ink/40 px-2 py-3">Κανένα έγγραφο ακόμα — προσθέστε το πρώτο με κάμερα ή αρχείο.</p>}
          {docs.map(d => (
            <a key={d.id} href={redirect[d.id] ?? undefined} target="_blank" rel="noreferrer"
              className="block px-3 py-2 rounded-lg bg-paper/60 border border-line flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-ink/40 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-ink truncate">{d.file_name || d.category}</span>
                <span className="block text-xs text-ink/45">{d.category}{d.size ? ` · ${(d.size / 1024).toFixed(0)} KB` : ''}</span>
              </span>
              <span className={`pill ${d.status === 'verified' ? 'bg-ok-100 text-ok-600' : d.status === 'received' ? 'bg-warn-100 text-warn-600' : 'bg-ink/10 text-ink/60'}`}>{d.status}</span>
            </a>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Btn variant="ghost" onClick={() => setStep(5)}>Πίσω</Btn>
          <Btn variant="brand" onClick={() => setStep(7)}>Συνέχεια: Επικοινωνία <ChevronRight className="w-3.5 h-3.5" /></Btn>
        </div>
      </div>
    );
  };

  const renderCommunication = () => {
    const v = selectedVisit;
    const tel = telHref(cust?.phone ?? null);
    const wa = waHref(cust?.phone ?? null);
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {tel && <Btn variant="brand" onClick={() => { window.location.href = tel; }}><Phone className="w-3.5 h-3.5" /> Κλήση</Btn>}
          {wa && <Btn variant="ok" onClick={() => { window.open(wa, '_blank', 'noopener'); }}>WhatsApp</Btn>}
        </div>
        <Card>
          <Micro>Καταγραφή επικοινωνίας</Micro>
          <textarea className="field w-full min-h-[72px] text-[13px] mt-2"
            placeholder="Τι συμφωνήθηκε / αποτέλεσμα επικοινωνίας…" value={notes} onChange={e => setNotes(e.target.value)} />
          <Btn variant="brand" className="w-full justify-center mt-2" onClick={() => void logCommunication()}>
            <RefreshCw className="w-3.5 h-3.5" /> Καταγραφή στο case
          </Btn>
        </Card>

        {overdueFU.length > 0 && (
          <Card>
            <Micro>Εκκρεμή follow-ups</Micro>
            <div className="space-y-1.5 mt-1.5">
              {overdueFU.slice(0, 3).map(f => (
                <button key={f.id} onClick={() => f.case_id && openCase(f.case_id)}
                  className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 spine spine-critical bg-bad-100/50">
                  <CalendarClock className="w-3.5 h-3.5 text-bad-600 shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate">{f.case?.customer?.full_name ?? '—'}</span>
                    <span className="block text-xs text-ink/45 truncate">{f.reason}</span>
                  </span>
                  <span className="text-[11px] text-bad-600 shrink-0">{timeUntil(f.due_at)}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1">
          <Btn variant="ghost" onClick={() => setStep(6)}>Πίσω</Btn>
          <Btn variant="brand" onClick={() => {
            if (v?.status === 'in_progress') void doCheckOut(v).then(() => setStep(0));
            else { setStep(0); setSelId(null); }
          }}>
            Ολοκλήρωση {v?.status === 'in_progress' ? '& Check Out' : ''} <ChevronRight className="w-3.5 h-3.5" />
          </Btn>
        </div>
      </div>
    );
  };

  const renderStep = () => {
    switch (step) {
      case 0: return renderMyDay();
      case 1: return renderNextAction();
      case 2: return renderMap();
      case 3: return renderCustomer();
      case 4: return renderCase();
      case 5: return renderCheckin();
      case 6: return renderDocs();
      case 7: return renderCommunication();
      default: return renderMyDay();
    }
  };

  return (
    <div className="max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Field Mode</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">{step === 0 ? `Ημέρα μου · ${todayLabel()}` : STEPS[step]}</h2>
        </div>
        {queued > 0 && (
          <Btn variant="outline" onClick={doSync} disabled={syncing} className="!px-2.5 !py-1.5 text-xs">
            {syncing ? <Spinner /> : <RefreshCw className="w-3.5 h-3.5" />} {queued}
          </Btn>
        )}
      </div>

      {/* Stepper */}
      <div className="mt-3">
        <Stepper step={step} onGo={i => { if (i <= step) setStep(i); }} />
      </div>

      {/* Active step */}
      <div className="mt-2">
        {renderStep()}
      </div>

      {/* Back to tabs */}
      {selId && step > 1 && step < 7 && (
        <div className="text-center pt-4">
          <button onClick={() => setStep(step - 1)} className="text-xs text-ink/40 hover:text-ink/70">
            ‹ Πίσω στο «{STEPS[step - 1]}»
          </button>
        </div>
      )}

      <CaptureModal open={captureOpen} title="Φωτογράφηση εγγράφου πεδίου" onClose={() => setCaptureOpen(false)} onCapture={saveFile} />
    </div>
  );
}