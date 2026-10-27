import { useRef } from 'react';
import { Phone } from 'lucide-react';
import CinematicSkyBackground from '@/components/CinematicSkyBackground';
import PublicHeader from '@/components/public/PublicHeader';
import PublicFooter from '@/components/public/PublicFooter';
import WaveDivider from '@/components/public/WaveDivider';

const services = [
  {
    num: '01',
    title: 'Ρεύμα',
    desc: 'Τα φθηνά προγράμματα ενέργειας ειδικά για σένα.',
    bullets: ['Σύγκριση πάνω από 15 παρόχων', 'Σταθερά ή κυμαινόμενα τιμολόγια', 'Ειδικά προγράμματα για επιχειρήσεις'],
  },
  {
    num: '02',
    title: 'Αέριο',
    desc: 'Εξατομικευμένες λύσεις φυσικού αερίου για το σπίτι και την επιχείρηση.',
    bullets: ['Σύγκριση παρόχων φυσικού αερίου', 'Λύσεις για κατοικία και βιομηχανία', 'Χωρίς διακοπή κατά την αλλαγή'],
  },
  {
    num: '03',
    title: 'Φωτοβολταϊκά',
    desc: 'Καινοτομία και βιώσιμη ανάπτυξη στον χώρο σου.',
    bullets: ['Μελέτη σκοπιμότητας δωρεάν', 'Πιστοποιημένοι εγκαταστάτες', 'Παρακολούθηση παραγωγής'],
  },
  {
    num: '04',
    title: 'Ηλεκτροκίνηση',
    desc: 'Οδηγούμε οικολογικά, κινούμαστε ηλεκτρικά.',
    bullets: ['Λύσεις φόρτισης EV', 'Εγκατάσταση wallbox', 'Υποστήριξη 24/7'],
  },
  {
    num: '05',
    title: 'Ολοκληρωμένες Λύσεις',
    desc: 'Ρεύμα, αέριο, φωτοβολταϊκά και ηλεκτροκίνηση, σχεδιασμένα να λειτουργούν μαζί, με έναν σύμβουλο για όλες τις ανάγκες σου.',
    bullets: ['Ένας σύμβουλος για όλες τις υπηρεσίες', 'Ενιαία παρακολούθηση κατανάλωσης', 'Συνδυαστικά οφέλη'],
  },
];


// Darker than the landing page's rgba(255,255,255,.04) cards: these sit over the
// photographic sky rather than a solid section, and wash out over bright clouds.
const CARD_BG = 'rgba(8,13,17,.72)';

/* Cursor-tracked 3D tilt, matching the landing page's .tilt-card treatment. */
function ServiceCard({ service }: { service: (typeof services)[number] }) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
    const tiltX = (0.5 - y) * 8;
    const tiltY = (x - 0.5) * 8;
    el.style.transform = `perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale(1.01)`;
    el.style.boxShadow = `${-tiltY * 2}px ${tiltX * 2}px 40px rgba(0,0,0,.18), 0 0 0 1px rgba(255,255,255,.12)`;
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)';
    el.style.boxShadow = 'none';
  };

  return (
    <div
      ref={ref}
      className="tilt-card"
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ display: 'flex', flexWrap: 'wrap', gap: 32, padding: 'clamp(28px,4vw,40px)', borderRadius: 22, background: CARD_BG, border: '1px solid rgba(255,255,255,.1)', backdropFilter: 'blur(10px)', transition: 'transform .45s cubic-bezier(.22,1,.36,1), box-shadow .45s cubic-bezier(.22,1,.36,1)' }}
    >
      <div style={{ flex: '1 1 340px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, fontFamily: 'var(--font-cinematic)', fontWeight: 800, fontSize: 15, color: '#0a0f14', background: '#fff', boxShadow: '0 8px 22px rgba(0,0,0,.3)' }}>{service.num}</span>
        <h2 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 26, margin: '16px 0 0', color: '#fff' }}>{service.title}</h2>
        <p style={{ fontSize: 15.5, lineHeight: 1.6, color: '#b0c4cc', margin: '10px 0 0', maxWidth: 420 }}>{service.desc}</p>
      </div>
      <ul style={{ flex: '1 1 260px', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14.5, color: '#b0c4cc', margin: 0, padding: 0 }}>
        {service.bullets.map((b) => (
          <li key={b} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: '#fff', flex: 'none' }} />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ServicesPage() {

  return (
    <>
      <CinematicSkyBackground pushScreens={1.5} mistIntensity={0.6} />
      <div style={{ position: 'relative', zIndex: 10 }}>

        <PublicHeader current="services" />

        <main>
          <section style={{ padding: 'clamp(110px,18vh,170px) clamp(20px,5vw,70px) clamp(50px,7vh,80px)', maxWidth: 900 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,.3)', background: 'rgba(255,255,255,.08)', fontSize: 12.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase' as const, color: '#fff' }}>Υπηρεσίες</span>
            <h1 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 800, fontSize: 'clamp(34px,5vw,64px)', lineHeight: 1.05, letterSpacing: '-.02em', margin: '20px 0 0', color: '#fff', textShadow: '0 4px 40px rgba(0,0,0,.5)' }}>Ενεργειακές λύσεις<br />για κάθε ανάγκη</h1>
            <p style={{ fontSize: 'clamp(16px,1.4vw,19px)', lineHeight: 1.6, color: '#b0c4cc', margin: '20px 0 0', maxWidth: 560 }}>Ρεύμα, αέριο, φωτοβολταϊκά, ηλεκτροκίνηση — και ένας σύμβουλος που τις συνδυάζει όλες για σένα.</p>
          </section>
          <WaveDivider variant="lines" accent="#36c6f4" />

          <section style={{ padding: '0 clamp(20px,5vw,70px) calc(clamp(60px,8vh,100px) + 70px)' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>

              {services.map((s) => <ServiceCard key={s.num} service={s} />)}

              <div style={{ marginTop: 24, padding: 'clamp(32px,4vw,48px)', borderRadius: 22, background: CARD_BG, border: '1px solid rgba(255,255,255,.1)', backdropFilter: 'blur(10px)', textAlign: 'center' as const }}>
                <h3 style={{ fontFamily: 'var(--font-cinematic)', fontWeight: 700, fontSize: 'clamp(22px,2.6vw,30px)', color: '#fff' }}>Δεν είσαι σίγουρος ποια λύση σου ταιριάζει;</h3>
                <p style={{ fontSize: 15.5, color: '#b0c4cc', margin: '12px 0 0' }}>Ένας εξειδικευμένος σύμβουλος ενέργειας θα σου προτείνει το κατάλληλο πρόγραμμα — δωρεάν.</p>
                <a href="tel:+302102255000" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 24, padding: '15px 30px', borderRadius: 999, border: '1px solid rgba(255,255,255,.25)', background: 'rgba(255,255,255,.1)', backdropFilter: 'blur(8px)', color: '#fff', fontFamily: 'var(--font-body)', fontWeight: 800, fontSize: 16, boxShadow: '0 8px 30px rgba(0,0,0,.25)', textDecoration: 'none' }}>
                  <Phone size={16} /> Κάλεσε μας: +30 210 22 55 000
                </a>
              </div>

            </div>
          </section>
        </main>

        <PublicFooter />

      </div>
    </>
  );
}
