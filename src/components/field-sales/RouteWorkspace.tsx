import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronUp, Pause, Play, Plus, RefreshCw,
  Route as RouteIcon, Save, Search, Trash2,
} from 'lucide-react';
import { Btn, Card, Micro, Spinner } from '@/lib/ui';
import { useToast } from '@/lib/toast';
import { findPotentialCRMMatches } from '@/lib/api';
import type { MapCoordinate } from '@/lib/maps/types';
import type { RoutePlan, RouteStop } from '@/lib/routing/types';
import { getOrderingProvider } from '@/lib/routing/ordering';
import RoutePanel, { type RouteStopInput } from '@/components/field-sales/RoutePanel';
import {
  deleteSavedRoute, fetchSavedRoutes, fetchSavedRouteStops, replaceSavedRouteStops,
  saveSavedRoute, updateSavedRouteStatus,
} from '@/lib/field-sales/saved-routes';
import type {
  SavedRoute, SavedRouteDraft, SavedRouteStatus, SavedRouteStopDraft, SavedRouteTravelMode,
} from '@/lib/field-sales/saved-routes';
import { discoverBusinessesAlongRoute } from '@/lib/geo/geocoder';
import type { BusinessCandidate } from '@/lib/geo/geocoder';
import { isSalesAgentRole, listStaff } from '@/lib/staff-admin';

type Props = {
  seedStops: RouteStopInput[];
  currentUserId: string;
  currentRole: string;
  origin: MapCoordinate | null;
  onPlan?: (plan: RoutePlan, ordered: RouteStop[]) => void;
  onDiscoveryChange?: (candidates: BusinessCandidate[]) => void;
  onRouteStopsChange?: (stops: SavedRouteStopDraft[]) => void;
};

