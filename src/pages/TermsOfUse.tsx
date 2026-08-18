import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function TermsOfUse() {
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
        <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 8, color: '#1a1a2e' }}>Όροι Χρήσης</h1>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 40 }}>Τελευταία ενημέρωση: Αύγουστος 2026</p>

        <div style={{ lineHeight: 1.8, fontSize: 15, color: '#444' }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>1. Αποδοχή Όρων</h2>
          <p>Η πρόσβαση και χρήση της ιστοσελίδας <strong>hlektrismos.gr</strong> και των σχετικών υπηρεσιών υπόκειται στους παρόντες Όρους Χρήσης. Χρησιμοποιώντας τις υπηρεσίες μας, αποδέχεστε πλήρως τους παρόντες όρους. Εάν δεν συμφωνείτε με οποιοδήποτε τμήμα των όρων αυτών, παρακαλούμε να μην χρησιμοποιείτε τις υπηρεσίες μας.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>2. Περιγραφή Υπηρεσιών</h2>
          <p>Η Hlektrismos.gr παρέχει ολοκληρωμένες υπηρεσίες διαχείρισης πελατολογίου (CRM) και τεχνητής νοημοσύνης (AI) για εταιρείες ενέργειας. Οι υπηρεσίες περιλαμβάνουν:</p>
          <ul style={{ paddingLeft: 24, margin: '12px 0' }}>
            <li>Αυτοματοποιημένη επικοινωνία με πελάτες μέσω AI agents</li>
            <li>Διαχείριση leads και pipeline πωλήσεων</li>
            <li>Ανάλυση τιμολογίων ενέργειας και κοστολόγηση</li>
            <li>Ολοκληρωμένα εργαλεία αυτοματοποίησης marketing</li>
            <li>Παρακολούθηση απόδοσης AI agents σε πραγματικό χρόνο</li>
          </ul>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>3. Εγγραφή και Λογαριασμός</h2>
          <p>Για τη χρήση ορισμένων λειτουργιών, απαιτείται εγγραφή και δημιουργία λογαριασμού. Είστε υπεύθυνοι για τη διατήρηση της εμπιστοσύνης των στοιχείων σύνδεσής σας και για όλες τις δραστηριότητες που λαμβάνουν χώρα υπό τον λογαριασμό σας.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>4. Χρήση AI Υπηρεσιών</h2>
          <p>Οι AI agents της Hlektrismos.gr λειτουργούν ως αυτόνομα εργαλεία επικοινωνίας. Παρά την τεχνητή νοημοσύνη τους, όλες οι κρίσιμες αποφάσεις που αφορούν συμβόλαια και οικονομικές συναλλαγές απαιτούν έγκριση από ανθρώπινο προσωπικό. Η εταιρεία δεν φέρει ευθύνη για αποφάσεις που λαμβάνονται αποκλειστικά από AI agents χωρίς ανθρώπινη έγκριση.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>5. Πνευματική Ιδιοκτησία</h2>
          <p>Όλο το περιεχόμενο της ιστοσελίδας, συμπεριλαμβανομένων κειμένων, γραφικών, λογισμικού και AI μοντέλων, αποτελεί πνευματική ιδιοκτησία της Hlektrismos.gr. Απαγορεύεται η αντιγραφή, αναπαραγωγή ή διανομή χωρίς ρητή γραπτή άδεια.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>6. Περιορισμός Ευθύνης</h2>
          <p>Η Hlektrismos.gr παρέχεται "ως έχει" χωρίς εγγύηση. Δεν εγγυόμαστε τη συνεχή διαθεσιμότητα ή την αποτελεσματικότητα των υπηρεσιών. Η ευθύνη μας περιορίζεται στο μέγεθος που επιτρέπεται από την ελληνική νομοθεσία.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>7. Εφαρμοστέο Δίκαιο</h2>
          <p>Οι παρόντες όροι υπόκεινται στην ελληνική νομοθεσία. Τυχόνές διαφορές υπόκεινται αποκλειστικά στη δικαιοδοσία των δικαστηρίων Αθηνών.</p>

          <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginTop: 40, marginBottom: 16 }}>8. Επικοινωνία</h2>
          <p>Για οποιαδήποτε ερώτηση σχετικά με τους παρόντες όρους, επικοινωνήστε μαζί μας στο <a href="mailto:info@hlektrismos.gr" style={{ color: '#0066cc' }}>info@hlektrismos.gr</a> ή στο <strong>+30 210 1234567</strong>.</p>
        </div>
      </main>
    </div>
  );
}
