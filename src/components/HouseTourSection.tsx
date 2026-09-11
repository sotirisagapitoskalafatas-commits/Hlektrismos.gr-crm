import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * HouseTourSection — scroll-driven cinematic camera move through one home,
 * used to introduce the six services (Ρεύμα, Αέριο, Φωτοβολταϊκά,
 * Ηλεκτροκίνηση, Αποθήκευση, Εξοικονόμηση) before the Greece-wide journey.
 *
 * Same pattern as the greece-journey section above it: a pinned sticky
 * viewport, one ScrollTrigger with onUpdate writing straight to DOM nodes
 * (no per-frame React re-render), reduced-motion falls back to a static
 * frame. Drop in: src/components/HouseTourSection.tsx
 * Images: public/images/house-tour/01…12.png (see HANDOFF.md)
 */

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

const CAPTIONS: Array<{ start: number; end: number; eyebrow: string; title: string; text: string; align: 'left' | 'right' | 'center' }> = [
  { start: 0, end: 0.07, align: 'left', eyebrow: 'Ένα σπίτι, όλες οι λύσεις', title: 'Η ενέργεια ζει σε κάθε γωνιά του σπιτιού σου', text: 'Ακολουθούμε τη ροή της ενέργειας από την είσοδο μέχρι την καρδιά του σπιτιού.' },
  { start: 0.32, end: 0.50, align: 'right', eyebrow: 'Έξυπνη διαχείριση', title: 'Ρεύμα & Αέριο, υπό πλήρη έλεγχο', text: 'Παρακολούθηση κατανάλωσης και αυτοπαραγωγή σε πραγματικό χρόνο, δίπλα στο έξυπνο σύστημα του σπιτιού.' },
  { start: 0.68, end: 0.85, align: 'left', eyebrow: 'Έξω, στη θέα', title: 'Αποθήκευση & Εξοικονόμηση', text: 'Η ενέργεια που παράγεις μένει δική σου — αυτονομία και μικρότερος λογαριασμός.' },
  { start: 0.90, end: 1.001, align: 'center', eyebrow: 'Φωτοβολταϊκά', title: 'Η πράσινη επόμενη μέρα', text: 'Η ενέργεια που κινεί όλο το ταξίδι — από τη στέγη σου, στον ήλιο της Μεσογείου.' },
];

export default function HouseTourSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const frameRefs = useRef<Array<HTMLDivElement | null>>([]);
  const captionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const hintRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const N = FRAMES.length;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    frameRefs.current.forEach((el, i) => {
      if (!el) return;
      el.style.opacity = i === 0 ? '1' : '0';
      el.style.visibility = i === 0 ? 'visible' : 'hidden';
    });

    if (reduce) return;

    let shown = new Set([0]);

    const ctx = gsap.context(() => {
      const trigger = ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          const p = self.progress;
          const seg = p * (N - 1);
          const base = Math.min(Math.floor(seg), N - 2);
          const frac = seg - base;
          const want = new Set([base, base + 1]);

          shown.forEach((i) => {
            if (!want.has(i)) {
              const el = frameRefs.current[i];
              if (el) { el.style.opacity = '0'; el.style.visibility = 'hidden'; }
            }
          });
          shown = want;

          ([[base, 1 - frac, 1 + 0.12 * frac], [base + 1, frac, 1.12 - 0.12 * frac]] as const).forEach(([i, op, sc]) => {
            const el = frameRefs.current[i];
            if (!el) return;
            el.style.visibility = 'visible';
            el.style.opacity = op.toFixed(3);
            el.style.transform = `scale(${sc.toFixed(4)})`;
          });

          const m = 0.03;
          captionRefs.current.forEach((el, i) => {
            if (!el) return;
            const { start, end } = CAPTIONS[i];
            let o = 0;
            if (p >= start - m && p <= end + m) {
              o = Math.max(0, Math.min((p - (start - m)) / m, (end + m - p) / m, 1));
            }
            el.style.opacity = o.toFixed(3);
            el.style.transform = `translateY(${((1 - o) * 16).toFixed(1)}px)`;
          });

          if (hintRef.current) hintRef.current.style.opacity = p > 0.04 ? '0' : '1';
        },
      });
      trigger.refresh();
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <section className="house-tour" ref={sectionRef}>
      <div className="house-tour-sticky">
        {FRAMES.map((src, i) => (
          <div className="house-tour-frame" key={src} ref={(el) => { frameRefs.current[i] = el; }}>
            <img src={src} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
          </div>
        ))}
        <div className="house-tour-vignette" />

        {CAPTIONS.map((c, i) => (
          <div
            className={`house-tour-caption house-tour-caption-${c.align}`}
            key={c.title}
            ref={(el) => { captionRefs.current[i] = el; }}
          >
            <span className="eyebrow"><span className="eyebrow-dot" /> {c.eyebrow}</span>
            <h3>{c.title}</h3>
            <p>{c.text}</p>
          </div>
        ))}

        <div className="house-tour-hint" ref={hintRef}>
          <span className="journey-mouse"><i /></span>
          <span>Κύλιση</span>
        </div>
      </div>
    </section>
  );
}
