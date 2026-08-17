import { useState } from 'react';
import { ChevronDown, Phone, Zap } from 'lucide-react';

interface FaqItem {
  id: number;
  category: string;
  question: string;
  answer: string;
}

const faqs: FaqItem[] = [
  { id: 1, category: 'Αλλαγή Παρόχου', question: 'Πως μπορώ να αλλάξω πάροχο ηλεκτρικού ρεύματος;', answer: 'Η αλλαγή παρόχου είναι μια απλή και δωρεάν διαδικασία. Αρκεί να υπογράψεις μια Σύμβαση Προμήθειας με τον νέο πάροχο που επιλέγεις και να καταθέσεις τα απαραίτητα δικαιολογητικά. Η υπόλοιπη διαδικασία γίνεται αυτόματα και πολύ γρήγορα.' },
  { id: 2, category: 'Αλλαγή Παρόχου', question: 'Υπάρχει κάποια χρέωση για την αλλαγή;', answer: 'Όχι, η αλλαγή παρόχου είναι εντελώς δωρεάν. Δεν υπάρχουν καμία κρυφή χρέωση ή προμήθεια. Η διαδικασία διεκπεραιώνεται από τον νέο πάροχο χωρίς κόστος για σένα.' },
  { id: 3, category: 'Αλλαγή Παρόχου', question: 'Πόσος χρόνος χρειάζεται;', answer: 'Η αλλαγή ολοκληρώνεται σε 7 εργάσιμες ημέρες, μέσω του Ηλεκτρονικού Διακυβερνητικού Μητρώου Διαχείρισης Επιπέδου Πελάτη (ΔΕΔΔΗΕ). Μπορείς να ελέγξεις την πρόοδο της αλλαγής οποιαδήποτε στιγμή.' },
  { id: 4, category: 'Αλλαγή Παρόχου', question: 'Υπάρχει περίπτωση να μείνω χωρίς ρεύμα;', answer: 'Καθόλου. Η αλλαγή παρόχου είναι μια εμπορική και λογιστική μεταβολή, όχι φυσική. Η παροχή ρεύματος παραμένει εγγυημένη καθ\' όλη τη διάρκεια της διαδικασίας και μετά. Το δίκτυο παραμένει πάντα ίδιο.' },
  { id: 5, category: 'Αλλαγή Παρόχου', question: 'Ρεύμα από εναλλακτικούς παρόχους σε όλη την Ελλάδα;', answer: 'Σχεδόν. Οι εναλλακτικοί προμηθευτές λειτουργούν σε όλη την Ελλάδα, εκτός από τα μη διασυνδεδεμένα νησιά όπου η αγορά δεν είναι ελεύθερη. Για αυτά τα νησιά ισχύουν ειδικές ρυθμίσεις.' },

  { id: 6, category: 'Προμηθευτές', question: 'Τι είναι ο Προμηθευτής Τελευταίου Καταφυγίου;', answer: 'Ο Προμηθευτής Τελευταίου Καταφυγίου (ΠΤΚ) είναι ένας πάροχος ενέργειας που υποχρεώνεται από τον Νόμο να προμηθεύει τους καταναλωτές που δεν έχουν επιλέξει προμηθευτή. Ορίζεται από την Ρυθμιστική Αρχή Ενέργειας (ΡΑΕ) και η μεταφορά τους γίνεται αυτόματα.' },
  { id: 7, category: 'Προμηθευτές', question: 'Τι είναι ο Προμηθευτής Καθολικής Υπηρεσίας;', answer: 'Ο Προμηθευτής Καθολικής Υπηρεσίας (ΠΚΥ) είναι ένας πάροχος που υποχρεώνεται να προμηθεύει τους μικρούς οικιακούς πελάτες (μέχρι 25kVA) σε όλη την Ελλάδα. Παρέχει σταθερές τιμές και αξιοπιστία.' },
  { id: 8, category: 'Προμηθευτές', question: 'Ποια είναι η Καθολική Υπηρεσία;', answer: 'Η Καθολική Υπηρεσία θεσπίστηκε το 2011 για να εξασφαλίζει ρεύμα σε νοικοκυριά και μικρές επιχειρήσεις με κατανάλωση έως 25kVA. Είναι ουσιαστικά μια υποχρέωση παροχής που επιβάλλεται στους παρόχους.' },
  { id: 9, category: 'Προμηθευτές', question: 'Πως υπάγονται οι καταναλωτές;', answer: 'Οι καταναλωτές υπάγονται αυτόματα στην Καθολική Υπηρεσία αν δεν επιλέξουν πάροχο ή αν λήξει ο χρόνος σύμβασης του Προμηθευτή Τελευταίου Καταφυγίου. Η μεταφορά γίνεται χωρίς διακοπή.' },
  { id: 10, category: 'Προμηθευτές', question: 'Ποιες είναι οι τιμές;', answer: 'Οι τιμές της Καθολικής Υπηρεσίας καθορίζονται σύμφωνα με το τιμολόγιο αναφοράς (μέση τιμή της αγοράς) συν προσαύξηση περίπου 12%. Είναι σταθερές και προβλέψιμες, αλλά συχνά υψηλότερες από τις ελεύθερης αγοράς.' },

  { id: 11, category: 'Εγγύηση & Λογαριασμοί', question: 'Τι γίνεται με την εγγύηση;', answer: 'Η εγγύηση που κατέβαλες στον παλιό σου πάροχο επιστρέφεται ή συμψηφίζεται στον τελευταίο λογαριασμό σου από τον προηγούμενο πάροχο. Δεν χάνεται το ποσό — απλά περιμένεις τον τελευταίο λογαριασμό.' },
  { id: 12, category: 'Εγγύηση & Λογαριασμοί', question: 'Ποιο είναι το ποσό;', answer: 'Το ποσό της εγγύησης είναι ίσο με το κόστος προμήθειας για 45 ημέρες κατανάλωσης. Αυτό το ποσό περιλαμβάνεται στον πρώτο λογαριασμό που λαμβάνεις από τον νέο πάροχο.' },
  { id: 13, category: 'Εγγύηση & Λογαριασμοί', question: 'Κάθε πότε λογαριασμό;', answer: 'Οι λογαριασμοί είναι μηνιαίοι. Θα λαμβάνεις έναν έναντιο λογαριασμό και έναν εκκαθαριστικό λογαριασμό. Επίσης, μπορεί να εκδοθεί και τελικός λογαριασμός σε περίπτωση αλλαγής ή αποχώρησης.' },

  { id: 14, category: 'Χρεώσεις', question: 'Ανταγωνιστικές χρεώσεις;', answer: 'Οι ανταγωνιστικές χρεώσεις καθορίζονται από κάθε προμηθευτή ξεχωριστά και διαφέρουν ανάλογα με το πρόγραμμα. Σχετίζονται άμεσα με τον τόπο κατανάλωσης και το ύψος κατανάλωσης.' },
  { id: 15, category: 'Χρεώσεις', question: 'Άλλες χρεώσεις;', answer: 'Εκτός από τις ανταγωνιστικές χρεώσεις, υπάρχουν και ρυθμιζόμενες χρεώσεις, φόροι και τέλη. Αυτές είναι ανεξάρτητες από τον προμηθευτή και ισχύουν ίδιες για όλους.' },
  { id: 16, category: 'Χρεώσεις', question: 'Ρυθμιζόμενες χρεώσεις;', answer: 'Οι ρυθμιζόμενες χρεώσεις αφορούν τη χρήση υποδομών του δικτύου (μεταφοράς & διανομής). Είναι ανεξάρτητες από τον προμηθευτή και καθορίζονται από τη ΡΑΕ.' },
  { id: 17, category: 'Χρεώσεις', question: 'Λοιπές χρεώσεις;', answer: 'Οι λοιπές χρεώσεις περιλαμβάνουν φορολογικούς και λοιπούς επιβαρυντικούς. Σχετίζονται με τη λειτουργία της αγοράς και την εφαρμογή νομοθεσίας.' },
  { id: 18, category: 'Χρεώσεις', question: 'Τιμή κιλοβατώρας;', answer: 'Η τιμή του kWh εξαρτάται από την εταιρεία και το πρόγραμμα που θα επιλέξεις. Μπορεί να είναι σταθερή ή κυμαινόμενη. Συγκρίνε προσφορές για να βρεις την καλύτερη.' },
  { id: 19, category: 'Χρεώσεις', question: 'Μη πληρωμή δημοτικών τελών;', answer: 'Τα ακίνητα που δεν έχουν σύνδεση ρεύματος (αποκομμένα ρεύμα) απαλλάσσονται από την καταβολή δημοτικών τελών, υπό την προϋπόθεση υποβολής υπεύθυνης δήλωσης στον Δήμο.' },

  { id: 20, category: 'ΟΤΣ & Διακοπές', question: 'Τι είναι η ΟΤΣ;', answer: 'Η Ομοσπονδιακή Τιμή Συναλλαγής (ΟΤΣ) είναι η τιμή εκκαθάρισης της αγοράς ηλεκτρικής ενέργειας. Αποτελεί το μεγαλύτερο μέρος του ανταγωνιστικού κόστους στον λογαριασμό σου.' },
  { id: 21, category: 'ΟΤΣ & Διακοπές', question: 'Διακύμανση ΟΤΣ;', answer: 'Ναι, η ΟΤΣ διακυμαίνεται ανάμεσα στα κατώτατα και ανώτατα όρια που θεσπίζονται στο Ελληνικό Χρηματιστήριο Ενέργειας (ΕΧΕ). Επηρεάζεται από παράγοντες όπως ο καιρός και η ζήτηση.' },
  { id: 22, category: 'ΟΤΣ & Διακοπές', question: 'Μέτρηση;', answer: 'Ο ΔΕΔΔΗΕ (Διαχειριστής Δικτύου Διανομής Ελλάδος) είναι υπεύθυνος για τις μετρήσεις. Στέλνει τα δεδομένα κατανάλωσης στους προμηθευτές και σε εσένα.' },
  { id: 23, category: 'ΟΤΣ & Διακοπές', question: 'Διακοπή;', answer: 'Σε περίπτωση διακοπής παροχής, απευθύνσου στον ΔΕΔΔΗΕ για να ρυθμίσεις την αποκατάσταση ή την ανασύνδεση του ρεύματος.' },
];

