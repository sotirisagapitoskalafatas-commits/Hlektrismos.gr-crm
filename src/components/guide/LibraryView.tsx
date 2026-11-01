import { useMemo, useState } from 'react';
import { LIBRARY } from '@/guide/catalog';
import { forRole } from '@/guide/library';
import { answer, search } from '@/guide/search';
import type { GuideRole } from '@/guide/markdown';
import { STATUS_TEXT } from '@/guide/labels';
import { useGuideProgress } from './useGuideProgress';

/** The searchable library and the grounded assistant. The assistant only quotes the guides: it can not read or change CRM data. */
export default function LibraryView({ role, category, onOpen, onCategory }: { role: GuideRole; category: string | null; onOpen: (id: string) => void; onCategory: (c: string | null) => void }) {
  const [q, setQ] = useState('');
  const { progress } = useGuideProgress();
  const mine = useMemo(() => forRole(LIBRARY, role), [role]);
  const cats = useMemo(() => [...new Set(mine.map((d) => d.meta.category))], [mine]);
  const query = q.trim();
  const hits = useMemo(() => (query ? search(mine, query, role) : []), [mine, query, role]);
  const reply = useMemo(() => (query.length >= 4 ? answer(LIBRARY.docs, query, role) : null), [query, role]);
  const list = category ? mine.filter((d) => d.meta.category === category) : mine;

  return (
    <div>
      <form className="gd-search" role="search" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="gd-q" className="sr-only">Αναζήτηση ή ερώτηση στον οδηγό</label>
        <input id="gd-q" className="gd-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Αναζητήστε ή κάντε μια ερώτηση, π.χ. «πώς κάνω Check In;»" autoComplete="off" />
      </form>

      {query && reply && (
        <section className="gd-answer" aria-live="polite" aria-label="Απάντηση από τους οδηγούς">
          <h3>{reply.kind === 'answer' ? `Από τον οδηγό «${reply.doc!.meta.title}»` : reply.kind === 'planned' ? 'Δεν είναι ακόμη διαθέσιμο' : reply.kind === 'forbidden' ? 'Δεν είναι διαθέσιμο στον λογαριασμό σας' : 'Δεν υπάρχει τεκμηρίωση'}</h3>
          <p style={{ margin: 0 }}>{reply.message}</p>
          {reply.steps.length > 0 && <ol>{reply.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
          {reply.doc && reply.kind !== 'forbidden' && <p style={{ margin: '8px 0 0' }}><button className="gd-link" onClick={() => onOpen(reply.doc!.meta.id)}>Ανοίξτε τον πλήρη οδηγό</button></p>}
          <p className="gd-note" style={{ margin: '8px 0 0' }}>Ο βοηθός απαντά μόνο από τους οδηγούς και δεν αλλάζει τίποτα στο CRM.</p>
        </section>
      )}

      {query ? (
        <section aria-label="Αποτελέσματα αναζήτησης">
          <p className="gd-note" role="status">{hits.length ? `${hits.length} οδηγοί` : 'Κανένας οδηγός δεν ταιριάζει.'}</p>
          {hits.map((h) => (
            <button key={h.doc.meta.id} className="gd-result" onClick={() => onOpen(h.doc.meta.id)}>
              <strong>{h.doc.meta.title}</strong>
              <span>{h.doc.meta.category} · {STATUS_TEXT[h.doc.meta.status].label} — {h.doc.meta.summary}</span>
            </button>
          ))}
        </section>
      ) : (
        <>
          <div className="gd-row" role="group" aria-label="Κατηγορίες" style={{ marginTop: 0 }}>
            <button className="gd-chip" aria-pressed={!category} onClick={() => onCategory(null)}>Όλα</button>
            {cats.map((c) => <button key={c} className="gd-chip" aria-pressed={category === c} onClick={() => onCategory(c)}>{c}</button>)}
          </div>
          <div className="gd-grid" style={{ marginTop: 12 }}>
            {list.map((d) => (
              <button key={d.meta.id} className="ui-card gd-card-lg ui-lift" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => onOpen(d.meta.id)}>
                <h3>{progress.viewed[d.meta.id] && <span aria-label="Διαβάστηκε" title="Διαβάστηκε">✓ </span>}{d.meta.title}</h3>
                <p>{d.meta.summary}</p>
                <span className="gd-meta"><span className="ui-pill ui-pill--gray">{d.meta.category}</span><span className={`ui-pill ${STATUS_TEXT[d.meta.status].pill}`}>{STATUS_TEXT[d.meta.status].label}</span></span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
