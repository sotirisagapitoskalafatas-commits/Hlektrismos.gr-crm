/* Ασφάλεια & Έλεγχοι: the evidence model. PURE (no Supabase client, no env), so it can be tested without a browser.
   Rules this module enforces, and the tests pin:
   • «Επαληθευμένο» needs a live result from the real system (Production) with a time stamp. A local test, a document or a developer's note can never produce it.
   • Everything the browser cannot prove is «Εκκρεμεί χειροκίνητος έλεγχος» or «Δεν έχει επαληθευτεί ζωντανά», and says who has to do what.
   • «Αποδεκτός περιορισμός» is a documented decision (who, when), never a way to hide a finding.
   • Probes only READ. They never write, and they never put a secret value on the page (key NAMES at most). */

export type Status = 'verified' | 'action' | 'unverified' | 'manual' | 'accepted';
export const STATUS_TEXT: Record<Status, string> = {
  verified: 'Επαληθευμένο',
  action: 'Χρειάζεται ενέργεια',
  unverified: 'Δεν έχει επαληθευτεί ζωντανά',
  manual: 'Εκκρεμεί χειροκίνητος έλεγχος',
  accepted: 'Αποδεκτός περιορισμός',
};

/** Where the STATUS was established. 'none' = nobody has looked at the real system (local tests may still exist: see `local`). */
export type Env = 'production' | 'preview' | 'staging' | 'local' | 'none';
export const ENV_TEXT: Record<Env, string> = {
  production: 'Production (ζωντανά)',
  preview: 'Preview (δοκιμαστική έκδοση της εφαρμογής)',
  staging: 'Staging / άλλη βάση',
  local: 'Τοπικά (υπολογιστής προγραμματιστή)',
  none: 'Δεν έχει ελεγχθεί σε πραγματικό σύστημα',
};
export type Method = 'automated' | 'manual';
export const METHOD_TEXT: Record<Method, string> = { automated: 'Αυτόματος έλεγχος από αυτόν τον browser', manual: 'Χειροκίνητη επαλήθευση / καταγραφή' };

export type AreaId = 'anonymous' | 'isolation' | 'roles' | 'secrets' | 'workflow' | 'mfa' | 'backups' | 'functions';
export const AREAS: { id: AreaId; title: string; lead: string }[] = [
  { id: 'anonymous', title: '1. Ανώνυμη πρόσβαση', lead: 'Τι βλέπει ή κάνει κάποιος χωρίς σύνδεση, με το δημόσιο κλειδί.' },
  { id: 'isolation', title: '2. Απομόνωση ρόλων (συνδεδεμένοι χρήστες)', lead: 'Ότι ένας Sales Agent δεν βλέπει τα δεδομένα άλλου. Η άρνηση σε ανώνυμους δεν το αποδεικνύει.' },
  { id: 'roles', title: '3. Διαχείριση προνομιακών ρόλων', lead: 'Ότι κανείς δεν μπορεί να αυξήσει τον ρόλο του· οι ρόλοι είναι ακριβώς δύο.' },
  { id: 'secrets', title: '4. Προστασία μυστικών ενσωματώσεων', lead: 'Κλειδιά και διαπιστευτήρια μένουν στον server.' },
  { id: 'workflow', title: '5. Έλεγχοι ροής εργασίας / εγγράφων', lead: 'Κανόνες που εφαρμόζονται στις αλλαγές σταδίου.' },
  { id: 'mfa', title: '6. Έλεγχος ταυτότητας δύο παραγόντων (MFA)', lead: 'Για τον λογαριασμό Admin / Back Office.' },
  { id: 'backups', title: '7. Αντίγραφα ασφαλείας και επαναφορά', lead: 'Ότι υπάρχει τι να επαναφέρουμε και ότι η επαναφορά δουλεύει.' },
  { id: 'functions', title: '8. Ακεραιότητα Edge Functions', lead: 'Αναπτυγμένες εκδόσεις, μυστικά και δικαιώματα.' },
];

export interface Check {
  id: string;
  area: AreaId;
  label: string;
  /** What is being tested, in one sentence. */
  tests: string;
  status: Status;
  /** The actual result. */
  detail: string;
  /** When the status was established (ISO). null = never. */
  at: string | null;
  env: Env;
  method: Method;
  /** The evidence source: where a reviewer can look. */
  evidence: string;
  /** Local / document evidence that exists but does NOT make the status «Επαληθευμένο». */
  local?: string;
  /** Required next step; mandatory for every status except «Επαληθευμένο». */
  action: string | null;
  /** Who has to do it. */
  owner: 'Ιδιοκτήτης (Dashboard / SQL)' | 'Προγραμματιστής' | 'Admin' | null;
}

export const PRODUCTION_REF = 'nonaymiwdayfuulccxrl';
export const PRODUCTION_HOST = 'hlektrismos-crm.vercel.app';
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;
/**
 * WHERE a result comes from = the database the browser talks to AND the app that ran the probe.
 * Production needs both: the Production project reached from the Production address. A Preview build of the app that talks to the Production database,
 * or a dev server that does, reports what it saw but is labelled «preview» / «local» and can never verify anything.
 */
export function environmentOf(authUrl: string | undefined | null, appHost?: string | null): Env {
  const u = (authUrl ?? '').toLowerCase();
  if (!u) return 'none';
  if (!u.includes(PRODUCTION_REF)) return /localhost|127\.0\.0\.1|\[::1\]/.test(u) ? 'local' : 'staging';
  const h = (appHost ?? '').trim().toLowerCase();
  if (h === PRODUCTION_HOST) return 'production';
  if (LOCAL_HOST.test(h)) return 'local';
  return h ? 'preview' : 'none';
}

/** The same patterns as public.crm_setting_is_credential (phase2/05). A key whose NAME matches is treated as a credential. */
export const CREDENTIAL_KEY = /key|secret|password|passwd|token|credential|imap|smtp|vapi|twilio/i;
export const isCredentialKey = (k: string): boolean => CREDENTIAL_KEY.test(k);

/** `role` claim of a JWT, read without verifying it (the anon key is public). null when it is not a JWT. */
export function jwtRole(token: string | undefined | null): string | null {
  try {
    const part = (token ?? '').split('.')[1];
    if (!part) return null;
    const json = typeof atob === 'function' ? atob(part.replace(/-/g, '+').replace(/_/g, '/')) : Buffer.from(part, 'base64url').toString('utf8');
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === 'string' ? role : null;
  } catch { return null; }
}

