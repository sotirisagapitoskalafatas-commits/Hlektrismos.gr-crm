import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { saveConsent, useConsent } from '@/lib/consent';
import '@/styles/landing.css';

/* Opt-in consent banner. Nothing optional loads until the visitor clicks
   "Αποδοχή"; "Απόρριψη" is equally prominent. The choice is stored with a
   timestamp (lib/consent.ts) and can be changed from the footer link or the
   #/cookies page, which dispatch 'atlas:consent-open'.
   Only presentation and keyboard handling live here; the consent model is lib/consent.ts.
   Escape / the close button only appear once a choice exists, so the panel can never be dismissed without one. */
export default function ConsentBanner() {
  const { decided, choices } = useConsent();
  const [open, setOpen] = useState(false);
  const [analytics, setAnalytics] = useState(choices.analytics);
  const cardRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const show = () => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setAnalytics(choices.analytics);
      setOpen(true);
    };
    window.addEventListener('atlas:consent-open', show);
    return () => window.removeEventListener('atlas:consent-open', show);
  }, [choices.analytics]);

  // Opened from a «Ρυθμίσεις cookies» control: move focus into the panel.
  useEffect(() => {
    if (open) cardRef.current?.querySelector<HTMLElement>('input, button')?.focus();
  }, [open]);

  const visible = !decided || open;
  const canDismiss = decided && open;

  useEffect(() => {
    if (!canDismiss) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      const back = returnFocus.current;
      returnFocus.current = null;
      if (back && document.contains(back)) back.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canDismiss]);

  const close = () => {
    setOpen(false);
    const back = returnFocus.current;
    returnFocus.current = null;
    if (back && document.contains(back)) back.focus();
  };

  const done = (value: boolean) => { saveConsent({ analytics: value }); close(); };

  return (
    <>
      {/* Vercel Speed Insights is mounted ONLY after opt-in. */}
      {choices.analytics && <SpeedInsights />}
      {visible && (
        <div className="lp-chrome lp-consent">
          <div ref={cardRef} className="lp-consent__card" role="dialog" aria-modal="false" aria-labelledby="lp-consent-title" aria-describedby="lp-consent-text">
            <p id="lp-consent-title" className="lp-consent__title">Το απόρρητό σας</p>
            {canDismiss && (
              <button type="button" className="lp-consent__close" onClick={close} aria-label="Κλείσιμο χωρίς αλλαγές"><X size={18} aria-hidden="true" /></button>
            )}
            <p id="lp-consent-text" className="lp-consent__text">
              Χρησιμοποιούμε μόνο την απαραίτητη τοπική αποθήκευση για να λειτουργεί η σελίδα. Με τη συγκατάθεσή σας
              ενεργοποιούμε το Vercel Speed Insights, που μετρά την ταχύτητα των σελίδων (URL, χρόνοι φόρτωσης, τύπος
              συσκευής/browser) και είναι απενεργοποιημένο μέχρι να το αποδεχθείτε. Δεν χρησιμοποιούμε καταγραφή συνεδρίας,
              heatmaps ή διαφημιστικά cookies. Μπορείτε να αλλάξετε την επιλογή σας οποτεδήποτε από τις «Ρυθμίσεις cookies»
              στο υποσέλιδο.{' '}
              <a href="#/cookies">Πολιτική Cookies</a>
            </p>
            <label className="lp-consent__option">
              Μέτρηση απόδοσης (Vercel Speed Insights)
              <input type="checkbox" role="switch" className="lp-consent__switch" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
            </label>
            <div className="lp-consent__actions">
              <button type="button" className="lp-btn lp-btn--primary" onClick={() => done(false)}>Απόρριψη</button>
              <button type="button" className="lp-btn lp-btn--ghost" onClick={() => done(analytics)}>Αποθήκευση επιλογών</button>
              <button type="button" className="lp-btn lp-btn--primary" onClick={() => done(true)}>Αποδοχή</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
