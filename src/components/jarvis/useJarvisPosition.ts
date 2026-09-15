/* Draggable posture for the JARVIS dock — pointer drag + localStorage. */

import { useCallback, useEffect, useRef, useState } from 'react';

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

  const clampToViewport = useCallback((p: DockPos): DockPos => {
    const vp = viewport();
    return {
      x: Math.max(0, Math.min(vp.w - size.w - 12, p.x)),
      y: Math.max(0, Math.min(vp.h - size.h - bottomOffset, p.y)),
    };
  }, [size.w, size.h, bottomOffset]);

  const start = useCallback(() => {
    drag.current.on = true;
  }, []);

  const move = useCallback((clientX: number, clientY: number) => {
    if (!drag.current.on) return;
    setPos(clampToViewport({ x: clientX - size.w / 2, y: clientY - size.h / 2 }));
  }, [clampToViewport, size.w, size.h]);

  const end = useCallback(() => {
    if (!drag.current.on) return;
    drag.current.on = false;
    save(posRef.current);
  }, [save]);

  /* Re-clamp the dock into the visible viewport whenever the browser UI,
     on-screen keyboard, or orientation changes the usable area. */
  useEffect(() => {
    let raf = 0;
    const clamp = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = clampToViewport(posRef.current);
        if (next.x !== posRef.current.x || next.y !== posRef.current.y) {
          setPos(next);
          save(next);
        }
      });
    };
    const vv = window.visualViewport;
    vv?.addEventListener('resize', clamp);
    vv?.addEventListener('scroll', clamp);
    window.addEventListener('resize', clamp);
    window.addEventListener('orientationchange', clamp);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', clamp);
      vv?.removeEventListener('scroll', clamp);
      window.removeEventListener('resize', clamp);
      window.removeEventListener('orientationchange', clamp);
    };
  }, [clampToViewport, save]);

  return [pos, { dragging: drag.current.on, start, move, end }];
}

function viewport(): { w: number; h: number } {
  if (window.visualViewport) {
    const vv = window.visualViewport;
    if (vv.width && vv.height) return { w: vv.width, h: vv.height };
  }
  return { w: window.innerWidth, h: window.innerHeight };
}

function loadDock(size: { w: number; h: number }, bottomOffset: number): DockPos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as DockPos;
      if (typeof p.x === 'number' && typeof p.y === 'number') return p;
    }
  } catch { /* ignore */ }
  const vp = viewport();
  return { x: vp.w - size.w - 12, y: vp.h - size.h - bottomOffset };
}