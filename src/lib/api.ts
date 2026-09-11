import { supabase } from './supabase';
import { applyCanonicalLabels, loadCatalog, resolveProductId, resolveProviderId } from './catalog';
import { ROLES } from './roles';
import type { Role, Stage } from './roles';
import type { MapCoordinate } from './maps/types';

export type Customer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  notes: string;
  created_at: string;
};

export type Case = {
  id: string;
  case_no: string;
  title: string;
  customer_id: string | null;
  source: string;
  service_type: string;
  property_type: string | null;
  case_type: string | null;
  current_stage: Stage;
  priority: string;
  status: string;
  value: number;
  probability: number;
  expected_close_date: string | null;
  owner_id: string | null;
  lead_id: string | null;
  stage_entered_at: string | null;
  next_action_owner_id: string | null;
  inside_sales_owner: string | null;
  field_sales_owner: string | null;
  back_office_owner: string | null;
  next_action: string;
  next_follow_up_at: string | null;
  location: string;
  address: string;
  lat: number | null;
  lng: number | null;
  provider: string | null;
  program: string | null;
  provider_id: string | null;
  product_id: string | null;
  application_status: string | null;
  activation_status: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  customer: Customer | null;
};

export type TimelineEvent = {
  id: string;
  case_id: string;
  role: Role | 'system';
  activity_type: string;
  title: string;
  description: string;
  user_id: string | null;
  occurred_at: string;
  location: { lat?: number; lng?: number; label?: string } | null;
  metadata: Record<string, unknown>;
  user?: { id: string; full_name: string; role: Role } | null;
};

export type FollowUp = {
  id: string;
  case_id: string;
  due_at: string;
  channel: string;
  reason: string;
  priority: string;
  assignee_id: string | null;
  status: 'pending' | 'completed' | 'cancelled' | 'snoozed';
  notes: string;
  snoozed_until: string | null;
  completed_at: string | null;
  created_at: string;
  case: { id: string; case_no: string; title: string; customer: Customer | null; current_stage: Stage } | null;
};

export type CaseDocument = {
  id: string;
  case_id: string;
  category: string;
  status: string;
  file_name: string;
  file_url: string;
  mime_type: string;
  size: number;
  uploaded_by: string | null;
  description: string;
  verified_by: string | null;
  verified_at: string | null;
  created_at: string;
};

export type CaseVisit = {
  id: string;
  case_id: string;
  user_id: string | null;
  purpose: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  check_in: { at?: string; lat?: number; lng?: number } | null;
  check_out: { at?: string; lat?: number; lng?: number } | null;
  location: { label?: string; lat?: number; lng?: number } | null;
  result: string;
  notes: string;
  created_at: string;
  case: { id: string; case_no: string; title: string; customer: Customer | null } | null;
};

export type CaseSignature = {
  id: string;
  case_id: string;
  status: string;
  document_id: string | null;
  captured_by: string | null;
  captured_at: string | null;
  image_url: string;
  notes: string;
  created_at: string;
};

export type CaseOffer = {
  id: string;
  case_id: string;
  offer_no: string;
  amount: number;
  status: string;
  valid_until: string | null;
  items: unknown[];
  sent_at: string | null;
  notes: string;
  created_at: string;
};

export type AppNotification = {
  id: string;
  user_id: string | null;
  case_id: string | null;
  title: string;
  body: string;
  type: string;
  link: string;
  read_at: string | null;
  created_at: string;
};

export type Lead = {
  id: string;
  full_name: string | null;
  client_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  service_category: string | null;
  property_type: string | null;
  status: string | null;
  source: string | null;
  lat: number | null;
  lng: number | null;
  location_source: string | null;
  location_confidence: string | null;
  address: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  source_label: string | null;
  created_by_user_id: string | null;
  assigned_to_user_id: string | null;
  first_contact_user_id: string | null;
  referred_by_user_id: string | null;
  converted_by_user_id: string | null;
  converted_at: string | null;
  converted_case_id: string | null;
  provider: string | null;
  program: string | null;
  provider_id: string | null;
  product_id: string | null;
  created_at: string;
  created_by?: { full_name: string } | null;
  assigned_to?: { full_name: string } | null;
};

function logError(method: string, err: unknown) {
  console.error(`[atlas.api] ${method}:`, err);
}

/* ---------------- Profiles ---------------- */
export type StaffProfile = {
  id: string;
  full_name: string;
  role: Role;
  phone: string | null;
  avatar_url: string | null;
  created_at: string | null;
};

export async function ensureProfile(): Promise<{ id: string; full_name: string; role: Role } | null> {
  if (!supabase || !supabase.auth.getUser()) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) { logError('ensureProfile', error); return null; }
  return data ?? null;
}

export async function updateProfile(id: string, patch: { full_name?: string; phone?: string | null }): Promise<boolean> {
  if (!supabase) return false;
  const upd: Record<string, unknown> = {};
  if (patch.full_name !== undefined) upd.full_name = patch.full_name;
  if (patch.phone !== undefined) upd.phone = patch.phone;
  if (Object.keys(upd).length === 0) return true;
  const { error } = await supabase.from('profiles').update(upd).eq('id', id);
  if (error) { logError('updateProfile', error); return false; }
  return true;
}

