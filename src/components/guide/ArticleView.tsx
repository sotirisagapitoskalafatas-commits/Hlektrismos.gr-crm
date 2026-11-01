import { useEffect, useMemo, useState } from 'react';
import { LIBRARY } from '@/guide/catalog';
import { GUIDE_VERSION, isOutdated } from '@/guide/library';
import { markViewed, rate } from '@/guide/progress';
import type { GuideDoc, GuideRole } from '@/guide/markdown';
import { LEVEL_TEXT, STATUS_TEXT } from '@/guide/labels';
import GuideContent from './GuideContent';
import FeedbackBox from './FeedbackBox';
import { useGuideProgress } from './useGuideProgress';

export default function ArticleView({ id, role, onOpen, onHome }: { id: string; role: GuideRole; onOpen: (id: string) => void; onHome: (category?: string) => void }) {
  const doc: GuideDoc | undefined = LIBRARY.byId.get(id);
  const { progress, update } = useGuideProgress();
  const [report, setReport] = useState(false);
  const allowed = !!doc && doc.meta.roles.includes(role);

  const docId = doc?.meta.id;
  useEffect(() => { if (docId && allowed) update((p) => markViewed(p, docId)); }, [docId, allowed, update]);
  useEffect(() => { setReport(false); window.scrollTo?.({ top: 0 }); }, [id]);
  const related = useMemo(() => (doc ? doc.meta.related.map((r) => LIBRARY.byId.get(r)).filter((d): d is GuideDoc => !!d && d.meta.roles.includes(role)) : []), [doc, role]);

  if (!doc) return <div className="gd-banner gd-banner--stale" role="alert">Δεν βρέθηκε αυτός ο οδηγός. <button className="gd-link" onClick={() => onHome()}>Πίσω στους οδηγούς</button></div>;
  if (!allowed) return <div className="gd-banner gd-banner--partial" role="alert">Αυτός ο οδηγός αφορά άλλον τύπο λογαριασμού και δεν είναι διαθέσιμος στον δικό σας. Αν τη χρειάζεστε, ζητήστε το από τον Admin / Back Office. <button className="gd-link" onClick={() => onHome()}>Πίσω στους οδηγούς</button></div>;

  const m = doc.meta; const st = STATUS_TEXT[m.status]; const stale = isOutdated(m.version, GUIDE_VERSION);
  const toc = doc.blocks.filter((b): b is Extract<typeof b, { t: 'h2' }> => b.t === 'h2');
  const vote = progress.ratings[m.id];
  return (
    <article className="gd-article">
      <nav className="gd-crumbs" aria-label="Διαδρομή">
        <button className="gd-link" onClick={() => onHome()}>Οδηγός ATLAS</button><span aria-hidden="true">›</span>
        <button className="gd-link" onClick={() => onHome(m.category)}>{m.category}</button><span aria-hidden="true">›</span>
        <span aria-current="page">{m.title}</span>
      </nav>
      <h1>{m.title}</h1>
      <div className="gd-meta">
        <span className={`ui-pill ${st.pill}`}>{st.label}</span>
        <span className="ui-pill ui-pill--gray">{LEVEL_TEXT[m.level]}</span>
        <span className="gd-note">Αναθεώρηση {m.updated} · έκδοση {m.version}</span>
      </div>
      {m.status === 'planned' && <div className="gd-banner gd-banner--planned" role="note" style={{ marginTop: 12 }}>Αυτή η λειτουργία δεν είναι ακόμη διαθέσιμη. Ο οδηγός την περιγράφει ως προγραμματισμένη.</div>}
      {m.status === 'partially-verified' && <div className="gd-banner gd-banner--partial" role="note" style={{ marginTop: 12 }}>Ο οδηγός περιγράφει όσα φαίνονται στον κώδικα της εφαρμογής. Κάποιο μέρος εξαρτάται από ρυθμίσεις ή δεν έχει ελεγχθεί σε πραγματικό περιβάλλον.</div>}
      {stale && <div className="gd-banner gd-banner--stale" role="note" style={{ marginTop: 12 }}>Ο οδηγός ίσως είναι παλιός: η εφαρμογή έχει νεότερη έκδοση από αυτόν.</div>}
      {toc.length > 2 && (
        <nav className="gd-toc" aria-label="Περιεχόμενα"><strong>Περιεχόμενα</strong>
          <ul>{toc.map((h) => <li key={h.id}><a className="gd-link" href={`#${h.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(h.id)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }}>{h.text}</a></li>)}</ul>
        </nav>
      )}
      <GuideContent doc={doc} onGuide={onOpen} />
      <hr style={{ margin: '28px 0 12px', border: 0, borderTop: '1px solid var(--ui-border)' }} />
      <div className="gd-row" role="group" aria-label="Ήταν χρήσιμος αυτός ο οδηγός;">
        <span className="gd-note">Ήταν χρήσιμος αυτός ο οδηγός;</span>
        <button className="atx-btn atx-btn-quiet" aria-pressed={vote === 'up'} onClick={() => update((p) => rate(p, m.id, vote === 'up' ? null : 'up'))}>{vote === 'up' ? '✓ ' : ''}Ναι</button>
        <button className="atx-btn atx-btn-quiet" aria-pressed={vote === 'down'} onClick={() => update((p) => rate(p, m.id, vote === 'down' ? null : 'down'))}>{vote === 'down' ? '✓ ' : ''}Όχι</button>
        <button className="atx-btn atx-btn-quiet" aria-expanded={report} onClick={() => setReport((r) => !r)}>Αναφορά προβλήματος</button>
      </div>
      <p className="gd-note">Η αξιολόγηση μένει μόνο σε αυτόν τον browser και δεν στέλνεται πουθενά.</p>
      {report && <FeedbackBox guideId={m.id} role={role} onClose={() => setReport(false)} />}
      {related.length > 0 && (
        <section aria-label="Σχετικοί οδηγοί" style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 16 }}>Δείτε επίσης</h2>
          <div className="gd-row">{related.map((r) => <button key={r.meta.id} className="gd-chip" onClick={() => onOpen(r.meta.id)}>{r.meta.title}</button>)}</div>
        </section>
      )}
    </article>
  );
}
