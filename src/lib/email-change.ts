// Changing the login e-mail of the shared Admin account from inside the CRM. Pure and injectable so it is tested against a fake Auth client.
// The ONLY way the address changes is Supabase Auth's own flow: auth.updateUser({ email }). That keeps the same user id (so the profile, role,
// assignments, customer ownership and audit history stay attached), sends the verification mail(s), and leaves the old address in force until the
// change is confirmed. Never update auth.users by SQL, never create another user, never touch the role.
import { looksLikeEmail } from './password-rules';

/** The CRM's own address. Used as the e-mail link target on purpose: the public website is never an Auth redirect, and a Preview URL is not allow-listed. */
export const CRM_ORIGIN = 'https://hlektrismos-crm.vercel.app';
export const EMAIL_REDIRECT_TO = `${CRM_ORIGIN}/`;

export type EmailChangeOutcome = 'invalid' | 'unchanged' | 'pending' | 'duplicate' | 'rate_limited' | 'failed';

type AuthError = { code?: string; status?: number; message?: string } | null;
export interface AuthLike {
  updateUser(attrs: { email: string }, opts: { emailRedirectTo: string }): Promise<{ data?: unknown; error: AuthError }>;
  getUser(): Promise<{ data: { user: { id: string; email?: string | null; new_email?: string | null } | null }; error: AuthError }>;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** null when the address may be submitted. */
export function validateNewEmail(next: string, current: string): 'invalid' | 'unchanged' | null {
  if (next.trim().length > 254 || !looksLikeEmail(next)) return 'invalid'; // 254 is the maximum length of an address
  if (same(next, current)) return 'unchanged';
  return null;
}

export function classifyEmailChangeError(error: NonNullable<AuthError>): EmailChangeOutcome {
  const text = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  if (error.code === 'email_exists' || /already (been )?registered|already exists|email.*exists|user.*exists/.test(text)) return 'duplicate';
  if (error.status === 429 || /rate.?limit|too many|seconds/.test(text)) return 'rate_limited';
  if (error.code === 'email_address_invalid' || /invalid.*email|email.*invalid/.test(text)) return 'invalid';
  return 'failed';
}

/** Starts the change. 'pending' means the verification mail(s) were sent; the address is NOT changed yet. */
export async function requestEmailChange(auth: AuthLike, current: string, next: string): Promise<EmailChangeOutcome> {
  const problem = validateNewEmail(next, current);
  if (problem) return problem;
  try {
    const { error } = await auth.updateUser({ email: next.trim() }, { emailRedirectTo: EMAIL_REDIRECT_TO });
    return error ? classifyEmailChangeError(error) : 'pending';
  } catch {
    return 'failed';
  }
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
  rate_limited: { tone: 'err', text: 'Πάρα πολλές προσπάθειες. Δοκιμάστε ξανά σε λίγα λεπτά.' },
  failed: { tone: 'err', text: 'Η αλλαγή δεν ξεκίνησε. Ελέγξτε τη διεύθυνση ή δοκιμάστε αργότερα.' },
  pending: {
    tone: 'ok',
    text: 'Στείλαμε email επιβεβαίωσης. Με ενεργή την ασφαλή αλλαγή email, η αλλαγή ολοκληρώνεται όταν ανοίξετε τον σύνδεσμο και στις ΔΥΟ διευθύνσεις: την τρέχουσα και τη νέα. Μέχρι τότε η σύνδεση γίνεται με την τρέχουσα διεύθυνση.',
  },
};
