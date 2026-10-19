import { useState, useEffect, useRef, FormEvent, ChangeEvent } from 'react';
import {
  ArrowRight, Phone, Mail, Home, FileText, Upload, X, Menu, Lock, Camera,
  Zap, Flame, Sun, CarFront, ChevronDown, ArrowDown, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { classifyUpload, MAX_FORM_FILES, prepareForUpload, PUBLIC_FORM_ACCEPT, PUBLIC_FORM_KINDS } from '@/lib/upload-files';
import { useLenis, scrollToTarget } from '@/hooks/useLenis';
import { useLandingMotion } from '@/hooks/useLandingMotion';
import LegalLinks from '@/components/LegalLinks';

/* ─── Landing page content ─────────────────────────────────── */
const serviceCards = [
  { icon: Zap, title: 'Ρεύμα', desc: 'Σύγκριση διαθέσιμων προγραμμάτων για το σπίτι και την επιχείρηση.' },
  { icon: Flame, title: 'Φυσικό αέριο', desc: 'Καθοδήγηση στις διαθέσιμες επιλογές αερίου.' },
  { icon: Sun, title: 'Φωτοβολταϊκά', desc: 'Λύσεις ηλιακής ενέργειας, όπου ταιριάζουν στις ανάγκες σου.' },
  { icon: CarFront, title: 'Ηλεκτροκίνηση', desc: 'Επιλογές φόρτισης και ηλεκτρικής μετακίνησης.' },
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

/* ─── Main landing page ─────────────────────────────────────── */
export default function LandingPage() {
  const [form, setForm] = useState<LeadForm>({
    firstName: '', lastName: '', email: '', phone: '',
    region: '', propertyType: '', service: 'Ρεύμα', message: '', billFiles: [], consent: false, adult: false,
  });
  const [submitted, setSubmitted] = useState(false);
  const [leadEmailSent, setLeadEmailSent] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [sentFiles, setSentFiles] = useState(0);
  // Files already stored during a failed submit are not uploaded again on retry.
  const uploadedRef = useRef(new WeakMap<File, { path: string; name: string; type: string; size: number }>());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const headerRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement | null>(null);

  useLenis();
  useLandingMotion(mainRef);

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
      const { uploadDocument } = await import('@/lib/storage');
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
      setFormError(`Δεν ανέβηκ${failed.length === 1 ? 'ε το αρχείο' : 'αν τα αρχεία'} ${failed.join(', ')}. Έλεγξε τη σύνδεσή σου και πάτησε ξανά «Ζητήστε κλήση», ή αφαίρεσέ ${failed.length === 1 ? 'το' : 'τα'} για να στείλεις το αίτημα χωρίς ${failed.length === 1 ? 'αυτό' : 'αυτά'}.`);
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

    setSubmitting(false);
    if (error) { setFormError(`Σφάλμα καταχώρησης: ${error.message || 'Παρακαλώ δοκιμάστε ξανά.'}`); return; }

    // Bill OCR (billing-ocr) is staff-only and runs from the lead view in the
    // CRM; the public form never triggers it.

    // Send a confirmation email to the lead (fire-and-forget; skipped when no email given)
    const leadEmail = form.email.trim().toLowerCase();
    if (leadEmail && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(leadEmail)) {
      setLeadEmailSent(true);
      supabase.functions.invoke('send-lead-confirmation', {
        body: {
          email: leadEmail,
          first_name: form.firstName.trim() || leadEmail.split('@')[0],
          service: form.service,
        },
      }).catch(() => {});
    }

    setSentFiles(uploadedFiles.length);
    uploadedRef.current = new WeakMap();
    setSubmitted(true);
    setForm({ firstName: '', lastName: '', email: '', phone: '', region: '', propertyType: '', service: 'Ρεύμα', message: '', billFiles: [], consent: false, adult: false });
  };

  return (
    <div className="app-shell">
      {/* ── Compact header matching the supplied design ── */}
      <header className="site-header scrolled" ref={headerRef} style={{ position: 'sticky', top: 0, zIndex: 40, background: 'rgba(248,251,255,.91)', borderBottom: '1px solid rgba(24,69,105,.08)', boxShadow: '0 4px 24px rgba(17,54,86,.06)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        <div className="container nav-wrap" style={{ height: 72, gap: 22 }}>
          <a href="#top" className="brand" style={{ color: '#14395d', gap: 8, flex: 'none', textDecoration: 'none' }}>
            <img src="/images/brand-logo.png" alt="Hlektrismos.gr" style={{ height: 40, width: 'auto', filter: 'none' }} />
          </a>
          <nav className={menuOpen ? 'main-nav open' : 'main-nav'} aria-label="Κύρια πλοήγηση" style={{ alignItems: 'center', gap: 26 }}>
            <a href="#top" onClick={() => setMenuOpen(false)} style={{ color: '#244b6e', fontSize: 12.5 }}>Αρχική</a>
            <a href="#services" onClick={() => setMenuOpen(false)} style={{ color: '#244b6e', fontSize: 12.5 }}>Υπηρεσίες</a>
            <a href="#comparison" onClick={() => setMenuOpen(false)} style={{ color: '#244b6e', fontSize: 12.5 }}>Σύγκριση τιμολογίων</a>
            <details style={{ position: 'relative', color: '#244b6e', fontSize: 12.5 }}>
              <summary style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', listStyle: 'none', padding: '8px 0' }}>Περισσότερα <ChevronDown size={13}/></summary>
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, minWidth: 190, padding: 8, borderRadius: 14, background: 'rgba(255,255,255,.98)', border: '1px solid #dce8f2', boxShadow: '0 16px 42px rgba(17,54,86,.15)', display: 'grid', gap: 2 }}>
                <a href="#how-it-works" onClick={() => setMenuOpen(false)} style={{ color: '#244b6e', padding: '10px 12px', borderRadius: 9 }}>Πώς λειτουργεί</a>
                <a href="#advisor" onClick={() => setMenuOpen(false)} style={{ color: '#244b6e', padding: '10px 12px', borderRadius: 9 }}>Ο σύμβουλός σου</a>
              </div>
            </details>
          </nav>
          <a href="tel:+302102255000" className="landing-header-phone" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#244b6e', textDecoration: 'none', fontSize: 12, fontWeight: 750, whiteSpace: 'nowrap' }}><Phone size={14}/>210 22 55 000</a>
          <button className="menu-button" aria-label={menuOpen ? 'Κλείσιμο μενού' : 'Άνοιγμα μενού'} onClick={() => setMenuOpen(!menuOpen)} style={{ color: '#14395d' }}>{menuOpen ? <X size={22}/> : <Menu size={22}/>}</button>
          <a href="#contact" className="header-cta" style={{ background: '#123e6b', border: '1px solid #123e6b', boxShadow: '0 7px 18px rgba(18,62,107,.16)', color: '#fff', fontSize: 12, padding: '11px 18px', textDecoration: 'none', whiteSpace: 'nowrap' }}>Επικοινωνία <ArrowRight size={14}/></a>
        </div>
      </header>

      <main id="top" ref={mainRef}>
        {/* ── Hero: match the supplied reference layout ── */}
        <section id="hero" aria-labelledby="hero-title" style={{ position: 'relative', isolation: 'isolate', minHeight: 'clamp(560px, 38vw, 690px)', overflow: 'hidden', background: 'linear-gradient(110deg,#f7faff 0%,#edf5fb 52%,#d8e9f7 100%)', color: '#10345b' }}>
          <img src="/images/house-tour/01-terrace-hero.png" alt="" fetchPriority="high" decoding="async" style={{ position: 'absolute', zIndex: -2, inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: '62% center' }} />
          <div aria-hidden="true" style={{ position: 'absolute', zIndex: -1, inset: 0, background: 'linear-gradient(90deg,#f7faff 0%,rgba(247,250,255,.98) 28%,rgba(247,250,255,.76) 48%,rgba(233,244,253,.28) 72%,rgba(224,239,251,.15) 100%),linear-gradient(0deg,rgba(247,250,255,.6),rgba(247,250,255,.04) 45%,rgba(247,250,255,.5))' }} />
          <div style={{ position: 'relative', maxWidth: 1280, minHeight: 'clamp(560px, 38vw, 690px)', margin: '0 auto', padding: 'clamp(64px,8vw,112px) clamp(22px,5.5vw,72px) 76px', display: 'grid', gridTemplateColumns: 'minmax(0, .92fr) minmax(0, 1.08fr)', alignItems: 'center', gap: 20 }}>
            <div data-motion="left" style={{ position: 'relative', zIndex: 3, maxWidth: 560 }}>
              <span style={{ display: 'inline-block', color: '#42719b', letterSpacing: '.22em', fontWeight: 800, fontSize: 11, textTransform: 'uppercase' }}>Ενέργεια · Σύγκριση · Εξοικονόμηση</span>
              <h1 id="hero-title" style={{ color: '#10345b', fontFamily: 'var(--font-cinematic)', fontWeight: 850, fontSize: 'clamp(38px,5.2vw,68px)', letterSpacing: '-.045em', lineHeight: 1.02, marginTop: 20, maxWidth: 600 }}>Ο προσωπικός σου σύμβουλος ενέργειας</h1>
              <p style={{ color: '#486078', fontSize: 'clamp(15px,1.5vw,18px)', lineHeight: 1.65, maxWidth: 435, marginTop: 20 }}>Συγκρίνουμε τις επιλογές σου και βρίσκουμε μαζί την ενεργειακή λύση που σου ταιριάζει.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
                <a href="#comparison" className="cine-cta" style={{ background: '#123c68', color: '#fff', boxShadow: '0 10px 26px rgba(16,60,104,.2)', textDecoration: 'none' }}>Βρες το πρόγραμμά σου <ArrowRight size={16} /></a>
                <a href="#contact" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 46, padding: '12px 20px', borderRadius: 999, border: '1px solid #9bb6cd', color: '#173e63', background: 'rgba(255,255,255,.65)', fontSize: 13, fontWeight: 750, textDecoration: 'none' }}>Μίλησε με σύμβουλο <Phone size={14} /></a>
              </div>
            </div>
            <div aria-hidden="true" className="hlk-hero-scene" style={{ position: 'relative', minHeight: 360, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div data-motion-scrub data-motion-y="-12" data-motion-rotate="0" style={{ position: 'relative', width: 'clamp(190px,24vw,320px)', aspectRatio: '3/4', filter: 'drop-shadow(0 20px 36px rgba(14,102,214,.2))' }}>
                <svg viewBox="0 0 300 420" width="100%" height="100%" style={{ overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="hlk-ref-bolt" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#dcfbff"/><stop offset="35%" stopColor="#63d4ff"/><stop offset="66%" stopColor="#187df0"/><stop offset="100%" stopColor="#0a439e"/></linearGradient>
                    <linearGradient id="hlk-ref-edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fff"/><stop offset="100%" stopColor="#78dfff" stopOpacity=".25"/></linearGradient>
                    <radialGradient id="hlk-ref-aura"><stop offset="0%" stopColor="#7cdbff" stopOpacity=".5"/><stop offset="100%" stopColor="#7cdbff" stopOpacity="0"/></radialGradient>
                  </defs>
                  <ellipse cx="150" cy="210" rx="145" ry="195" fill="url(#hlk-ref-aura)"/>
                  <ellipse cx="150" cy="210" rx="118" ry="176" fill="none" stroke="#8adfff" strokeOpacity=".6" strokeWidth="2" transform="rotate(22 150 210)"/>
                  <ellipse cx="150" cy="210" rx="134" ry="154" fill="none" stroke="#41a9ff" strokeOpacity=".35" strokeWidth="1.5" transform="rotate(-28 150 210)"/>
                  <path d="M177 20 L80 211 Q75 222 89 220 L138 210 L101 379 L233 170 Q240 159 224 161 L169 171 Z" fill="url(#hlk-ref-bolt)" stroke="url(#hlk-ref-edge)" strokeWidth="4" strokeLinejoin="round"/>
                  <path d="M176 32 L105 195 L151 186 L126 333 L214 174 L159 184 Z" fill="#c5f6ff" fillOpacity=".3"/>
                  <path d="M185 43 L121 188" stroke="#fff" strokeOpacity=".8" strokeWidth="5" strokeLinecap="round"/>
                  <path className="hlk-energy-trail" d="M60 118 C20 160 35 225 67 245 M231 94 C273 126 278 185 244 224" fill="none" stroke="#5bbfff" strokeOpacity=".8" strokeWidth="2" strokeDasharray="5 10"/>
                </svg>
              </div>
              <div className="hlk-service-float" style={{ position: 'absolute', top: '10%', left: '4%', display: 'flex', gap: 9, alignItems: 'center', padding: '11px 14px', borderRadius: 15, border: '1px solid rgba(255,255,255,.9)', background: 'rgba(255,255,255,.78)', color: '#17456f', boxShadow: '0 12px 34px rgba(31,83,126,.1)', backdropFilter: 'blur(12px)', fontSize: 12, fontWeight: 750 }}><Zap size={18} color="#2583de"/>Ρεύμα</div>
              <div className="hlk-service-float" style={{ position: 'absolute', top: '15%', right: '0%', display: 'flex', gap: 9, alignItems: 'center', padding: '11px 14px', borderRadius: 15, border: '1px solid rgba(255,255,255,.9)', background: 'rgba(255,255,255,.78)', color: '#17456f', boxShadow: '0 12px 34px rgba(31,83,126,.1)', backdropFilter: 'blur(12px)', fontSize: 12, fontWeight: 750 }}><Flame size={18} color="#2583de"/>Φυσικό αέριο</div>
              <div className="hlk-service-float" style={{ position: 'absolute', bottom: '20%', left: '0%', display: 'flex', gap: 9, alignItems: 'center', padding: '11px 14px', borderRadius: 15, border: '1px solid rgba(255,255,255,.9)', background: 'rgba(255,255,255,.78)', color: '#17456f', boxShadow: '0 12px 34px rgba(31,83,126,.1)', backdropFilter: 'blur(12px)', fontSize: 12, fontWeight: 750 }}><Sun size={18} color="#2583de"/>Φωτοβολταϊκά</div>
              <div className="hlk-service-float" style={{ position: 'absolute', bottom: '14%', right: '2%', display: 'flex', gap: 9, alignItems: 'center', padding: '11px 14px', borderRadius: 15, border: '1px solid rgba(255,255,255,.9)', background: 'rgba(255,255,255,.78)', color: '#17456f', boxShadow: '0 12px 34px rgba(31,83,126,.1)', backdropFilter: 'blur(12px)', fontSize: 12, fontWeight: 750 }}><CarFront size={18} color="#2583de"/>Ηλεκτροκίνηση</div>
            </div>
            <a href="#comparison" aria-label="Μετάβαση στη σύγκριση τιμολογίων" style={{ position: 'absolute', left: '50%', bottom: 22, transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 8, color: '#55738c', fontSize: 11, textDecoration: 'none' }}>Scroll <ArrowDown size={14}/></a>
          </div>
        </section>

        {/* ── Energy comparison ── */}
        <section id="comparison" style={{ padding: 'clamp(54px,6vw,84px) clamp(22px,5.5vw,72px)', background: '#f8fbff', color: '#10345b' }}>
          <div className="l-split is-1to1" style={{ maxWidth: 1240, margin: '0 auto' }}>
            <div data-motion="left" style={{ maxWidth: 430 }}>
              <span style={{ color: '#5686ad', letterSpacing: '.2em', fontWeight: 800, fontSize: 10.5 }}>ΣΥΓΚΡΙΣΗ ΤΙΜΟΛΟΓΙΩΝ</span>
              <h2 style={{ color: '#12395f', fontFamily: 'var(--font-cinematic)', fontSize: 'clamp(30px,3.7vw,48px)', lineHeight: 1.05, letterSpacing: '-.035em', marginTop: 14 }}>Η ενέργεια που σου ταιριάζει.</h2>
              <p style={{ color: '#62788d', fontSize: 15, lineHeight: 1.7, marginTop: 17 }}>Σύγκρινε τις διαθέσιμες επιλογές με τη βοήθεια ενός προσωπικού συμβούλου — με καθαρή εικόνα για την τιμή, το πάγιο και τους βασικούς όρους.</p>
              <a href="#contact" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 24, padding: '13px 20px', borderRadius: 999, background: '#123e6b', color: '#fff', fontSize: 12, fontWeight: 800, textDecoration: 'none', boxShadow: '0 10px 25px rgba(18,62,107,.18)' }}>Ζήτησε εξατομικευμένη πρόταση <ArrowRight size={15}/></a>
            </div>
            <div data-motion="right" style={{ position: 'relative', minHeight: 300, borderRadius: 26, overflow: 'hidden', background: 'linear-gradient(130deg,#e2effb,#f9fcff 60%,#d3e9f9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src="/images/house-tour/06-panel-closeup.png" alt="Μετρητής και λογαριασμός ενέργειας" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: .24, mixBlendMode: 'multiply' }}/>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0, width: '100%', padding: '28px 24px' }}>
                <div style={{ transform: 'rotate(-5deg) translateY(12px)', width: '30%', minWidth: 120, maxWidth: 190, minHeight: 170, padding: 16, borderRadius: 16, background: 'rgba(255,255,255,.88)', border: '1px solid #d5e5f3', boxShadow: '0 16px 38px rgba(23,70,112,.12)' }}>
                  <span style={{ color: '#4178a7', fontSize: 10, fontWeight: 800 }}>ΛΟΓΑΡΙΑΣΜΟΣ</span><div style={{ marginTop: 22, height: 7, width: '84%', borderRadius: 6, background: '#b8d8ed' }} /><div style={{ marginTop: 9, height: 7, width: '62%', borderRadius: 6, background: '#dcebf6' }} /><div style={{ marginTop: 22, display: 'flex', gap: 4, alignItems: 'end', height: 42 }}>{[16,28,22,38,30,41].map((h,i)=><span key={i} style={{ width: 9, height: h, borderRadius: 4, background: i===5?'#328cdb':'#a9cee9'}/>)}</div>
                </div>
                <div style={{ zIndex: 1, width: '34%', minWidth: 140, maxWidth: 200, minHeight: 205, padding: 18, borderRadius: 18, background: '#fff', border: '1px solid #d5e5f3', boxShadow: '0 24px 54px rgba(23,70,112,.16)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#1764a2', fontSize: 11, fontWeight: 850 }}><CheckCircle2 size={17}/>Σύγκριση επιλογών</div>
                  <div style={{ marginTop: 22, fontSize: 12, color: '#315b7c', fontWeight: 800 }}>Τιμή ενέργειας</div><div style={{ height: 7, marginTop: 7, background: '#e4f0f8', borderRadius: 8 }}/>
                  <div style={{ marginTop: 15, fontSize: 12, color: '#315b7c', fontWeight: 800 }}>Μηνιαίο πάγιο</div><div style={{ height: 7, marginTop: 7, width: '70%', background: '#e4f0f8', borderRadius: 8 }}/>
                  <div style={{ marginTop: 15, fontSize: 12, color: '#315b7c', fontWeight: 800 }}>Διάρκεια & όροι</div><div style={{ height: 7, marginTop: 7, width: '82%', background: '#e4f0f8', borderRadius: 8 }}/>
                </div>
                <div style={{ transform: 'rotate(5deg) translateY(8px)', width: '30%', minWidth: 120, maxWidth: 190, minHeight: 170, padding: 16, borderRadius: 16, background: 'rgba(255,255,255,.88)', border: '1px solid #d5e5f3', boxShadow: '0 16px 38px rgba(23,70,112,.12)' }}>
                  <span style={{ color: '#4178a7', fontSize: 10, fontWeight: 800 }}>ΠΡΟΓΡΑΜΜΑ</span><div style={{ marginTop: 22, height: 7, width: '80%', borderRadius: 6, background: '#b8d8ed' }}/><div style={{ marginTop: 9, height: 7, width: '58%', borderRadius: 6, background: '#dcebf6' }}/><div style={{ marginTop: 24, padding: '8px 4px', textAlign: 'center', background: '#eaf5ff', color: '#2269a2', borderRadius: 8, fontWeight: 800, fontSize: 10 }}>Διαθέσιμα στοιχεία</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Complete energy solutions ── */}
        <section id="services" style={{ padding: '0 0 clamp(58px,7vw,90px)', background: '#fff', color: '#10345b' }}>
          <div style={{ maxWidth: 1360, margin: '0 auto', padding: 'clamp(48px,5vw,68px) clamp(22px,5.5vw,72px) 0' }}>
            <span data-motion="left" style={{ color: '#5686ad', letterSpacing: '.2em', fontWeight: 800, fontSize: 10.5 }}>ΟΛΟΚΛΗΡΩΜΕΝΕΣ ΛΥΣΕΙΣ</span>
            <h2 data-motion="left" style={{ color: '#12395f', fontFamily: 'var(--font-cinematic)', fontSize: 'clamp(30px,3.7vw,48px)', lineHeight: 1.05, letterSpacing: '-.035em', marginTop: 12, maxWidth: 560 }}>Ολοκληρωμένες λύσεις. Ένας προσωπικός σύμβουλος.</h2>
          </div>
          <div data-motion-parallax style={{ height: 'clamp(200px,26vw,330px)', marginTop: 28, background: 'linear-gradient(90deg,rgba(245,250,255,.05),rgba(245,250,255,.03)),url(/images/house-tour/12-rooftop-solar.png) center 54%/cover no-repeat' }} aria-label="Αρχιτεκτονική κατοικία με ενεργειακές λύσεις" role="img"/>
          <div style={{ maxWidth: 1240, margin: '-30px auto 0', position: 'relative', padding: '0 clamp(22px,5.5vw,72px)', display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 0 }}>
            {serviceCards.map((item) => {
              const Icon = item.icon;
              return <article key={item.title} data-motion="up" style={{ padding: '20px clamp(12px,1.6vw,22px) 8px', background: 'rgba(255,255,255,.94)', borderTop: '1px solid #e2edf6', borderRight: '1px solid #e2edf6' }}>
                <span style={{ width: 42, height: 42, borderRadius: 999, background: '#eef7ff', color: '#247bc1', display: 'grid', placeItems: 'center' }}><Icon size={20}/></span>
                <h3 style={{ color: '#163e63', fontSize: 15, fontWeight: 850, marginTop: 14 }}>{item.title}</h3>
                <p style={{ color: '#63798d', fontSize: 12, lineHeight: 1.55, marginTop: 7 }}>{item.desc}</p>
              </article>;
            })}
          </div>
        </section>

        {/* ── How it works: one calm dark band ── */}
        <section id="how-it-works" style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(50px,6vw,76px) clamp(22px,5.5vw,72px)', background: '#103354', color: '#fff' }}>
          <img src="/images/house-tour/11-terrace-wide.png" alt="" loading="lazy" style={{ position: 'absolute', right: 0, top: 0, height: '100%', width: '42%', objectFit: 'cover', objectPosition: 'center', opacity: .22, maskImage: 'linear-gradient(90deg,transparent,#000 45%)' }}/>
          <div style={{ maxWidth: 1240, margin: '0 auto', position: 'relative' }}>
            <div className="l-split is-1to1">
              <div data-motion="left">
                <span style={{ fontSize: 10.5, color: '#a9d6f5', letterSpacing: '.2em', fontWeight: 800 }}>ΠΩΣ ΛΕΙΤΟΥΡΓΕΙ</span>
                <h2 style={{ color: '#fff', fontFamily: 'var(--font-cinematic)', fontSize: 'clamp(28px,3.6vw,44px)', lineHeight: 1.08, marginTop: 12 }}>Απλά. Προσωπικά. Χωρίς περιττή πολυπλοκότητα.</h2>
                <p style={{ color: '#c6d9e8', fontSize: 14, lineHeight: 1.7, marginTop: 15, maxWidth: 430 }}>Τρία ξεκάθαρα βήματα, με καθοδήγηση από τον προσωπικό σου σύμβουλο.</p>
              </div>
              <div data-motion-stagger="up" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 18, alignItems: 'start' }}>
                {[
                  { num: '01', title: 'Μας λες τις ανάγκες σου', text: 'Συμπληρώνεις λίγα στοιχεία ή μιλάς μαζί μας.' },
                  { num: '02', title: 'Μελετάμε τις διαθέσιμες επιλογές', text: 'Εξετάζουμε τα προγράμματα και τους όρους.' },
                  { num: '03', title: 'Σε καθοδηγούμε στη λύση', text: 'Εξηγούμε τα επόμενα βήματα με σαφήνεια.' },
                ].map((step) => <article key={step.num} data-motion-item style={{ position: 'relative', paddingTop: 8 }}>
                  <span style={{ display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: '50%', border: '1px solid #74b4df', color: '#dcf4ff', background: 'rgba(84,160,213,.12)', fontWeight: 850, fontSize: 14 }}>{step.num}</span>
                  <h3 style={{ color: '#fff', fontWeight: 800, fontSize: 13.5, lineHeight: 1.4, marginTop: 16 }}>{step.title}</h3>
                  <p style={{ color: '#b9ccdd', fontSize: 11.5, lineHeight: 1.6, marginTop: 8 }}>{step.text}</p>
                </article>)}
              </div>
            </div>
          </div>
        </section>

        {/* ── Personal advisor — warm, light consultation scene ── */}
        <section id="advisor" style={{ padding: 'clamp(54px,6vw,82px) clamp(22px,5.5vw,72px)', background: '#fff', color: '#10345b' }}>
          <div className="l-split is-1to1" style={{ maxWidth: 1240, margin: '0 auto' }}>
            <div data-motion="left" style={{ position: 'relative', minHeight: 280, borderRadius: 22, overflow: 'hidden', background: '#edf4f9' }}>
              <img src="/images/house-tour/02-living-room-entry.png" alt="Χώρος συμβουλευτικής με σύγχρονη αρχιτεκτονική" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}/>
              <div style={{ position: 'absolute', left: 18, bottom: 18, display: 'flex', alignItems: 'center', gap: 11, padding: '12px 16px', borderRadius: 15, background: 'rgba(255,255,255,.92)', boxShadow: '0 12px 34px rgba(20,60,97,.12)', color: '#16466d' }}>
                <span style={{ display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: '50%', background: '#e6f3ff', color: '#227bc2' }}><Phone size={15}/></span>
                <span style={{ fontSize: 11, fontWeight: 800 }}>Εξατομικευμένη συμβουλευτική</span>
              </div>
            </div>
            <div data-motion="right" style={{ maxWidth: 530 }}>
              <span style={{ color: '#5686ad', letterSpacing: '.2em', fontWeight: 800, fontSize: 10.5 }}>Ο ΠΡΟΣΩΠΙΚΟΣ ΣΟΥ ΣΥΜΒΟΥΛΟΣ</span>
              <h2 style={{ color: '#12395f', fontFamily: 'var(--font-cinematic)', fontSize: 'clamp(30px,3.7vw,46px)', lineHeight: 1.05, letterSpacing: '-.03em', marginTop: 14 }}>Δεν χρειάζεται να το ψάχνεις μόνος σου.</h2>
              <p style={{ color: '#62788d', fontSize: 14.5, lineHeight: 1.75, marginTop: 17 }}>Ο προσωπικός σου σύμβουλος είναι δίπλα σου για να εξηγήσει τις διαθέσιμες επιλογές, να απαντήσει στις απορίες σου και να σε βοηθήσει να αποφασίσεις με σιγουριά.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12, marginTop: 26 }}>
                {['Εξατομικευμένες προτάσεις','Καθαρή σύγκριση επιλογών','Συνεχής υποστήριξη'].map((item) => <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, color: '#335a79', fontSize: 11.5, lineHeight: 1.5 }}><CheckCircle2 size={17} style={{ flex: 'none', color: '#3383bd' }}/>{item}</div>)}
              </div>
            </div>
          </div>
        </section>

        {/* ── Contact ── */}
        <section id="contact" style={{ position: 'relative', overflow: 'hidden', zIndex: 1, padding: 'clamp(58px,6vw,84px) clamp(22px,5.5vw,72px)', background: '#eaf4fb' }}>
          <img src="/images/house-tour/01-terrace-hero.png" alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: .17 }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg,rgba(232,243,252,.70) 0%,rgba(238,247,254,.58) 100%)' }} />
          <div className="l-split" style={{ position: 'relative', maxWidth: 1200, margin: '0 auto' }}>
            <div data-motion="left" style={{ background: 'rgba(255,255,255,.88)', border: '1px solid rgba(201,220,236,.9)', borderRadius: 22, padding: 'clamp(24px,3vw,36px)', backdropFilter: 'blur(12px)', boxShadow: '0 22px 52px rgba(28,72,111,.10)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.16em', textTransform: 'uppercase' as const, color: '#5686ad' }}>Ζητήστε να σας καλέσουμε!</span>
              <h2 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 800, fontSize: 'clamp(30px,4vw,50px)', lineHeight: 1.05, letterSpacing: '-.02em', marginTop: 14, color: '#12395f' }}>Βρες την ενεργειακή λύση που σου ταιριάζει.</h2>
              <p style={{ fontSize: 16.5, lineHeight: 1.6, color: '#536b80', marginTop: 16, maxWidth: 440 }}>Συμπλήρωσε τη φόρμα και ένας σύμβουλος ενέργειας θα επικοινωνήσει μαζί σου για να εξετάσετε τις διαθέσιμες επιλογές.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 30, fontSize: 15.5 }}>
                <a href="tel:+302102255000" className="footer-link" style={{ fontWeight: 700, color: '#183f63' }}><Phone size={16} style={{ marginRight: 8, verticalAlign: '-3px' }} />+30 210 22 55 000</a>
                <a href="mailto:info@hlektrismos.gr" className="footer-link" style={{ fontWeight: 700, color: '#183f63' }}><Mail size={16} style={{ marginRight: 8, verticalAlign: '-3px' }} />info@hlektrismos.gr</a>
                <span style={{ color: '#536b80' }}><Home size={16} style={{ marginRight: 8, verticalAlign: '-3px' }} />Ζαλοκώστα 8, Αθήνα Τ.Κ. 10671</span>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 26, fontSize: 13, color: '#657d91' }}><Lock size={12} /> Τα δεδομένα σου είναι ασφαλή. GDPR-compliant.</span>
            </div>

            <div data-motion="right" style={{ background: 'rgba(255,255,255,.96)', border: '1px solid #d5e5f1', borderRadius: 22, padding: 'clamp(24px,3vw,36px)', backdropFilter: 'blur(10px)', boxShadow: '0 22px 52px rgba(28,72,111,.10)' }}>
              {submitted ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' as const, justifyContent: 'center', minHeight: 360, gap: 14 }}>
                  <span style={{ width: 56, height: 56, borderRadius: 999, background: '#e6f4ff', border: '1px solid #b7d7ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#174a75' }}>✓</span>
                  <h3 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 20, color: '#174a75' }}>Ευχαριστούμε!</h3>
                  <p style={{ fontSize: 14.5, color: '#657d91', maxWidth: 320 }}>
                    Λάβαμε το αίτημά σου{sentFiles > 0 ? ` και ${sentFiles === 1 ? '1 αρχείο' : `${sentFiles} αρχεία`}` : ''}. Ένας σύμβουλος ενέργειας θα επικοινωνήσει μαζί σου μέσα σε λίγες ώρες{leadEmailSent ? ' — μόλις σου στείλαμε και email επιβεβαίωσης, έλεγξε τα εισερχόμενά σου.' : '.'}
                  </p>
                </div>
              ) : (
                <form onSubmit={submitLead}>
                  <h3 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 20 }}>Ζητήστε να σας καλέσουμε</h3>
                  <p style={{ fontSize: 14, color: '#657d91', marginTop: 6 }}>Συμπλήρωσε τη φόρμα και θα επικοινωνήσουμε μαζί σου.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 22 }}>
                    <div className="l-form-row">
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#536b80' }}>Όνομα
                        <input required type="text" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} placeholder="Γιάννης" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #d5e3ee', background: '#f7fbff', color: '#163e63', fontSize: 14.5 }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#536b80' }}>Επώνυμο
                        <input required type="text" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} placeholder="Παπαδόπουλος" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #d5e3ee', background: '#f7fbff', color: '#183f63', fontSize: 14.5 }} />
                      </label>
                    </div>
                    <div className="l-form-row">
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#536b80' }}>Email (προαιρετικό)
                        <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="giannis@email.gr" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #d5e3ee', background: '#f7fbff', color: '#183f63', fontSize: 14.5 }} />
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#536b80' }}>Τηλέφωνο *
                        <input required type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+30 690 000 0000" style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #d5e3ee', background: '#f7fbff', color: '#183f63', fontSize: 14.5 }} />
                      </label>
                    </div>
                    <div className="l-form-row">
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#536b80' }}>Τύπος Ακινήτου *
                        <select required className="lead-select" value={form.propertyType} onChange={(e) => update('propertyType', e.target.value)} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #d5e3ee', backgroundColor: 'rgba(255,255,255,.05)', color: '#183f63', fontSize: 14.5 }}>
                          <option value="" disabled>Επιλέξτε τύπο...</option>
                          <option>Κατοικία</option>
                          <option>Διαμέρισμα</option>
                          <option>Επιχείρηση</option>
                          <option>Κατάστημα</option>
                        </select>
                      </label>
                      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#536b80' }}>Περιοχή (προαιρετικό)
                        <select className="lead-select" value={form.region} onChange={(e) => update('region', e.target.value)} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #d5e3ee', backgroundColor: 'rgba(255,255,255,.05)', color: '#183f63', fontSize: 14.5 }}>
                          <option value="">Επιλέξτε περιοχή...</option>
                          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                      </label>
                    </div>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#536b80' }}>Υπηρεσία ενδιαφέροντος
                      <select className="lead-select" value={form.service} onChange={(e) => update('service', e.target.value)} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #d5e3ee', backgroundColor: 'rgba(255,255,255,.05)', color: '#183f63', fontSize: 14.5 }}>
                        {serviceOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </label>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#536b80' }}>Σχόλια (προαιρετικά)
                      <textarea rows={3} value={form.message} onChange={(e) => update('message', e.target.value)} placeholder="Πες μας τις ανάγκες σου..." style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid #d5e3ee', background: '#f7fbff', color: '#183f63', fontSize: 14.5, resize: 'vertical' as const, fontFamily: 'inherit' }} />
                    </label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#536b80' }}>
                      <span style={{ fontSize: 13, color: '#536b80' }}>Ανέβασε λογαριασμούς / αρχεία (προαιρετικό)</span>
                      {form.billFiles.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                          {form.billFiles.map((f, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,.06)', borderRadius: 8, fontSize: 13, color: '#536b80' }}>
                              <FileText size={14} style={{ color: '#174a75', flexShrink: 0 }} />
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{f.name}</span>
                              <span style={{ fontSize: 11, flexShrink: 0 }}>{f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))}KB` : `${(f.size / 1024 / 1024).toFixed(1)}MB`}</span>
                              <button type="button" onClick={() => removeBillFile(i)} style={{ background: 'none', border: 'none', color: '#e74c3c', cursor: 'pointer', padding: 2, lineHeight: 1 }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      <input id="lead-file-input" type="file" multiple accept={PUBLIC_FORM_ACCEPT} onChange={handleBillChange} style={{ position: 'absolute', opacity: 0, width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }} />
                      <label
                        htmlFor="lead-file-input"
                        role="button"
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('lead-file-input')?.click(); } }}
                        tabIndex={0}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderRadius: 10, border: '1px dashed #b6cbdd', background: '#f7fbff', cursor: 'pointer', fontSize: 13.5, color: '#536b80', transition: 'background .2s ease, border-color .2s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#5f94bc'; e.currentTarget.style.background = '#edf6fc'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#b6cbdd'; e.currentTarget.style.background = '#f7fbff'; }}
                      >
                        <Upload size={16} style={{ color: '#174a75', flexShrink: 0 }} />
                        <span style={{ flex: 1 }}>
                          {form.billFiles.length === 0 ? 'Επίλεξε αρχεία ή φωτογραφίες — πολλά μαζί' : `Πρόσθεσε κι άλλα (${form.billFiles.length} από ${MAX_FORM_FILES})`}
                        </span>
                        <span style={{ fontSize: 12, color: '#72899d', flexShrink: 0 }}>PDF / φωτογραφία</span>
                      </label>
                      {hasCamera && (
                        <>
                          <input id="lead-camera-input" type="file" accept="image/*" capture="environment" onChange={handleBillChange} style={{ position: 'absolute', opacity: 0, width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }} />
                          <label htmlFor="lead-camera-input" role="button" tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('lead-camera-input')?.click(); } }}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 16px', borderRadius: 10, border: '1px solid #b6cbdd', background: '#edf6fc', cursor: 'pointer', fontSize: 13.5, color: '#174a75' }}>
                            <Camera size={16} aria-hidden="true" /> Φωτογράφισε τον λογαριασμό
                          </label>
                        </>
                      )}
                      <span style={{ fontSize: 12, color: '#72899d' }}>Μπορείς να στείλεις όλες τις σελίδες: διάλεξε πολλά αρχεία ή φωτογραφίες μαζί, ή πρόσθεσε κι άλλα μετά (έως {MAX_FORM_FILES}, 25MB το καθένα). Οι λογαριασμοί χρησιμοποιούνται μόνο για την εξατομικευμένη ενεργειακή πρότασή σου.</span>
                    </div>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.5, color: '#657d91' }}>
                      <input required type="checkbox" checked={form.consent} onChange={(e) => update('consent', e.target.checked)} style={{ marginTop: 3, flex: 'none' }} />
                      <span>Συναινώ στην επεξεργασία των δεδομένων μου για να επικοινωνήσετε μαζί μου, σύμφωνα με την <a href="#/privacy" style={{ color: '#174a75' }}>πολιτική απορρήτου GDPR</a>. Μπορώ να αποσύρω τη συγκατάθεσή μου ανά πάσα στιγμή.</span>
                    </label>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 12.5, lineHeight: 1.5, color: '#657d91' }}>
                      <input required type="checkbox" checked={form.adult} onChange={(e) => update('adult', e.target.checked)} style={{ marginTop: 3, flex: 'none' }} />
                      Δηλώνω ότι είμαι ενήλικας (18 ετών και άνω).
                    </label>
                    {formError && <p style={{ color: '#b42318', fontSize: 14 }}>{formError}</p>}
                    <button type="submit" disabled={submitting} className="cine-cta" style={{ marginTop: 6, fontFamily: 'var(--font-body)', justifyContent: 'center', width: '100%' }}>
                      {submitting ? (uploadStatus || 'Αποστολή...') : 'Ζητήστε κλήση'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ── Quiet navy footer, as in the reference ── */}
      <footer style={{ position: 'relative', overflow: 'hidden', padding: '46px clamp(22px,5.5vw,72px) 22px', background: '#082b4a', color: '#dbe7f0' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: .15, background: 'linear-gradient(135deg,#0d4a78,#061a30)' }} aria-hidden="true"/>
        <div style={{ position: 'relative', maxWidth: 1240, margin: '0 auto' }}>
          <div className="l-footer-grid" style={{ gridTemplateColumns: 'minmax(220px,1.4fr) repeat(3,minmax(130px,1fr))', gap: 30 }}>
            <div>
              <img src="/images/brand-logo.png" alt="Hlektrismos.gr" style={{ height: 44, width: 'auto', filter: 'brightness(0) invert(1)' }}/>
              <p style={{ fontSize: 12, lineHeight: 1.65, color: '#c1d2e0', marginTop: 12, maxWidth: 260 }}>Ο προσωπικός σου σύμβουλος ενέργειας.</p>
              <div style={{ display: 'grid', gap: 8, marginTop: 15, fontSize: 12 }}>
                <a href="tel:+302102255000" className="footer-link" style={{ color: '#e4eef6' }}>+30 210 22 55 000</a>
                <a href="mailto:info@hlektrismos.gr" className="footer-link" style={{ color: '#e4eef6' }}>info@hlektrismos.gr</a>
              </div>
            </div>
            <div>
              <h4 style={{ color: '#fff', fontSize: 12.5, fontWeight: 800 }}>Υπηρεσίες</h4>
              <div style={{ display: 'grid', gap: 9, marginTop: 13, fontSize: 12 }}>
                <a href="#services" className="footer-link" style={{ color: '#c1d2e0' }}>Ρεύμα</a>
                <a href="#services" className="footer-link" style={{ color: '#c1d2e0' }}>Φυσικό αέριο</a>
                <a href="#services" className="footer-link" style={{ color: '#c1d2e0' }}>Φωτοβολταϊκά</a>
                <a href="#services" className="footer-link" style={{ color: '#c1d2e0' }}>Ηλεκτροκίνηση</a>
              </div>
            </div>
            <div>
              <h4 style={{ color: '#fff', fontSize: 12.5, fontWeight: 800 }}>Χρήσιμοι σύνδεσμοι</h4>
              <div style={{ display: 'grid', gap: 9, marginTop: 13, fontSize: 12 }}>
                <a href="#comparison" className="footer-link" style={{ color: '#c1d2e0' }}>Σύγκριση τιμολογίων</a>
                <a href="#how-it-works" className="footer-link" style={{ color: '#c1d2e0' }}>Πώς λειτουργεί</a>
                <a href="#contact" className="footer-link" style={{ color: '#c1d2e0' }}>Επικοινωνία</a>
              </div>
            </div>
            <div>
              <h4 style={{ color: '#fff', fontSize: 12.5, fontWeight: 800 }}>Εξυπηρέτηση</h4>
              <p style={{ fontSize: 12, color: '#c1d2e0', lineHeight: 1.65, marginTop: 13 }}>Δευτέρα–Παρασκευή<br/>09:00–17:00</p>
              <p style={{ fontSize: 12, color: '#c1d2e0', marginTop: 5 }}>Σάββατο–Κυριακή: Κλειστά</p>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14, marginTop: 30, paddingTop: 17, borderTop: '1px solid rgba(255,255,255,.16)', fontSize: 11, color: '#9fb7c9' }}>
            <span>© 2026 hlektrismos.gr. Με την επιφύλαξη παντός δικαιώματος.</span><LegalLinks/>
          </div>
        </div>
      </footer>
    </div>
  );
}
