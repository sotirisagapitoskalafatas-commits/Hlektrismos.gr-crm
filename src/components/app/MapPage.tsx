import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNav } from '@/lib/nav';
import { useAuth } from '@/lib/auth';
import { ACTIVE_STAGES, BACK_OFFICE_STAGES, SERVICES, stageLabel } from '@/lib/roles';
import { fieldAllowed, fieldDecision } from '@/lib/field-sales/policy';
import { Case, CaseVisit, FollowUp, fetchAllCaseStats, fetchCases, fetchFollowUps, fetchLeads, fetchVisits, fetchFieldTargets, fieldCheckin, updateLeadLocation } from '@/lib/api';
import { Btn, Card, Micro, Spinner, StagePill, fmtTime, isToday } from '@/lib/ui';
import { createMap } from '@/lib/maps/map-provider';
import type { MapCoordinate, MapProvider, MapMarkerData } from '@/lib/maps/types';
import { GEO_ERRORS, getCurrentLocation } from '@/lib/geo/location';
import type { GeoErrorCode, UserLocation } from '@/lib/geo/location';
import { geocodeAddress } from '@/lib/geo/geocoder';
import { distanceKm, formatDistance, formatDuration } from '@/lib/geo/distance';
import { planRoute } from '@/lib/routing/routing-provider';
import type { RoutePlan } from '@/lib/routing/types';
import { useToast } from '@/lib/toast';
import RoutePanel from '@/components/field-sales/RoutePanel';
import type { RouteStopInput } from '@/components/field-sales/RoutePanel';
import NavigationButton from '@/components/navigation/NavigationButton';
import type { NavigationTravelMode } from '@/lib/navigation/external-maps';
import {
  ArrowDownUp, Bike, Car, Crosshair, Footprints, LogIn, MapPin,
  Route as RouteIcon, Search, Sun, X,
} from 'lucide-react';

type FilterId = 'all' | 'active' | 'leads' | 'today' | 'followups' | 'pending_sig' | 'backoffice' | 'completed';

type TravelMode = NavigationTravelMode;
const TRAVEL_MODES: { id: TravelMode; label: string; icon: typeof Car }[] = [
  { id: 'driving', label: 'Οδήγηση', icon: Car },
  { id: 'walking', label: 'Πεζή', icon: Footprints },
  { id: 'bicycling', label: 'Ποδήλατο', icon: Bike },
];

/* Marker legend — colours mirror CASE_COLORS / marker builders below. */
const LEGEND: { label: string; color: string }[] = [
  { label: 'Εδώ είμαι', color: '#1c6f52' },
  { label: 'Ενεργό case', color: '#2f5fd8' },
  { label: 'Προς υπογραφή', color: '#d99b28' },
  { label: 'Επίσκεψη', color: '#7c3aed' },
  { label: 'Lead', color: '#15803d' },
  { label: 'Νέο / εκτός', color: '#b45309' },
];

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all', label: 'Όλα' },
  { id: 'active', label: 'Ενεργά' },
  { id: 'leads', label: 'Leads' },
  { id: 'today', label: 'Σημερινές Επισκέψεις' },
  { id: 'followups', label: 'Follow Ups' },
  { id: 'pending_sig', label: 'Προς Υπογραφή' },
  { id: 'backoffice', label: 'Back Office' },
  { id: 'completed', label: 'Ολοκληρωμένα' },
];

const CASE_COLORS: Record<string, string> = {
  new: '#d6d1ca', contacted: '#2f5fd8', offer: '#2f5fd8', application: '#2f5fd8',
  signed: '#d99b28', document_check: '#d99b28', submitted: '#d99b28',
  activation: '#1c6f52', completed: '#1c6f52', lost: '#b45309', cancelled: '#b45309',
};

type LeadRow = { id: string; name: string; phone: string | null; service: string | null; status: string | null; address: string | null; lat: number | null; lng: number | null };
type DestSuggestion = { id: string; label: string; sublabel?: string; position: MapCoordinate; kind: 'crm' | 'geocoder' };

function ll(lat?: number | null, lng?: number | null): MapCoordinate | null {
  return lat != null && lng != null ? { lat, lng } : null;
}

function casePos(c: Case): MapCoordinate | null {
  return ll(c.lat, c.lng);
}

function visitPos(c: Case | undefined, v: CaseVisit): MapCoordinate | null {
  const f = c ? casePos(c) : null;
  return f ?? ll(v.location?.lat, v.location?.lng);
}

