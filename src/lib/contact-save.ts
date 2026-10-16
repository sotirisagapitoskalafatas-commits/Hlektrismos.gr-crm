/* Case → «Στοιχεία επαφής» save (UNIFIED_CUSTOMER_FOLDER.md §3, D4). Pure helpers, no database access.
   - The customer gets first and last name when the columns exist (staged phase4/11), like the Customer page;
     the display name (full_name) is always kept in step.
   - A failed save is reported: the form stays open with a Greek message. */

export type ContactForm = {
  first_name: string; last_name: string; full_name: string;
  phone: string; email: string; address: string; city: string; postal_code: string; lat: string; lng: string;
};

const num = (v: string) => (v.trim() === '' ? null : Number(v));

/** Form values for a customer: first/last from the columns, else split from the display name. */
export function contactFormFrom(cust: { full_name?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null; address?: string | null; city?: string | null; postal_code?: string | null; lat?: number | null; lng?: number | null } | null | undefined,
  caseAddr: { address?: string | null; lat?: number | null; lng?: number | null }): ContactForm {
  const parts = (cust?.full_name ?? '').trim().split(/\s+/).filter(Boolean);
  const lat = caseAddr.lat ?? cust?.lat; const lng = caseAddr.lng ?? cust?.lng;
  return {
    first_name: cust?.first_name ?? parts[0] ?? '',
    last_name: cust?.last_name ?? parts.slice(1).join(' '),
    full_name: cust?.full_name ?? '',
    phone: cust?.phone ?? '', email: cust?.email ?? '',
    address: caseAddr.address || cust?.address || '', city: cust?.city ?? '', postal_code: cust?.postal_code ?? '',
    lat: lat == null ? '' : String(lat), lng: lng == null ? '' : String(lng),
  };
}

/** The name the form can save: with the name columns, first and/or last; without, the full name. */
export const contactNameOk = (f: ContactForm, names: boolean) => (names ? !!(f.first_name.trim() || f.last_name.trim()) : !!f.full_name.trim());

/** Customer patch. full_name is composed from first/last when the columns exist. */
export function customerPatch(f: ContactForm, names: boolean, fallbackName: string) {
  const composed = [f.first_name.trim(), f.last_name.trim()].filter(Boolean).join(' ');
  return {
    ...(names ? { first_name: f.first_name, last_name: f.last_name } : {}),
    full_name: (names ? composed : f.full_name.trim()) || fallbackName,
    phone: f.phone.trim() || null, email: f.email.trim() || null,
    address: f.address.trim() || null, city: f.city.trim() || null, postal_code: f.postal_code.trim() || null,
    lat: num(f.lat), lng: num(f.lng),
  };
}

/** Case patch: the case keeps its own address and point. */
export const casePatch = (f: ContactForm) => ({ address: f.address.trim(), lat: num(f.lat), lng: num(f.lng) });

/** Greek message when any part failed, null when everything was saved. */
export function contactSaveError(customerSaved: boolean, caseError: unknown): string | null {
  if (customerSaved && !caseError) return null;
  if (!customerSaved && caseError) return 'Τα στοιχεία δεν αποθηκεύτηκαν. Δοκιμάστε ξανά.';
  if (!customerSaved) return 'Τα στοιχεία του πελάτη δεν αποθηκεύτηκαν. Δοκιμάστε ξανά.';
  return 'Η διεύθυνση του case δεν αποθηκεύτηκε. Δοκιμάστε ξανά.';
}
