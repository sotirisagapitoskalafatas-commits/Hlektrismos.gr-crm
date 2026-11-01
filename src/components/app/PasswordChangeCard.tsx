// «Ασφάλεια λογαριασμού → Αλλαγή κωδικού πρόσβασης»: every signed-in user (Admin / Back Office and Sales Agent) changes their OWN password here.
// Supabase Auth does the work on the user's own session (see lib/password-change.ts). No password is stored, logged or sent anywhere else, and the
// form is only cleared after Auth has confirmed the change.
import { useEffect, useId, useRef, useState } from 'react';
import { Check, Circle, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Btn, Card, CardHeader } from '@/lib/ui';
import {
  REAUTH_TEXT, SHARED_ADMIN_CONFIRM, SHARED_ADMIN_NOTICE, canSubmitPassword, changePassword, lockMsAfter, maySubmit, passwordChangeMessage, passwordRequirements, passwordStrength, requestReauthCode,
} from '@/lib/password-change';

type Msg = { tone: 'ok' | 'err'; text: string } | null;

function PasswordInput({ id, label, value, onChange, autoComplete, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; hint?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="micro text-ink/40 mb-1.5 block">{label}</label>
      <div className="flex items-center gap-2 border border-line rounded-lg px-3 py-2 bg-white focus-within:border-brand-500">
        <KeyRound className="w-3.5 h-3.5 text-ink/40 shrink-0" aria-hidden="true" />
        <input id={id} type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
          className="flex-1 min-w-0 text-[13px] text-ink bg-transparent outline-none" spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-describedby={hint ? `${id}-hint` : undefined} />
        <button type="button" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? `Απόκρυψη: ${label}` : `Εμφάνιση: ${label}`} className="text-ink/45 hover:text-ink shrink-0">
          {show ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
        </button>
      </div>
      {hint && <p id={`${id}-hint`} className="text-[11px] text-ink/45 mt-1">{hint}</p>}
    </div>
  );
}

/** A lock that survives re-renders: the ref is what the gate reads, the state only repaints. */
function useLock() {
  const until = useRef(0);
  const [locked, setLocked] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);
  const lockFor = (ms: number) => {
    until.current = Date.now() + ms; setLocked(ms > 0);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLocked(false), ms);
  };
  return { until, locked, lockFor };
}

const BAR_TONE = ['bg-bad-600', 'bg-bad-600', 'bg-warn-600', 'bg-ok-600', 'bg-ok-600'];

