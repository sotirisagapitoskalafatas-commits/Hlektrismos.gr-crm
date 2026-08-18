import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function PrivacyPolicy() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{ minHeight: '100vh', background: '#fff', color: '#1a1a2e', fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(20px)', borderBottom: '1px solid #e8ecf1', padding: '16px 0' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #00c878, #0066cc)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>⚡</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: '#1a1a2e' }}>Hlektrismos<span style={{ color: '#00c878' }}>.gr</span></span>
          </Link>
          <Link to="/" style={{ textDecoration: 'none', color: '#0066cc', fontWeight: 500, fontSize: 14 }}>← Επιστροφή</Link>
        </div>
      </nav>

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '60px 24px 80px' }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, color: '#1a1a2e' }}>Πολιτική Απορρήτου</h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 40 }}>Τελευταία ενημέρωση: Αύγουστος 2026</p>

        <div style={{ lineHeight: 1.8, fontSize: 15, color: '#444' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>1. Εισαγωγή</h2>
          <p>Η Hlektrismos.gr λαμβάνει πολύ σοβαρά το απόρρητο των δεδομένων σας. Η παρούσα Πολιτική Απορρήτου περιγράφει πώς συλλέγουμε, χρησιμοποιούμε, αποθηκεύουμε και προστατεύουμε τα προσωπικά σας δεδομένα, σύμφωνα με τον Κανονισμό (EU) 2016/679 (GDPR) και τον ελληνικό Νόμο 4624/2019.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>2. Τύποι Δεδομένων που Συλλέγουμε</h2>
          <p><strong>Δεδομένα ταυτότητας:</strong> Όνομα, επώνυμο, email, τηλέφωνο, εταιρεία.</p>
          <p><strong>Δεδομένα χρήσης:</strong> IP, τύπος browser, συσκευή, σελίδες που επισκεφθήκατε.</p>
          <p><strong>Δεδομένα ενεργείας:</strong> Τιμολόγια ενέργειας, λογαριασμοί ρεύματος, κατανάλωση.</p>
          <p><strong>AI Interactions:</strong> Συνομιλίες με AI agents, αιτήματα callback, δεδομένα που παρέχετε στο chatbot.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>3. Σκοπός Επεξεργασίας</h2>
          <ul style={{ paddingLeft: 24, margin: '12px 0' }}>
            <li>Παροχή υπηρεσιών CRM και AI επικοινωνίας</li>
            <li>Βελτίωση της εμπειρίας χρήστη</li>
            <li>Αποστολή marketing communications (μόνο με συγκατάθεση)</li>
            <li>Πλήρωση νομικών υποχρεώσεων</li>
            <li>Ανάλυση και βελτίωση υπηρεσιών</li>
          </ul>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>4. Νομική Βάση Επεξεργασίας</h2>
          <p>Επεξεργαζόμαστε τα δεδομένα σας με βάση: (α) τη συγκατάθεσή σας, (β) την εκτέλεση συμβολαίου, (γ) το νόμιμο συμφέρον, ή (δ) την τήρηση νομικής υποχρέωσης.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>5. Κοινοποίηση Δεδομένων</h2>
          <p>Δεν πωλούμε τα δεδομένα σας. Μπορεί να τα κοινοποιήσουμε σε: (α) προμηθευτές υπηρεσιών cloud (Supabase, Vercel), (β) εξυπηρετητές email, (γ) αρμόδιες αρχές όπως απαιτεί ο νόμος.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>6. Ασφάλεια Δεδομένων</h2>
          <p>Εφαρμόζουμε τεχνικές και οργανωτικές μέτρα ασφαλείας, συμπεριλαμβανομένου: κρυπτογράφηση SSL/TLS, έλεγχος πρόσβασης, RLS (Row Level Security) στη βάση δεδομένων, και τακτικές ασφάλειας audit.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>7. Δικαιώματά σας</h2>
          <p>Σύμφωνα με το GDPR, έχετε δικαίωμα: πρόσβασης, διόρθωσης, διαγραφής, περιορισμού, φορητότητας, και αντίρρησης στην επεξεργασία των δεδομένων σας. Για να ασκήσετε τα δικαιώματά σας, επικοινωνήστε στο <a href="mailto:privacy@hlektrismos.gr" style={{ color: '#0066cc' }}>privacy@hlektrismos.gr</a>.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>8. Cookies</h2>
          <p>Χρησιμοποιούμε cookies για τη βελτίωση της εμπειρίας σας. Για περισσότερες πληροφορίες, ανατρέξτε στη <Link to="/cookies" style={{ color: '#0066cc' }}>Πολιτική Cookies</Link> μας.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>9. Επικοινωνία</h2>
          <p>Για ερωτήματα σχετικά με το απόρρητο: <a href="mailto:privacy@hlektrismos.gr" style={{ color: '#0066cc' }}>privacy@hlektrismos.gr</a> | <strong>+30 210 1234567</strong></p>
          <p>Αρμόδια Αρχή: Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (αρχηγείο.gr)</p>
        </div>
      </main>
    </div>
  );
}
