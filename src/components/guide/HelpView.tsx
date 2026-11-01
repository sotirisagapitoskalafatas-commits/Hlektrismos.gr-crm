// Guided troubleshooting: decision trees plus two checkers that answer from the application's own rules. Nothing here reads or changes CRM data.
import { useState } from 'react';
import { STAGES } from '@/lib/roles';
import type { PageKey, Role, Stage } from '@/lib/roles';
import { CHECKABLE_PAGES, TREES, checkPageAccess, checkStageMove } from '@/guide/troubleshoot';
import type { Tree } from '@/guide/troubleshoot';
import { PAGE_TITLES } from '@/lib/roles';
import { LIBRARY } from '@/guide/catalog';
import type { GuideRole } from '@/guide/markdown';

function StageChecker({ role }: { role: Role }) {
  const [from, setFrom] = useState<Stage>('contacted'); const [to, setTo] = useState<Stage>('application');
  const r = checkStageMove(role, from, to);
  return (
    <div className="ui-card gd-card-lg" style={{ marginTop: 10 }}>
      <div className="gd-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div><label className="gd-label" htmlFor="gd-from">Τωρινό στάδιο</label><select id="gd-from" className="gd-select" value={from} onChange={(e) => setFrom(e.target.value as Stage)}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <div><label className="gd-label" htmlFor="gd-to">Στάδιο που θέλετε</label><select id="gd-to" className="gd-select" value={to} onChange={(e) => setTo(e.target.value as Stage)}>{STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
      </div>
      <p role="status" style={{ marginTop: 12 }}><span className={`ui-pill ${r.allowed ? 'ui-pill--green' : 'ui-pill--orange'}`}>{r.allowed ? 'Επιτρέπεται' : 'Δεν επιτρέπεται'}</span> {r.text}</p>
      <p className="gd-note">Η απάντηση προέρχεται από τον πίνακα μεταβάσεων της εφαρμογής. Δεν κοιτάζει κανένα πραγματικό case.</p>
    </div>
  );
}

function AccessChecker({ role }: { role: Role }) {
  const [page, setPage] = useState<PageKey>('reports');
  const r = checkPageAccess(role, page);
  return (
    <div className="ui-card gd-card-lg" style={{ marginTop: 10 }}>
      <label className="gd-label" htmlFor="gd-page">Ενότητα</label>
      <select id="gd-page" className="gd-select" value={page} onChange={(e) => setPage(e.target.value as PageKey)}>{CHECKABLE_PAGES.map((p) => <option key={p} value={p}>{PAGE_TITLES[p]}</option>)}</select>
      <p role="status" style={{ marginTop: 12 }}><span className={`ui-pill ${r.allowed ? 'ui-pill--green' : 'ui-pill--orange'}`}>{r.allowed ? 'Έχετε πρόσβαση' : 'Δεν περιλαμβάνεται'}</span> {r.text}</p>
    </div>
  );
}

function TreeWalker({ tree, role, onOpen, onBack }: { tree: Tree; role: GuideRole; onOpen: (id: string) => void; onBack: () => void }) {
  const [path, setPath] = useState<string[]>([tree.start]);
  const node = tree.nodes[path[path.length - 1]];
  const guideOk = (id?: string) => !!id && !!LIBRARY.byId.get(id)?.meta.roles.includes(role);
  const kinds = { cause: ['ui-pill--blue', 'Πιθανή αιτία'], escalate: ['ui-pill--orange', 'Ζητήστε βοήθεια'], ok: ['ui-pill--green', 'Εντάξει'], planned: ['ui-pill--gray', 'Δεν είναι ακόμη διαθέσιμο'] } as const;
  return (
    <section aria-label={tree.title}>
      <nav className="gd-crumbs"><button className="gd-link" onClick={onBack}>Βοήθεια για προβλήματα</button><span aria-hidden="true">›</span><span aria-current="page">{tree.title}</span></nav>
      {tree.checker === 'stage-move' && <StageChecker role={role as Role} />}
      {tree.checker === 'page-access' && <AccessChecker role={role as Role} />}
      {!tree.checker && node && (
        <div className="ui-card gd-card-lg" aria-live="polite">
          {node.result ? (
            <>
              <span className={`ui-pill ${kinds[node.result.kind][0]}`}>{kinds[node.result.kind][1]}</span>
              <p style={{ fontSize: 15.5 }}>{node.result.text}</p>
              <div className="gd-row">
                {guideOk(node.result.guide) && <button className="atx-btn atx-btn-quiet" onClick={() => onOpen(node.result!.guide!)}>Διαβάστε τον οδηγό</button>}
                <button className="atx-btn atx-btn-quiet" onClick={() => setPath([tree.start])}>Ξεκινήστε από την αρχή</button>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>{node.text}</h3>
              <div role="group" aria-label="Επιλογές">{node.options!.map((o) => <button key={o.next + o.label} className="gd-chip" onClick={() => setPath([...path, o.next])}>{o.label}</button>)}</div>
              {path.length > 1 && <div className="gd-row"><button className="gd-link" onClick={() => setPath(path.slice(0, -1))}>← Πίσω</button></div>}
            </>
          )}
        </div>
      )}
      <p className="gd-note">Αν το δέντρο δεν μπορεί να αποφασίσει, σας λέει ποιον να ρωτήσετε. Δεν μαντεύει.</p>
    </section>
  );
}

export default function HelpView({ role, treeId, onTree, onOpen }: { role: GuideRole; treeId: string | null; onTree: (id: string | null) => void; onOpen: (id: string) => void }) {
  const tree = TREES.find((t) => t.id === treeId);
  if (tree) return <TreeWalker tree={tree} role={role} onOpen={onOpen} onBack={() => onTree(null)} />;
  return (
    <div>
      <p>Διαλέξτε το πρόβλημα που αντιμετωπίζετε. Θα σας κάνουμε λίγες ερωτήσεις και θα σας πούμε την πιθανή αιτία.</p>
      <div className="gd-grid">
        {TREES.map((t) => (
          <button key={t.id} className="ui-card gd-card-lg ui-lift" style={{ textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' }} onClick={() => onTree(t.id)}>
            <h3>{t.title}</h3><p>{t.ask}</p>
            {t.status === 'planned' && <span className="gd-meta"><span className="ui-pill ui-pill--gray">Δεν είναι ακόμη διαθέσιμο</span></span>}
          </button>
        ))}
      </div>
    </div>
  );
}
