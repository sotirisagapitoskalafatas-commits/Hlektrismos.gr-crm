import { supabase } from './supabase';
import type { Role, Stage } from './roles';

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
  created_at: string;
};

function logError(method: string, err: unknown) {
  // eslint-disable-next-line no-console
  console.error(`[atlas.api] ${method}:`, err);
}

/* ---------------- Profiles ---------------- */
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
    return list;
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
  return (data ?? null) as Case | null;
}

export async function updateCase(id: string, patch: Partial<Case>, opts?: { log?: boolean; role?: Role }): Promise<void> {
  if (!supabase) return;
  const prev = opts?.log ? await fetchCase(id) : null;
  const upd: Record<string, unknown> = { ...patch };
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

export async function uploadDocumentFile(file: File): Promise<{ url: string; name: string; mime: string; size: number } | null> {
  if (!supabase) return null;
  const path = `cases/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const { error } = await supabase.storage.from('client_documents').upload(path, file, { upsert: false });
  if (error) { logError('uploadDocumentFile', error); return null; }
  const { data: urlData } = supabase.storage.from('client_documents').getPublicUrl(path);
  return { url: urlData.publicUrl, name: file.name, mime: file.type, size: file.size };
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

export async function checkInVisit(id: string, coords?: { lat: number; lng: number }): Promise<void> {
  if (!supabase) return;
  const profile = await ensureProfile();
  const { data } = await supabase
    .from('case_visits')
    .update({ status: 'in_progress', started_at: new Date().toISOString(), check_in: { at: new Date().toISOString(), ...(coords ?? {}) } })
    .eq('id', id)
    .select('case_id')
    .single();
  if (data?.case_id) {
    await addActivity(data.case_id as string, {
      role: (profile?.role ?? 'field_sales') as Role,
      activity_type: 'check_in',
      title: 'Check In',
      description: 'Ο πωλητής έφτασε στον πελάτη.',
      location: coords ? { ...coords } : null,
      metadata: { visit_id: id },
    });
  }
}

export async function checkOutVisit(id: string, coords?: { lat: number; lng: number }, notes?: string): Promise<void> {
  if (!supabase) return;
  const profile = await ensureProfile();
  const { data } = await supabase
    .from('case_visits')
    .update({ status: 'completed', ended_at: new Date().toISOString(), check_out: { at: new Date().toISOString(), ...(coords ?? {}) }, notes: notes ?? '' })
    .eq('id', id)
    .select('case_id')
    .single();
  if (data?.case_id) {
    await addActivity(data.case_id as string, {
      role: (profile?.role ?? 'field_sales') as Role,
      activity_type: 'check_out',
      title: 'Check Out',
      description: notes || 'Η επίσκεψη ολοκληρώθηκε.',
      location: coords ? { ...coords } : null,
      metadata: { visit_id: id },
    });
  }
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

/* ---------------- Leads (existing table) ---------------- */
export async function fetchLeads(): Promise<Lead[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
  if (error) { logError('fetchLeads', error); return []; }
  return (data ?? []) as Lead[];
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