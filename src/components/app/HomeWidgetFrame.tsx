// One box of the Home grid. Outside edit mode it is a transparent wrapper (grid span from the size). In edit mode it
// shows the controls: drag handle, move earlier/later, size, remove. Every action is a real button (keyboard and touch
// friendly); dragging is an extra for the mouse. The content is inert while editing so a click never navigates away.
import type { DragEvent, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, GripVertical, X } from 'lucide-react';
import type { TileSize } from '@/lib/preferences';
import { SIZE_LABEL, widgetMeta } from '@/lib/home-widgets';

interface Props {
  id: string;
  size: TileSize;
  editing: boolean;
  index: number;
  count: number;
  canRemove: boolean;
  dragging: boolean;
  onMove: (delta: -1 | 1) => void;
  onSize: (s: TileSize) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
  children: ReactNode;
}

export default function HomeWidgetFrame(p: Props) {
  const meta = widgetMeta(p.id);
  const title = meta?.title ?? p.id;
  if (!p.editing) return <div className="home-w" data-widget={p.id} data-size={p.size}>{p.children}</div>;

  const over = (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const inert = { inert: '' } as Record<string, string>; // React 18 has no typed `inert`; the attribute still works
  return (
    <div className={`home-w is-editing ${p.dragging ? 'is-dragging' : ''}`} data-widget={p.id} data-size={p.size}
      draggable onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); p.onDragStart(); }}
      onDragEnd={p.onDragEnd} onDragOver={over} onDrop={(e) => { e.preventDefault(); p.onDropOn(); }}>
      <div className="home-w__bar" role="group" aria-label={`Ρυθμίσεις κουτιού ${title}`}>
        <span className="home-w__grip" aria-hidden="true"><GripVertical size={16} /></span>
        <span className="home-w__title">{title}</span>
        <span className="home-w__tools">
          <button type="button" onClick={() => p.onMove(-1)} disabled={p.index === 0} aria-label={`${title}: μετακίνηση νωρίτερα`} title="Νωρίτερα"><ArrowLeft size={15} aria-hidden="true" /></button>
          <button type="button" onClick={() => p.onMove(1)} disabled={p.index === p.count - 1} aria-label={`${title}: μετακίνηση αργότερα`} title="Αργότερα"><ArrowRight size={15} aria-hidden="true" /></button>
          <span className="home-w__sizes" role="group" aria-label={`${title}: μέγεθος`}>
            {(meta?.sizes ?? [p.size]).map((s) => (
              <button key={s} type="button" aria-pressed={p.size === s} onClick={() => p.onSize(s)} aria-label={`${title}: ${SIZE_LABEL[s]}`} title={SIZE_LABEL[s]}>{s}</button>
            ))}
          </span>
          <button type="button" onClick={p.onRemove} disabled={!p.canRemove} aria-label={`${title}: αφαίρεση`} title="Αφαίρεση"><X size={15} aria-hidden="true" /></button>
        </span>
      </div>
      <div className="home-w__body" aria-hidden="true" {...inert}>{p.children}</div>
    </div>
  );
}
