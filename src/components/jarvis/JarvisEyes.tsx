/* JarvisEyes — independent SVG eye layer over the visor.
   Gaze (x,y in [-1,1]) translates the iris; blink scales the whole eye. */

import type { Gaze, JarvisState } from './types';

interface Props {
  gaze: Gaze;
  blink: boolean;
  state: JarvisState;
}

export function JarvisEyes({ gaze, blink, state }: Props) {
  const focused = state === 'responding' || state === 'thinking';
  const thinking = state === 'thinking';

  // Iris px offset (20 * max 0.55 ≈ 11px).
  const ix = gaze.x * 20;
  const iy = gaze.y * 14;

  const color = thinking ? '#A78BFA' : '#67E8FF';

  return (
    <g
      className="jv-eyes"
      transform={blink ? 'scale(1 0.12)' : undefined}
      style={{ transformOrigin: '64px 52px', transformBox: 'view-box' }}
    >
      {/* Left eye */}
      <g transform={`translate(${ix * 0.72} ${iy * 0.72})`}>
        <ellipse cx="48" cy="52" rx="15" ry="15" fill="#0B1524" opacity="0.55" />
        <circle cx="48" cy="52" r="11.5" fill={color} opacity={focused ? 1 : 0.9} />
        <circle cx="48" cy="52" r="6" fill="#0B1524" />
        <circle cx="51.5" cy="48.5" r="2.4" fill="#FFFFFF" opacity="0.9" />
      </g>
      {/* Right eye */}
      <g transform={`translate(${ix} ${iy})`}>
        <ellipse cx="80" cy="52" rx="15" ry="15" fill="#0B1524" opacity="0.55" />
        <circle cx="80" cy="52" r="11.5" fill={color} opacity={focused ? 1 : 0.9} />
        <circle cx="80" cy="52" r="6" fill="#0B1524" />
        <circle cx="83.5" cy="48.5" r="2.4" fill="#FFFFFF" opacity="0.9" />
      </g>
      {/* Brow lights (thinking) */}
      {thinking && (
        <>
          <circle cx="44" cy="34" r="2" fill="#67E8FF" opacity="0.35" />
          <circle cx="84" cy="34" r="2" fill="#67E8FF" opacity="0.35" />
        </>
      )}
    </g>
  );
}