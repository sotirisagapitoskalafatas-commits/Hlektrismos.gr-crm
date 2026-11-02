import { useState, useEffect, useRef, CSSProperties, FormEvent, ChangeEvent, RefObject } from 'react';
import {
  ArrowRight, Phone, Mail, MapPin, FileText, Upload, X, Lock, Camera,
  Zap, Flame, Sun, CarFront, ChevronDown, CheckCircle2, MessageSquareText, Search,
  Compass, Headset, Sparkles, LifeBuoy, Gauge, Tags, Receipt, CalendarRange, FileCheck,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { classifyUpload, MAX_FORM_FILES, prepareForUpload, PUBLIC_FORM_ACCEPT, PUBLIC_FORM_KINDS } from '@/lib/upload-files';
import { useLenis, scrollToTarget, refreshScrollLayout } from '@/hooks/useLenis';
import { COMPANY } from '@/lib/legal';
import EnergyBolt from '@/components/landing/EnergyBolt';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import WaveDivider from '@/components/public/WaveDivider';
import '@/styles/landing.css';
import { uploadDocument } from '@/lib/storage';
import { isLeadConfirmationDelivered } from '@/lib/lead-confirmation.mjs';

/* ─── Landing page content ─────────────────────────────────── */
const PHONE_HREF = `tel:${COMPANY.phone.replace(/\s+/g, '')}`;

const serviceCards = [
  { icon: Zap, title: 'Ρεύμα', desc: 'Σύγκριση διαθέσιμων προγραμμάτων ρεύματος για το σπίτι και την επιχείρηση.' },
  { icon: Flame, title: 'Φυσικό αέριο', desc: 'Καθοδήγηση στις διαθέσιμες επιλογές φυσικού αερίου και στους όρους τους.' },
  { icon: Sun, title: 'Φωτοβολταϊκά', desc: 'Λύσεις ηλιακής ενέργειας, όπου ταιριάζουν στο ακίνητο και στις ανάγκες σου.' },
  { icon: CarFront, title: 'Ηλεκτροκίνηση', desc: 'Επιλογές φόρτισης και ηλεκτρικής μετακίνησης για σπίτι και επιχείρηση.' },
];

/* What the comparison looks at: real text, not a table of prices. */
const COMPARE_ROWS = [
  { label: 'Τύπος τιμολογίου', icon: Tags }, { label: 'Χρέωση ενέργειας', icon: Zap }, { label: 'Πάγιο', icon: Receipt },
  { label: 'Διάρκεια σύμβασης', icon: CalendarRange }, { label: 'Βασικοί όροι', icon: FileCheck },
];
/* The artwork of each service, and where its icon sits on it (a share of the image's width). */
const SCENES = [{ img: 'power', w: 916, ix: '17%' }, { img: 'gas', w: 924, ix: '18.8%' }, { img: 'solar', w: 1012, ix: '13.6%' }, { img: 'ev', w: 1032, ix: '10.6%' }];

const steps = [
  { num: '01', icon: MessageSquareText, title: 'Μας λες τις ανάγκες σου', text: 'Συμπληρώνεις τη φόρμα ή μας καλείς και μας λες τι χρειάζεσαι για το σπίτι ή την επιχείρησή σου.' },
  { num: '02', icon: Search, title: 'Μελετάμε τις διαθέσιμες επιλογές', text: 'Εξετάζουμε τα διαθέσιμα προγράμματα και τους όρους τους, με βάση τις δικές σου ανάγκες.' },
  { num: '03', icon: Compass, title: 'Σε καθοδηγούμε στην κατάλληλη λύση', text: 'Σου εξηγούμε τις επιλογές με σαφήνεια και σε βοηθάμε στα επόμενα βήματα.' },
];

const benefits = [
  { icon: Sparkles, label: 'Εξατομικευμένη καθοδήγηση' },
  { icon: Headset, label: 'Απλή και κατανοητή εξυπηρέτηση' },
  { icon: LifeBuoy, label: 'Συνεχής υποστήριξη' },
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

const SUBMIT_LABEL = 'Ζήτησε να σε καλέσουμε';

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
  adult: boolean;
};

/* Reveal-on-scroll without hiding content when JS is slow or off: the hidden start state only applies once
   this hook has added `lp--motion`, and never for prefers-reduced-motion. Each element reveals once. */
function useReveal(rootRef: RefObject<HTMLElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    root.classList.add('lp--motion');
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { entry.target.classList.add('is-in'); io.unobserve(entry.target); }
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    root.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
    return () => { io.disconnect(); root.classList.remove('lp--motion'); };
  }, [rootRef]);
}

