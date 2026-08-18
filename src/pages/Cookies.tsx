import { useEffect } from 'react';

export default function Cookies() {
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
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, color: '#1a1a2e' }}>Πολιτική Cookies</h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 40 }}>Τελευταία ενημέρωση: Αύγουστος 2026</p>

        <div style={{ lineHeight: 1.8, fontSize: 15, color: '#444' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>1. Τι είναι τα Cookies;</h2>
          <p>Τα cookies είναι μικρά αρχεία κειμένου που αποθηκεύονται στη συσκευή σας όταν επισκεφτείτε μια ιστοσελίδα. Βοηθούν στη λειτουργία της ιστοσελίδας και στη βελτίωση της εμπειρίας σας.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>2. Τύποι Cookies που Χρησιμοποιούμε</h2>

          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a2e', marginTop: 24, marginBottom: 12 }}>Α. Απαραίτητα Cookies</h3>
          <p>Αυτά τα cookies είναι απαραίτητα για τη βασική λειτουργία της ιστοσελίδας. Χωρίς αυτά, η ιστοσελίδα δεν θα λειτουργεί σωστά.</p>
          <ul style={{ paddingLeft: 24, margin: '12px 0' }}>
            <li><strong>session_id:</strong> Διατήρηση συνεδρίας χρήστη</li>
            <li><strong>csrf_token:</strong> Προστασία από CSRF επιθέσεις</li>
            <li><strong>auth_token:</strong> Αυθεντικοποίηση χρήστη (Supabase)</li>
          </ul>

          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a2e', marginTop: 24, marginBottom: 12 }}>Β. Analytics Cookies</h3>
          <p>Βοηθούν στην κατανόηση του πώς χρησιμοποιείτε την ιστοσελίδα, ώστε να μπορούμε να τη βελτιώσουμε.</p>
          <ul style={{ paddingLeft: 24, margin: '12px 0' }}>
            <li><strong>_vercel_insights:</strong> Vercel Analytics (ανώνυμα δεδομένα χρήσης)</li>
          </ul>

          <h3 style={{ fontSize: 18, fontWeight: 600, color: '#1a1a2e', marginTop: 24, marginBottom: 12 }}>Γ. Λειτουργικά Cookies</h3>
          <p>Θυμούνται τις προτιμήσεις σας (γλώσσα, θέμα) για να προσφέρουν εξατομικευμένη εμπειρία.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>3. Διαχείριση Cookies</h2>
          <p>Μπορείτε να διαχειριστείτε τα cookies μέσω των ρυθμίσεων του browser σας. Σημειώστε ότι η απενεργοποίηση ορισμένων cookies μπορεί να επηρεάσει τη λειτουργικότητα της ιστοσελίδας.</p>
          <ul style={{ paddingLeft: 24, margin: '12px 0' }}>
            <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>Google Chrome</a></li>
            <li><a href="https://support.mozilla.org/el/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>Mozilla Firefox</a></li>
            <li><a href="https://support.apple.com/el-gr/guide/safari/sfri11471/mac" target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>Safari</a></li>
            <li><a href="https://support.microsoft.com/el-el/microsoft-edge/%CE%B4%CE%B9%CE%B1%CF%87%CE%B5%CE%AF%CF%81%CE%B9%CF%83%CE%B7-cookies-%CF%83%CF%84%CE%B7%CE%BD-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer" style={{ color: '#0066cc' }}>Microsoft Edge</a></li>
          </ul>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>4. Τρίτοι Πάροχοι</h2>
          <p>Χρησιμοποιούμε Vercel Analytics για τη μέτρηση επισκεψιμότητας. Αυτός ο πάροχος δεν χρησιμοποιεί cookies για σκοπούς targeting ή advertising.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>5. Ενημέρωση</h2>
          <p>Αυτή η πολιτική ενημερώνεται τακτικά. Η τελευταία ενημέρωση ήταν στις Αυγούστου 2026.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>6. Επικοινωνία</h2>
          <p>Για ερωτήματα: <a href="mailto:privacy@hlektrismos.gr" style={{ color: '#0066cc' }}>privacy@hlektrismos.gr</a> | <strong>+30 210 1234567</strong></p>
        </div>
      </main>
    </div>
  );
}
