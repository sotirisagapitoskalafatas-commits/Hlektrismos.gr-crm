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
  if (/field_sales_routes|field_sales_route_stops|field_sales_replace_route_stops|schema cache|PGRST20[245]/i.test(message) || error?.code === '42P01') {
    return 'Οι διατηρημένες διαδρομές δεν είναι ακόμη διαθέσιμες στη βάση. Χρειάζεται η εγκεκριμένη migration phase5/19.';
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

export async function deleteSavedRoute(id: string): Promise<string | null> {
  const { data, error } = await supabase.from('field_sales_routes').delete().eq('id', id).select('id').maybeSingle();
  if (error) return friendlyError(error, 'Δεν διαγράφηκε η διαδρομή');
  if (!data) return 'Η διαδρομή δεν βρέθηκε ή δεν έχετε δικαίωμα διαγραφής.';
  return null;
}
