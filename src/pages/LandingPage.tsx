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
  FileText,
} from 'lucide-react';
import ChatBot from '@/components/ChatBot';
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
  billFiles: File[];
  consent: boolean;
};

const greekJourney = [
  { region: 'Αττική', city: 'Αθήνα', title: 'Η αφετηρία της εξοικονόμησης', text: 'Ξεκινάμε από την παροχή σου και συγκρίνουμε άμεσα τα διαθέσιμα προγράμματα για σπίτι, γραφείο ή κατάστημα.', x: 56, y: 34 },
  { region: 'Κεντρική Ελλάδα', city: 'Θεσσαλία', title: 'Λύσεις για κάθε κατανάλωση', text: 'Από μικρές κατοικίες μέχρι αγροτικές και επαγγελματικές εγκαταστάσεις, βρίσκουμε το σωστό ενεργειακό προφίλ.', x: 61, y: 28 },
  { region: 'Βόρεια Ελλάδα', city: 'Θεσσαλονίκη', title: 'Η ενέργεια της ανάπτυξης', text: 'Υποστήριξη για επιχειρήσεις και οικογένειες σε όλη τη Μακεδονία και τη Θράκη με προσωπικό σύμβουλο.', x: 63, y: 17 },
  { region: 'Νησιά Ιονίου', city: 'Κέρκυρα · Ζάκυνθος', title: 'Ενέργεια χωρίς σύνορα', text: 'Εξυπηρέτηση σε κάθε νησί, με προτάσεις που λαμβάνουν υπόψη εποχικότητα, τουρισμό και πραγματική χρήση.', x: 37, y: 45 },
  { region: 'Νησιά Αιγαίου', city: 'Κυκλάδες · Δωδεκάνησα', title: 'Έξυπνη ενέργεια στα νησιά', text: 'Προγράμματα ρεύματος, φωτοβολταϊκά και λύσεις ηλεκτροκίνησης για τις ανάγκες κάθε νησιωτικής κοινότητας.', x: 71, y: 52 },
  { region: 'Κρήτη', city: 'Ηράκλειο · Χανιά', title: 'Η πράσινη επόμενη μέρα', text: 'Σχεδιάζουμε το επόμενο βήμα με φωτοβολταϊκά, ενεργειακή αυτονομία και λύσεις για κατοικίες και τουριστικές μονάδες.', x: 63, y: 75 },
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
  { icon: Flame, title: 'Αέριο', text: 'Εξατομικευμένες λύσεις φυσικού αερίου για το σπίτι και την επιχείρηση με τα καλύτερα τιμολογιακά πλάνα.' },
  { icon: Leaf, title: 'Φωτοβολταϊκά', text: 'Καινοτομία και βιώσιμη ανάπτυξη στον χώρο σου. Επένδυσε στην πράσινη ενέργεια με ασφάλεια.' },
  { icon: Plug, title: 'Ηλεκτροκίνηση', text: 'Οδηγούμε οικολογικά, κινούμαστε ηλεκτρικά. Λύσεις φόρτισης και EV για κάθε ανάγκη.' },
  { icon: ShieldCheck, title: 'Αποθήκευση Ενέργειας', text: 'Λύσεις αποθήκευσης ενέργειας με μπαταρίες για αυτονομία και εξοικονόμηση.' },
  { icon: TrendingUp, title: 'Εξοικονόμηση Ενέργειας', text: 'Ανάλυση κατανάλωσης και στρατηγικές για μείωση του λογαριασμού ρεύματος.' },
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
  { q: 'Πόσοι πάροχοι ηλεκτρικού ρεύματος υπάρχουν;', a: 'Υπάρχει μια τεράστια γκάμα επιλογών. Θα πρέπει να είμαστε προσεκτικοί για την επιλογή και τους όρους του συμβολαίου. Εμείς σας βοηθάμε να βρείτε τον κατάλληλο.' },
  { q: 'Τι είναι ο Προμηθευτής Τελευταίου Καταφυγίου;', a: 'Ο πάροχος που είναι υποχρεωμένος να προμηθεύει ρεύμα σε καταναλωτές που δεν εκπροσωπούνται από κάποιον προμηθευτή. Ορίζεται από τη ΡΑΕ και η μεταφορά γίνεται αυτόματα.' },
  { q: 'Τι είναι η Καθολική Υπηρεσία;', a: 'Η Καθολική Υπηρεσία θεσπίστηκε το 2011 για να παρέχει ρεύμα σε νοικοκυριά και μικρές επιχειρήσεις που δεν εκπροσωπούνται από κάποιον πάροχο. Οι χρεώσεις έχουν προσαύξηση ~12%.' },
  { q: 'Τι γίνεται με την εγγύηση;', a: 'Η εγγύηση επιστρέφεται και συμψηφίζεται στον τελευταίο λογαριασμό του υφιστάμενου παρόχου. Στον νέο πάροχο, η εγγύηση είναι συνήθως ίσο με το κόστος 45 ημερών.' },
  { q: 'Πόσο συχνά λαμβάνω λογαριασμό;', a: 'Ο λογαριασμός είναι μηνιαίος: έναντι (εκτιμητικός) και εκκαθαριστικός (με βάση την πραγματική κατανάλωση του ΔΕΔΔΗΕ). Υπάρχει επίσης ο Τελικός λογαριασμός.' },
  { q: 'Τι είναι η ΟΤΣ;', a: 'Η Τιμή Εκκαθάρισης Εσωτερικής Αγοράς είναι η τιμή στην οποία εκκαθαρίζεται η αγορά ηλεκτρικού ρεύματος. Αποτελεί το μεγαλύτερο μέρος του ανταγωνιστικού κόστους.' },
  { q: 'Ποιος είναι υπεύθυνος για τη μέτρηση;', a: 'Ο ΔΕΔΔΗΕ είναι υπεύθυνος για την καταμέτρηση και τις αποστέλλει στους προμηθευτές για τον υπολογισμό του κόστους.' },
  { q: 'Που απευθυνόμαστε σε περίπτωση διακοπής;', a: 'Σε περίπτωση διακοπής, απευθυνόμαστε στον ΔΕΔΔΗΕ που είναι υπεύθυνος για τη λειτουργία και συντήρηση του δικτύου.' },
];

