import { useState } from 'react';
import { ChevronDown, Phone } from 'lucide-react';
import CinematicSkyBackground from '@/components/CinematicSkyBackground';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import WaveDivider from '@/components/public/WaveDivider';

interface FaqItem {
  id: number;
  category: string;
  question: string;
  answer: string;
}

const faqs: FaqItem[] = [
  // ── Αλλαγή Παρόχου (5) ──
  { id: 1, category: 'Αλλαγή Παρόχου', question: 'Πως μπορώ να αλλάξω πάροχο ηλεκτρικού ρεύματος;', answer: 'Για να αλλάξει κάποιος προμηθευτή ηλεκτρικής ενέργειας πρέπει να ακολουθήσει μια πολύ απλή διαδικασία. Αυτό που έχετε να κάνετε είναι να υπογράψετε Σύμβαση Προμήθειας με το νέο σας πάροχο ηλεκτρικού ρεύματος και να καταθέσετε τα απαραίτητα δικαιολογητικά. Η όλη διαδικασία είναι γρήγορη και δεν έχει κάποια οικονομική επιβάρυνση για εσάς.' },
  { id: 2, category: 'Αλλαγή Παρόχου', question: 'Υπάρχει κάποια χρέωση για την αλλαγή;', answer: 'Όχι, η αλλαγή παρόχου είναι μια δωρεάν διαδικασία για όλους τους καταναλωτές.' },
  { id: 3, category: 'Αλλαγή Παρόχου', question: 'Πόσος χρόνος χρειάζεται για να ολοκληρωθεί η αλλαγή προμηθευτή;', answer: 'Την όλη διαδικασία της αλλαγής παρόχου αναλαμβάνει ο ΔΕΔΔΗΕ και από την ημέρα που θα υπογράψετε τη σύμβαση απαιτούνται 7 εργάσιμες ημέρες για να ολοκληρωθεί.' },
  { id: 4, category: 'Αλλαγή Παρόχου', question: 'Υπάρχει περίπτωση να μείνω χωρίς ρεύμα κατά τη διάρκεια της διαδικασίας αλλαγής παρόχου ηλεκτρικού ρεύματος;', answer: 'Η αλλαγή παρόχου ρεύματος είναι μια καθαρά εμπορική/λογιστική μεταβολή οπότε δεν υπάρχει περίπτωση το ρεύμα να διακοπεί στο ακίνητό σας. Η παροχή ρεύματος είναι εγγυημένη από τον ΔΕΔΔΗΕ στο σπίτι ή τον επαγγελματικό σας χώρο.' },
  { id: 5, category: 'Αλλαγή Παρόχου', question: 'Ρεύμα από εναλλακτικούς παρόχους μπορούν να έχουν τα ακίνητα σε όλη την Ελλάδα;', answer: 'Για την ώρα ηλεκτρική ενέργεια δεν μπορούν να τροφοδοτηθούν όλες οι περιοχές της χώρας. Υπάρχει ένας μικρός αριθμός νησιών τα οποία δεν είναι συνδεδεμένα στο εθνικό δίκτυο ηλεκτροδότησης, «μη διασυνδεδεμένα νησιά» τα οποία οι εναλλακτικοί πάροχοι δεν τροφοδοτούν με ηλεκτρικό ρεύμα.' },

  // ── Προμηθευτές & Καθολική Υπηρεσία (5) ──
  { id: 6, category: 'Προμηθευτές & Καθολική Υπηρεσία', question: 'Τι είναι ο Προμηθευτής Τελευταίου Καταφυγίου;', answer: 'Ως Προμηθευτής Τελευταίου Καταφυγίου χαρακτηρίζεται ο πάροχος ηλεκτρικής ενέργειας ο οποίος είναι υποχρεωμένος να προμηθεύει με ρεύμα τους καταναλωτές που δεν εκπροσωπούνται από κάποιον προμηθευτή λόγω υπαιτιότητας του τελευταίου. Τον Προμηθευτή Τελευταίου Καταφυγίου ορίζει η ΡΑΕ και η μεταφορά σε αυτή την υπηρεσία γίνεται αυτόματα χωρίς να απαιτείται κάποια ενέργεια από τον πελάτη.' },
  { id: 7, category: 'Προμηθευτές & Καθολική Υπηρεσία', question: 'Τι είναι ο Προμηθευτής Καθολικής Υπηρεσίας;', answer: `Ο Προμηθευτής Καθολικής Υπηρεσίας είναι υποχρεωμένος να προμηθεύει μικρούς πελάτες σε όλη την Ελλάδα σε μια από τις παρακάτω περιπτώσεις:\n• οι υποψήφιοι πελάτες αδυνατούν να βρουν προμηθευτή στην απελευθερωμένη αγορά ενέργειας\n• οι υποψήφιοι πελάτες έχουν αδρανήσει σχετικά με το δικαίωμα ελεύθερης επιλογής προμηθευτή` },
  { id: 8, category: 'Προμηθευτές & Καθολική Υπηρεσία', question: 'Ποια είναι η Καθολική Υπηρεσία Προμήθειας ηλεκτρικού ρεύματος;', answer: 'Η Καθολική Υπηρεσία προμήθειας ηλεκτρικής ενέργειας θεσπίστηκε το 2011 με σκοπό να παρέχει ρεύμα σε νοικοκυριά και μικρές επιχειρήσεις (με ισχύ παροχής μέχρι 25kVA) οι οποίες δεν εκπροσωπούνται από κάποιον πάροχο ηλεκτρικού ρεύματος.' },
  { id: 9, category: 'Προμηθευτές & Καθολική Υπηρεσία', question: 'Πως υπάγονται οι καταναλωτές στον Προμηθευτή Καθολικής Υπηρεσίας;', answer: 'Η υπαγωγή γίνεται αυτόματα από τη στιγμή που ο πελάτης δεν επιλέγει κάποια εταιρεία προμήθειας ηλεκτρικού ρεύματος ή έχει λήξει ο χρόνος παραμονής του στον Προμηθευτή Τελευταίου Καταφυγίου.' },
  { id: 10, category: 'Προμηθευτές & Καθολική Υπηρεσία', question: 'Ποιες είναι οι τιμές τιμολόγησης των καταναλωτών που εκπροσωπούνται από τον Προμηθευτή Καθολικής Υπηρεσίας;', answer: 'Οι χρεώσεις που εφαρμόζονται υπολογίζονται σύμφωνα με το τιμολόγιο αναφοράς και έχουν μια προσαύξηση της τάξης του 12% ανά κατηγορία πελατών.' },

  // ── Εγγύηση & Λογαριασμοί (3) ──
  { id: 11, category: 'Εγγύηση & Λογαριασμοί', question: 'Τι γίνεται με την εγγύηση που έχω καταβάλει στον υφιστάμενο πάροχο;', answer: 'Η εγγύηση επιστρέφεται και γίνεται συμψηφισμός στον τελευταίο λογαριασμό του υφιστάμενου παρόχου ο οποίος χαρακτηρίζεται ως Τελικός.' },
  { id: 12, category: 'Εγγύηση & Λογαριασμοί', question: 'Ποιο είναι το ποσό εγγύησης που καταβάλω στον νέο πάροχο;', answer: 'Στους περισσότερους προμηθευτές ηλεκτρικής ενέργειας η εγγύηση είναι υποχρεωτική, αν και υπάρχουν περιπτώσεις όπου δίνεται η δυνατότητα πλήρους ή μερικής απαλλαγής όπως με την ενεργοποίηση της πάγιας εντολής. Το ποσό της εγγύησης είναι συνήθως ίσο με το κόστος του ρεύματος για διάστημα 45 ημερών και καταβάλλεται για να καλύψει τυχόν μελλοντικές οφειλές που μπορεί να έχει ο πελάτης. Η εγγύηση περιλαμβάνεται στον πρώτο λογαριασμό ηλεκτρικής ενέργειας που θα λάβετε από το νέο σας πάροχο.' },
  { id: 13, category: 'Εγγύηση & Λογαριασμοί', question: 'Κάθε πότε θα λαμβάνω λογαριασμό;', answer: `Ο λογαριασμός ρεύματος που λαμβάνετε από τις περισσότερες εταιρείες είναι μηνιαίος και χωρίζεται σε δύο τύπους:\n• έναντι - ο οποίος υπολογίζεται με βάση την εκτιμώμενη κατανάλωση\n• εκκαθαριστικός - που υπολογίζεται με βάση την πραγματική κατανάλωση όπως αυτή καταμετράται από τον ΔΕΔΔΗΕ\nΕπίσης υπάρχει ο Τελικός λογαριασμός ο οποίος εκδίδεται όταν σταματάει η ηλεκτροδότηση ή εκπροσώπηση του ακινήτου από τον προμηθευτή ηλεκτρικού ρεύματος.` },

  // ── Χρεώσεις στον Λογαριασμό (6) ──
  { id: 14, category: 'Χρεώσεις στον Λογαριασμό', question: 'Ποιες είναι οι ανταγωνιστικές χρεώσεις;', answer: 'Ως χρεώσεις προμήθειας ή ανταγωνιστικές χρεώσεις χαρακτηρίζονται οι χρεώσεις που καθορίζονται από τους προμηθευτές ηλεκτρικής ενέργειας και διαφέρουν μεταξύ των παρόχων. Σχετίζονται με την κατανάλωση ηλεκτρικού ρεύματος και αντανακλούν το κόστος που έχει ο κάθε προμηθευτής για την παραγωγή και προμήθεια ρεύματος σε οικονομικές τιμές.' },
  { id: 15, category: 'Χρεώσεις στον Λογαριασμό', question: 'Ποιες άλλες χρεώσεις υπάρχουν στο λογαριασμό ρεύματος;', answer: 'Σε κάθε λογαριασμό ρεύματος πέρα από τις ανταγωνιστικές χρεώσεις θα βρείτε τις ρυθμιζόμενες χρεώσεις, τους φόρους και τα τέλη που αναλογούν σε όλους τους καταναλωτές και είναι ανεξάρτητες του προμηθευτή ηλεκτρικής ενέργειας.' },
  { id: 16, category: 'Χρεώσεις στον Λογαριασμό', question: 'Ποιες είναι οι ρυθμιζόμενες χρεώσεις;', answer: 'Οι ρυθμιζόμενες χρεώσεις αφορούν τις χρεώσεις με τις οποίες επιβαρύνονται όλοι οι καταναλωτές για τη χρήση των υποδομών ηλεκτρικού ρεύματος που χρησιμοποιούν. Οι χρεώσεις αυτές είναι ανεξάρτητες του προμηθευτή ηλεκτρικού ρεύματος που έχετε επιλέξει.' },
  { id: 17, category: 'Χρεώσεις στον Λογαριασμό', question: 'Ποιες είναι οι λοιπές χρεώσεις;', answer: 'Ως λοιπές χρεώσεις χαρακτηρίζονται οι χρεώσεις που επιβάλλονται μέσα από την φορολογία και σχετίζονται με την ομαλή λειτουργία της αγοράς.' },
  { id: 18, category: 'Χρεώσεις στον Λογαριασμό', question: 'Ποια είναι η τιμή χρέωσης της κιλοβατώρας;', answer: 'Η τιμή της κιλοβατώρας εξαρτάται από την εταιρεία και το πρόγραμμα που έχετε επιλέξει.' },
  { id: 19, category: 'Χρεώσεις στον Λογαριασμό', question: 'Σε ακίνητα που δεν ηλεκτροδοτούνται υπάρχει η δυνατότητα μη πληρωμής δημοτικών τελών;', answer: 'Τα ακίνητα που δεν χρησιμοποιούνται και συνεπώς δεν έχουν ρεύμα απαλλάσσονται από την καταβολή δημοτικού τέλους για την καθαριότητα και τον φωτισμό υποβάλλοντας μια υπεύθυνη δήλωση στο Δήμο.' },

  // ── ΟΤΣ, Μέτρηση & Διακοπές (4) ──
  { id: 20, category: 'ΟΤΣ, Μέτρηση & Διακοπές', question: 'Τι είναι η ΟΤΣ;', answer: 'ΟΤΣ είναι η τιμή στην οποία εκκαθαρίζεται η αγορά ηλεκτρικού ρεύματος. Είναι η τιμή την οποία εισπράττουν όσοι δίνουν (πωλούν) ηλεκτρικό ρεύμα στο Σύστημα και πληρώνουν όσοι αγοράζουν ενέργεια από το Σύστημα. Η ΟΤΣ αποτελεί το μεγαλύτερο μέρος του ανταγωνιστικού κόστους ηλεκτρικού ρεύματος.' },
  { id: 21, category: 'ΟΤΣ, Μέτρηση & Διακοπές', question: 'Μπορούμε να γνωρίζουμε τη διακύμανση της ΟΤΣ ανά ώρα/ημέρα;', answer: 'Ναι, βρίσκεται αναρτημένη στο Ελληνικό Χρηματιστήριο Ενέργειας.' },
  { id: 22, category: 'ΟΤΣ, Μέτρηση & Διακοπές', question: 'Ποιος είναι υπεύθυνος για τη μέτρηση της κατανάλωσης;', answer: 'Την ευθύνη για την καταμέτρηση έχει ο ΔΕΔΔΗΕ ο οποίος τις στέλνει στους προμηθευτές ηλεκτρικής ενέργειας για να υπολογίσουν το κόστος της κατανάλωσης.' },
  { id: 23, category: 'ΟΤΣ, Μέτρηση & Διακοπές', question: 'Που απευθυνόμαστε σε περίπτωση που υπάρξει διακοπή ηλεκτρικής ενέργειας;', answer: 'Σε περίπτωση που έχουν διακοπή στην ηλεκτροδότηση απευθυνόμαστε στον ΔΕΔΔΗΕ που είναι υπεύθυνος για τη λειτουργία και συντήρηση του δικτύου.' },
];

