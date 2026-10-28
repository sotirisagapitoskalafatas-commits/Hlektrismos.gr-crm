// Class names of the shared button (src/lib/ui.tsx Btn). Kept free of React so it can be unit-tested.
// Every button that has a background gets the soft 3D effect (.b3, src/styles/atlas-theme.css); `ghost` has none, so it doesn't.

export type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'ok' | 'brand';

export const BTN_MAP: Record<BtnVariant, string> = {
  primary: 'bg-[var(--ui-primary,#0066cc)] text-white hover:bg-[var(--ui-primary-hover,#0057b0)]',
  outline: 'bg-white text-ink border border-line hover:border-ink/30',
  ghost: 'text-ink/70 hover:text-ink hover:bg-ink/5',
  danger: 'bg-bad-600 text-white hover:bg-bad-600/90',
  ok: 'bg-ok-600 text-white hover:bg-ok-600/90',
  brand: 'bg-[var(--ui-primary,#0066cc)] text-white hover:bg-[var(--ui-primary-hover,#0057b0)]',
};

/** Variants without a background: no raised effect. */
export const FLAT_VARIANTS: readonly BtnVariant[] = ['ghost'];

// 44px hit target on touch devices only, so dense desktop tables keep their current height.
const BASE = 'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-medium disabled:pointer-events-none [@media(pointer:coarse)]:min-h-[44px]';

export function btnClassName(variant: BtnVariant, className = ''): string {
  const raised = FLAT_VARIANTS.includes(variant) ? 'transition-colors disabled:opacity-50' : 'b3';
  return `${BASE} ${raised} ${BTN_MAP[variant]} ${className}`.replace(/\s+/g, ' ').trim();
}

export const ICON_BTN_BASE = 'inline-flex items-center justify-center w-8 h-8 rounded-xl text-ink/50 hover:text-ink hover:bg-ink/5 transition-colors [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11';
/** Icon button with its own background (white chip): gets the raised effect. */
export const ICON_BTN_RAISED = 'b3 inline-flex items-center justify-center w-9 h-9 rounded-xl bg-white text-ink/70 border border-line hover:text-ink [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11';