export async function fetchStaff(): Promise<StaffProfile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, phone, avatar_url, created_at')
    .order('created_at', { ascending: true });
  if (error) { logError('fetchStaff', error); return []; }
  return (data ?? []) as StaffProfile[];
}

const VALID_ROLE_KEYS = new Set<string>(ROLES.map(r => r.id));

/* Canonical multi-role read (CRM OS Phase 1.1).
   ADDITIVE: the app still gates on the single `profiles.role`. This exposes the
   full canonical role set from the `user_roles` M:N table for UIs that want it.
   Degrades gracefully to [] if the foundation tables are absent or RLS-blocked,
   so it is safe to ship before the foundation migration is confirmed live. */
export async function fetchUserRoles(userId: string): Promise<Role[]> {
  if (!supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('roles(key)')
      .eq('user_id', userId);
    if (error) return [];
    const rows = (data ?? []) as Array<{ roles: { key: string } | { key: string }[] | null }>;
    const keys = rows.flatMap(r => {
      const rel = r.roles;
      if (!rel) return [];
      return Array.isArray(rel) ? rel.map(x => x.key) : [rel.key];
    });
    return keys.filter((k): k is Role => VALID_ROLE_KEYS.has(k));
  } catch {
    return [];
  }
}

/* ---------------- Customers ---------------- */
export async function upsertCustomer(input: Partial<Customer> & { full_name: string }): Promise<Customer | null> {
  if (!supabase) return null;
  try {
    if (input.phone) {
      const existing = await supabase
        .from('customers')
        .select('*')
        .eq('phone', input.phone)
        .maybeSingle();
      if (existing.data) {
        const upd = await supabase
          .from('customers')
          .update({ full_name: input.full_name, email: input.email ?? existing.data.email, company: input.company ?? existing.data.company })
          .eq('id', existing.data.id)
          .select()
          .single();
        if (upd.data) return upd.data as Customer;
      }
    }
    const { data, error } = await supabase
      .from('customers')
      .insert({
        full_name: input.full_name,
        email: input.email ?? null,
        phone: input.phone ?? null,
        company: input.company ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        postal_code: input.postal_code ?? null,
        notes: input.notes ?? '',
      })
      .select()
      .single();
    if (error) { logError('upsertCustomer', error); return null; }
    return data as Customer;
  } catch (e) { logError('upsertCustomer', e); return null; }
}

export async function fetchCustomers(): Promise<Customer[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
  if (error) { logError('fetchCustomers', error); return []; }
  return (data ?? []) as Customer[];
}

/* ---------------- Cases ---------------- */
export async function createCase(input: {
  title: string;
  customer: Partial<Customer> & { full_name: string };
  service_type: string;
  property_type?: string;
  case_type?: string;
  source?: string;
  priority?: string;
  value?: number;
  probability?: number;
  location?: string;
  address?: string;
  notes?: string;
  stage?: Stage;
  role: Role;
}): Promise<Case | null> {
  if (!supabase) return null;
  try {
    const customer = await upsertCustomer(input.customer);
    const profile = await ensureProfile();
    const { data, error } = await supabase
      .from('cases')
      .insert({
        title: input.title,
        customer_id: customer?.id ?? null,
        service_type: input.service_type,
        property_type: input.property_type ?? null,
        case_type: input.case_type ?? null,
        source: input.source ?? 'website',
        priority: input.priority ?? 'normal',
        value: input.value ?? 0,
        probability: input.probability ?? 0,
        location: input.location ?? '',
        address: input.address ?? '',
        notes: input.notes ?? '',
        current_stage: input.stage ?? 'new',
        owner_id: profile?.id ?? null,
        inside_sales_owner: profile?.id ?? null,
        created_by: profile?.id ?? null,
      })
      .select(`*, customer:customers(*)`)
      .single();
    if (error) { logError('createCase', error); return null; }
    const created = data as Case;
    if (profile) {
      await addActivity(created.id, {
        role: input.role,
        activity_type: 'created',
        title: 'Case δημιουργήθηκε',
        description: `${created.case_no} — ${input.customer.full_name}`,
      });
      await pushNotification({
        user_id: profile.id,
        case_id: created.id,
        title: `Νέο Case ${created.case_no}`,
        body: `${input.customer.full_name} — ${input.service_type}`,
        type: 'case',
        link: created.id,
      });
    }
    return created;
  } catch (e) { logError('createCase', e); return null; }
}

export async function fetchCases(opts?: { search?: string; stage?: string; includeDone?: boolean }): Promise<Case[]> {
  if (!supabase) return [];
  try {
    let q = supabase
      .from('cases')
      .select(`*, customer:customers(*)`)
      .order('created_at', { ascending: false });
    if (!opts?.includeDone) {
      q = q.in('current_stage', ['new', 'contacted', 'offer', 'application', 'signed', 'document_check', 'submitted', 'activation']);
    }
    const { data, error } = await q;
    if (error) { logError('fetchCases', error); return []; }
    let list = (data ?? []) as Case[];
    if (opts?.search) {
      const s = opts.search.toLowerCase();
      list = list.filter(c =>
        (c.case_no ?? '').toLowerCase().includes(s) ||
        (c.customer?.full_name ?? '').toLowerCase().includes(s) ||
        (c.customer?.phone ?? '').includes(s) ||
        c.title.toLowerCase().includes(s),
      );
    }
    if (opts?.stage && opts.stage !== 'all') {
      list = list.filter(c => c.current_stage === opts.stage);
    }
    const catalog = await loadCatalog();
    return applyCanonicalLabels(list, catalog);
  } catch (e) { logError('fetchCases', e); return []; }
}