function localDate(): string {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function fromSeed(stop: RouteStopInput): SavedRouteStopDraft {
  const sourceType = stop.id.startsWith('visit-') ? 'visit' : stop.id.startsWith('case-') ? 'crm' : 'manual';
  const parts = stop.id.match(/(?:visit|case|lead)-([0-9a-f-]{36})/i);
  return {
    source_type: sourceType,
    source_id: parts?.[1] ?? null,
    label: stop.label,
    subtitle: stop.subtitle ?? null,
    latitude: stop.lat,
    longitude: stop.lng,
    scheduled_at: stop.scheduledAt ?? null,
    stop_status: 'pending',
    metadata: { seeded_from_today: true },
  };
}

export default function RouteWorkspace({ seedStops, currentUserId, currentRole, origin, onPlan, onDiscoveryChange, onRouteStopsChange }: Props) {
  const { toast } = useToast();
  const canManageTeam = ['admin', 'manager', 'back_office'].includes(currentRole);
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routeName, setRouteName] = useState('Διαδρομή πεδίου');
  const [routeDate, setRouteDate] = useState(localDate());
  const [routeStatus, setRouteStatus] = useState<SavedRouteStatus>('draft');
  const [travelMode, setTravelMode] = useState<SavedRouteTravelMode>('driving');
  const [routeOwner, setRouteOwner] = useState(['admin', 'manager', 'back_office'].includes(currentRole) ? '' : currentUserId);
  const [originLabel, setOriginLabel] = useState('');
  const [originLat, setOriginLat] = useState<number | null>(origin?.lat ?? null);
  const [originLng, setOriginLng] = useState<number | null>(origin?.lng ?? null);
  const [stops, setStops] = useState<SavedRouteStopDraft[]>(() => seedStops.map(fromSeed));
  const [agents, setAgents] = useState<Array<{ id: string; full_name: string }>>([]);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [loadingStops, setLoadingStops] = useState(false);
  const [saving, setSaving] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [candidates, setCandidates] = useState<BusinessCandidate[]>([]);

  const refreshRoutes = useCallback(async (selectId?: string | null) => {
    const result = await fetchSavedRoutes({ includeArchived: true });
    setRoutes(result.rows);
    setRouteError(result.error);
    if (selectId !== undefined) setSelectedRouteId(selectId);
    return result.rows;
  }, []);

  const loadRoute = useCallback(async (route: SavedRoute) => {
    setSelectedRouteId(route.id);
    setRouteName(route.route_name);
    setRouteDate(route.route_date);
    setRouteStatus(route.status);
    setTravelMode(route.travel_mode);
    setRouteOwner(route.owner_id);
    setOriginLabel(route.origin_label ?? '');
    setOriginLat(route.origin_lat);
    setOriginLng(route.origin_lng);
    setLoadingStops(true);
    const result = await fetchSavedRouteStops(route.id);
    if (result.error) {
      setRouteError(result.error);
      setStops([]);
    } else {
      setRouteError(null);
      setStops(result.rows.map(stop => ({
        id: stop.id,
        source_type: stop.source_type,
        source_id: stop.source_id,
        label: stop.label,
        subtitle: stop.subtitle,
        address: stop.address,
        latitude: stop.latitude,
        longitude: stop.longitude,
        category: stop.category,
        source_url: stop.source_url,
        stop_status: stop.stop_status,
        scheduled_at: stop.scheduled_at,
        notes: stop.notes,
        metadata: stop.metadata ?? {},
      })));
    }
    setLoadingStops(false);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingRoutes(true);
      const result = await fetchSavedRoutes({ includeArchived: true });
      if (!alive) return;
      setRoutes(result.rows);
      if (result.error) setRouteError(result.error);
      if (canManageTeam) {
        const staff = await listStaff();
        if (!alive) return;
        const sales = staff.rows.filter(row => row.is_active && isSalesAgentRole(row.role)).map(row => ({ id: row.id, full_name: row.full_name }));
        setAgents(sales);
        if (sales.length > 0 && !sales.some(agent => agent.id === routeOwner)) setRouteOwner(sales[0].id);
        if (sales.length === 0) setRouteOwner('');
      }
      if (result.rows.length > 0) {
        const first = result.rows.find(row => row.status === 'active' || row.status === 'paused') ?? result.rows[0];
        await loadRoute(first);
      } else {
        setStops(seedStops.map(fromSeed));
      }
      setLoadingRoutes(false);
    })().catch(error => {
      if (alive) {
        setRouteError(error instanceof Error ? error.message : 'Δεν φορτώθηκαν οι διαδρομές.');
        setLoadingRoutes(false);
      }
    });
    return () => { alive = false; };
  // Initial route boot deliberately happens once; route edits are not overwritten by visit refreshes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (origin && selectedRouteId === null) {
      setOriginLat(origin.lat);
      setOriginLng(origin.lng);
      if (!originLabel) setOriginLabel('Η τοποθεσία μου / GPS');
    }
  }, [origin, selectedRouteId, originLabel]);

  const routePoints = useMemo(() => {
    const points = stops.map(stop => ({ lat: stop.latitude, lng: stop.longitude }));
    if (originLat != null && originLng != null) points.unshift({ lat: originLat, lng: originLng });
    else if (origin) points.unshift(origin);
    return points;
  }, [stops, originLat, originLng, origin]);

  useEffect(() => { onDiscoveryChange?.(candidates); }, [candidates, onDiscoveryChange]);
  useEffect(() => { onRouteStopsChange?.(stops); }, [stops, onRouteStopsChange]);

  const newRoute = () => {
    setSelectedRouteId(null);
    setRouteName('Διαδρομή πεδίου');
    setRouteDate(localDate());
    setRouteStatus('draft');
    setTravelMode('driving');
    setRouteOwner(canManageTeam ? (agents[0]?.id ?? '') : currentUserId);
    setOriginLabel(origin ? 'Η τοποθεσία μου / GPS' : '');
    setOriginLat(origin?.lat ?? null);
    setOriginLng(origin?.lng ?? null);
    setStops(seedStops.map(fromSeed));
    setCandidates([]);
    setRouteError(null);
  };

  const save = async () => {
    if (!routeName.trim()) { toast('Δώστε όνομα στη διαδρομή.', 'warn'); return; }
    if (!routeOwner || (canManageTeam && !agents.some(agent => agent.id === routeOwner))) { toast('Επιλέξτε ενεργό Sales Agent ως υπεύθυνο διαδρομής.', 'warn'); return; }
    setSaving(true);
    const draft: SavedRouteDraft = {
      id: selectedRouteId,
      owner_id: routeOwner,
      route_name: routeName.trim(),
      route_date: routeDate,
      status: routeStatus,
      travel_mode: travelMode,
      origin_lat: originLat,
      origin_lng: originLng,
      origin_label: originLabel || null,
    };
    const saved = await saveSavedRoute(draft);
    if (saved.error || !saved.row) {
      setSaving(false);
      setRouteError(saved.error ?? 'Η διαδρομή δεν αποθηκεύτηκε.');
      toast(saved.error ?? 'Η διαδρομή δεν αποθηκεύτηκε.', 'bad');
      return;
    }
    setSelectedRouteId(saved.row.id);
    const stopError = await replaceSavedRouteStops(saved.row.id, stops);
    setSaving(false);
    await refreshRoutes(saved.row.id);
    if (stopError) {
      setRouteError('Η διαδρομή αποθηκεύτηκε, αλλά οι στάσεις δεν αποθηκεύτηκαν: ' + stopError);
      toast('Η διαδρομή αποθηκεύτηκε, αλλά απέτυχε η αποθήκευση στάσεων.', 'bad');
      return;
    }
    setRouteError(null);
    toast('Η διαδρομή και οι στάσεις αποθηκεύτηκαν.', 'ok');
  };

  const changeStatus = async (status: SavedRouteStatus) => {
    if (!selectedRouteId) { setRouteStatus(status); return; }
    const error = await updateSavedRouteStatus(selectedRouteId, status);
    if (error) { setRouteError(error); toast(error, 'bad'); return; }
    setRouteStatus(status);
    await refreshRoutes(selectedRouteId);
    toast(status === 'completed' ? 'Η διαδρομή ολοκληρώθηκε.' : status === 'paused' ? 'Η διαδρομή τέθηκε σε παύση.' : 'Η διαδρομή ενεργοποιήθηκε.', 'ok');
  };

  const removeRoute = async () => {
    if (!selectedRouteId) { newRoute(); return; }
    if (!window.confirm('Να διαγραφεί η διαδρομή και όλες οι στάσεις της;')) return;
    const error = await deleteSavedRoute(selectedRouteId);
    if (error) { setRouteError(error); toast(error, 'bad'); return; }
    toast('Η διαδρομή διαγράφηκε.', 'ok');
    const remainder = await refreshRoutes(null);
    if (remainder.length) await loadRoute(remainder[0]);
    else newRoute();
  };

  const changeStopStatus = async (index: number, status: 'pending' | 'arrived' | 'completed' | 'skipped') => {
    const previous = stops;
    const next = stops.map((stop, i) => i === index ? { ...stop, stop_status: status } : stop);
    setStops(next);
    if (!selectedRouteId) {
      toast('Η κατάσταση θα αποθηκευτεί μαζί με τη νέα διαδρομή.', 'info');
      return;
    }
    setSaving(true);
    const error = await replaceSavedRouteStops(selectedRouteId, next);
    setSaving(false);
    if (error) {
      setStops(previous);
      setRouteError(error);
      toast(error, 'bad');
      return;
    }
    setRouteError(null);
    toast(status === 'arrived' ? 'Καταγράφηκε άφιξη στη στάση.' : status === 'completed' ? 'Η στάση σημειώθηκε ως ολοκληρωμένη.' : status === 'skipped' ? 'Η στάση σημειώθηκε ως παραλειφθείσα.' : 'Η στάση επέστρεψε σε εκκρεμότητα.', 'ok');
  };

  const reorder = async (index: number, direction: -1 | 1) => {
    setStops(current => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const nearestOrder = async () => {
    const provider = getOrderingProvider('nearest');
    const ordered = await provider.order(stops.map((stop, index) => ({
      id: stop.id ?? 'new-' + index,
      label: stop.label,
      lat: stop.latitude,
      lng: stop.longitude,
      scheduledAt: stop.scheduled_at,
      draft: stop,
    })), origin ?? (originLat != null && originLng != null ? { lat: originLat, lng: originLng } : null));
    setStops(ordered.stops.map(stop => stop.draft));
    toast('Η σειρά ενημερώθηκε με κριτήριο την πλησιέστερη ευθεία στάση (όχι οδική βελτιστοποίηση).', 'ok');
  };

  const discover = async () => {
    const query = discoveryQuery.trim();
    if (query.length < 2) { toast('Γράψτε μια επιχείρηση ή κατηγορία για αναζήτηση.', 'warn'); return; }
    if (routePoints.length === 0) { toast('Ορίστε GPS, αφετηρία ή στάσεις στη διαδρομή πριν από την αναζήτηση.', 'warn'); return; }
    setDiscovering(true);
    const results = await discoverBusinessesAlongRoute(query, routePoints, 1.5);
    setCandidates(results);
    setDiscovering(false);
    if (results.length === 0) toast('Δεν βρέθηκαν δημόσιες καταχωρίσεις στην επιλεγμένη περιοχή. Δοκιμάστε άλλη λέξη ή μεγαλύτερη διαδρομή.', 'warn');
    else toast('Βρέθηκαν ' + results.length + ' διαθέσιμες καταχωρίσεις OpenStreetMap κοντά στη διαδρομή.', 'ok');
  };

  const addCandidate = async (candidate: BusinessCandidate) => {
    const lookup = await findPotentialCRMMatches(candidate.label);
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('el').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const candidateName = normalize(candidate.label);
    const exactMatches = lookup.rows.filter(row => normalize(row.label) === candidateName);
    const close = exactMatches.filter(row => {
      if (row.lat == null || row.lng == null) return false;
      const dy = (row.lat - candidate.position.lat) * 111320;
      const dx = (row.lng - candidate.position.lng) * 111320 * Math.cos(candidate.position.lat * Math.PI / 180);
      return Math.hypot(dx, dy) <= 250;
    });

    // Link only when the CRM name is an exact match, only one record matches, and coordinates are nearby.
    // These OSM coordinates are stored on the route stop only; they never overwrite the CRM entity.
    if (!lookup.error && close.length === 1 && exactMatches.length === 1) {
      const match = close[0];
      if (!window.confirm('Βρέθηκε πιθανή ίδια CRM εγγραφή: ' + match.label + ' (' + match.entity_type + '). Θα χρησιμοποιηθεί ως συνδεδεμένη στάση. Δεν θα δημιουργηθεί lead και δεν θα αλλάξουν τα στοιχεία ή η ιδιοκτησία της CRM εγγραφής. Συνέχεια;')) return;
      setStops(current => [...current, {
        source_type: 'crm',
        source_id: match.id,
        label: match.label,
        subtitle: match.address ?? candidate.sublabel ?? match.entity_type,
        address: match.address ?? null,
        latitude: candidate.position.lat,
        longitude: candidate.position.lng,
        category: match.entity_type,
        source_url: candidate.sourceUrl,
        metadata: {
          coordinate_source: candidate.source,
          coordinate_verified_against_crm: false,
          duplicate_check: 'exact_name_and_nearby_coordinates',
        },
      }]);
      setCandidates(current => current.filter(item => item.id !== candidate.id));
      toast('Η υπάρχουσα CRM εγγραφή προστέθηκε ως στάση. Δεν άλλαξαν στοιχεία ή ιδιοκτησία.', 'ok');
      return;
    }

    const possible = lookup.rows.slice(0, 3);
    if (possible.length > 0 && !window.confirm(
      'Υπάρχουν πιθανές εγγραφές CRM: ' + possible.map(row => row.label + ' (' + row.entity_type + ')').join('; ')
      + '. Η επιχείρηση θα προστεθεί μόνο ως μη συνδεδεμένη στάση ανακάλυψης. Δεν θα δημιουργηθεί lead, δεν θα συγχωνευτούν εγγραφές και δεν θα αλλάξει ιδιοκτησία. Συνέχεια?'
    )) return;

    setStops(current => [...current, {
      source_type: 'discovery',
      label: candidate.label,
      subtitle: candidate.sublabel ?? candidate.category ?? 'Δημόσια καταχώριση OpenStreetMap',
      address: candidate.sublabel ?? null,
      latitude: candidate.position.lat,
      longitude: candidate.position.lng,
      category: candidate.category ?? null,
      source_url: candidate.sourceUrl,
      metadata: {
        source: candidate.source,
        external_candidate_id: candidate.id,
        duplicate_check: lookup.error ? 'incomplete' : possible.length ? 'possible_match_requires_review' : 'no_match_found',
        possible_crm_match_ids: possible.map(row => row.entity_type + ':' + row.id),
      },
    }]);
    setCandidates(current => current.filter(item => item.id !== candidate.id));
    if (lookup.error) {
      toast('Η στάση προστέθηκε, αλλά ο έλεγχος διπλοτύπων δεν ολοκληρώθηκε. Ζητήστε έλεγχο Back Office πριν δημιουργηθεί lead.', 'warn');
    } else if (possible.length) {
      toast('Η στάση προστέθηκε χωρίς σύνδεση με CRM. Απαιτείται έλεγχος πριν δημιουργηθεί lead.', 'warn');
    } else {
      toast('Η επιχείρηση προστέθηκε ως υποψήφια στάση. Δεν δημιουργήθηκε lead.', 'ok');
    }
  };

  const hasVisitHistory = useMemo(() => stops.some(stop => stop.stop_status === 'arrived' || stop.stop_status === 'completed'), [stops]);

  const panelStops = useMemo<RouteStopInput[]>(() => stops.map((stop, index) => ({
    id: stop.id ?? 'draft-' + index,
    label: stop.label,
    subtitle: stop.subtitle ?? stop.address ?? undefined,
    lat: stop.latitude,
    lng: stop.longitude,
    scheduledAt: stop.scheduled_at,
  })), [stops]);

  const statusOptions: Array<{ id: SavedRouteStatus; label: string }> = [
    { id: 'draft', label: 'Πρόχειρη' },
    { id: 'active', label: 'Ενεργή' },
    { id: 'paused', label: 'Σε παύση' },
    { id: 'completed', label: 'Ολοκληρωμένη' },
  ];

  return (
    <Card className="!p-0" pad={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5 border-b border-line">
        <div>
          <Micro tone="brand">Field Sales · Route workspace</Micro>
          <h3 className="text-[15px] font-semibold text-ink mt-1 flex items-center gap-2">
            <RouteIcon className="h-4 w-4 text-brand-600" /> Πολλαπλές αποθηκευμένες διαδρομές
          </h3>
          <p className="text-xs text-ink/45 mt-1">Αποθήκευση, συνέχιση και διαχείριση 40–60+ στάσεων ανά διαδρομή.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="outline" onClick={newRoute}><Plus className="h-3.5 w-3.5" /> Νέα διαδρομή</Btn>
          <Btn onClick={() => void save()} disabled={saving || loadingStops || (canManageTeam && (!routeOwner || !agents.some(agent => agent.id === routeOwner)))}>
            {saving ? <Spinner /> : <Save className="h-3.5 w-3.5" />} Αποθήκευση
          </Btn>
        </div>
      </div>

      {(routeError || (routes.length === 0 && !loadingRoutes)) && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 sm:mx-5" role="status">
          {routeError ?? 'Δεν υπάρχουν ακόμη αποθηκευμένες διαδρομές.'}
          {routeError && /phase5\/19/i.test(routeError) && ' Μπορείτε ακόμη να δείτε την προεπισκόπηση, αλλά η αποθήκευση θα λειτουργήσει μετά την εγκεκριμένη migration.'}
        </div>
      )}

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
        <section className="space-y-3" aria-label="Ρυθμίσεις διαδρομής">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-ink/55">Αποθηκευμένη διαδρομή
              <select className="field mt-1" value={selectedRouteId ?? ''} onChange={event => {
                const id = event.target.value;
                if (!id) { newRoute(); return; }
                const route = routes.find(item => item.id === id);
                if (route) void loadRoute(route);
              }}>
                <option value="">Νέα / μη αποθηκευμένη</option>
                {routes.map(route => <option key={route.id} value={route.id}>{route.route_name} · {route.route_date} · {route.status}</option>)}
              </select>
            </label>
            <label className="block text-xs text-ink/55">Όνομα διαδρομής
              <input className="field mt-1" value={routeName} maxLength={100} onChange={event => setRouteName(event.target.value)} placeholder="π.χ. Νέα Σμύρνη — πρωί" />
            </label>
            <label className="block text-xs text-ink/55">Ημερομηνία
              <input type="date" className="field mt-1" value={routeDate} onChange={event => setRouteDate(event.target.value)} />
            </label>
            <label className="block text-xs text-ink/55">Κατάσταση
              <select className="field mt-1" value={routeStatus} onChange={event => setRouteStatus(event.target.value as SavedRouteStatus)}>
                {statusOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                <option value="cancelled">Ακυρωμένη</option>
              </select>
            </label>
            <label className="block text-xs text-ink/55">Τρόπος μετακίνησης
              <select className="field mt-1" value={travelMode} onChange={event => setTravelMode(event.target.value as SavedRouteTravelMode)}>
                <option value="driving">🚗 Οδήγηση</option>
                <option value="walking">🚶 Πεζή</option>
                <option value="bicycling">🚲 Ποδήλατο</option>
              </select>
            </label>
            <label className="block text-xs text-ink/55">Αφετηρία / GPS
              <input className="field mt-1" value={originLabel} onChange={event => setOriginLabel(event.target.value)} placeholder="Ετικέτα αφετηρίας" />
              {origin && <span className="block text-[10px] text-ink/40 mt-1">{origin.lat.toFixed(5)}, {origin.lng.toFixed(5)} · Για αλλαγή θέσης, όρισε GPS ή αναζήτησε αφετηρία πάνω από τον χάρτη.</span>}
            </label>
            {canManageTeam && (
              <label className="block text-xs text-ink/55 sm:col-span-2">Υπεύθυνος Sales Agent
                <select className="field mt-1" value={routeOwner} onChange={event => setRouteOwner(event.target.value)} required>
                  <option value="">Επιλέξτε Sales Agent…</option>
                  {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
                </select>
                {agents.length === 0 && <span className="block mt-1 text-xs text-amber-700">Δεν υπάρχουν ενεργοί Sales Agents. Δημιουργήστε ή ενεργοποιήστε λογαριασμό πριν αναθέσετε διαδρομή.</span>}
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 pt-1">
            <div>
              <Micro tone="brand">Στάσεις</Micro>
              <p className="text-xs text-ink/45 mt-1">{stops.length} σημεία · οι στάσεις διατηρούν τη σειρά που έχεις επιλέξει.</p>
              <p className="text-[11px] text-ink/35 mt-1">Καταγράψτε Άφιξη / Ολοκλήρωση μετά το check-in. Διαδρομές με ιστορικό επίσκεψης δεν διαγράφονται.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" onClick={() => void nearestOrder()} disabled={stops.length < 2}><RefreshCw className="h-3.5 w-3.5" /> Σειρά κοντινότερης στάσης</Btn>
              <Btn variant="ghost" onClick={() => setStops(current => [...current, ...seedStops.filter(seed => { const id = seed.id.match(/(?:visit|case|lead)-([0-9a-f-]{36})/i)?.[1]; return !id || !current.some(stop => stop.source_id === id); }).map(fromSeed)])} disabled={!seedStops.length}>
                <Plus className="h-3.5 w-3.5" /> Εκκρεμείς επισκέψεις
              </Btn>
            </div>
          </div>
          {loadingRoutes || loadingStops ? <div className="py-8 flex justify-center"><Spinner /></div> : null}
          <div className="max-h-[440px] overflow-y-auto space-y-2 pr-1">
            {stops.map((stop, index) => (
              <div key={stop.id ?? 'new-' + index} className="flex gap-2 rounded-xl border border-line bg-white p-3">
                <div className="grid h-7 w-7 place-items-center rounded-full bg-ink text-[11px] font-bold text-white shrink-0">{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink truncate">{stop.label}</div>
                  <div className="text-xs text-ink/45 truncate">{stop.subtitle ?? stop.address ?? (stop.source_type === 'discovery' ? 'Νέα επιχείρηση' : 'CRM στάση')}</div>
                  <div className="text-[10px] text-ink/35 mt-1">{stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)} · {stop.source_type === 'discovery' ? 'OpenStreetMap candidate' : stop.source_type.toUpperCase()}</div>
                  <label className="block mt-2 text-[10px] text-ink/45">Κατάσταση στάσης
                    <select className="field mt-1 !py-1 !text-xs" value={stop.stop_status ?? 'pending'} onChange={event => void changeStopStatus(index, event.target.value as 'pending' | 'arrived' | 'completed' | 'skipped')} disabled={saving} aria-label={`Κατάσταση στάσης ${index + 1}`}>
                      <option value="pending">Εκκρεμεί</option>
                      <option value="arrived">Άφιξη</option>
                      <option value="completed">Ολοκληρώθηκε</option>
                      <option value="skipped">Παραλείφθηκε</option>
                    </select>
                  </label>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button className="rounded-lg p-1.5 text-ink/45 hover:bg-ink/5 disabled:opacity-25" aria-label="Μετακίνηση στάσης επάνω" disabled={index === 0} onClick={() => void reorder(index, -1)}><ChevronUp className="h-4 w-4" /></button>
                  <button className="rounded-lg p-1.5 text-ink/45 hover:bg-ink/5 disabled:opacity-25" aria-label="Μετακίνηση στάσης κάτω" disabled={index === stops.length - 1} onClick={() => void reorder(index, 1)}><ChevronDown className="h-4 w-4" /></button>
                  <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" aria-label="Αφαίρεση στάσης" onClick={() => setStops(current => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {stops.length === 0 && <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink/45">Η διαδρομή δεν έχει στάσεις ακόμη. Προσθέστε σημερινές επισκέψεις ή αναζητήστε επιχειρήσεις παρακάτω.</div>}
          </div>
        </section>

        <aside className="space-y-4" aria-label="Εύρεση επιχειρήσεων και πλοήγηση">
          <div className="rounded-2xl border border-line bg-slate-50 p-4">
            <Micro tone="brand">Ανακάλυψη επιχειρήσεων</Micro>
            <h4 className="text-sm font-semibold text-ink mt-1">Επιχειρήσεις κατά μήκος της διαδρομής</h4>
            <p className="text-xs text-ink/45 mt-1">Αναζήτηση σε διαθέσιμες δημόσιες καταχωρίσεις OpenStreetMap κοντά στις στάσεις — όχι πλήρης κατάλογος επιχειρήσεων.</p>
            <div className="flex gap-2 mt-3">
              <input className="field min-w-0" value={discoveryQuery} onChange={event => setDiscoveryQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void discover(); }} placeholder="π.χ. λογιστήριο, κατάστημα, φαρμακείο" aria-label="Αναζήτηση επιχειρήσεων"/>
              <Btn onClick={() => void discover()} disabled={discovering || discoveryQuery.trim().length < 2 || routePoints.length === 0}>
                {discovering ? <Spinner /> : <Search className="h-3.5 w-3.5" />} Εύρεση
              </Btn>
            </div>
            {routePoints.length === 0 && <p className="text-xs text-amber-800 mt-2">Ορίστε GPS ή προσθέστε τουλάχιστον μία στάση πριν από την αναζήτηση.</p>}
            <div className="mt-3 space-y-2 max-h-[250px] overflow-y-auto">
              {candidates.map(candidate => (
                <div key={candidate.id} className="rounded-xl border border-line bg-white p-3">
                  <div className="text-sm font-medium text-ink">{candidate.label}</div>
                  <div className="text-xs text-ink/45 mt-1">{candidate.sublabel ?? candidate.category ?? 'Δημόσια καταχώριση'}</div>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    <button className="font-semibold text-brand-600" onClick={() => void addCandidate(candidate)}>+ Προσθήκη ως στάση</button>
                    <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="text-ink/50 underline">OpenStreetMap</a>
                  </div>
                </div>
              ))}
              {candidates.length === 0 && <p className="text-xs text-ink/40">Τα αποτελέσματα θα εμφανιστούν εδώ και ως ξεχωριστό επίπεδο στον χάρτη.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Micro tone="brand">Ενέργειες διαδρομής</Micro>
                <h4 className="text-sm font-semibold text-ink mt-1">{routeName || 'Νέα διαδρομή'}</h4>
              </div>
              <button className="rounded-lg p-1.5 text-ink/45 hover:bg-ink/5 disabled:opacity-30" aria-label="Διαγραφή διαδρομής" title={hasVisitHistory ? "Δεν διαγράφονται διαδρομές με ιστορικό επίσκεψης" : "Διαγραφή διαδρομής"} disabled={hasVisitHistory} onClick={() => void removeRoute()}><Trash2 className="h-4 w-4"/></button>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Btn variant="outline" onClick={() => void changeStatus('paused')} disabled={routeStatus === 'paused'}><Pause className="h-3.5 w-3.5"/> Παύση</Btn>
              <Btn variant="outline" onClick={() => void changeStatus('active')} disabled={routeStatus === 'active'}><Play className="h-3.5 w-3.5"/> Συνέχιση</Btn>
              <Btn variant="outline" onClick={() => void changeStatus('completed')} disabled={routeStatus === 'completed'}><CheckCircle2 className="h-3.5 w-3.5"/> Ολοκλήρωση</Btn>
              <Btn variant="ghost" onClick={() => { const active = routes.find(route => route.id === selectedRouteId); if (active) void loadRoute(active); else newRoute(); }}><RefreshCw className="h-3.5 w-3.5"/> Ανανέωση</Btn>
            </div>
          </div>
        </aside>
      </div>

      {stops.length >= 2 && (
        <div className="px-4 pb-4 sm:px-5">
          <RoutePanel stops={panelStops} onPlan={onPlan} travelMode={travelMode} />
        </div>
      )}
    </Card>
  );
}