const categories = [
  { label: 'Όλες', count: 23 },
  { label: 'Αλλαγή Παρόχου', count: 5 },
  { label: 'Προμηθευτές & Καθολική Υπηρεσία', count: 5 },
  { label: 'Εγγύηση & Λογαριασμοί', count: 3 },
  { label: 'Χρεώσεις στον Λογαριασμό', count: 6 },
  { label: 'ΟΤΣ, Μέτρηση & Διακοπές', count: 4 },
];


// Dark glass matching the Services page cards over the cinematic sky.
const CARD_BG = 'rgba(8,13,17,.72)';

function FaqAccordion({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div style={{
      borderRadius: 18,
      border: '1px solid rgba(255,255,255,.1)',
      background: CARD_BG,
      backdropFilter: 'blur(10px)',
      overflow: 'hidden',
      transition: 'border-color .3s ease, box-shadow .3s ease',
      boxShadow: isOpen ? '0 0 0 1px rgba(255,255,255,.22)' : 'none',
    }}>
      <button onClick={onToggle} aria-expanded={isOpen}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '19px 24px',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          textAlign: 'left',
        }}>
        <span style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 15.5, lineHeight: 1.4, color: '#fff' }}>{item.question}</span>
        <span style={{
          flex: 'none',
          width: 30, height: 30,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,.25)',
          display: 'grid', placeItems: 'center',
          transition: 'transform .25s ease, background .25s ease',
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
          background: isOpen ? 'rgba(255,255,255,.14)' : 'transparent',
        }}>
          <ChevronDown size={16} style={{ color: '#9fb0b7' }} />
        </span>
      </button>
      <div style={{ maxHeight: isOpen ? 800 : 0, overflow: 'hidden', transition: 'max-height .35s ease' }}>
        <div style={{ padding: '0 24px 20px', fontSize: 14.5, lineHeight: 1.75, color: '#c3d0d6', whiteSpace: 'pre-line' }}>
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
    <>
      <CinematicSkyBackground pushScreens={1.2} mistIntensity={0.6} />
      <div style={{ position: 'relative', zIndex: 10 }}>

        <PublicHeader current="faq" />

        <main>
          <section style={{ padding: 'clamp(90px,15vh,140px) clamp(20px,5vw,70px) clamp(40px,6vh,64px)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.08)', fontSize: 12.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: '#fff' }}>Συχνές Ερωτήσεις</span>
            <h1 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 800, fontSize: 'clamp(32px,4.6vw,58px)', lineHeight: 1.08, letterSpacing: '-.02em', margin: '20px 0 0', color: '#fff', textShadow: '0 4px 40px rgba(0,0,0,.5)' }}>Όλα όσα χρειάζεται<br />να γνωρίζετε</h1>
            <p style={{ fontSize: 'clamp(16px,1.4vw,19px)', lineHeight: 1.6, color: '#b0c4cc', margin: '20px 0 0', maxWidth: 580 }}>Απαντήσεις για την αλλαγή παρόχου, τους προμηθευτές, τις χρεώσεις και τους λογαριασμούς ρεύματος.</p>
          </section>
          <WaveDivider variant="lines" accent="#36c6f4" />

          <section style={{ padding: '0 clamp(20px,5vw,70px) clamp(24px,4vh,48px)' }}>
            <div style={{ maxWidth: 860, margin: '0 auto' }}>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
                {categories.map((cat) => (
                  <button
                    key={cat.label}
                    onClick={() => { setActiveCategory(cat.label); setOpenId(null); }}
                    style={{
                      padding: '10px 18px',
                      borderRadius: 999,
                      border: activeCategory === cat.label ? 'none' : '1px solid rgba(255,255,255,.28)',
                      background: activeCategory === cat.label ? '#fff' : 'rgba(255,255,255,.06)',
                      color: activeCategory === cat.label ? '#0a0f14' : '#D7DDE5',
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all .2s',
                    }}
                  >
                    {cat.label} <span style={{ opacity: 0.7, marginLeft: 4 }}>({cat.count})</span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                {filtered.map((item) => (
                  <FaqAccordion key={item.id} item={item} isOpen={openId === item.id} onToggle={() => setOpenId(openId === item.id ? null : item.id)} />
                ))}
              </div>

            </div>
          </section>
          <WaveDivider variant="lines" accent="#36c6f4" />

          <section style={{ padding: 'clamp(48px,6vh,80px) clamp(20px,5vw,70px) calc(clamp(64px,9vh,110px) + 70px)' }}>
            <div style={{ maxWidth: 860, margin: '0 auto', padding: 'clamp(32px,4vw,48px)', borderRadius: 22, background: CARD_BG, border: '1px solid rgba(255,255,255,.1)', backdropFilter: 'blur(10px)', textAlign: 'center' as const }}>
              <h3 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 'clamp(22px,2.6vw,30px)', color: '#fff' }}>Δεν βρήκατε την απάντηση;</h3>
              <p style={{ fontSize: 15.5, color: '#b0c4cc', margin: '12px 0 0' }}>Επικοινωνήστε με έναν εξειδικευμένο σύμβουλο ενέργειας — δωρεάν και χωρίς υποχρέωση.</p>
              <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 24 }}>
                <a href="tel:+302102255000" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '15px 30px', borderRadius: 999, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.1)', backdropFilter: 'blur(8px)', color: '#fff', fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 16, boxShadow: '0 8px 30px rgba(0,0,0,.25)', textDecoration: 'none' }}>
                  <Phone size={16} /> +30 210 22 55 000
                </a>
                <a href="#/contact" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '15px 30px', borderRadius: 999, border: '1px solid rgba(255,255,255,.6)', color: '#fff', fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>
                  Επικοινωνία
                </a>
              </div>
            </div>
          </section>
        </main>

        <PublicFooter />

      </div>
    </>
  );
}