/** What a reviewer may rely on. Returns the problems with a check; [] = the check is allowed to be shown as it is. */
export function validateCheck(c: Check): string[] {
  const p: string[] = [];
  for (const k of ['id', 'label', 'tests', 'detail', 'evidence'] as const) if (!c[k]?.trim()) p.push(`${c.id || '?'}: ${k} is empty`);
  if (!AREAS.some((a) => a.id === c.area)) p.push(`${c.id}: unknown area`);
  if (c.status === 'verified') {
    if (c.env !== 'production') p.push(`${c.id}: «verified» needs a Production result (got ${c.env})`);
    if (!c.at || Number.isNaN(Date.parse(c.at))) p.push(`${c.id}: «verified» needs the time it was checked`);
  } else if (!c.action?.trim() || !c.owner) p.push(`${c.id}: «${c.status}» needs a next action and an owner`);
  if (c.status === 'accepted' && !/\b(20\d\d|\d{1,2}\/\d{1,2}\/20\d\d)\b/.test(`${c.detail} ${c.evidence}`)) p.push(`${c.id}: «accepted» must name the decision and its date`);
  if ((c.env === 'none' || c.env === 'local') && c.status === 'verified') p.push(`${c.id}: a local or missing environment can not be verified`);
  return p;
}

export function summarize(checks: Check[]): Record<Status, number> {
  const out: Record<Status, number> = { verified: 0, action: 0, unverified: 0, manual: 0, accepted: 0 };
  for (const c of checks) out[c.status] += 1;
  return out;
}

/* ───────────────────────── live probes (read-only; every dependency is injected) ───────────────────────── */
type Err = { code?: string; message?: string } | null;
export interface ProbeDeps {
  authUrl: string; anonKey: string; fetcher: typeof fetch; now: () => string;
  /** window.location.hostname of the app that runs the probes. */
  appHost: string;
  /** The browser WITHOUT a session. */
  anon: {
    from(t: string): { select(c: string): { limit(n: number): PromiseLike<{ data: unknown[] | null; error: Err }> } };
    storage: { from(b: string): { list(p: string, o: { limit: number }): PromiseLike<{ data: unknown[] | null; error: Err }> } };
  };
  /** The signed-in Admin session. */
  user: {
    from(t: string): { select(c: string): PromiseLike<{ data: Record<string, unknown>[] | null; error: Err }> };
    rpc(fn: string): PromiseLike<{ data: unknown; error: Err }>;
    auth: { mfa: {
      listFactors(): PromiseLike<{ data: { totp?: { status?: string }[] } | null; error: Err }>;
      getAuthenticatorAssuranceLevel(): PromiseLike<{ data: { currentLevel?: string | null; nextLevel?: string | null } | null; error: Err }>;
    } };
  };
}

const ANON_TABLES: [string, string][] = [
  ['leads', 'Leads'], ['customers', 'Πελάτες'], ['cases', 'Cases'], ['case_documents', 'Έγγραφα cases'], ['follow_ups', 'Follow-ups'], ['profiles', 'Προφίλ προσωπικού'],
  ['activity_log', 'Ιστορικό ενεργειών'], ['crm_emails', 'Email πελατών'], ['crm_integrations', 'Ρυθμίσεις ενσωματώσεων'], ['crm_settings', 'Ρυθμίσεις CRM'],
];
const missingFn = (e: Err) => !!e && /PGRST202|Could not find the function|does not exist|schema cache/i.test(`${e.code} ${e.message}`);
const denied = (e: Err) => !!e && /permission|denied|JWT|not allowed|42501|401|403/i.test(`${e.code} ${e.message}`);

type Meta = Pick<Check, 'id' | 'area' | 'label' | 'tests' | 'evidence'> & Partial<Pick<Check, 'local'>>;
const live = (m: Meta, env: Env, at: string, status: Status, detail: string, action: string | null = null, owner: Check['owner'] = null): Check => {
  // Only the real system can verify. The same code run from a Preview deployment or a dev server reports what it saw, but it never counts as verification.
  if (status === 'verified' && env !== 'production') {
    return { ...m, status: 'unverified', detail: `${detail} Αυτό δεν είναι το Production (${ENV_TEXT[env]}): δεν μετράει ως επαλήθευση.`, at, env, method: 'automated',
      action: 'Εκτελέστε τον έλεγχο από την εφαρμογή Production (https://hlektrismos-crm.vercel.app).', owner: 'Admin' };
  }
  return { ...m, status, detail, at, env, method: 'automated', action: status === 'verified' ? null : action, owner: status === 'verified' ? null : owner };
};
const SQL_OWNER: Check['owner'] = 'Ιδιοκτήτης (Dashboard / SQL)';

export async function probeAnonymous(d: ProbeDeps, env: Env): Promise<Check[]> {
  const out: Check[] = [];
  for (const [table, label] of ANON_TABLES) {
    const m: Meta = { id: `anon-${table}`, area: 'anonymous', label: `Ανώνυμος επισκέπτης → ${label}`, tests: `Διαβάζει ένας ανώνυμος επισκέπτης (δημόσιο κλειδί, χωρίς σύνδεση) τον πίνακα ${table};`, evidence: 'Ζωντανό αίτημα από αυτόν τον browser, μόνο ανάγνωση της στήλης id (δεν εμφανίζεται).' };
    const { data, error } = await d.anon.from(table).select('id').limit(1);
    const at = d.now();
    if (error) {
      const gone = /does not exist|schema cache|PGRST205|42P01/i.test(`${error.code} ${error.message}`);
      out.push(denied(error) || gone ? live(m, env, at, 'verified', gone ? 'Ο πίνακας δεν εκτίθεται στο API.' : 'Η βάση αρνείται την πρόσβαση.')
        : live(m, env, at, 'unverified', `Ο έλεγχος δεν ολοκληρώθηκε (${error.message}).`, 'Εκτελέστε ξανά τον έλεγχο.', 'Admin'));
    } else if ((data ?? []).length === 0) out.push(live(m, env, at, 'verified', 'Δεν επιστράφηκαν εγγραφές σε ανώνυμο επισκέπτη.'));
    else out.push(live(m, env, at, 'action', 'Ο ανώνυμος επισκέπτης διάβασε εγγραφή.', `Ελέγξτε RLS και grants του πίνακα ${table} (phase1/17, phase1/18).`, SQL_OWNER));
  }
  const sm: Meta = { id: 'anon-storage', area: 'anonymous', label: 'Ανώνυμος επισκέπτης → αρχεία φόρμας (hlektrismos_docs)', tests: 'Μπορεί ένας ανώνυμος επισκέπτης να δει λίστα αρχείων του bucket hlektrismos_docs;', evidence: 'Ζωντανό αίτημα list() από αυτόν τον browser.' };
  const { data: files, error: fErr } = await d.anon.storage.from('hlektrismos_docs').list('contact-forms', { limit: 1 });
  out.push(fErr || (files ?? []).length === 0 ? live(sm, env, d.now(), 'verified', 'Δεν επιστράφηκε λίστα αρχείων.')
    : live(sm, env, d.now(), 'action', 'Ο ανώνυμος επισκέπτης είδε λίστα αρχείων.', 'Εφαρμόστε phase1/16_storage_docs_lockdown.', SQL_OWNER));
  return out;
}

