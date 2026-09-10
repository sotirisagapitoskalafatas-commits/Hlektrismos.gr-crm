import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import {
  ArrowRight, Phone, Mail, Home, FileText, Upload, X, Menu,
  ChevronDown, Check, Lock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import ChatBot from '@/components/ChatBot';
import { useLenis } from '@/hooks/useLenis';

/* ─── 3D tilt cursor hook ─────────────────────────────────────── */
function useTilt() {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    const tiltX = (0.5 - y) * 12;
    const tiltY = (x - 0.5) * 12;
    el.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.02)`;
    el.style.boxShadow = `${-tiltY * 2}px ${tiltX * 2}px 40px rgba(0,0,0,.18), 0 0 0 1px rgba(255,255,255,.12)`;
  };
  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
    el.style.boxShadow = '0 1px 2px rgba(20,30,25,.04)';
  };
  return { ref, onMove, onLeave };
}

/* ─── Cinematic tour frames ─────────────────────────────────── */
const FRAMES = [
  '/images/house-tour/01-terrace-hero.png',
  '/images/house-tour/02-living-room-entry.png',
  '/images/house-tour/03-living-room-deep.png',
  '/images/house-tour/04-kitchen-wide.png',
  '/images/house-tour/05-panel-hallway.png',
  '/images/house-tour/06-panel-closeup.png',
  '/images/house-tour/07-kitchen-sunset.png',
  '/images/house-tour/08-terrace-acropolis.png',
  '/images/house-tour/09-terrace-lounge-a.png',
  '/images/house-tour/10-terrace-lounge-b.png',
  '/images/house-tour/11-terrace-wide.png',
  '/images/house-tour/12-rooftop-solar.png',
];

type CaptionDef = {
  eyebrow: string;
  title: string;
  text: string;
  start: number;
  end: number;
  pos: 'left' | 'right' | 'center';
  vPos: 'center' | 'bottom';
  maxW?: number;
  hero?: boolean;
};

const CAPTIONS: CaptionDef[] = [
  {
    eyebrow: 'Εξειδικευμένοι Σύμβουλοι Ενέργειας',
    title: 'Ο προσωπικός σου σύμβουλος ενέργειας',
    text: 'Δίπλα σου με όλες τις ενεργειακές λύσεις για το σπίτι και την επιχείρησή σου. Συγκρίνουμε και βρίσκουμε μαζί τον φθηνότερο πάροχο δωρεάν.',
    start: 0, end: 0.055, pos: 'left', vPos: 'center', maxW: 640, hero: true,
  },
  {
    eyebrow: 'Μπαίνουμε μέσα',
    title: 'Η ενέργεια ζει σε κάθε γωνιά του σπιτιού σου',
    text: 'Ακολουθούμε τη ροή της ενέργειας από την είσοδο μέχρι την καρδιά του σπιτιού.',
    start: 0.10, end: 0.24, pos: 'left', vPos: 'bottom', maxW: 560,
  },
  {
    eyebrow: 'Έξυπνη διαχείριση',
    title: 'Ρεύμα & Αέριο, υπό πλήρη έλεγχο',
    text: 'Παρακολούθηση κατανάλωσης, αυτοπαραγωγή και δίκτυο σε πραγματικό χρόνο, δίπλα στο έξυπνο σύστημα του σπιτιού.',
    start: 0.33, end: 0.50, pos: 'right', vPos: 'center', maxW: 420,
  },
  {
    eyebrow: 'Άνεση & θέρμανση',
    title: 'Ζεστασιά χωρίς συμβιβασμούς',
    text: 'Εξατομικευμένες λύσεις φυσικού αερίου με τα πιο αποδοτικά τιμολογιακά πλάνα.',
    start: 0.55, end: 0.66, pos: 'left', vPos: 'bottom', maxW: 520,
  },
  {
    eyebrow: 'Έξω, στη θέα',
    title: 'Αποθήκευση & εξοικονόμηση',
    text: 'Η ενέργεια που παράγεις μένει δική σου — αυτονομία, ανεξαρτησία, μικρότερος λογαριασμός.',
    start: 0.70, end: 0.86, pos: 'left', vPos: 'center', maxW: 520,
  },
  {
    eyebrow: 'Φωτοβολταϊκά',
    title: 'Η πράσινη επόμενη μέρα',
    text: 'Η ενέργεια που κινεί όλο το ταξίδι — από τη στέγη σου, στον ήλιο της Μεσογείου.',
    start: 0.90, end: 1.01, pos: 'center', vPos: 'center', maxW: 720,
  },
];

/* ─── Section content ───────────────────────────────────────── */
const features = [
  { num: '01', title: '100% Δωρεάν', text: 'Η υπηρεσία μας είναι εντελώς δωρεάν, χωρίς κρυφές χρεώσεις.' },
  { num: '02', title: 'Άμεση Εξυπηρέτηση', text: 'Επικοινωνία μέσα σε λίγες ώρες με τον προσωπικό σου σύμβουλο.' },
  { num: '03', title: 'Εξατομικευμένη Λύση', text: 'Πρόταση φτιαγμένη ειδικά για τις δικές σου ανάγκες κατανάλωσης.' },
];

const galleryCards = [
  { img: '/images/house-tour/06-panel-closeup.png', title: 'Ρεύμα', sub: 'Φθηνά Προγράμματα Ενέργειας' },
  { img: '/images/house-tour/07-kitchen-sunset.png', title: 'Αέριο', sub: 'Εξατομικευμένες Λύσεις Φυσικού Αερίου' },
  { img: '/images/house-tour/12-rooftop-solar.png', title: 'Φωτοβολταϊκά', sub: 'Καινοτομία & Βιώσιμη Ανάπτυξη' },
  { img: '/images/house-tour/01-terrace-hero.png', title: 'Ηλεκτροκίνηση', sub: 'Οδηγούμε Οικολογικά' },
  { img: '/images/house-tour/05-panel-hallway.png', title: 'Αποθήκευση Ενέργειας', sub: 'Αυτονομία & Εξοικονόμηση' },
  { img: '/images/house-tour/11-terrace-wide.png', title: 'Εξοικονόμηση Ενέργειας', sub: 'Ανάλυση & Στρατηγική' },
];

const serviceCards = [
  { num: '01', img: '/images/house-tour/06-panel-closeup.png', title: 'Ρεύμα', desc: 'Τα φθηνά προγράμματα ενέργειας ειδικά για σένα.' },
  { num: '02', img: '/images/house-tour/07-kitchen-sunset.png', title: 'Αέριο', desc: 'Εξατομικευμένες λύσεις φυσικού αερίου για το σπίτι και την επιχείρηση.' },
  { num: '03', img: '/images/house-tour/12-rooftop-solar.png', title: 'Φωτοβολταϊκά', desc: 'Καινοτομία και βιώσιμη ανάπτυξη στον χώρο σου.' },
  { num: '04', img: '/images/house-tour/01-terrace-hero.png', title: 'Ηλεκτροκίνηση', desc: 'Οδηγούμε οικολογικά, κινούμαστε ηλεκτρικά.' },
  { num: '05', img: '/images/house-tour/04-kitchen-wide.png', title: 'Αποθήκευση Ενέργειας', desc: 'Λύσεις αποθήκευσης με μπαταρίες για αυτονομία και εξοικονόμηση.' },
  { num: '06', img: '/images/house-tour/11-terrace-wide.png', title: 'Εξοικονόμηση Ενέργειας', desc: 'Ανάλυση κατανάλωσης και στρατηγικές για μείωση του λογαριασμού.' },
];

const regions = [
  'Αττική', 'Θεσσαλονίκη', 'Κεντρική Μακεδονία', 'Δυτική Μακεδονία', 'Ανατολική Μακεδονία & Θράκη',
  'Ήπειρος', 'Θεσσαλία', 'Ιόνια Νησιά', 'Δυτική Ελλάδα', 'Στερεά Ελλάδα',
  'Πελοπόννησος', 'Νησιά Αιγαίου', 'Κρήτη', 'Βόρειο Αιγαίο',
];

const serviceOptions = ['Ρεύμα', 'Αέριο', 'Φωτοβολταϊκά', 'Ηλεκτροκίνηση', 'Αποθήκευση Ενέργειας', 'Εξοικονόμηση Ενέργειας'];

const SERVICE_KEYS: Record<string, string> = {
  'Ρεύμα': 'energy',
  'Αέριο': 'gas',
  'Φωτοβολταϊκά': 'solar',
  'Ηλεκτροκίνηση': 'ev',
  'Αποθήκευση Ενέργειας': 'storage',
  'Εξοικονόμηση Ενέργειας': 'efficiency',
};

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

/* ─── Lead form types ───────────────────────────────────────── */
type LeadForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  region: string;
  propertyType: string;
  service: string;
  message: string;
  billFiles: File[];
  consent: boolean;
};

/* ─── Cinematic tour (scroll-scrubbed 12-frame sequence) ────── */
function CinematicTour() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const frameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const captionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const N = FRAMES.length;
    let cur = -1;
    let target = 0;
    let running = false;
    let raf = 0;
    const shown = new Set<number>();

    frameRefs.current.forEach((f, i) => {
      if (f) {
        f.style.visibility = i === 0 ? 'visible' : 'hidden';
        f.style.opacity = i === 0 ? '1' : '0';
      }
    });
    shown.add(0);

    const apply = (p: number) => {
      const sp = p * (N - 1);
      const base = Math.min(Math.floor(sp), N - 2);
      const frac = sp - base;

      for (const i of shown) {
        if (i !== base && i !== base + 1) {
          const f = frameRefs.current[i];
          if (f) { f.style.visibility = 'hidden'; f.style.opacity = '0'; }
          shown.delete(i);
        }
      }

      const pairs: [number, number, number][] = [
        [base, 1 - frac, 1 + 0.14 * frac],
        [base + 1, frac, 1.14 - 0.14 * frac],
      ];
      for (const [i, op, sc] of pairs) {
        if (i >= N) continue;
        const f = frameRefs.current[i];
        if (!f) continue;
        if (!shown.has(i)) { f.style.visibility = 'visible'; shown.add(i); }
        f.style.opacity = op.toFixed(3);
        f.style.transform = reduce ? 'scale(1.02)' : `scale(${sc.toFixed(4)})`;
      }

      const m = 0.028;
      captionRefs.current.forEach((c) => {
        if (!c) return;
        const s = +(c.dataset.start ?? 0);
        const e = +(c.dataset.end ?? 0);
        let o = 0;
        if (p >= s - m && p <= e + m) o = Math.max(0, Math.min((p - (s - m)) / m, ((e + m) - p) / m, 1));
        c.style.opacity = o.toFixed(3);
        c.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
      });

      if (hintRef.current) hintRef.current.style.opacity = p > 0.04 ? '0' : '1';
    };

    const readTarget = () => {
      const total = section.offsetHeight - window.innerHeight;
      const scrolled = Math.min(Math.max(window.scrollY - section.offsetTop, 0), total);
      return total > 0 ? scrolled / total : 0;
    };

    const ease = reduce ? 1 : 0.09;

    const tick = () => {
      target = readTarget();
      if (cur < 0) cur = target;
      cur += (target - cur) * ease;
      if (Math.abs(target - cur) < 0.0004) {
        cur = target; apply(cur); running = false; return;
      }
      apply(cur);
      raf = requestAnimationFrame(tick);
    };

    const kick = () => { if (!running) { running = true; raf = requestAnimationFrame(tick); } };

    apply(readTarget());
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);
    kick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', kick);
      window.removeEventListener('resize', kick);
    };
  }, []);

  const capStyle = (c: CaptionDef): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'absolute',
      maxWidth: c.maxW ?? 560,
      opacity: 0,
      padding: 'clamp(24px,3vw,40px)',
      borderRadius: 22,
      background: 'rgba(6,11,16,0.5)',
      border: '1px solid rgba(255,255,255,0.12)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      boxShadow: '0 24px 60px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)',
      color: '#eef4f7',
    };
    if (c.pos === 'right') {
      base.right = 'clamp(20px,5vw,70px)';
      base.textAlign = 'right';
    } else if (c.pos === 'center') {
      base.left = '50%';
      base.textAlign = 'center';
    } else {
      base.left = 'clamp(20px,5vw,70px)';
    }
    if (c.vPos === 'bottom') {
      base.bottom = 'clamp(60px,12vh,120px)';
    } else {
      base.top = '50%';
      base.transform = c.pos === 'center' ? 'translate(-50%,-50%)' : 'translateY(-50%)';
    }
    return base;
  };

  const seeSolutions = () => {
    const s = sectionRef.current;
    if (s) window.scrollTo({ top: s.offsetTop + s.offsetHeight - window.innerHeight + 2, behavior: 'smooth' });
  };

  return (
    <section ref={sectionRef} data-cine-section style={{ position: 'relative', width: '100%', height: '1180vh' }}>
      <div style={{ position: 'sticky', top: 0, height: '100vh', width: '100%', overflow: 'hidden', background: '#05080b' }}>
        {FRAMES.map((src, i) => (
          <div
            key={i}
            ref={(el) => { frameRefs.current[i] = el; }}
            style={{ position: 'absolute', inset: 0, opacity: i === 0 ? 1 : 0, transform: 'scale(1.06)', willChange: 'transform,opacity' }}
          >
            {i === 0
              ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} fetchPriority="high" />
              : <img src={src} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            }
          </div>
        ))}

        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(5,8,11,.72) 0%,rgba(5,8,11,.28) 42%,rgba(5,8,11,0) 68%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(0deg,rgba(5,8,11,.55) 0%,rgba(5,8,11,0) 32%)', pointerEvents: 'none' }} />

        {CAPTIONS.map((c, i) => (
          <div
            key={i}
            ref={(el) => { captionRefs.current[i] = el; }}
            data-start={c.start}
            data-end={c.end}
            style={capStyle(c)}
          >
            {c.hero && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.08)', fontSize: 12.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: '#fff' }}>
                {c.eyebrow}
              </span>
            )}
            {!c.hero && (
              <span style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: '.18em', textTransform: 'uppercase' as const, color: '#fff' }}>
                {c.eyebrow}
              </span>
            )}
            <h2 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: c.hero ? 800 : 700, fontSize: c.hero ? 'clamp(38px,5.4vw,74px)' : 'clamp(28px,3.6vw,48px)', lineHeight: 1.04, letterSpacing: '-.02em', marginTop: 14, textShadow: '0 4px 30px rgba(0,0,0,.55)' }}>
              {c.hero ? (
                <>{c.title.split(' σύμβουλος ')[0]} <span style={{ color: '#fff' }}>σύμβουλος ενέργειας</span></>
              ) : c.title}
            </h2>
            <p style={{ fontSize: c.hero ? 'clamp(16px,1.5vw,20px)' : 17, lineHeight: 1.55, color: '#cfdbe2', marginTop: 14, maxWidth: c.hero ? 520 : undefined, textWrap: 'pretty' as const }}>
              {c.text}
            </p>
            {c.hero && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 32 }}>
                <button onClick={seeSolutions} className="cine-cta" style={{ fontFamily: 'var(--font-body)' }}>
                  Δες τις Λύσεις <span className="arrow" style={{ fontSize: 18, lineHeight: 1 }}>→</span>
                </button>
                <a href="tel:+302102255000" className="cine-cta ghost">
                  <Phone size={16} /> +30 210 22 55 000
                </a>
              </div>
            )}
          </div>
        ))}

        <div ref={hintRef} style={{ position: 'absolute', left: '50%', bottom: 34, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, opacity: 1, transition: 'opacity .4s' }}>
          <span style={{ fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase' as const, color: '#9fb2bc' }}>Κύλιση</span>
            <div style={{ width: 24, height: 38, border: '2px solid rgba(255,255,255,.4)', borderRadius: 14, display: 'flex', justifyContent: 'center', paddingTop: 7 }}>
              <div style={{ width: 4, height: 8, borderRadius: 2, background: '#fff', animation: 'hlk-bob 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Main landing page ─────────────────────────────────────── */
export default function LandingPage() {
  const [form, setForm] = useState<LeadForm>({
    firstName: '', lastName: '', email: '', phone: '',
    region: '', propertyType: '', service: 'Ρεύμα', message: '', billFiles: [], consent: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const headerRef = useRef<HTMLElement>(null);
  const fTilts = features.map(() => useTilt());
  const gTilts = galleryCards.map(() => useTilt());
  const sTilts = serviceCards.map(() => useTilt());
  const cTilt = useTilt();

  useLenis();

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const update = (field: keyof LeadForm, value: string | boolean | File | null) => setForm((c) => ({ ...c, [field]: value }));

  const handleBillChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    const maxSize = 25 * 1024 * 1024;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!allowed.includes(file.type)) { setFormError(`Το αρχείο "${file.name}" δεν είναι αποδεκτό. Επιτρέπονται μόνο PDF, JPG, PNG.`); e.target.value = ''; return; }
      if (file.size > maxSize) { setFormError(`Το αρχείο "${file.name}" υπερβαίνει το όριο 25MB.`); e.target.value = ''; return; }
    }
    setFormError('');
    setForm((p) => ({ ...p, billFiles: [...p.billFiles, ...Array.from(files)] }));
    e.target.value = '';
  };

  const removeBillFile = (i: number) => setForm((p) => ({ ...p, billFiles: p.billFiles.filter((_, idx) => idx !== i) }));

  const submitLead = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    const uploadedFiles: Array<{ path: string; name: string; type: string; size: number }> = [];
    let fileWarning = '';
    for (const file of form.billFiles) {
      try {
        const { uploadDocument } = await import('@/lib/storage');
        const { data, error: uploadError } = await uploadDocument(file);
        if (uploadError) { fileWarning = `Σημείωση: Το αρχείο "${file.name}" δεν μεταφορτώθηκε.`; }
        else if (data) { uploadedFiles.push(data); }
      } catch { fileWarning = `Σημείωση: Το αρχείο "${file.name}" δεν μεταφορτώθηκε.`; }
    }

    const { data: leadId, error } = await supabase.rpc('insert_website_lead', {
      p_source: 'website',
      p_payload: {
        first_name: form.firstName || null,
        last_name: form.lastName || null,
        full_name: `${form.firstName} ${form.lastName}`.trim() || null,
        email: form.email || 'not-provided@hlektrismos.local',
        phone: form.phone || null,
        region: form.region || null,
        property_type: form.propertyType || null,
        service_category: SERVICE_KEYS[form.service] ?? form.service,
        comments: form.message || null,
        gdpr_consent: form.consent,
        attached_files: uploadedFiles.length > 0 ? uploadedFiles : null,
      },
    });

    setSubmitting(false);
    if (error) { setFormError(`Σφάλμα καταχώρησης: ${error.message || 'Παρακαλώ δοκιμάστε ξανά.'}`); return; }

    if (uploadedFiles.length > 0 && leadId) {
      for (const file of uploadedFiles) {
        supabase.functions.invoke('billing-ocr', { body: { lead_id: leadId, file_url: file.path, file_type: file.type } }).catch(() => {});
      }
    }

    if (fileWarning) setFormError(fileWarning);
    setSubmitted(true);
    setForm({ firstName: '', lastName: '', email: '', phone: '', region: '', propertyType: '', service: 'Ρεύμα', message: '', billFiles: [], consent: false });
  };

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="site-header" ref={headerRef}>
        <div className="container nav-wrap">
          <a href="#top" className="brand">
            <img src="/images/brand-logo.png" alt="Hlektrismos.gr" style={{ height: 60, width: 'auto', filter: 'brightness(0) invert(1)' }} />
            <span style={{ fontSize: 11, letterSpacing: '.13em', textTransform: 'uppercase' as const, color: '#b0c4cc', borderLeft: '1px solid rgba(255,255,255,.22)', paddingLeft: 10, lineHeight: 1.3, marginLeft: 10 }}>Σύμβουλοι<br />Ενέργειας</span>
          </a>
          <nav className={menuOpen ? 'main-nav open' : 'main-nav'}>
            <a href="#/services" onClick={() => setMenuOpen(false)}>Υπηρεσίες</a>
            <a href="#about" onClick={() => setMenuOpen(false)}>Ποιοι Είμαστε</a>
            <a href="#faq" onClick={() => setMenuOpen(false)}>Συχνές Ερωτήσεις</a>
            <a href="#contact" onClick={() => setMenuOpen(false)}>Επικοινωνία</a>
            <a href="#/login" onClick={() => setMenuOpen(false)} className="nav-dashboard">Σύνδεση</a>
          </nav>
          <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button>
          <a href="#contact" className="header-cta">Ζητήστε κλήση <ArrowRight size={16} /></a>
        </div>
      </header>

      <main id="top">
        {/* ── Cinematic tour ── */}
        <CinematicTour />

        {/* ── Features band ── */}
        <section style={{ padding: '56px clamp(20px,5vw,70px)', background: '#0a0f14', borderTop: '1px solid rgba(255,255,255,.06)', borderBottom: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 32 }}>
            {features.map((f, fi) => (
              <div key={f.num} ref={fTilts[fi].ref} className="tilt-card" onMouseMove={fTilts[fi].onMove} onMouseLeave={fTilts[fi].onLeave} style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: 20, borderRadius: 16, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', transition: 'transform .45s cubic-bezier(.22,1,.36,1), box-shadow .45s cubic-bezier(.22,1,.36,1)' }}>
                <span style={{ flex: 'none', width: 38, height: 38, borderRadius: 999, border: '1.5px solid rgba(255,255,255,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-cinematic)', fontWeight: 800, fontSize: 12.5, color: '#fff' }}>{f.num}</span>
                <div>
                  <h3 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 17.5, color: '#fff' }}>{f.title}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.55, color: '#b0c4cc', marginTop: 6 }}>{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Gallery ── */}
        <section style={{ padding: 'clamp(70px,9vh,120px) clamp(20px,5vw,70px)', background: '#0c1117' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase' as const, color: '#fff' }}>Gallery</span>
            <h2 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 800, fontSize: 'clamp(30px,4vw,50px)', marginTop: 14, letterSpacing: '-.02em', color: '#fff' }}>Η ενέργεια σε εικόνα</h2>
            <p style={{ fontSize: 17, color: '#b0c4cc', marginTop: 14, maxWidth: 600 }}>Ανακαλύψτε τις λύσεις μας μέσα από φωτογραφίες από πραγματικές εγκαταστάσεις.</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 18, marginTop: 44 }}>
              {galleryCards.map((g, gi) => (
                <a key={g.title} href="#services" ref={gTilts[gi].ref} className="tilt-card" onMouseMove={gTilts[gi].onMove} onMouseLeave={gTilts[gi].onLeave} style={{ position: 'relative', display: 'block', borderRadius: 16, overflow: 'hidden', aspectRatio: '4/3', textDecoration: 'none', transition: 'transform .45s cubic-bezier(.22,1,.36,1), box-shadow .45s cubic-bezier(.22,1,.36,1)' }}>
                  <img src={g.img} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform .6s ease' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(5,8,11,0) 42%,rgba(5,8,11,.92))' }} />
                  <div style={{ position: 'absolute', left: 18, right: 18, bottom: 16 }}>
                    <h4 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 19, color: '#fff' }}>{g.title}</h4>
                    <p style={{ fontSize: 13, color: '#cfdbe2', marginTop: 4 }}>{g.sub}</p>
                    <span style={{ display: 'inline-flex', marginTop: 9, fontSize: 12.5, fontWeight: 800, color: '#fff' }}>Μάθε περισσότερα →</span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* ── Services ── */}
        <section id="services" style={{ position: 'relative', padding: 'clamp(80px,11vh,150px) clamp(20px,5vw,70px) clamp(90px,12vh,160px)', background: 'radial-gradient(120% 90% at 80% 0%,rgba(255,255,255,.03),transparent 55%),radial-gradient(100% 80% at 10% 100%,rgba(255,255,255,.02),transparent 55%),#0a0f14' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ maxWidth: 720 }}>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase' as const, color: '#fff' }}>Υπηρεσίες</span>
              <h2 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 800, fontSize: 'clamp(32px,4.4vw,58px)', lineHeight: 1.04, letterSpacing: '-.02em', marginTop: 14, color: '#fff' }}>Για το σπίτι και<br />την επιχείρηση!</h2>
              <p style={{ fontSize: 'clamp(16px,1.5vw,19px)', lineHeight: 1.55, color: '#b0c4cc', marginTop: 18 }}>Ολοκληρωμένες ενεργειακές λύσεις προσαρμοσμένες στις δικές σου ανάγκες.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 22, marginTop: 'clamp(44px,6vh,72px)' }}>
              {serviceCards.map((s, si) => (
                <div key={s.num} ref={sTilts[si].ref} className="tilt-card" onMouseMove={sTilts[si].onMove} onMouseLeave={sTilts[si].onLeave}
                  style={{ position: 'relative', borderRadius: 22, overflow: 'hidden', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', transition: 'transform .45s cubic-bezier(.22,1,.36,1), box-shadow .45s cubic-bezier(.22,1,.36,1)' }}
                >
                  <div style={{ position: 'relative', height: 178, overflow: 'hidden' }}>
                    <img src={s.img} alt="" loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(7,11,15,0) 30%,rgba(7,11,15,.85))' }} />
                  </div>
                  <div style={{ padding: '26px 26px 30px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: -52, position: 'relative' }}>
                      <span style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-cinematic)', fontWeight: 800, fontSize: 15, color: '#0a0f14', background: '#fff', boxShadow: '0 8px 22px rgba(0,0,0,.3)' }}>{s.num}</span>
                    </div>
                    <h3 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 23, marginTop: 16, color: '#fff' }}>{s.title}</h3>
                    <p style={{ fontSize: 15, lineHeight: 1.55, color: '#b0c4cc', marginTop: 10 }}>{s.desc}</p>
                    <a href="#contact" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 18, fontWeight: 800, fontSize: 14.5, color: '#fff', textDecoration: 'none' }}>Δες περισσότερα →</a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── About ── */}
        <section id="about" style={{ padding: 'clamp(70px,10vh,130px) clamp(20px,5vw,70px)', background: '#0c1117' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 56, alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase' as const, color: '#fff' }}>Ποιοι Είμαστε</span>
              <h2 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 800, fontSize: 'clamp(30px,4vw,50px)', marginTop: 14, letterSpacing: '-.02em', lineHeight: 1.06, color: '#fff' }}>Ο προσωπικός σου<br />σύμβουλος ενέργειας!</h2>
              <p style={{ fontSize: 16.5, lineHeight: 1.6, color: '#b0c4cc', marginTop: 20 }}>Είμαστε μια ομάδα εξειδικευμένων ενεργειακών συμβούλων, αφοσιωμένοι στη δημιουργία αξίας και ασφάλειας για τους πελάτες μας. Στόχος μας είναι η παροχή ολοκληρωμένων ενεργειακών λύσεων που ικανοποιούν πλήρως τις ανάγκες και τις προσδοκίες σου.</p>
              <div style={{ marginTop: 26, padding: '22px 24px', borderRadius: 16, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)' }}>
                <h3 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 15.5, color: '#fff' }}>Το όραμά μας</h3>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#b0c4cc', marginTop: 8 }}>Διασφαλίζουμε ότι κάθε πελάτης έχει τον δικό του ατομικό σύμβουλο ενέργειας, που παρέχει εξατομικευμένες υπηρεσίες καθ' όλη τη διάρκεια της συνεργασίας.</p>
              </div>
            </div>
            <div style={{ position: 'relative', borderRadius: 20, overflow: 'hidden', aspectRatio: '4/3', boxShadow: '0 24px 60px rgba(20,30,25,.16)' }}>
              <img src="/images/energy1.jpg" alt="Πραγματική ενεργειακή εγκατάσταση της Hlektrismos.gr" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" style={{ padding: 'clamp(70px,10vh,130px) clamp(20px,5vw,70px)', background: '#0a0f14' }}>
          <div style={{ maxWidth: 820, margin: '0 auto' }}>
            <div style={{ textAlign: 'center' as const, marginBottom: 48 }}>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase' as const, color: '#fff' }}>Συχνές Ερωτήσεις</span>
              <h2 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 800, fontSize: 'clamp(30px,4vw,50px)', marginTop: 14, letterSpacing: '-.02em', color: '#fff' }}>Όλα όσα χρειάζεται να γνωρίζεις</h2>
              <p style={{ fontSize: 16.5, color: '#b0c4cc', marginTop: 14 }}>Όλα όσα πρέπει να ξέρεις για την αλλαγή παρόχου ενέργειας.</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {faqs.map((f, i) => (
                <details key={i} open={i === 0} style={{ padding: '20px 22px', borderRadius: 14, background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)' }}>
                  <summary onClick={(e) => { e.preventDefault(); setOpenFaq(openFaq === i ? null : i); }} style={{ cursor: 'pointer', fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 16, listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, color: '#eef4f7' }}>
                    {f.q}
                    <span style={{ flex: 'none', color: '#fff', fontSize: 19, fontWeight: 400, transform: openFaq === i ? 'rotate(45deg)' : 'none', transition: 'transform .2s' }}>+</span>
                  </summary>
                  <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#b0c4cc', marginTop: 13 }}>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── Contact ── */}
        <section id="contact" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(70px,10vh,130px) clamp(20px,5vw,70px)' }}>
          <img src="/images/house-tour/10-terrace-lounge-b.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg,rgba(5,8,11,.96) 0%,rgba(5,8,11,.86) 42%,rgba(5,8,11,.55) 100%)' }} />
          <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.15fr)', gap: 48 }}>
            <div style={{ background: 'rgba(8,13,17,.7)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 22, padding: 'clamp(24px,3vw,36px)', backdropFilter: 'blur(12px)', boxShadow: '0 24px 60px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.07)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase' as const, color: '#fff' }}>Ζητήστε να σας καλέσουμε!</span>
              <h2 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 800, fontSize: 'clamp(30px,4vw,50px)', lineHeight: 1.05, letterSpacing: '-.02em', marginTop: 14 }}>Έτοιμος να εξοικονομήσεις χρήματα;</h2>
              <p style={{ fontSize: 16.5, lineHeight: 1.6, color: '#cfdbe2', marginTop: 16, maxWidth: 440 }}>Συμπλήρωσε τη φόρμα και ένας εξειδικευμένος σύμβουλος θα επικοινωνήσει άμεσα για να σου προτείνει το κατάλληλο πρόγραμμα — ΔΩΡΕΑΝ!</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 30, fontSize: 15.5 }}>
                <a href="tel:+302102255000" className="footer-link" style={{ fontWeight: 700, color: '#eef4f7' }}><Phone size={16} style={{ marginRight: 8, verticalAlign: '-3px' }} />+30 210 22 55 000</a>
                <a href="mailto:info@hlektrismos.gr" className="footer-link" style={{ fontWeight: 700, color: '#eef4f7' }}><Mail size={16} style={{ marginRight: 8, verticalAlign: '-3px' }} />info@hlektrismos.gr</a>
                <span style={{ color: '#cfdbe2' }}><Home size={16} style={{ marginRight: 8, verticalAlign: '-3px' }} />Ζαλοκώστα 8, Αθήνα Τ.Κ. 10671</span>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 26, fontSize: 13, color: '#9fb2bc' }}><Lock size={12} /> Τα δεδομένα σου είναι ασφαλή. GDPR-compliant.</span>
            </div>

            <div ref={cTilt.ref} className="tilt-card" onMouseMove={cTilt.onMove} onMouseLeave={cTilt.onLeave} style={{ background: 'rgba(8,13,17,.82)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 22, padding: 'clamp(24px,3vw,36px)', backdropFilter: 'blur(10px)', transition: 'transform .45s cubic-bezier(.22,1,.36,1), box-shadow .45s cubic-bezier(.22,1,.36,1)' }}>
              {submitted ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' as const, justifyContent: 'center', minHeight: 360, gap: 14 }}>
                  <span style={{ width: 56, height: 56, borderRadius: 999, background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#fff' }}>✓</span>
                  <h3 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 20 }}>Ευχαριστούμε!</h3>
                  <p style={{ fontSize: 14.5, color: '#a9bcc6', maxWidth: 320 }}>Λάβαμε το αίτημά σου. Ένας σύμβουλος ενέργειας θα επικοινωνήσει μαζί σου μέσα σε λίγες ώρες.</p>
                </div>
              ) : (
                <form onSubmit={submitLead}>
                  <h3 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 20 }}>Ζητήστε να σας καλέσουμε</h3>
                  <p style={{ fontSize: 14, color: '#a9bcc6', marginTop: 6 }}>Συμπλήρωσε τη φόρμα και θα επικοινωνήσουμε άμεσα. 100% δωρεάν.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cfdbe2' }}>Όνομα
                        <input required type="text" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} placeholder="Γιάννης" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#eef4f7', fontSize: 14.5 }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cfdbe2' }}>Επώνυμο
                        <input required type="text" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} placeholder="Παπαδόπουλος" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#eef4f7', fontSize: 14.5 }} />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cfdbe2' }}>Email (προαιρετικό)
                        <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="giannis@email.gr" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#eef4f7', fontSize: 14.5 }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cfdbe2' }}>Τηλέφωνο *
                        <input required type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+30 690 000 0000" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#eef4f7', fontSize: 14.5 }} />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cfdbe2' }}>Τύπος Ακινήτου *
                        <select required value={form.propertyType} onChange={(e) => update('propertyType', e.target.value)} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#eef4f7', fontSize: 14.5 }}>
                          <option value="" disabled>Επιλέξτε τύπο...</option>
                          <option>Κατοικία</option>
                          <option>Διαμέρισμα</option>
                          <option>Επιχείρηση</option>
                          <option>Κατάστημα</option>
                        </select>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cfdbe2' }}>Περιοχή (προαιρετικό)
                        <select value={form.region} onChange={(e) => update('region', e.target.value)} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#eef4f7', fontSize: 14.5 }}>
                          <option value="">Επιλέξτε περιοχή...</option>
                          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </label>
                    </div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cfdbe2' }}>Υπηρεσία ενδιαφέροντος
                      <select value={form.service} onChange={(e) => update('service', e.target.value)} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#eef4f7', fontSize: 14.5 }}>
                        {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cfdbe2' }}>Σχόλια (προαιρετικά)
                      <textarea rows={3} value={form.message} onChange={(e) => update('message', e.target.value)} placeholder="Πες μας τις ανάγκες σου..." style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.05)', color: '#eef4f7', fontSize: 14.5, resize: 'vertical' as const, fontFamily: 'inherit' }} />
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#cfdbe2' }}>Ανέβασε λογαριασμούς / αρχεία (προαιρετικό)
                      {form.billFiles.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                          {form.billFiles.map((f, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,.06)', borderRadius: 8, fontSize: 13, color: '#cfdbe2' }}>
                              <FileText size={14} style={{ color: '#fff', flexShrink: 0 }} />
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{f.name}</span>
                              <span style={{ fontSize: 11, flexShrink: 0 }}>{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                              <button type="button" onClick={() => removeBillFile(i)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: 2, lineHeight: 1 }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={handleBillChange} style={{ padding: 10, borderRadius: 10, border: '1px dashed rgba(255,255,255,.2)', background: 'rgba(255,255,255,.03)', color: '#a9bcc6', fontSize: 13 }} />
                      <span style={{ fontSize: 12, color: '#7f939c' }}>PDF, JPG ή PNG έως 25MB το καθένα — μπορείτε να ανεβάσετε πολλαπλά. Οι λογαριασμοί χρησιμοποιούνται μόνο για την εξατομικευμένη ενεργειακή πρότασή σου.</span>
                    </label>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.5, color: '#a9bcc6' }}>
                      <input required type="checkbox" checked={form.consent} onChange={(e) => update('consent', e.target.checked)} style={{ marginTop: 3, flex: 'none' }} />
                      Συναινώ στην επεξεργασία των δεδομένων μου για να επικοινωνήσετε μαζί μου, σύμφωνα με την <a href="#/privacy" style={{ color: '#fff' }}>πολιτική απορρήτου GDPR</a>. Μπορώ να αποσύρω τη συγκατάθεσή μου ανά πάσα στιγμή.
                    </label>
                    {formError && <p style={{ color: '#f87171', fontSize: 14 }}>{formError}</p>}
                    <button type="submit" disabled={submitting} className="cine-cta" style={{ marginTop: 6, fontFamily: 'var(--font-body)', justifyContent: 'center', width: '100%' }}>
                      {submitting ? 'Αποστολή...' : 'Ζητήστε κλήση'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(56px,7vh,80px) clamp(20px,5vw,70px) 28px' }}>
        <img src="/images/footer-bg.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg,rgba(4,7,10,.94) 0%,rgba(4,7,10,.90) 55%,rgba(4,7,10,.96) 100%)' }} />
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(220px,1.4fr) repeat(3,minmax(140px,1fr))', gap: 40 }}>
          <div>
            <img src="/images/brand-logo.png" alt="Hlektrismos.gr" style={{ height: 70, width: 'auto', filter: 'brightness(0) invert(1)' }} />
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#c3d0d6', marginTop: 16, maxWidth: 280 }}>Εξειδικευμένοι Σύμβουλοι Ενέργειας. Συγκρίνουμε και βρίσκουμε μαζί τον φθηνότερο πάροχο ενέργειας για το σπίτι και την επιχείρησή σου.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 18, fontSize: 14, color: '#c3d0d6' }}>
              <span>Ζαλοκώστα 8, Αθήνα Τ.Κ. 10671</span>
              <a href="tel:+302102255000" className="footer-link">+30 210 22 55 000</a>
              <a href="mailto:info@hlektrismos.gr" className="footer-link">info@hlektrismos.gr</a>
            </div>
          </div>
          <div>
            <h4 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 14, letterSpacing: '.04em', color: '#fff' }}>Υπηρεσίες</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16, fontSize: 14, color: '#c3d0d6' }}>
              <a href="#/services" className="footer-link">Ρεύμα</a>
              <a href="#/services" className="footer-link">Αέριο</a>
              <a href="#/services" className="footer-link">Φωτοβολταϊκά</a>
              <a href="#/services" className="footer-link">Ηλεκτροκίνηση</a>
              <a href="#/services" className="footer-link">Ολοκληρωμένες Λύσεις</a>
            </div>
          </div>
          <div>
            <h4 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 14, letterSpacing: '.04em', color: '#fff' }}>Χρήσιμοι Σύνδεσμοι</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16, fontSize: 14, color: '#c3d0d6' }}>
              <a href="#/" className="footer-link">Αρχική</a>
              <a href="#about" className="footer-link">Σχετικά με εμάς</a>
              <a href="#/services" className="footer-link">Λύσεις</a>
              <a href="#faq" className="footer-link">Ενέργεια Σήμερα</a>
              <a href="#faq" className="footer-link">Συχνές Ερωτήσεις</a>
              <a href="#contact" className="footer-link">Επικοινωνία</a>
            </div>
          </div>
          <div>
            <h4 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 14, letterSpacing: '.04em', color: '#fff' }}>Ώρες Λειτουργίας</h4>
            <p style={{ fontSize: 13, color: '#9fb0b7', marginTop: 16 }}>Είμαστε εδώ για εσένα</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, fontSize: 14, color: '#c3d0d6' }}>
              <span>Δευτέρα - Παρασκευή 09:00 - 17:00</span>
              <span>Σάββατο - Κυριακή Κλειστά</span>
            </div>
          </div>
        </div>
        <div style={{ position: 'relative', maxWidth: 1200, margin: '44px auto 0', paddingTop: 24, borderTop: '1px solid rgba(255,255,255,.15)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, fontSize: 13, color: '#9fb0b7' }}>
          <span>© 2026 hlektrismos.gr. Με την επιφύλαξη παντός δικαιώματος.</span>
          <span style={{ display: 'flex', gap: 16 }}>
            <a href="#/privacy" className="footer-link" style={{ color: '#9fb0b7' }}>Πολιτική Απορρήτου</a>
            <a href="#/terms" className="footer-link" style={{ color: '#9fb0b7' }}>Όροι Χρήσης</a>
            <a href="#/cookies" className="footer-link" style={{ color: '#9fb0b7' }}>Cookies</a>
          </span>
        </div>
      </footer>

      <ChatBot />
    </div>
  );
}
