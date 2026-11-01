// The first-login offer and the spotlight tour. It only EXPLAINS: it never clicks, navigates or writes for the person, and it needs no CRM data.
// A step whose element is not on screen (collapsed sidebar, phone layout, another module) is dropped, not shown with a broken spotlight.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { TOURS, resolveSteps } from '@/guide/tours';
import type { ResolvedStep } from '@/guide/tours';
import { SCOPE_NOTE, canResumeTour, shouldOfferTour, tourComplete, tourOffered, tourPause, tourSkip, tourStart, tourStep } from '@/guide/progress';
import { TOUR_EVENT, useGuideProgress } from './useGuideProgress';
import './guide.css';

const visible = (anchor: string): HTMLElement | null => {
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' ? el : null;
};
const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function TourHost() {
  const { profile, role } = useAuth();
  const { go } = useNav();
  const { progress, update, shared } = useGuideProgress();
  const guideRole = (profile?.role ?? role) as 'admin' | 'sales_agent';
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<ResolvedStep[]>([]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [offer, setOffer] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // Offer once per tour version, after the page has settled; never forced, never on every sign-in.
  useEffect(() => {
    if (!shouldOfferTour(progress)) { setOffer(false); return; }
    const t = window.setTimeout(() => setOffer(true), 1200);
    return () => window.clearTimeout(t);
  }, [progress]);

  const begin = useCallback((from: number) => {
    opener.current = document.activeElement as HTMLElement | null;
    const resolved = resolveSteps(TOURS[guideRole] ?? [], (a) => !!visible(a));
    if (!resolved.length) return;
    setSteps(resolved); setIdx(Math.min(from, resolved.length - 1)); setOffer(false); setRunning(true);
  }, [guideRole]);

  useEffect(() => {
    const h = (e: Event) => {
      const action = (e as CustomEvent<{ action: 'start' | 'resume' }>).detail?.action;
      if (action === 'resume' && canResumeTour(progress)) { update((p) => tourStep(p, p.tour.step)); begin(progress.tour.step); }
      else { update((p) => tourStart(p)); begin(0); }
    };
    window.addEventListener(TOUR_EVENT, h);
    return () => window.removeEventListener(TOUR_EVENT, h);
  }, [begin, progress, update]);

  const current = running ? steps[idx] : undefined;

  const place = useCallback(() => {
    if (!current) { setRect(null); return; }
    const el = visible(current.target);
    if (!el) { setRect(null); return; }
    if (current.target !== 'page') el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
    setRect(el.getBoundingClientRect());
  }, [current]);

  useLayoutEffect(() => {
    place();
    if (!running) return;
    const h = () => place();
    window.addEventListener('resize', h); window.addEventListener('scroll', h, true);
    return () => { window.removeEventListener('resize', h); window.removeEventListener('scroll', h, true); };
  }, [place, running]);

  useEffect(() => { if (running) cardRef.current?.focus(); }, [running, idx]);

  const close = useCallback((how: 'pause' | 'skip' | 'done') => {
    if (how === 'pause') update((p) => tourPause(p, idx));
    else if (how === 'skip') update((p) => tourSkip(p));
    else update((p) => tourComplete(p));
    setRunning(false); setRect(null);
    opener.current?.focus?.();
  }, [idx, update]);

  const next = useCallback(() => {
    if (idx >= steps.length - 1) { close('done'); return; }
    setIdx(idx + 1); update((p) => tourStep(p, idx + 1));
  }, [close, idx, steps.length, update]);
  const prev = useCallback(() => { if (idx > 0) { setIdx(idx - 1); update((p) => tourStep(p, idx - 1)); } }, [idx, update]);

  useEffect(() => {
    if (!running) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close('pause'); }
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Tab') { // keep focus inside the card
        const f = cardRef.current?.querySelectorAll<HTMLElement>('button, a[href]'); if (!f?.length) return;
        const first = f[0]; const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, [close, next, prev, running]);

  // The dimmed layer has a rectangular hole over the element being explained (a clip-path, which renders reliably, unlike a huge box-shadow).
  const hole = rect ? { l: Math.max(0, rect.left - 6), t: Math.max(0, rect.top - 6), r: rect.right + 6, b: rect.bottom + 6 } : null;

  const cardStyle = useMemo<React.CSSProperties>(() => {
    if (!rect || window.innerWidth < 640) return {};
    const w = 360; const gap = 14;
    const below = rect.bottom + gap + 260 < window.innerHeight;
    const top = below ? rect.bottom + gap : Math.max(12, rect.top - gap - 260);
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - w / 2), window.innerWidth - w - 12);
    return { top, left, width: w };
  }, [rect]);

  if (!running && offer) {
    return (
      <div className="gd-offer" role="dialog" aria-labelledby="gd-offer-title" aria-describedby="gd-offer-text">
        <h2 id="gd-offer-title" className="gd-offer__title">Καλώς ήρθατε στο ATLAS CRM</h2>
        <p id="gd-offer-text" className="gd-offer__text">Θέλετε μια σύντομη ξενάγηση ({TOURS[guideRole]?.length ?? 0} βήματα); Δεν αλλάζει τίποτα στο CRM και μπορείτε να την επαναλάβετε από τον Οδηγό ATLAS.</p>
        <p className="gd-offer__note">{SCOPE_NOTE[shared ? 'workstation' : 'user']}</p>
        <div className="gd-row">
          <button className="atx-btn atx-btn-primary" onClick={() => { update((p) => tourStart(p)); begin(0); }}>Ξεκινήστε την ξενάγηση</button>
          <button className="atx-btn atx-btn-quiet" onClick={() => { update((p) => tourOffered(p)); setOffer(false); }}>Αργότερα</button>
          <button className="atx-btn atx-btn-quiet" onClick={() => { update((p) => tourSkip(p)); setOffer(false); }}>Παράλειψη</button>
        </div>
      </div>
    );
  }
  if (!running || !current) return null;
  const s = current.step;
  const last = idx === steps.length - 1;
  return (
    <div className="gd-tour" data-reduced={reduced() ? 'true' : undefined}>
      <div className="gd-dim" aria-hidden="true" style={hole ? { clipPath: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${hole.l}px ${hole.t}px, ${hole.l}px ${hole.b}px, ${hole.r}px ${hole.b}px, ${hole.r}px ${hole.t}px, ${hole.l}px ${hole.t}px)` } : undefined} />
      {rect && <div className="gd-spot" aria-hidden="true" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <div ref={cardRef} className={`gd-card ${rect ? '' : 'gd-card--center'}`} style={cardStyle} role="dialog" aria-modal="false" aria-labelledby="gd-step-title" tabIndex={-1}>
        <div className="gd-card__count" aria-live="polite">Βήμα {idx + 1} από {steps.length}</div>
        <h2 id="gd-step-title" className="gd-card__title">{s.title}</h2>
        <p className="gd-card__text">{s.body}</p>
        <p className="gd-card__why"><strong>Γιατί έχει σημασία:</strong> {s.why}</p>
        {s.guide && <p className="gd-card__more"><a href={`#/dashboard?view=guide&f.doc=${s.guide}`} onClick={(e) => { e.preventDefault(); close('pause'); go('guide', { doc: s.guide! }); }}>Διαβάστε τον οδηγό</a></p>}
        <div className="gd-row">
          <button className="atx-btn atx-btn-quiet" onClick={prev} disabled={idx === 0}>Προηγούμενο</button>
          <button className="atx-btn atx-btn-primary" onClick={next}>{last ? 'Τέλος' : 'Επόμενο'}</button>
          <button className="atx-btn atx-btn-quiet" onClick={() => close('pause')}>Παύση</button>
          <button className="atx-btn atx-btn-quiet" onClick={() => close('skip')}>Παράλειψη</button>
        </div>
      </div>
    </div>
  );
}
