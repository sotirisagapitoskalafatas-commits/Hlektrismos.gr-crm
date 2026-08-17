import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  Gauge,
  Home,
  Leaf,
  Lock,
  Mail,
  Menu,
  Phone,
  Plug,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Upload,
  Zap,
} from 'lucide-react';
import ChatBot from '@/components/ChatBot';
import MapBackground from '@/components/MapBackground';
import { supabase } from '@/lib/supabase';

type LeadForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  region: string;
  customerType: string;
  propertyType: string;
  service: string;
  message: string;
  billFile: File | null;
  consent: boolean;
};

const GREECE_BG = 'https://images.pexels.com/photos/37844507/pexels-photo-37844507.jpeg?auto=compress&cs=tinysrgb&w=1920';

const greekJourney = [
  { region: 'Αττική', city: 'Αθήνα', title: 'Η αφετηρία της εξοικονόμησης', text: 'Ξεκινάμε από την παροχή σου και συγκρίνουμε άμεσα τα διαθέσιμα προγράμματα για σπίτι, γραφείο ή κατάστημα.', x: 56, y: 34 },
  { region: 'Κεντρική Ελλάδα', city: 'Θεσσαλία', title: 'Λύσεις για κάθε κατανάλωση', text: 'Από μικρές κατοικίες μέχρι αγροτικές και επαγγελματικές εγκαταστάσεις, βρίσκουμε το σωστό ενεργειακό προφίλ.', x: 61, y: 28 },
  { region: 'Βόρεια Ελλάδα', city: 'Θεσσαλονίκη', title: 'Η ενέργεια της ανάπτυξης', text: 'Υποστήριξη για επιχειρήσεις και οικογένειες σε όλη τη Μακεδονία και τη Θράκη με προσωπικό σύμβουλο.', x: 63, y: 17 },
  { region: 'Νησιά Ιονίου', city: 'Κέρκυρα · Ζάκυνθος', title: 'Ενέργεια χωρίς σύνορα', text: 'Εξυπηρέτηση σε κάθε νησί, με προτάσεις που λαμβάνουν υπόψη εποχικότητα, τουρισμό και πραγματική χρήση.', x: 37, y: 45 },
  { region: 'Νησιά Αιγαίου', city: 'Κυκλάδες · Δωδεκάνησα', title: 'Έξυπνη ενέργεια στα νησιά', text: 'Προγράμματα ρεύματος, φωτοβολταϊκά και λύσεις ηλεκτροκίνησης για τις ανάγκες κάθε νησιωτικής κοινότητας.', x: 71, y: 52 },
  { region: 'Κρήτη', city: 'Ηράκλειο · Χανιά', title: 'Η πράσινη επόμενη μέρα', text: 'Σχεδιάζουμε το επόμενο βήμα με φωτοβολταϊκά, ενεργειακή αυτονομία και λύσεις για κατοικίες και τουριστικές μονάδες.', x: 63, y: 75 },
];

const mapStops = [
  { lat: 37.9838, lng: 23.7275, zoom: 9, pitch: 45, bearing: -20 },
  { lat: 39.6, lng: 22.4, zoom: 8.5, pitch: 50, bearing: 10 },
  { lat: 40.6401, lng: 22.9444, zoom: 9, pitch: 40, bearing: -15 },
  { lat: 39.6243, lng: 19.9217, zoom: 9.5, pitch: 55, bearing: 25 },
  { lat: 37.4, lng: 25.4, zoom: 8.5, pitch: 45, bearing: -10 },
  { lat: 35.2401, lng: 24.8093, zoom: 8.5, pitch: 50, bearing: 15 },
];

const regions = [
  'Αττική', 'Θεσσαλονίκη', 'Κεντρική Μακεδονία', 'Δυτική Μακεδονία', 'Ανατολική Μακεδονία & Θράκη',
  'Ήπειρος', 'Θεσσαλία', 'Ιόνια Νησιά', 'Δυτική Ελλάδα', 'Στερεά Ελλάδα',
  'Πελοπόννησος', 'Νησιά Αιγαίου', 'Κρήτη', 'Βόρειο Αιγαίο',
];