const advantages = [
  { icon: Gauge, title: '100% Δωρεάν', text: 'Η υπηρεσία μας είναι εντελώς δωρεάν, χωρίς κρυφές χρεώσεις.' },
  { icon: TrendingUp, title: 'Άμεση Εξυπηρέτηση', text: 'Επικοινωνία μέσα σε λίγες ώρες με τον προσωπικό σου σύμβουλο.' },
  { icon: Users, title: 'Εξατομικευμένη Λύση', text: 'Πρόταση φτιαγμένη ειδικά για τις δικές σου ανάγκες κατανάλωσης.' },
];

const galleryItems = [
  {
    image: '/images/energy1.jpg',
    title: 'Ρεύμα',
    subtitle: 'Φθηνά Προγράμματα Ενέργειας',
    description: 'Φθηνά προγράμματα ενέργειας ειδικά για σένα. Συγκρίνουμε πάροχους και βρίσκουμε τον φθηνότερο — δωρεάν.',
    details: 'Στο δυναμικό περιβάλλον της αγοράς ενέργειας, είμαστε εδώ για να δώσουμε λύσεις. Με συνεχή έρευνα και αναζήτηση των βέλτιστων προσφορών, προσφέρουμε δωρεάν συμβουλές σε εκείνους που επιθυμούν την καλύτερη επιλογή ενέργειας για το σπίτι ή την επιχείρησή τους.',
    wide: true,
    link: 'https://hlektrismos.gr/olokliromenes-lyseis/',
  },
  {
    image: '/images/energy2.jpg',
    title: 'Αέριο',
    subtitle: 'Εξατομικευμένες Λύσεις Φυσικού Αερίου',
    description: 'Εξατομικευμένες λύσεις φυσικού αερίου για το σπίτι με τα καλύτερα τιμολογικά πλάνα.',
    details: 'Προσφέρουμε εξατομικευμένες λύσεις φυσικού αερίου για το σπίτι και την επιχείρηση. Συγκρίνουμε τιμές και όρους για να βρούμε το πιο αποδοτικό πρόγραμμα για τις ανάγκες σου.',
    wide: false,
    link: 'https://hlektrismos.gr/olokliromenes-lyseis/',
  },
  {
    image: '/images/energy3.jpg',
    title: 'Φωτοβολταϊκά',
    subtitle: 'Καινοτομία & Βιώσιμη Ανάπτυξη',
    description: 'Καινοτομία και Βιώσιμη Ανάπτυξη, τώρα στο χώρο σου. Επένδυσε στην πράσινη ενέργεια.',
    details: 'Εγκατεστημένα φωτοβολταϊκά συστήματα για κατοικίες και επιχειρήσεις. Αυτονομία, εξοικονόμηση και βιωσιμότητα σε ένα βήμα. Αξιοποιήστε την ηλιακή ενέργεια για να μειώσετε драстικά τον λογαριασμό σας.',
    wide: false,
    link: 'https://hlektrismos.gr/olokliromenes-lyseis/',
  },
  {
    image: '/images/energy4.jpg',
    title: 'Ηλεκτροκίνηση',
    subtitle: 'Οδηγούμε Οικολογικά',
    description: 'Οδηγούμε οικολογικά, κινούμαστε ηλεκτρικά. Λύσεις φόρτισης και EV για κάθε ανάγκη.',
    details: 'Λύσεις ηλεκτρικής κίνησης: από την εγκατάσταση σταθμών φόρτισης έως η συμβουλευτική για επιλογή ηλεκτρικού οχήματος. Κινηθείτε βιώσιμα με χαμηλότερο κόστος.',
    wide: true,
    link: 'https://hlektrismos.gr/olokliromenes-lyseis/',
  },
  {
    image: '/images/energy5.jpg',
    title: 'Αποθήκευση Ενέργειας',
    subtitle: 'Αυτονομία & Εξοικονόμηση',
    description: 'Λύσεις αποθήκευσης ενέργειας με μπαταρίες για αυτονομία και εξοικονόμηση.',
    details: 'Συστήματα αποθήκευσης ενέργειας για αυτονομία από το δίκτυο. Αποθηκεύστε πλεονάσματα από φωτοβολταϊκά και χρησιμοποιήστε τα όταν χρειάζεστε. Μειώστε το κόστος και αυξήστε την ασφάλεια ενέργειας.',
    wide: false,
    link: 'https://hlektrismos.gr/olokliromenes-lyseis/',
  },
  {
    image: '/images/energy6.jpg',
    title: 'Εξοικονόμηση Ενέργειας',
    subtitle: 'Ανάλυση & Στρατηγική',
    description: 'Ανάλυση κατανάλωσης και στρατηγικές για μείωση του λογαριασμού ρεύματος.',
    details: 'Αναλύουμε την κατανάλωσή σου και σου προτείνουμε πραγματικές στρατηγικές για μείωση του λογαριασμού. Με δεδομένα και εμπειρία, βρίσκουμε πάντα τον καλύτερο τρόπο να εξοικονομήσεις.',
    wide: false,
    link: 'https://hlektrismos.gr/olokliromenes-lyseis/',
  },
];

