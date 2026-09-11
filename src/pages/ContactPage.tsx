import { useState } from 'react';
import { Phone, Mail, MapPin, Clock, Send, Zap, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const contactCards = [
  { icon: MapPin, label: 'Διεύθυνση', value: 'Ζαλοκώστα 8, Αθήνα Τ.Κ. 10671', link: null },
  { icon: Phone, label: 'Τηλέφωνο', value: '+30 210 22 55 000', link: 'tel:+302102255000' },
  { icon: Mail, label: 'Email', value: 'info@hlektrismos.gr', link: 'mailto:info@hlektrismos.gr' },
];

const hours = [
  { day: 'Δευτέρα — Παρασκευή', time: '09:00 — 18:00' },
  { day: 'Σάββατο', time: '10:00 — 14:00' },
  { day: 'Κυριακή', time: 'Κλειστά' },
];

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    const parts = form.name.trim().split(/\s+/);
    const { error } = await supabase.rpc('insert_website_lead', {
      p_source: 'contact',
      p_payload: {
        first_name: parts[0] || null,
        last_name: parts.slice(1).join(' ') || null,
        full_name: form.name.trim() || null,
        email: form.email || null,
        phone: form.phone || null,
        comments: form.message || null,
      },
    });
    setSending(false);
    if (error) {
      console.error('Contact lead error:', error);
      setError('Σφάλμα αποστολής. Δοκιμάστε ξανά ή καλέστε μας.');
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="app-shell">
      <header className="site-header scrolled">
        <div className="container nav-wrap">
          <a href="#top" className="brand"><span className="brand-mark"><Zap size={18} fill="currentColor" /></span><span>Hlektrismos<span>.gr</span></span></a>
          <nav className="main-nav open">
            <a href="#/">Αρχική</a>
            <a href="#/about">Σχετικά</a>
            <a href="#/services">Υπηρεσίες</a>
            <a href="#/energy">Ενέργεια</a>
            <a href="#/faq">Συχνές Ερωτήσεις</a>
            <a href="#/contact">Επικοινωνία</a>
            <a href="#/login" className="nav-dashboard">Σύνδεση</a>
          </nav>
        </div>
      </header>

      <main style={{ paddingTop: 80 }}>
        <section className="section" style={{ background: 'transparent' }}>
          <div className="container">
            <div className="section-heading" style={{ textAlign: 'left', maxWidth: 800 }}>
              <div className="eyebrow"><span className="eyebrow-dot" /> Επικοινωνία</div>
              <h2 style={{ color: 'var(--text)' }}>Μίλα με <span className="gradient-text">έναν σύμβουλο</span></h2>
              <p style={{ color: 'var(--text-muted)' }}>Είμαστε εδώ για να σε βοηθήσουμε. Επικοινώνησε μαζί μας για οποιαδήποτε απορία ή ανάγκη.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, maxWidth: 900, marginBottom: 48 }}>
              {contactCards.map((card) => (
                <div key={card.label} className="advantage-card" style={{ padding: 28, borderRadius: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(0,200,120,0.1)', display: 'grid', placeItems: 'center', marginBottom: 16, color: '#00c878' }}>
                    <card.icon size={22} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>{card.label}</div>
                  {card.link ? (
                    <a href={card.link} style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>{card.value}</a>
                  ) : (
                    <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{card.value}</div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 32, maxWidth: 900 }}>
              <div className="advantage-card" style={{ padding: 32, borderRadius: 16 }}>
                <h3 style={{ margin: '0 0 24px', fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>Στείλε μας μήνυμα</h3>
                {submitted ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,200,120,0.1)', display: 'grid', placeItems: 'center', margin: '0 auto 16px', color: '#00c878' }}>
                      <Send size={24} />
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Το μήνυμά σου στάλθηκε!</div>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Θα σε επικοινωνήσουμε το συντομότερο.</div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 16 }}>
                    <input
                      type="text"
                      placeholder="Όνομα"
                      required
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, outline: 'none' }}
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      required
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, outline: 'none' }}
                    />
                    <input
                      type="tel"
                      placeholder="Τηλέφωνο"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, outline: 'none' }}
                    />
                    <textarea
                      placeholder="Μήνυμα"
                      required
                      rows={5}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical' }}
                    />
                    {error && <div style={{ fontSize: 13, color: '#e11d48', background: 'rgba(225,29,72,0.08)', border: '1px solid rgba(225,29,72,0.2)', borderRadius: 10, padding: '12px 16px' }}>{error}</div>}
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={sending}>
                      <Send size={16} /> {sending ? 'Αποστολή…' : 'Αποστολή'}
                    </button>
                  </form>
                )}
              </div>

              <div style={{ display: 'grid', gap: 24 }}>
                <div className="advantage-card" style={{ padding: 28, borderRadius: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                    <Clock size={20} style={{ color: '#00c878' }} />
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Ώρες λειτουργίας</h3>
                  </div>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {hours.map((h) => (
                      <div key={h.day} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{h.day}</span>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{h.time}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="advantage-card" style={{ padding: 28, borderRadius: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <MapPin size={20} style={{ color: '#00c878' }} />
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Τοποθεσία</h3>
                  </div>
                  <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-muted)' }}>
                    Ζαλοκώστα 8, Αθήνα Τ.Κ. 10671
                  </p>
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=Ζαλοκώστα+8+Αθήνα+10671"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-ghost"
                    style={{ border: '1px solid var(--border)', color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: 13, textDecoration: 'none' }}
                  >
                    <ExternalLink size={14} /> Δες στον χάρτη
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section style={{ padding: '60px 0', background: 'rgba(0,200,120,0.03)', borderTop: '1px solid var(--border)' }}>
          <div className="container" style={{ maxWidth: 800 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                Βρες μας στον χάρτη
              </div>
              <div style={{ height: 320, background: 'rgba(0,200,120,0.05)', display: 'grid', placeItems: 'center', position: 'relative' }}>
                <a
                  href="https://www.google.com/maps/search/?api=1&query=Ζαλοκώστα+8+Αθήνα+10671"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'var(--text-muted)', textDecoration: 'none', fontSize: 14 }}
                >
                  <MapPin size={48} style={{ color: '#00c878', opacity: 0.6 }} />
                  <span>Ζαλοκώστα 8, Αθήνα 10671</span>
                  <span style={{ fontSize: 12, color: '#00c878' }}>Ανοίξτε στο Google Maps →</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container">
          <div className="footer-bottom">
            <span>© 2026 hlektrismos.gr</span>
            <div className="footer-legal-links">
              <a href="https://hlektrismos.gr/politiki-aporritou/" target="_blank" rel="noopener noreferrer">Πολιτική Απορρήτου</a>
              <span>·</span>
              <a href="https://hlektrismos.gr/oroi-chrisis/" target="_blank" rel="noopener noreferrer">Όροι Χρήσης</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