const customerTypes = [
  'Ιδιώτης (νοικοκυριό)',
  'Εταιρεία (B2B)',
  'Επαγγελματίας / Καταστηματάρχης',
  'Αγροτικός / Αγροτέχνης',
  'Άλλο',
];

const services = [
  'Ρεύμα',
  'Φυσικό Αέριο',
  'Φωτοβολταϊκά',
  'Ηλεκτροκίνηση',
];

const features = [
  { icon: Zap, title: 'Ρεύμα', text: 'Φθηνά προγράμματα ενέργειας ειδικά για σένα. Συγκρίνουμε πάροχους και βρίσκουμε την πιο αποδοτική λύση.' },
  { icon: Flame, title: 'Φυσικό Αέριο', text: 'Εξατομικευμένες λύσεις φυσικού αερίου για το σπίτι και την επιχείρηση με τα καλύτερα τιμολογιακά πλανα.' },
  { icon: Leaf, title: 'Φωτοβολταϊκά', text: 'Καινοτομία και βιώσιμη ανάπτυξη στον χώρο σου. Επένδυσε στην πράσινη ενέργεια με ασφάλεια.' },
  { icon: Plug, title: 'Ηλεκτροκίνηση', text: 'Οδηγούμε οικολογικά, κινούμαστε ηλεκτρικά. Λύσεις φόρτισης και EV για κάθε ανάγκη.' },
];

const stats = [
  { value: '100%', label: 'Δωρεάν Υπηρεσία' },
  { value: '7', label: 'Εργάσιμες για Αλλαγή' },
  { value: '24/7', label: 'Υποστήριξη' },
  { value: '12.000+', label: 'Ικανοποιημένοι Πελάτες' },
];

const faqs = [
  { q: 'Είναι δωρεάν η υπηρεσία;', a: 'Ναι, η υπηρεσία μας είναι εντελώς δωρεάν, χωρίς κρυφές χρεώσεις. Αποζημιωνόμαστε από τους παρόχους, όχι από εσάς.' },
  { q: 'Πώς γίνεται η αλλαγή παρόχου;', a: 'Η διαδικασία είναι απλή: υπογράφεις Σύμβαση Προμήθειας με τον νέο πάροχο και καταθέτεις τα απαραίτητα δικαιολογητικά. Αναλαμβάνουμε εμείς όλη τη γραφειοκρατία.' },
  { q: 'Χρειάζεται να πληρώσω για αλλαγή;', a: 'Όχι, η αλλαγή παρόχου είναι δωρεάν διαδικασία για όλους τους καταναλωτές.' },
  { q: 'Πόσος χρόνος χρειάζεται;', a: 'Από την ημέρα που θα υπογράψεις τη σύμβαση απαιτούνται 7 εργάσιμες ημέρες για να ολοκληρωθεί η αλλαγή μέσω του ΔΕΔΔΗΕ.' },
  { q: 'Μπορεί να διακοπεί το ρεύμα;', a: 'Όχι. Η αλλαγή παρόχου είναι καθαρά εμπορική/λογιστική μεταβολή. Η παροχή ρεύματος είναι εγγυημένη από τον ΔΕΔΔΗΕ.' },
];

const advantages = [
  { icon: Gauge, title: '100% Δωρεάν', text: 'Η υπηρεσία μας είναι εντελώς δωρεάν, χωρίς κρυφές χρεώσεις.' },
  { icon: TrendingUp, title: 'Άμεση Εξυπηρέτηση', text: 'Επικοινωνία μέσα σε λίγες ώρες με τον προσωπικό σου σύμβουλο.' },
  { icon: Users, title: 'Εξατομικευμένη Λύση', text: 'Πρόταση φτιαγμένη ειδικά για τις δικές σου ανάγκες κατανάλωσης.' },
];

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.12 },
    );
    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
}

function Flame(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  );
}

