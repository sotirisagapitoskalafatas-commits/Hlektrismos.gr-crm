import { CSSProperties, ReactNode, useEffect } from 'react';
import { POLICY_UPDATED } from '@/lib/legal';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import WaveDivider from '@/components/public/WaveDivider';
import '@/styles/landing.css';

/* The pages pass these to their <h2>/<ul>/<a>. They are empty on purpose: typography now comes from `.lp-prose`
   in landing.css, so the legal text files themselves did not have to change. */
export const h2: CSSProperties = {};
export const ul: CSSProperties = {};
export const a: CSSProperties = {};

const LEGAL_PAGES = [
  { href: '#/privacy', label: 'Πολιτική Απορρήτου' },
  { href: '#/terms', label: 'Όροι Χρήσης' },
  { href: '#/cookies', label: 'Πολιτική Cookies' },
  { href: '#/copyright', label: 'Πνευματικά Δικαιώματα' },
];

/* Shared shell for Privacy / Cookies / Terms / Copyright / Unsubscribed: the same public header, footer and wave
   language as the rest of the site, a quiet hero, and a readable document column. The four legal links and
   «Ρυθμίσεις cookies» that used to sit under the text are in the shared footer (LegalLinks). */
export default function LegalLayout({ title, children, showUpdated = true }: { title: string; children: ReactNode; showUpdated?: boolean }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const here = typeof window !== 'undefined' ? window.location.hash.split('?')[0] : '';
  const isLegalDoc = LEGAL_PAGES.some((p) => p.href === here);

  return (
    <div className="lp">
      <PublicHeader current="legal" />
      <main id="top">
        <section className="lp-legal-hero lp-wave-host" aria-labelledby="lp-legal-title">
          <div className="lp-wrap">
            <span className="lp-eyebrow">{isLegalDoc ? 'ΝΟΜΙΚΑ ΚΕΙΜΕΝΑ' : 'HLEKTRISMOS.GR'}</span>
            <h1 id="lp-legal-title">{title}</h1>
            {showUpdated && <p className="lp-legal-hero__meta">Τελευταία ενημέρωση: {POLICY_UPDATED}</p>}
            {isLegalDoc && (
              <nav aria-label="Νομικά κείμενα">
                <ul className="lp-legal-tabs">
                  {LEGAL_PAGES.map((p) => (
                    <li key={p.href}><a href={p.href} aria-current={p.href === here ? 'page' : undefined}>{p.label}</a></li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
          <WaveDivider fill="#ffffff" edge="bottom" size="md" />
        </section>
        <div className="lp-legal-body">
          <div className="lp-wrap">
            <article className="lp-prose">{children}</article>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
