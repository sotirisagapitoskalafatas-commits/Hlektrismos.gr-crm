import { useRef, useState } from 'react'
import { useScroll, useMotionValueEvent, motion, AnimatePresence } from 'framer-motion'
import { GreeceMap3D, GREECE_REGIONS } from './GreeceMap3D'

const STOPS = [
  { title:'Η αφετηρία της εξοικονόμησης',
    text:'Ξεκινάμε από την παροχή σου και συγκρίνουμε άμεσα τα διαθέσιμα προγράμματα για σπίτι, γραφείο ή κατάστημα.' },
  { title:'Λύσεις για κάθε κατανάλωση',
    text:'Από μικρές κατοικίες μέχρι αγροτικές και επαγγελματικές εγκαταστάσεις, βρίσκουμε το σωστό ενεργειακό προφίλ.' },
  { title:'Η ενέργεια της ανάπτυξης',
    text:'Υποστήριξη για επιχειρήσεις και οικογένειες σε όλη τη Μακεδονία και τη Θράκη με προσωπικό σύμβουλο.' },
  { title:'Ενέργεια χωρίς σύνορα',
    text:'Εξυπηρέτηση σε κάθε νησί, με προτάσεις που λαμβάνουν υπόψη εποχικότητα, τουρισμό και πραγματική χρήση.' },
  { title:'Έξυπνη ενέργεια στα νησιά',
    text:'Προγράμματα ρεύματος, φωτοβολταϊκά και λύσεις ηλεκτροκίνησης για τις ανάγκες κάθε νησιωτικής κοινότητας.' },
  { title:'Η πράσινη επόμενη μέρα',
    text:'Σχεδιάζουμε το επόμενο βήμα με φωτοβολταϊκά, ενεργειακή αυτονομία και λύσεις για κατοικίες και τουριστικές μονάδες.' },
]

export function JourneySection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [active,   setActive]   = useState(0)
  const [progress, setProgress] = useState(0)

  const { scrollYProgress } = useScroll({
    target:  containerRef,
    offset: ['start start', 'end end'],
  })

  useMotionValueEvent(scrollYProgress, 'change', v => {
    setProgress(v)
    setActive(Math.min(5, Math.floor(v * 6)))
  })

  const stop   = STOPS[active]
  const region = GREECE_REGIONS[active]

  return (
    /* 700vh = 100vh sticky view + 600vh scroll range (6 stops × 100vh each) */
    <section ref={containerRef} className="journey-outer" id="journey">
      <div className="journey-sticky">

        {/* 3D canvas fills the sticky viewport */}
        <GreeceMap3D
          activeRegion={active}
          scrollProgress={progress}
          className="journey-canvas"
        />

        {/* Top title overlay */}
        <div className="journey-intro-overlay">
          <div className="eyebrow" style={{ margin:'0 auto' }}>
            <span className="eyebrow-dot" /> Παντού στην Ελλάδα
          </div>
          <h2>Η ενέργεια <span className="gradient-text">ταξιδεύει μαζί σου.</span></h2>
          <p>Καθώς σκρολάρεις, γνωρίζεις τις λύσεις μας σε κάθε γωνιά της Ελλάδας.</p>
        </div>

        {/* Animated info card (bottom-left) */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            className="journey-region-card"
            initial={{ opacity:0, y:18 }}
            animate={{ opacity:1, y:0  }}
            exit={{    opacity:0, y:-12 }}
            transition={{ duration:0.4, ease:'easeOut' }}
          >
            <span className="journey-region-label">{region.label}</span>
            <h3>{stop.title}</h3>
            <p>{stop.text}</p>
            <strong>{region.city}</strong>
          </motion.div>
        </AnimatePresence>

        {/* Dot navigation (right side) */}
        <div className="journey-progress-strip">
          {GREECE_REGIONS.map((r, i) => (
            <button
              key={r.id}
              className={`journey-dot${i===active?' active':''}`}
              title={r.label}
              onClick={() => {
                const el = containerRef.current
                if (!el) return
                const target = el.offsetTop + ((i+0.5)/6) * (el.offsetHeight - window.innerHeight)
                window.scrollTo({ top: target, behavior: 'smooth' })
              }}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
