import { ArrowRight, ShieldCheck, TrendingUp, Users, Phone, Zap } from 'lucide-react';

const values = [
  { icon: Users, title: 'Εξατομικευμένη Φροντίδα', text: 'Κάθε πελάτης έχει τον δικό του ατομικό σύμβουλο ενέργειας, με υπηρεσίες προσαρμοσμένες στις δικές του ανάγκες.' },
  { icon: ShieldCheck, title: 'Αξιοπιστία και Σιγουριά', text: 'Επιλέγουμε προμηθευτές που προσφέρουν σταθερή έκπτωση και αξιοπιστία από την πρώτη μέρα της συνεργασίας.' },
  { icon: TrendingUp, title: 'Άμεση Εξοικονόμηση', text: 'Από εκπτώσεις στο φυσικό αέριο μέχρι αποφυγή Ρήτρας Αναπροσαρμογής, σε βοηθάμε να εξοικονομήσεις άμεσα.' },
];

export default function AboutPage() {
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
            <a href="#/faq">Συχνές Ερωτήσεις</a>
            <a href="#/contact">Επικοινωνία</a>
            <a href="#/login" className="nav-dashboard">Σύνδεση</a>
          </nav>
        </div>
      </header>

      <main style={{ paddingTop: 80 }}>
        <section className="section" style={{ background: 'transparent' }}>
          <div className="container">
            <div className="section-heading" style={{ textAlign: 'left', maxWidth: 800 }}>
              <div className="eyebrow"><span className="eyebrow-dot" /> Σχετικά με εμάς</div>
              <h2 style={{ color: 'var(--text)' }}>Οι προσωπικοί σου <span className="gradient-text">σύμβουλοι ενέργειας</span></h2>
              <p style={{ color: 'var(--text-muted)' }}>Εξειδικευμένοι σύμβουλοι ενέργειας, αφοσιωμένοι στη δημιουργία αξίας και ασφάλειας για κάθε πελάτη μας.</p>
            </div>

            <div style={{ maxWidth: 800, margin: '0 auto', color: 'var(--text)', fontSize: 16, lineHeight: 1.8 }}>
              <p style={{ marginBottom: 20 }}>
                Είμαστε μια ομάδα εξειδικευμένων ενεργειακών συμβούλων, αφοσιωμένοι στη δημιουργία αξίας και ασφάλειας για τους πελάτες μας. 
                Στόχος μας είναι η παροχή ολοκληρωμένων ενεργειακών λύσεων που θα ικανοποιούν πλήρως τις ανάγκες και τις προσδοκίες των πελατών μας.
              </p>
              <p style={{ marginBottom: 20 }}>
                Διασφαλίζουμε ότι κάθε πελάτης έχει τον δικό του ατομικό σύμβουλο ενέργειας, ο οποίος παρέχει εξατομικευμένες υπηρεσίες 
                καθ' όλη τη διάρκεια της συνεργασίας, εξασφαλίζοντας σταθερά άριστη εξυπηρέτηση και υποστήριξη.
              </p>
              <p style={{ marginBottom: 32 }}>
                Στην Hlektrismos.gr, δίνουμε έμφαση στην επιλογή των προμηθευτών ενέργειας που προσφέρουν σταθερή έκπτωση και αξιοπιστία 
                από την πρώτη μέρα. Από την προσφορά εκπτώσεων στο φυσικό αέριο μέχρι την αποφυγή της Ρήτρας Αναπροσαρμογής στο επαγγελματικό ρεύμα, 
                είμαστε εδώ για να σε καλύψουμε.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, maxWidth: 900, margin: '0 auto' }}>
              {values.map((v) => (
                <div className="advantage-card" key={v.title} style={{ padding: 32, borderRadius: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(0,200,120,0.1)', display: 'grid', placeItems: 'center', marginBottom: 16, color: '#00c878' }}>
                    <v.icon size={24} />
                  </div>
                  <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>{v.title}</h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)' }}>{v.text}</p>
                </div>
              ))}
            </div>

            <div style={{ maxWidth: 800, margin: '48px auto 0', padding: 32, borderRadius: 16, background: 'rgba(0,200,120,0.05)', border: '1px solid rgba(0,200,120,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <ShieldCheck size={24} style={{ color: '#00c878' }} />
                <strong style={{ fontSize: 18 }}>Το όραμά μας</strong>
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--text-muted)' }}>
                Διασφαλίζουμε ότι κάθε πελάτης έχει τον δικό του ατομικό σύμβουλο ενέργειας, ο οποίος παρέχει εξατομικευμένες υπηρεσίες 
                καθ' όλη τη διάρκεια της συνεργασίας, εξασφαλίζοντας σταθερά άριστη εξυπηρέτηση και υποστήριξη.
              </p>
            </div>
          </div>
        </section>

        <section style={{ padding: '80px 0', textAlign: 'center' }}>
          <div className="container">
            <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>Έτοιμος να γνωρίσεις τον σύμβουλό σου;</h2>
            <p style={{ fontSize: 16, color: 'var(--text-muted)', marginBottom: 32 }}>Ξεκίνα σήμερα δωρεάν και ξεκίνα να εξοικονομείς στους λογαριασμούς ενέργειας.</p>
            <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="tel:+302102255000" className="btn btn-primary"><Phone size={16} /> +30 210 22 55 000</a>
              <a href="#/contact" className="btn btn-ghost" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}>Επικοινωνία <ArrowRight size={16} /></a>
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
