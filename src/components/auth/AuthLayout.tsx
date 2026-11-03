import type { ReactNode } from 'react';
import { ArrowLeft, LockKeyhole, ShieldCheck, UsersRound } from 'lucide-react';
import '@/styles/atlas-auth.css';

/** Shared frame for sign-in, forgot-password and password-reset pages. */
export default function AuthLayout({ title, lead, onBack, backLabel, children, footer }: {
  title: string; lead?: string; onBack?: () => void; backLabel?: string; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <aside className="auth-aside" aria-label="Hlektrismos ATLAS CRM">
          <div className="auth-aside__orb auth-aside__orb--one" aria-hidden="true" />
          <div className="auth-aside__orb auth-aside__orb--two" aria-hidden="true" />
          <div className="auth-aside__top">
            <div className="auth-brand__mark">
              <img src="/app-icon.svg" alt="" />
            </div>
            <div className="auth-brand__copy">
              <span className="auth-brand__name">HLEKTRISMOS.GR</span>
              <span className="auth-brand__product">ATLAS CRM</span>
            </div>
          </div>

          <div className="auth-aside__content">
            <span className="auth-aside__eyebrow">ΕΝΕΡΓΕΙΑ · ΣΥΓΚΡΙΣΗ · ΕΞΥΠΗΡΕΤΗΣΗ</span>
            <h2>Η ομάδα σου.
              <br />
              Σε μία <em>καθαρή εικόνα.</em>
            </h2>
            <p>
              Το καθημερινό περιβάλλον εργασίας της Hlektrismos για την εξυπηρέτηση,
              τις υποθέσεις και τη συνεργασία της ομάδας.
            </p>
          </div>

          <div className="auth-aside__features">
            <div className="auth-aside__feature">
              <span className="auth-aside__feature-icon"><ShieldCheck size={18} aria-hidden="true" /></span>
              <span><strong>Εξουσιοδοτημένη πρόσβαση</strong><small>Μόνο για την ομάδα της Hlektrismos</small></span>
            </div>
            <div className="auth-aside__feature">
              <span className="auth-aside__feature-icon"><UsersRound size={18} aria-hidden="true" /></span>
              <span><strong>Ενιαία εικόνα πελατών</strong><small>Leads, πελάτες και υποθέσεις σε ένα σημείο</small></span>
            </div>
            <div className="auth-aside__feature">
              <span className="auth-aside__feature-icon"><LockKeyhole size={18} aria-hidden="true" /></span>
              <span><strong>Ρόλοι και δικαιώματα</strong><small>Πρόσβαση ανάλογα με τον λογαριασμό</small></span>
            </div>
          </div>

          <div className="auth-aside__footer">
            <span>HLEKTRISMOS.GR</span>
            <span>Αθήνα · Ελλάδα</span>
          </div>
        </aside>

        <section className="auth-main">
          {onBack && (
            <button type="button" className="auth-back" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {backLabel ?? 'Πίσω'}
            </button>
          )}

          <div className="auth-card">
            <div className="auth-card__topline">
              <span className="auth-card__eyebrow">ATLAS CRM</span>
              <span className="auth-card__secure"><i aria-hidden="true" /> Ασφαλής πρόσβαση</span>
            </div>
            <h1 className="auth-title">{title}</h1>
            {lead && <p className="auth-lead">{lead}</p>}
            {children}
            {footer && <p className="auth-foot">{footer}</p>}
          </div>

          <p className="auth-main__caption">Hlektrismos.gr <span>·</span> Εσωτερικό περιβάλλον εργασίας</p>
        </section>
      </div>
    </main>
  );
}
