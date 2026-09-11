/* JarvisRing — animated sonar ring around the dock, colored by state. */

import type { JarvisState } from './types';

const RING_COLOR: Partial<Record<JarvisState, string>> = {
  idle: '#67E8FF',
  hover: '#67E8FF',
  thinking: '#A78BFA',
  responding: '#3B82F6',
  open: '#22C55E',
  success: '#22C55E',
  error: '#EF4444',
  offline: '#94A3B8',
};

export function JarvisRing({ state, pulse }: { state: JarvisState; pulse: boolean }) {
  const color = RING_COLOR[state] ?? '#67E8FF';
  const active = state !== 'offline' && state !== 'dragging';

  return (
    <svg className="jv-ring" viewBox="0 0 96 96" aria-hidden="true">
      {active && pulse && (
        <>
          <circle cx="48" cy="48" r="36" fill="none" stroke={color} strokeOpacity="0.7" strokeWidth="2" className="jv-ring-pulse" />
          <circle cx="48" cy="48" r="36" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1.5" className="jv-ring-pulse jv-ring-pulse-2" />
        </>
      )}
      <circle cx="48" cy="48" r="38" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1.5" />
    </svg>
  );
}