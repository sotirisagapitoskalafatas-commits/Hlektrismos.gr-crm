import { ArrowRight, Zap, Leaf, Plug, Phone, ShieldCheck, TrendingUp, Mail, Home, Zap as ZapIcon } from 'lucide-react';
import CinematicSkyBackground from '@/components/CinematicSkyBackground';

function FlameIcon({ size = 24 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  );
}

const services = [
  { icon: Zap, title: 'Ρεύμα', desc: 'Φθηνά Προγράμματα Ενέργειας ειδικά για σένα!', features: ['Σύγκριση πάνω από 15 παρόχων', 'Σταθερά ή κυμαινόμενα τιμολόγια', 'Ειδικά προγράμματα για επιχειρήσεις', 'Υποστήριξη κατά την αλλαγή'] },
  { icon: FlameIcon, title: 'Αέριο', desc: 'Εξατομικευμένες λύσεις φυσικού αερίου για το σπίτι!', features: ['Σύγκριση παρόχων φυσικού αερίου', 'Λύσεις για κατοικία και βιομηχανία', 'Χωρίς διακοπή κατά την αλλαγή', 'Προσωπικός σύμβουλος'] },
  { icon: Leaf, title: 'Φωτοβολταϊκά', desc: 'Καινοτομία και Βιώσιμη Ανάπτυξη, τώρα στο χώρο σου!', features: ['Μελέτη σκοπιμότητας δωρεάν', 'Πιστοποιημένοι εγκαταστάτες', 'Διαχείριση αδειοδότησης', 'Παρακολούθηση παραγωγής'] },
  { icon: Plug, title: 'Ηλεκτροκίνηση', desc: 'Οδηγούμε οικολογικά, κινούμαστε ηλεκτρικά!', features: ['Λύσεις φόρτισης EV', 'Εγκατάσταση wallbox', 'Σχεδίαση δικτύου φόρτισης', 'Υποστήριξη 24/7'] },
  { icon: ShieldCheck, title: 'Αποθήκευση Ενέργειας', desc: 'Λύσεις αποθήκευσης ενέργειας με μπαταρίες.', features: ['Αυτονομία από το δίκτυο', 'Εξοικονόμηση σε ακριαίες τιμές', 'Μπαταρίες lithium-ion', 'Παρακολούθηση παραγωγής'] },
  { icon: TrendingUp, title: 'Εξοικονόμηση Ενέργειας', desc: 'Ανάλυση κατανάλωσης και στρατηγικές μείωσης λογαριασμού.', features: ['Ανάλυση κατανάλωσης', 'Στρατηγικές εξοικονόμησης', 'Βελτιστοποίηση χρήσης', 'Αναφορά ενεργειακής απόδοσης'] },
];

// CHANGE (this handoff): mounted the night-sky scroll background behind the
// page and wrapped existing content in a `position:relative; zIndex:10`
// layer so it paints above it (see CinematicSkyBackground's own header
// comment — that's the contract). service-card is already a dark glass
// panel (rgba(6,10,18,.8)) so it reads fine over the night sky as-is;
// nothing else below this line changed from the current file.
export default function ServicesPage() {
  return (
    <>
      <CinematicSkyBackground pushScreens={1.5} mistIntensity={0.55} />
      <div className="app-shell" style={{ position: 'relative', zIndex: 10 }}>
        <header className="site-header scrolled">
          <div className="container nav-wrap">
            <a href="#top" className="brand"><span className="brand-mark"><ZapIcon size={18} fill="currentColor" /></span><span>Hlektrismos<span>.gr</span></span></a>
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
                <div className="eyebrow"><span className="eyebrow-dot" /> Υπηρεσίες</div>
                <h2 style={{ color: 'var(--text)' }}>Όλες οι ενεργειακές <span className="gradient-text">λύσεις κάτω από μία στέγη</span></h2>
                <p style={{ color: 'var(--text-muted)' }}>Ρεύμα, αέριο, φωτοβολταϊκά, ηλεκτροκίνηση. Στο δυναμικό περιβάλλον της αγοράς ενέργειας, είμαστε εδώ για να δώσουμε λύσεις.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
                {services.map((s) => (
                  <div className="service-card" key={s.title} style={{ padding: 32 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 14, background: 'rgba(0,200,120,0.1)', display: 'grid', placeItems: 'center', marginBottom: 20, color: '#00c878' }}>
                      <s.icon size={28} />
                    </div>
                    <h3 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600, color: 'var(--text)' }}>{s.title}</h3>
                    <p style={{ margin: '0 0 20px', fontSize: 15, lineHeight: 1.6, color: 'var(--text-muted)' }}>{s.desc}</p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                      {s.features.map((f) => (
                        <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-muted)' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#00c878', flexShrink: 0 }} />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section style={{ padding: '80px 0', background: 'rgba(0,200,120,0.03)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
            <div className="container" style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>Δεν είσαι σίγουρος ποια λύση σου ταιριάζει;</h2>
              <p style={{ fontSize: 16, color: 'var(--text-muted)', marginBottom: 32 }}>Ένας εξειδικευμένος σύμβουλος ενέργειας είναι έτοιμος να σου προτείνει το κατάλληλο πρόγραμμα — ΔΩΡΕΑΝ!</p>
              <a href="tel:+302102255000" className="btn btn-primary"><Phone size={16} /> Κάλεσε μας: +30 210 22 55 000</a>
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
    </>
  );
}
