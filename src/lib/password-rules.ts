// Rules for choosing a new password (reset page). The real policy is enforced by Supabase Auth; this only gives the
// person clear Greek feedback before the request is sent. Returns [] when the password may be submitted.
export const MIN_PASSWORD_LENGTH = 10;

export function passwordIssues(password: string, confirm: string): string[] {
  const issues: string[] = [];
  if (password.length < MIN_PASSWORD_LENGTH) issues.push(`Ο κωδικός πρέπει να έχει τουλάχιστον ${MIN_PASSWORD_LENGTH} χαρακτήρες.`);
  else if (/^(.)\1+$/.test(password)) issues.push('Ο κωδικός δεν μπορεί να αποτελείται από έναν επαναλαμβανόμενο χαρακτήρα.');
  else if (!/[A-Za-zΑ-Ωα-ω]/.test(password) || !/[0-9]/.test(password)) issues.push('Συνδυάστε γράμματα και αριθμούς.');
  if (confirm.length > 0 && password !== confirm) issues.push('Οι δύο κωδικοί δεν ταιριάζουν.');
  if (confirm.length === 0 && issues.length === 0) issues.push('Επαναλάβετε τον κωδικό.');
  return issues;
}

/** Basic shape check so an obviously wrong address is caught before a request is made (no account lookup). */
export const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
