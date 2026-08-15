import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Phone, Zap, Sun, Car, Gift, Clock, UserRound, ShieldCheck } from 'lucide-react'
import { JourneySection } from '@/components/greece/JourneySection'
import { LeadForm }        from '@/components/site/LeadForm'
import { BillUpload }      from '@/components/site/BillUpload'
import { Reveal }          from '@/components/site/Reveal'
import { StatCounter }     from '@/components/site/StatCounter'

function FlameIcon({ size=20 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>
    </svg>
  )
}

const HEADLINE = ['Ο','προσωπικός','σου','σύμβουλος','ενέργειας']

const SERVICES = [
  { Icon: Zap,      title:'Ρεύμα',         text:'Φθηνά προγράμματα ενέργειας ειδικά για σένα. Συγκρίνουμε πάροχους και βρίσκουμε την πιο αποδοτική λύση.' },
  { Icon: FlameIcon, title:'Φυσικό Αέριο', text:'Εξατομικευμένες λύσεις αερίου για το σπίτι και την επιχείρηση με τα καλύτερα τιμολογιακά πλάνα.' },
  { Icon: Sun,      title:'Φωτοβολταϊκά',  text:'Καινοτομία και βιώσιμη ανάπτυξη στον χώρο σου. Επένδυσε στην πράσινη ενέργεια με ασφάλεια.' },
  { Icon: Car,      title:'Ηλεκτροκίνηση', text:'Οδηγούμε οικολογικά, κινούμαστε ηλεκτρικά. Λύσεις φόρτισης και EV για κάθε ανάγκη.' },
]

const TRUST = [
  { Icon:Gift,      title:'100% Δωρεάν',          text:'Η υπηρεσία μας είναι εντελώς δωρεάν, χωρίς κρυφές χρεώσεις.' },
  { Icon:Clock,     title:'Άμεση Εξυπηρέτηση',    text:'Επικοινωνία μέσα σε λίγες ώρες με τον προσωπικό σου σύμβουλο.' },
  { Icon:UserRound, title:'Εξατομικευμένη Λύση',  text:'Πρόταση φτιαγμένη ειδικά για τις δικές σου ανάγκες.' },
]

