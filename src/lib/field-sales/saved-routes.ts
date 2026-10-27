import { supabase } from '@/lib/supabase';

export type SavedRouteStatus = 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
export type SavedRouteTravelMode = 'driving' | 'walking' | 'bicycling';
export type SavedRouteSource = 'crm' | 'visit' | 'discovery' | 'manual';
export type SavedRouteStopStatus = 'pending' | 'arrived' | 'completed' | 'skipped';

export interface SavedRoute {
  id: string;
  owner_id: string;
  route_name: string;
  route_date: string;
  status: SavedRouteStatus;
  travel_mode: SavedRouteTravelMode;
  origin_lat: number | null;
  origin_lng: number | null;
  origin_label: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface SavedRouteStop {
  id: string;
  route_id: string;
  sort_order: number;
  source_type: SavedRouteSource;
  source_id: string | null;
  label: string;
  subtitle: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  category: string | null;
  source_url: string | null;
  stop_status: SavedRouteStopStatus;
  arrived_at: string | null;
  completed_at: string | null;
  scheduled_at: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SavedRouteStopDraft {
  id?: string;
  source_type: SavedRouteSource;
  source_id?: string | null;
  label: string;
  subtitle?: string | null;
  address?: string | null;
  latitude: number;
  longitude: number;
  category?: string | null;
  source_url?: string | null;
  stop_status?: SavedRouteStopStatus;
  arrived_at?: string | null;
  completed_at?: string | null;
  scheduled_at?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SavedRouteDraft {
  id?: string | null;
  owner_id: string;
  route_name: string;
  route_date: string;
  status: SavedRouteStatus;
  travel_mode: SavedRouteTravelMode;
  origin_lat?: number | null;
  origin_lng?: number | null;
  origin_label?: string | null;
  notes?: string | null;
}

function friendlyError(error: { message?: string; code?: string } | null | undefined, action: string): string {
  const message = error?.message ?? '';
  if (/field_sales_routes|field_sales_route_stops|field_sales_replace_route_stops|field_sales_candidate_duplicate_signal|field_sales_duplicate_reviews|schema cache|PGRST20[245]/i.test(message) || error?.code === '42P01') {
    return 'Η αποθήκευση διαδρομών δεν είναι διαθέσιμη ακόμη. Επικοινωνήστε με το Back Office.';
  }
  if (/row-level security|permission denied|42501/i.test(message) || error?.code === '42501') {
    return 'Δεν έχετε δικαίωμα για αυτή την ενέργεια στη συγκεκριμένη διαδρομή.';
  }
  return action + (message ? `: ${message}` : '.');
}

export async function fetchSavedRoutes(options: { date?: string; ownerId?: string; includeArchived?: boolean } = {}):
Promise<{ rows: SavedRoute[]; error: string | null }> {
  let query = supabase.from('field_sales_routes').select('*').order('route_date', { ascending: false }).order('updated_at', { ascending: false });
  if (options.date) query = query.eq('route_date', options.date);
  if (options.ownerId) query = query.eq('owner_id', options.ownerId);
  if (!options.includeArchived) query = query.not('status', 'in', '(completed,cancelled)');
  const { data, error } = await query;
  return { rows: (data ?? []) as SavedRoute[], error: error ? friendlyError(error, 'Δεν φορτώθηκαν οι αποθηκευμένες διαδρομές') : null };
}

export async function fetchSavedRouteStops(routeId: string): Promise<{ rows: SavedRouteStop[]; error: string | null }> {
  const { data, error } = await supabase.from('field_sales_route_stops').select('*').eq('route_id', routeId).order('sort_order', { ascending: true });
  return { rows: (data ?? []) as SavedRouteStop[], error: error ? friendlyError(error, 'Δεν φορτώθηκαν οι στάσεις') : null };
}

export async function saveSavedRoute(draft: SavedRouteDraft): Promise<{ row: SavedRoute | null; error: string | null }> {
  const payload = {
    owner_id: draft.owner_id,
    route_name: draft.route_name.trim(),
    route_date: draft.route_date,
    status: draft.status,
    travel_mode: draft.travel_mode,
    origin_lat: draft.origin_lat ?? null,
    origin_lng: draft.origin_lng ?? null,
    origin_label: draft.origin_label ?? null,
    notes: draft.notes ?? null,
    updated_at: new Date().toISOString(),
    completed_at: draft.status === 'completed' ? new Date().toISOString() : null,
  };
  const request = draft.id
    ? supabase.from('field_sales_routes').update(payload).eq('id', draft.id).select('*').single()
    : supabase.from('field_sales_routes').insert(payload).select('*').single();
  const { data, error } = await request;
  return { row: (data as SavedRoute | null) ?? null, error: error ? friendlyError(error, 'Δεν αποθηκεύτηκε η διαδρομή') : null };
}

/** Replaces all stops in one database transaction using an invoker-secured RPC. */
export async function replaceSavedRouteStops(routeId: string, stops: SavedRouteStopDraft[]): Promise<string | null> {
  const normalized = stops.map((stop, index) => ({
    id: stop.id ?? null,
    sort_order: index,
    source_type: stop.source_type,
    source_id: stop.source_id ?? null,
    label: stop.label.trim(),
    subtitle: stop.subtitle ?? null,
    address: stop.address ?? null,
    latitude: stop.latitude,
    longitude: stop.longitude,
    category: stop.category ?? null,
    source_url: stop.source_url ?? null,
    stop_status: stop.stop_status ?? 'pending',
    scheduled_at: stop.scheduled_at ?? null,
    notes: stop.notes ?? null,
    metadata: stop.metadata ?? {},
  }));
  const { error } = await supabase.rpc('field_sales_replace_route_stops', {
    p_route_id: routeId,
    p_stops: normalized,
  });
  return error ? friendlyError(error, 'Δεν αποθηκεύτηκαν οι στάσεις') : null;
}

export async function updateSavedRouteStatus(id: string, status: SavedRouteStatus): Promise<string | null> {
  const { error } = await supabase.from('field_sales_routes').update({
    status,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  return error ? friendlyError(error, 'Δεν ενημερώθηκε η κατάσταση της διαδρομής') : null;
}

export type DuplicateReviewStatus = 'pending' | 'approved' | 'rejected' | 'converted';
export type DuplicateSignalKind = 'possible_match' | 'check_failed';

export interface FieldSalesDuplicateReview {
  id: string;
  requested_by: string;
  prospective_owner_id: string | null;
  route_id: string | null;
  route_stop_id: string | null;
  candidate_name: string;
  candidate_address: string | null;
  candidate_phone: string | null;
  candidate_category: string | null;
  candidate_lat: number | null;
  candidate_lng: number | null;
  source_provider: string;
  source_url: string | null;
  duplicate_signal: DuplicateSignalKind;
  status: DuplicateReviewStatus;
  request_note: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_lead_id: string | null;
  requested_at: string;
  updated_at: string;
}

export async function checkFieldSalesDuplicateSignal(candidate: {
  name: string; address?: string | null; phone?: string | null; lat?: number | null; lng?: number | null;
}): Promise<{ possibleDuplicate: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('field_sales_candidate_duplicate_signal', {
    p_name: candidate.name,
    p_address: candidate.address ?? null,
    p_phone: candidate.phone ?? null,
    p_lat: candidate.lat ?? null,
    p_lng: candidate.lng ?? null,
  });
  if (error) return { possibleDuplicate: true, error: friendlyError(error, 'Δεν ολοκληρώθηκε ο έλεγχος διπλοτύπων') };
  return { possibleDuplicate: data === true, error: null };
}

export async function createFieldSalesDuplicateReview(input: {
  requested_by: string;
  prospective_owner_id: string;
  route_id?: string | null;
  route_stop_id?: string | null;
  candidate_name: string;
  candidate_address?: string | null;
  candidate_phone?: string | null;
  candidate_category?: string | null;
  candidate_lat?: number | null;
  candidate_lng?: number | null;
  source_provider?: string;
  source_url?: string | null;
  duplicate_signal: DuplicateSignalKind;
  request_note?: string | null;
}): Promise<{ row: FieldSalesDuplicateReview | null; error: string | null }> {
  const { data, error } = await supabase.from('field_sales_duplicate_reviews').insert({
    ...input,
    status: 'pending',
  }).select('*').single();
  return {
    row: (data as FieldSalesDuplicateReview | null) ?? null,
    error: error ? friendlyError(error, 'Δεν υποβλήθηκε αίτημα ελέγχου Back Office') : null,
  };
}

export async function fetchPendingFieldSalesDuplicateReviews(): Promise<{ rows: FieldSalesDuplicateReview[]; error: string | null }> {
  const { data, error } = await supabase.from('field_sales_duplicate_reviews')
    .select('*').eq('status', 'pending').order('requested_at', { ascending: true });
  return {
    rows: (data ?? []) as FieldSalesDuplicateReview[],
    error: error ? friendlyError(error, 'Δεν φορτώθηκε η ουρά ελέγχου διπλοτύπων') : null,
  };
}

/** Atomically claims a still-pending review so two Back Office sessions cannot create from it concurrently. */
export async function claimFieldSalesDuplicateReview(id: string, reviewerId: string, note?: string | null):
Promise<{ row: FieldSalesDuplicateReview | null; error: string | null }> {
  const { data, error } = await supabase.from('field_sales_duplicate_reviews')
    .update({ status: 'approved', review_note: note ?? null, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').select('*').maybeSingle();
  if (error) return { row: null, error: friendlyError(error, 'Δεν εγκρίθηκε το αίτημα') };
  if (!data) return { row: null, error: 'Το αίτημα έχει ήδη εξεταστεί από άλλο μέλος του Back Office.' };
  return { row: data as FieldSalesDuplicateReview, error: null };
}

export async function updateFieldSalesDuplicateReview(
  id: string,
  status: DuplicateReviewStatus,
  reviewerId: string,
  note?: string | null,
  leadId?: string | null,
): Promise<string | null> {
  const { error } = await supabase.from('field_sales_duplicate_reviews').update({
    status,
    review_note: note ?? null,
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
    created_lead_id: leadId ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', status === 'pending' ? 'approved' : status === 'converted' || status === 'rejected' ? 'approved' : 'pending');
  return error ? friendlyError(error, 'Δεν αποθηκεύτηκε η απόφαση Back Office') : null;
}

export async function updateSavedRouteStopStatus(
  id: string,
  status: SavedRouteStopStatus,
): Promise<{ row: SavedRouteStop | null; error: string | null }> {
  const { data, error } = await supabase
    .from('field_sales_route_stops')
    .update({ stop_status: status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  return {
    row: (data as SavedRouteStop | null) ?? null,
    error: error ? friendlyError(error, 'Δεν ενημερώθηκε η κατάσταση της στάσης') : null,
  };
}

export async function deleteSavedRoute(id: string): Promise<string | null> {
  const { data, error } = await supabase.from('field_sales_routes').delete().eq('id', id).select('id').maybeSingle();
  if (error) return friendlyError(error, 'Δεν διαγράφηκε η διαδρομή');
  if (!data) return 'Η διαδρομή δεν βρέθηκε ή δεν έχετε δικαίωμα διαγραφής.';
  return null;
}
