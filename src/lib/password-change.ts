// A signed-in user (Admin / Back Office or Sales Agent) changes their OWN password. Pure and injectable so it is tested against a fake Auth client.
// The ONLY way the password changes is Supabase Auth's own flow: auth.updateUser({ password, current_password, nonce }) on the user's own session.
// Nothing here reads, stores, logs or forwards a password: not to a table, not to an audit row, not to the console, not to storage.
// Never use the service role, never update auth.users, never verify the current password in the browser instead of in Auth.
import { MIN_PASSWORD_LENGTH } from './password-rules';

/** Auth error as the SDK reports it (only the fields this module reads). `reasons` accompanies `weak_password`. */
type AuthError = { code?: string; status?: number; name?: string; message?: string; reasons?: string[] } | null;
export interface PasswordAuthLike {
  /** `current_password` (snake case, as in the installed auth-js typings) is verified by Auth when «Require current password when updating» is on; `nonce` answers a reauthentication. */
  updateUser(attrs: { password: string; current_password?: string; nonce?: string }): Promise<{ data?: unknown; error: AuthError }>;
  /** Sends a one-time code (nonce) to the account's e-mail address. Only ever called after an explicit click. */
  reauthenticate(): Promise<{ data?: unknown; error: AuthError }>;
}

export type PasswordChangeOutcome =
  | 'changed' | 'current_wrong' | 'current_required' | 'weak' | 'same' | 'reauth_needed' | 'reauth_invalid'
  | 'mfa_required' | 'session' | 'rate_limited' | 'network' | 'failed';
export interface PasswordChangeResult { outcome: PasswordChangeOutcome; reasons?: string[] }

/** Maps the SDK error to what the person should do next. Codes are GoTrue v2.197.0's (verified in its source), not message text. */
export function classifyPasswordError(error: NonNullable<AuthError>): PasswordChangeOutcome {
  switch (error.code) {
    case 'current_password_invalid': return 'current_wrong';
    case 'current_password_required': return 'current_required';
    case 'weak_password': return 'weak';
    case 'same_password': return 'same';
    case 'reauthentication_needed': return 'reauth_needed';
    case 'reauthentication_not_valid': return 'reauth_invalid';
    case 'insufficient_aal': return 'mfa_required';
    case 'session_not_found': case 'session_expired': case 'bad_jwt': case 'no_authorization': case 'refresh_token_not_found': case 'refresh_token_already_used': case 'user_not_found':
      return 'session';
    case 'over_request_rate_limit': case 'over_email_send_rate_limit': return 'rate_limited';
    default: break;
  }
  if (error.name === 'AuthSessionMissingError') return 'session';
  if (error.name === 'AuthWeakPasswordError') return 'weak';
  if (error.status === 429) return 'rate_limited';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'network';
  if (error.status === 401) return 'session';
  return 'failed';
}

/** One request: the new password, with the current one (and the nonce when Auth asked for a reauthentication). Never throws, never retries. */
export async function changePassword(auth: PasswordAuthLike, input: { current: string; next: string; nonce?: string }): Promise<PasswordChangeResult> {
  if (!input.current) return { outcome: 'current_required' };
  if (input.next === input.current) return { outcome: 'same' };
  try {
    const nonce = input.nonce?.trim();
    const { error } = await auth.updateUser({ password: input.next, current_password: input.current, ...(nonce ? { nonce } : {}) });
    if (!error) return { outcome: 'changed' };
    const outcome = classifyPasswordError(error);
    return outcome === 'weak' && Array.isArray(error.reasons) ? { outcome, reasons: error.reasons.filter((r) => typeof r === 'string') } : { outcome };
  } catch {
    return { outcome: 'network' };
  }
}

export type ReauthOutcome = 'sent' | 'session' | 'rate_limited' | 'network' | 'failed';
/** Asks Auth to e-mail a one-time code. A single, explicit action: the caller locks the button before this runs. */
export async function requestReauthCode(auth: PasswordAuthLike): Promise<ReauthOutcome> {
  try {
    const { error } = await auth.reauthenticate();
    if (!error) return 'sent';
    const o = classifyPasswordError(error);
    return o === 'session' || o === 'rate_limited' || o === 'network' ? o : 'failed';
  } catch {
    return 'network';
  }
}

