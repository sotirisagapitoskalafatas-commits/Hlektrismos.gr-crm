import { FormEvent, useState } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import EarthBackground from '@/components/EarthBackground';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [demoMessage, setDemoMessage] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = mode === 'login' ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (error) setError(error);
  };

  const enterDemo = async () => {
    setError('');
    setDemoMessage('Δημιουργία demo πρόσβασης...');
    setLoading(true);
    const demoEmail = 'demo@hlektrismos.gr';
    const demoPassword = 'PowerForDemo2026!';
    const signedIn = await signIn(demoEmail, demoPassword);
    if (signedIn.error) {
      const created = await signUp(demoEmail, demoPassword);
      if (created.error) {
        setLoading(false);
        setDemoMessage('');
        setError('Η demo πρόσβαση δεν μπόρεσε να δημιουργηθεί. Δοκιμάστε την εγγραφή.');
        return;
      }
    }
    setLoading(false);
    setDemoMessage('Έτοιμο. Ανοίγει το dashboard...');
    window.location.hash = '/dashboard';
    window.location.reload();
  };

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-glow-1" />
        <div className="login-glow-2" />
        <div className="login-grid-bg" />
      </div>
      <EarthBackground mode="ambient" />
      <div className="earth-scrim earth-scrim--login" />
      <div className="login-card-wrap">
        <a href="#/" className="login-brand">
          <svg viewBox="0 0 100 100" style={{ width: 72, height: 72 }} xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="brandGradientLogin" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0EA5E9" />
                <stop offset="100%" stopColor="#0B2545" />
              </linearGradient>
              <filter id="subtleShadowLogin" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0B2545" floodOpacity="0.25"/>
              </filter>
            </defs>
            <circle cx="50" cy="50" r="43" fill="none" stroke="url(#brandGradientLogin)" strokeWidth="4.5" filter="url(#subtleShadowLogin)" />
            <circle cx="50" cy="50" r="35" fill="none" stroke="url(#brandGradientLogin)" strokeWidth="1.5" opacity="0.5" />
            <path d="M 54 15 L 28 50 L 48 50 L 36 85 L 75 42 L 53 42 Z" fill="url(#brandGradientLogin)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" filter="url(#subtleShadowLogin)" />
          </svg>
          <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #0B2545, #0EA5E9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Hlektrismos.gr</span>
        </a>
        <div className="login-card">
          <h1>{mode === 'login' ? 'Σύνδεση Dashboard' : 'Δημιουργία Λογαριασμού'}</h1>
          <p className="login-sub">
            {mode === 'login' ? 'Συνδεθείτε για να διαχειριστείτε τα AI agents και τα leads.' : 'Δημιουργήστε λογαριασμό για να ξεκινήσετε με το Hlektrismos.gr.'}
          </p>
          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label>Email</label>
              <div className="login-input-wrap">
                <Mail size={16} className="login-input-icon" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.gr" />
              </div>
            </div>
            <div className="login-field">
              <label>Κωδικός</label>
              <div className="login-input-wrap">
                <Lock size={16} className="login-input-icon" />
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </div>
            {error && <p className="form-error">{error}</p>}
            <button className="btn btn-primary login-submit" disabled={loading}>
              {loading ? 'Σε εξέλιξη...' : mode === 'login' ? 'Σύνδεση' : 'Εγγραφή'} <ArrowRight size={18} />
            </button>
          </form>
          {demoMessage && <p className="login-demo-message">{demoMessage}</p>}
          <button className="login-demo" onClick={enterDemo} disabled={loading}>Είσοδος με demo λογαριασμό</button>
          <p className="login-demo-hint">demo@hlektrismos.gr · PowerForDemo2026!</p>
          <button className="login-toggle" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Δεν έχετε λογαριασμό; Εγγραφή' : 'Έχετε λογαριασμό; Σύνδεση'}
          </button>
          <a href="#/" className="login-back">← Επιστροφή στην αρχική</a>
        </div>
      </div>
    </div>
  );
}
