// What an e-mailed Auth link tells the person when it did NOT simply sign them in: an expired, invalid or already-used link, the first half of
// a two-address e-mail change, or a finished e-mail change. Supabase puts these in the URL hash (#error=…&error_code=otp_expired, #message=…).
// Captured before the Supabase client reads the hash (see auth-link-boot), shown once, then forgotten. No token is ever read or stored here.
const KEY = 'atlas.auth.notice';

export interface AuthNotice { tone: 'ok' | 'err' | 'info'; text: string }

export const NOTICE_LINK_FAILED: AuthNotice = {
  tone: 'err',
  text: 'Ο σύνδεσμος επιβεβαίωσης έχει λήξει, δεν είναι έγκυρος ή έχει ήδη χρησιμοποιηθεί. Ζητήστε νέο σύνδεσμο: από τη σελίδα σύνδεσης («Ξέχασα τον κωδικό μου») ή, για αλλαγή email, από τις Ρυθμίσεις του λογαριασμού.',
};
export const NOTICE_FIRST_CONFIRMED: AuthNotice = {
  tone: 'info',
  text: 'Η πρώτη επιβεβαίωση έγινε. Η αλλαγή email ολοκληρώνεται όταν ανοίξετε και τον σύνδεσμο που στάλθηκε στην άλλη διεύθυνση (παλιά ή νέα).',
};
export const NOTICE_EMAIL_CHANGED: AuthNotice = {
  tone: 'ok',
  text: 'Η αλλαγή email επιβεβαιώθηκε. Από τώρα συνδέεστε με τη νέα διεύθυνση. Ο λογαριασμός, ο ρόλος και το ιστορικό παραμένουν ίδια.',
};

interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
const session = (): KV | null => { try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; } };

/** The notice a URL hash calls for, or null for anything else (app routes like `#/app`, a normal sign-in link, nothing at all). */
export function parseAuthNotice(hash: string): AuthNotice | null {
  const h = hash.replace(/^#/, '');
  if (!h || h.startsWith('/')) return null;
  const p = new URLSearchParams(h);
  if (p.has('access_token')) return null; // a usable link: the sign-in handles it
  if (p.has('error') || p.has('error_code') || p.has('error_description')) return NOTICE_LINK_FAILED;
  if (/proceed to confirm link sent to the other email/i.test(p.get('message') ?? '')) return NOTICE_FIRST_CONFIRMED;
  return null;
}

export function pushAuthNotice(n: AuthNotice, storage: KV | null = session()): void {
  try { storage?.setItem(KEY, JSON.stringify(n)); } catch { /* storage blocked: the notice is simply not shown */ }
  try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('atlas:auth-notice')); } catch { /* non-browser */ }
}

/** Notes the notice for this URL and reports whether the hash was one of ours (so the caller can clear it and not repeat it on refresh). */
export function captureAuthNotice(hash: string = typeof window !== 'undefined' ? window.location.hash : '', storage: KV | null = session()): boolean {
  const n = parseAuthNotice(hash);
  if (n) pushAuthNotice(n, storage);
  return !!n;
}

/** Read once and forget. */
export function takeAuthNotice(storage: KV | null = session()): AuthNotice | null {
  try {
    const raw = storage?.getItem(KEY) ?? null;
    storage?.removeItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as AuthNotice;
    return v && typeof v.text === 'string' && ['ok', 'err', 'info'].includes(v.tone) ? v : null;
  } catch { return null; }
}
