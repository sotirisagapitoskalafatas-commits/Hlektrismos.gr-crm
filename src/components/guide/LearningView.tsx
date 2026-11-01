// «Η μάθησή μου»: a path for the account type, from beginner to advanced. Progress stays in this browser and is not a score, a permission or a report about a person.
import { useState } from 'react';
import { LIBRARY } from '@/guide/catalog';
import { forRole } from '@/guide/library';
import { SCOPE_NOTE, canResumeTour, markTopic, unmarkTopic } from '@/guide/progress';
import type { GuideRole } from '@/guide/markdown';
import { LEVEL_TEXT } from '@/guide/labels';
import { startTour, useGuideProgress } from './useGuideProgress';

const TOUR_TEXT = { idle: 'Δεν έχει ξεκινήσει', offered: 'Δεν έχει ξεκινήσει', in_progress: 'Σε εξέλιξη', paused: 'Σε παύση', completed: 'Ολοκληρώθηκε', skipped: 'Παραλείφθηκε' } as const;

export default function LearningView({ role, onOpen }: { role: GuideRole; onOpen: (id: string) => void }) {
  const { progress, update, reset, shared } = useGuideProgress();
  const [confirm, setConfirm] = useState(false);
  const docs = forRole(LIBRARY, role).filter((d) => d.meta.status !== 'planned' && !['Αναφορά', 'Βοήθεια'].includes(d.meta.category));
  const levels = (['beginner', 'intermediate', 'advanced'] as const).map((l) => ({ l, docs: docs.filter((d) => d.meta.level === l) })).filter((x) => x.docs.length);
  const total = docs.length; const done = docs.filter((d) => progress.viewed[d.meta.id]).length;
  const cats = [...new Set(docs.map((d) => d.meta.category))];
  const recent = progress.recent.map((id) => LIBRARY.byId.get(id)).filter((d) => d && d.meta.roles.includes(role)).slice(0, 4);
  return (
    <div>
      <p className="gd-note" role="note">{SCOPE_NOTE[shared ? 'workstation' : 'user']}</p>
      <section className="ui-card gd-card-lg" aria-label="Πρόοδος">
        <h3>Η πορεία σας</h3>
        <div className="gd-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Οδηγοί που διαβάστηκαν"><span style={{ width: total ? `${(done / total) * 100}%` : '0%' }} /></div>
        <p style={{ margin: '8px 0 0' }}>{done} από {total} οδηγούς διαβάστηκαν.</p>
        <p className="gd-note" style={{ margin: '4px 0 0' }}>Ξενάγηση: {TOUR_TEXT[progress.tour.status]}</p>
        <div className="gd-row">
          {canResumeTour(progress) && <button className="atx-btn atx-btn-primary" onClick={() => startTour('resume')}>Συνέχιση ξενάγησης</button>}
          <button className="atx-btn atx-btn-quiet" onClick={() => startTour('start')}>{progress.tour.status === 'completed' || progress.tour.status === 'skipped' ? 'Επανάληψη ξενάγησης' : 'Ξεκινήστε την ξενάγηση'}</button>
        </div>
      </section>
      {recent.length > 0 && (
        <section aria-label="Πρόσφατοι οδηγοί" style={{ marginTop: 14 }}>
          <h3 style={{ fontSize: 15 }}>Συνεχίστε από εκεί που μείνατε</h3>
          <div>{recent.map((d) => <button key={d!.meta.id} className="gd-chip" onClick={() => onOpen(d!.meta.id)}>{d!.meta.title}</button>)}</div>
        </section>
      )}
      {levels.map(({ l, docs: ds }) => (
        <section key={l} aria-label={LEVEL_TEXT[l]} style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>{LEVEL_TEXT[l]}</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{ds.map((d) => (
            <li key={d.meta.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--ui-border)' }}>
              <button className="gd-link" onClick={() => onOpen(d.meta.id)}>{progress.viewed[d.meta.id] ? '✓ ' : '○ '}{d.meta.title}</button>
            </li>))}
          </ul>
        </section>
      ))}
      <section aria-label="Θέματα που έχω μάθει" style={{ marginTop: 18 }}>
        <h3 style={{ fontSize: 16, margin: '0 0 6px' }}>Θέματα που ξέρω</h3>
        <p className="gd-note" style={{ margin: '0 0 6px' }}>Σημειώστε μόνο για τον εαυτό σας. Δεν το βλέπει κανείς και δεν επηρεάζει τίποτα.</p>
        <div>{cats.map((c) => { const has = !!progress.topics[c]; return <label key={c} className="gd-chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={has} onChange={() => update((p) => (has ? unmarkTopic(p, c) : markTopic(p, c)))} style={{ marginRight: 6 }} />{c}</label>; })}</div>
      </section>
      <section style={{ marginTop: 22 }}>
        {confirm ? (
          <div className="gd-row" role="alertdialog" aria-label="Επιβεβαίωση">
            <span>Να διαγραφεί η πρόοδος εκμάθησης από αυτόν τον browser;</span>
            <button className="atx-btn atx-btn-primary" onClick={() => { reset(); setConfirm(false); }}>Ναι, διαγραφή</button>
            <button className="atx-btn atx-btn-quiet" onClick={() => setConfirm(false)}>Άκυρο</button>
          </div>
        ) : <button className="atx-btn atx-btn-quiet" onClick={() => setConfirm(true)}>Διαγραφή προόδου εκμάθησης</button>}
      </section>
    </div>
  );
}