export default function Home() {
  const heroRef = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target:heroRef, offset:['start start','end start'] })
  const imgY  = useTransform(scrollYProgress, [0,1], ['0%','18%'])
  const imgSc = useTransform(scrollYProgress, [0,1], [1.05,1.18])
  const cY    = useTransform(scrollYProgress, [0,1], ['0%','-16%'])
  const cO    = useTransform(scrollYProgress, [0,0.75], [1,0])

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="hero">
        <div className="hero-bg">
          <motion.div className="hero-greece-img" style={{ y:imgY, scale:imgSc }} />
          <div className="hero-greece-overlay" />
          <div className="hero-grid-bg" />
          <div className="hero-glow-1" /><div className="hero-glow-2" />
        </div>

        <motion.div className="container hero-grid" style={{ y:cY, opacity:cO }}>
          <div className="hero-content">
            <motion.div className="eyebrow"
              initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.5 }}>
              <span className="eyebrow-dot" /> Εξειδικευμένοι Σύμβουλοι Ενέργειας
            </motion.div>

            <h1>
              {HEADLINE.map((w,i) => (
                <motion.span key={w}
                  initial={{ opacity:0,y:26 }}
                  animate={{ opacity:1,y:0 }}
                  transition={{ duration:0.7, delay:0.1+i*0.09, ease:[0.22,1,0.36,1] }}
                  className={i>2?'gradient':''}
                  style={{ display:'inline-block', marginRight:'0.28em' }}
                >
                  {w}
                </motion.span>
              ))}
            </h1>

            <motion.p className="hero-intro"
              initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ duration:0.6,delay:0.6 }}>
              Δίπλα σου με όλες τις ενεργειακές λύσεις για το σπίτι και την επιχείρησή σου!
              Συγκρίνουμε και βρίσκουμε μαζί τον φθηνότερο πάροχο — δωρεάν.
            </motion.p>

            <motion.div className="hero-actions"
              initial={{ opacity:0,y:14 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.6,delay:0.72 }}>
              <Link to="/services" className="btn btn-primary">Δες τις Λύσεις <ArrowRight size={18} /></Link>
              <a href="tel:+302102255000" className="btn btn-ghost"><Phone size={16} /> +30 210 22 55 000</a>
            </motion.div>
          </div>

          <div className="hero-visual">
            <div className="orbit-stage">
              <div className="orbit-ring orbit-ring-1" /><div className="orbit-ring orbit-ring-2" /><div className="orbit-ring orbit-ring-3" />
              <div className="orbit-core"><div className="orbit-core-inner" /></div>
              <div className="orbit-node" style={{ top:'calc(50% - 110px)',left:'50%' }}><Zap size={20} /></div>
              <div className="orbit-node" style={{ top:'calc(50% + 80px)', left:'calc(50% - 140px)' }}><Car size={20} /></div>
              <div className="orbit-node" style={{ top:'calc(50% + 60px)', left:'calc(50% + 130px)' }}><Sun size={20} /></div>
            </div>
          </div>
        </motion.div>

        <div className="container" style={{ position:'relative',zIndex:2 }}>
          <div className="stats-strip">
            <StatCounter value={100} suffix="%" label="Δωρεάν Υπηρεσία" />
            <StatCounter value={7}   label="Εργάσιμες για Αλλαγή" />
            <StatCounter raw="24/7"  label="Υποστήριξη" />
            <StatCounter value={12000} suffix="+" label="Ικανοποιημένοι Πελάτες" />
          </div>
        </div>
      </section>

      {/* ── 3D Journey ───────────────────────────────────────────────────── */}
      <JourneySection />

      {/* ── Trust ────────────────────────────────────────────────────────── */}
      <section className="advantages-section">
        <div className="container">
          <div className="advantages-grid">
            {TRUST.map((t,i) => (
              <Reveal key={t.title} delay={i*0.08}>
                <div className="advantage-card">
                  <div className="advantage-icon"><t.Icon size={24} /></div>
                  <h3>{t.title}</h3><p>{t.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Services preview ─────────────────────────────────────────────── */}
      <section className="section" id="services">
        <div className="container">
          <div className="section-heading">
            <Reveal><div className="eyebrow"><span className="eyebrow-dot" /> Υπηρεσίες</div></Reveal>
            <Reveal delay={0.06}><h2>Για το σπίτι και <span className="gradient-text">την επιχείρηση!</span></h2></Reveal>
          </div>
          <div className="services-grid">
            {SERVICES.map((s,i) => (
              <Reveal key={s.title} delay={i*0.07}>
                <div className="service-card">
                  <div className="service-icon"><s.Icon size={28} /></div>
                  <h3>{s.title}</h3><p>{s.text}</p>
                  <Link to="/services" className="service-link">Δες περισσότερα <ArrowRight size={14} /></Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Lead form ────────────────────────────────────────────────────── */}
      <section className="contact-section" id="contact">
        <div className="contact-glow" />
        <div className="container">
          <div className="contact-grid">
            <div className="contact-copy">
              <Reveal>
                <div className="eyebrow"><span className="eyebrow-dot" /> Ζητήστε να σας καλέσουμε!</div>
                <h2>Έτοιμος να εξοικονομήσεις <span className="gradient-text">χρήματα;</span></h2>
                <p>Συμπλήρωσε τη φόρμα και ένας εξειδικευμένος σύμβουλος θα επικοινωνήσει άμεσα — ΔΩΡΕΑΝ!</p>
              </Reveal>
              <Reveal delay={0.1} className="contact-points">
                <div className="contact-point"><Phone size={18} /> +30 210 22 55 000</div>
                <div className="contact-point"><ShieldCheck size={18} /> GDPR-first. Τα δεδομένα σου είναι ασφαλή.</div>
              </Reveal>
            </div>
            <Reveal delay={0.15}><LeadForm /></Reveal>
          </div>
        </div>
      </section>

      {/* ── Bill upload ──────────────────────────────────────────────────── */}
      <section id="bill" className="section" style={{ borderTop:'1px solid var(--border,rgba(255,255,255,0.06))' }}>
        <div className="container">
          <div className="contact-grid">
            <div className="contact-copy">
              <Reveal>
                <div className="eyebrow"><span className="eyebrow-dot" /> Ανάλυση Λογαριασμού</div>
                <h2>Στείλε μας <span className="gradient-text">τον λογαριασμό σου.</span></h2>
                <p>Ο πιο γρήγορος τρόπος να δεις πόσο πληρώνεις παραπάνω.</p>
              </Reveal>
              <Reveal delay={0.1}>
                <ul className="bill-benefit-list">
                  <li>· Ανάλυση χρεώσεων, παγίων και ρήτρας αναπροσαρμογής</li>
                  <li>· Πρόταση εξοικονόμησης σε ευρώ, όχι σε ποσοστά</li>
                  <li>· Χωρίς κόστος και χωρίς δέσμευση</li>
                </ul>
              </Reveal>
            </div>
            <Reveal delay={0.15}><BillUpload /></Reveal>
          </div>
        </div>
      </section>
    </>
  )
}