/* ─── Main landing page ─────────────────────────────────────── */
export default function LandingPage() {
  const [form, setForm] = useState<LeadForm>({
    firstName: '', lastName: '', email: '', phone: '',
    region: '', propertyType: '', service: 'Ρεύμα', message: '', billFiles: [], consent: false, adult: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [leadEmailStatus, setLeadEmailStatus] = useState<'sent' | 'failed' | 'not-provided'>('not-provided');
  const [uploadStatus, setUploadStatus] = useState('');
  const [sentFiles, setSentFiles] = useState(0);
  // Files already stored during a failed submit are not uploaded again on retry.
  const uploadedRef = useRef(new WeakMap<File, { path: string; name: string; type: string; size: number }>());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const rootRef = useRef<HTMLDivElement>(null);

  useLenis();
  // Files added to or removed from the list change the page height without a window resize.
  useEffect(() => { refreshScrollLayout(); }, [form.billFiles.length]);
  useReveal(rootRef);

  // Landed on a plain in-page anchor from another page (e.g. #/services → #about).
  // The browser can't scroll before LandingPage mounts, so do it once Lenis is up.
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash || hash.startsWith('/')) return;
    let alive = true;
    requestAnimationFrame(() => {
      if (!alive) return;
      const el = document.getElementById(hash.replace(/^#/, ''));
      if (el) scrollToTarget(el, hash === 'top');
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }, []);

  const update = (field: keyof LeadForm, value: string | boolean | File | null) => setForm((c) => ({ ...c, [field]: value }));

  const handleBillChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // Phones send HEIC photos and sometimes an empty file type: check by type OR extension,
    // keep the valid files and name the ones that were not added.
    const picked = Array.from(files);
    const errors = picked.map((f) => classifyUpload(f, PUBLIC_FORM_KINDS)).filter((c) => !c.ok).map((c) => c.error);
    const valid = picked.filter((f) => classifyUpload(f, PUBLIC_FORM_KINDS).ok);
    const room = Math.max(0, MAX_FORM_FILES - form.billFiles.length);
    const ok = valid.slice(0, room);
    if (valid.length > room) errors.push(`Έως ${MAX_FORM_FILES} αρχεία ανά αίτημα — ${valid.length - room === 1 ? 'ένα δεν προστέθηκε' : `${valid.length - room} δεν προστέθηκαν`}.`);
    setFormError(errors.join(' '));
    if (ok.length) setForm((p) => ({ ...p, billFiles: [...p.billFiles, ...ok] }));
    e.target.value = '';
  };

  const hasCamera = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

  const removeBillFile = (i: number) => setForm((p) => ({ ...p, billFiles: p.billFiles.filter((_, idx) => idx !== i) }));

  const submitLead = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    // Age gate runs BEFORE any upload or insert, so nothing from an under-18
    // attempt is stored. The database enforces the same rule (age_confirmed).
    if (!form.adult) { setFormError('Η φόρμα απευθύνεται μόνο σε ενήλικες (18+).'); return; }
    setSubmitting(true);

    // Upload first. If a file fails, stop and say which one — previously the request was sent
    // without it and the warning was hidden behind the «Ευχαριστούμε» screen.
    const uploadedFiles: Array<{ path: string; name: string; type: string; size: number }> = [];
    const failed: string[] = [];
    if (form.billFiles.length > 0) {
      for (let i = 0; i < form.billFiles.length; i++) {
        const file = form.billFiles[i];
        const done = uploadedRef.current.get(file);
        if (done) { uploadedFiles.push(done); continue; }
        setUploadStatus(`Ανέβασμα αρχείου ${i + 1} από ${form.billFiles.length}…`);
        try {
          const ready = await prepareForUpload(file);
          const { data, error: uploadError } = await uploadDocument(ready);
          if (data) { uploadedRef.current.set(file, data); uploadedFiles.push(data); }
          else failed.push(`«${file.name}»${uploadError ? ` (${uploadError})` : ''}`);
        } catch {
          failed.push(`«${file.name}»`);
        }
      }
      setUploadStatus('');
    }
    if (failed.length > 0) {
      setSubmitting(false);
      setFormError(`Δεν ανέβηκ${failed.length === 1 ? 'ε το αρχείο' : 'αν τα αρχεία'} ${failed.join(', ')}. Έλεγξε τη σύνδεσή σου και πάτησε ξανά «${SUBMIT_LABEL}», ή αφαίρεσέ ${failed.length === 1 ? 'το' : 'τα'} για να στείλεις το αίτημα χωρίς ${failed.length === 1 ? 'αυτό' : 'αυτά'}.`);
      return;
    }

    const { error } = await supabase.rpc('insert_website_lead', {
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
        age_confirmed: form.adult,
        attached_files: uploadedFiles.length > 0 ? uploadedFiles : null,
      },
    });

    if (error) {
      setSubmitting(false);
      setFormError(`Σφάλμα καταχώρησης: ${error.message || 'Παρακαλώ δοκιμάστε ξανά.'}`);
      return;
    }

    // Bill OCR (billing-ocr) is staff-only and runs from the lead view in the
    // CRM; the public form never triggers it.

    // The lead is already safely stored. Report confirmation delivery only when the
    // Edge Function explicitly confirms provider acceptance; a skipped/failed send
    // must never be described to the visitor as a delivered email.
    const leadEmail = form.email.trim().toLowerCase();
    let confirmationStatus: 'sent' | 'failed' | 'not-provided' = 'not-provided';
    if (leadEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(leadEmail)) {
      try {
        const confirmation = await supabase.functions.invoke('send-lead-confirmation', {
          body: {
            email: leadEmail,
            first_name: form.firstName.trim() || leadEmail.split('@')[0],
            service: form.service,
            source: 'website',
          },
        });
        confirmationStatus = isLeadConfirmationDelivered(confirmation) ? 'sent' : 'failed';
      } catch {
        confirmationStatus = 'failed';
      }
    }
    setLeadEmailStatus(confirmationStatus);
    setSubmitting(false);

    setSentFiles(uploadedFiles.length);
    uploadedRef.current = new WeakMap();
    setSubmitted(true);
    setForm({ firstName: '', lastName: '', email: '', phone: '', region: '', propertyType: '', service: 'Ρεύμα', message: '', billFiles: [], consent: false, adult: false });
  };

  return (
    <div className="lp" ref={rootRef}>
      {/* ── A. Compact header (shared by every public page) ── */}
      <PublicHeader current="landing" />

      <main id="top">
        {/* ── B. Cinematic hero ── */}
        <section className="lp-hero lp-wave-host" aria-labelledby="lp-hero-title">
          <img className="lp-hero__photo" src="/images/landing/hero-coast.jpg" alt="" width={1670} height={942} decoding="async" {...{ fetchpriority: 'high' }} />
          <div className="lp-hero__wash" aria-hidden="true" />
          <div className="lp-wrap lp-hero__grid">
            <div className="lp-hero__copy" data-reveal>
              <span className="lp-eyebrow">ΕΝΕΡΓΕΙΑ · ΣΥΓΚΡΙΣΗ · ΕΞΟΙΚΟΝΟΜΗΣΗ</span>
              <h1 id="lp-hero-title">Ο προσωπικός σου σύμβουλος <em>ενέργειας</em></h1>
              <p className="lp-hero__text">Συγκρίνουμε τις επιλογές σου και βρίσκουμε μαζί την ενεργειακή λύση που σου ταιριάζει.</p>
              <div className="lp-hero__ctas">
                <a href="#comparison" className="lp-btn lp-btn--primary">Βρες το πρόγραμμά σου <ArrowRight size={17} aria-hidden="true" /></a>
                <a href="#contact" className="lp-btn lp-btn--ghost">Μίλησε με σύμβουλο <Phone size={15} aria-hidden="true" /></a>
              </div>
            </div>

            <div className="lp-scene" aria-hidden="true">
              <div className="lp-scene__bolt"><EnergyBolt /></div>
              <span className="lp-chip lp-chip--a"><span className="lp-chip__icon"><Zap size={16} /></span>Ρεύμα</span>
              <span className="lp-chip lp-chip--b"><span className="lp-chip__icon"><Flame size={16} /></span>Φυσικό αέριο</span>
              <span className="lp-chip lp-chip--c"><span className="lp-chip__icon"><Sun size={16} /></span>Φωτοβολταϊκά</span>
              <span className="lp-chip lp-chip--d"><span className="lp-chip__icon"><CarFront size={16} /></span>Ηλεκτροκίνηση</span>
            </div>
          </div>
          <WaveDivider fill="#ffffff" edge="bottom" size="lg" />
        </section>

        {/* ── C. Energy & tariff comparison (illustrative: no prices, offers or results are shown) ── */}
        <section id="comparison" className="lp-compare lp-wave-host" aria-labelledby="lp-compare-title">
          <div className="lp-wrap lp-compare__grid">
            <div className="lp-compare__copy" data-reveal>
              <span className="lp-eyebrow">ΣΥΓΚΡΙΣΗ ΤΙΜΟΛΟΓΙΩΝ</span>
              <h2 id="lp-compare-title" className="lp-h2">Η ενέργεια που σου ταιριάζει.</h2>
              <p className="lp-lead">Συγκρίνουμε τις επιλογές και τα διαθέσιμα προγράμματα, για να βρεις τη λύση που ανταποκρίνεται στις ανάγκες σου.</p>
              <a href="#contact" className="lp-btn lp-btn--primary">Ζήτησε εξατομικευμένη πρόταση <ArrowRight size={17} aria-hidden="true" /></a>
            </div>

            <div className="lp-compare__art" data-reveal="2">
              <img src="/images/landing/compare-providers.webp" alt="Μετρητής ρεύματος και λογαριασμός, δίπλα σε κάρτες παρόχων ενέργειας" width={3912} height={1920} loading="lazy" decoding="async" />
            </div>
          </div>
          <div className="lp-wrap">
            <div className="lp-panel" data-reveal>
              <p className="lp-panel__title"><Gauge size={17} aria-hidden="true" />Τι συγκρίνουμε για σένα</p>
              <ul className="lp-panel__tiles">
                {COMPARE_ROWS.map(({ label, icon: Icon }) => (
                  <li key={label} className="lp-tile"><span className="lp-tile__icon" aria-hidden="true"><Icon size={17} /></span><b>{label}</b></li>
                ))}
              </ul>
              <p className="lp-panel__note">Ενδεικτική απεικόνιση. Τιμές και όροι δίνονται στην εξατομικευμένη πρότασή σου.</p>
            </div>
          </div>
          <WaveDivider fill="#f6f9fc" edge="bottom" size="sm" accent="#9fd8f6" />
        </section>

        {/* ── E. How it works ── */}
        <section id="how-it-works" className="lp-process lp-wave-host" aria-labelledby="lp-process-title">
          <WaveDivider fill="#f6f9fc" edge="top" size="md" />
          <img className="lp-process__photo" src="/images/landing/process-terrace.jpg" alt="" width={1200} height={677} loading="lazy" decoding="async" />
          <div className="lp-process__glow" aria-hidden="true" />
          <div className="lp-wrap lp-process__grid">
            <div data-reveal>
              <span className="lp-eyebrow lp-eyebrow--light">ΠΩΣ ΛΕΙΤΟΥΡΓΕΙ</span>
              <h2 id="lp-process-title" className="lp-h2">Απλά. Προσωπικά. Χωρίς περιττή πολυπλοκότητα.</h2>
              <p className="lp-lead">Τρία ξεκάθαρα βήματα, με τον προσωπικό σου σύμβουλο δίπλα σου σε καθένα από αυτά.</p>
            </div>
            <ol className="lp-steps">
              {steps.map((s, i) => {
                const Icon = s.icon;
                return (
                  <li key={s.num} className="lp-step" data-reveal={String(i + 1)}>
                    <div className="lp-step__top">
                      <span className="lp-step__num" aria-hidden="true">{s.num}</span>
                      <Icon className="lp-step__icon" size={30} aria-hidden="true" />
                    </div>
                    <h3><span className="lp-visually-hidden">Βήμα {i + 1}: </span>{s.title}</h3>
                    <p>{s.text}</p>
                  </li>
                );
              })}
            </ol>
          </div>
          <WaveDivider fill="#f6f9fc" edge="bottom" size="md" />
        </section>

        {/* ── D. Integrated energy solutions ── */}
        <section id="services" className="lp-services" aria-labelledby="lp-services-title">
          <div className="lp-wrap">
            <div className="lp-services__head" data-reveal>
              <div>
                <span className="lp-eyebrow">ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΛΥΣΕΙΣ</span>
                <h2 id="lp-services-title" className="lp-h2">Ολοκληρωμένες λύσεις. Ένας προσωπικός σύμβουλος.</h2>
              </div>
              <div className="lp-services__intro">
                <p>Από το σπίτι σου μέχρι την επιχείρησή σου, σε βοηθάμε να αξιοποιήσεις τις επιλογές που σου ταιριάζουν.</p>
                <a href="#/services" className="lp-link">Δες όλες τις υπηρεσίες <ArrowRight size={15} aria-hidden="true" /></a>
              </div>
            </div>

            <div className="lp-svc-list">
              {serviceCards.map((item, i) => {
                const Icon = item.icon;
                return (
                  <article key={item.title} className="lp-svc" data-reveal={String((i % 3) + 1)}>
                    <div className="lp-svc__scene" style={{ '--ix': SCENES[i].ix } as CSSProperties}>
                      <img src={`/images/landing/service-${SCENES[i].img}.webp`} alt="" width={SCENES[i].w} height={376} loading="lazy" decoding="async" />
                      <span className="lp-svc__icon" aria-hidden="true"><Icon size={24} /></span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.desc}</p>
                    <a href="#/services" className="lp-link" aria-label={`Μάθε περισσότερα για: ${item.title}`}>Μάθε περισσότερα <ArrowRight size={15} aria-hidden="true" /></a>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── F. Personal energy advisor ── */}
        <section id="advisor" className="lp-advisor lp-wave-host" aria-labelledby="lp-advisor-title">
          <WaveDivider fill="#f6f9fc" edge="top" size="sm" />
          <img className="lp-advisor__photo" src="/images/landing/advisor-band.webp" alt="Σύμβουλος ενέργειας με tablet" width={4032} height={1920} loading="lazy" decoding="async" />
          <div className="lp-wrap lp-advisor__grid">
            <div className="lp-advisor__copy" data-reveal>
              <span className="lp-eyebrow lp-eyebrow--light">Ο ΠΡΟΣΩΠΙΚΟΣ ΣΟΥ ΣΥΜΒΟΥΛΟΣ</span>
              <h2 id="lp-advisor-title" className="lp-h2">Δεν χρειάζεται να το ψάχνεις μόνος σου.</h2>
              <p className="lp-lead">Ο προσωπικός σου σύμβουλος είναι δίπλα σου για να κατανοήσεις τις επιλογές σου και να βρεις την ενεργειακή λύση που σου ταιριάζει.</p>
              <ul className="lp-benefits">
                {benefits.map((b) => { const Icon = b.icon; return <li key={b.label} className="lp-benefit"><span aria-hidden="true"><Icon size={18} /></span>{b.label}</li>; })}
              </ul>
              <a href="#contact" className="lp-btn lp-btn--light">Μίλησε με σύμβουλο <ArrowRight size={17} aria-hidden="true" /></a>
            </div>
          </div>
          <WaveDivider fill="#f8f5f0" edge="bottom" size="md" accent="#9fd8f6" />
        </section>

        {/* ── G. Contact ── */}
        <section id="contact" className="lp-contact lp-wave-host" aria-labelledby="lp-contact-title">
          <WaveDivider fill="#f8f5f0" edge="top" size="md" accent="#9fd8f6" />
          <img className="lp-contact__photo" src="/images/landing/contact-terrace.jpg" alt="" width={1400} height={790} loading="lazy" decoding="async" />
          <div className="lp-contact__wash" aria-hidden="true" />
          <div className="lp-wrap lp-contact__grid">
            <div className="lp-contact__intro" data-reveal>
              <span className="lp-eyebrow">ΕΠΙΚΟΙΝΩΝΙΑ</span>
              <h2 id="lp-contact-title" className="lp-h2">Ας βρούμε μαζί τη λύση που σου ταιριάζει.</h2>
              <p className="lp-lead">Συμπλήρωσε τα στοιχεία σου και θα επικοινωνήσουμε μαζί σου.</p>
              <ul className="lp-contact__list">
                <li><a href={PHONE_HREF}><Phone size={17} aria-hidden="true" />{COMPANY.phone}</a></li>
                <li><a href={`mailto:${COMPANY.email}`}><Mail size={17} aria-hidden="true" />{COMPANY.email}</a></li>
                <li><MapPin size={17} aria-hidden="true" /><span>{COMPANY.address}</span></li>
              </ul>
              <p className="lp-contact__privacy"><Lock size={14} aria-hidden="true" />Τα στοιχεία σου χρησιμοποιούνται μόνο για να επικοινωνήσουμε μαζί σου.</p>
            </div>

            <div className="lp-form-card" data-reveal="2">
              {submitted ? (
                <div className="lp-success" role="status">
                  <span className="lp-success__icon"><CheckCircle2 size={30} aria-hidden="true" /></span>
                  <h3>Ευχαριστούμε!</h3>
                  <p>
                    Λάβαμε το αίτημά σου{sentFiles > 0 ? ` και ${sentFiles === 1 ? '1 αρχείο' : `${sentFiles} αρχεία`}` : ''}. Ένας σύμβουλος ενέργειας θα επικοινωνήσει μαζί σου μέσα σε λίγες ώρες{leadEmailStatus === 'sent' ? ' — σου στείλαμε email επιβεβαίωσης, έλεγξε τα εισερχόμενά σου.' : leadEmailStatus === 'failed' ? ' — το αίτημα καταχωρήθηκε, αλλά δεν ήταν δυνατή η αποστολή email επιβεβαίωσης.' : '.'}
                  </p>
                </div>
              ) : (
                <form onSubmit={submitLead} aria-busy={submitting}>
                  <h3>Τα στοιχεία σου</h3>
                  <p>Τα πεδία με * είναι υποχρεωτικά.</p>
                  <div className="lp-form">
                    <div className="lp-form__row">
                      <label className="lp-field">Όνομα *
                        <input className="lp-input" required type="text" autoComplete="given-name" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} placeholder="Γιάννης" />
                      </label>
                      <label className="lp-field">Επώνυμο *
                        <input className="lp-input" required type="text" autoComplete="family-name" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} placeholder="Παπαδόπουλος" />
                      </label>
                    </div>
                    <div className="lp-form__row">
                      <label className="lp-field">Τηλέφωνο *
                        <input className="lp-input" required type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+30 690 000 0000" />
                      </label>
                      <label className="lp-field"><span>Email <small>(προαιρετικό)</small></span>
                        <input className="lp-input" type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="giannis@email.gr" />
                      </label>
                    </div>
                    <div className="lp-form__row">
                      <label className="lp-field">Τύπος ακινήτου *
                        <select className="lp-input" required value={form.propertyType} onChange={(e) => update('propertyType', e.target.value)}>
                          <option value="" disabled>Επίλεξε τύπο…</option>
                          <option>Κατοικία</option>
                          <option>Διαμέρισμα</option>
                          <option>Επιχείρηση</option>
                          <option>Κατάστημα</option>
                        </select>
                      </label>
                      <label className="lp-field"><span>Περιοχή <small>(προαιρετικό)</small></span>
                        <select className="lp-input" value={form.region} onChange={(e) => update('region', e.target.value)}>
                          <option value="">Επίλεξε περιοχή…</option>
                          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="lp-field">Υπηρεσία ενδιαφέροντος
                      <select className="lp-input" value={form.service} onChange={(e) => update('service', e.target.value)}>
                        {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>

                    <details className="lp-optional" onToggle={refreshScrollLayout}>
                      <summary>Σχόλια ή λογαριασμός ενέργειας (προαιρετικό) <ChevronDown size={16} aria-hidden="true" /></summary>
                      <div className="lp-optional__body">
                        <label className="lp-field"><span>Σχόλια <small>(προαιρετικά)</small></span>
                          <textarea className="lp-input" rows={3} value={form.message} onChange={(e) => update('message', e.target.value)} placeholder="Πες μας τις ανάγκες σου..." />
                        </label>
                        <div className="lp-field">
                          <span>Λογαριασμοί / αρχεία <small>(προαιρετικό)</small></span>
                          {form.billFiles.length > 0 && (
                            <div className="lp-files">
                              {form.billFiles.map((f, i) => (
                                <div key={i} className="lp-file">
                                  <FileText size={15} aria-hidden="true" />
                                  <span>{f.name}</span>
                                  <span>{f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))}KB` : `${(f.size / 1024 / 1024).toFixed(1)}MB`}</span>
                                  <button type="button" onClick={() => removeBillFile(i)} aria-label={`Αφαίρεση αρχείου ${f.name}`}><X size={16} aria-hidden="true" /></button>
                                </div>
                              ))}
                            </div>
                          )}
                          <input id="lead-file-input" className="lp-visually-hidden" type="file" multiple accept={PUBLIC_FORM_ACCEPT} onChange={handleBillChange} />
                          <label
                            htmlFor="lead-file-input"
                            role="button"
                            tabIndex={0}
                            className="lp-drop"
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('lead-file-input')?.click(); } }}
                          >
                            <Upload size={17} aria-hidden="true" />
                            <span>{form.billFiles.length === 0 ? 'Επίλεξε αρχεία ή φωτογραφίες — πολλά μαζί' : `Πρόσθεσε κι άλλα (${form.billFiles.length} από ${MAX_FORM_FILES})`}</span>
                            <em>PDF / φωτογραφία</em>
                          </label>
                          {hasCamera && (
                            <>
                              <input id="lead-camera-input" className="lp-visually-hidden" type="file" accept="image/*" capture="environment" onChange={handleBillChange} />
                              <label htmlFor="lead-camera-input" role="button" tabIndex={0} className="lp-drop lp-drop--camera"
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('lead-camera-input')?.click(); } }}>
                                <Camera size={17} aria-hidden="true" /> Φωτογράφισε τον λογαριασμό
                              </label>
                            </>
                          )}
                          <span className="lp-help">Μπορείς να στείλεις όλες τις σελίδες: διάλεξε πολλά αρχεία ή φωτογραφίες μαζί, ή πρόσθεσε κι άλλα μετά (έως {MAX_FORM_FILES}, 25MB το καθένα). Οι λογαριασμοί χρησιμοποιούνται μόνο για την εξατομικευμένη ενεργειακή πρότασή σου.</span>
                        </div>
                      </div>
                    </details>

                    <label className="lp-check">
                      <input required type="checkbox" checked={form.consent} onChange={(e) => update('consent', e.target.checked)} />
                      <span>Συναινώ στην επεξεργασία των δεδομένων μου για να επικοινωνήσετε μαζί μου, σύμφωνα με την <a href="#/privacy">πολιτική απορρήτου GDPR</a>. Μπορώ να αποσύρω τη συγκατάθεσή μου ανά πάσα στιγμή.</span>
                    </label>
                    <label className="lp-check">
                      <input required type="checkbox" checked={form.adult} onChange={(e) => update('adult', e.target.checked)} />
                      <span>Δηλώνω ότι είμαι ενήλικας (18 ετών και άνω).</span>
                    </label>
                    {formError && <p className="lp-error" role="alert">{formError}</p>}
                    <button type="submit" disabled={submitting} className="lp-btn lp-btn--primary">
                      {submitting ? (uploadStatus || 'Αποστολή...') : <>{SUBMIT_LABEL} <ArrowRight size={17} aria-hidden="true" /></>}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ── H. Footer (shared by every public page) ── */}
      <PublicFooter />
    </div>
  );
}
