import { Zap, Sun, Car, CheckCircle, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Reveal } from '@/components/site/Reveal'

function FlameIcon({ size=28 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  )
}

const SERVICES = [
  { Icon:Zap,      title:'Ρεύμα',        desc:'Συγκρίνουμε τα προγράμματα ρεύματος όλων των παρόχων και βρίσκουμε το βέλτιστο για τις δικές σου ανάγκες.',
    features:['Σύγκριση πάνω από 15 παρόχων','Σταθερά ή κυμαινόμενα τιμολόγια','Ειδικά προγράμματα για επιχειρήσεις','Υποστήριξη κατά την αλλαγή'] },
  { Icon:FlameIcon, title:'Φυσικό Αέριο', desc:'Εξατομικευμένες λύσεις για θέρμανση και μαγείρεμα με τα καλύτερα τιμολόγια.',
    features:['Σύγκριση παρόχων φυσικού αερίου','Λύσεις για κατοικία και βιομηχανία','Χωρίς διακοπή κατά την αλλαγή','Προσωπικός σύμβουλος'] },
  { Icon:Sun,      title:'Φωτοβολταϊκά', desc:'Σχεδιάζουμε και οργανώνουμε εγκαταστάσεις για κατοικίες και επιχειρήσεις.',
    features:['Μελέτη σκοπιμότητας δωρεάν','Πιστοποιημένοι εγκαταστάτες','Διαχείριση αδειοδότησης','Παρακολούθηση παραγωγής'] },
  { Icon:Car,      title:'Ηλεκτροκίνηση', desc:'Λύσεις φόρτισης EV — από επιλογή φορτιστή μέχρι εγκατάσταση και σύνδεση.',
    features:['Φορτιστές οικίας (AC/DC)','Εταιρικές λύσεις στόλου','Επιδοτήσεις και χρηματοδότηση','Συντήρηση και υποστήριξη'] },
]

export default function Services() {
  return (
    <div>
      <section className="section" style={{ paddingTop:'8rem' }}>
        <div className="container">
          <Reveal className="section-heading">
            <div className="eyebrow"><span className="eyebrow-dot" /> Υπηρεσίες</div>
            <h1>Ολοκληρωμένες <span className="gradient-text">ενεργειακές λύσεις</span></h1>
            <p>Από ρεύμα και αέριο μέχρι φωτοβολταϊκά και ηλεκτροκίνηση — δίπλα σου σε κάθε βήμα.</p>
          </Reveal>
          <div className="services-grid" style={{ marginTop:'3rem' }}>
            {SERVICES.map((s,i) => (
              <Reveal key={s.title} delay={i*0.08}>
                <div className="service-card">
                  <div className="service-icon"><s.Icon size={28} /></div>
                  <h3>{s