export default function MapPage() {
  const { openCase, go, view } = useNav();
  const { role } = useAuth();
  const { toast } = useToast();
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapProvider | null>(null);
  const pickDestRef = useRef<((d: DestSuggestion) => void) | null>(null);
  const setOriginFromRef = useRef<((d: DestSuggestion) => void) | null>(null);
  const pickModeRef = useRef<null | 'origin' | 'dest'>(null);
  const [ready, setReady] = useState(false);

  const [cases, setCases] = useState<Case[]>([]);
  const [visits, setVisits] = useState<CaseVisit[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);

  const [filter, setFilter] = useState<FilterId>('all');
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);

  const [myLoc, setMyLoc] = useState<UserLocation | null>(null);
  const [locErr, setLocErr] = useState<GeoErrorCode | null>(null);
  const [locating, setLocating] = useState(false);

  const [sigPending, setSigPending] = useState<Set<string>>(new Set());

  const [mapError, setMapError] = useState<string | null>(null);
  const [mapRetry, setMapRetry] = useState(0);

  const [destQuery, setDestQuery] = useState('');
  const [destResults, setDestResults] = useState<DestSuggestion[]>([]);
  const [destSearching, setDestSearching] = useState(false);
  const [dest, setDest] = useState<DestSuggestion | null>(null);
  const [eta, setEta] = useState<RoutePlan | null>(null);
  const [etaBusy, setEtaBusy] = useState(false);
  const [pickMode, setPickMode] = useState<null | 'origin' | 'dest'>(null);
  const [checkInBusy, setCheckInBusy] = useState<string | null>(null);

  /* Explicit origin (a searched place / CRM point). When null the origin is
     the device GPS ("Η τοποθεσία μου"). Kept separate so the reverse button
     can swap the two ends like Google Maps. */
  const [originPlace, setOriginPlace] = useState<DestSuggestion | null>(null);
  const [originQuery, setOriginQuery] = useState('');
  const [originResults, setOriginResults] = useState<DestSuggestion[]>([]);
  const [originSearching, setOriginSearching] = useState(false);
  const [travelMode, setTravelMode] = useState<TravelMode>('driving');

  const origin = useMemo(
    () => (originPlace ? originPlace.position : myLoc ? { lat: myLoc.lat, lng: myLoc.lng } : null),
    [originPlace, myLoc],
  );

  const reload = useCallback(async () => {
    const [c, v, f, l] = await Promise.all([
      fetchCases({ includeDone: true }),
      fetchVisits(),
      fetchFollowUps({ status: 'all' }),
      fetchLeads(),
    ]);
    setCases(c);
    setVisits(v);
    setFollowUps(f.filter(x => x.status === 'pending'));
    setLeads(l.map(lead => ({
      id: lead.id,
      name: lead.full_name ?? lead.client_name ?? (lead.first_name && lead.last_name ? `${lead.first_name} ${lead.last_name}` : '—'),
      phone: lead.phone,
      service: lead.service_category,
      status: lead.status,
      address: lead.address ?? null,
      lat: lead.lat ?? null,
      lng: lead.lng ?? null,
    })));
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    const f = view.filters;
    if (!f) return;
    if (f.focus === 'today') setFilter('today');
    if (f.focus === 'route') { setFilter('today'); setRouteOpen(true); }
  }, [view.filters]);

  useEffect(() => {
    const el = mapEl.current;
    if (!el) return;
    let cancelled = false;
    setMapError(null);
    (async () => {
      try {
        const p = await createMap();
        if (cancelled) { p.destroy(); return; }
        await p.init(el, {
          center: { lat: 37.9838, lng: 23.7275 },
          zoom: 10,
          onMarkerClick: id => setSelectedId(id),
          onMapClick: coord => {
            setSelectedId(null);
            if (pickModeRef.current) {
              const which = pickModeRef.current;
              setPickMode(null);
              const sug: DestSuggestion = { id: `pin-${coord.lat}-${coord.lng}`, label: 'Σημείο στο χάρτη', position: coord, kind: 'geocoder' };
              if (which === 'origin') setOriginFromRef.current?.(sug);
              else pickDestRef.current?.(sug);
            }
          },
        });
        if (cancelled) { p.destroy(); return; }
        mapRef.current = p;
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          console.error('[map] init failed', err);
          setMapError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      setReady(false);
    };
  }, [mapRetry]);

  useEffect(() => {
    if (!mapRef.current) return;
    window.setTimeout(() => mapRef.current?.invalidateSize(), 300);
  }, [ready]);

  const caseById = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);
  const visitById = useMemo(() => new Map(visits.map(v => [v.id, v])), [visits]);
  const fuById = useMemo(() => new Map(followUps.map(f => [f.id, f])), [followUps]);

  const todayVisits = useMemo(() => visits.filter(v =>
    (v.scheduled_at != null && isToday(v.scheduled_at)) || (v.started_at != null && isToday(v.started_at))), [visits]);

  useEffect(() => {
    if (filter !== 'pending_sig' || sigPending.size > 0) return;
    const ids = cases.filter(c => c.lat != null && c.lng != null).map(c => c.id);
    if (ids.length === 0) return;
    let alive = true;
    (async () => {
      const stats = await fetchAllCaseStats(ids);
      if (!alive) return;
      const sp = new Set<string>();
      stats.forEach((s, id) => {
        const c = caseById.get(id);
        const awaiting = ['signed', 'document_check', 'submitted', 'activation'];
        const hasPending = s.signatures.some(sg => sg.status !== 'verified' && sg.status !== 'accepted' && sg.status !== 'approved');
        if (hasPending || (s.signatures.length === 0 && c && (awaiting.includes(c.current_stage) || c.current_stage === 'application'))) sp.add(id);
      });
      setSigPending(sp);
    })();
    return () => { alive = false; };
  }, [filter, sigPending.size, cases, caseById]);

  const runEta = useCallback(async (from: MapCoordinate, to: MapCoordinate, label?: string) => {
    setEtaBusy(true);
    setEta(null);
    try {
      const p = await planRoute([
        { id: 'origin', label: 'Εδώ είμαι', position: from },
        { id: 'dest', label: label ?? 'Προορισμός', position: to },
      ]);
      setEta(p);
      const m = mapRef.current;
      if (m?.isReady()) {
        const pts = p.polyline && p.polyline.length > 0 ? p.polyline : [from, to];
        if (pts.length > 1) m.drawRoute(pts, p.estimated ? '#b45309' : '#1c6f52');
        m.fitBounds(pts, { padding: 64, maxZoom: 13 });
      }
    } catch {
      setEta(null);
      toast('Δεν ήταν δυνατή η δρομολόγηση προς τον προορισμό.', 'bad');
    } finally { setEtaBusy(false); }
  }, [toast]);

  const pickDest = useCallback((d: DestSuggestion) => {
    setDest(d);
    setDestQuery(''); setDestResults([]); setPickMode(null);
    if (mapRef.current?.isReady()) mapRef.current.setViewport(d.position, 14);
  }, []);
  useEffect(() => { pickDestRef.current = pickDest; }, [pickDest]);

  const pickOrigin = useCallback((d: DestSuggestion) => {
    setOriginPlace(d);
    setOriginQuery(''); setOriginResults([]); setPickMode(null);
  }, []);
  useEffect(() => { setOriginFromRef.current = pickOrigin; }, [pickOrigin]);
  useEffect(() => { pickModeRef.current = pickMode; }, [pickMode]);

  /* Reverse origin ⇄ destination, like Google Maps. GPS origin becomes an
     explicit "Η τοποθεσία μου" point so it can live in the destination slot. */
  const swapEnds = useCallback(() => {
    const originSug: DestSuggestion | null = originPlace
      ?? (myLoc ? { id: 'me', label: 'Η τοποθεσία μου', position: { lat: myLoc.lat, lng: myLoc.lng }, kind: 'geocoder' } : null);
    setOriginPlace(dest);
    setDest(originSug);
  }, [originPlace, myLoc, dest]);

  /* Single source of truth for the route/ETA: recompute whenever either end
     changes and both are known; clear it otherwise. */
  useEffect(() => {
    if (!dest || !origin) { setEta(null); return; }
    void runEta(origin, dest.position, dest.label);
  }, [origin, dest, runEta]);

  /* Origin typeahead (CRM targets + geocoder), mirrors the destination search. */
  useEffect(() => {
    const qq = originQuery.trim();
    if (qq.length < 2) { setOriginResults([]); return; }
    let alive = true;
    setOriginSearching(true);
    const t = window.setTimeout(async () => {
      const [crm, geo] = await Promise.all([fetchFieldTargets(qq), geocodeAddress(qq, origin ?? undefined)]);
      if (!alive) return;
      const crmRes: DestSuggestion[] = crm.map(x => ({ id: `crm-${x.entity_type}-${x.id}`, label: x.label, sublabel: x.sublabel || x.address, position: x.position, kind: 'crm' }));
      const geoRes: DestSuggestion[] = geo.map((g, i) => ({ id: `geo-${i}`, label: g.label, position: g.position, kind: 'geocoder' }));
      setOriginResults([...crmRes.slice(0, 5), ...geoRes.slice(0, 5)]);
      setOriginSearching(false);
    }, 350);
    return () => { alive = false; window.clearTimeout(t); };
  }, [originQuery, origin]);

  const markers: MapMarkerData[] = useMemo(() => {
    const out: MapMarkerData[] = [];
    const ql = q.trim().toLowerCase();
    const matchesQ = (c: Case) => !ql ||
      (c.case_no ?? '').toLowerCase().includes(ql) ||
      (c.customer?.full_name ?? '').toLowerCase().includes(ql) ||
      (c.address ?? '').toLowerCase().includes(ql) ||
      (c.customer?.city ?? '').toLowerCase().includes(ql) ||
      (c.customer?.phone ?? '')?.includes(ql) ||
      c.title.toLowerCase().includes(ql);
    const addCase = (c: Case, size: 'sm' | 'md' | 'lg' = 'md', pulse = false) => {
      if (c.lat == null || c.lng == null) return;
      out.push({
        id: `case-${c.id}`,
        position: { lat: c.lat, lng: c.lng },
        title: c.customer?.full_name ?? c.title,
        subtitle: `${c.case_no} · ${stageLabel(c.current_stage)}`,
        color: CASE_COLORS[c.current_stage] ?? '#d6d1ca',
        size,
        pulse,
      });
    };
    let list: Case[] = [];
    switch (filter) {
      case 'all':
        list = cases;
        break;
      case 'active':
        list = cases.filter(c => ACTIVE_STAGES.includes(c.current_stage));
        break;
      case 'today': {
        const ids = new Set(todayVisits.map(v => v.case_id));
        cases.filter(c => ids.has(c.id)).forEach(c => addCase(c, 'lg', true));
        todayVisits.forEach(v => {
          const c = caseById.get(v.case_id);
          const pos = visitPos(c, v);
          if (pos) {
            out.push({
              id: `visit-${v.id}`,
              position: pos,
              title: c?.customer?.full_name ?? v.purpose ?? 'Επίσκεψη',
              subtitle: 'Σημερινή επίσκεψη',
              color: '#7c3aed',
              size: 'sm',
            });
          }
        });
        break;
      }
      case 'followups': {
        followUps.forEach(f => {
          const c = f.case_id ? caseById.get(f.case_id) : undefined;
          if (c?.lat != null && c.lng != null) {
            out.push({
              id: `fu-${f.id}`,
              position: { lat: c.lat, lng: c.lng },
              title: c.customer?.full_name ?? c.title,
              subtitle: `Follow up · ${stageLabel(c.current_stage)}`,
              color: '#d99b28',
              size: 'sm',
            });
          }
        });
        break;
      }
      case 'pending_sig':
        list = cases.filter(c => sigPending.has(c.id));
        break;
      case 'backoffice':
        list = cases.filter(c => BACK_OFFICE_STAGES.includes(c.current_stage));
        break;
      case 'completed':
        list = cases.filter(c => c.current_stage === 'completed');
        break;
      case 'leads': {
        leads.filter(l => l.lat != null && l.lng != null).forEach(l => out.push({
          id: `lead-${l.id}`, position: { lat: l.lat!, lng: l.lng! }, title: l.name, subtitle: l.status ?? 'lead', color: '#15803d', size: 'sm',
        }));
        break;
      }
    }
    if (list.length > 0 || filter === 'all' || filter === 'active' || filter === 'backoffice' || filter === 'completed' || filter === 'pending_sig') {
      list = list.filter(c => filter === 'all' || matchesQ(c));
      list.forEach(c => addCase(c));
    }
    if (ql && filter === 'today') {
      const ids = new Set(todayVisits.map(v => v.case_id));
      cases.filter(c => ids.has(c.id) && !matchesQ(c)).forEach(c => addCase(c));
    }
    if (filter !== 'leads') {
      leads.filter(l => l.lat != null && l.lng != null).forEach(l => out.push({
        id: `lead-${l.id}`, position: { lat: l.lat!, lng: l.lng! }, title: l.name, subtitle: l.status ?? 'lead', color: '#15803d', size: 'sm',
      }));
    }
    return out;
  }, [cases, filter, q, todayVisits, caseById, followUps, sigPending, leads]);

  useEffect(() => {
    const m = mapRef.current;
    if (!m || !ready) return;
    const list: MapMarkerData[] = [...markers];
    if (myLoc) {
      list.push({
        id: 'me',
        position: { lat: myLoc.lat, lng: myLoc.lng },
        title: 'Εδώ είμαι',
        subtitle: myLoc.accuracy != null ? `ακρίβεια ±${myLoc.accuracy} μ` : undefined,
        color: '#1c6f52',
        size: 'lg',
        pulse: true,
      });
    }
    m.addMarkers(list);
    if (!routeOpen && !dest) {
      m.clearRoute();
      const coords = markers.map(x => x.position);
      if (coords.length > 0) m.fitBounds(coords, { padding: 64, maxZoom: 13 });
      else if (myLoc) m.fitBounds([{ lat: myLoc.lat, lng: myLoc.lng }], { padding: 100, maxZoom: 15 });
    }
  }, [markers, myLoc, ready, routeOpen, dest]);

  const locateMe = async () => {
    setLocating(true);
    setLocErr(null);
    try {
      const l = await getCurrentLocation();
      setMyLoc(l);
      setOriginPlace(null); // GPS becomes the origin; the ETA effect recomputes.
      const m = mapRef.current;
      if (m?.isReady()) m.fitBounds([{ lat: l.lat, lng: l.lng }], { padding: 100, maxZoom: 15 });
      toast(`Η θέση σας ενημερώθηκε${l.accuracy != null ? ` (ακρίβεια ±${l.accuracy} μ)` : ''}.`, 'ok');
    } catch (e) {
      setMyLoc(null);
      const code = (e as Error).message as GeoErrorCode;
      setLocErr(code);
      toast(GEO_ERRORS[code] ?? 'Δεν είναι διαθέσιμη η θέση σας.', 'warn');
    } finally {
      setLocating(false);
    }
  };

  const doFieldCheckIn = async (v: CaseVisit) => {
    setCheckInBusy(v.id);
    let coords: { lat: number; lng: number; accuracy?: number } | undefined;
    try { const l = await getCurrentLocation(); coords = { lat: l.lat, lng: l.lng, accuracy: l.accuracy }; } catch { coords = undefined; }
    const res = await fieldCheckin(v.id, coords);
    setCheckInBusy(null);
    if (res.accepted || res.code === 'IDEMPOTENT') {
      toast(res.code === 'IDEMPOTENT' ? res.message ?? 'Έχει ήδη γίνει Check In.' : (res.message ?? 'Check In ✓'), 'ok');
      setSelectedId(null);
      await reload();
    } else {
      toast(res.message ?? 'Το Check In δεν έγινε αποδεκτό.', 'warn');
    }
  };

  const locateLead = async (l: { id: string; name: string; address: string | null }) => {
    if (!l.address) { toast('Το lead δεν έχει διεύθυνση.', 'warn'); return; }
    const gate = fieldDecision(role, 'edit_address');
    if (!gate.allowed) { toast('Δεν έχετε δικαίωμα επεξεργασίας τοποθεσίας.', 'warn'); return; }
    if (gate.gate === 'approve' && !window.confirm(`Καταχώρηση της διεύθυνσης "${l.address}" ως θέση του lead "${l.name}";`)) return;
    const geo = await geocodeAddress(l.address, origin ?? undefined);
    if (geo.length === 0) { toast(`Δεν βρέθηκε θέση για: ${l.address}`, 'warn'); return; }
    const ok = await updateLeadLocation(l.id, geo[0].position, 'geocoder');
    if (ok) { toast(`Η θέση του lead "${l.name}" καταχωρήθηκε.`, 'ok'); await reload(); }
    else toast('Αποτυχία ενημέρωσης.', 'bad');
  };

  useEffect(() => {
    const qq = destQuery.trim();
    if (qq.length < 2) { setDestResults([]); return; }
    let alive = true;
    setDestSearching(true);
    const t = window.setTimeout(async () => {
      const [crm, geo] = await Promise.all([fetchFieldTargets(qq), geocodeAddress(qq, origin ?? undefined)]);
      if (!alive) return;
      const crmRes: DestSuggestion[] = crm.map(t => ({ id: `crm-${t.entity_type}-${t.id}`, label: t.label, sublabel: t.sublabel || t.address, position: t.position, kind: 'crm' }));
      const geoRes: DestSuggestion[] = geo.map((g, i) => ({ id: `geo-${i}`, label: g.label, position: g.position, kind: 'geocoder' }));
      setDestResults([...crmRes.slice(0, 5), ...geoRes.slice(0, 5)]);
      setDestSearching(false);
    }, 350);
    return () => { alive = false; window.clearTimeout(t); };
  }, [destQuery, origin]);

  const routeStops: RouteStopInput[] = useMemo(() => todayVisits.map(v => {
    const c = caseById.get(v.case_id);
    const pos = visitPos(c, v);
    return {
      id: v.id,
      label: c?.customer?.full_name ?? v.purpose ?? 'Στάση',
      subtitle: c ? `${c.case_no} · ${c.title}` : undefined,
      lat: pos?.lat ?? 0,
      lng: pos?.lng ?? 0,
      scheduledAt: v.scheduled_at,
    };
  }).filter(s => s.lat !== 0 && !Number.isNaN(s.lat)), [todayVisits, caseById]);

  const onPlan = useCallback((plan: { polyline?: { lat: number; lng: number }[]; estimated: boolean }, ordered: { position: { lat: number; lng: number } }[]) => {
    const m = mapRef.current;
    if (!m || !m.isReady()) return;
    const points = plan.polyline && plan.polyline.length > 0 ? plan.polyline : ordered.map(o => o.position);
    if (points.length > 1) m.drawRoute(points, plan.estimated ? '#d99b28' : '#1c6f52');
    m.fitBounds(points, { padding: 64, maxZoom: 12 });
  }, []);

  const preview = useMemo(() => {
    if (!selectedId) return null;
    if (selectedId === 'me') {
      return { kind: 'me' as const };
    }
    if (selectedId.startsWith('case-')) {
      const c = caseById.get(selectedId.slice(5));
      return c ? { kind: 'case' as const, c } : null;
    }
    if (selectedId.startsWith('visit-')) {
      const v = visitById.get(selectedId.slice(6));
      return v ? { kind: 'visit' as const, v } : null;
    }
    if (selectedId.startsWith('fu-')) {
      const f = fuById.get(selectedId.slice(3));
      const c = f?.case_id ? caseById.get(f.case_id) : undefined;
      return f && c ? { kind: 'fu' as const, f, c } : null;
    }
    if (selectedId.startsWith('lead-')) {
      const l = leads.find(x => x.id === selectedId.slice(5));
      return l ? { kind: 'lead' as const, l } : null;
    }
    return null;
  }, [selectedId, caseById, visitById, fuById, leads]);

  const previewPos = useMemo(() => {
    if (!preview) return null;
    if (preview.kind === 'case') return casePos(preview.c);
    if (preview.kind === 'visit') return visitPos(caseById.get(preview.v.case_id), preview.v);
    if (preview.kind === 'fu') return casePos(preview.c);
    if (preview.kind === 'lead' && preview.l.lat != null && preview.l.lng != null) return { lat: preview.l.lat, lng: preview.l.lng } as MapCoordinate;
    return null;
  }, [preview, caseById]);

  const results = useMemo(() => {
    return markers
      .filter(m => m.id !== 'me')
      .map(m => ({
        id: m.id,
        title: m.title,
        subtitle: m.subtitle,
        color: m.color,
        distance: myLoc ? distanceKm(myLoc, m.position) : null,
      }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  }, [markers, myLoc]);

  const originLabel = originPlace ? originPlace.label : (myLoc ? 'Η τοποθεσία μου' : 'Επιλέξτε αφετηρία…');

  return (
    <div className="max-w-6xl space-y-3">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Field sales</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Χάρτης · Πωλήσεις πεδίου</h2>
        </div>
        <Btn variant="ghost" onClick={() => go('myday')}><Sun className="w-3.5 h-3.5" /> Ημέρα μου</Btn>
      </div>

      {/* Layer filters + text search of CRM points on the map */}
      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => { setFilter(f.id); setSelectedId(null); setQ(''); }}
            className={`px-3 py-1.5 text-[11px] font-mono uppercase rounded-lg border transition-colors ${filter === f.id ? 'bg-ink text-paper border-ink' : 'bg-white border-line text-ink/50 hover:text-ink'}`}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/35 z-10" />
        <input className="field !pl-10" value={q} onChange={e => setQ(e.target.value)}
          placeholder="Φιλτράρισμα σημείων: πελάτης, case, διεύθυνση ή πόλη…" />
      </div>

      {/* ============ MAP + floating navigation overlays ============ */}
      <div className="relative">
        <div ref={mapEl} className="h-[68vh] min-h-[460px] rounded-xl overflow-hidden border border-line bg-paper/40" />

        {!ready && mapError == null && (
          <div className="absolute inset-0 flex items-center justify-center"><Spinner /></div>
        )}
        {mapError != null && (
          <div className="absolute inset-0 z-30 flex items-center justify-center">
            <Card className="max-w-sm w-full m-4 text-center">
              <p className="text-sm font-semibold text-ink">Χάρτης μη διαθέσιμος</p>
              <p className="text-xs text-ink/45 mt-1 break-words">{mapError}</p>
              <div className="mt-3"><Btn onClick={() => setMapRetry(r => r + 1)}>Επανάληψη</Btn></div>
            </Card>
          </div>
        )}

        {/* Floating directions box (top) */}
        <div className="absolute top-3 left-3 right-3 sm:right-auto sm:w-[380px] z-20 card p-3 bg-white/95 backdrop-blur-md shadow-cardlg space-y-2">
          {/* Travel modes */}
          <div className="flex items-center gap-1 border-b border-line pb-2">
            {TRAVEL_MODES.map(m => (
              <button key={m.id} onClick={() => setTravelMode(m.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors ${travelMode === m.id ? 'bg-brand-100 text-brand-600' : 'text-ink/50 hover:text-ink hover:bg-ink/5'}`}
                title={m.label}>
                <m.icon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Origin */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-500 ring-2 ring-brand-200 shrink-0" aria-hidden="true" />
              <input className="field !py-1.5 !text-[13px] flex-1" value={originQuery}
                onChange={e => setOriginQuery(e.target.value)}
                placeholder={originLabel} aria-label="Αφετηρία" />
              <button onClick={locateMe} disabled={locating} title="Χρήση της τοποθεσίας μου"
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1.5 rounded-lg bg-brand-50 text-brand-600 text-[11px] font-medium hover:bg-brand-100 disabled:opacity-50">
                {locating ? <Spinner /> : <Crosshair className="w-3.5 h-3.5" />}<span className="hidden sm:inline">GPS</span>
              </button>
            </div>
            {originQuery && originResults.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-line rounded-xl shadow-cardlg z-30 max-h-60 overflow-y-auto">
                {originSearching && <div className="px-4 py-3"><Spinner /></div>}
                {originResults.map(r => (
                  <button key={r.id} className="w-full text-left px-3 py-2 hover:bg-ink/5 flex items-center gap-2" onClick={() => pickOrigin(r)}>
                    <span className={`pill text-[9px] shrink-0 ${r.kind === 'crm' ? 'bg-brand-100 text-brand-600' : 'bg-ink/10 text-ink/60'}`}>{r.kind === 'crm' ? 'CRM' : 'Χάρτης'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-ink truncate">{r.label}</span>
                      {r.sublabel && <span className="block text-[11px] text-ink/45 truncate">{r.sublabel}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {originPlace && (
              <button onClick={() => setOriginPlace(null)} className="mt-1 text-[11px] text-ink/45 hover:text-ink inline-flex items-center gap-1">
                <X className="w-3 h-3" /> Επαναφορά σε «Η τοποθεσία μου»
              </button>
            )}
          </div>

          {/* Reverse */}
          <div className="flex items-center">
            <div className="flex-1 border-t border-dashed border-line" />
            <button onClick={swapEnds} title="Αντιστροφή αφετηρίας/προορισμού"
              className="mx-2 w-7 h-7 rounded-full border border-line bg-white flex items-center justify-center text-ink/55 hover:text-brand-600 hover:border-brand-300">
              <ArrowDownUp className="w-3.5 h-3.5" />
            </button>
            <div className="flex-1 border-t border-dashed border-line" />
          </div>

          {/* Destination */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-bad-600 shrink-0" aria-hidden="true" />
              <input className="field !py-1.5 !text-[13px] flex-1" value={dest ? dest.label : destQuery}
                onChange={e => { if (dest) { setDest(null); } setDestQuery(e.target.value); }}
                placeholder="Αναζήτηση πελάτη, case, lead ή διεύθυνσης…" aria-label="Προορισμός" />
              <button onClick={() => { setPickMode(m => m === 'dest' ? null : 'dest'); toast('Πατήστε ένα σημείο στον χάρτη για προορισμό.'); }}
                title="Επιλογή σημείου στον χάρτη"
                className={`shrink-0 px-2 py-1.5 rounded-lg text-[11px] font-medium ${pickMode === 'dest' ? 'bg-brand-500 text-white' : 'bg-ink/5 text-ink/60 hover:bg-ink/10'}`}>
                Σημείο
              </button>
            </div>
            {destQuery && destResults.length > 0 && !dest && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-line rounded-xl shadow-cardlg z-30 max-h-60 overflow-y-auto">
                {destSearching && <div className="px-4 py-3"><Spinner /></div>}
                {destResults.map(r => (
                  <button key={r.id} className="w-full text-left px-3 py-2 hover:bg-ink/5 flex items-center gap-2" onClick={() => pickDest(r)}>
                    <span className={`pill text-[9px] shrink-0 ${r.kind === 'crm' ? 'bg-brand-100 text-brand-600' : 'bg-ink/10 text-ink/60'}`}>{r.kind === 'crm' ? 'CRM' : 'Χάρτης'}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-ink truncate">{r.label}</span>
                      {r.sublabel && <span className="block text-[11px] text-ink/45 truncate">{r.sublabel}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {routeStops.length >= 2 && (
            <button onClick={() => setRouteOpen(o => !o)}
              className={`w-full mt-1 inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium ${routeOpen ? 'bg-brand-100 text-brand-600' : 'bg-ink/5 text-ink/60 hover:bg-ink/10'}`}>
              <RouteIcon className="w-3.5 h-3.5" /> Δρομολόγιο ημέρας ({routeStops.length} στάσεις)
            </button>
          )}
        </div>

        {pickMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 hidden lg:block bg-ink text-paper text-[12px] px-3 py-1.5 rounded-full shadow-lg">
            Κάντε κλικ στον χάρτη για {pickMode === 'origin' ? 'αφετηρία' : 'προορισμό'}…
          </div>
        )}

        {/* Legend (desktop) */}
        <div className="hidden md:flex absolute bottom-3 left-3 z-10 card !py-2 !px-2.5 bg-white/90 backdrop-blur flex-col gap-1">
          {LEGEND.map(l => (
            <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-ink/60">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color }} /> {l.label}
            </span>
          ))}
        </div>

        {/* Locate-me FAB */}
        <button onClick={locateMe} disabled={locating} aria-label="Η τοποθεσία μου"
          className="absolute right-3 bottom-28 sm:bottom-3 z-10 w-11 h-11 rounded-full bg-white shadow-cardlg border border-line flex items-center justify-center text-brand-600 hover:bg-brand-50 disabled:opacity-60">
          {locating ? <Spinner /> : <Crosshair className="w-5 h-5" />}
        </button>

        {locErr && !myLoc && (
          <div className="absolute left-1/2 -translate-x-1/2 bottom-3 sm:bottom-auto sm:top-3 z-10 bg-bad-600 text-white text-[12px] px-3 py-1.5 rounded-full shadow-lg max-w-[90%] text-center">
            {GEO_ERRORS[locErr]}
          </div>
        )}

        {/* ---- Bottom floating card: selection preview OR route summary OR hint ---- */}
        <div className="absolute left-3 right-3 bottom-3 sm:left-auto sm:right-3 sm:w-[380px] z-20">
          {preview ? (
            <div className="card p-4 bg-white/97 backdrop-blur-md shadow-cardlg animate-fadein">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {preview.kind === 'case' && (
                    <>
                      <Micro tone="brand">{preview.c.case_no}</Micro>
                      <h3 className="text-[14px] font-semibold text-ink truncate mt-0.5">{preview.c.customer?.full_name ?? preview.c.title}</h3>
                      <p className="text-xs text-ink/45 truncate">{SERVICES[preview.c.service_type] ?? preview.c.service_type}{preview.c.address ? ` · ${preview.c.address}` : ''}</p>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        <StagePill stage={preview.c.current_stage} />
                        {myLoc && previewPos && <span className="text-[11px] text-ink/45">{formatDistance(distanceKm(myLoc, previewPos))} από εσάς</span>}
                      </div>
                    </>
                  )}
                  {preview.kind === 'visit' && (
                    <>
                      <Micro tone="brand">Επίσκεψη</Micro>
                      <h3 className="text-[14px] font-semibold text-ink truncate mt-0.5">
                        {preview.v.case?.customer?.full_name ?? caseById.get(preview.v.case_id)?.customer?.full_name ?? preview.v.purpose ?? 'Επίσκεψη'}
                      </h3>
                      <p className="text-xs text-ink/45 truncate">{preview.v.purpose}{preview.v.scheduled_at ? ` · ${fmtTime(preview.v.scheduled_at)}` : ''} · {preview.v.status === 'in_progress' ? 'σε εξέλιξη' : preview.v.status}</p>
                    </>
                  )}
                  {preview.kind === 'fu' && (
                    <>
                      <Micro tone="brand">Follow up</Micro>
                      <h3 className="text-[14px] font-semibold text-ink truncate mt-0.5">{preview.c.customer?.full_name ?? preview.c.title}</h3>
                      <p className="text-xs text-ink/45 truncate">{preview.f.reason} · {new Date(preview.f.due_at).toLocaleString('el-GR')}</p>
                    </>
                  )}
                  {preview.kind === 'lead' && (
                    <>
                      <Micro tone="ok">Lead</Micro>
                      <h3 className="text-[14px] font-semibold text-ink truncate mt-0.5">{preview.l.name}</h3>
                      <p className="text-xs text-ink/45 truncate">{preview.l.status ?? 'νέο'}{preview.l.address ? ` · ${preview.l.address}` : ''}</p>
                    </>
                  )}
                  {preview.kind === 'me' && (
                    <>
                      <Micro tone="brand">GPS</Micro>
                      <h3 className="text-[14px] font-semibold text-ink mt-0.5">Εδώ είμαι</h3>
                      <p className="text-xs text-ink/45">
                        {myLoc ? `${myLoc.lat.toFixed(5)}, ${myLoc.lng.toFixed(5)}${myLoc.accuracy != null ? ` · ±${myLoc.accuracy} μ` : ''}` : ''}
                      </p>
                    </>
                  )}
                </div>
                <button onClick={() => setSelectedId(null)} aria-label="Κλείσιμο προεπισκόπησης"
                  className="text-ink/40 hover:text-ink p-1 rounded-md hover:bg-ink/5 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                {preview.kind === 'case' && (
                  <>
                    <Btn onClick={() => openCase(preview.c.id)}><MapPin className="w-3.5 h-3.5" /> Άνοιγμα Case</Btn>
                    {previewPos && <Btn variant="outline" onClick={() => pickDest({ id: `case-${preview.c.id}`, label: preview.c.customer?.full_name ?? preview.c.title, position: previewPos, kind: 'crm' })}><RouteIcon className="w-3.5 h-3.5" /> Διαδρομή</Btn>}
                    {previewPos && <NavigationButton destination={previewPos} origin={origin} caseId={preview.c.id} label="Πλοήγηση" showSelector={false} travelMode={travelMode} />}
                  </>
                )}
                {preview.kind === 'visit' && (
                  <>
                    <Btn onClick={() => preview.v.case_id && openCase(preview.v.case_id)}>Άνοιγμα Case</Btn>
                    {previewPos && <NavigationButton destination={previewPos} origin={origin} caseId={preview.v.case_id ?? undefined} label="Πλοήγηση" showSelector={false} travelMode={travelMode} />}
                    {preview.v.status === 'planned' && fieldAllowed(role, 'check_in') && (
                      <Btn variant="ok" onClick={() => doFieldCheckIn(preview.v)} disabled={checkInBusy === preview.v.id}>
                        {checkInBusy === preview.v.id ? <Spinner /> : <LogIn className="w-3.5 h-3.5" />} Check In
                      </Btn>
                    )}
                  </>
                )}
                {preview.kind === 'fu' && (
                  <Btn onClick={() => openCase(preview.c.id)}>Άνοιγμα Case</Btn>
                )}
                {preview.kind === 'lead' && (
                  <>
                    {preview.l.lat != null && preview.l.lng != null && (
                      <NavigationButton destination={{ lat: preview.l.lat, lng: preview.l.lng, label: preview.l.name }} origin={origin} label="Πλοήγηση" showSelector={false} travelMode={travelMode} />
                    )}
                    {preview.l.lat == null && preview.l.address && (
                      <Btn variant="brand" onClick={() => locateLead(preview.l)}>
                        <MapPin className="w-3.5 h-3.5" /> Καταχώρηση στον χάρτη
                      </Btn>
                    )}
                  </>
                )}
                {preview.kind === 'me' && (
                  <Btn variant="outline" onClick={() => setMyLoc(null)}>Απόκρυψη θέσης</Btn>
                )}
              </div>
            </div>
          ) : dest ? (
            <div className="card p-4 bg-white/97 backdrop-blur-md shadow-cardlg animate-fadein">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Micro tone="brand">Προορισμός</Micro>
                  <h3 className="text-[14px] font-semibold text-ink truncate mt-0.5">{dest.label}</h3>
                </div>
                <button onClick={() => { setDest(null); setEta(null); mapRef.current?.clearRoute(); }}
                  className="text-ink/40 hover:text-ink p-1 rounded-md hover:bg-ink/5 shrink-0" aria-label="Καθαρισμός προορισμού">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {etaBusy && (
                <div className="mt-2 flex items-center gap-2"><Spinner /><span className="text-xs text-ink/45">Υπολογισμός διαδρομής…</span></div>
              )}
              {eta && !etaBusy && (
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-bold text-ink tabular-nums">{formatDuration(eta.totalDurationSeconds)}</span>
                    <span className="text-[13px] text-ink/55">· {formatDistance(eta.totalDistanceMeters / 1000)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                    <span className={`pill ${eta.estimated ? 'bg-warn-100 text-warn-600' : 'bg-ok-100 text-ok-600'}`}>
                      {eta.source === 'osrm' ? 'OSRM' : eta.source === 'ors' ? 'openrouteservice' : 'εκτίμηση ευθείας'}
                    </span>
                    {!origin && <span className="text-warn-600">Χωρίς αφετηρία — πατήστε GPS για ΕΚΑ</span>}
                    {eta.error && <span className="text-warn-600 truncate">{eta.error}</span>}
                  </div>
                </div>
              )}
              {!origin && !etaBusy && (
                <p className="mt-2 text-[11px] text-warn-600">Δεν υπάρχει αφετηρία. Πατήστε «GPS» ή ορίστε σημείο εκκίνησης.</p>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <Btn variant="outline" onClick={() => origin && runEta(origin, dest.position, dest.label)} disabled={!origin || etaBusy}>
                  <RouteIcon className="w-3.5 h-3.5" /> Προεπισκόπηση
                </Btn>
                <NavigationButton destination={{ ...dest.position, label: dest.label }} origin={origin} label="Πλοήγηση" showSelector={false} travelMode={travelMode} className="w-full justify-center" />
              </div>
            </div>
          ) : (
            <div className="card !py-2.5 !px-3 bg-white/90 backdrop-blur text-center text-[12px] text-ink/50">
              {results.length > 0
                ? 'Επιλέξτε σημείο στον χάρτη ή αναζητήστε προορισμό για διαδρομή.'
                : 'Δεν υπάρχουν CRM σημεία σε αυτό το φίλτρο. Αναζητήστε πελάτη, διεύθυνση ή σημείο.'}
            </div>
          )}
        </div>
      </div>

      {/* Results list (below the map — the map stays primary) */}
      <Card className="!p-0" pad={false}>
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <Micro tone="brand">Σημεία στον χάρτη</Micro>
          <span className="pill bg-ink/10 text-ink/70">{results.length}</span>
        </div>
        <div className="max-h-[40vh] overflow-y-auto divide-y divide-line">
          {results.map(r => (
            <button key={r.id} onClick={() => setSelectedId(r.id)}
              className={`w-full text-left px-4 py-2.5 transition-colors flex items-center gap-2.5 ${selectedId === r.id ? 'bg-brand-50' : 'hover:bg-ink/[0.03]'}`}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-ink truncate">{r.title}</span>
                {r.subtitle && <span className="block text-xs text-ink/45 truncate">{r.subtitle}</span>}
              </span>
              {r.distance != null && <span className="text-[11px] text-ink/45 shrink-0">{formatDistance(r.distance)}</span>}
            </button>
          ))}
          {results.length === 0 && (
            <p className="px-4 py-4 text-xs text-ink/40">Δεν βρέθηκαν σημεία για το επιλεγμένο φίλτρο. Προσθέστε lat/lng στο case ή χρησιμοποιήστε το Check In για GPS.</p>
          )}
        </div>
      </Card>

      {filter === 'leads' && (
        <Card className="!p-0" pad={false}>
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div>
              <Micro tone="brand">Leads</Micro>
              <h3 className="text-[15px] font-semibold text-ink tracking-tight mt-0.5">Ουρά Leads ({leads.length})</h3>
            </div>
            <Btn variant="outline" onClick={() => go('leads')}>Όλα τα leads</Btn>
          </div>
          <p className="px-5 pb-3 text-xs text-ink/45">
            Εμφανίζονται στον χάρτη όταν έχουν αποθηκευμένη θέση. Κάντε κλικ στο «✚» για γεωκωδικοποίηση διεύθυνσης.
          </p>
          <div className="divide-y divide-line">
            {leads.slice(0, 8).map(l => (
              <div key={l.id} className="w-full px-5 py-3 hover:bg-ink/[0.03] transition-colors flex items-center gap-3">
                <span className="flex-1 min-w-0">
                  <button onClick={() => { setSelectedId(`lead-${l.id}`); setFilter('all'); }}
                    className="block w-full text-left text-[13px] font-medium text-ink truncate hover:text-brand-600">
                    {l.name}
                  </button>
                  <span className="block text-xs text-ink/45 truncate">{l.service ?? '—'}{l.phone ? ` · ${l.phone}` : ''}</span>
                </span>
                <span className="text-[11px] font-mono uppercase text-ink/40 shrink-0">{l.status ?? 'νέο'}</span>
                {l.lat != null && l.lng != null ? (
                  <span className="pill bg-ok-100 text-ok-600 shrink-0">✓ στον χάρτη</span>
                ) : (
                  <button onClick={() => locateLead(l)} aria-label={`Γεωκωδικοποίηση θέσης για ${l.name}`}
                    className="text-brand-600 hover:bg-brand-50 p-1 rounded-md shrink-0">✚</button>
                )}
              </div>
            ))}
            {leads.length === 0 && <p className="px-5 py-4 text-xs text-ink/40">Δεν υπάρχουν leads.</p>}
          </div>
        </Card>
      )}

      {routeOpen && (
        <RoutePanel
          stops={routeStops}
          onPlan={onPlan}
          onClose={() => setRouteOpen(false)}
        />
      )}
    </div>
  );
}
