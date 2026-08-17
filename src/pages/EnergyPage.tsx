import { ExternalLink, Zap } from 'lucide-react';

const commodities = [
  { name: 'Dutch TTF Gas', source: 'Barchart', desc: 'Τιμές futures για το φυσικό αέριο TTF, βασικός δείκτης της ευρωπαϊκής αγοράς αερίου.', url: 'https://www.barchart.com/futures/quotes/NYMEX-TTFG1' },
  { name: 'Carbon Emissions Futures', source: 'Investing.com', desc: 'Τιμές δικαιωμάτων εκπομπών CO2 (EUA) που επηρεάζουν άμεσα το κόστος ηλεκτρικής ενέργειας.', url: 'https://www.investing.com/commodities/carbon-emissions' },
  { name: 'Brent Oil Futures', source: 'Investing.com', desc: 'Τιμές futures αργού πετρελαίου τύπου Brent, βασικό barometer της ενεργειακής αγοράς.', url: 'https://www.investing.com/commodities/brent-oil' },
  { name: 'Μεσοσταθμική Τιμή Αγοράς', source: 'ΑΔΜΗΕ', desc: 'Ημερήσιες αναφορές μεσοσταθμικής τιμής της χονδρεμπορικής αγοράς ηλεκτρικής ενέργειας.', url: 'https://www.admie.gr/' },
];

const reports = [
  { name: 'Εβδομαδιαία Αναφορά', source: 'ENEX Group', desc: 'Επίσημη εβδομαδιαία ανάλυση της Ελληνικής Χρηματιστηριακής Αγοράς Ενέργειας.', url: 'https://www.enexgroup.gr/' },
  { name: 'Διαδικτυακή Εφαρμογή ΥΔΕ', source: 'ΔΕΔΔΗΕ', desc: 'Επίσημη πιστοποίηση Υπεύθυνης Δήλωσης Εγκαταστάτη Ηλεκτρολόγου.', url: 'https://www.deddie.gr/' },
];

export default function EnergyPage() {
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
              <div className="eyebrow"><span className="eyebrow-dot" /> Ενέργεια Σήμερα</div>
              <h2 style={{ color: 'var(--text)' }}>Ευρωπαϊκός Χάρτης <span className="gradient-text">Τιμών Ηλεκτρισμού</span></h2>
              <p style={{ color: 'var(--text-muted)' }}>Η Ρυθμιστική Αρχή Ενέργειας παρέχει στους καταναλωτές τη δυνατότητα ενημέρωσης για τη δυναμική διαμόρφωση των τιμών στις ευρωπαϊκές Αγορές Επόμενης Ημέρας (Day-Ahead Market).</p>
            </div>

            <div style={{ padding: 32, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 48 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 20, color: 'var(--text)' }}>Day-Ahead Market</h3>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.7, color: 'var(--text-muted)' }}>
                Στον χάρτη αποτυπώνεται, για την τρέχουσα ημέρα, η μέση ημερήσια τιμή (€/MWh) της χονδρεμπορικής Αγοράς Επόμενης Ημέρας για κάθε ευρωπαϊκό κράτος.
              </p>
            </div>

            <h3 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24, color: 'var(--text)' }}>Πηγές & Δείκτες</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 48 }}>
              {commodities.map((c) => (
                <a key={c.name} href={c.url} target="_blank" rel="noopener noreferrer" className="service-card" style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <strong style={{ fontSize: 16, color: 'var(--text)' }}>{c.name}</strong>
                    <ExternalLink size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>
                  <span style={{ fontSize: 12, color: '#00c878', fontWeight: 600 }}>{c.source}</span>
                  <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>{c.desc}</p>
                </a>
              ))}
            </div>

            <h3 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24, color: 'var(--text)' }}>Αναφορές & Εργαλεία</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              {reports.map((r) => (
                <a key={r.name} href={r.url} target="_blank" rel="noopener noreferrer" className="service-card" style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <strong style={{ fontSize: 16, color: 'var(--text)' }}>{r.name}</strong>
                    <ExternalLink size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>
                  <span style={{ fontSize: 12, color: '#00c878', fontWeight: 600 }}>{r.source}</span>
                  <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>{r.desc}</p>
                </a>
              ))}
            </div>

            <p style={{ marginTop: 32, fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Σημείωση: Τα δεδομένα και οι τιμές προέρχονται από επίσημες πηγές τρίτων (ΡΑΕ, ΑΔΜΗΕ, ΔΕΔΔΗΕ, ENEX, Barchart, Investing.com). 
              Η Hlektrismos.gr παρέχει τους συνδέσμους ως εργαλείο ενημέρωσης και δεν φέρει ευθύνη για την ακρίβεια.
            </p>
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