/** The public Auth settings endpoint (read-only; it is what every sign-in page reads). */
export async function probeAuthSettings(d: ProbeDeps, env: Env): Promise<Check[]> {
  const base = { area: 'anonymous' as const, evidence: 'Ζωντανό GET /auth/v1/settings (δημόσιο, μόνο ανάγνωση).' };
  const su: Meta = { ...base, id: 'auth-signup', label: 'Δημόσια εγγραφή χρηστών (Auth)', tests: 'Μπορεί οποιοσδήποτε να δημιουργήσει λογαριασμό μόνος του;' };
  const an: Meta = { ...base, id: 'auth-anonymous', label: 'Ανώνυμες συνδέσεις (Auth)', tests: 'Επιτρέπεται το anonymous sign-in, που δίνει συνεδρία χωρίς λογαριασμό;' };
  try {
    const res = await d.fetcher(`${d.authUrl}/auth/v1/settings`, { headers: { apikey: d.anonKey } });
    const at = d.now();
    if (!res.ok) { const e = `Ο έλεγχος δεν ολοκληρώθηκε (HTTP ${res.status}).`; return [live(su, env, at, 'unverified', e, 'Εκτελέστε ξανά.', 'Admin'), live(an, env, at, 'unverified', e, 'Εκτελέστε ξανά.', 'Admin')]; }
    const j = await res.json() as { disable_signup?: unknown; external?: { anonymous_users?: unknown } };
    return [
      j.disable_signup === true ? live(su, env, at, 'verified', 'Η δημόσια εγγραφή είναι απενεργοποιημένη· λογαριασμούς δημιουργούν μόνο οι διαχειριστές.')
        : j.disable_signup === false ? live(su, env, at, 'action', 'Η δημόσια εγγραφή είναι ΕΝΕΡΓΗ.', 'Authentication → Sign In / Providers → απενεργοποιήστε το «Allow new users to sign up».', SQL_OWNER)
        : live(su, env, at, 'unverified', 'Το Auth δεν επέστρεψε τη ρύθμιση.', 'Ελέγξτε τη ρύθμιση στο Dashboard.', SQL_OWNER),
      j.external?.anonymous_users === false ? live(an, env, at, 'verified', 'Οι ανώνυμες συνδέσεις είναι απενεργοποιημένες.')
        : j.external?.anonymous_users === true ? live(an, env, at, 'action', 'Οι ανώνυμες συνδέσεις είναι ΕΝΕΡΓΕΣ.', 'Authentication → Sign In / Providers → απενεργοποιήστε το «Allow anonymous sign-ins».', SQL_OWNER)
        : live(an, env, at, 'unverified', 'Το Auth δεν επέστρεψε τη ρύθμιση.', 'Ελέγξτε τη ρύθμιση στο Dashboard.', SQL_OWNER),
    ];
  } catch {
    const e = 'Ο έλεγχος δεν ολοκληρώθηκε (δίκτυο).';
    return [live(su, env, d.now(), 'unverified', e, 'Εκτελέστε ξανά.', 'Admin'), live(an, env, d.now(), 'unverified', e, 'Εκτελέστε ξανά.', 'Admin')];
  }
}

const SCOPE_LOCAL = 'Τοπικά περνούν οι έλεγχοι «τελικής κατάστασης» (supabase/tests/final-state-role-isolation.test.mjs): 4 ξεχωριστές συνδέσεις (Admin, Sales Agent Α, Sales Agent Β, ανώνυμος) στη σειρά του APPLY_ORDER. Δεν είναι Production.';
export async function probeSalesScope(d: ProbeDeps, env: Env): Promise<Check> {
  const m: Meta = { id: 'isolation-sales', area: 'isolation', label: 'Ορατότητα Sales Agent: ο καθένας βλέπει μόνο τα δικά του', tests: 'Είναι ενεργή στη βάση η ορατότητα «μόνο τα δικά μου» (phase4/18 + phase4/21), και βλέπει ο Agent Α δεδομένα του Agent Β;',
    evidence: 'Ζωντανή κλήση της συνάρτησης sales_scope_status (δείχνει αν το SQL έχει εφαρμοστεί). Η δοκιμή με δύο πραγματικούς λογαριασμούς δεν γίνεται από έναν browser.', local: SCOPE_LOCAL };
  const { data, error } = await d.user.rpc('sales_scope_status');
  const at = d.now();
  if (error && !missingFn(error)) return live(m, env, at, 'unverified', 'Ο έλεγχος δεν ολοκληρώθηκε (δεν ήταν δυνατή η κλήση).', 'Εκτελέστε ξανά.', 'Admin');
  if (error) return live(m, env, at, 'action', 'Η ορατότητα «μόνο τα δικά μου» ΔΕΝ είναι εγκατεστημένη στη βάση: κάθε ενεργός Sales Agent βλέπει όλα τα leads, cases και πελάτες.',
    'Εφαρμογή phase4/14, phase4/18, phase4/21 (docs/ops/APPLY_ORDER.md) ΠΡΙΝ χρησιμοποιηθεί λογαριασμός Sales Agent· μετά δοκιμή με δύο πραγματικούς Sales Agents.', SQL_OWNER);
  const enabled = (data as { enabled?: unknown } | null)?.enabled === true;
  return enabled ? live(m, env, at, 'manual', 'Η ορατότητα είναι εγκατεστημένη και ενεργή στη βάση (επιβεβαιωμένο ζωντανά). Δεν έχει γίνει ακόμη δοκιμή με δύο πραγματικούς Sales Agents.',
    'Συνδεθείτε ως Sales Agent Α και Β και επιβεβαιώστε ότι ο καθένας βλέπει μόνο τα δικά του (βήματα στο docs/ops/ROLE_ISOLATION_GATE.md)· καταγράψτε το αποτέλεσμα.', 'Ιδιοκτήτης (Dashboard / SQL)')
    : live(m, env, at, 'action', 'Η συνάρτηση υπάρχει αλλά αναφέρει ότι η ορατότητα ΔΕΝ είναι ενεργή: οι Sales Agents βλέπουν όλα τα δεδομένα.', 'Εφαρμογή phase4/18 + phase4/21 και επανάληψη του ελέγχου.', SQL_OWNER);
}

