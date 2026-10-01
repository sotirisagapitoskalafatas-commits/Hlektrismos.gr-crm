import { openConsentSettings } from '@/lib/consent';

/* Footer legal links shared by every public page. */
export default function LegalLinks({ color = '#9fb0b7', className }: { color?: string; className?: string }) {
  const s = { color, textDecoration: 'none' } as const;
  return (
    <span className={className} style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
      <a href="#/privacy" className="footer-link" style={s}>Πολιτική Απορρήτου</a>
      <a href="#/terms" className="footer-link" style={s}>Όροι Χρήσης</a>
      <a href="#/cookies" className="footer-link" style={s}>Cookies</a>
      <a href="#/copyright" className="footer-link" style={s}>Πνευματικά Δικαιώματα</a>
      <button type="button" onClick={openConsentSettings} className="footer-link"
        style={{ ...s, background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}>Ρυθμίσεις cookies</button>
    </span>
  );
}
