import { Link } from 'react-router-dom'
import { Zap } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link to="/" className="brand">
              <span className="brand-mark"><Zap size={18} fill="currentColor" /></span>
              <span>Power<span>For</span></span>
            </Link>
            <div className="footer-logo-wrap">
              <img src="/images/image.png" alt="PowerFor" className="footer-logo" />
            </div>
            <p>Ο προσωπικός σου σύμβουλος ενέργειας. Συγκρίνουμε πάροχους και βρίσκουμε την καλύτερη λύση — δωρεάν.</p>
          </div>
          <div className="footer-col">
            <h4>Υπηρεσίες</h4>
            <Link to="/services">Ρεύμα</Link>
            <Link to="/services">Φυσικό Αέριο</Link>
            <Link to="/services">Φωτοβολταϊκά</Link>
            <Link to="/services">Ηλεκτροκίνηση</Link>
          </div>
          <div className="footer-col">
            <h4>Εταιρεία</h4>
            <Link to="/about">Ποιοι Είμαστε</Link>
            <Link to="/faq">Συχνές Ερωτήσεις</Link>
            <Link to="/contact">Επικοινωνία</Link>
            <Link to="/login">Σύνδεση</Link>
          </div>
          <div className="footer-col">
            <h4>Επικοινωνία</h4>
            <a href="tel:+302102255000">+30 210 22 55 000</a>
            <a href="mailto:info@powerfor.gr">info@powerfor.gr</a>
            <span>Ζαλοκώστα 8, Αθήνα 10671</span>
            <span>Δευ – Παρ · 09:00 – 18:00</span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 PowerFor. Με επιφύλαξη παντών δικαιωμάτων.</span>
          <span>Πολιτική Απορρήτου · Όροι Χρήσης · GDPR</span>
        </div>
      </div>
    </footer>
  )
}
