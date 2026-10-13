/* JarvisMascot — the 3D mascot as a layered object:
     body  : eyeless WebP (glossy blue + chrome + leaf), transparent background
     eyes  : separate SVG layer; iris, bright core, lids and brows are
             independent elements driven by mascotController (no React renders)
   If the body image fails to load we fall back to the full image (eyes baked
   in) and drop the SVG eye layer, so there are never two sets of eyes. */

import { useEffect, useId, useRef, useState } from 'react';
import { mascot } from './mascotController';
import { JARVIS_BODY_SRC, JARVIS_FULL_SRC } from './types';

const EYES = [
  { side: 'L', x: 195.1, y: 252.5 },
  { side: 'R', x: 319.9, y: 252.5 },
] as const;

export function JarvisMascot({ role }: { role: 'launcher' | 'avatar' }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<'body' | 'full' | 'none'>('body');
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (n: string) => `jv${uid}${n}`;

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    return mascot.register(el, role);
  }, [role, src]);

  const eyesLayer = src === 'body';

  return (
    <div ref={rootRef} className={`jv-orb jv-orb-${role}`} data-role={role}>
      <div className="jv-float">
        <div className="jv-tilt" data-jv="tilt">
          <div className="jv-aura" data-jv="aura" />
          {role === 'launcher' && <div className="jv-ring" data-jv="ring" />}
          <div className="jv-glass" />
          {src !== 'none' ? (
            <div className="jv-mascot" data-jv="mascot">
              <img
                className="jv-img"
                src={src === 'body' ? JARVIS_BODY_SRC : JARVIS_FULL_SRC}
                alt=""
                draggable={false}
                decoding="async"
                onError={() => setSrc(s => (s === 'body' ? 'full' : 'none'))}
              />
              {eyesLayer && (
                <svg className="jv-eyes" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
                  <defs>
                    <radialGradient id={id('halo')}>
                      <stop offset="0" stopColor="#35DFFF" stopOpacity="0.55" />
                      <stop offset="0.55" stopColor="#1769FF" stopOpacity="0.22" />
                      <stop offset="1" stopColor="#1769FF" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id={id('iris')}>
                      <stop offset="0" stopColor="#F2FFFF" />
                      <stop offset="0.32" stopColor="#9CF4FF" />
                      <stop offset="0.66" stopColor="#35DFFF" />
                      <stop offset="0.9" stopColor="#1790EA" />
                      <stop offset="1" stopColor="#1790EA" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id={id('core')}>
                      <stop offset="0" stopColor="#FFFFFF" />
                      <stop offset="0.6" stopColor="#D8FCFF" stopOpacity="0.9" />
                      <stop offset="1" stopColor="#9CF4FF" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id={id('acc')} data-jv="accentGrad" color="#FFB02E">
                      <stop offset="0" stopColor="currentColor" stopOpacity="0.95" />
                      <stop offset="0.75" stopColor="currentColor" stopOpacity="0.7" />
                      <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                    </radialGradient>
                    <radialGradient id={id('lid')} cx="0.5" cy="0.3" r="0.8">
                      <stop offset="0" stopColor="#03296A" />
                      <stop offset="1" stopColor="#021F55" />
                    </radialGradient>
                    {EYES.map(e => (
                      <clipPath key={e.side} id={id(`sock${e.side}`)}>
                        <ellipse cx="0" cy="0" rx="36" ry="34" />
                      </clipPath>
                    ))}
                  </defs>

                  {EYES.map(e => (
                    <g key={e.side}>
                      {/* brow — hidden in idle, shaped per expression */}
                      <g data-jv={`brow${e.side}`} transform={`translate(${e.x} ${e.y - 48})`} opacity="0">
                        <path d="M -17 3 Q 0 -6 17 3" fill="none" stroke="#7AF0FF" strokeWidth="5.5" strokeLinecap="round" />
                      </g>
                      <g data-jv={`eye${e.side}`} transform={`translate(${e.x} ${e.y})`}>
                        <circle data-jv={`halo${e.side}`} r="48" fill={`url(#${id('halo')})`} opacity="0.7" />
                        {/* everything that moves inside the eye is clipped to the socket */}
                        <g clipPath={`url(#${id(`sock${e.side}`)})`}>
                          <g data-jv={`iris${e.side}`}>
                            <circle r="22" fill={`url(#${id('iris')})`} />
                            <circle data-jv={`acc${e.side}`} r="22" fill={`url(#${id('acc')})`} opacity="0" />
                            <circle cx="-7.5" cy="-8" r="3.4" fill="#FFFFFF" opacity="0.8" />
                            <g data-jv={`core${e.side}`}>
                              <circle r="9" fill={`url(#${id('core')})`} />
                            </g>
                          </g>
                          {/* lower lid — rises for happy eyes */}
                          <ellipse data-jv={`lid${e.side}`} cx="0" cy="0" rx="46" ry="30" transform="translate(0 66)" fill={`url(#${id('lid')})`} />
                        </g>
                      </g>
                    </g>
                  ))}
                </svg>
              )}
            </div>
          ) : (
            <span className="jv-fallback" aria-hidden="true">⚡</span>
          )}
        </div>
      </div>
    </div>
  );
}
