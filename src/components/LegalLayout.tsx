import { ReactNode, useEffect } from 'react';
import { POLICY_UPDATED } from '@/lib/legal';
import { openConsentSettings } from '@/lib/consent';

export const h2: React.CSSProperties = { fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 };
export const ul: React.CSSProperties = { paddingLeft: 24, margin: '12px 0' };
export const a: React.CSSProperties = { color: '#0066cc' };

/* Shared shell for Privacy / Cookies / Terms / Copyright / Unsubscribed. */
export default function LegalLayout({ title, children, showUpdated = true }: { title: string; children: ReactNode; showUpdated?: boolean }) {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#1a1a2e', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #e8ecf1', padding: '16px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <a href="#/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #00c878, #0066cc)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: '#1a1a2e' }}>Hlektrismos<span style={{ color: '#00c878' }}>.gr</span></span>
          </a>
          <a href="#/" style={{ textDecoration: 'none', color: '#0066cc', fontWeight: 500, fontSize: 14 }}>← Επιστροφή</a>
        </div>
      </nav>
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '60px 24px 80px' }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, color: '#1a1a2e' }}>{title}</h1>
        {showUpdated && <p style={{ color: '#888', fontSize: 14, marginBottom: 40 }}>Τελευταία ενημέρωση: {POLICY_UPDATED}</p>}
        <div style={{ lineHeight: 1.8, fontSize: 15, color: '#444', overflowWrap: 'anywhere' }}>{children}</div>
        <div style={{ marginTop: 56, paddingTop: 20, borderTop: '1px solid #e8ecf1', display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 14 }}>
          <a href="#/privacy" style={a}>Πολιτική Απορρήτου</a>
          <a href="#/terms" style={a}>Όροι Χρήσης</a>
          <a href="#/cookies" style={a}>Πολιτική Cookies</a>
          <a href="#/copyright" style={a}>Πνευματικά Δικαιώματα</a>
          <button type="button" onClick={openConsentSettings} style={{ ...a, background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}>Ρυθμίσεις cookies</button>
        </div>
      </main>
    </div>
  );
}
