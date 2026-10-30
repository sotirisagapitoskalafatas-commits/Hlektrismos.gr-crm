import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useRoute } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { looksLikeEmail } from '@/lib/password-rules';
import AuthLayout from '@/components/auth/AuthLayout';

const FOOTER = (
  <>
    Πρόσβαση μόνο για εξουσιοδοτημένο προσωπικό. Οι λογαριασμοί δημιουργούνται από τον διαχειριστή.<br />
    <a href="#/privacy">Πολιτική Απορρήτου</a> · <a href="#/terms">Όροι Χρήσης</a>
  </>
);

export default function LoginPage() {
  const { signIn } = useAuth();
  const [, navigate] = useRoute();
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const errRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errRef.current?.focus(); }, [error]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const { error: err } = await signIn(email, password);
    setBusy(false);
    if (err) setError('Λάθος στοιχεία. Ελέγξτε email και κωδικό.'); // the same text for every failure: no hint about which part was wrong
    else navigate('app');
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!looksLikeEmail(email)) { setError('Συμπληρώστε μια έγκυρη διεύθυνση email.'); return; }
    setBusy(true);
    // The answer never says whether the address has an account (no account enumeration): the same message either way.
    try { await supabase?.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` }); } catch { /* same message */ }
    setBusy(false); setSent(true);
  };

  if (mode === 'forgot') {
    return (
      <AuthLayout title="Επαναφορά κωδικού" lead="Θα σας στείλουμε σύνδεσμο για να ορίσετε νέο κωδικό." onBack={() => { setMode('signin'); setSent(false); setError(''); }} backLabel="Πίσω στη σύνδεση" footer={FOOTER}>
        {sent ? (
          <div className="auth-alert auth-alert--ok" role="status"><CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span>Αν υπάρχει λογαριασμός με αυτή τη διεύθυνση, στείλαμε οδηγίες επαναφοράς. Ελέγξτε και τον φάκελο ανεπιθύμητων.</span></div>
        ) : (
          <form onSubmit={sendReset} noValidate>
            {error && <div ref={errRef} tabIndex={-1} className="auth-alert auth-alert--err" role="alert"><AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" /> {error}</div>}
            <div className="auth-field">
              <label htmlFor="auth-email">Email</label>
              <div className="auth-input">
                <Mail className="auth-ico" aria-hidden="true" />
                <input id="auth-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" aria-invalid={!!error} />
              </div>
            </div>
            <button type="submit" className="auth-submit" disabled={busy}>
              {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <Mail className="w-5 h-5" aria-hidden="true" />} {busy ? 'Αποστολή…' : 'Αποστολή συνδέσμου'}
            </button>
          </form>
        )}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Είσοδος στο CRM" lead="Hlektrismos.gr — Επιχειρησιακός Πίνακας" onBack={() => navigate('landing')} backLabel="Επιστροφή στην αρχική" footer={FOOTER}>
      {error && <div ref={errRef} tabIndex={-1} className="auth-alert auth-alert--err" role="alert"><AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" /> {error}</div>}
      <form onSubmit={submit}>
        <div className="auth-field">
          <label htmlFor="auth-email">Email</label>
          <div className="auth-input">
            <Mail className="auth-ico" aria-hidden="true" />
            <input id="auth-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" aria-invalid={!!error} />
          </div>
        </div>
        <div className="auth-field">
          <label htmlFor="auth-pass">Κωδικός</label>
          <div className="auth-input">
            <Lock className="auth-ico" aria-hidden="true" />
            <input id="auth-pass" type={showPass ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" aria-invalid={!!error} />
            <button type="button" className="auth-eye" onClick={() => setShowPass(!showPass)} aria-label={showPass ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'} aria-pressed={showPass}>
              {showPass ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
        <div className="auth-row"><span /><button type="button" className="auth-link" onClick={() => { setMode('forgot'); setError(''); }}>Ξέχασα τον κωδικό</button></div>
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" /> : <ArrowRight className="w-5 h-5" aria-hidden="true" />} {busy ? 'Σύνδεση…' : 'Είσοδος'}
        </button>
      </form>
    </AuthLayout>
  );
}
