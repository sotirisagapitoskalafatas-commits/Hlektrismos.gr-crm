// Changing the login e-mail of the shared Admin account from inside the CRM. Pure and injectable so it is tested against a fake Auth client.
// The ONLY way the address changes is Supabase Auth's own flow: auth.updateUser({ email }). That keeps the same user id (so the profile, role,
// assignments, customer ownership and audit history stay attached), sends the verification mail(s), and leaves the old address in force until the
// change is confirmed. Never update auth.users by SQL, never create another user, never touch the role.
import { looksLikeEmail } from './password-rules';

/** The CRM's own address. Used as the e-mail link target on purpose: the public website is never an Auth redirect, and a Preview URL is not allow-listed. */
export const CRM_ORIGIN = 'https://hlektrismos-crm.vercel.app';
export const EMAIL_REDIRECT_TO = `${CRM_ORIGIN}/`;

export type EmailChangeOutcome = 'invalid' | 'unchanged' | 'pending' | 'resent' | 'duplicate' | 'cooldown' | 'provider_limit' | 'not_authorized' | 'recipient_rejected' | 'rate_limited' | 'failed';
/** What an attempt did, plus the number of seconds the server said to wait when it said so. */
export interface EmailChangeResult { outcome: EmailChangeOutcome; retryAfter: number | null; /** Only for 'recipient_rejected': the address Auth refused to mail. */ address?: string }

type AuthError = { code?: string; status?: number; message?: string } | null;
export interface AuthLike {
  updateUser(attrs: { email: string }, opts: { emailRedirectTo: string }): Promise<{ data?: unknown; error: AuthError }>;
  /** Re-sends the verification mail(s) of the change that is ALREADY pending. The server looks the account up by its CURRENT address (not the new one). */
  resend(params: { type: 'email_change'; email: string; options?: { emailRedirectTo?: string } }): Promise<{ data?: unknown; error: AuthError }>;
  getUser(): Promise<{ data: { user: { id: string; email?: string | null; new_email?: string | null } | null }; error: AuthError }>;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** null when the address may be submitted. */
export function validateNewEmail(next: string, current: string): 'invalid' | 'unchanged' | null {
  if (next.trim().length > 254 || !looksLikeEmail(next)) return 'invalid'; // 254 is the maximum length of an address
  if (same(next, current)) return 'unchanged';
  return null;
}

/** The wait the server named («…you can only request this after 59 seconds»), or null when it named none. Never invented. */
export function retryAfterSeconds(error: NonNullable<AuthError>): number | null {
  const m = /after\s+(\d{1,4})\s+seconds?/i.exec(error.message ?? '');
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 3600 ? n : null;
}

/**
 * Supabase answers BOTH a per-account cooldown and the project's e-mail quota with HTTP 429 and the same code (over_email_send_rate_limit); only the
 * message differs: «…after N seconds» (this account asked too soon) against «email rate limit exceeded» (the built-in sender's quota is used up).
 */
export function classifyEmailChangeError(error: NonNullable<AuthError>): EmailChangeOutcome {
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (error.code === 'email_address_invalid') return 'recipient_rejected'; // GoTrue: the mailer's recipient validation failed. No mail was sent.
  if (error.code === 'email_exists' || /already (been )?registered|already exists|email.*exists|user.*exists/.test(text)) return 'duplicate';
  if (error.code === 'email_address_not_authorized' || /email address not authorized|not authorized/.test(text)) return 'not_authorized';
  if (retryAfterSeconds(error) !== null) return 'cooldown';
  if (/email rate limit exceeded/.test(text)) return 'provider_limit';
  if (error.status === 429 || error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' || /rate.?limit|too many/.test(text)) return 'rate_limited';
  if (error.code === 'email_address_invalid' || /invalid.*email|email.*invalid/.test(text)) return 'invalid';
  return 'failed';
}

/** GoTrue words it «Email address "x" is invalid»; the address is only echoed back to the Admin who owns this account. */
export function rejectedAddress(error: NonNullable<AuthError>): string | null {
  const m = /email address\s+"([^"\s]{3,254})"\s+is invalid/i.exec(error.message ?? '');
  return m ? m[1] : null;
}
const toResult = (error: NonNullable<AuthError>): EmailChangeResult => {
  const outcome = classifyEmailChangeError(error);
  const address = outcome === 'recipient_rejected' ? rejectedAddress(error) : null;
  return { outcome, retryAfter: retryAfterSeconds(error), ...(address ? { address } : {}) };
};

/**
 * One user action is ONE request, and a refusal never starts another. After every attempt the form locks for as long as the server named, or, when it
 * named nothing, for a safeguard of OUR OWN (said so on screen, never presented as the provider's time). Persisted, so a reload does not unlock it.
 */
