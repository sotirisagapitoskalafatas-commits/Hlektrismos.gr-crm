import type { CSSProperties } from 'react';

export type WaveVariant = 'light-to-dark' | 'dark-to-light' | 'light-to-blue' | 'blue-to-dark' | 'renewable-green' | 'light-to-light';

const THEMES: Record<WaveVariant, { from: string; to: string; accent: string }> = {
  'light-to-dark': { from: '#f7faff', to: '#102033', accent: '#9edaf4' },
  'dark-to-light': { from: '#102033', to: '#f7faff', accent: '#8ed7f5' },
  'light-to-blue': { from: '#f7faff', to: '#e8f3ff', accent: '#83cfff' },
  'blue-to-dark': { from: '#e8f3ff', to: '#102033', accent: '#75d9f8' },
  'renewable-green': { from: '#f4f9f7', to: '#e9f4ee', accent: '#70b99c' },
  'light-to-light': { from: '#ffffff', to: '#f7faff', accent: '#c8e8ff' },
};

export default function WaveDivider({ variant = 'dark-to-light', className = '' }: { variant?: WaveVariant; className?: string }) {
  const theme = THEMES[variant];
  const style = {
    '--wave-from': theme.from,
    '--wave-to': theme.to,
    '--wave-accent': theme.accent,
  } as CSSProperties;

  return (
    <div className={'hlk-wave-divider ' + className} style={style} aria-hidden="true">
      <svg className="hlk-wave-layer hlk-wave-layer-a" viewBox="0 0 2880 140" preserveAspectRatio="none">
        <path fill="var(--wave-accent)" fillOpacity=".26" d="M0 54 C240 10 480 10 720 54 S1200 98 1440 54 S1920 10 2160 54 S2640 98 2880 54 L2880 140 L0 140 Z" />
      </svg>
      <svg className="hlk-wave-layer hlk-wave-layer-b" viewBox="0 0 2880 140" preserveAspectRatio="none">
        <path fill="var(--wave-to)" fillOpacity=".42" d="M0 76 C220 118 500 118 720 76 S1220 34 1440 76 S1940 118 2160 76 S2660 34 2880 76 L2880 140 L0 140 Z" />
      </svg>
      <svg className="hlk-wave-layer hlk-wave-layer-c" viewBox="0 0 2880 140" preserveAspectRatio="none">
        <path fill="var(--wave-to)" d="M0 88 C280 58 440 58 720 88 S1160 118 1440 88 S1880 58 2160 88 S2600 118 2880 88 L2880 140 L0 140 Z" />
      </svg>
    </div>
  );
}