export default function LandingPage() {
  const [form, setForm] = useState<LeadForm>({
    firstName: '', lastName: '', email: '', phone: '',
    region: '', customerType: '', propertyType: '', service: 'Ρεύμα', message: '', billFile: null, consent: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const journeySectionRef = useRef<HTMLElement>(null);
  const [bgTransform, setBgTransform] = useState('');
  const journeyIndex = Math.min(greekJourney.length - 1, Math.floor((scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)) * greekJourney.length));
  const activeJourney = greekJourney[journeyIndex];

  useScrollReveal();

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrollY(y);
      setScrolled(y > 40);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setScrollPct(h > 0 ? (y / h) * 100 : 0);

      const el = journeySectionRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const sectionH = rect.height;
        const progress = Math.max(0, Math.min(1, -rect.top / Math.max(1, sectionH - viewportH)));
        const panY = -progress * 30;
        const scale = 1.15 + progress * 0.25;
        const tilt = 8 + progress * 12;
        setBgTransform(`translate3d(0, ${panY}%, 0) scale(${scale}) rotateX(${tilt}deg)`);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const update = (field: keyof LeadForm, value: string | boolean | File | null) => setForm((current) => ({ ...current, [field]: value }));

  const handleBillChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (!file) {
      update('billFile', null);
      return;
    }
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      setFormError('Ανεβάστε PDF, JPG ή PNG έως 10MB.');
      e.target.value = '';
      update('billFile', null);
      return;
    }
    setFormError('');
    update('billFile', file);
  };

  const submitLead = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    let billFilePath: string | null = null;
    if (form.billFile) {
      const extension = form.billFile.name.split('.').pop()?.toLowerCase() ?? 'file';
      billFilePath = `${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('energy-bills').upload(billFilePath, form.billFile, {
        contentType: form.billFile.type,
        upsert: false,
      });
      if (uploadError) {
        setSubmitting(false);
        setFormError('Δεν ήταν δυνατή η αποστολή του λογαριασμού. Δοκιμάστε ξανά.');
        return;
      }
    }

    const { error } = await supabase.from('hlektrismos_leads').insert({
      first_name: form.firstName,
      last_name: form.lastName,
      phone: form.phone,
      email: form.email || 'not-provided@hlektrismos.local',
      region: form.region || 'Δεν δηλώθηκε',
      customer_type: form.propertyType,
      property_type: form.propertyType,
      provider: form.service,
      comments: form.message || null,
      bill_file_path: billFilePath,
      bill_file_name: form.billFile?.name ?? null,
      consent: form.consent,
      lawful_basis: form.consent ? 'Consent' : null,
      customer_category: form.propertyType === 'Σπίτι' ? 'B2C_Household' : 'B2B_Corporate',
      pipeline_status: 'new'
    });
    setSubmitting(false);
    if (error) { setFormError('Κάτι πήγε στραβά. Δοκιμάστε ξανά.'); return; }
    setSubmitted(true);
    setForm({ firstName: '', lastName: '', email: '', phone: '', region: '', customerType: '', propertyType: '', service: 'Ρεύμα', message: '', billFile: null, consent: false });
  };

  const heroBgTransform = `translate3d(0, ${scrollY * 0.4}px, 0) scale(${1 + scrollY * 0.0003})`;
  const heroContentTransform = `translate3d(0, ${scrollY * 0.12}px, 0)`;
  const heroOpacity = Math.max(0, 1 - scrollY / 600);

  return (
    <div className="app-shell">
      <MapBackground activeStopIndex={journeyIndex} stops={mapStops} />
      <div className="scroll-progress"><div className="scroll-progress-fill" style={{ width: `${scrollPct}%` }} /></div>

      <header className={scrolled ? 'site-header scrolled' : 'site-header'}>
        <div className="container nav-wrap">
          <a href="#top" className="brand"><span className="brand-mark"><Zap size={18} fill="currentColor" /></span><span>Hlektrismos<span>.gr</span></span></a>
          <nav className={menuOpen ? 'main-nav open' : 'main-nav'}>
            <a href="#services" onClick={() => setMenuOpen(false)}>Υπηρεσίες</a>
            <a href="#about" onClick={() => setMenuOpen(false)}>Ποιοι Είμαστε</a>
            <a href="#journey" onClick={() => setMenuOpen(false)}>Σε όλη την Ελλάδα</a>
            <a href="#faq" onClick={() => setMenuOpen(false)}>Συχνές Ερωτήσεις</a>
            <a href="#contact" onClick={() => setMenuOpen(false)}>Επικοινωνία</a>
            <a href="#/login" onClick={() => setMenuOpen(false)} className="nav-dashboard">Σύνδεση</a>
          </nav>
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
          <a href="#contact" className="header-cta">Ζητήστε κλήση <ArrowRight size={16} /></a>
        </div>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-bg">
            <div className="hero-greece-img" style={{ transform: heroBgTransform, opacity: heroOpacity }} />
            <div className="hero-greece-overlay" />
            <div className="hero-grid-bg" />
            <div className="hero-glow-1" />
            <div className="hero-glow-2" />
          </div>
          <div className="container hero-grid">
            <div className="hero-content" style={{ transform: heroContentTransform, opacity: heroOpacity }}>
              <div className="eyebrow"><span className="eyebrow-dot" /> Εξειδικευμένοι Σύμβουλοι Ενέργειας</div>
              <h1>Ο προσωπικός σου <span className="gradient">σύμβουλος ενέργειας</span></h1>
              <p className="hero-intro">Δίπλα σου με όλες τις ενεργειακές λύσεις για το σπίτι και την επιχείρησή σου! Συγκρίνουμε και βρίσκουμε μαζί τον φθηνότερο πάροχο — δωρεάν.</p>
              <div className="hero-actions">
                <a href="#services" className="btn btn-primary">Δες τις Λύσεις <ArrowRight size={18} /></a>
                <a href="tel:+302102255000" className="btn btn-ghost"><Phone size={16} /> +30 210 22 55 000</a>
              </div>
            </div>
            <div className="hero-visual" style={{ opacity: heroOpacity }}>
              <div className="orbit-stage">
                <div className="orbit-ring orbit-ring-1" />
                <div className="orbit-ring orbit-ring-2" />
                <div className="orbit-ring orbit-ring-3" />
                <div className="orbit-core"><div className="orbit-core-inner" /></div>
                <div className="orbit-node" style={{ top: 'calc(50% - 110px)', left: '50%' }}><Zap size={20} /></div>
                <div className="orbit-node" style={{ top: 'calc(50% + 80px)', left: 'calc(50% - 140px)' }}><Leaf size={20} /></div>
                <div className="orbit-node" style={{ top: 'calc(50% + 60px)', left: 'calc(50% + 130px)' }}><Plug size={20} /></div>
                <div className="orbit-node" style={{ top: 'calc(50% - 160px)', left: 'calc(50% + 100px)' }}><Bot size={20} /></div>
              </div>
            </div>
          </div>
          <div className="container" style={{ position: 'relative', zIndex: 2 }}>
            <div className="stats-strip">
              {stats.map((s) => (
                <div className="stat-cell" key={s.label}><strong>{s.value}</strong><span>{s.label}</span></div>
              ))}
            </div>
          </div>
        </section>

        <section className="greece-journey" id="journey" ref={journeySectionRef}>
          <div className="journey-bg-layer">
            <div className="journey-bg-inner" style={{ transform: bgTransform }}>
              <div className="journey-bg-img" />
              <div className="journey-bg-overlay" />
              <div className="journey-bg-route">
                <svg viewBox="0 0 420 600" preserveAspectRatio="xMidYMid slice">
                  <path d="M235 80 C200 160 260 220 245 280 S180 380 230 440 S260 520 250 560" fill="none" stroke="rgba(0,102,204,0.4)" strokeWidth="2" strokeDasharray="6 4" />
                </svg>
              </div>
              {greekJourney.map((stop, index) => (
                <div key={stop.city} className={index === journeyIndex ? 'journey-bg-pin active' : 'journey-bg-pin'} style={{ left: `${stop.x}%`, top: `${stop.y}%` }}>
                  <div className="journey-bg-pin-ring" />
                  <div className="journey-bg-pin-dot" />
                  <div className="journey-bg-pin-label">{stop.city}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="journey-content">
            <div className="container journey-intro">
              <div className="eyebrow" style={{ margin: '0 auto' }}><span className="eyebrow-dot" /> Παντού στην Ελλάδα</div>
              <h2>Η ενέργεια <span className="gradient-text">ταξιδεύει μαζί σου.</span></h2>
              <p>Καθώς κατεβαίνεις, γνωρίζεις τις λύσεις μας σε κάθε γωνιά της Ελλάδας — από την Αθήνα μέχρι την Κρήτη.</p>
            </div>

            <div className="container">
              <div className="journey-progress-bar">
                <div className="track"><span className="fill" style={{ width: `${((journeyIndex + 1) / greekJourney.length) * 100}%` }} /></div>
                <div className="journey-current-label">{activeJourney.region} — {activeJourney.city}</div>
              </div>
            </div>

            <div className="container">
              <div className="journey-stops">
                {greekJourney.map((stop, index) => (
                  <article className={index === journeyIndex ? 'journey-stop active reveal visible' : 'journey-stop reveal'} key={stop.city}>
                    <span className="journey-stop-number">0{index + 1}</span>
                    <div><span className="journey-stop-region">{stop.region}</span><h3>{stop.title}</h3><p>{stop.text}</p><strong>{stop.city}</strong></div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="advantages-section">
          <div className="container">
            <div className="advantages-grid">
              {advantages.map((a) => (
                <div className="advantage-card reveal" key={a.title}>
                  <div className="advantage-icon"><a.icon size={24} /></div>
                  <h3>{a.title}</h3>
                  <p>{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="services">
          <div className="container">
            <div className="section-heading reveal">
              <div className="eyebrow"><span className="eyebrow-dot" /> Υπηρεσίες</div>
              <h2>Για το σπίτι και <span className="gradient-text">την επιχείρηση!</span></h2>
              <p>Ολοκληρωμένες ενεργειακές λύσεις προσαρμοσμένες στις δικές σου ανάγκες.</p>
            </div>
            <div className="services-grid">
              {features.map((f) => (
                <div className="service-card reveal" key={f.title}>
                  <div className="service-icon"><f.icon size={28} /></div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                  <a href="#contact" className="service-link">Δες περισσότερα <ArrowRight size={14} /></a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section about-section" id="about">
          <div className="container">
            <div className="about-grid">
              <div className="about-copy reveal">
                <div className="eyebrow"><span className="eyebrow-dot" /> Ποιοι Είμαστε</div>
                <h2>Ο προσωπικός σου <span className="gradient-text">σύμβουλος ενέργειας!</span></h2>
                <p>Είμαστε μια ομάδα εξειδικευμένων ενεργειακών συμβούλων, αφοσιωμένοι στη δημιουργία αξίας και ασφάλειας για τους πελάτες μας. Στόχος μας είναι η παροχή ολοκληρωμένων ενεργειακών λύσεων που ικανοποιούν πλήρως τις ανάγκες και τις προσδοκίες σου.</p>
                <div className="about-vision">
                  <ShieldCheck size={20} />
                  <div>
                    <strong>Το όραμά μας</strong>
                    <p>Διασφαλίζουμε ότι κάθε πελάτης έχει τον δικό του ατομικό σύμβουλο ενέργειας, που παρέχει εξατομικευμένες υπηρεσίες καθ' όλη τη διάρκεια της συνεργασίας.</p>
                  </div>
                </div>
              </div>
              <div className="about-visual reveal">
                <div className="about-logo-wrap">
                  <img src="/images/image.png" alt="Ηλεκτρισμός - Ενεργειακοί Σύμβουλοι" className="official-logo" />
                </div>
                <div className="about-orb">
                  <div className="about-orb-inner" />
                  <Sparkles size={48} className="about-orb-icon" />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="gdpr-section" id="gdpr">
          <div className="container">
            <div className="gdpr-inner reveal">
              <div className="gdpr-shield"><ShieldCheck size={36} /></div>
              <div>
                <h3>Το GDPR δεν είναι checkbox. Είναι η αρχιτεκτονική.</h3>
                <p>Το Hlektrismos.gr είναι χτισμένο privacy-first. Δεν κάνουμε ποτέ scraping third-party sites ή social platforms. Κάθε επαφή έχει τεκμηριωμένο lawful basis και μπορεί να ασκήσει τα δικαιώματά της από ένα self-service πάνελ.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="container">
            <div className="section-heading reveal">
              <div className="eyebrow"><span className="eyebrow-dot" /> Συχνές Ερωτήσεις</div>
              <h2>Όλα όσα χρειάζεται <span className="gradient-text">να γνωρίζεις</span></h2>
              <p>Όλα όσα πρέπει να ξέρεις για την αλλαγή παρόχου ενέργειας.</p>
            </div>
            <div className="faq-list reveal">
              {faqs.map((f, i) => (
                <div className={`faq-item ${openFaq === i ? 'open' : ''}`} key={i} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <div className="faq-q">{f.q}<ChevronDown size={20} className="faq-chevron" /></div>
                  <div className="faq-a">{f.a}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="contact-section" id="contact">
          <div className="contact-glow" />
          <div className="container">
            <div className="contact-grid">
              <div className="contact-copy reveal">
                <div className="eyebrow"><span className="eyebrow-dot" /> Ζητήστε να σας καλέσουμε!</div>
                <h2>Έτοιμος να εξοικονομήσεις <span className="gradient-text">χρήματα;</span></h2>
                <p>Συμπλήρωσε τη φόρμα και ένας εξειδικευμένος σύμβουλος θα επικοινωνήσει άμεσα για να σου προτείνει το κατάλληλο πρόγραμμα — ΔΩΡΕΑΝ!</p>
                <div className="contact-points">
                  <div className="contact-point"><Phone size={18} /> +30 210 22 55 000</div>
                   <div className="contact-point"><Mail size={18} /> info@hlektrismos.gr</div>
                  <div className="contact-point"><Home size={18} /> Ζαλοκώστα 8, Αθήνα 10671</div>
                  <div className="contact-point"><Lock size={18} /> Χωρίς scraping. GDPR-first. Τα δεδομένα σου είναι ασφαλή.</div>
                </div>
              </div>
              <div className="form-card reveal">
                {submitted ? (
                  <div className="success-state">
                    <div className="success-icon"><Check size={28} /></div>
                    <h3>Αίτημα ελήφθη!</h3>
                    <p>Ένας εξειδικευμένος σύμβουλος ενέργειας θα επικοινωνήσει μαζί σου άμεσα.</p>
                  </div>
                ) : (
                  <form onSubmit={submitLead}>
                    <h3>Ζητήστε να σας καλέσουμε</h3>
                    <p className="form-sub">Συμπλήρωσε τη φόρμα και θα επικοινωνήσουμε άμεσα. 100% δωρεάν.</p>
                    <div className="form-grid">
                      <div className="form-field"><label>Όνομα</label><input required value={form.firstName} onChange={(e) => update('firstName', e.target.value)} placeholder="Γιάννης" /></div>
                      <div className="form-field"><label>Επώνυμο</label><input required value={form.lastName} onChange={(e) => update('lastName', e.target.value)} placeholder="Παπαδόπουλος" /></div>
                      <div className="form-field"><label>Email <span className="optional-label">(προαιρετικό)</span></label><input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="giannis@email.gr" /></div>
                      <div className="form-field"><label>Τηλέφωνο *</label><input required type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+30 690 000 0000" /></div>
                      <div className="form-field">
                        <label>Τύπος Ακινήτου *</label>
                        <select required value={form.propertyType} onChange={(e) => update('propertyType', e.target.value)}>
                          <option value="" disabled>Επιλέξτε τύπο...</option>
                          <option value="Σπίτι">Σπίτι</option>
                          <option value="Επιχείρηση">Επιχείρηση</option>
                        </select>
                      </div>
                      <div className="form-field">
                        <label>Περιοχή <span className="optional-label">(προαιρετικό)</span></label>
                        <select value={form.region} onChange={(e) => update('region', e.target.value)}>
                          <option value="">Επιλέξτε περιοχή...</option>
                          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div className="form-field full">
                        <label>Υπηρεσία ενδιαφέροντος</label>
                        <select value={form.service} onChange={(e) => update('service', e.target.value)}>
                          {services.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="form-field full"><label>Σχόλια <span className="optional-label">(προαιρετικά)</span></label><textarea value={form.message} onChange={(e) => update('message', e.target.value)} placeholder="Πες μας τις ανάγκες σου..." /></div>
                      <div className="form-field full">
                        <label>Ανέβασε τον λογαριασμό σου <span className="optional-label">(προαιρετικό)</span></label>
                        <label className="bill-upload">
                          <Upload size={18} />
                          <span>{form.billFile ? form.billFile.name : 'PDF, JPG ή PNG έως 10MB'}</span>
                          <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={handleBillChange} />
                        </label>
                        <small className="upload-note">Ο λογαριασμός χρησιμοποιείται μόνο για την εξατομικευμένη ενεργειακή πρότασή σου.</small>
                      </div>
                    </div>
                    <div className="consent-row">
                      <input required type="checkbox" checked={form.consent} onChange={(e) => update('consent', e.target.checked)} id="consent" />
                      <label htmlFor="consent">Συναινώ στην επεξεργασία των δεδομένων μου για να επικοινωνήσετε μαζί μου, σύμφωνα με την πολιτική απορρήτου GDPR. Μπορώ να αποσύρω τη συγκατάθεσή μου ανά πάσα στιγμή.</label>
                    </div>
                    {formError && <p className="form-error">{formError}</p>}
                    <button className="btn btn-primary form-submit" disabled={submitting}>
                      {submitting ? 'Αποστολή...' : 'Ζητήστε κλήση'} <ArrowRight size={18} />
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a href="#top" className="brand"><span className="brand-mark"><Zap size={18} fill="currentColor" /></span><span>Hlektrismos<span>.gr</span></span></a>
              <div className="footer-logo-wrap"><img src="/images/image.png" alt="Ηλεκτρισμός - Ενεργειακοί Σύμβουλοι" className="footer-logo" /></div>
              <p>Ο προσωπικός σου σύμβουλος ενέργειας. Συγκρίνουμε πάροχους και βρίσκουμε την καλύτερη λύση — δωρεάν.</p>
            </div>
            <div className="footer-col">
              <h4>Υπηρεσίες</h4>
              <a href="#services">Ρεύμα</a>
              <a href="#services">Φυσικό Αέριο</a>
              <a href="#services">Φωτοβολταϊκά</a>
              <a href="#services">Ηλεκτροκίνηση</a>
            </div>
            <div className="footer-col">
              <h4>Εταιρεία</h4>
              <a href="#about">Ποιοι Είμαστε</a>
              <a href="#faq">Συχνές Ερωτήσεις</a>
              <a href="#contact">Επικοινωνία</a>
              <a href="#/login">Σύνδεση</a>
            </div>
            <div className="footer-col">
              <h4>Επικοινωνία</h4>
              <a href="tel:+302102255000">+30 210 22 55 000</a>
              <a href="mailto:info@hlektrismos.gr">info@hlektrismos.gr</a>
              <span>Ζαλοκώστα 8, Αθήνα 10671</span>
              <span>Δευ – Παρ · 09:00 – 18:00</span>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 Hlektrismos.gr. Με επιφύλαξη παντών δικαιωμάτων.</span>
            <span>Πολιτική Απορρήτου · Όροι Χρήσης · GDPR</span>
          </div>
        </div>
      </footer>
      <ChatBot />
    </div>
  );
}
