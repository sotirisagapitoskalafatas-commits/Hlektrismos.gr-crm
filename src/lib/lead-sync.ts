/* Lead ↔ customer sync (docs/product/UNIFIED_CUSTOMER_FOLDER.md §3, D3). Pure helpers, no database access.
   After conversion the customer is the one record that gets edited; every customer save also updates the linked
   lead's name, phone and email, so the origin shown in the folder does not drift. Rules:
   - only fields that really changed are sent (no pointless writes, nothing a role may not write unless it changed);
   - a lead value is never cleared because the customer's field is empty (the lead is the original record);
   - the website-form placeholder address (…@hlektrismos.local, finding D1) is never written. */

export interface SyncCustomer { full_name?: string | null; phone?: string | null; email?: string | null }
export interface SyncLead { full_name?: string | null; client_name?: string | null; phone?: string | null; email?: string | null }
export interface LeadSyncPatch { full_name?: string; phone?: string; email?: string }

const PLACEHOLDER_EMAIL = /@hlektrismos\.local$/i;
const digits = (s?: string | null) => (s ?? '').replace(/\D/g, '');
const clean = (s?: string | null) => (s ?? '').trim().replace(/\s+/g, ' ');

/** «6900000000» and «+30 690 000 0000» are the same phone (last 10 digits, like the staged D2 match). */
export function samePhone(a?: string | null, b?: string | null): boolean {
  const x = digits(a), y = digits(b);
  return x === y || (x.length >= 10 && y.length >= 10 && x.slice(-10) === y.slice(-10));
}

/** What to write to the lead after the customer was saved. Empty object = nothing to do. */
export function leadSyncPatch(customer: SyncCustomer, lead: SyncLead): LeadSyncPatch {
  const patch: LeadSyncPatch = {};
  const name = clean(customer.full_name);
  if (name && name.toLowerCase() !== clean(lead.full_name ?? lead.client_name).toLowerCase()) patch.full_name = name;
  const phone = clean(customer.phone);
  if (phone && !samePhone(phone, lead.phone)) patch.phone = phone;
  const email = clean(customer.email);
  if (email && !PLACEHOLDER_EMAIL.test(email) && email.toLowerCase() !== clean(lead.email).toLowerCase()) patch.email = email;
  return patch;
}

export interface LeadSyncResult { linked: number; updated: number; failed: string[] }

/** Greek text for the screen when the second write failed; null when there is nothing to warn about. */
export function syncWarningText(r: LeadSyncResult): string | null {
  if (r.failed.length === 0) return null;
  return `Τα στοιχεία του πελάτη αποθηκεύτηκαν, αλλά δεν ενημερώθηκε το lead από το οποίο προήλθε. ${r.failed[0]}`;
}

/** Toast after a customer save: says honestly what happened to the lead. */
export function syncToast(r: LeadSyncResult): { text: string; tone: 'ok' | 'bad' } {
  if (r.failed.length) return { text: 'Τα στοιχεία αποθηκεύτηκαν· το lead δεν ενημερώθηκε', tone: 'bad' };
  if (r.updated > 0) return { text: 'Τα στοιχεία αποθηκεύτηκαν και στο lead', tone: 'ok' };
  return { text: 'Τα στοιχεία αποθηκεύτηκαν', tone: 'ok' };
}
