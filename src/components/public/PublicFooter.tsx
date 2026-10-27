import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { COMPANY } from '@/lib/legal';
import LegalLinks from '@/components/LegalLinks';
import { PublicBrand } from './PublicHeader';
import StaffAccessLink from './StaffAccessLink';
import WaveDivider from './WaveDivider';
import '@/styles/landing.css';

/* The one footer for every public page (landing, Services, About, FAQ, Contact, Energy, legal pages).
   Its animated navy wave is pulled up over the bottom padding of the section above, so the previous section's
   own background shows between the crests and there is never a hard line above the footer. */

const PHONE_HREF = `tel:${COMPANY.phone.replace(/\s+/g, '')}`;
const SERVICES = ['Ρεύμα', 'Φυσικό αέριο', 'Φωτοβολταϊκά', 'Ηλεκτροκίνηση'];

export default function PublicFooter() {
  return (
    <footer className="lp-chrome lp-footer-shell">
      <div className="lp-footer-wave">
        <WaveDivider fill="#081d38" edge="bottom" size="md" accent="#36c6f4" />
      </div>
      <div className="lp-footer">
        <div className="lp-wrap">
          <div className="lp-footer__grid">
            <div>
              <a href="#top" className="lp-brand"><PublicBrand alt="Hlektrismos.gr" /></a>
              <p className="lp-footer__about">Ο προσωπικός σου σύμβουλος ενέργειας: σύγκριση προγραμμάτων ρεύματος και φυσικού αερίου, φωτοβολταϊκά και ηλεκτροκίνηση.</p>
            </div>
            <div>
              <h4>Υπηρεσίες</h4>
              <ul>{SERVICES.map((s) => <li key={s}><a href="#/services">{s}</a></li>)}</ul>
            </div>
            <div>
              <h4>Χρήσιμα</h4>
              <ul>
                <li><a href="#comparison">Σύγκριση τιμολογίων</a></li>
                <li><a href="#how-it-works">Πώς λειτουργεί</a></li>
                <li><a href="#/faq">Συχνές ερωτήσεις</a></li>
                <li><a href="#/about">Η εταιρεία</a></li>
                <li><a href="#/contact">Στοιχεία επικοινωνίας</a></li>
              </ul>
            </div>
            <div>
              <h4>Επικοινωνία</h4>
              <ul className="lp-footer__contact">
                <li><Phone size={15} aria-hidden="true" /><a href={PHONE_HREF}>{COMPANY.phone}</a></li>
                <li><Mail size={15} aria-hidden="true" /><a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a></li>
                <li><MapPin size={15} aria-hidden="true" /><span>{COMPANY.address}</span></li>
                <li><Clock size={15} aria-hidden="true" /><span>Δευτέρα–Παρασκευή 09:00–17:00<br />Σάββατο–Κυριακή: κλειστά</span></li>
              </ul>
            </div>
          </div>
          <div className="lp-footer__bottom">
            <span>© {new Date().getFullYear()} hlektrismos.gr. Με την επιφύλαξη παντός δικαιώματος.</span>
            <LegalLinks color="#a9bfd3" />
          </div>
          <StaffAccessLink />
        </div>
      </div>
    </footer>
  );
}
