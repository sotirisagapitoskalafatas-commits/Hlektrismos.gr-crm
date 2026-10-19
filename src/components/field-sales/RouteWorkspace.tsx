import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, ChevronDown, ChevronUp, Pause, Play, Plus, RefreshCw,
  Route as RouteIcon, Save, Search, Trash2,
} from 'lucide-react';
import { Btn, Card, Micro, Spinner } from '@/lib/ui';
import { useToast } from '@/lib/toast';
import { createLead } from '@/lib/api';
import type { MapCoordinate } from '@/lib/maps/types';
import type { RoutePlan, RouteStop } from '@/lib/routing/types';
import { getOrderingProvider } from '@/lib/routing/ordering';
import RoutePanel, { type RouteStopInput } from '@/components/field-sales/RoutePanel';
import {
  deleteSavedRoute, fetchSavedRoutes, fetchSavedRouteStops, replaceSavedRouteStops,
  saveSavedRoute, updateSavedRouteStatus, updateSavedRouteStopStatus,
  checkFieldSalesDuplicateSignal, createFieldSalesDuplicateReview, fetchPendingFieldSalesDuplicateReviews,
  claimFieldSalesDuplicateReview, updateFieldSalesDuplicateReview,
} from '@/lib/field-sales/saved-routes';
import type {
  FieldSalesDuplicateReview, SavedRoute, SavedRouteDraft, SavedRouteStatus, SavedRouteStopDraft, SavedRouteTravelMode,
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
  const [duplicateReviews, setDuplicateReviews] = useState<FieldSalesDuplicateReview[]>([]);
  const [loadingDuplicateReviews, setLoadingDuplicateReviews] = useState(false);
  const [reviewActionId, setReviewActionId] = useState<string | null>(null);

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
        arrived_at: stop.arrived_at,
        completed_at: stop.completed_at,
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

  const refreshDuplicateReviews = useCallback(async () => {
    if (!canManageTeam) {
      setDuplicateReviews([]);
      return;
    }
    setLoadingDuplicateReviews(true);
    const result = await fetchPendingFieldSalesDuplicateReviews();
    setDuplicateReviews(result.rows);
    setLoadingDuplicateReviews(false);
    if (result.error) {
      setRouteError(result.error);
    }
  }, [canManageTeam]);

  useEffect(() => {
    if (canManageTeam) void refreshDuplicateReviews();
  }, [canManageTeam, refreshDuplicateReviews]);

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
    await loadRoute(saved.row);
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
    const current = stops[index];
    if (!current) return;
    if (current.stop_status === 'completed' && status !== 'completed') {
      toast('Η ολοκληρωμένη στάση αποτελεί ιστορικό και δεν μπορεί να αναιρεθεί.', 'warn');
      return;
    }
    if (current.stop_status === 'arrived' && (status === 'pending' || status === 'skipped')) {
      toast('Η καταγεγραμμένη άφιξη δεν μπορεί να αναιρεθεί. Ολοκληρώστε τη στάση ή διατηρήστε την ως άφιξη.', 'warn');
      return;
    }
    if (!selectedRouteId || !current.id) {
      setStops(old => old.map((stop, i) => i === index ? { ...stop, stop_status: status } : stop));
      toast('Η κατάσταση θα αποθηκευτεί μαζί με τη νέα διαδρομή.', 'info');
      return;
    }

    setSaving(true);
    const result = await updateSavedRouteStopStatus(current.id, status);
    setSaving(false);
    if (result.error || !result.row) {
      setRouteError(result.error ?? 'Δεν ενημερώθηκε η κατάσταση της στάσης.');
      toast(result.error ?? 'Δεν ενημερώθηκε η κατάσταση της στάσης.', 'bad');
      return;
    }
    setStops(old => old.map((stop, i) => i === index ? {
      ...stop,
      stop_status: result.row!.stop_status,
      arrived_at: result.row!.arrived_at,
      completed_at: result.row!.completed_at,
      notes: result.row!.notes,
    } : stop));
    setRouteError(null);
    toast(status === 'arrived' ? 'Άφιξη καταγράφηκε.' : status === 'completed' ? 'Ολοκλήρωση στάσης καταγράφηκε.' : status === 'skipped' ? 'Η στάση παραλείφθηκε.' : 'Η στάση επέστρεψε στις εκκρεμότητες.', 'ok');
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

  const appendCandidateStop = (candidate: BusinessCandidate, extraMetadata: Record<string, unknown> = {}) => {
    setStops(current => {
      const alreadyPresent = current.some(stop =>
        stop.source_url === candidate.sourceUrl
        || stop.metadata?.external_candidate_id === candidate.id,
      );
      if (alreadyPresent) return current;
      return [...current, {
        source_type: 'discovery',
        label: candidate.label,
        subtitle: candidate.sublabel ?? candidate.category ?? 'Δημόσια καταχώριση OpenStreetMap',
        address: candidate.address ?? candidate.sublabel ?? null,
        latitude: candidate.position.lat,
        longitude: candidate.position.lng,
        category: candidate.category ?? null,
        source_url: candidate.sourceUrl,
        metadata: {
          source: candidate.source,
          external_candidate_id: candidate.id,
          ...extraMetadata,
        },
      }];
    });
  };

  const queueDuplicateReview = async (
    candidate: BusinessCandidate,
    signal: { possibleDuplicate: boolean; error: string | null },
  ) => {
    setReviewActionId(candidate.id);
    const request = await createFieldSalesDuplicateReview({
      requested_by: currentUserId,
      route_id: selectedRouteId,
      candidate_name: candidate.label,
      candidate_address: candidate.address ?? candidate.sublabel ?? null,
      candidate_phone: candidate.phone ?? null,
      candidate_category: candidate.category ?? null,
      candidate_lat: candidate.position.lat,
      candidate_lng: candidate.position.lng,
      source_provider: candidate.source,
      source_url: candidate.sourceUrl,
      duplicate_signal: signal.error ? 'check_failed' : 'possible_match',
      request_note: signal.error
        ? 'Ο έλεγχος διπλοτύπων απέτυχε. Απαιτείται έλεγχος Back Office πριν δημιουργηθεί lead.'
        : 'Υπάρχει πιθανή αντιστοίχιση σε CRM. Απαιτείται έλεγχος Back Office πριν δημιουργηθεί lead.',
    });
    setReviewActionId(null);
    if (request.error || !request.row) {
      appendCandidateStop(candidate, { duplicate_check: 'review_request_failed' });
      toast(
        'Δεν δημιουργήθηκε lead. Η δημόσια καταχώριση μπορεί να αποθηκευτεί μόνο ως στάση· ο έλεγχος Back Office δεν μπόρεσε να υποβληθεί: '
          + (request.error ?? 'άγνωστο σφάλμα'),
        'warn',
      );
      return false;
    }
    appendCandidateStop(candidate, {
      duplicate_check: signal.error ? 'check_failed' : 'possible_match_requires_review',
      duplicate_review_id: request.row.id,
    });
    setCandidates(current => current.filter(item => item.id !== candidate.id));
    if (canManageTeam) void refreshDuplicateReviews();
    toast('Υποβλήθηκε αίτημα ελέγχου Back Office. Δεν δημιουργήθηκε lead και δεν άλλαξε ιδιοκτησία.', 'warn');
    return true;
  };

  const addCandidate = async (candidate: BusinessCandidate) => {
    setReviewActionId(candidate.id);
    const signal = await checkFieldSalesDuplicateSignal({
      name: candidate.label,
      address: candidate.address ?? candidate.sublabel ?? null,
      phone: candidate.phone ?? null,
      lat: candidate.position.lat,
      lng: candidate.position.lng,
    });
    if (signal.possibleDuplicate || signal.error) {
      await queueDuplicateReview(candidate, signal);
      setReviewActionId(null);
      return;
    }
    appendCandidateStop(candidate, { duplicate_check: 'no_match_found_at_add_time' });
    setCandidates(current => current.filter(item => item.id !== candidate.id));
    setReviewActionId(null);
    toast('Η επιχείρηση προστέθηκε ως υποψήφια στάση. Δεν δημιουργήθηκε lead.', 'ok');
  };

  const createProspect = async (candidate: BusinessCandidate) => {
    setReviewActionId(candidate.id);
    const signal = await checkFieldSalesDuplicateSignal({
      name: candidate.label,
      address: candidate.address ?? candidate.sublabel ?? null,
      phone: candidate.phone ?? null,
      lat: candidate.position.lat,
      lng: candidate.position.lng,
    });
    if (signal.possibleDuplicate || signal.error) {
      await queueDuplicateReview(candidate, signal);
      setReviewActionId(null);
      return;
    }
    const confirmed = window.confirm(
      'Δεν εντοπίστηκε πιθανή υπάρχουσα εγγραφή από τον διαθέσιμο έλεγχο. Να δημιουργηθεί νέο Lead για «'
        + candidate.label
        + '» και να ανατεθεί στον δικό σας λογαριασμό;'
    );
    if (!confirmed) {
      setReviewActionId(null);
      return;
    }
    const created = await createLead({
      full_name: candidate.label,
      company: candidate.label,
      phone: candidate.phone ?? null,
      address: candidate.address ?? candidate.sublabel ?? null,
      lat: candidate.position.lat,
      lng: candidate.position.lng,
      location_source: 'openstreetmap',
      source: 'field_sales',
      source_label: candidate.source,
      status: 'new',
      property_type: 'Επιχείρηση',
      service_category: candidate.category ?? null,
      lead_type: 'business',
      assigned_to_user_id: currentUserId,
      comments: 'Πηγή ανακάλυψης: ' + candidate.source + '. ' + candidate.sourceUrl,
    });
    setReviewActionId(null);
    if (created.error || !created.lead) {
      toast(created.error ?? 'Το Lead δεν δημιουργήθηκε.', 'bad');
      return;
    }
    setStops(current => [...current, {
      source_type: 'crm',
      source_id: created.lead!.id,
      label: candidate.label,
      subtitle: 'Νέο Lead',
      address: candidate.address ?? candidate.sublabel ?? null,
      latitude: candidate.position.lat,
      longitude: candidate.position.lng,
      category: 'lead',
      source_url: candidate.sourceUrl,
      metadata: {
        source: candidate.source,
        external_candidate_id: candidate.id,
        created_lead_id: created.lead.id,
        duplicate_check: 'clear_at_creation',
      },
    }]);
    setCandidates(current => current.filter(item => item.id !== candidate.id));
    toast('Το Lead δημιουργήθηκε και ανατέθηκε στον δικό σας λογαριασμό.', 'ok');
  };

  const rejectDuplicateReview = async (review: FieldSalesDuplicateReview) => {
    setReviewActionId(review.id);
    const claimed = await claimFieldSalesDuplicateReview(review.id, currentUserId, 'Το αίτημα εξετάζεται από Back Office.');
    if (claimed.error || !claimed.row) {
      setReviewActionId(null);
      toast(claimed.error ?? 'Το αίτημα δεν είναι πλέον εκκρεμές.', 'warn');
      await refreshDuplicateReviews();
      return;
    }
    const error = await updateFieldSalesDuplicateReview(
      review.id, 'rejected', currentUserId, 'Απορρίφθηκε από Back Office. Δεν δημιουργήθηκε Lead.',
    );
    setReviewActionId(null);
    if (error) {
      toast('Το αίτημα βρίσκεται σε κατάσταση ελέγχου, αλλά η απόρριψη δεν αποθηκεύτηκε: ' + error, 'bad');
      return;
    }
    toast('Το αίτημα απορρίφθηκε. Δεν δημιουργήθηκε Lead.', 'ok');
    await refreshDuplicateReviews();
  };

  const approveDuplicateReview = async (review: FieldSalesDuplicateReview) => {
    setReviewActionId(review.id);
    const claimed = await claimFieldSalesDuplicateReview(review.id, currentUserId, 'Εγκρίθηκε από Back Office· δημιουργία Lead σε εξέλιξη.');
    if (claimed.error || !claimed.row) {
      setReviewActionId(null);
      toast(claimed.error ?? 'Το αίτημα δεν είναι πλέον εκκρεμές.', 'warn');
      await refreshDuplicateReviews();
      return;
    }
    const staff = await listStaff();
    const requester = staff.rows.find(row => row.id === review.requested_by && row.is_active && isSalesAgentRole(row.role));
    if (!requester) {
      const resetError = await updateFieldSalesDuplicateReview(
        review.id, 'pending', currentUserId,
        'Δεν δημιουργήθηκε Lead: ο αρχικός αιτών δεν είναι πλέον ενεργός Sales Agent. Απαιτείται επανεκχώρηση από Back Office.',
      );
      setReviewActionId(null);
      toast(
        'Δεν δημιουργήθηκε Lead: ο αρχικός Sales Agent δεν είναι πλέον ενεργός. '
          + (resetError ? 'Το αίτημα παραμένει προς έλεγχο· ' + resetError : 'Το αίτημα επέστρεψε στην ουρά.'),
        'warn',
      );
      await refreshDuplicateReviews();
      return;
    }

    const created = await createLead({
      full_name: review.candidate_name,
      company: review.candidate_name,
      phone: review.candidate_phone,
      address: review.candidate_address,
      lat: review.candidate_lat,
      lng: review.candidate_lng,
      location_source: 'openstreetmap',
      source: 'field_sales',
      source_label: review.source_provider,
      status: 'new',
      property_type: 'Επιχείρηση',
      service_category: review.candidate_category,
      lead_type: 'business',
      assigned_to_user_id: requester.id,
      comments: 'Εγκρίθηκε από Back Office. Αίτημα: ' + review.id + '. Πηγή: ' + (review.source_url ?? review.source_provider),
    });
    if (created.error || !created.lead) {
      const resetError = await updateFieldSalesDuplicateReview(
        review.id, 'pending', currentUserId,
        'Δεν δημιουργήθηκε Lead· απαιτείται επανέλεγχος. ' + (created.error ?? 'Άγνωστο σφάλμα.'),
      );
      setReviewActionId(null);
      toast(
        'Το Lead δεν δημιουργήθηκε. '
          + (resetError ? 'Το αίτημα δεν μπόρεσε να επιστρέψει στην ουρά: ' + resetError : 'Το αίτημα επέστρεψε στην ουρά.'),
        'bad',
      );
      await refreshDuplicateReviews();
      return;
    }
    const updateError = await updateFieldSalesDuplicateReview(
      review.id, 'converted', currentUserId,
      'Εγκρίθηκε και μετατράπηκε σε Lead.', created.lead.id,
    );
    setReviewActionId(null);
    if (updateError) {
      toast(
        'Το Lead δημιουργήθηκε, αλλά η ενημέρωση κατάστασης του αιτήματος απέτυχε. Μην επαναλάβετε χειροκίνητα· αναφέρετε το ID αιτήματος ' + review.id + '.',
        'warn',
      );
      await refreshDuplicateReviews();
      return;
    }
    toast('Το αίτημα εγκρίθηκε και το Lead δημιουργήθηκε για τον ενεργό Sales Agent.', 'ok');
    await refreshDuplicateReviews();
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
                    <select className="field mt-1 !py-1 !text-xs" value={stop.stop_status ?? 'pending'} onChange={event => void changeStopStatus(index, event.target.value as 'pending' | 'arrived' | 'completed' | 'skipped')} disabled={saving || stop.stop_status === 'completed'} aria-label={`Κατάσταση στάσης ${index + 1}`}>
                      <option value="pending" disabled={stop.stop_status === 'arrived'}>Εκκρεμεί</option>
                      <option value="arrived">Άφιξη</option>
                      <option value="completed">Ολοκληρώθηκε</option>
                      <option value="skipped" disabled={stop.stop_status === 'arrived'}>Παραλείφθηκε</option>
                    </select>
                  </label>
                  {stop.arrived_at && <p className="mt-1 text-[10px] text-cyan-700">Άφιξη: {new Date(stop.arrived_at).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>}
                  {stop.completed_at && <p className="text-[10px] text-emerald-700">Ολοκλήρωση: {new Date(stop.completed_at).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button className="rounded-lg p-1.5 text-ink/45 hover:bg-ink/5 disabled:opacity-25" aria-label="Μετακίνηση στάσης επάνω" disabled={index === 0 || stop.stop_status === 'arrived' || stop.stop_status === 'completed'} onClick={() => void reorder(index, -1)}><ChevronUp className="h-4 w-4" /></button>
                  <button className="rounded-lg p-1.5 text-ink/45 hover:bg-ink/5 disabled:opacity-25" aria-label="Μετακίνηση στάσης κάτω" disabled={index === stops.length - 1 || stop.stop_status === 'arrived' || stop.stop_status === 'completed'} onClick={() => void reorder(index, 1)}><ChevronDown className="h-4 w-4" /></button>
                  <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-25" aria-label="Αφαίρεση στάσης" title={stop.stop_status === 'arrived' || stop.stop_status === 'completed' ? 'Το ιστορικό στάσης διατηρείται' : 'Αφαίρεση στάσης'} disabled={stop.stop_status === 'arrived' || stop.stop_status === 'completed'} onClick={() => setStops(current => current.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {stops.length === 0 && <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink/45">Η διαδρομή δεν έχει στάσεις ακόμη. Προσθέστε σημερινές επισκέψεις ή αναζητήστε επιχειρήσεις παρακάτω.</div>}
          </div>
        </section>

        <aside className="space-y-4" aria-label="Εύρεση επιχειρήσεων και πλοήγηση">
          {canManageTeam && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4" aria-label="Έλεγχος διπλοτύπων Back Office">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Micro tone="brand">Back Office · Έλεγχος διπλοτύπων</Micro>
                  <h4 className="text-sm font-semibold text-ink mt-1">Αιτήματα προς έγκριση ({duplicateReviews.length})</h4>
                  <p className="text-xs text-ink/45 mt-1">Η δημιουργία Lead παραμένει σε αναμονή μέχρι να εγκριθεί. Οι πιθανές αντιστοιχίσεις εμφανίζονται ως σήμα, χωρίς στοιχεία άλλων εγγραφών CRM.</p>
                </div>
                <button className="text-xs font-semibold text-brand-700 underline" onClick={() => void refreshDuplicateReviews()} disabled={loadingDuplicateReviews}>
                  {loadingDuplicateReviews ? 'Φόρτωση…' : 'Ανανέωση'}
                </button>
              </div>
              {loadingDuplicateReviews && <div className="py-4 flex justify-center"><Spinner /></div>}
              {!loadingDuplicateReviews && duplicateReviews.length === 0 && (
                <p className="text-xs text-ink/45 mt-3">Δεν υπάρχουν εκκρεμή αιτήματα ελέγχου.</p>
              )}
              <div className="mt-3 space-y-2 max-h-[340px] overflow-y-auto">
                {duplicateReviews.map(review => (
                  <div key={review.id} className="rounded-xl border border-violet-100 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-ink break-words">{review.candidate_name}</div>
                        <div className="text-xs text-ink/45 mt-1">{review.candidate_address ?? 'Δεν δόθηκε διεύθυνση'}</div>
                        <div className="text-[10px] text-ink/35 mt-1">
                          {review.duplicate_signal === 'check_failed' ? 'Ο έλεγχος απέτυχε — επανέλεγχος απαιτείται' : 'Πιθανή υπάρχουσα CRM εγγραφή'}
                          {' · '}{new Date(review.requested_at).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      {review.source_url && <a href={review.source_url} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-ink/50 underline">Πηγή</a>}
                    </div>
                    {review.request_note && <p className="text-xs text-ink/50 mt-2">{review.request_note}</p>}
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Btn className="!px-2 !py-1 !text-xs" onClick={() => void approveDuplicateReview(review)} disabled={reviewActionId !== null}>
                        {reviewActionId === review.id ? <Spinner /> : null} Έγκριση & δημιουργία Lead
                      </Btn>
                      <Btn className="!px-2 !py-1 !text-xs" variant="outline" onClick={() => void rejectDuplicateReview(review)} disabled={reviewActionId !== null}>
                        Απόρριψη
                      </Btn>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                  <div className="text-xs text-ink/45 mt-1">{candidate.address ?? candidate.sublabel ?? candidate.category ?? 'Δημόσια καταχώριση'}</div>
                  {candidate.category && <div className="text-[10px] text-ink/35 mt-1">{candidate.category}</div>}
                  <div className="flex flex-wrap gap-3 mt-2 text-xs">
                    <button className="font-semibold text-brand-600 disabled:opacity-40" disabled={reviewActionId !== null} onClick={() => void addCandidate(candidate)}>
                      {reviewActionId === candidate.id ? 'Έλεγχος…' : '+ Προσθήκη ως στάση'}
                    </button>
                    <button className="font-semibold text-emerald-700 disabled:opacity-40" disabled={reviewActionId !== null} onClick={() => void createProspect(candidate)}>
                      {reviewActionId === candidate.id ? 'Έλεγχος…' : 'Δημιουργία Prospect'}
                    </button>
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