interface StaffRow { role?: unknown; is_active?: unknown }
export async function probeRoles(d: ProbeDeps, env: Env): Promise<Check[]> {
  const sp: Meta = { id: 'roles-self-promotion', area: 'roles', label: 'Ένας χρήστης δεν μπορεί να γίνει Admin μόνος του', tests: 'Μπορεί ένας Sales Agent να ορίσει τον ρόλο του σε Admin (migration 20260910103000, γρ. 586); Υπάρχει ο μηχανισμός προστασίας ρόλων;',
    evidence: 'Ζωντανή ένδειξη: αν η συνάρτηση staff_list (phase2/05, που περιέχει τον μηχανισμό προστασίας) υπάρχει. Η ίδια η επίθεση δεν δοκιμάζεται στο Production γιατί θα άλλαζε πραγματικό ρόλο.',
    local: 'Τοπικά: ο Sales Agent Α/Β δεν γίνεται Admin με καμία από 10 απευθείας εγγραφές και 12 προνομιακές συναρτήσεις· 4 ανεξάρτητα επίπεδα προστασίας· χωρίς τα staged αρχεία η επίθεση ΕΠΙΤΥΓΧΑΝΕΙ (αρνητικός μάρτυρας).' };
  const tm: Meta = { id: 'roles-two-model', area: 'roles', label: 'Ακριβώς δύο ρόλοι και ένας ενεργός Admin', tests: 'Έχουν όλοι οι λογαριασμοί ρόλο admin ή sales_agent, και υπάρχει ακριβώς ένας ενεργός admin;',
    evidence: 'Ζωντανή ανάγνωση του καταλόγου προσωπικού (staff_list) από τη συνεδρία του Admin· μετρώνται μόνο ρόλοι και ενεργοί, όχι προσωπικά στοιχεία.' };
  const { data, error } = await d.user.rpc('staff_list');
  const at = d.now();
  if (error || !Array.isArray(data)) {
    const gone = !!error && missingFn(error);
    return [
      live(sp, env, at, gone ? 'action' : 'unverified', gone ? 'Η staff_list (phase2/05) ΔΕΝ υπάρχει στη βάση: δεν υπάρχει ένδειξη ότι ο μηχανισμός προστασίας ρόλων είναι εγκατεστημένος. Με τα migrations που εφαρμόζονται αυτόματα, ένας χρήστης μπορεί να ορίσει τον εαυτό του Admin.' : 'Ο έλεγχος δεν ολοκληρώθηκε.',
        'Εφαρμογή phase1/18 και phase2/05 (APPLY_ORDER.md), μετά phase6/21, 6/25, 6/26. Έπειτα δοκιμή με πραγματικό Sales Agent: η εγγραφή ρόλου πρέπει να αποτυγχάνει.', SQL_OWNER),
      live(tm, env, at, 'unverified', 'Δεν ήταν δυνατή η ανάγνωση του καταλόγου προσωπικού.', 'Εφαρμογή phase2/05 και phase6/25, μετά επανάληψη.', SQL_OWNER),
    ];
  }
  const rows = data as StaffRow[];
  const roles = [...new Set(rows.map((r) => String(r.role)))].sort();
  const legacy = roles.filter((r) => r !== 'admin' && r !== 'sales_agent');
  const admins = rows.filter((r) => r.role === 'admin' && r.is_active !== false).length;
  return [
    live(sp, env, at, 'manual', 'Η staff_list υπάρχει (phase2/05 εφαρμοσμένο, ζωντανά), άρα ο μηχανισμός προστασίας ρόλων είναι εγκατεστημένος. Δεν έχει γίνει ακόμη η δοκιμή «Sales Agent δεν γίνεται Admin» με πραγματικό λογαριασμό.',
      'Με λογαριασμό Sales Agent δοκιμάστε στον browser: update profiles set role = \'admin\' where id = auth.uid() → πρέπει να αποτύχει· καταγράψτε το αποτέλεσμα.', SQL_OWNER),
    legacy.length === 0 && admins === 1
      ? live(tm, env, at, 'verified', `Ρόλοι στη βάση: ${roles.join(', ')}· ενεργός admin: 1.`)
      : live(tm, env, at, 'action', `${legacy.length ? `Βρέθηκαν ρόλοι εκτός μοντέλου: ${legacy.join(', ')}. ` : ''}Ενεργοί admin: ${admins} (αναμένεται 1).`,
        'Εφαρμογή phase6/25 (ακριβώς δύο ρόλοι) και phase6/26 (ένας Admin) αφού ο πραγματικός Admin έχει συνδεθεί· διατηρείται η παλιά κατάσταση ως ιστορικό.', SQL_OWNER),
  ];
}

