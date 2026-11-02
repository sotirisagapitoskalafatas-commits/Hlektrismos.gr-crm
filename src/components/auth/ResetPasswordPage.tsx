// Choose a new password. Reached from the e-mailed link: Supabase signs the person in with a short recovery session
// and the app routes here (see AuthProvider). Without a session the link is expired or was never opened.
import { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useRoute } from '@/lib/router';
import { supabase } from '@/lib/supabase';
import { passwordIssues } from '@/lib/password-rules';
import AuthLayout from './AuthLayout';

export default function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const [, navigate] = useRoute();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const issues = passwordIssues(pw, pw2);

  if (loading) return <AuthLayout title="Νέος κωδικός"><p className="auth-lead">Φόρτωση…</p></AuthLayout>;

  if (!session) {
    return (
      <AuthLayout title="Ο σύνδεσμος δεν ισχύει" lead="Ο σύνδεσμος επαναφοράς έληξε ή έχει ήδη χρησιμοποιηθεί. Ζητήστε νέο από τη σελίδα εισόδου." onBack={() => navigate('login')} backLabel="Πίσω στη σύνδεση">
        <button type="button" className="auth-submit" onClick={() => navigate('login')}>Στη σελίδα εισόδου</button>
      </AuthLayout>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (issues.length || !supabase) return;
    setBusy(true); setError('');
    const mustChangePassword = session.user.app_metadata?.must_change_password === true;
    if (mustChangePassword) {
      // The Edge Function sets the new password and removes the server-only flag in one Auth Admin API call.
      const { error: completionErr } = await supabase.functions.invoke('admin-users', {
        body: { action: 'complete_password_change', password: pw },
      });
      if (completionErr) {
        setBusy(false);
        setError('Δεν ολοκληρώθηκε η αλλαγή κωδικού. Ελέγξτε τον νέο κωδικό και δοκιμάστε ξανά.');
        return;
      }
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        setBusy(false);
        setError('Ο κωδικός άλλαξε. Δεν ανανεώθηκε ακόμη η σύνδεση· δοκιμάστε ξανά για να ολοκληρωθεί η διαδικασία.');
        return;
      }
    } else {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) {
        setBusy(false);
        setError('Ο κωδικός δεν άλλαξε. Δοκιμάστε έναν διαφορετικό κωδικό ή ζητήστε νέο σύνδεσμο.');
        return;
      }
    }

    setBusy(false);
    setDone(true);
  };

  if (done) {
    return (
      <AuthLayout title="Ο κωδικός άλλαξε">
        <div className="auth-alert auth-alert--ok" role="status"><CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" /><span>Ο νέος κωδικός ορίστηκε. Είστε συνδεδεμένοι.</span></div>
        <button type="button" className="auth-submit" onClick={() => navigate('app')}>Συνέχεια στο CRM</button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Νέος κωδικός" lead="Επιλέξτε έναν νέο κωδικό για τον λογαριασμό σας.">
      <form onSubmit={submit} noValidate>
        {error && <div className="auth-alert auth-alert--err" role="alert"><AlertCircle className="w-5 h-5 shrink-0" aria-hidden="true" /> {error}</div>}
        <div className="auth-field">
          <label htmlFor="rp-new">Νέος κωδικός</label>
          <div className="auth-input">
            <Lock className="auth-ico" aria-hidden="true" />
            <input id="rp-new" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
            <button type="button" className="auth-eye" onClick={() => setShow(!show)} aria-label={show ? 'Απόκρυψη κωδικού' : 'Εμφάνιση κωδικού'} aria-pressed={show}>
              {show ? <EyeOff className="w-5 h-5" aria-hidden="true" /> : <Eye className="w-5 h-5" aria-hidden="true" />}
            </button>
          </div>
        </div>
        <div className="auth-field">
          <label htmlFor="rp-new2">Επανάληψη κωδικού</label>
          <div className="auth-input">
            <Lock className="auth-ico" aria-hidden="true" />
            <input id="rp-new2" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
          </div>
        </div>
        {(pw.length > 0 || pw2.length > 0) && issues.length > 0 && <ul className="auth-hints" aria-live="polite">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        <button type="submit" className="auth-submit" disabled={busy || issues.length > 0}>
          {busy && <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />} {busy ? 'Αποθήκευση…' : 'Ορισμός κωδικού'}
        </button>
      </form>
    </AuthLayout>
  );
}
