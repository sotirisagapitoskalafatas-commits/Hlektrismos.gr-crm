import type { ReactNode } from 'react';
import { ArrowLeft, Zap } from 'lucide-react';
import '@/styles/atlas-auth.css';

/** Shared frame of the sign-in, forgot-password and reset-password pages. */
export default function AuthLayout({ title, lead, onBack, backLabel, children, footer }: {
  title: string; lead?: string; onBack?: () => void; backLabel?: string; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <main className="auth-page">
      <div className="auth-aurora" aria-hidden="true" />
      <div className="auth-wrap">
        {onBack && <button type="button" className="auth-back" onClick={onBack}><ArrowLeft className="w-4 h-4" aria-hidden="true" /> {backLabel ?? 'Πίσω'}</button>}
        <div className="auth-card">
          <div className="auth-brand">
            <span className="auth-brand__mark" aria-hidden="true"><Zap className="w-6 h-6" fill="currentColor" /></span>
            <span className="auth-brand__name">ATLAS</span>
          </div>
          <h1 className="auth-title">{title}</h1>
          {lead && <p className="auth-lead">{lead}</p>}
          {children}
          {footer && <p className="auth-foot">{footer}</p>}
        </div>
      </div>
    </main>
  );
}
