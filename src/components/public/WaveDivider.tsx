import type { CSSProperties } from 'react';
import '@/styles/landing.css';

/* Shared animated wave divider for every public page.

   variant="fill"  (default) Layered waves that BECOME the colour `fill`. Place it inside a `position:relative`
                   section (add the class `lp-wave-host`):
                     edge="bottom": sits on the section's bottom edge and rises into it; fill = colour of the section BELOW.
                     edge="top":    sits on the section's top edge and hangs into it; fill = colour of the section ABOVE.
                   Put it on the side of the boundary that has a photo/gradient, so the image shows between the crests
                   and the other side stays one solid, seamless colour.
   variant="lines" Thin flowing light lines only (no fill), for sections over images or the fixed sky background,
                   and for understated separators. Rendered in the normal flow.

   Each layer is a 2-period SVG translated by exactly one period with a CSS transform, so the loop is seamless and
   runs on the compositor (no JavaScript per frame). Decorative only: hidden from assistive tech, no pointer events,
   static under prefers-reduced-motion. */

type Size = 'sm' | 'md' | 'lg';

/* One period = 1440 units; `T` repeats the curve so the 2880-unit path is periodic. */
const wave = (y: number, a: number, phase = 0) => {
  const x0 = -phase;
  return `M${x0} ${y} Q${x0 + 360} ${y - a} ${x0 + 720} ${y} T${x0 + 1440} ${y} T${x0 + 2160} ${y} T${x0 + 2880} ${y} T${x0 + 3600} ${y}`;
};
const closed = (d: string) => `${d} V100 H-1440 Z`;

/* A quadratic crest only reaches half of `a`, so these give peaks at roughly 14, 34 and 51 of 100. */
const LAYERS = [
  { y: 44, a: 60, phase: 520, opacity: 0.26, dur: 46, rev: false },
  { y: 56, a: 44, phase: 180, opacity: 0.42, dur: 32, rev: true },
  { y: 68, a: 34, phase: 0, opacity: 1, dur: 22, rev: false },
];

export default function WaveDivider({
  fill = '#ffffff',
  edge = 'bottom',
  variant = 'fill',
  size = 'md',
  accent = '#36c6f4',
  className = '',
}: {
  fill?: string;
  edge?: 'bottom' | 'top';
  variant?: 'fill' | 'lines';
  size?: Size;
  accent?: string;
  className?: string;
}) {
  const style = { '--wave-fill': fill, '--wave-accent': accent } as CSSProperties;
  const cls = `lp-wave lp-wave--${variant} lp-wave--${size}${variant === 'fill' ? ` lp-wave--${edge}` : ''} ${className}`.trim();

  if (variant === 'lines') {
    return (
      <div className={cls} style={style} aria-hidden="true">
        {[{ y: 50, a: 56, phase: 300, dur: 40, rev: false, o: 0.35 }, { y: 54, a: 40, phase: 0, dur: 28, rev: true, o: 0.7 }, { y: 58, a: 26, phase: 700, dur: 34, rev: false, o: 0.3 }].map((l, i) => (
          <div key={i} className={`lp-wave__layer${l.rev ? ' lp-wave__layer--rev' : ''}`} style={{ animationDuration: `${l.dur}s` }}>
            <svg viewBox="0 0 2880 100" preserveAspectRatio="none" focusable="false">
              <path d={wave(l.y, l.a, l.phase)} fill="none" stroke="var(--wave-accent)" strokeOpacity={l.o} strokeWidth={i === 1 ? 2 : 1.25} vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cls} style={style} aria-hidden="true">
      {LAYERS.map((l, i) => (
        <div key={i} className={`lp-wave__layer${l.rev ? ' lp-wave__layer--rev' : ''}`} style={{ animationDuration: `${l.dur}s` }}>
          <svg viewBox="0 0 2880 100" preserveAspectRatio="none" focusable="false">
            {/* back layer is tinted with the accent so depth reads as blue light, not grey */}
            <path d={closed(wave(l.y, l.a, l.phase))} fill={i === 0 ? 'var(--wave-accent)' : 'var(--wave-fill)'} fillOpacity={i === 0 ? 0.2 : l.opacity} />
            {i === 2 && (
              /* the "energy" highlight riding the front crest */
              <path d={wave(l.y, l.a, l.phase)} fill="none" stroke="var(--wave-accent)" strokeOpacity="0.55" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
        </div>
      ))}
    </div>
  );
}