const categories = [
  { label: 'Όλες', count: 23 },
  { label: 'Αλλαγή Παρόχου', count: 5 },
  { label: 'Προμηθευτές', count: 5 },
  { label: 'Εγγύηση & Λογαριασμοί', count: 3 },
  { label: 'Χρεώσεις', count: 6 },
  { label: 'ΟΤΣ & Διακοπές', count: 4 },
];

function FaqAccordion({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div style={{ borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden', background: 'var(--surface)', transition: 'box-shadow 0.2s', boxShadow: isOpen ? '0 0 0 1px rgba(0,200,120,0.2)' : 'none' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', paddingRight: 16 }}>{item.question}</span>
        <ChevronDown size={18} style={{ color: 'var(--text-muted)', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
      </button>
      <div style={{ maxHeight: isOpen ? 400 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
        <div style={{ padding: '0 24px 18px', fontSize: 14, lineHeight: 1.7, color: 'var(--text-muted)' }}>
          {item.answer}
        </div>
      </div>
    </div>
  );
}

export default function FaqPage() {
  const [activeCategory, setActiveCategory] = useState('Όλες');
  const [openId, setOpenId] = useState<number | null>(null);

  const filtered = activeCategory === 'Όλες' ? faqs : faqs.filter(f => f.category === activeCategory);

  return (
    <div className="app-shell">
      <header className="site-header scrolled">
        <div className="container nav-wrap">
          <a href="#top" className="brand"><span className="brand-mark"><Zap size={18} fill="currentColor" /></span><span>Hlektrismos<span>.gr</span></span></a>
          <nav className="main-nav open">
            <a href="#/">Αρχική</a>
            <a href="#/about">Σχετικά</a>
            <a href="#/services">Υπηρεσίες</a>
            <a href="#/energy">Ενέργεια</a>
            <a href="#/faq">FAQ</a>
            <a href="#/contact">Επικοινωνία</a>
            <a href="#/login" className="nav-dashboard">Σύνδεση</a>
          </nav>
        </div>
      </header>

      <main style={{ paddingTop: 80 }}>
        <section className="section" style={{ background: 'transparent' }}>
          <div className="container">
            <div className="section-heading" style={{ textAlign: 'left', maxWidth: 800 }}>
              <div className="eyebrow"><span className="eyebrow-dot" /> FAQ</div>
              <h2 style={{ color: 'var(--text)' }}>Συχνές <span className="gradient-text">ερωτήσεις</span></h2>
              <p style={{ color: 'var(--text-muted)' }}>Βρες απαντήσεις στις πιο συχνές ερωτήσεις για την ενέργεια, τους παρόχους και τους λογαριασμούς σου.</p>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
              {categories.map((cat) => (
                <button
                  key={cat.label}
                  onClick={() => { setActiveCategory(cat.label); setOpenId(null); }}
                  style={{
                    padding: '10px 20px',
                    borderRadius: 100,
                    border: activeCategory === cat.label ? 'none' : '1px solid var(--border)',
                    background: activeCategory === cat.label ? '#00c878' : 'var(--surface)',
                    color: activeCategory === cat.label ? '#fff' : 'var(--text)',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {cat.label} <span style={{ opacity: 0.7, marginLeft: 4 }}>({cat.count})</span>
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 12, maxWidth: 800 }}>
              {filtered.map((item) => (
                <FaqAccordion key={item.id} item={item} isOpen={openId === item.id} onToggle={() => setOpenId(openId === item.id ? null : item.id)} />
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: '80px 0', textAlign: 'center' }}>
          <div className="container">
            <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>Δεν βρήκες απάντηση;</h2>
            <p style={{ fontSize: 16, color: 'var(--text-muted)', marginBottom: 32 }}>Επικοινώνησε μαθαίνοντας περισσότερα για τις υπηρεσίες μας.</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="tel:+302102255000" className="btn btn-primary"><Phone size={16} /> +30 210 22 55 000</a>
              <a href="#/contact" className="btn btn-ghost" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>Επικοινωνία</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-bottom">
            <span>© 2026 hlektrismos.gr</span>
            <div className="footer-legal-links">
              <a href="https://hlektrismos.gr/politiki-aporritou/" target="_blank" rel="noopener noreferrer">Πολιτική Απορρήτου</a>
              <span>·</span>
              <a href="https://hlektrismos.gr/oroi-chrisis/" target="_blank" rel="noopener noreferrer">Όροι Χρήσης</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
