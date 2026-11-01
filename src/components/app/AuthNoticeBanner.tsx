import { useEffect, useState } from 'react';
import { takeAuthNotice, type AuthNotice } from '@/lib/auth-notice';

/* One-time message about an e-mailed Auth link (expired, already used, half of an e-mail change, finished e-mail change). Shown on any page. */
export default function AuthNoticeBanner() {
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  useEffect(() => {
    const read = () => { const n = takeAuthNotice(); if (n) setNotice(n); };
    read();
    window.addEventListener('atlas:auth-notice', read);
    return () => window.removeEventListener('atlas:auth-notice', read);
  }, []);
  if (!notice) return null;
  const color = notice.tone === 'ok' ? '#0a6b3d' : notice.tone === 'err' ? '#a12a2a' : '#0057b0';
  return (
    <div role={notice.tone === 'err' ? 'alert' : 'status'} data-auth-notice={notice.tone}
      style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10000, maxWidth: 560, width: 'calc(100% - 32px)', background: '#fff', color: '#1a2a40', border: `1px solid ${color}`, borderLeft: `6px solid ${color}`, borderRadius: 12, padding: '12px 14px', boxShadow: '0 8px 28px rgba(15,30,60,.18)', display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.45 }}>
      <span style={{ flex: 1 }}>{notice.text}</span>
      <button type="button" onClick={() => setNotice(null)} aria-label="Κλείσιμο μηνύματος"
        style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 18, lineHeight: 1, color: '#475569' }}>×</button>
    </div>
  );
}