export async function probeSecrets(d: ProbeDeps, env: Env): Promise<Check[]> {
  const out: Check[] = [];
  const km: Meta = { id: 'secrets-anon-key', area: 'secrets', label: 'Το κλειδί του browser είναι το δημόσιο (anon), όχι το κλειδί υπηρεσίας', tests: 'Ο ρόλος του JWT που φορτώνει η εφαρμογή είναι «anon»;', evidence: 'Ανάγνωση του claim role του κλειδιού που έχει ενσωματωθεί στην εφαρμογή (το κλειδί δεν εμφανίζεται).' };
  const role = jwtRole(d.anonKey);
  out.push(role === 'anon' ? live(km, env, d.now(), 'verified', 'Ρόλος κλειδιού: anon.')
    : live(km, env, d.now(), role ? 'action' : 'unverified', role ? `ΠΡΟΣΟΧΗ: το κλειδί της εφαρμογής έχει ρόλο «${role}».` : 'Το κλειδί δεν είναι JWT που να μπορεί να διαβαστεί.',
      role ? 'Άμεση αντικατάσταση: το κλειδί υπηρεσίας δεν πρέπει να υπάρχει σε κώδικα που φτάνει στον browser.' : 'Ελέγξτε τη μεταβλητή VITE_SUPABASE_ANON_KEY στο Vercel.', role ? 'Προγραμματιστής' : SQL_OWNER));

  const cm: Meta = { id: 'secrets-credential-rows', area: 'secrets', label: 'Τα διαπιστευτήρια στο crm_settings δεν διαβάζονται από τον browser', tests: 'Επιστρέφει η βάση, στη συνεδρία του Admin, γραμμές με κλειδιά/κωδικούς (SerpApi, IMAP, Vapi…);',
    evidence: 'Ζωντανή ανάγνωση των ΟΝΟΜΑΤΩΝ των ρυθμίσεων από τη συνεδρία του Admin (οι τιμές δεν διαβάζονται ούτε εμφανίζονται).',
    local: 'Τοπικά: ούτε ο Admin διαβάζει διαπιστευτήριο και κανείς δεν αλλάζει τα role_permissions απευθείας (phase6/27)· χωρίς αυτό ο Admin διαβάζει την τιμή (αρνητικός μάρτυρας).' };
  const settings = await d.user.from('crm_settings').select('setting_key');
  const keys = (settings.data ?? []).map((r) => String(r.setting_key ?? '')).filter(Boolean);
  const exposed = keys.filter(isCredentialKey);
  out.push(settings.error && !denied(settings.error) ? live(cm, env, d.now(), 'unverified', 'Ο έλεγχος δεν ολοκληρώθηκε.', 'Εκτελέστε ξανά.', 'Admin')
    : exposed.length === 0 ? live(cm, env, d.now(), 'verified', settings.error ? 'Η βάση αρνείται την ανάγνωση.' : `Δεν επιστρέφονται διαπιστευτήρια (${keys.length} γενικές ρυθμίσεις ορατές).`)
    : live(cm, env, d.now(), 'action', `Ο browser του Admin διαβάζει ${exposed.length} ρύθμιση(εις) διαπιστευτηρίων: ${exposed.slice(0, 8).join(', ')}${exposed.length > 8 ? '…' : ''} (μόνο ονόματα· οι τιμές δεν εμφανίζονται).`,
      'Εφαρμογή phase6/27_credentials_write_only. Μέχρι τότε θεωρήστε τα κλειδιά εκτεθειμένα σε κάθε συνεδρία Admin.', SQL_OWNER));

  const im: Meta = { id: 'secrets-integration-config', area: 'secrets', label: 'Οι ρυθμίσεις ενσωματώσεων (crm_integrations.config) δεν περιέχουν μυστικά ορατά στον browser', tests: 'Περιέχει το config κάποιας ενσωμάτωσης κλειδί/token με τιμή, ορατό στη συνεδρία του Admin;',
    evidence: 'Ζωντανή ανάγνωση του config από τη συνεδρία του Admin· ελέγχονται μόνο τα ονόματα των πεδίων, καμία τιμή δεν αποθηκεύεται ή εμφανίζεται.' };
  const integ = await d.user.from('crm_integrations').select('id, config');
  const withSecrets = (integ.data ?? []).filter((r) => {
    const cfg = r.config; if (!cfg || typeof cfg !== 'object') return false;
    return Object.entries(cfg as Record<string, unknown>).some(([k, v]) => isCredentialKey(k) && typeof v === 'string' && v.trim() !== '');
  }).map((r) => String(r.id));
  out.push(integ.error && !denied(integ.error) ? live(im, env, d.now(), 'unverified', 'Ο έλεγχος δεν ολοκληρώθηκε.', 'Εκτελέστε ξανά.', 'Admin')
    : withSecrets.length === 0 ? live(im, env, d.now(), 'verified', integ.error ? 'Η βάση αρνείται την ανάγνωση.' : 'Δεν βρέθηκαν πεδία κλειδιών με τιμή στο config.')
    : live(im, env, d.now(), 'action', `Το config των ενσωματώσεων ${withSecrets.join(', ')} περιέχει πεδία κλειδιών/token με τιμή, ορατά στον browser του Admin (μόνο ονόματα ενσωματώσεων· καμία τιμή).`,
      'Μεταφορά των τιμών σε Edge Function secrets / write-only ρύθμιση (ξεχωριστή εργασία) και ανανέωση των κλειδιών που ίσως εκτέθηκαν.', 'Προγραμματιστής'));
  return out;
}

export async function probeMfa(d: ProbeDeps, env: Env): Promise<Check> {
  const m: Meta = { id: 'mfa-admin-factor', area: 'mfa', label: 'Ο λογαριασμός Admin έχει MFA και αυτή η σύνδεση το χρησιμοποίησε', tests: 'Έχει ο συνδεδεμένος Admin ενεργό παράγοντα TOTP και είναι το επίπεδο της σύνδεσης aal2;',
    evidence: 'Ζωντανές κλήσεις mfa.listFactors() και getAuthenticatorAssuranceLevel() για τον ΙΔΙΟ τον συνδεδεμένο χρήστη (μόνο ανάγνωση).' };
  const f = await d.user.auth.mfa.listFactors();
  const a = await d.user.auth.mfa.getAuthenticatorAssuranceLevel();
  const at = d.now();
  if (f.error || a.error) return live(m, env, at, 'unverified', 'Δεν ήταν δυνατή η ανάγνωση της κατάστασης MFA (το MFA ίσως δεν είναι ενεργό στο έργο).', 'Authentication → Multi-Factor: ελέγξτε ότι το TOTP είναι ενεργοποιημένο· μετά επανάληψη.', SQL_OWNER);
  const verified = (f.data?.totp ?? []).filter((x) => x.status === 'verified').length;
  const level = a.data?.currentLevel ?? null;
  if (verified > 0 && level === 'aal2') return live(m, env, at, 'verified', 'Υπάρχει επαληθευμένος παράγοντας TOTP και η τρέχουσα σύνδεση είναι aal2.');
  if (verified > 0) return live(m, env, at, 'action', 'Υπάρχει παράγοντας TOTP, αλλά η τρέχουσα σύνδεση είναι μόνο aal1 (δεν ζητήθηκε ο δεύτερος παράγοντας).', 'Ενεργοποίηση της απαίτησης aal2 για τον Admin (πολιτική προς έγκριση).', SQL_OWNER);
  return live(m, env, at, 'action', 'Ο λογαριασμός Admin δεν έχει εγγεγραμμένο παράγοντα MFA.', 'Εγγραφή TOTP στον κοινό λογαριασμό Admin από τον ιδιοκτήτη (η εφαρμογή δεν έχει ακόμη οθόνη εγγραφής). Δεν γίνεται αλλαγή χωρίς έγκριση, για να μη κλειδωθεί ο Admin.', SQL_OWNER);
}

