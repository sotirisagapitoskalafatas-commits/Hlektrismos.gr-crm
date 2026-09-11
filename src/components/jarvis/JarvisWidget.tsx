/* ------------------------------------------------------------------ */
/*  JarvisWidget — floating AI assistant dock.                         */
/*  Layer 1: ALIVE (ring + mascot + drag + persistence + panel).       */
/*  Layer 2: USEFUL — real chat via useJarvisChat → `chat` edge        */
/*  function (Gemini + tariff RAG), visitor memory, callback leads.    */
/*  `onSend` remains an override seam for tests/previews.              */
/* ------------------------------------------------------------------ */

import { useEffect, useRef, useState } from 'react';
import { JarvisMascot } from './JarvisMascot';
import { JarvisRing } from './JarvisRing';
import { useJarvisGaze } from './useJarvisGaze';
import { useJarvisBlink } from './useJarvisBlink';
import { useJarvisPosition } from './useJarvisPosition';
import { useJarvisChat } from '@/lib/jarvis-chat';
import type { JarvisState } from './types';

const FAB = { w: 96, h: 96 };

const QUICK_STARTERS = ['Ρεύμα', 'Αέριο', 'Φωτοβολταϊκά', 'Ζητώ κλήση'];

export function JarvisWidget({ bottomOffset = 88, onSend }: {
  bottomOffset?: number;
  onSend?: (text: string) => Promise<string>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<JarvisState>('idle');
  const [open, setOpen] = useState(false);
  const chat = useJarvisChat();
  const [input, setInput] = useState('');
  const [pulse, setPulse] = useState(true);

  const [pos, drag] = useJarvisPosition(FAB, bottomOffset);
  const gaze = useJarvisGaze(wrapRef, state);
  const { blink, doBlink } = useJarvisBlink();

  const moved = useRef(false);
  const lastPtr = useRef<{ x: number; y: number } | null>(null);

  /* Keep pulse going while idle; slow down once open. */
  useEffect(() => {
    if (!open) return;
    const stop = window.setTimeout(() => setPulse(false), 1500);
    return () => window.clearTimeout(stop);
  }, [open]);

  const transition = (s: JarvisState) => {
    setState(s);
    if (['responding', 'thinking', 'opening'].includes(s)) doBlink();
  };

  const toggle = () => {
    if (drag.dragging || moved.current) return;
    setOpen(o => {
      const next = !o;
      if (next) {
        transition('opening');
        window.setTimeout(() => transition('open'), 280);
      } else {
        transition('idle');
      }
      return next;
    });
  };

  const submit = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    setInput('');
    transition('typing');
    await new Promise(r => window.setTimeout(r, 380));
    transition('thinking');
    try {
      if (onSend) {
        chat.push('user', trimmed);
        chat.push('jarvis', await onSend(trimmed));
      } else {
        chat.push('jarvis', await chat.send(trimmed));
      }
      transition('success');
    } catch {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        chat.push('jarvis', 'Φαίνεται πως είστε εκτός σύνδεσης. Θα απαντήσω μόλις επανέλθει το δίκτυο. 📡');
        transition('offline');
      } else {
        chat.push('jarvis', 'Συγγνώμη, παρουσιάστηκε μια διακοπή. Δοκιμάστε ξανά σε λίγο. 🔄');
        transition('error');
      }
    }
    window.setTimeout(() => setState(s => (['success', 'error', 'offline'].includes(s) ? 'open' : s)), 900);
  };

  return (
    <div ref={wrapRef} className="jv-dock"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={e => {
        drag.start();
        moved.current = false;
        lastPtr.current = { x: e.clientX, y: e.clientY };
        transition('dragging');
      }}
      onPointerMove={e => {
        if (drag.dragging) {
          const p = lastPtr.current;
          if (p && (Math.abs(e.clientX - p.x) > 4 || Math.abs(e.clientY - p.y) > 4)) moved.current = true;
          drag.move(e.clientX, e.clientY);
        }
      }}
      onPointerUp={() => { drag.end(); transition(open ? 'open' : 'idle'); }}
      onPointerLeave={() => { drag.end(); if (!open) transition('idle'); }}
      data-state={state}>
      {/* FAB (ring + mascot) */}
      <button
        className={`jv-fab ${open ? 'jv-fab-open' : ''}`}
        aria-label={open ? 'Κλείσιμο JARVIS' : 'Άνοιγμα JARVIS'}
        aria-expanded={open}
        onMouseEnter={() => { if (!open && !drag.dragging) transition('hover'); }}
        onMouseLeave={() => { if (!open && !drag.dragging) transition('idle'); }}
        onClick={toggle}
        style={{ cursor: drag.dragging ? 'grabbing' : 'grab' }}>
        <JarvisRing state={state} pulse={pulse} />
        <div className="jv-fab-inner">
          <JarvisMascot gaze={gaze} blink={blink} state={state} />
        </div>
      </button>

      {/* Panel */}
      {open && (
        <div className="jv-panel" role="dialog" aria-label="JARVIS βοηθός"
          style={panelStyle(pos, FAB.w, FAB.h)}>
          <div className="jv-panel-head">
            <div className="jv-panel-avatar">
              <JarvisMascot gaze={{ x: 0, y: -0.1 }} blink={false} state={state} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-white tracking-tight">JARVIS</div>
              <div className="text-[11px] text-white/50 capitalize">{statusLabel(state)}</div>
            </div>
            <button className="jv-close" onClick={toggle} aria-label="Κλείσιμο">
              ✕
            </button>
          </div>

          <div className="jv-panel-body">
            {chat.messages.map(m => (
              <div key={m.id} className={`jv-msg ${m.from === 'user' ? 'jv-msg-user' : 'jv-msg-jarvis'}`}>
                {m.text}
              </div>
            ))}
            {(state === 'thinking' || state === 'typing') && (
              <div className="jv-msg jv-msg-jarvis">
                <span className="jv-typing"><i /><i /><i /></span>
              </div>
            )}
          </div>

          {chat.messages.length <= 1 && (
            <div className="jv-chips">
              {QUICK_STARTERS.map(q => (
                <button key={q} type="button" className="jv-chip" onClick={() => submit(q)}>
                  {q === 'Ζητώ κλήση' ? '📞' : q === 'Ρεύμα' ? '⚡' : q === 'Αέριο' ? '🔥' : '☀️'} {q}
                </button>
              ))}
            </div>
          )}

          <form className="jv-panel-input" onSubmit={e => { e.preventDefault(); submit(input); }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Γράψτε μήνυμα…"
              aria-label="Μήνυμα προς JARVIS"
            />
            <button type="submit" aria-label="Αποστολή" disabled={!input.trim()}>➤</button>
          </form>
        </div>
      )}
    </div>
  );
}