export const SEND_FLOOR_MS = 60_000; // after an accepted request: the same pause Auth itself applies per account
export const REFUSED_LOCK_MS = 15 * 60_000; // after a refusal that retrying cannot fix quickly (quota, recipient, sender restriction)
export type EmailChangeLock = { until: number; kind: 'server' | 'app' };
export function lockAfter(r: EmailChangeResult, now: number): EmailChangeLock {
  if (r.retryAfter) return { until: now + r.retryAfter * 1000, kind: 'server' };
  if (r.outcome === 'pending' || r.outcome === 'resent' || r.outcome === 'failed' || r.outcome === 'cooldown') return { until: now + SEND_FLOOR_MS, kind: 'app' };
  if (r.outcome === 'invalid' || r.outcome === 'unchanged' || r.outcome === 'duplicate') return { until: now, kind: 'app' }; // a typo is not an Auth request: nothing to protect
  return { until: now + REFUSED_LOCK_MS, kind: 'app' };
}
/** The only gate to an Auth e-mail request: nothing in flight and no lock running. Every click, tab and retry goes through it. */
export const mayRequest = (lock: EmailChangeLock | null, inFlight: boolean, now: number): boolean => !inFlight && !(lock && now < lock.until);
type KV = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
export const lockKey = (activeEmail: string) => `atlas.email-change.lock:${activeEmail.trim().toLowerCase()}`;
export function readLock(store: KV | null, key: string, now: number): EmailChangeLock | null {
  try {
    const v = JSON.parse(store?.getItem(key) ?? 'null') as Partial<EmailChangeLock> | null;
    return v && typeof v.until === 'number' && v.until > now && v.until <= now + 24 * 3_600_000 && (v.kind === 'server' || v.kind === 'app') ? { until: v.until, kind: v.kind } : null;
  } catch { return null; }
}
export function writeLock(store: KV | null, key: string, lock: EmailChangeLock, now: number): void {
  try { if (lock.until > now) store?.setItem(key, JSON.stringify(lock)); else store?.removeItem(key); } catch { /* storage unavailable: the in-memory lock still holds */ }
}

/** What to do for the address the Admin typed, given what Auth already holds. One request in flight at a time is the caller's job; this decides WHICH call. */
export type EmailChangePlan = 'new' | 'resend' | 'replace';
export function planEmailChange(pending: string | null, next: string): EmailChangePlan {
  if (!pending) return 'new';
  return !next.trim() || same(next, pending) ? 'resend' : 'replace';
}

/** Starts a NEW change (or replaces the pending one). 'pending' means the verification mail(s) were sent; the address is NOT changed yet. */
export async function startEmailChange(auth: AuthLike, current: string, next: string): Promise<EmailChangeResult> {
  const problem = validateNewEmail(next, current);
  if (problem) return { outcome: problem, retryAfter: null };
  try {
    const { error } = await auth.updateUser({ email: next.trim() }, { emailRedirectTo: EMAIL_REDIRECT_TO });
    return error ? toResult(error) : { outcome: 'pending', retryAfter: null };
  } catch {
    return { outcome: 'failed', retryAfter: null };
  }
}

/** Re-sends the mails of the change that is already pending. Creates no new request and keeps the pending address as it is. */
export async function resendEmailChange(auth: AuthLike, activeEmail: string): Promise<EmailChangeResult> {
  try {
    const { error } = await auth.resend({ type: 'email_change', email: activeEmail.trim(), options: { emailRedirectTo: EMAIL_REDIRECT_TO } });
    return error ? toResult(error) : { outcome: 'resent', retryAfter: null };
  } catch {
    return { outcome: 'failed', retryAfter: null };
  }
}

/** Kept for callers that only need the outcome. */
export async function requestEmailChange(auth: AuthLike, current: string, next: string): Promise<EmailChangeOutcome> {
  return (await startEmailChange(auth, current, next)).outcome;
}

export interface Identity { id: string; email: string; pendingEmail: string | null }

/**
 * Re-reads the user from the Auth server (not from the cached session), so a change confirmed in another tab or on another device shows up.
 * `pendingEmail` is set while a change waits for confirmation; the address in `email` stays the active one until then.
 */
export async function readIdentity(auth: AuthLike): Promise<Identity | null> {
  try {
    const { data, error } = await auth.getUser();
    const u = data.user;
    if (error || !u?.email) return null;
    const pending = u.new_email && !same(u.new_email, u.email) ? u.new_email : null;
    return { id: u.id, email: u.email, pendingEmail: pending };
  } catch {
    return null;
  }
}