function useScrollReveal() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
        }
      }),
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' },
    );
    document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-scale').forEach((el) => observer.observe(el));
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
    region: '', customerType: '', propertyType: '', service: 'Ρεύμα', message: '', billFiles: [], consent: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [galleryModal, setGalleryModal] = useState<number | null>(null);
  const journeySectionRef = useRef<HTMLElement>(null);
  const [bgTransform, setBgTransform] = useState('');
  const journeyIndex = Math.min(greekJourney.length - 1, Math.floor((scrollY / Math.max(1, document.documentElement.scrollHeight - window.innerHeight)) * greekJourney.length));
  const activeJourney = greekJourney[journeyIndex];

  // Force light mode on the public landing page (CRM dashboard keeps its dark theme).
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

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
    const files = e.target.files;
    if (!files || files.length === 0) {
      return;
    }
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    const maxSize = 25 * 1024 * 1024; // 25MB per file
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!allowedTypes.includes(file.type)) {
        setFormError(`Το αρχείο "${file.name}" δεν είναι αποδεκτό. Επιτρέπονται μόνο PDF, JPG, PNG.`);
        e.target.value = '';
        return;
      }
      if (file.size > maxSize) {
        setFormError(`Το αρχείο "${file.name}" υπερβαίνει το όριο 25MB.`);
        e.target.value = '';
        return;
      }
      validFiles.push(file);
    }
    setFormError('');
    setForm(prev => ({ ...prev, billFiles: [...prev.billFiles, ...validFiles] }));
    e.target.value = '';
  };

  const removeBillFile = (index: number) => {
    setForm(prev => ({ ...prev, billFiles: prev.billFiles.filter((_, i) => i !== index) }));
  };

  const submitLead = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    const uploadedFiles: Array<{ path: string; name: string; type: string; size: number }> = [];
    for (const file of form.billFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? 'file';
      const filePath = `${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('energy-bills').upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) {
        setSubmitting(false);
        setFormError(`Σφάλμα μεταφόρτωσης: ${uploadError.message}`);
        return;
      }
      uploadedFiles.push({ path: filePath, name: file.name, type: file.type, size: file.size });
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
      bill_file_path: uploadedFiles.length > 0 ? uploadedFiles[0].path : null,
      bill_file_name: uploadedFiles.length > 0 ? uploadedFiles[0].name : null,
      bill_files: uploadedFiles.length > 0 ? uploadedFiles : null,
      consent: form.consent,
      lawful_basis: form.consent ? 'Consent' : null,
      customer_category: form.propertyType === 'Σπίτι' ? 'B2C_Household' : 'B2B_Corporate',
      pipeline_status: 'new'
    });
    setSubmitting(false);
    if (error) { setFormError('Κάτι πήγε στραβά. Δοκιμάστε ξανά.'); return; }
    setSubmitted(true);
    setForm({ firstName: '', lastName: '', email: '', phone: '', region: '', customerType: '', propertyType: '', service: 'Ρεύμα', message: '', billFiles: [], consent: false });
  };

  const heroBgTransform = `translate3d(0, ${scrollY * 0.4}px, 0) scale(${1 + scrollY * 0.0003})`;
  const heroContentTransform = `translate3d(0, ${scrollY * 0.12}px, 0)`;
  const heroOpacity = Math.max(0, 1 - scrollY / 600);

  return (
    <div className="app-shell">
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
            <div className="hero-bg-image" style={{ transform: heroBgTransform, opacity: heroOpacity }} />
            <div className="hero-bg-overlay" />
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
              {advantages.map((a, i) => (
                <div className={`advantage-card reveal stagger-${i + 1}`} key={a.title}>
                  <div className="advantage-icon"><a.icon size={24} /></div>
                  <h3>{a.title}</h3>
                  <p>{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="gallery-section" id="gallery">
          <div className="container">
            <div className="section-heading reveal">
              <div className="eyebrow"><span className="eyebrow-dot" /> Gallery</div>
              <h2>Η ενέργεια <span className="gradient-text">σε εικόνα</span></h2>
              <p>Ανακαλύψτε τις λύσεις μας μέσα από φωτογραφίες από πραγματικές εγκαταστάσεις.</p>
            </div>
            <div className="gallery-grid">
              {galleryItems.map((item, i) => (
                <div
                  key={item.title}
                  className={`gallery-item ${item.wide ? 'gallery-item-wide' : ''} ${i % 2 === 0 ? 'reveal-left' : 'reveal-right'} stagger-${i + 1}`}
                  onClick={() => setGalleryModal(i)}
                  style={{ cursor: 'pointer' }}
                >
                  <img src={item.image} alt={item.title} loading="lazy" />
                  <div className="gallery-3d-card">
                    <div className="gallery-card-inner">
                      <h3>{item.title}</h3>
                      <p>{item.subtitle}</p>
                      <span className="gallery-card-cta">Μάθε περισσότερα →</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {galleryModal !== null && (
          <div className="gallery-modal-overlay" onClick={() => setGalleryModal(null)}>
            <div className="gallery-modal" onClick={(e) => e.stopPropagation()}>
              <button className="gallery-modal-close" onClick={() => setGalleryModal(null)}><X size={24} /></button>
              <div className="gallery-modal-image">
                <img src={galleryItems[galleryModal].image} alt={galleryItems[galleryModal].title} />
              </div>
              <div className="gallery-modal-content">
                <h2>{galleryItems[galleryModal].title}</h2>
                <h3>{galleryItems[galleryModal].subtitle}</h3>
                <p className="gallery-modal-desc">{galleryItems[galleryModal].description}</p>
                <p className="gallery-modal-details">{galleryItems[galleryModal].details}</p>
                <div className="gallery-modal-actions">
                  <a href={galleryItems[galleryModal].link} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                    Μάθε Περισσότερα <ArrowRight size={16} />
                  </a>
                  <a href="tel:+302102255000" className="btn btn-ghost">
                    <Phone size={16} /> Καλέστε μας
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        <section className="section section-bg-services" id="services">
          <div className="container">
            <div className="section-heading reveal">
              <div className="eyebrow"><span className="eyebrow-dot" /> Υπηρεσίες</div>
              <h2>Για το σπίτι και <span className="gradient-text">την επιχείρηση!</span></h2>
              <p>Ολοκληρωμένες ενεργειακές λύσεις προσαρμοσμένες στις δικές σου ανάγκες.</p>
            </div>
            <div className="services-grid">
              {features.map((f, i) => (
                <div className={`service-card reveal stagger-${i + 1}`} key={f.title}>
                  <div className="service-icon"><f.icon size={28} /></div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                  <a href="#contact" className="service-link">Δες περισσότερα <ArrowRight size={14} /></a>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-bg-about" id="about">
          <div className="container">
            <div className="about-grid">
              <div className="about-copy reveal-left">
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
              <div className="about-visual reveal-right">
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

        <section className="gdpr-section section-bg-gdpr" id="gdpr">
          <div className="container">
            <div className="gdpr-inner reveal-scale">
              <div className="gdpr-shield"><ShieldCheck size={36} /></div>
              <div>
                <h3>Το GDPR δεν είναι checkbox. Είναι η αρχιτεκτονική.</h3>
                <p>Το Hlektrismos.gr είναι χτισμένο privacy-first. Δεν κάνουμε ποτέ scraping third-party sites ή social platforms. Κάθε επαφή έχει τεκμηριωμένο lawful basis και μπορεί να ασκήσει τα δικαιώματά της από ένα self-service πάνελ.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section section-bg-faq" id="faq">
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

        <section className="contact-section section-bg-contact" id="contact">
          <div className="contact-glow" />
          <div className="container">
            <div className="contact-grid">
              <div className="contact-copy reveal-left">
                <div className="eyebrow"><span className="eyebrow-dot" /> Ζητήστε να σας καλέσουμε!</div>
                <h2>Έτοιμος να εξοικονομήσεις <span className="gradient-text">χρήματα;</span></h2>
                <p>Συμπλήρωσε τη φόρμα και ένας εξειδικευμένος σύμβουλος θα επικοινωνήσει άμεσα για να σου προτείνει το κατάλληλο πρόγραμμα — ΔΩΡΕΑΝ!</p>
            <div className="contact-points">
                   <div className="contact-point"><Phone size={18} /> +30 210 22 55 000</div>
                    <div className="contact-point"><Mail size={18} /> info@hlektrismos.gr</div>
                   <div className="contact-point"><Home size={18} /> Ζαλοκώστα 8, Αθήνα Τ.Κ. 10671</div>
                   <div className="contact-point"><Lock size={18} /> Τα δεδομένα σου είναι ασφαλή. GDPR-compliant.</div>
                 </div>
              </div>
              <div className="form-card reveal-right">
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
                        <label>Ανέβασε λογαριασμούς / αρχεία <span className="optional-label">(προαιρετικό)</span></label>
                        {form.billFiles.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                            {form.billFiles.map((f, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'rgba(0,102,204,0.06)', borderRadius: '8px', fontSize: '13px' }}>
                                <FileText size={14} style={{ color: '#0066cc', flexShrink: 0 }} />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                <span style={{ color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                                <button type="button" onClick={() => removeBillFile(i)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: '2px', lineHeight: 1 }}>×</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <label className="bill-upload">
                          <Upload size={18} />
                          <span>{form.billFiles.length > 0 ? `Ανέβασε άλλο αρχείο (${form.billFiles.length} ήδη)` : 'PDF, JPG ή PNG έως 25MB το καθένα — μπορείτε να ανεβάσετε πολλαπλά'}</span>
                          <input type="file" accept="application/pdf,image/jpeg,image/png" multiple onChange={handleBillChange} />
                        </label>
                        <small className="upload-note">Μπορείτε να ανεβάσετε πολλαπλά αρχεία (PDF, JPG, PNG). Κάθε αρχείο έως 25MB. Οι λογαριασμοί χρησιμοποιούνται μόνο για την εξατομικευμένη ενεργειακή πρότασή σου.</small>
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
              <p>Εξειδικευμένοι Σύμβουλοι Ενέργειας. Συγκρίνουμε και βρίσκουμε μαζί τον φθηνότερο πάροχο ενέργειας για το σπίτι και την επιχείρησή σου.</p>
              <div className="footer-contact-info">
                <a href="https://maps.app.goo.gl/6h38xGoe2mW7mqTb8" target="_blank" rel="noopener noreferrer">Ζαλοκώστα 8, Αθήνα Τ.Κ. 10671</a>
                <a href="tel:+302102255000">+30 210 22 55 000</a>
                <a href="mailto:info@hlektrismos.gr">info@hlektrismos.gr</a>
              </div>
            </div>
            <div className="footer-col">
              <h4>Υπηρεσίες</h4>
              <a href="#services">Ρεύμα</a>
              <a href="#services">Αέριο</a>
              <a href="#services">Φωτοβολταϊκά</a>
              <a href="#services">Ηλεκτροκίνηση</a>
              <a href="#services">Ολοκληρωμένες Λύσεις</a>
            </div>
            <div className="footer-col">
              <h4>Χρήσιμοι Σύνδεσμοι</h4>
              <a href="#/">Αρχική</a>
              <a href="#about">Σχετικά με εμάς</a>
              <a href="#services">Λύσεις</a>
              <a href="#faq">Ενέργεια Σήμερα</a>
              <a href="#faq">Συχνές Ερωτήσεις</a>
              <a href="#contact">Επικοινωνία</a>
            </div>
            <div className="footer-col">
              <h4>Ώρες Λειτουργίας</h4>
              <span>Είμαστε εδώ για εσένα</span>
              <span>Δευτέρα - Παρασκευή 09:00 - 17:00</span>
              <span>Σάββατο - Κυριακή Κλειστά</span>
            </div>
          </div>
          <div className="footer-bottom">
            <span>© 2026 hlektrismos.gr. Με την επιφύλαξη παντός δικαιώματος.</span>
            <div className="footer-legal-links">
              <a href="https://hlektrismos.gr/politiki-aporritou/" target="_blank" rel="noopener noreferrer">Πολιτική Απορρήτου</a>
              <span>·</span>
              <a href="https://hlektrismos.gr/oroi-chrisis/" target="_blank" rel="noopener noreferrer">Όροι Χρήσης</a>
              <span>·</span>
              <a href="https://hlektrismos.gr/cookies/" target="_blank" rel="noopener noreferrer">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
      <ChatBot />
    </div>
  );
}
