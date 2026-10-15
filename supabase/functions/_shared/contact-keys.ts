// Contact-point normalisation. MUST match public.contact_phone_key / public.contact_email_key in
// supabase/staged-migrations/phase3/09_contact_eligibility.sql (the tests check both on the same inputs).

/** Last 10 digits: "+30 210 123 4567", "00302101234567" and "2101234567" are the same number. */
export function phoneKey(p: string | null | undefined): string | null {
  const d = String(p ?? "").replace(/\D/g, "");
  return d ? d.slice(-10) : null;
}

/** Lower-cased, trimmed; the website's "no email given" placeholder is not a contact point. */
export function emailKey(e: string | null | undefined): string | null {
  const s = String(e ?? "").trim().toLowerCase();
  if (s.indexOf("@") < 1 || s.endsWith("@hlektrismos.local")) return null;
  return s;
}
