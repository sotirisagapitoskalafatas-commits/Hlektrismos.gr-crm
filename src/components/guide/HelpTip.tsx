// A small «?» next to a field. Keyboard and screen-reader friendly: a real button, Escape closes, focus returns to it. It explains only; it changes nothing.
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { HELP_TIPS } from '@/guide/helps';
import './guide.css';

export default function HelpTip({ id }: { id: string }) {
  const tip = HELP_TIPS.find((t) => t.id === id);
  const { profile, role } = useAuth();
  const { go } = useNav();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useId();
  const guideRole = (profile?.role ?? role) as 'admin' | 'sales_agent';
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btn.current?.focus(); } };
    const c = (e: MouseEvent) => { if (!btn.current?.parentElement?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('keydown', k, true); window.addEventListener('mousedown', c);
    return () => { window.removeEventListener('keydown', k, true); window.removeEventListener('mousedown', c); };
  }, [open]);
  if (!tip || !tip.roles.includes(guideRole)) return null;
  return (
    <span className="gd-tip">
      <button ref={btn} type="button" className="gd-tip__btn" aria-expanded={open} aria-controls={open ? pop : undefined} aria-label={`Βοήθεια: ${tip.title}`} onClick={() => setOpen((o) => !o)}>?</button>
      {open && (
        <span id={pop} role="note" className="gd-tip__pop">
          <strong>{tip.title}</strong>
          {tip.text}
          <span className="block mt-2"><button type="button" className="gd-link" onClick={() => { setOpen(false); go('guide', { doc: tip.guide }); }}>Διαβάστε τον οδηγό</button></span>
        </span>
      )}
    </span>
  );
}
