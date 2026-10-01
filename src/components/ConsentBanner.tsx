import { useEffect, useState } from 'react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { saveConsent, useConsent } from '@/lib/consent';

/* Opt-in consent banner. Nothing optional loads until the visitor clicks
   "Αποδοχή"; "Απόρριψη" is equally prominent. The choice is stored with a
   timestamp (lib/consent.ts) and can be changed from the footer link or the
   #/cookies page, which dispatch 'atlas:consent-open'. */
export default function ConsentBanner() {
  const { decided, choices } = useConsent();
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(choices.analytics);

  useEffect(() => {
    const show = () => { setAnalytics(choices.analytics); setOpen(true); };
    window.addEventListener('atlas:consent-open', show);
    return () => window.removeEventListener('atlas:consent-open', show);
  }, [choices.analytics]);

  const done = (value: boolean) => { saveConsent({ analytics: value }); setOpen(false); };
  const btn: React.CSSProperties = {
    padding: '10px 18px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff',
    color: '#0f172a', fontWeight: 600, fontSize: 14, cursor: 'pointer',
  };

  return (
    <>
      {/* Vercel Speed Insights is mounted ONLY after opt-in. */}
      {choices.analytics && <SpeedInsights />}
      {(!decided || open) && (
        <div role="dialog" aria-label="Ρυθμίσεις cookies" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 10000, padding: 16 }}>
          <div style={{ maxWidth: 720, margin: '0 auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 20px 50px rgba(15,23,42,.25)', padding: 20, color: '#334155', fontSize: 14, lineHeight: 1.6 }}>
            <p style={{ fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>Το απόρρητό σας</p>
            <p style={{ margin: '0 0 12px' }}>
              Χρησιμοποιούμε μόνο την απαραίτητη τοπική αποθήκευση για να λειτουργεί η σελίδα. Με τη συγκατάθεσή σας
              ενεργοποιούμε το Vercel Speed Insights, που μετρά την ταχύτητα των σελίδων (URL, χρόνοι φόρτωσης, τύπος
              συσκευής/browser). Δεν χρησιμοποιούμε καταγραφή συνεδρίας, heatmaps ή διαφημιστικά cookies.{' '}
              <a href="#/cookies" style={{ color: '#0369a1' }}>Πολιτική Cookies</a>
            </p>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
              <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
              Μέτρηση απόδοσης (Vercel Speed Insights)
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button type="button" style={btn} onClick={() => done(false)}>Απόρριψη</button>
              <button type="button" style={btn} onClick={() => done(analytics)}>Αποθήκευση επιλογών</button>
              <button type="button" style={btn} onClick={() => done(true)}>Αποδοχή</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