export async function fetchCase(id: string): Promise<Case | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('cases')
    .select(`*, customer:customers(*)`)
    .eq('id', id)
    .maybeSingle();
  if (error) { logError('fetchCase', error); return null; }
  const row = (data ?? null) as Case | null;
  if (!row) return null;
  const catalog = await loadCatalog();
  return applyCanonicalLabels([row], catalog)[0];
}

export async function updateCase(id: string, patch: Partial<Case>, opts?: { log?: boolean; role?: Role }): Promise<void> {
  if (!supabase) return;
  const prev = opts?.log ? await fetchCase(id) : null;
  const catalog = await loadCatalog();
  const providerId =
    patch.provider_id ?? (patch.provider !== undefined ? resolveProviderId(patch.provider, catalog) : undefined);
  const productId =
    patch.product_id ??
    (patch.program !== undefined ? resolveProductId(patch.program, providerId ?? null, catalog) : undefined);
  const upd: Record<string, unknown> = { ...patch };
  if (providerId && upd.provider_id === undefined) upd.provider_id = providerId;
  if (productId && upd.product_id === undefined) upd.product_id = productId;
  delete upd.case_no;
  delete upd.id;
  delete upd.customer;
  delete upd.created_at;
  delete upd.updated_at;
  const { error } = await supabase.from('cases').update(upd).eq('id', id);
  if (error) { logError('updateCase', error); return; }
  if (opts?.log && prev) {
    const changed: string[] = [];
    if (patch.current_stage && patch.current_stage !== prev.current_stage) {
      changed.push(`Στάδιο: ${prev.current_stage} → ${patch.current_stage}`);
      if (patch.current_stage === 'completed') {
        await addActivity(id, { role: opts.role ?? 'system', activity_type: 'completed', title: 'Case ολοκληρώθηκε', description: 'Η παροχή ενεργοποιήθηκε.' });
      } else {
        await addActivity(id, { role: opts.role ?? 'system', activity_type: 'status_change', title: `Στάδιο: ${prev.current_stage} → ${patch.current_stage}`, description: changed[0] });
      }
    }
    if (changed.length > 0) {
      await addActivity(id, {
        role: opts.role ?? 'system',
        activity_type: 'status_change',
        title: 'Ενημέρωση Case',
        description: changed.join(' · '),
      });
    }
  }
}

export async function changeStage(id: string, stage: Stage, role: Role, note?: string): Promise<void> {
  await updateCase(id, {
    current_stage: stage,
    ...(stage === 'completed' ? { status: 'completed', activation_status: 'active' } : {}),
    ...(stage === 'lost' || stage === 'cancelled' ? { status: 'lost' } : {}),
  }, { log: true, role });
  if (note) {
    await addActivity(id, { role: 'system', activity_type: 'note', title: stage === 'completed' ? 'Σχόλιο ολοκλήρωσης' : 'Σημείωση αλλαγής σταδίου', description: note });
  }
}

/* ---------------- Timeline ---------------- */
export async function fetchTimeline(caseId: string): Promise<TimelineEvent[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('timeline_events')
    .select(`*, user:profiles(id, full_name, role)`)
    .eq('case_id', caseId)
    .order('occurred_at', { ascending: true });
  if (error) { logError('fetchTimeline', error); return []; }
  return (data ?? []) as TimelineEvent[];
}