const PANEL_W = 320;
const PANEL_H = 440;

function panelStyle(pos: { x: number; y: number }, fabW: number, fabH: number): React.CSSProperties {
  const right = Math.max(8, Math.min(16, window.innerWidth - (pos.x + fabW)));
  const left = window.innerWidth - (pos.x + fabW) < 330
    ? pos.x + fabW + 12
    : undefined;
  const below = pos.y > window.innerHeight - PANEL_H - 40;
  const style: React.CSSProperties = {
    position: 'fixed',
    width: PANEL_W,
    maxWidth: 'calc(100vw - 24px)',
    height: PANEL_H,
    maxHeight: 'calc(100dvh - 140px)',
    zIndex: 99,
  };
  if (left !== undefined) {
    style.left = Math.min(left, window.innerWidth - 330);
    style.right = undefined;
  } else {
    style.right = right;
    delete style.left;
  }
  if (below) {
    style.top = Math.max(8, pos.y + fabH + 12);
    style.bottom = undefined;
  } else {
    style.bottom = Math.max(8, window.innerHeight - pos.y + 12);
    style.top = undefined;
  }
  return style;
}

function statusLabel(s: JarvisState): string {
  switch (s) {
    case 'idle': return 'σε ετοιμότητα';
    case 'hover': return 'σε ετοιμότητα';
    case 'dragging': return 'μετακίνηση';
    case 'opening': return 'ενεργοποίηση…';
    case 'open': return 'online';
    case 'typing': return 'γράφει…';
    case 'thinking': return 'σκέφτεται…';
    case 'responding': return 'απαντά';
    case 'success': return 'ολοκληρώθηκε';
    case 'error': return 'σφάλμα';
    case 'offline': return 'offline';
  }
}