/** The single gate to an Auth request from this form: nothing in flight and no lock running. */
export const maySubmit = (inFlight: boolean, lockedUntil: number, now: number): boolean => !inFlight && now >= lockedUntil;
/** How long the form stays locked after an attempt. No countdown is shown: Auth names no wait for these errors. */
export function lockMsAfter(outcome: PasswordChangeOutcome | ReauthOutcome): number {
  if (outcome === 'rate_limited') return 60_000;
  if (outcome === 'sent') return 60_000; // the e-mail was sent: one code at a time (each new request invalidates the previous one)
  if (outcome === 'reauth_needed') return 0; // not a failed guess: the next step (a new sign-in, or a code) must be possible straight away
  return 2_000; // a wrong current password must not be hammered by a held-down key or a double click
}

/* ───────── Feedback shown before anything is sent ───────── */
export interface Requirement { id: 'length' | 'mix' | 'differs' | 'match'; label: string; met: boolean }
export function passwordRequirements(current: string, next: string, confirm: string): Requirement[] {
  return [
    { id: 'length', label: `Τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες`, met: next.length >= MIN_PASSWORD_LENGTH && !/^(.)\1+$/.test(next) },
    { id: 'mix', label: 'Γράμματα και αριθμοί', met: /[A-Za-zΑ-Ωα-ω]/.test(next) && /[0-9]/.test(next) },
    { id: 'differs', label: 'Διαφορετικός από τον τρέχοντα', met: next.length > 0 && current.length > 0 && next !== current },
    { id: 'match', label: 'Ίδιος στα δύο πεδία', met: next.length > 0 && next === confirm },
  ];
}
/** The form may be submitted: every requirement met and the current password filled in. (Auth still decides.) */
export const canSubmitPassword = (current: string, next: string, confirm: string): boolean => current.length > 0 && passwordRequirements(current, next, confirm).every((r) => r.met);

export type StrengthLevel = 0 | 1 | 2 | 3 | 4;
export interface Strength { level: StrengthLevel; label: string }
const LABELS: Record<StrengthLevel, string> = { 0: 'Πολύ αδύναμος', 1: 'Αδύναμος', 2: 'Μέτριος', 3: 'Καλός', 4: 'Πολύ ισχυρός' };
const COMMON = ['password', 'passw0rd', 'qwerty', 'letmein', 'welcome', 'admin', 'abc123', '123456', 'kodikos', 'κωδικός', 'κωδικος', 'atlas', 'hlektrismos', 'ηλεκτρισμός', 'powerfor', 'iloveyou'];
/** A guide, not a gate: it rewards length and variety and caps passwords built from common words, runs or the person's own e-mail. */
export function passwordStrength(pw: string, context: string[] = []): Strength {
  if (!pw) return { level: 0, label: '' };
  const lower = pw.toLowerCase();
  let score = 0;
  if (pw.length >= 10) score += 1;
  if (pw.length >= 12) score += 1;
  if (pw.length >= 16) score += 1;
  const classes = [/[a-zα-ωά-ώ]/.test(pw), /[A-ZΑ-ΩΆ-Ώ]/.test(pw), /[0-9]/.test(pw), /[^A-Za-zΑ-Ωα-ωά-ώΆ-Ώ0-9]/.test(pw)].filter(Boolean).length;
  if (classes >= 3) score += 1;
  if (/(.)\1{2,}/.test(pw) || /(abc|bcd|cde|123|234|345|456|567|678|789|qwe|wer|ert)/i.test(pw)) score -= 1;
  let cap: StrengthLevel = 4;
  if (/^[0-9]+$/.test(pw)) cap = 0;
  const words = [...COMMON, ...context.map((c) => c.toLowerCase()).filter((c) => c.length >= 4)];
  if (words.some((w) => lower.includes(w))) cap = Math.min(cap, 1) as StrengthLevel;
  if (pw.length < MIN_PASSWORD_LENGTH) cap = Math.min(cap, 1) as StrengthLevel;
  const level = Math.max(0, Math.min(score, cap, 4)) as StrengthLevel;
  return { level, label: LABELS[level] };
}

