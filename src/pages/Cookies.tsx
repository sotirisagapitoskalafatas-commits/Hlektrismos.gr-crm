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
      <p><button type="button" onClick={openConsentSettings} className="lp-btn lp-btn--ghost">Αλλαγή ή ανάκληση συγκατάθεσης</button></p>

      <h2 style={h2}>2. Απολύτως απαραίτητα (χωρίς συγκατάθεση)</h2>
      <p>Η δημόσια ιστοσελίδα δεν τοποθετεί cookies. Χρησιμοποιεί όμως την τοπική αποθήκευση του browser (localStorage), μια τεχνολογία παρόμοια με τα cookies, για τα εξής:</p>
      <ul style={ul}>
        <li><code>theme</code>: η εμφάνιση της σελίδας (φωτεινή ή σκοτεινή). Αποθηκεύεται με την πρώτη επίσκεψη.</li>
        <li><code>atlas.consent</code>: η επιλογή σας για τη μέτρηση απόδοσης, πότε δόθηκε και η έκδοση της πολιτικής. Αποθηκεύεται μόνο όταν κάνετε επιλογή.</li>
      </ul>
      <p>Για το εξουσιοδοτημένο προσωπικό, μετά τη σύνδεση στο CRM, ο browser αποθηκεύει επιπλέον (localStorage και sessionStorage): τη σύνδεση στο CRM (<code>sb-*-auth-token</code>, Supabase), προτιμήσεις οθόνης και εργαλείων (π.χ. <code>atlas.nav.collapsed</code>, ημερολόγιο, εφαρμογή πλοήγησης, ρυθμίσεις του βοηθού AI) και ουρά εκκρεμών ενεργειών εκτός σύνδεσης. Αυτά δεν αφορούν τους επισκέπτες της δημόσιας ιστοσελίδας.</p>

      <h2 style={h2}>3. Μέτρηση απόδοσης (μόνο με συγκατάθεση)</h2>
      <ul style={ul}>
        <li><strong>Vercel Speed Insights:</strong> μετρά την ταχύτητα φόρτωσης (Web Vitals), μαζί με τη διαδρομή της σελίδας και τον τύπο συσκευής και browser. Δεν τοποθετεί cookies. Φορτώνεται μόνο αν επιλέξετε «Αποδοχή»· αν επιλέξετε «Απόρριψη» ή ανακαλέσετε τη συγκατάθεση, δεν φορτώνεται.</li>
      </ul>
      <p>Δεν χρησιμοποιούμε διαφημιστικά cookies, καταγραφή συνεδρίας (session replay), heatmaps ή καταγραφή πληκτρολόγησης.</p>

      <h2 style={h2}>4. Εξωτερικοί πόροι</h2>
      <p>Οι γραμματοσειρές και οι εικόνες φιλοξενούνται στον δικό μας server. Η δημόσια ιστοσελίδα δεν φορτώνει πόρους από τρίτους (π.χ. Google Fonts). Ο σύνδεσμος προς Google Maps στη σελίδα Επικοινωνίας ανοίγει μόνο αν τον πατήσετε.</p>

      <h2 style={h2}>5. Επικοινωνία</h2>
      <p><a href={`mailto:${COMPANY.privacyEmail}`} style={a}>{COMPANY.privacyEmail}</a> · {COMPANY.phone}</p>
    </LegalLayout>
  );
}