export const EMAIL_CHANGE_TEXT: Record<EmailChangeOutcome, { tone: 'ok' | 'err'; text: string }> = {
  invalid: { tone: 'err', text: 'Συμπληρώστε μια έγκυρη διεύθυνση email.' },
  unchanged: { tone: 'err', text: 'Η νέα διεύθυνση είναι ίδια με την τρέχουσα.' },
  duplicate: { tone: 'err', text: 'Υπάρχει ήδη λογαριασμός με αυτή τη διεύθυνση. Επιλέξτε άλλη.' },
  cooldown: { tone: 'err', text: 'Ζητήσατε επιβεβαίωση πολύ πρόσφατα. Περιμένετε λίγο πριν ζητήσετε ξανά.' },
  provider_limit: {
    tone: 'err',
    text: 'Το όριο αποστολής email της υπηρεσίας μας (ενσωματωμένος αποστολέας Supabase, ανά ώρα για όλο το σύστημα) έχει εξαντληθεί προσωρινά. Δεν χρειάζεται νέο αίτημα: τα email που έχουν ήδη σταλεί παραμένουν έγκυρα για την περίοδο ισχύος τους, οπότε ελέγξτε και τα ανεπιθύμητα και των δύο διευθύνσεων. Αν δεν έχετε λάβει κάτι, δοκιμάστε «Επαναποστολή» αργότερα. Η μόνιμη λύση είναι δικός μας SMTP διακομιστής.',
  },
  not_authorized: {
    tone: 'err',
    text: 'Ο ενσωματωμένος αποστολέας δοκιμών στέλνει μόνο σε διευθύνσεις μελών της ομάδας του έργου. Η διεύθυνση πρέπει να προστεθεί στην ομάδα ή να ρυθμιστεί δικός μας SMTP διακομιστής.',
  },
  recipient_rejected: {
    tone: 'err',
    text: 'Η υπηρεσία ταυτοποίησης (Supabase Auth) απέρριψε μία διεύθυνση ως παραλήπτη (κωδικός email_address_invalid) και δεν έστειλε κανένα email. Δεν είναι πρόβλημα της φόρμας ούτε όριο αποστολής. Με ενεργή την ασφαλή αλλαγή email χρειάζεται επιβεβαίωση και από την τρέχουσα διεύθυνση σύνδεσης· όσο εκείνη δεν μπορεί να λάβει email, η αλλαγή δεν ολοκληρώνεται. Το εκκρεμές αίτημα δεν χάθηκε.',
  },
  rate_limited: { tone: 'err', text: 'Πάρα πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγα λεπτά.' },
  resent: {
    tone: 'ok',
    text: 'Στείλαμε ξανά τα email επιβεβαίωσης. Με ενεργή την ασφαλή αλλαγή email, ανοίξτε τον σύνδεσμο και στις δύο διευθύνσεις (τρέχουσα και νέα): η αλλαγή δεν έχει ολοκληρωθεί πριν ανοιχτούν και οι δύο. Ελέγξτε και τα ανεπιθύμητα.',
  },
  failed: { tone: 'err', text: 'Η αλλαγή δεν ξεκίνησε. Ελέγξτε τη διεύθυνση ή δοκιμάστε αργότερα.' },
  pending: {
    tone: 'ok',
    text: 'Στείλαμε email επιβεβαίωσης. Με ενεργή την ασφαλή αλλαγή email, η αλλαγή ολοκληρώνεται όταν ανοίξετε τον σύνδεσμο και στις ΔΥΟ διευθύνσεις: την τρέχουσα και τη νέα. Μέχρι τότε η σύνδεση γίνεται με την τρέχουσα διεύθυνση.',
  },
};

/** The text for a result: the server's own wait is quoted when it gave one, and nothing is made up when it did not. */
export function emailChangeMessage(r: EmailChangeResult): { tone: 'ok' | 'err'; text: string } {
  if (r.outcome === 'cooldown' && r.retryAfter) return { tone: 'err', text: `Ζητήσατε επιβεβαίωση πολύ πρόσφατα. Δοκιμάστε ξανά σε ${r.retryAfter} δευτερόλεπτα.` };
  if (r.outcome === 'recipient_rejected' && r.address) return { tone: 'err', text: EMAIL_CHANGE_TEXT.recipient_rejected.text.replace('μία διεύθυνση', `τη διεύθυνση ${r.address}`) };
  return EMAIL_CHANGE_TEXT[r.outcome];
}

/** Said before a re-send, because Auth issues NEW links and resets the confirmations already given (GoTrue sendEmailChange). */
export const RESEND_WARNING = 'Η επαναποστολή δημιουργεί νέους συνδέσμους και ακυρώνει τους προηγούμενους. Ό,τι έχει ήδη επιβεβαιωθεί μηδενίζεται: θα χρειαστεί ξανά επιβεβαίωση και στις δύο διευθύνσεις. Πατήστε ξανά μόνο αν δεν έχετε κανένα έγκυρο email επιβεβαίωσης.';