/* ───────────────────────── the catalogue: what is not (or not yet) proven live ───────────────────────── */
const none = (m: Meta, status: Status, detail: string, action: string, owner: Check['owner'], method: Method = 'manual', extra: Partial<Check> = {}): Check =>
  ({ ...m, status, detail, at: null, env: 'none', method, action, owner, ...extra });

export const STATIC_CHECKS: Check[] = [
  none({ id: 'roles-password-policy', area: 'roles', label: 'Πολιτική κωδικών στο Auth (Dashboard)', tests: 'Είναι ενεργά: απαίτηση τρέχοντος κωδικού κατά την αλλαγή, ασφαλής αλλαγή κωδικού, ελάχιστο μήκος 12, προστασία από διαρρεύσαντες κωδικούς;',
    evidence: 'Οι ρυθμίσεις δεν εκτίθενται από το /auth/v1/settings ούτε από κανένα API που μπορεί να καλέσει η εφαρμογή· φαίνονται μόνο στο Dashboard. Οδηγίες: docs/ops/PASSWORD_CHANGE.md.' },
    'manual', 'Δεν μπορεί να ελεγχθεί από την εφαρμογή. Χωρίς το «Require current password when updating», ο Auth ΑΓΝΟΕΙ τον τρέχοντα κωδικό της φόρμας αλλαγής κωδικού· ο κώδικας ζητά και στέλνει το πεδίο, αλλά η απόρριψη λάθος κωδικού γίνεται μόνο αν η ρύθμιση είναι ενεργή.',
    'Dashboard → Authentication → Sign In / Providers → Email: ενεργοποίηση «Require current password when updating» και «Secure password change», ελάχιστο μήκος 12, leaked-password protection (αν το επιτρέπει το πλάνο)· μετά δοκιμή με λάθος τρέχοντα κωδικό σε έναν Sales Agent και καταγραφή εδώ.', SQL_OWNER),
  none({ id: 'migrations-applied', area: 'roles', label: 'Ποια staged migrations έχουν εφαρμοστεί στο Production', tests: 'Είναι εγκατεστημένα τα αρχεία που κλείνουν τα ευρήματα (phase1/18, phase2/05, phase4/18, phase4/21, phase6/21, 6/25, 6/26, 6/27);',
    evidence: 'Μόνο ο κατάλογος της βάσης το λέει: docs/ops/pending_migrations_check.sql (μόνο ανάγνωση). Μερικές ενδείξεις δίνουν οι ζωντανοί έλεγχοι παραπάνω· καμία δεν αποδεικνύει όλη τη λίστα.',
    local: 'Τοπικά, η αλυσίδα του docs/ops/APPLY_ORDER.md περνά το release gate (23 έλεγχοι). Αυτό δεν σημαίνει ότι τα αρχεία έχουν εφαρμοστεί στο Production.' },
    'manual', 'Δεν έχει γίνει ούτε καταγραφεί έλεγχος του καταλόγου του Production μετά το τελευταίο αντίγραφο. Τα ευρήματα (αυτοπροβιβασμός σε Admin, διαπιστευτήρια στον browser, ορατότητα Sales Agents) παραμένουν ανοιχτά μέχρι να εφαρμοστούν και να επαληθευτούν τα αρχεία.',
    'Εκτέλεση του pending_migrations_check.sql στο Production και καταγραφή αποτελέσματος· εφαρμογή με τη σειρά και τους ελέγχους του docs/ops/SECURITY_REMEDIATION_CHECKLIST.md (πρώτα staging, με αντίγραφο).', SQL_OWNER),
  none({ id: 'workflow-doc-warnings', area: 'workflow', label: 'Οι ελλείψεις εγγράφων είναι προειδοποίηση, όχι φραγμός', tests: 'Μπλοκάρει ο server τη μετάβαση σταδίου ή τη μεταφορά στο Back Office όταν λείπουν έγγραφα;',
    evidence: 'Απόφαση ιδιοκτήτη 17/10/2026 (supabase/staged-migrations/phase2/README.md, 07a)· τοπικός έλεγχος: υπόθεση χωρίς κανένα έγγραφο προχωρά (final-state-role-isolation.test.mjs).' },
    'accepted', 'Σκόπιμη επιλογή, όχι ευπάθεια: οι ελλείψεις (και οι ρυθμίσεις ανά πάροχο) εμφανίζονται ως προειδοποιήσεις και ο χρήστης μπορεί να προχωρήσει· δεν υπάρχει λειτουργία φραγμού ούτε παράκαμψης. Απόφαση ιδιοκτήτη 17/10/2026.',
    'Επιβεβαίωση ανά πάροχο/υπηρεσία των απαιτούμενων εγγράφων πριν το Production· η λίστα δεν πρέπει να επινοείται.', 'Ιδιοκτήτης (Dashboard / SQL)', 'manual',
    { local: 'Τοπικά: υπόθεση χωρίς έγγραφα αλλάζει στάδιο και η συνάρτηση λίστας απαντά ενημερωτικά· δεν υπάρχει set_stage_gate_mode.' }),
  none({ id: 'workflow-stage-guard', area: 'workflow', label: 'Επιτρεπτές μεταβάσεις σταδίων στον server', tests: 'Αρνείται η βάση άμεση εγγραφή σταδίου εκτός της επιτρεπτής λίστας (phase2/07b);', evidence: 'Δεν υπάρχει ζωντανή ένδειξη· το SQL είναι staged.' },
    'unverified', 'Το phase2/07b δεν έχει επαληθευτεί ότι έχει εφαρμοστεί. Η εφαρμογή ήδη εμποδίζει μη επιτρεπτές μεταβάσεις· ο server όχι αν δεν εφαρμοστεί.', 'Ελέγξτε με docs/ops/pending_migrations_check.sql αν το 07b έχει εφαρμοστεί· αν όχι, εφαρμογή όταν εγκριθεί (προαιρετικό).', 'Ιδιοκτήτης (Dashboard / SQL)'),
  none({ id: 'secrets-role-permissions', area: 'secrets', label: 'Τα role_permissions αλλάζουν μόνο με την προστατευμένη ενέργεια', tests: 'Μπορεί κάποιος να ξαναγράψει τα δικαιώματα ρόλων απευθείας στον πίνακα;', evidence: 'Η εγγραφή δεν δοκιμάζεται στο Production· θα άλλαζε πραγματικές ρυθμίσεις.' },
    'manual', 'Δεν δοκιμάζεται ζωντανά για να μην αλλάξει πραγματική ρύθμιση. Τοπικά, μετά το phase6/27, ούτε ο Admin ούτε Sales Agent αλλάζουν τα role_permissions με απευθείας εγγραφή.',
    'Μετά το phase6/27: δοκιμή σε staging ή με τον Admin ότι η απευθείας εγγραφή απορρίπτεται και ότι το crm_set_role_permissions δουλεύει.', 'Ιδιοκτήτης (Dashboard / SQL)', 'manual',
    { local: 'Τοπικά: credentials-write-only.test.mjs και final-state-role-isolation.test.mjs.' }),
  none({ id: 'mfa-enforcement', area: 'mfa', label: 'Η εφαρμογή απαιτεί MFA για προστατευμένες ενέργειες διαχειριστή', tests: 'Ζητά ο κώδικας επίπεδο aal2 πριν από ενέργειες Admin (ρόλοι, ρυθμίσεις, διαγραφές);', evidence: 'Έλεγχος του κώδικα: δεν υπάρχει χρήση aal2/MFA στο src/ (το κρατά ένα τεστ).' },
    'action', 'Όχι. Ούτε οθόνη εγγραφής παράγοντα ούτε απαίτηση aal2 υπάρχουν στην εφαρμογή· ακόμη και με εγγεγραμμένο παράγοντα, η σύνδεση με κωδικό αρκεί.',
    'Πολιτική προς έγκριση: TOTP στον κοινό λογαριασμό Admin, aal2 για διαχείριση χρηστών/ρυθμίσεων, ασφαλής αποθήκευση κωδίκων ανάκτησης. Δεν αλλάζει τίποτα χωρίς έγκριση (κίνδυνος κλειδώματος).', 'Προγραμματιστής', 'manual'),
  none({ id: 'backups-platform', area: 'backups', label: 'Αντίγραφα πλατφόρμας / PITR', tests: 'Υπάρχουν αυτόματα αντίγραφα ή point-in-time recovery στο Supabase;', evidence: 'docs/ops/BACKUP_RESTORE.md: στις 30/10/2026 το «supabase backups list» δεν επέστρεψε αντίγραφα και το pitr_enabled ήταν false. Η σημερινή κατάσταση φαίνεται μόνο στο Dashboard.' },
    'action', 'Την τελευταία καταγραφή (30/10/2026) δεν υπήρχε αντίγραφο πλατφόρμας ούτε PITR. Η προστασία ήταν μόνο το χειροκίνητο αντίγραφο.', 'Dashboard → Database → Backups: ενεργοποίηση ημερήσιων αντιγράφων/PITR και καταγραφή της νέας κατάστασης εδώ.', SQL_OWNER),
  none({ id: 'backups-restore-test', area: 'backups', label: 'Δοκιμή επαναφοράς του αντιγράφου', tests: 'Μπορεί να επαναφερθεί το αντίγραφο και να βγουν τα ίδια δεδομένα;', evidence: 'docs/ops/BACKUP_RESTORE.md, δοκιμή 30/10/2026: 79 πίνακες, 1 534 γραμμές, 14/14 έλεγχοι· 20/20 αρχεία storage.' },
    'accepted', 'Η επαναφορά δοκιμάστηκε σε απομονωμένη τοπική βάση (PGlite) από αντίγραφο του Production στις 30/10/2026: 14/14 έλεγχοι. Αποδεκτός περιορισμός: δεν είναι δοκιμή επαναφοράς της πλατφόρμας Supabase, και δεν καλύπτει Auth, Vault, secrets και ρυθμίσεις Auth.',
    'Επανάληψη της δοκιμής μετά από κάθε μεγάλη αλλαγή βάσης· δοκιμή επαναφοράς πλατφόρμας όταν ενεργοποιηθούν τα αντίγραφα.', 'Προγραμματιστής', 'manual',
    { local: 'Τοπικά: scripts/ops/prod-backup.mjs και restore-verify.mjs.' }),
  none({ id: 'functions-versions', area: 'functions', label: 'Αναπτυγμένες εκδόσεις Edge Functions = κώδικας του repository', tests: 'Ταυτίζεται κάθε αναπτυγμένη function με την πηγή στο repository;', evidence: 'Δεν διαβάζεται από τον browser: απαιτεί «supabase functions list» / Dashboard → Edge Functions.' },
    'manual', 'Δεν έχει γίνει αυτόματη σύγκριση. Όσες functions δηλώνονται στο supabase/config.toml αναπτύσσονται αυτόματα με κάθε συγχώνευση· οι υπόλοιπες αναπτύσσονται με το χέρι και μπορεί να υστερούν.',
    'Σύγκριση λίστας και εκδόσεων με το repository (τρέξτε «supabase functions list») και καταγραφή εδώ· ιδιαίτερα send-lead-confirmation και admin-users.', 'Προγραμματιστής'),
  none({ id: 'functions-secrets', area: 'functions', label: 'Τα απαιτούμενα μυστικά των functions υπάρχουν', tests: 'Υπάρχει κάθε secret που απαιτούν οι functions (μόνο ύπαρξη, ποτέ τιμή);', evidence: 'Τελευταίος έλεγχος προγραμματιστή 31/10/2026 (ιδιωτικές σημειώσεις λειτουργίας)· δεν διαβάζεται από τον browser.' },
    'action', 'Στον τελευταίο έλεγχο (31/10/2026) έλειπαν τα UNSUBSCRIBE_SECRET και CRON_SECRET. Τα SITE_URL, LINK_SIGNING_SECRET, VAPI/LEAD webhook secrets και OUTREACH_LIMITS απαιτούνται και αυτά.',
    'Dashboard → Edge Functions → Secrets: επιβεβαίωση ύπαρξης κάθε secret· δημιουργία όσων λείπουν (ο ιδιοκτήτης ή με ρητή έγκριση). Το SITE_URL πρέπει να είναι https://hlektrismos-crm.vercel.app.', SQL_OWNER),
];