/* ───────── Messages (Greek). Built from the outcome, never from the raw Auth message, so a password can not leak into the page. ───────── */
const WEAK_REASON: Record<string, string> = {
  length: 'είναι πολύ σύντομος για την πολιτική ασφαλείας',
  characters: 'χρειάζεται συνδυασμός χαρακτήρων (π.χ. πεζά, κεφαλαία, αριθμοί)',
  pwned: 'εμφανίζεται σε γνωστές διαρροές κωδικών',
};
export const PASSWORD_CHANGE_TEXT: Record<PasswordChangeOutcome, { tone: 'ok' | 'err'; text: string }> = {
  changed: { tone: 'ok', text: 'Ο κωδικός πρόσβασης άλλαξε. Παραμένετε συνδεδεμένοι σε αυτή τη συσκευή· οι υπόλοιπες συσκευές θα ζητήσουν νέα σύνδεση με τον νέο κωδικό.' },
  current_wrong: { tone: 'err', text: 'Ο τρέχων κωδικός δεν είναι σωστός. Ο κωδικός δεν άλλαξε.' },
  current_required: { tone: 'err', text: 'Συμπληρώστε τον τρέχοντα κωδικό πρόσβασης.' },
  weak: { tone: 'err', text: 'Ο νέος κωδικός απορρίφθηκε ως αδύναμος από την υπηρεσία ασφαλείας. Επιλέξτε μακρύτερο και πιο ασυνήθιστο κωδικό.' },
  same: { tone: 'err', text: 'Ο νέος κωδικός πρέπει να διαφέρει από τον τρέχοντα.' },
  reauth_needed: { tone: 'err', text: 'Για λόγους ασφαλείας απαιτείται νέα επαλήθευση, γιατί η σύνδεσή σας είναι παλαιότερη από 24 ώρες. Συνδεθείτε ξανά ή ζητήστε κωδικό επαλήθευσης στο email σας και συμπληρώστε τον παρακάτω.' },
  reauth_invalid: { tone: 'err', text: 'Ο κωδικός επαλήθευσης δεν είναι έγκυρος ή έχει λήξει. Ζητήστε νέο κωδικό και χρησιμοποιήστε το πιο πρόσφατο email.' },
  mfa_required: { tone: 'err', text: 'Για αυτή την ενέργεια απαιτείται πρόσθετη επαλήθευση (MFA). Ο κωδικός δεν άλλαξε.' },
  session: { tone: 'err', text: 'Η σύνδεσή σας έληξε. Συνδεθείτε ξανά και δοκιμάστε πάλι. Ο κωδικός δεν άλλαξε.' },
  rate_limited: { tone: 'err', text: 'Πάρα πολλές προσπάθειες. Περιμένετε λίγο πριν δοκιμάσετε ξανά. Ο κωδικός δεν άλλαξε.' },
  network: { tone: 'err', text: 'Δεν λάβαμε επιβεβαίωση από την υπηρεσία (πρόβλημα σύνδεσης). Αν ο κωδικός δεν άλλαξε, δοκιμάστε ξανά· αν η νέα δοκιμή πει ότι ο τρέχων κωδικός είναι λάθος, ίσως άλλαξε ήδη, οπότε δοκιμάστε τον νέο.' },
  failed: { tone: 'err', text: 'Ο κωδικός δεν άλλαξε. Δοκιμάστε ξανά.' },
};
export function passwordChangeMessage(r: PasswordChangeResult): { tone: 'ok' | 'err'; text: string } {
  const base = PASSWORD_CHANGE_TEXT[r.outcome];
  if (r.outcome !== 'weak' || !r.reasons?.length) return base;
  const why = r.reasons.map((x) => WEAK_REASON[x]).filter(Boolean);
  return why.length ? { tone: 'err', text: `${base.text} Ο κωδικός ${why.join(' και ')}.` } : base;
}
export const REAUTH_TEXT: Record<ReauthOutcome, { tone: 'ok' | 'err'; text: string }> = {
  sent: { tone: 'ok', text: 'Στείλαμε κωδικό επαλήθευσης στο email του λογαριασμού σας. Χρησιμοποιήστε το πιο πρόσφατο email (κάθε νέος κωδικός ακυρώνει τον προηγούμενο).' },
  session: { tone: 'err', text: 'Η σύνδεσή σας έληξε. Συνδεθείτε ξανά και δοκιμάστε πάλι.' },
  rate_limited: { tone: 'err', text: 'Το όριο αποστολής email έχει εξαντληθεί προσωρινά. Συνδεθείτε ξανά (χωρίς email) ή δοκιμάστε αργότερα.' },
  network: { tone: 'err', text: 'Δεν υπάρχει σύνδεση με την υπηρεσία. Δοκιμάστε ξανά.' },
  failed: { tone: 'err', text: 'Δεν στάλθηκε κωδικός επαλήθευσης. Συνδεθείτε ξανά ή δοκιμάστε αργότερα.' },
};
