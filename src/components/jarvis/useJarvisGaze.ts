/* Eye gaze logic — priority: responding/thinking > cursor > idle wander. */

import { useEffect, useRef, useState } from 'react';
import type { Gaze, JarvisState } from '@/components/jarvis/types';

export function useJarvisGaze(widgetRef: React.RefObject<HTMLElement | null>, state: JarvisState) {
  const [gaze, setGaze] = useState<Gaze>({ x: 0, y: -0.15 });
  const animated = useRef<Gaze>({ x: 0, y: -0.15 });

  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;

    let raf = 0;
    let pointer: { x: number; y: number } | null = null;
    let idleT = Math.random() * 1000;

    const onMove = (e: PointerEvent) => { pointer = { x: e.clientX, y: e.clientY }; };

    const idleGaze = (t: number): Gaze => ({
      x: Math.sin(t * 0.004) * 0.5,
      y: Math.sin(t * 0.007) * 0.35 - 0.1,
    });

    const loop = () => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      let target: Gaze;

      // 1. Responding / thinking → fixate on the user (toward viewport center).
      if (state === 'responding' || state === 'thinking' || state === 'typing') {
        const vcx = window.innerWidth / 2;
        const vcy = window.innerHeight / 2;
        target = clampGaze(vcx - cx, vcy - cy);
      }
      // 2. Hover / open → subtle curiosity toward pointer (or wander).
      else if (state === 'hover' || state === 'open') {
        target = pointer ? clampGaze(pointer.x - cx, pointer.y - cy) : idleGaze(idleT);
      }
      // 3. Cursor tracking (idle, pointer known).
      else if (pointer) {
        target = clampGaze(pointer.x - cx, pointer.y - cy);
      }
      // 4. Idle look-around — slow sine wander.
      else {
        target = idleGaze(idleT);
      }

      idleT += 1;

      // Smooth ease toward target.
      animated.current.x += (target.x - animated.current.x) * 0.12;
      animated.current.y += (target.y - animated.current.y) * 0.12;
      setGaze({ x: animated.current.x, y: animated.current.y });

      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [widgetRef, state]);

  return gaze;
}

function clampGaze(dx: number, dy: number): Gaze {
  const m = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1, 0.55 / m);
  return { x: dx * scale, y: dy * scale };
}