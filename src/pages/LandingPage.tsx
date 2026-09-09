import { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent, useEffect, useRef, useState, type SVGProps } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
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
import { GreeceMap3D } from '@/components/greece/GreeceMap3D';
import HeroParticles from '@/components/three/HeroParticles';
import { useLenis } from '@/hooks/useLenis';
import { supabase } from '@/lib/supabase';

gsap.registerPlugin(ScrollTrigger);

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

const services = [
  'Ρεύμα',
  'Φυσικό Αέριο',
  'Φωτοβολταϊκά',
  'Ηλεκτροκίνηση',
];

const SERVICE_KEYS: Record<string, string> = {
  'Ρεύμα': 'energy',
  'Φυσικό Αέριο': 'gas',
  'Φωτοβολταϊκά': 'solar',
  'Ηλεκτροκίνηση': 'ev',
};

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

function Flame(props: SVGProps<SVGSVGElement>) {
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
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [galleryModal, setGalleryModal] = useState<number | null>(null);
  const [journeyIndex, setJourneyIndex] = useState(0);
  const activeJourney = greekJourney[journeyIndex];

  // Refs driven imperatively by GSAP ScrollTrigger — no per-frame React re-renders.
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const heroBgRef = useRef<HTMLDivElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);
  const heroVisualRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<HTMLDivElement>(null);
  const pageProgressRef = useRef<HTMLDivElement>(null);
  const journeySectionRef = useRef<HTMLElement>(null);
  const journeyFillRef = useRef<HTMLSpanElement>(null);
  const journeyProgressRef = useRef(0);
  const journeyMapWrapRef = useRef<HTMLDivElement>(null);
  // The 3D map (Mapbox chunk + tiles) is heavy — mount it only when the
  // journey section approaches the viewport instead of on page load.
  const [journeyMapLive, setJourneyMapLive] = useState(false);

  useEffect(() => {
    const el = journeyMapWrapRef.current;
    if (!el || journeyMapLive) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setJourneyMapLive(true);
          io.disconnect();
        }
      },
      { rootMargin: '800px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [journeyMapLive]);

  // Gallery: cursor-following 3D tilt + glare, scroll-scrubbed depth entrance
  // and photo/card parallax. Entirely skipped under prefers-reduced-motion.
  const galleryReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const handleGalleryTilt = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (galleryReducedMotion) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(px * 7).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-py * 5.5).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(1)}%`);
  };

  const resetGalleryTilt = (e: ReactMouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty('--rx', '0deg');
    e.currentTarget.style.setProperty('--ry', '0deg');
  };

  // Showcase banner gets a hero-grade tilt range — it's one big image, not a grid card.
  const handleShowcaseTilt = (e: ReactMouseEvent<HTMLElement>) => {
    if (galleryReducedMotion) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${(px * 10).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-py * 8).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(1)}%`);
  };

  const resetShowcaseTilt = (e: ReactMouseEvent<HTMLElement>) => {
    e.currentTarget.style.setProperty('--rx', '0deg');
    e.currentTarget.style.setProperty('--ry', '0deg');
  };

  useEffect(() => {
    if (galleryReducedMotion) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.gallery-item').forEach((item) => {
        gsap.fromTo(
          item,
          { y: 64, opacity: 0, rotateX: 10, scale: 0.95, transformPerspective: 1100 },
          {
            y: 0,
            opacity: 1,
            rotateX: 0,
            scale: 1,
            duration: 1.05,
            ease: 'power3.out',
            scrollTrigger: { trigger: item, start: 'top 88%', once: true },
          },
        );
        const media = item.querySelector('.gallery-media');
        if (media) {
          gsap.fromTo(
            media,
            { yPercent: -5 },
            {
              yPercent: 5,
              ease: 'none',
              scrollTrigger: { trigger: item, start: 'top bottom', end: 'bottom top', scrub: true },
            },
          );
        }
      });

      // Showcase banner: 3D entrance + scroll-scrubbed parallax (replaces the
      // .reveal class fade so the two systems don't fight over the element).
      gsap.utils.toArray<HTMLElement>('.energy-showcase-frame').forEach((frame) => {
        gsap.fromTo(
          frame,
          { y: 90, opacity: 0, rotateX: 14, scale: 0.94, transformPerspective: 1200 },
          {
            y: 0,
            opacity: 1,
            rotateX: 0,
            scale: 1,
            duration: 1.15,
            ease: 'power3.out',
            scrollTrigger: { trigger: frame, start: 'top 88%', once: true },
          },
        );
        const showcaseMedia = frame.querySelector('.energy-showcase-media');
        if (showcaseMedia) {
          gsap.fromTo(
            showcaseMedia,
            { yPercent: -7 },
            {
              yPercent: 7,
              ease: 'none',
              scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: true },
            },
          );
        }
      });
    });
    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Force light mode on the public landing page (CRM dashboard keeps its dark theme).
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  useScrollReveal();
  useLenis();

  // All scroll-driven visuals run through GSAP ScrollTrigger, writing straight
  // to DOM nodes via quickSetters — the component only re-renders when the
  // discrete journeyIndex actually changes.
  useEffect(() => {
    const ctx = gsap.context(() => {
      // ── Header state (class toggle, no re-render) ──
      const header = headerRef.current;
      if (header) {
        const headerTrigger = ScrollTrigger.create({
          start: 40,
          end: 'max',
          onToggle: (self) => header.classList.toggle('scrolled', self.isActive),
        });
        header.classList.toggle('scrolled', headerTrigger.isActive);
      }

      // ── Page scroll-progress bar ──
      const pageFill = pageProgressRef.current;
      if (pageFill && rootRef.current) {
        const setPageProgress = gsap.quickSetter(pageFill, 'width', '%');
        const pageTrigger = ScrollTrigger.create({
          trigger: rootRef.current,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => setPageProgress(self.progress * 100),
        });
        setPageProgress(pageTrigger.progress * 100);
      }

      // ── Hero micro-parallax + fade-out ──
      const hero = heroRef.current;
      if (hero) {
        const bgTarget = heroBgRef.current;
        const setBgY = bgTarget ? gsap.quickSetter(bgTarget, 'y', 'px') : null;
        const setBgScale = bgTarget ? gsap.quickSetter(bgTarget, 'scale') : null;
        const setContentY = heroContentRef.current ? gsap.quickSetter(heroContentRef.current, 'y', 'px') : null;
        const fadeTargets = [heroBgRef.current, heroContentRef.current, heroVisualRef.current, particlesRef.current]
          .filter((el): el is HTMLDivElement => Boolean(el));
        const setFade = fadeTargets.length > 0 ? gsap.quickSetter(fadeTargets, 'opacity') : null;

        const applyHero = (progress: number) => {
          const y = progress * hero.offsetHeight;
          setBgY?.(y * 0.4);
          setBgScale?.(1 + y * 0.0003);
          setContentY?.(y * 0.12);
          setFade?.(Math.max(0, 1 - y / 600));
        };
        const heroTrigger = ScrollTrigger.create({
          trigger: hero,
          start: 'top top',
          end: () => `+=${hero.offsetHeight}`,
          onUpdate: (self) => applyHero(self.progress),
        });
        applyHero(heroTrigger.progress);
      }

      // ── Greece journey — sticky 3D map progress ──
      const journey = journeySectionRef.current;
      if (journey) {
        const setJourneyFill = journeyFillRef.current ? gsap.quickSetter(journeyFillRef.current, 'width', '%') : null;
        const applyJourney = (progress: number) => {
          journeyProgressRef.current = progress; // consumed inside GreeceMap3D's camera rig
          setJourneyFill?.(progress * 100);
          const next = Math.min(greekJourney.length - 1, Math.floor(progress * greekJourney.length));
          setJourneyIndex((current) => (current === next ? current : next));
        };
        const journeyTrigger = ScrollTrigger.create({
          trigger: journey,
          start: 'top top',
          end: 'bottom bottom',
          onUpdate: (self) => applyJourney(self.progress),
        });
        applyJourney(journeyTrigger.progress);
      }
    }, rootRef);
    return () => ctx.revert();
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

    // Try to upload files, but don't block the lead insert if upload fails
    const uploadedFiles: Array<{ path: string; name: string; type: string; size: number }> = [];
    let fileWarning = '';
    for (const file of form.billFiles) {
      try {
        const { uploadDocument } = await import('@/lib/storage');
        const { data, error: uploadError } = await uploadDocument(file);
        if (uploadError) {
          fileWarning = `Σημείωση: Το αρχείο "${file.name}" δεν μεταφορτώθηκε. Θα μπορέσετε να το ανεβάσετε αργότερα.`;
          console.error('File upload error:', uploadError);
        } else if (data) {
          uploadedFiles.push(data);
        }
      } catch (uploadErr) {
        fileWarning = `Σημείωση: Το αρχείο "${file.name}" δεν μεταφορτώθηκε.`;
        console.error('File upload exception:', uploadErr);
      }
    }

    // Insert lead (even without files) via the hardened public RPC
    const { data: leadId, error } = await supabase.rpc('insert_website_lead', {
      p_source: 'website',
      p_payload: {
        first_name: form.firstName || null,
        last_name: form.lastName || null,
        full_name: `${form.firstName} ${form.lastName}`.trim() || null,
        email: form.email || 'not-provided@hlektrismos.local',
        phone: form.phone || null,
        region: form.region || null,
        property_type: form.propertyType || form.customerType || null,
        service_category: SERVICE_KEYS[form.service] ?? form.service,
        comments: form.message || null,
        gdpr_consent: form.consent,
        attached_files: uploadedFiles.length > 0 ? uploadedFiles : null,
      },
    });
    setSubmitting(false);
    if (error) {
      console.error('Lead insert error:', error);
      setFormError(`Σφάλμα καταχώρησης: ${error.message || 'Παρακαλώ δοκιμάστε ξανά.'}`);
      return;
    }

    // Auto-trigger OCR for uploaded bill files in background
    if (uploadedFiles.length > 0 && leadId) {
      for (const file of uploadedFiles) {
        supabase.functions.invoke('billing-ocr', {
          body: { lead_id: leadId, file_url: file.path, file_type: file.type },
        }).then(() => {}).catch(() => {});
      }
    }

    if (fileWarning) {
      setFormError(fileWarning);
    }
    setSubmitted(true);
    setForm({ firstName: '', lastName: '', email: '', phone: '', region: '', customerType: '', propertyType: '', service: 'Ρεύμα', message: '', billFiles: [], consent: false });
  };

  return (
    <div className="app-shell" ref={rootRef}>
      <div className="scroll-progress"><div className="scroll-progress-fill" ref={pageProgressRef} /></div>

      <header className="site-header" ref={headerRef}>
        <div className="container nav-wrap">
          <a href="#top" className="brand">
            <svg viewBox="0 0 100 100" style={{ width: 34, height: 34 }} xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="brandGradientHeader" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0EA5E9" />
                  <stop offset="100%" stopColor="#0B2545" />
                </linearGradient>
                <filter id="subtleShadowHeader" x="-10%" y="-10%" width="120%" height="120%">
                  <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0B2545" floodOpacity="0.25"/>
                </filter>
              </defs>
              <circle cx="50" cy="50" r="43" fill="none" stroke="url(#brandGradientHeader)" strokeWidth="4.5" filter="url(#subtleShadowHeader)" />
              <circle cx="50" cy="50" r="35" fill="none" stroke="url(#brandGradientHeader)" strokeWidth="1.5" opacity="0.5" />
              <path d="M 54 15 L 28 50 L 48 50 L 36 85 L 75 42 L 53 42 Z" fill="url(#brandGradientHeader)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" filter="url(#subtleShadowHeader)" />
            </svg>
            <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #0B2545, #0EA5E9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Hlektrismos.gr</span>
          </a>
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
        <section className="hero" ref={heroRef}>
          <div className="hero-bg">
            <div className="hero-bg-image" ref={heroBgRef} />
            <div className="hero-bg-overlay" />
            <div className="hero-grid-bg" />
            <div className="hero-glow-1" />
            <div className="hero-glow-2" />
            <div className="hero-particles" ref={particlesRef} aria-hidden="true">
              <HeroParticles />
            </div>
          </div>
          <div className="container hero-grid">
            <div className="hero-content" ref={heroContentRef}>
              <div className="eyebrow"><span className="eyebrow-dot" /> Εξειδικευμένοι Σύμβουλοι Ενέργειας</div>
              <h1>Ο προσωπικός σου <span className="gradient">σύμβουλος ενέργειας</span></h1>
              <p className="hero-intro">Δίπλα σου με όλες τις ενεργειακές λύσεις για το σπίτι και την επιχείρησή σου! Συγκρίνουμε και βρίσκουμε μαζί τον φθηνότερο πάροχο — δωρεάν.</p>
              <div className="hero-actions">
                <a href="#services" className="btn btn-primary">Δες τις Λύσεις <ArrowRight size={18} /></a>
                <a href="tel:+302102255000" className="btn btn-ghost"><Phone size={16} /> +30 210 22 55 000</a>
              </div>
            </div>
            <div className="hero-visual" ref={heroVisualRef}>
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
          {/* Sticky viewport: the 3D map stays pinned while info cards scroll past */}
          <div className="journey-sticky">
            <div className="journey-map-wrap" aria-hidden="true" ref={journeyMapWrapRef}>
              {journeyMapLive && (
                <GreeceMap3D activeRegion={journeyIndex} progressRef={journeyProgressRef} className="journey-canvas" />
              )}
            </div>
            <div className="journey-map-vignette" />

            <div
              className={`journey-scroll-hint${journeyIndex > 0 ? ' journey-scroll-hint-hidden' : ''}`}
              aria-hidden="true"
            >
              <span className="journey-mouse"><i /></span>
              <span>Κύλιση</span>
            </div>

            <div className="journey-intro-overlay">
              <div className="eyebrow" style={{ margin: '0 auto' }}><span className="eyebrow-dot" /> Παντού στην Ελλάδα</div>
              <h2>Η ενέργεια <span style={{ color: '#7fe8c0' }}>ταξιδεύει μαζί σου.</span></h2>
              <p>Καθώς κατεβαίνεις, γνωρίζεις τις λύσεις μας σε κάθε γωνιά της Ελλάδας — από την Αθήνα μέχρι την Κρήτη.</p>
            </div>

            <article key={activeJourney.city} className="journey-region-card">
              <span className="journey-stop-region">{activeJourney.region}</span>
              <h3>{activeJourney.title}</h3>
              <p>{activeJourney.text}</p>
              <strong>{activeJourney.city}</strong>
            </article>

            <div className="journey-hud">
              <div className="journey-progress-bar">
                <div className="track"><span className="fill" ref={journeyFillRef} /></div>
              </div>
              <div className="journey-current-label">{activeJourney.region} — {activeJourney.city}</div>
            </div>
          </div>

          <div className="container">
            <div className="journey-stops">
              {greekJourney.map((stop, index) => (
                <article
                  className={`journey-stop reveal visible${index === journeyIndex ? ' active' : ''}`}
                  key={stop.city}
                >
                  <span className="journey-stop-number">0{index + 1}</span>
                  <div><span className="journey-stop-region">{stop.region}</span><h3>{stop.title}</h3><p>{stop.text}</p><strong>{stop.city}</strong></div>
                </article>
              ))}
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
                  className={`gallery-item ${item.wide ? 'gallery-item-wide' : ''}`}
                  onClick={() => setGalleryModal(i)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="gallery-float">
                    <div
                      className="gallery-tilt"
                      onMouseMove={handleGalleryTilt}
                      onMouseLeave={resetGalleryTilt}
                    >
                      <div className="gallery-media">
                        <img src={item.image} alt={item.title} loading="lazy" />
                      </div>
                      <div className="gallery-glare" aria-hidden="true" />
                      <div className="gallery-3d-card">
                        <div className="gallery-card-inner">
                          <h3>{item.title}</h3>
                          <p>{item.subtitle}</p>
                          <span className="gallery-card-cta">Μάθε περισσότερα →</span>
                        </div>
                      </div>
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

        <section className="energy-showcase" aria-label="Ενεργειακές εγκαταστάσεις Hlektrismos">
          <div className="container">
            <figure
              className="energy-showcase-frame"
              onMouseMove={handleShowcaseTilt}
              onMouseLeave={resetShowcaseTilt}
            >
              <div className="energy-showcase-tilt">
                <div className="energy-showcase-media">
                  <img src="/images/energy8.jpg" alt="Πραγματική ενεργειακή εγκατάσταση της Hlektrismos.gr" loading="lazy" />
                </div>
                <span className="energy-showcase-glare" aria-hidden="true" />
              </div>
            </figure>
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
              <a href="#top" className="brand">
                <svg viewBox="0 0 100 100" style={{ width: 34, height: 34 }} xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="brandGradientFooter" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#0EA5E9" />
                      <stop offset="100%" stopColor="#0B2545" />
                    </linearGradient>
                    <filter id="subtleShadowFooter" x="-10%" y="-10%" width="120%" height="120%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0B2545" floodOpacity="0.25"/>
                    </filter>
                  </defs>
                  <circle cx="50" cy="50" r="43" fill="none" stroke="url(#brandGradientFooter)" strokeWidth="4.5" filter="url(#subtleShadowFooter)" />
                  <circle cx="50" cy="50" r="35" fill="none" stroke="url(#brandGradientFooter)" strokeWidth="1.5" opacity="0.5" />
                  <path d="M 54 15 L 28 50 L 48 50 L 36 85 L 75 42 L 53 42 Z" fill="url(#brandGradientFooter)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" filter="url(#subtleShadowFooter)" />
                </svg>
                <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em', background: 'linear-gradient(135deg, #0B2545, #0EA5E9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Hlektrismos.gr</span>
              </a>
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
              <a href="#/privacy">Πολιτική Απορρήτου</a>
              <span>·</span>
              <a href="#/terms">Όροι Χρήσης</a>
              <span>·</span>
              <a href="#/cookies">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
      <ChatBot />
    </div>
  );
}