export default function PasswordChangeCard() {
  const { user, profile, signOut } = useAuth();
  // The Admin / Back Office login is ONE account shared by the office: changing its password signs every other office device out.
  const shared = profile?.role === 'admin';
  const [confirmShared, setConfirmShared] = useState(false);
  const uid = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [nonce, setNonce] = useState('');
  const [needReauth, setNeedReauth] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [reauthMsg, setReauthMsg] = useState<Msg>(null);
  // One request at a time, and a short lock after every attempt (see lockMsAfter). The ref is the real gate; the state only repaints the button.
  // The save and the «send me a code» actions have separate locks: the minute after a code was sent must not keep the person from entering it.
  const inFlight = useRef(false);
  const save = useLock();
  const code = useLock();

  const touch = <T,>(set: (v: T) => void) => (v: T) => { setConfirmShared(false); set(v); };
  const strength = passwordStrength(next, [user?.email?.split('@')[0] ?? '']);
  const reqs = passwordRequirements(current, next, confirm);
  const ready = canSubmitPassword(current, next, confirm) && (!needReauth || nonce.trim().length > 0);
  const pendingEmail = user?.new_email && user.new_email !== user.email ? user.new_email : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !ready || !maySubmit(inFlight.current, save.until.current, Date.now())) return;
    // The shared Admin login: say what will happen to the rest of the office once, and ask for a second click.
    if (shared && !confirmShared) { setConfirmShared(true); setMsg({ tone: 'err', text: SHARED_ADMIN_CONFIRM }); return; }
    setConfirmShared(false);
    inFlight.current = true; setBusy(true); setMsg(null);
    const result = await changePassword(supabase.auth, { current, next, nonce: needReauth ? nonce : undefined });
    inFlight.current = false; setBusy(false); save.lockFor(lockMsAfter(result.outcome));
    setMsg(passwordChangeMessage(result, { shared }));
    if (result.outcome === 'changed') { setCurrent(''); setNext(''); setConfirm(''); setNonce(''); setNeedReauth(false); setReauthMsg(null); } // only now, after Auth confirmed
    else if (result.outcome === 'reauth_needed' || result.outcome === 'reauth_invalid') setNeedReauth(true);
  };

  const sendCode = async () => {
    if (!supabase || !maySubmit(inFlight.current, code.until.current, Date.now())) return;
    inFlight.current = true; setBusy(true); setReauthMsg(null);
    code.lockFor(60_000); // locked BEFORE the answer: a second click can not send a second e-mail
    const r = await requestReauthCode(supabase.auth);
    inFlight.current = false; setBusy(false);
    setReauthMsg(REAUTH_TEXT[r]);
    if (r === 'failed' || r === 'session' || r === 'undeliverable') code.lockFor(lockMsAfter('failed')); // nothing was sent: a short pause is enough. After 'sent', 'network' and 'rate_limited' the 60 s lock stays.
  };

  return (
    <Card>
      <CardHeader micro="Ασφάλεια λογαριασμού" title="Αλλαγή κωδικού πρόσβασης" className="mb-3" />
      <p className="text-xs text-ink/55 mb-3">
        Ο κωδικός αφορά μόνο τον δικό σας λογαριασμό και δεν είναι ορατός σε κανέναν, ούτε στους διαχειριστές. Μετά την αλλαγή παραμένετε συνδεδεμένοι σε αυτή τη συσκευή· οι υπόλοιπες συσκευές θα ζητήσουν νέα σύνδεση.
      </p>
      {shared && (
        <p className="text-xs mb-3 rounded-lg border border-line px-3 py-2 text-warn-600" role="note" data-testid="password-shared-note">{SHARED_ADMIN_NOTICE}</p>
      )}
      {pendingEmail && (
        <p className="text-xs mb-3 text-warn-600" role="status" data-testid="password-pending-email-note">
          Υπάρχει εκκρεμές αίτημα αλλαγής email προς {pendingEmail}. Η αλλαγή κωδικού ακυρώνει τους συνδέσμους επιβεβαίωσης που έχουν ήδη σταλεί· θα χρειαστεί νέα επιβεβαίωση.
        </p>
      )}
      <form onSubmit={(e) => void submit(e)} noValidate className="space-y-3" aria-label="Αλλαγή κωδικού πρόσβασης">
        <PasswordInput id={`${uid}-cur`} label="Τρέχων κωδικός πρόσβασης" value={current} onChange={touch(setCurrent)} autoComplete="current-password" />
        <PasswordInput id={`${uid}-new`} label="Νέος κωδικός πρόσβασης" value={next} onChange={touch(setNext)} autoComplete="new-password" hint="Τουλάχιστον 12 χαρακτήρες, με γράμματα και αριθμούς. Προτιμήστε μεγαλύτερο, με σύμβολα." />
        <div aria-live="polite">
          {next.length > 0 && (
            <div data-testid="password-strength">
              <div className="flex gap-1" aria-hidden="true">
                {[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${strength.level >= i ? BAR_TONE[strength.level] : 'bg-ink/10'}`} />)}
              </div>
              <p className="text-[11px] text-ink/55 mt-1">Ισχύς κωδικού: <strong>{strength.label}</strong></p>
            </div>
          )}
        </div>
        <PasswordInput id={`${uid}-cfm`} label="Επιβεβαίωση νέου κωδικού πρόσβασης" value={confirm} onChange={touch(setConfirm)} autoComplete="new-password" />
        <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1" aria-label="Απαιτήσεις κωδικού">
          {reqs.map((r) => (
            <li key={r.id} className={`flex items-center gap-1.5 text-[11px] ${r.met ? 'text-ok-600' : 'text-ink/45'}`} data-met={r.met}>
              {r.met ? <Check className="w-3 h-3" aria-hidden="true" /> : <Circle className="w-3 h-3" aria-hidden="true" />}
              <span>{r.label}</span><span className="sr-only">{r.met ? ' — πληρούται' : ' — δεν πληρούται ακόμη'}</span>
            </li>
          ))}
        </ul>

        {needReauth && (
          <div className="rounded-xl border border-line bg-ink/[0.02] p-3 space-y-2" data-testid="password-reauth">
            <p className="flex items-start gap-2 text-xs text-ink/70"><ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-ink/40" aria-hidden="true" />
              <span>Η σύνδεσή σας είναι παλαιότερη από 24 ώρες, οπότε η υπηρεσία ζητά νέα επαλήθευση. Η πιο απλή λύση: αποσυνδεθείτε και συνδεθείτε ξανά (δεν στέλνεται email). Εναλλακτικά, ζητήστε κωδικό επαλήθευσης στο email του λογαριασμού σας.</span></p>
            <div className="flex flex-wrap items-center gap-2">
              <span data-testid="password-signout-route"><Btn variant="outline" onClick={() => { void signOut(); window.location.hash = '/'; }}>Αποσύνδεση και νέα σύνδεση (χωρίς email)</Btn></span>
              <Btn variant="outline" onClick={() => void sendCode()} disabled={busy || code.locked}>Αποστολή κωδικού επαλήθευσης στο email</Btn>
            </div>
            <PasswordInput id={`${uid}-nonce`} label="Κωδικός επαλήθευσης από το email" value={nonce} onChange={setNonce} autoComplete="one-time-code" />
            <p className={`text-xs min-h-[1rem] ${reauthMsg?.tone === 'err' ? 'text-bad-600' : 'text-ink/60'}`} role="status">{reauthMsg?.text ?? ''}</p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <Btn type="submit" disabled={!ready || busy || save.locked}>{busy ? 'Αποθήκευση…' : 'Αποθήκευση νέου κωδικού'}</Btn>
        </div>
        <p className={`text-xs min-h-[1rem] ${msg?.tone === 'err' ? 'text-bad-600' : 'text-ok-600'}`} role="status" data-testid="password-message">{msg?.text ?? ''}</p>
      </form>
    </Card>
  );
}