/** The live probes' ids, so the page can show «not run yet» in their place. */
export const LIVE_IDS: { id: string; area: AreaId; label: string; tests: string }[] = [
  ...ANON_TABLES.map(([t, l]) => ({ id: `anon-${t}`, area: 'anonymous' as const, label: `Ανώνυμος επισκέπτης → ${l}`, tests: `Διαβάζει ένας ανώνυμος επισκέπτης τον πίνακα ${t};` })),
  { id: 'anon-storage', area: 'anonymous', label: 'Ανώνυμος επισκέπτης → αρχεία φόρμας (hlektrismos_docs)', tests: 'Μπορεί ένας ανώνυμος επισκέπτης να δει λίστα αρχείων;' },
  { id: 'auth-signup', area: 'anonymous', label: 'Δημόσια εγγραφή χρηστών (Auth)', tests: 'Μπορεί οποιοσδήποτε να δημιουργήσει λογαριασμό μόνος του;' },
  { id: 'auth-anonymous', area: 'anonymous', label: 'Ανώνυμες συνδέσεις (Auth)', tests: 'Επιτρέπεται το anonymous sign-in;' },
  { id: 'isolation-sales', area: 'isolation', label: 'Ορατότητα Sales Agent: ο καθένας βλέπει μόνο τα δικά του', tests: 'Είναι ενεργή η ορατότητα «μόνο τα δικά μου» στη βάση;' },
  { id: 'roles-self-promotion', area: 'roles', label: 'Ένας χρήστης δεν μπορεί να γίνει Admin μόνος του', tests: 'Υπάρχει ο μηχανισμός προστασίας ρόλων στη βάση;' },
  { id: 'roles-two-model', area: 'roles', label: 'Ακριβώς δύο ρόλοι και ένας ενεργός Admin', tests: 'Έχουν όλοι οι λογαριασμοί ρόλο admin ή sales_agent και υπάρχει ένας ενεργός admin;' },
  { id: 'secrets-anon-key', area: 'secrets', label: 'Το κλειδί του browser είναι το δημόσιο (anon), όχι το κλειδί υπηρεσίας', tests: 'Ο ρόλος του JWT της εφαρμογής είναι «anon»;' },
  { id: 'secrets-credential-rows', area: 'secrets', label: 'Τα διαπιστευτήρια στο crm_settings δεν διαβάζονται από τον browser', tests: 'Επιστρέφει η βάση γραμμές με κλειδιά/κωδικούς στη συνεδρία του Admin;' },
  { id: 'secrets-integration-config', area: 'secrets', label: 'Οι ρυθμίσεις ενσωματώσεων δεν περιέχουν μυστικά ορατά στον browser', tests: 'Περιέχει το config ενσωμάτωσης κλειδί/token με τιμή;' },
  { id: 'mfa-admin-factor', area: 'mfa', label: 'Ο λογαριασμός Admin έχει MFA και αυτή η σύνδεση το χρησιμοποίησε', tests: 'Έχει ο Admin παράγοντα TOTP και είναι η σύνδεση aal2;' },
];

