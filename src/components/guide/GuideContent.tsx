// Renders a parsed guide. React escapes every string, and the parser only produces the block and inline types below, so a guide can not inject markup.
import type { Block, GuideDoc, Inline } from '@/guide/markdown';
import { embed } from '@/guide/embeds';
import type { PageKey } from '@/lib/roles';
import { PAGE_TITLES } from '@/lib/roles';
import { useNav } from '@/lib/nav';

export function Inlines({ items, onGuide }: { items: Inline[]; onGuide: (id: string) => void }) {
  const { go } = useNav();
  return (
    <>
      {items.map((x, i) => {
        switch (x.t) {
          case 'b': return <strong key={i}>{x.v}</strong>;
          case 'code': return <code key={i}>{x.v}</code>;
          case 'label': return <span key={i} className="gd-label-ui">{x.v}</span>;
          case 'guide': return <button key={i} type="button" className="gd-link" onClick={() => onGuide(x.id)}>{x.v}</button>;
          case 'route': return <button key={i} type="button" className="gd-link" onClick={() => go(x.page as PageKey)} title={PAGE_TITLES[x.page as PageKey]}>{x.v}</button>;
          default: return <span key={i}>{x.v}</span>;
        }
      })}
    </>
  );
}

export function EmbedTable({ name }: { name: string }) {
  const t = embed(name);
  if (!t) return null;
  return (
    <>
      <div className="gd-tablewrap" role="region" aria-label={`Πίνακας: ${name}`} tabIndex={0}>
        <table className="gd-table">
          <thead><tr>{t.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
          <tbody>{t.rows.map((r, i) => <tr key={i}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody>
        </table>
      </div>
      {t.note && <p className="gd-note">{t.note}</p>}
    </>
  );
}

export default function GuideContent({ doc, onGuide }: { doc: GuideDoc; onGuide: (id: string) => void }) {
  const render = (b: Block, i: number) => {
    switch (b.t) {
      case 'h2': return <h2 key={i} id={b.id}>{b.text}</h2>;
      case 'h3': return <h3 key={i}>{b.text}</h3>;
      case 'p': return <p key={i}><Inlines items={b.inline} onGuide={onGuide} /></p>;
      case 'ul': return <ul key={i}>{b.items.map((it, j) => <li key={j}><Inlines items={it} onGuide={onGuide} /></li>)}</ul>;
      case 'steps': return <ol key={i}>{b.items.map((it, j) => <li key={j}><Inlines items={it} onGuide={onGuide} /></li>)}</ol>;
      case 'callout': return <div key={i} className={`gd-callout gd-callout--${b.tone}`} role={b.tone === 'warn' ? 'note' : undefined}><p><Inlines items={b.inline} onGuide={onGuide} /></p></div>;
      case 'table': return (
        <div key={i} className="gd-tablewrap" role="region" aria-label="Πίνακας" tabIndex={0}>
          <table className="gd-table">
            <thead><tr>{b.head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
            <tbody>{b.rows.map((r, a) => <tr key={a}>{r.map((c, j) => (j === 0 ? <th key={j} scope="row"><Inlines items={c} onGuide={onGuide} /></th> : <td key={j}><Inlines items={c} onGuide={onGuide} /></td>))}</tr>)}</tbody>
          </table>
        </div>
      );
      case 'embed': return <EmbedTable key={i} name={b.name} />;
    }
  };
  return <>{doc.blocks.map(render)}</>;
}
