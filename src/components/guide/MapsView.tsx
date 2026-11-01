// Interactive process maps. The case map is generated from the application's own stages and transitions (guide/maps.ts); the others say what was verified.
import { useMemo } from 'react';
import { MAPS } from '@/guide/maps';
import type { MapNode } from '@/guide/maps';
import { LIBRARY } from '@/guide/catalog';
import { canOpenPage, PAGE_TITLES } from '@/lib/roles';
import type { Role } from '@/lib/roles';
import { useNav } from '@/lib/nav';
import type { GuideRole } from '@/guide/markdown';

export default function MapsView({ role, mapId, nodeId, onSelect, onOpen }: { role: GuideRole; mapId: string; nodeId: string | null; onSelect: (map: string, node: string | null) => void; onOpen: (id: string) => void }) {
  const { go } = useNav();
  const maps = useMemo(() => MAPS(), []);
  const map = maps.find((m) => m.id === mapId) ?? maps[0];
  const node: MapNode | undefined = map.nodes.find((n) => n.id === nodeId);
  const nextIds = new Set(node?.outcomes.map((o) => o.to).filter((x): x is string => !!x));
  const guideOk = (id: string | null) => !!id && !!LIBRARY.byId.get(id)?.meta.roles.includes(role);
  return (
    <div>
      <div className="gd-row" role="tablist" aria-label="Χάρτες διαδικασιών" style={{ marginTop: 0 }}>
        {maps.map((m) => <button key={m.id} role="tab" aria-selected={m.id === map.id} className="gd-chip" onClick={() => onSelect(m.id, null)}>{m.title}</button>)}
      </div>
      <p style={{ margin: '6px 0' }}>{map.lead}</p>
      <p className="gd-note"><span className={`ui-pill ${map.status === 'verified' ? 'ui-pill--green' : 'ui-pill--orange'}`}>{map.status === 'verified' ? 'Επαληθευμένος' : 'Μερικώς επαληθευμένος'}</span> {map.verified}</p>
      <p className="gd-note">Επιλέξτε ένα βήμα για να δείτε τι γίνεται, ποιος το κάνει και πού μπορεί να οδηγήσει. Τα βήματα με διακεκομμένο περίγραμμα είναι τα πιθανά επόμενα.</p>
      <div className="gd-flow" role="group" aria-label={`Βήματα: ${map.title}`}>
        {map.nodes.map((n) => (
          <button key={n.id} className="gd-node" data-kind={n.kind} data-next={nextIds.has(n.id) ? 'true' : undefined} aria-pressed={node?.id === n.id} onClick={() => onSelect(map.id, n.id)}>
            {n.title}<small>{n.kind === 'decision' ? 'απόφαση' : n.kind === 'end' ? 'τέλος' : 'βήμα'}</small>
          </button>
        ))}
      </div>
      {node ? (
        <section className="gd-detail" aria-live="polite" aria-label={`Λεπτομέρειες: ${node.title}`}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{node.title}</h3>
          <p style={{ margin: '6px 0' }}>{node.what}</p>
          <dl>
            <dt>Ποιος</dt><dd>{node.who}</dd>
            {node.needs.length > 0 && (<><dt>Τι χρειάζεται</dt><dd>{node.needs.join(' · ')}</dd></>)}
            {node.rule && (<><dt>Κανόνας εφαρμογής</dt><dd>{node.rule}</dd></>)}
          </dl>
          {node.warning && <div className="gd-callout gd-callout--warn"><p><strong>Μόνο προειδοποίηση: </strong>{node.warning}</p></div>}
          {node.outcomes.length > 0 && (
            <div><strong style={{ fontSize: 14 }}>Πιθανά αποτελέσματα</strong>
              <div style={{ marginTop: 6 }}>{node.outcomes.map((o) => o.to
                ? <button key={`${o.label}-${o.to}`} className="gd-chip" onClick={() => onSelect(map.id, o.to)}>{o.label} →</button>
                : <span key={o.label} className="gd-chip" style={{ cursor: 'default' }}>{o.label}</span>)}</div>
            </div>
          )}
          <div className="gd-row">
            {node.route && canOpenPage(node.route, role as Role) && <button className="atx-btn atx-btn-quiet" onClick={() => go(node.route!)}>Άνοιγμα: {PAGE_TITLES[node.route]}</button>}
            {guideOk(node.guide) && <button className="atx-btn atx-btn-quiet" onClick={() => onOpen(node.guide!)}>Διαβάστε τον οδηγό</button>}
          </div>
        </section>
      ) : <p className="gd-note" role="status">Δεν έχετε επιλέξει βήμα.</p>}
    </div>
  );
}
