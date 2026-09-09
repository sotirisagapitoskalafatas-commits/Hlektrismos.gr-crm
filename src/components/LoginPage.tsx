import { useState } from 'react';
import { Zap, ArrowRight, ArrowLeft, Loader2, Lock, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useRoute } from '@/lib/router';

export default function LoginPage() {
  const { signIn } = useAuth();
  const [, navigate] = useRoute();
  const [email, setEmail] = useState('demo@hlektrismos.gr');
  const [password, setPassword] = useState('hlektrismos2025');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      setError('Λάθος στοιχεία. Ελέγξτε email και κωδικό.');
    } else {
      navigate('app');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-sky-50 text-slate-900 flex items-center justify-center relative overflow-hidden px-6">
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-sky-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-200/20 rounded-full blur-3xl" />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'linear-gradient(rgba(14,165,233,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.5) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }} />
      </div>

      <div className="relative w-full max-w-md">
        <button onClick={() => navigate('landing')} className="flex items-center gap-2 text-slate-400 hover:text-slate-700 transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" /> Επιστροφή στην αρχική
        </button>

        <div className="relative rounded-3xl glass-card p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center mb-4 shadow-xl shadow-sky-500/30">
              <Zap className="w-8 h-8 text-white" fill="white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">CRM Είσοδος</h1>
            <p className="text-slate-500 text-sm mt-2">Ηlektrismos.gr — Επιχειρησιακός Πίνακας</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" /> {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate-600 mb-2 font-medium">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/60 border border-slate-200 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 transition-all text-slate-900"
                  placeholder="email@example.com" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-2 font-medium">Κωδικός</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                  className="w-full pl-11 pr-11 py-3 rounded-xl bg-white/60 border border-slate-200 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200 transition-all text-slate-900"
                  placeholder="••••••••" />
                <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-600">
                  {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold hover:shadow-xl hover:shadow-sky-500/30 transition-all disabled:opacity-60">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              {loading ? 'Σύνδεση...' : 'Είσοδος'}
            </button>
          </form>

          <div className="mt-6 p-4 rounded-xl bg-sky-50/60 border border-sky-200/50 text-sm">
            <p className="text-sky-700 font-semibold mb-1">Demo Στοιχεία:</p>
            <p className="text-slate-600">Email: <span className="text-sky-600 font-mono">demo@hlektrismos.gr</span></p>
            <p className="text-slate-600">Κωδικός: <span className="text-sky-600 font-mono">hlektrismos2025</span></p>
          </div>
        </div>
      </div>
    </div>
  );
}