export async function addActivity(caseId: string, input: {
  role: Role | 'system';
  activity_type: string;
  title: string;
  description?: string;
  location?: { lat?: number; lng?: number; label?: string } | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (!supabase) return;
  const profile = await ensureProfile();
  const { error } = await supabase.from('timeline_events').insert({
    case_id: caseId,
    role: input.role,
    activity_type: input.activity_type,
    title: input.title,
    description: input.description ?? '',
    user_id: profile?.id ?? null,
    location: input.location ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) logError('addActivity', error);
}

/* ---------------- Follow-ups ---------------- */
export async function fetchFollowUps(opts?: { status?: 'pending' | 'completed' | 'all' }): Promise<FollowUp[]> {
  if (!supabase) return [];
  try {
    let q = supabase
      .from('follow_ups')
      .select(`*, case:cases(id, case_no, title, current_stage, customer:customers(id, full_name, phone))`);
    if (opts?.status && opts.status !== 'all') {
      q = q.eq('status', opts.status);
    } else if (!opts?.status || opts.status === 'all') {
      q = q.neq('status', 'cancelled');
    }
    q = q.order('due_at', { ascending: true });
    const { data, error } = await q;
    if (error) { logError('fetchFollowUps', error); return []; }
    return (data ?? []) as FollowUp[];
  } catch (e) { logError('fetchFollowUps', e); return []; }
}

export async function createFollowUp(input: {
  case_id: string;
  due_at: string;
  channel: string;
  reason: string;
  priority: string;
  notes?: string;
  assignee_id?: string;
}): Promise<FollowUp | null> {
  if (!supabase) return null;
  try {
    const profile = await ensureProfile();
    const { data, error } = await supabase
      .from('follow_ups')
      .insert({
        case_id: input.case_id,
        due_at: input.due_at,
        channel: input.channel,
        reason: input.reason,
        priority: input.priority,
        notes: input.notes ?? '',
        assignee_id: input.assignee_id ?? profile?.id ?? null,
        created_by: profile?.id ?? null,
      })
      .select()
      .single();
    if (error) { logError('createFollowUp', error); return null; }
    await addActivity(input.case_id, {
      role: (profile?.role ?? 'inside_sales') as Role,
      activity_type: 'follow_up',
      title: `Follow Up: ${input.channel}`,
      description: `${input.reason} — ${new Date(input.due_at).toLocaleString('el-GR')}`,
      metadata: { follow_up_id: data?.id },
    });
    return (data ?? null) as FollowUp | null;
  } catch (e) { logError('createFollowUp', e); return null; }
}

export async function completeFollowUp(id: string, caseId?: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('follow_ups').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', id);
  if (caseId) {
    const profile = await ensureProfile();
    await addActivity(caseId, { role: (profile?.role ?? 'system') as Role, activity_type: 'follow_up', title: 'Follow Up ολοκληρώθηκε', description: 'Σημειώθηκε ως ολοκληρωμένο.' });
  }
}

export async function snoozeFollowUp(id: string, until: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('follow_ups').update({ status: 'snoozed', snoozed_until: until, due_at: until }).eq('id', id);
}

export async function rescheduleFollowUp(id: string, dueAt: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('follow_ups').update({ due_at: dueAt, status: 'pending', snoozed_until: null }).eq('id', id);
}

/* ---------------- Documents ---------------- */
export async function fetchDocuments(caseId: string): Promise<CaseDocument[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('case_documents')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  if (error) { logError('fetchDocuments', error); return []; }
  return (data ?? []) as CaseDocument[];
}

export async function addDocument(caseId: string, input: {
  category: string;
  file_name?: string;
  file_url?: string;
  mime_type?: string;
  size?: number;
  description?: string;
}): Promise<CaseDocument | null> {
  if (!supabase) return null;
  const profile = await ensureProfile();
  const { data, error } = await supabase
    .from('case_documents')
    .insert({
      case_id: caseId,
      category: input.category,
      status: 'received',
      file_name: input.file_name ?? input.description ?? '',
      file_url: input.file_url ?? '',
      mime_type: input.mime_type ?? '',
      size: input.size ?? 0,
      description: input.description ?? '',
      uploaded_by: profile?.id ?? null,
    })
    .select()
    .single();
  if (error) { logError('addDocument', error); return null; }
  await addActivity(caseId, {
    role: (profile?.role ?? 'system') as Role,
    activity_type: 'document',
    title: `Έγγραφο: ${input.category}`,
    description: input.description || input.file_name || 'Νέο έγγραφο',
    metadata: { document_id: data?.id },
  });
  return (data ?? null) as CaseDocument | null;
}

export async function setDocumentStatus(id: string, status: string): Promise<void> {
  if (!supabase) return;
  const profile = await ensureProfile();
  const { data } = await supabase
    .from('case_documents')
    .update({ status, verified_by: profile?.id ?? null, verified_at: status === 'verified' ? new Date().toISOString() : null })
    .eq('id', id)
    .select('case_id')
    .single();
  if (data?.case_id) {
    await addActivity(data.case_id as string, {
      role: (profile?.role ?? 'back_office') as Role,
      activity_type: 'document_check',
      title: `Έλεγχος εγγράφου: ${status}`,
      description: status === 'verified' ? 'Έγγραφο ελέγχθηκε και είναι έγκυρο.' : `Κατάσταση εγγράφου: ${status}`,
    });
  }
}

export async function uploadDocumentFile(file: File): Promise<{ path: string; name: string; mime: string; size: number } | null> {
  if (!supabase) return null;
  const path = `cases/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage.from('client_documents').upload(path, file, { upsert: false });
  if (error) { logError('uploadDocumentFile', error); return null; }
  return { path, name: file.name, mime: file.type, size: file.size };
}

/* Resolve a stored object into a short-lived signed URL.
   Already-public (http) values are passed through unchanged. */
export async function getDocumentUrl(path: string): Promise<string | null> {
  if (!supabase || !path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const { data } = await supabase.storage.from('client_documents').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/* ---------------- Visits / check in-out ---------------- */
export async function fetchVisits(opts?: { caseId?: string; user?: boolean }): Promise<CaseVisit[]> {
  if (!supabase) return [];
  try {
    const profile = opts?.user ? await ensureProfile() : null;
    let q = supabase
      .from('case_visits')
      .select(`*, case:cases(id, case_no, title, customer:customers(id, full_name, phone))`)
      .order('created_at', { ascending: false });
    if (opts?.caseId) q = q.eq('case_id', opts.caseId);
    if (profile) q = q.eq('user_id', profile.id);
    const { data, error } = await q;
    if (error) { logError('fetchVisits', error); return []; }
    return (data ?? []) as CaseVisit[];
  } catch (e) { logError('fetchVisits', e); return []; }
}

export async function createVisit(caseId: string, input: { purpose?: string; scheduled_at?: string; location?: { label?: string; lat?: number; lng?: number } }): Promise<CaseVisit | null> {
  if (!supabase) return null;
  try {
    const profile = await ensureProfile();
    const { data, error } = await supabase
      .from('case_visits')
      .insert({
        case_id: caseId,
        user_id: profile?.id ?? null,
        purpose: input.purpose ?? '',
        scheduled_at: input.scheduled_at ?? null,
        location: input.location ?? null,
      })
      .select()
      .single();
    if (error) { logError('createVisit', error); return null; }
    await addActivity(caseId, {
      role: (profile?.role ?? 'field_sales') as Role,
      activity_type: 'visit',
      title: 'Επίσκεψη προγραμματίστηκε',
      description: input.purpose || 'Επίσκεψη πεδίου',
      location: input.location ?? null,
      metadata: { visit_id: data?.id },
    });
    return (data ?? null) as CaseVisit | null;
  } catch (e) { logError('createVisit', e); return null; }
}

export type CheckInCoords = { lat: number; lng: number; accuracy?: number };

export async function checkInVisit(id: string, coords?: CheckInCoords): Promise<boolean> {
  if (!supabase) return false;
  const profile = await ensureProfile();
  const { data, error } = await supabase
    .from('case_visits')
    .update({ status: 'in_progress', started_at: new Date().toISOString(), check_in: { at: new Date().toISOString(), ...(coords ?? {}), accuracy: coords?.accuracy ?? null } })
    .eq('id', id)
    .select('case_id')
    .single();
  if (error) { logError('checkInVisit', error); return false; }
  if (data?.case_id) {
    const accLine = coords?.accuracy != null ? ` (ακρίβεια ±${Math.round(coords.accuracy)} μ)` : '';
    await addActivity(data.case_id as string, {
      role: (profile?.role ?? 'field_sales') as Role,
      activity_type: 'check_in',
      title: 'Check In',
      description: `Ο πωλητής έφτασε στον πελάτη${accLine}.`,
      location: coords ? { lat: coords.lat, lng: coords.lng } : null,
      metadata: { visit_id: id, accuracy: coords?.accuracy ?? null },
    });
  }
  return !!data;
}

export async function checkOutVisit(id: string, coords?: CheckInCoords, notes?: string): Promise<boolean> {
  if (!supabase) return false;
  const profile = await ensureProfile();
  const { data, error } = await supabase
    .from('case_visits')
    .update({ status: 'completed', ended_at: new Date().toISOString(), check_out: { at: new Date().toISOString(), ...(coords ?? {}), accuracy: coords?.accuracy ?? null }, notes: notes ?? '' })
    .eq('id', id)
    .select('case_id')
    .single();
  if (error) { logError('checkOutVisit', error); return false; }
  if (data?.case_id) {
    const accLine = coords?.accuracy != null ? ` (ακρίβεια ±${Math.round(coords.accuracy)} μ)` : '';
    await addActivity(data.case_id as string, {
      role: (profile?.role ?? 'field_sales') as Role,
      activity_type: 'check_out',
      title: 'Check Out',
      description: `${notes ? notes + ' — ' : ''}Η επίσκεψη ολοκληρώθηκε${accLine}.`,
      location: coords ? { lat: coords.lat, lng: coords.lng } : null,
      metadata: { visit_id: id, accuracy: coords?.accuracy ?? null },
    });
  }
  return !!data;
}

export async function updateVisitNotes(id: string, notes: string, result: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('case_visits').update({ notes, result }).eq('id', id);
}

/* ---------------- Signatures ---------------- */
export async function fetchSignatures(caseId: string): Promise<CaseSignature[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('case_signatures')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  if (error) { logError('fetchSignatures', error); return []; }
  return (data ?? []) as CaseSignature[];
}

export async function captureSignature(caseId: string, input: { document_id?: string | null; image_url?: string; notes?: string }): Promise<CaseSignature | null> {
  if (!supabase) return null;
  const profile = await ensureProfile();
  const { data, error } = await supabase
    .from('case_signatures')
    .insert({
      case_id: caseId,
      document_id: input.document_id ?? null,
      image_url: input.image_url ?? '',
      notes: input.notes ?? '',
      status: 'captured',
      captured_by: profile?.id ?? null,
      captured_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) { logError('captureSignature', error); return null; }
  await addActivity(caseId, {
    role: (profile?.role ?? 'field_sales') as Role,
    activity_type: 'signature',
    title: 'Υπογραφή λήφθηκε',
    description: input.notes || 'Υπογραφή πελάτη',
    metadata: { signature_id: data?.id },
  });
  return (data ?? null) as CaseSignature | null;
}

export async function setSignatureStatus(id: string, status: string, caseId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('case_signatures').update({ status }).eq('id', id);
  const profile = await ensureProfile();
  await addActivity(caseId, {
    role: (profile?.role ?? 'back_office') as Role,
    activity_type: 'signature',
    title: `Υπογραφή: ${status}`,
    description: 'Κατάσταση υπογραφής ενημερώθηκε.',
  });
}

/* ---------------- Offers ---------------- */
export async function fetchOffers(caseId: string): Promise<CaseOffer[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('case_offers')
    .select('*')
    .eq('case_id', caseId)
    .order('created_at', { ascending: false });
  if (error) { logError('fetchOffers', error); return []; }
  return (data ?? []) as CaseOffer[];
}

/* All offers with case + customer joined (Revenue control center). */
export type RevenueOffer = {
  id: string;
  case_id: string;
  offer_no: string;
  amount: number;
  status: string;
  valid_until: string | null;
  sent_at: string | null;
  created_at: string;
  case: {
    id: string;
    case_no: string;
    title: string;
    current_stage: string;
    customer: { id: string; full_name: string } | null;
  } | null;
};

export async function fetchAllOffers(): Promise<RevenueOffer[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('case_offers')
    .select(`*, case:cases(id, case_no, title, current_stage, customer:customers(id, full_name))`)
    .order('created_at', { ascending: false });
  if (error) { logError('fetchAllOffers', error); return []; }
  return (data ?? []) as RevenueOffer[];
}

export async function createOffer(caseId: string, input: { amount: number; notes?: string; valid_until?: string }): Promise<CaseOffer | null> {
  if (!supabase) return null;
  const profile = await ensureProfile();
  const { data, error } = await supabase
    .from('case_offers')
    .insert({
      case_id: caseId,
      amount: input.amount,
      notes: input.notes ?? '',
      valid_until: input.valid_until ?? null,
      offer_no: `OFF-${Date.now().toString().slice(-6)}`,
      created_by: profile?.id ?? null,
    })
    .select()
    .single();
  if (error) { logError('createOffer', error); return null; }
  await addActivity(caseId, {
    role: (profile?.role ?? 'inside_sales') as Role,
    activity_type: 'offer',
    title: `Προσφορά: ${input.amount} €`,
    description: input.notes || 'Νέα προσφορά',
    metadata: { offer_id: data?.id },
  });
  return (data ?? null) as CaseOffer | null;
}

export async function markOfferSent(id: string, caseId: string): Promise<void> {
  if (!supabase) return;
  await supabase.from('case_offers').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', id);
  const profile = await ensureProfile();
  await addActivity(caseId, {
    role: (profile?.role ?? 'inside_sales') as Role,
    activity_type: 'send_offer',
    title: 'Προσφορά στάλθηκε',
    description: 'Η προσφορά εστάλη στον πελάτη.',
  });
}

export type CaseStats = {
  timeline: TimelineEvent[];
  documents: CaseDocument[];
  signatures: CaseSignature[];
  offers: CaseOffer[];
};

export async function fetchCaseStats(caseId: string): Promise<CaseStats> {
  const [timeline, documents, signatures, offers] = await Promise.all([
    fetchTimeline(caseId),
    fetchDocuments(caseId),
    fetchSignatures(caseId),
    fetchOffers(caseId),
  ]);
  return { timeline, documents, signatures, offers };
}

export async function fetchAllCaseStats(caseIds: string[]): Promise<Map<string, CaseStats>> {
  const empty: CaseStats = { timeline: [], documents: [], signatures: [], offers: [] };
  const entries = await Promise.all(
    caseIds.map(async id => {
      try {
        return [id, await fetchCaseStats(id)] as [string, CaseStats];
      } catch {
        return [id, empty] as [string, CaseStats];
      }
    }),
  );
  return new Map<string, CaseStats>(entries);
}

/* ---------------- Notifications ---------------- */
export async function pushNotification(input: { user_id?: string; case_id?: string; title: string; body?: string; type?: string; link?: string }): Promise<void> {
  if (!supabase) return;
  const profile = input.user_id ? null : await ensureProfile();
  await supabase.from('app_notifications').insert({
    user_id: input.user_id ?? profile?.id ?? null,
    case_id: input.case_id ?? null,
    title: input.title,
    body: input.body ?? '',
    type: input.type ?? 'info',
    link: input.link ?? '',
  });
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  if (!supabase) return [];
  const profile = await ensureProfile();
  if (!profile) return [];
  const { data, error } = await supabase
    .from('app_notifications')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) { logError('fetchNotifications', error); return []; }
  return (data ?? []) as AppNotification[];
}

export async function markNotificationsRead(): Promise<void> {
  if (!supabase) return;
  const profile = await ensureProfile();
  if (!profile) return;
  await supabase
    .from('app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', profile.id)
    .is('read_at', null);
}

/* ---------------- Field Sales — server-validated check-in / check-out ---------------- */
export type FieldCheckinResult = {
  accepted: boolean;
  code: 'INSIDE_RADIUS' | 'OUTSIDE_RADIUS' | 'GPS_UNCERTAIN' | 'NO_TARGET' | 'NO_VISIT' | 'IDEMPOTENT';
  visitId?: string;
  caseId?: string;
  message?: string;
  distanceMeters?: number;
  radiusM?: number;
  accuracyM?: number;
  status?: string;
  already?: boolean;
};

export async function fieldCheckin(
  visitId: string,
  coords?: { lat: number; lng: number; accuracy?: number },
  opts?: { radius_m?: number; notes?: string },
): Promise<FieldCheckinResult> {
  if (!supabase) return { accepted: false, code: 'NO_VISIT', message: 'Η σύνδεση δεν είναι διαθέσιμη.' };
  const { data, error } = await supabase.rpc('field_checkin', {
    p_visit_id: visitId,
    p_lat: coords?.lat ?? null,
    p_lng: coords?.lng ?? null,
    p_accuracy_m: coords?.accuracy ?? null,
    p_radius_m: opts?.radius_m ?? null,
    p_notes: opts?.notes ?? '',
  });
  if (error) { logError('fieldCheckin', error); return { accepted: false, code: 'NO_VISIT', message: 'Σφάλμα κλήσης Check-in.' }; }
  return (data as FieldCheckinResult) ?? { accepted: false, code: 'NO_VISIT' };
}

export async function fieldCheckout(
  visitId: string,
  coords?: { lat: number; lng: number; accuracy?: number },
  notes?: string,
): Promise<FieldCheckinResult> {
  if (!supabase) return { accepted: false, code: 'NO_VISIT', message: 'Η σύνδεση δεν είναι διαθέσιμη.' };
  const { data, error } = await supabase.rpc('field_checkout', {
    p_visit_id: visitId,
    p_lat: coords?.lat ?? null,
    p_lng: coords?.lng ?? null,
    p_accuracy_m: coords?.accuracy ?? null,
    p_notes: notes ?? '',
  });
  if (error) { logError('fieldCheckout', error); return { accepted: false, code: 'NO_VISIT', message: 'Σφάλμα κλήσης Check-out.' }; }
  return (data as FieldCheckinResult) ?? { accepted: false, code: 'NO_VISIT' };
}

/* ---------------- Field Sales — travel metrics (slice 8) ---------------- */
export type FieldMetricsDay = {
  day: string;
  user_id: string;
  full_name: string;
  checkins: number;
  accepted: number;
  visits: number;
  distance_km: number;
  travel_h: number;
};

export type FieldMetricsTotals = {
  checkins: number;
  accepted: number;
  visits: number;
  distance_km: number;
  travel_h: number;
  active_days: number;
};

export type FieldMetrics = {
  forbidden?: boolean;
  days: FieldMetricsDay[];
  totals: FieldMetricsTotals;
};

export const EMPTY_FIELD_METRICS: FieldMetrics = {
  days: [],
  totals: { checkins: 0, accepted: 0, visits: 0, distance_km: 0, travel_h: 0, active_days: 0 },
};

export async function fetchFieldSalesMetrics(p_user_id?: string, p_days = 30): Promise<FieldMetrics> {
  if (!supabase) return EMPTY_FIELD_METRICS;
  const { data, error } = await supabase.rpc('field_sales_metrics', {
    p_user_id: p_user_id ?? null,
    p_days,
  });
  if (error) { logError('fieldSalesMetrics', error); return EMPTY_FIELD_METRICS; }
  return (data as FieldMetrics) ?? EMPTY_FIELD_METRICS;
}

/* Combine cases + customers + leads into a unified search set for Field Sales map.
   Returns only records that already have real coordinates — never fabricates positions. */
export type FieldTarget = {
  entity_type: 'case' | 'customer' | 'lead';
  id: string;
  label: string;
  sublabel: string;
  position: MapCoordinate;
  address?: string;
  status?: string;
  stage?: string;
  source?: string;
};

function asLabel(c: { title?: string; customer?: { full_name?: string } | null; full_name?: string; client_name?: string; first_name?: string; last_name?: string }): string {
  return c.title || c.customer?.full_name || c.full_name || c.client_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Χωρίς τίτλο';
}

export async function fetchFieldTargets(search?: string): Promise<FieldTarget[]> {
  if (!supabase) return [];
  const [cases, customers, leads] = await Promise.all([
    supabase
      .from('cases')
      .select('id, case_no, title, lat, lng, address, location, current_stage, customer:customers(full_name)')
      .not('lat', 'is', null)
      .not('lng', 'is', null),
    supabase
      .from('customers')
      .select('id, full_name, lat, lng, address, phone')
      .not('lat', 'is', null)
      .not('lng', 'is', null),
    supabase
      .from('leads')
      .select('id, full_name, client_name, first_name, last_name, lat, lng, address, status, source')
      .not('lat', 'is', null)
      .not('lng', 'is', null),
  ]);

  const results: FieldTarget[] = [
    ...(
      cases.data ?? []
    ).map(c => ({ entity_type: 'case' as const, id: c.id, label: asLabel(c as { title?: string; customer?: { full_name?: string } | null; full_name?: string; client_name?: string; first_name?: string; last_name?: string }), sublabel: [c.case_no, (c as { customer?: { full_name?: string } | null }).customer?.full_name ?? ''].filter(Boolean).join(' · '), position: { lat: c.lat as number, lng: c.lng as number }, address: c.address ?? undefined, stage: c.current_stage ?? undefined })),
    ...(customers.data ?? [])
      .filter(c => !cases.data?.some(cs => cs.customer && (cs.customer as { full_name: string }).full_name === c.full_name))
      .map(c => ({ entity_type: 'customer' as const, id: c.id, label: c.full_name, sublabel: c.phone ?? '', position: { lat: c.lat as number, lng: c.lng as number }, address: c.address ?? undefined })),
    ...(leads.data ?? [])
      .map(l => ({ entity_type: 'lead' as const, id: l.id, label: asLabel(l as { title?: string; customer?: { full_name?: string } | null; full_name?: string; client_name?: string; first_name?: string; last_name?: string }), sublabel: l.status ?? '', position: { lat: l.lat as number, lng: l.lng as number }, address: l.address ?? undefined, status: l.status ?? undefined, source: l.source ?? undefined })),
  ];

  if (search) {
    const s = search.toLowerCase();
    return results.filter(t =>
      t.label.toLowerCase().includes(s) ||
      t.sublabel.toLowerCase().includes(s) ||
      (t.address ?? '').toLowerCase().includes(s),
    );
  }
  return results;
}

/* Write coordinates to a lead row (from geocoded map pin). */
export async function updateLeadLocation(leadId: string, coords: { lat: number; lng: number }, source: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('leads')
    .update({ lat: coords.lat, lng: coords.lng, location_source: source, location_confidence: source === 'user' ? 'exact' : 'approximate' })
    .eq('id', leadId);
  if (error) { logError('updateLeadLocation', error); return false; }
  return true;
}

/* ---------------- Leads (existing table) ---------------- */
export async function fetchLeads(): Promise<Lead[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('leads')
    .select(`*, created_by:created_by_user_id(full_name), assigned_to:assigned_to_user_id(full_name)`)
    .order('created_at', { ascending: false });
  if (error) { logError('fetchLeads', error); return []; }
  const catalog = await loadCatalog();
  return applyCanonicalLabels((data ?? []) as Lead[], catalog);
}

export async function fetchLead(id: string): Promise<Lead | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('leads')
    .select(`*, created_by:created_by_user_id(full_name), assigned_to:assigned_to_user_id(full_name)`)
    .eq('id', id)
    .maybeSingle();
  if (error) { logError('fetchLead', error); return null; }
  const row = (data ?? null) as Lead | null;
  if (!row) return null;
  const catalog = await loadCatalog();
  return applyCanonicalLabels([row], catalog)[0];
}

export type LeadInput = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  region?: string | null;
  property_type?: string | null;
  service_category?: string | null;
  source?: string;
  status?: string;
  comments?: string | null;
  campaign_id?: string | null;
  campaign_name?: string | null;
  assigned_to_user_id?: string | null;
  provider?: string | null;
  program?: string | null;
};

/* Staff-managed lead entry. Public intake stays on insert_website_lead(). */
export async function createLead(input: LeadInput): Promise<Lead | null> {
  if (!supabase) return null;
  const profile = await ensureProfile();
  const first = input.first_name ?? null;
  const last = input.last_name ?? null;
  const full = input.full_name ?? ([first, last].filter(Boolean).join(' ') || 'Νέο lead');
  const catalog = await loadCatalog();
  const providerId = resolveProviderId(input.provider, catalog);
  const productId = resolveProductId(input.program, providerId, catalog);
  const { data, error } = await supabase
    .from('leads')
    .insert({
      full_name: full,
      first_name: first,
      last_name: last,
      client_name: full,
      client_contact: input.email ?? input.phone ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      region: input.region ?? null,
      property_type: input.property_type ?? null,
      service_category: input.service_category ?? null,
      source: input.source ?? 'inside_sales',
      status: input.status ?? 'new',
      comments: input.comments ?? null,
      campaign_id: input.campaign_id ?? null,
      campaign_name: input.campaign_name ?? null,
      provider: input.provider ?? null,
      program: input.program ?? null,
      provider_id: providerId,
      product_id: productId,
      created_by_user_id: profile?.id ?? null,
      assigned_to_user_id: input.assigned_to_user_id ?? profile?.id ?? null,
    })
    .select()
    .single();
  if (error) { logError('createLead', error); return null; }
  return (data ?? null) as Lead | null;
}

export async function updateLeadStage(id: string, status: string): Promise<boolean> {
  if (!supabase) return false;
  const profile = await ensureProfile();
  const { error } = await supabase.from('leads').update({ status }).eq('id', id);
  if (error) { logError('updateLeadStage', error); return false; }
  if (status === 'contacted' || status === 'qualified' || status === 'meeting') {
    await supabase.from('leads').update({ first_contact_user_id: profile?.id ?? null }).eq('id', id);
  }
  return true;
}

/* Single-write conversion RPC (SECURITY DEFINER) — preserves attribution + lineage. */
export async function convertLeadToCase(leadId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('convert_lead_to_case', { p_lead_id: leadId });
  if (error) { logError('convertLeadToCase', error); return null; }
  return (data as string) ?? null;
}

/* ---------------- Geolocation ---------------- */
export function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  });
}

/* ---------------- Media capture helpers (camera / signature pad) ----------------
   Camera frames and drawn signatures are compressed to JPEG before upload so
   mobile photos stay small. On any failure the original blob is returned. */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export async function loadImage(url: string): Promise<{ img: HTMLImageElement; url: string }> {
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error('image load failed'));
    img.src = url;
  });
  return { img, url };
}

export async function compressImage(blob: Blob, maxDim = 1600, quality = 0.82): Promise<Blob> {
  try {
    const dataUrl = await fileToDataUrl(blob);
    const { img } = await loadImage(dataUrl);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return blob;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const out = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', quality));
    return out ?? blob;
  } catch (e) {
    logError('compressImage', e);
    return blob;
  }
}

export async function prepareCaptureFile(blob: Blob, name?: string): Promise<File> {
  const compressed = await compressImage(blob);
  return new File([compressed], name || `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
}

/* ---------------- Audit ---------------- */
export async function logAudit(entity_type: string, entity_id: string, action: string, details: Record<string, unknown>): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('activity_log').insert({ entity_type, entity_id, action, details });
  } catch { /* non-fatal */ }
}