/* JarvisMascot — pure-SVG robot head with a dark glass visor.
   Eyes are a SEPARATE layer (JarvisEyes) so they animate independently. */

import type { Gaze, JarvisState } from './types';
import { JarvisEyes } from './JarvisEyes';

interface Props {
  gaze: Gaze;
  blink: boolean;
  state: JarvisState;
}

export function JarvisMascot({ gaze, blink, state }: Props) {
  const offline = state === 'offline';
  const muted = offline ? '#5B6B7F' : '';

  return (
    <svg className="jv-mascot" viewBox="0 0 128 96" aria-hidden="true">
      {/* Antenna */}
      <line x1="64" y1="14" x2="64" y2="26" stroke={offline ? '#5B6B7F' : '#67E8FF'} strokeWidth="2.5" strokeLinecap="round">
        {state === 'thinking' && <animate attributeName="opacity" values="1;0.3;1" dur="0.9s" repeatCount="indefinite" />}
      </line>
      <circle cx="64" cy="11" r="4.5" fill={offline ? '#5B6B7F' : '#67E8FF'}>
        {state === 'responding' && <animate attributeName="r" values="4;6;4" dur="1s" repeatCount="indefinite" />}
      </circle>

      {/* Head / helmet with glass visor */}
      <rect x="16" y="24" width="96" height="66" rx="26" fill={muted || 'url(#jv-helmet)'} />
      <rect x="16" y="24" width="96" height="66" rx="26" fill="none" stroke="rgba(103,232,255,0.28)" strokeWidth="1.5" />
      {/* Visor glass */}
      <rect x="26" y="34" width="76" height="40" rx="16" fill="url(#jv-visor)" />
      <rect x="26" y="34" width="76" height="40" rx="16" fill="none" stroke="rgba(103,232,255,0.5)" strokeWidth="1.5" />

      {/* Eyes on top of visor */}
      <JarvisEyes gaze={gaze} blink={blink} state={state} />

      {/* Mouth line */}
      {state === 'responding' && (
        <rect x="54" y="74" width="20" height="3" rx="1.5" fill="#67E8FF" opacity="0.8" />
      )}

      <defs>
        <linearGradient id="jv-helmet" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1B2E4A" />
          <stop offset="1" stopColor="#0D1B2D" />
        </linearGradient>
        <linearGradient id="jv-visor" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0B1524" stopOpacity="0.95" />
          <stop offset="1" stopColor="#102033" stopOpacity="0.7" />
        </linearGradient>
      </defs>
    </svg>
  );
}