/** Everything on the page, in the order of AREAS. A probe that has not run yet shows as «Δεν έχει επαληθευτεί ζωντανά». */
export function buildChecks(liveResults: Check[] | null): Check[] {
  const byId = new Map((liveResults ?? []).map((c) => [c.id, c]));
  const placeholders: Check[] = LIVE_IDS.map((l) => byId.get(l.id) ?? ({
    id: l.id, area: l.area, label: l.label, tests: l.tests, status: 'unverified', at: null, env: 'none', method: 'automated',
    detail: 'Ο ζωντανός έλεγχος δεν έχει εκτελεστεί από αυτόν τον browser.', evidence: 'Εκτελείται με «Εκτέλεση ζωντανών ελέγχων».',
    action: 'Πατήστε «Εκτέλεση ζωντανών ελέγχων» (απαιτείται σύνδεση Admin).', owner: 'Admin',
  } satisfies Check));
  const all = [...placeholders, ...STATIC_CHECKS];
  return AREAS.flatMap((a) => all.filter((c) => c.area === a.id));
}

export interface LiveRun { at: string; env: Env; results: Check[] }
/** Runs every live probe. A probe that throws never turns into a pass: it becomes «Δεν έχει επαληθευτεί ζωντανά». */
export async function runLiveChecks(d: ProbeDeps): Promise<LiveRun> {
  const env = environmentOf(d.authUrl, d.appHost);
  const results: Check[] = [];
  const guard = async (ids: string[], f: () => Promise<Check | Check[]>) => {
    try { const r = await f(); results.push(...(Array.isArray(r) ? r : [r])); }
    catch { for (const id of ids) { const l = LIVE_IDS.find((x) => x.id === id); if (l) results.push({ id, area: l.area, label: l.label, tests: l.tests, status: 'unverified', at: d.now(), env, method: 'automated', detail: 'Ο έλεγχος απέτυχε με σφάλμα και δεν μετράει ως επιτυχία.', evidence: 'Ζωντανός έλεγχος από τον browser.', action: 'Εκτελέστε ξανά· αν επανέλθει, ειδοποιήστε τον προγραμματιστή.', owner: 'Admin' }); } }
  };
  await guard(ANON_TABLES.map(([t]) => `anon-${t}`).concat('anon-storage'), () => probeAnonymous(d, env));
  await guard(['auth-signup', 'auth-anonymous'], () => probeAuthSettings(d, env));
  await guard(['isolation-sales'], () => probeSalesScope(d, env));
  await guard(['roles-self-promotion', 'roles-two-model'], () => probeRoles(d, env));
  await guard(['secrets-anon-key', 'secrets-credential-rows', 'secrets-integration-config'], () => probeSecrets(d, env));
  await guard(['mfa-admin-factor'], () => probeMfa(d, env));
  return { at: d.now(), env, results };
}
