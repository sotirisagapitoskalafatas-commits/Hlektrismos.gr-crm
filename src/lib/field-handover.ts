/* After a field visit (phase 2, item D):
   - «Νέο Sale» → handover to Back Office. The case keeps its id and customer; the field agent stays recorded as the
     originator (field_sales_owner is only filled when empty); Back Office responsibility goes to the default
     Back Office assignee (setting, staged phase4/12) when one is set.
   - «Follow-up από υπεύθυνο» → a follow-up marked for the Back Office queue, created by the agent (kept as the
     originator), assigned to the default Back Office assignee when set. */

import { addActivity, createFollowUp, fetchCase, pushNotification, updateCase } from './api';
import type { Case } from './api';
import type { Role } from './roles';
import { fetchDefaultBackofficeAssignee } from './lead-intake';
import { MANAGER_FOLLOWUP_PREFIX } from './field-day';

export async function handoverNewSale(caseId: string, me: { id: string; role: Role }, note: string): Promise<{ ok: boolean; assignee: string | null }> {
  const c = await fetchCase(caseId);
  if (!c) return { ok: false, assignee: null };
  const bo = await fetchDefaultBackofficeAssignee();
  const patch: Partial<Case> = {
    field_sales_owner: c.field_sales_owner ?? me.id,
    next_action: 'Παραλαβή από Sales — Νέο Sale',
    // Without a configured Back Office assignee the current owner is left unchanged (never cleared).
    ...(bo ? { next_action_owner_id: bo.id, back_office_owner: bo.id } : {}),
  };
  const { error } = await updateCase(caseId, patch, { log: false, role: me.role });
  if (error) return { ok: false, assignee: null };
  await addActivity(caseId, {
    role: me.role, activity_type: 'assignment',
    title: `Νέο Sale — παράδοση στο Back Office${bo ? ` (${bo.full_name})` : ''}`,
    description: note.trim() || 'Ο πελάτης συμφώνησε στην επίσκεψη.',
    metadata: { from_agent: me.id, to_owner: bo?.id ?? null, team: 'back_office', origin: 'field_visit' },
  });
  if (bo) await pushNotification({ user_id: bo.id, case_id: caseId, title: 'Νέο Sale από το πεδίο', body: c.customer?.full_name ?? c.title, type: 'case', link: caseId });
  return { ok: true, assignee: bo?.full_name ?? null };
}

export async function managerFollowUp(caseId: string, note: string): Promise<{ ok: boolean; assignee: string | null }> {
  const bo = await fetchDefaultBackofficeAssignee();
  const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(10, 0, 0, 0);
  const f = await createFollowUp({
    case_id: caseId, due_at: due.toISOString(), channel: 'other', priority: 'high', kind: 'manager',
    reason: `${MANAGER_FOLLOWUP_PREFIX} — ${note.trim() || 'από επίσκεψη πεδίου'}`,
    ...(bo ? { assignee_id: bo.id } : {}),
  });
  return { ok: !!f, assignee: bo?.full_name ?? null };
}
