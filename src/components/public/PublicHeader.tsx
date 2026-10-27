import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Menu, Phone, X } from 'lucide-react';
import { COMPANY } from '@/lib/legal';
import '@/styles/landing.css';

/* One public header for every customer-facing page (landing, Services, About, FAQ, Contact, Energy).
   Links are plain hash links that follow the router in src/lib/router.ts:
     • `#/…`  a slash hash is a route in PAGE_HASHES (separate page)
     • `#id`  anything else keeps/returns the visitor to the landing page, which scrolls to that id on mount
   Staff login is NOT here — it lives in the footer (see StaffAccessLink). */

export type PublicPage = 'landing' | 'services' | 'about' | 'faq' | 'contact' | 'energy' | 'legal';

const PHONE_HREF = `tel:${COMPANY.phone.replace(/\s+/g, '')}`;

const navLinks: { href: string; label: string; page?: PublicPage }[] = [
  { href: '#top', label: 'Αρχική' },
  { href: '#services', label: 'Υπηρεσίες' },
  { href: '#comparison', label: 'Σύγκριση Τιμολογίων' },
  { href: '#how-it-works', label: 'Πώς Λειτουργεί' },
  { href: '#contact', label: 'Επικοινωνία', page: 'contact' },
];

const moreLinks: { href: string; label: string; page?: PublicPage }[] = [
  { href: '#advisor', label: 'Ο σύμβουλός σου' },
  { href: '#/services', label: 'Αναλυτικά οι υπηρεσίες', page: 'services' },
  { href: '#/faq', label: 'Συχνές ερωτήσεις', page: 'faq' },
  { href: '#/about', label: 'Η εταιρεία', page: 'about' },
];

/** Logo: the mark and wordmark are the two halves of the existing brand-logo.png (see public/images/landing). */
export function PublicBrand({ alt = 'Hlektrismos.gr — αρχική' }: { alt?: string }) {
  return (
    <>
      <img className="lp-brand__mark" src="/images/landing/logo-mark.png" alt="" width={256} height={312} />
      <img className="lp-brand__word" src="/images/landing/logo-wordmark.png" alt={alt} width={800} height={73} />
    </>
  );
}

export default function PublicHeader({ current = 'landing' }: { current?: PublicPage }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Mobile menu: Escape closes and returns focus; widening to desktop closes it.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenuOpen(false); burgerRef.current?.focus(); } };
    const mq = window.matchMedia('(min-width: 1120px)');
    const onWide = () => { if (mq.matches) setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    mq.addEventListener('change', onWide);
    return () => { window.removeEventListener('keydown', onKey); mq.removeEventListener('change', onWide); };
  }, [menuOpen]);

  // «Περισσότερα»: close when clicking elsewhere or pressing Escape.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const d = moreRef.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      const d = moreRef.current;
      if (e.key === 'Escape' && d?.open) { d.open = false; d.querySelector('summary')?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, []);

  const closeMenus = () => {
    setMenuOpen(false);
    if (moreRef.current) moreRef.current.open = false;
  };
  // Clicking the link of the page you are already on changes no hash, so nothing would happen: go to the top instead.
  const onLink = (page?: PublicPage) => () => {
    closeMenus();
    if (page && page === current && page !== 'contact') window.scrollTo(0, 0);
  };

  const cur = (page?: PublicPage) => (page && page === current ? ('page' as const) : undefined);
  const moreIsCurrent = moreLinks.some((l) => l.page === current);

  return (
    <header className={`lp-chrome lp-header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="lp-wrap lp-header__bar">
        <a href="#top" className="lp-brand" onClick={closeMenus}><PublicBrand /></a>

        <nav className="lp-nav" aria-label="Κύρια πλοήγηση">
          {navLinks.map((l) => <a key={l.href} href={l.href} className="lp-nav__link" aria-current={cur(l.page)} onClick={onLink(l.page)}>{l.label}</a>)}
          <details className={`lp-more${moreIsCurrent ? ' is-current' : ''}`} ref={moreRef}>
            <summary>Περισσότερα <ChevronDown size={14} aria-hidden="true" /></summary>
            <div className="lp-more__menu">
              {moreLinks.map((l) => <a key={l.href} href={l.href} aria-current={cur(l.page)} onClick={onLink(l.page)}>{l.label}</a>)}
            </div>
          </details>
        </nav>

        <div className="lp-header__actions">
          <a href={PHONE_HREF} className="lp-phone" aria-label={`Κάλεσέ μας στο ${COMPANY.phone}`}><Phone size={16} aria-hidden="true" /><span>{COMPANY.phone}</span></a>
          <a href="#contact" className="lp-btn lp-btn--primary lp-btn--sm" onClick={closeMenus}>Ζήτησε πρόταση <ArrowRight size={15} aria-hidden="true" /></a>
          <button ref={burgerRef} type="button" className="lp-burger" aria-expanded={menuOpen} aria-controls="lp-drawer"
            aria-label={menuOpen ? 'Κλείσιμο μενού' : 'Άνοιγμα μενού'} onClick={() => setMenuOpen((o) => !o)}>
            {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div id="lp-drawer" className="lp-drawer" hidden={!menuOpen}>
        <nav aria-label="Πλοήγηση κινητού">
          {navLinks.map((l) => <a key={l.href} href={l.href} aria-current={cur(l.page)} onClick={onLink(l.page)}>{l.label}</a>)}
          <p className="lp-drawer__sub">ΠΕΡΙΣΣΟΤΕΡΑ</p>
          {moreLinks.map((l) => <a key={l.href} href={l.href} aria-current={cur(l.page)} onClick={onLink(l.page)}>{l.label}</a>)}
          <a href="#contact" className="lp-btn lp-btn--primary" onClick={closeMenus}>Ζήτησε εξατομικευμένη πρόταση <ArrowRight size={16} aria-hidden="true" /></a>
        </nav>
      </div>
    </header>
  );
}
