/* Draggable posture for the JARVIS dock — pointer drag + localStorage. */

import { useCallback, useRef, useState } from 'react';

export interface DockPos { x: number; y: number }

const STORAGE_KEY = 'atlas.jarvis.pos';

interface DragState {
  dragging: boolean;
  start: () => void;
  move: (clientX: number, clientY: number) => void;
  end: () => void;
}

export function useJarvisPosition(size: { w: number; h: number }, bottomOffset: number): [DockPos, DragState] {
  const [pos, setPos] = useState<DockPos>(() => loadDock(size, bottomOffset));
  const posRef = useRef(pos);
  const drag = useRef({ on: false, dx: 0, dy: 0 });

  posRef.current = pos;

  const save = useCallback((p: DockPos) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
  }, []);

  const start = useCallback(() => {
    drag.current.on = true;
  }, []);

  const move = useCallback((clientX: number, clientY: number) => {
    if (!drag.current.on) return;
    const { w, h } = size;
    const x = Math.max(0, Math.min(window.innerWidth - w, clientX - w / 2));
    const y = Math.max(0, Math.min(window.innerHeight - h, clientY - h / 2));
    setPos({ x, y });
  }, [size]);

  const end = useCallback(() => {
    if (!drag.current.on) return;
    drag.current.on = false;
    save(posRef.current);
  }, [save]);

  return [pos, { dragging: drag.current.on, start, move, end }];
}

function loadDock(size: { w: number; h: number }, bottomOffset: number): DockPos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as DockPos;
      if (typeof p.x === 'number' && typeof p.y === 'number') return p;
    }
  } catch { /* ignore */ }
  return { x: window.innerWidth - size.w - 16, y: window.innerHeight - size.h - bottomOffset };
}