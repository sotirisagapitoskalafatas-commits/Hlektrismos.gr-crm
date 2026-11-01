// Practice Mode. Everything lives in this component's memory: no request, no storage, no e-mail, no integration. The data is invented.
// It uses the real rules (allowed stage moves, document types, the 25 MB limit) through guide/practice.ts, which imports nothing that can reach the network.
import { useState } from 'react';
import type { Role } from '@/lib/roles';
import { STAGES } from '@/lib/roles';
import { uploadableDocTypes } from '@/lib/documents';
import { EXERCISES, SYNTHETIC, actLogged, initialPractice, progressOf, stageChoices } from '@/guide/practice';
import type { PracticeAction, PracticeState } from '@/guide/practice';
import type { Stage } from '@/lib/roles';
import type { GuideRole } from '@/guide/markdown';
import { LEVEL_TEXT } from '@/guide/labels';

export default function PracticeView({ role, onOpen }: { role: GuideRole; onOpen: (id: string) => void }) {
  const [exId, setExId] = useState(EXERCISES[0].id);
  const [state, setState] = useState<PracticeState>(initialPractice);
  const [last, setLast] = useState<{ ok: boolean; message: string } | null>(null);
  const [name, setName] = useState<string>(SYNTHETIC.names[0]);
  const [to, setTo] = useState<Stage>('contacted');
  const [docType, setDocType] = useState('bill_electricity');
  const [file, setFile] = useState(0);
  const ex = EXERCISES.find((e) => e.id === exId)!;
  const pr = progressOf(ex, state);
  const run = (a: PracticeAction) => { const r = actLogged(state, a, role as Role); setState(r.state); setLast({ ok: r.ok, message: r.message }); };
  const reset = () => { setState(initialPractice()); setLast(null); };
  const stageLabel = state.kase ? STAGES.find((s) => s.id === state.kase!.stage)?.label : null;
  const choices = stageChoices(state);

  return (
    <div>
      <div className="gd-practice" role="region" aria-label="Δοκιμαστική λειτουργία">
        <div className="gd-practice__banner">{SYNTHETIC.banner}</div>
        <p className="gd-note" style={{ margin: '4px 0 0' }}>Τίποτα εδώ δεν αποθηκεύεται, δεν στέλνεται και δεν επηρεάζει πραγματικούς πελάτες. Αν ανανεώσετε τη σελίδα, ξεκινάτε από την αρχή.</p>
      </div>

      <div className="gd-row" role="tablist" aria-label="Ασκήσεις" style={{ marginTop: 14 }}>
        {EXERCISES.filter((e) => e.roles.includes(role)).map((e) => <button key={e.id} role="tab" aria-selected={e.id === exId} className="gd-chip" onClick={() => { setExId(e.id); reset(); }}>{e.title}</button>)}
      </div>
      <p style={{ margin: '4px 0' }}>{ex.goal} <span className="ui-pill ui-pill--gray">{LEVEL_TEXT[ex.level]}</span> <button className="gd-link" onClick={() => onOpen(ex.guide)}>Σχετικός οδηγός</button></p>
      <div className="gd-progress" role="progressbar" aria-valuemin={0} aria-valuemax={pr.total} aria-valuenow={pr.done} aria-label="Πρόοδος άσκησης"><span style={{ width: `${(pr.done / pr.total) * 100}%` }} /></div>
      <ol style={{ paddingLeft: 20 }}>{ex.tasks.map((t, i) => <li key={i} style={{ color: t.done(state) ? '#1f7a3d' : undefined }}>{t.done(state) ? '✓ ' : ''}{t.text}</li>)}</ol>
      {pr.done === pr.total && <p role="status" className="ui-pill ui-pill--green">Ολοκληρώσατε την άσκηση.</p>}

      <div className="gd-grid" style={{ marginTop: 12 }}>
        <section className="ui-card gd-card-lg" aria-label="Lead">
          <h3>Lead</h3>
          {state.lead ? <p>«{state.lead.name}» — {state.lead.status === 'new' ? 'Νέο' : state.lead.status === 'contacted' ? 'Επικοινωνία' : 'Μετατράπηκε'}</p> : (
            <><label className="gd-label" htmlFor="gd-pname">Ονοματεπώνυμο (φανταστικό)</label>
              <select id="gd-pname" className="gd-select" value={name} onChange={(e) => setName(e.target.value)}>{SYNTHETIC.names.map((n) => <option key={n}>{n}</option>)}</select></>
          )}
          <div className="gd-row">
            <button className="atx-btn atx-btn-primary" onClick={() => run({ t: 'create_lead', name })}>Δημιουργία lead</button>
            <button className="atx-btn atx-btn-quiet" onClick={() => run({ t: 'contact_lead' })}>Επικοινωνία</button>
            <button className="atx-btn atx-btn-quiet" onClick={() => run({ t: 'convert_lead' })}>Μετατροπή σε Case</button>
          </div>
        </section>
        <section className="ui-card gd-card-lg" aria-label="Case">
          <h3>Case</h3>
          <p>{stageLabel ? <>Στάδιο: <strong>{stageLabel}</strong></> : 'Δεν υπάρχει ακόμη case.'}</p>
          <label className="gd-label" htmlFor="gd-pstage">Μετακίνηση σε</label>
          <select id="gd-pstage" className="gd-select" value={to} onChange={(e) => setTo(e.target.value as Stage)}>{(choices.length ? choices : STAGES).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
          <div className="gd-row"><button className="atx-btn atx-btn-primary" onClick={() => run({ t: 'move', to })}>Αλλαγή σταδίου</button></div>
        </section>
        <section className="ui-card gd-card-lg" aria-label="Έγγραφα">
          <h3>Έγγραφα ({state.docs.length})</h3>
          <label className="gd-label" htmlFor="gd-ptype">Τι είναι το έγγραφο;</label>
          <select id="gd-ptype" className="gd-select" value={docType} onChange={(e) => setDocType(e.target.value)}><option value="">— Επιλέξτε —</option>{uploadableDocTypes().map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select>
          <label className="gd-label" htmlFor="gd-pfile">Αρχείο (φανταστικό)</label>
          <select id="gd-pfile" className="gd-select" value={file} onChange={(e) => setFile(Number(e.target.value))}>{SYNTHETIC.files.map((f, i) => <option key={f.name} value={i}>{f.name} ({f.mb} MB)</option>)}</select>
          <div className="gd-row"><button className="atx-btn atx-btn-primary" onClick={() => run({ t: 'upload', docType, mb: SYNTHETIC.files[file].mb })}>Προσθήκη εγγράφου</button></div>
        </section>
      </div>

      <section aria-live="polite" aria-label="Τι συνέβη" style={{ marginTop: 14 }}>
        {last && <div className={`gd-banner ${last.ok ? 'gd-banner--partial' : 'gd-banner--planned'}`} role="status">{last.ok ? '✓ ' : '✗ '}{last.message}</div>}
        {state.log.length > 0 && <ul className="gd-log">{state.log.map((l, i) => <li key={i} data-bad={l.startsWith('⚠') ? 'true' : undefined}>{l}</li>)}</ul>}
      </section>
      <div className="gd-row"><button className="atx-btn atx-btn-quiet" onClick={reset}>Ξεκινήστε από την αρχή</button></div>
    </div>
  );
}
