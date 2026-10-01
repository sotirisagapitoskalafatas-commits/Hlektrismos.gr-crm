import LegalLayout, { a, h2, ul } from '@/components/LegalLayout';
import { COMPANY } from '@/lib/legal';
import { openConsentSettings, useConsent } from '@/lib/consent';

/* Lists exactly what the code stores/loads — keep in sync with
   lib/consent.ts and the localStorage keys used across src/. */
export default function Cookies() {
  const { decided, choices } = useConsent();
  return (
    <LegalLayout title="Πολιτική Cookies">
      <h2 style={h2}>1. Η επιλογή σας</h2>
      <p>Τρέχουσα επιλογή: <strong>{!decided ? 'δεν έχει δοθεί (τίποτα προαιρετικό δεν φορτώνεται)' : choices.analytics ? 'Μέτρηση απόδοσης: ενεργή' : 'Μέτρηση απόδοσης: απενεργοποιημένη'}</strong></p>
      <p><button type="button" onClick={openConsentSettings} style={{ padding: '10px 18px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Αλλαγή ή ανάκληση συγκατάθεσης</button></p>

      <h2 style={h2}>2. Απολύτως απαραίτητα (χωρίς συγκατάθεση)</h2>
      <p>Δεν χρησιμοποιούμε cookies. Χρησιμοποιούμε την τοπική αποθήκευση του browser (localStorage) μόνο για:</p>
      <ul style={ul}>
        <li><code>sb-*-auth-token</code>: σύνδεση προσωπικού στο CRM (Supabase).</li>
        <li><code>atlas.consent</code>: η επιλογή σας για τη συγκατάθεση και πότε δόθηκε.</li>
        <li>Προτιμήσεις εμφάνισης: <code>theme</code>, <code>atlas.nav.collapsed</code>, θέση του JARVIS, ρυθμίσεις ημερολογίου και εφαρμογής πλοήγησης.</li>
        <li>Ουρά εκκρεμών ενεργειών εκτός σύνδεσης (μόνο για προσωπικό πεδίου).</li>
      </ul>

      <h2 style={h2}>3. Μέτρηση απόδοσης (μόνο με συγκατάθεση)</h2>
      <ul style={ul}>
        <li><strong>Vercel Speed Insights:</strong> μετρά την ταχύτητα φόρτωσης (Web Vitals), με URL σελίδας, τύπο συσκευής/browser και τη διεύθυνση IP που βλέπει η Vercel. Δεν τοποθετεί cookies. Φορτώνεται μόνο αν επιλέξετε «Αποδοχή».</li>
      </ul>
      <p>Δεν χρησιμοποιούμε διαφημιστικά cookies, καταγραφή συνεδρίας (session replay), heatmaps ή καταγραφή πληκτρολόγησης.</p>

      <h2 style={h2}>4. Εξωτερικοί πόροι</h2>
      <p>Οι γραμματοσειρές και οι εικόνες φιλοξενούνται στον δικό μας server. Η δημόσια ιστοσελίδα δεν φορτώνει πόρους από τρίτους (π.χ. Google Fonts).</p>

      <h2 style={h2}>5. Επικοινωνία</h2>
      <p><a href={`mailto:${COMPANY.privacyEmail}`} style={a}>{COMPANY.privacyEmail}</a> · {COMPANY.phone}</p>
    </LegalLayout>
  );
}
