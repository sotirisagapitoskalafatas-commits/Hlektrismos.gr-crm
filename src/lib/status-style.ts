// One mapping from lead statuses and case stages to the pill colours of the redesign.
// Colours are the single source for the `.ui-pill--*` classes in src/styles/atlas-theme.css (a test keeps them in
// sync) and every pair is ≥ 4.5:1 (WCAG AA). Always render the text label too: colour is never the only signal.

export type StatusTone = 'blue' | 'purple' | 'green' | 'teal' | 'orange' | 'red' | 'gray';

export const PILL_COLORS: Record<StatusTone, { bg: string; fg: string }> = {
  blue: { bg: '#e8f1fb', fg: '#0057b0' },
  purple: { bg: '#f1eafa', fg: '#5b33a0' },
  green: { bg: '#e6f4ea', fg: '#1f7a3d' },
  teal: { bg: '#e0f3f4', fg: '#0e6b72' },
  orange: { bg: '#fdf0dc', fg: '#8a5000' },
  red: { bg: '#fce8e6', fg: '#b3261e' },
  gray: { bg: '#f0f0f3', fg: '#3a3a3c' },
};

// Red is reserved for overdue / missing / lost; green for qualified / approved / done.
export const LEAD_STATUS_TONE: Record<string, StatusTone> = {
  new: 'blue',
  contacted: 'purple',
  qualified: 'green',
  meeting: 'teal',
  offer: 'orange',
  converted: 'green',
  lost: 'red',
  unqualified: 'gray',
  duplicate: 'gray',
};

export const STAGE_TONE: Record<string, StatusTone> = {
  new: 'blue',
  contacted: 'purple',
  offer: 'orange',
  application: 'teal',
  signed: 'teal',
  document_check: 'orange',
  submitted: 'purple',
  activation: 'blue',
  completed: 'green',
  lost: 'red',
  cancelled: 'red',
};

export const toneForLeadStatus = (id?: string | null): StatusTone => LEAD_STATUS_TONE[id ?? ''] ?? 'gray';
export const toneForStage = (id?: string | null): StatusTone => STAGE_TONE[id ?? ''] ?? 'gray';

/** Class names for a pill of the given tone (styles in atlas-theme.css). */
export const pillClass = (tone: StatusTone): string => `ui-pill ui-pill--${tone}`;
