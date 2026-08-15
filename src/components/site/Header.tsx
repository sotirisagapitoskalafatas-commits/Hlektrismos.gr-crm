import { useState, useEffect } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Zap, Menu, X, ArrowRight } from 'lucide-react'

export default function Header() {
  const [scrolled,  setScrolled]  = useState(false)
  const [scrollPct, setScrollPct] = useState(0)
  const [menuOpen,  setMenuOpen]  = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      const h = document.documentElement.scrollHeight - window.innerHeight
      setScrolled(y > 40)
      setScrollPct(h > 0 ? (y/h)*100 : 0)
    }
    window.addEventListener('scroll', onScroll, { passive:true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const close = () => setMenuOpen(false)

  return (
    <>
      <div className="scroll-progress">
        <div className="scroll-progress-fill" style={{ width:`${scrollPct}%` }} />
      </div>
      <header className={scrolled ? 'site-header scrolled' : 'site-header'}>
        <div className="container nav-wrap">
          <Link to="/" className="brand">
            <span className="brand-mark"><Zap size={18} fill="currentColor" /></span>
            <span>Power<span>For</span></span>
          </Link>

          <nav className={menuOpen ? 'main-nav open' : 'main-nav'}>
            <NavLink to="/services" onClick={close}>Υπηρεσίες</NavLink>
            <NavLink to="/about"    onClick={close}>Ποιοι Είμαστε</NavLink>
            <NavLink to="/#journey" onClick={close}>Σε όλη την Ελλάδα</NavLink>
            <NavLink to="/faq"      onClick={close}>Συχνές Ερωτήσεις</NavLink>
            <NavLink to="/contact"  onClick={close}>Επικοινωνία</NavLink>
            <Link    to="/login"    onClick={close} className="nav-dashboard">Σύνδεση</Link>
          </nav>

          <button className="menu-button" onClick={() => setMenuOpen(m => !m)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <Link to="/contact" className="header-cta">Ζητήστε κλήση <ArrowRight size={16} /></Link>
        </div>
      </header>
    </>
  )
}
