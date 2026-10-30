import { ComponentType, ReactNode, RefObject, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Zap } from 'lucide-react';
import { stageLabel } from './roles';
import { ICON_BTN_BASE, ICON_BTN_RAISED, btnClassName } from './btn-style';
import type { BtnVariant } from './btn-style';

export type IconType = ComponentType<{ className?: string }>;

/* ---------------- Micro mono label ---------------- */
export function Micro({ children, className = '', tone = 'muted' }: {
  children: ReactNode; className?: string;
  tone?: 'ink' | 'muted' | 'brand' | 'ok' | 'bad' | 'warn';
}) {
  const tones: Record<string, string> = {
    ink: 'text-ink/70', muted: 'text-ink/40', brand: 'text-brand-600',
    ok: 'text-ok-600', bad: 'text-bad-600', warn: 'text-warn-600',
  };
  return <span className={`micro ${tones[tone]} ${className}`}>{children}</span>;
}

/* ---------------- Card ---------------- */
export function Card({ children, className = '', pad = true }: {
  children: ReactNode; className?: string; pad?: boolean;
}) {
  return <div className={`ui-card ${pad ? 'p-5' : ''} ${className}`}>{children}</div>;
}

export function CardHeader({ micro, title, action, className = '' }: {
  micro?: string; title?: string; action?: ReactNode; className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 mb-4 ${className}`}>
      <div>
        {micro && <Micro className="mb-1">{micro}</Micro>}
        {title && <h3 className="text-[15px] font-semibold text-ink tracking-tight">{title}</h3>}
      </div>
      {action}
    </div>
  );
}

/* ---------------- Pills ---------------- */
export type PillTone = 'green' | 'amber' | 'red' | 'blue' | 'gray' | 'ink';
// Same colours as the status pills everywhere else (ui-pill--*); «amber» is the orange tone, «ink» the dark chip.
const PILL_MAP: Record<PillTone, string> = {
  green: 'ui-pill ui-pill--green',
  amber: 'ui-pill ui-pill--orange',
  red: 'ui-pill ui-pill--red',
  blue: 'ui-pill ui-pill--blue',
  gray: 'ui-pill ui-pill--gray',
  ink: 'ui-pill ui-pill--ink',
};
export function Pill({ children, tone = 'gray', className = '' }: {
  children: ReactNode; tone?: PillTone; className?: string;
}) {
  return <span className={`${PILL_MAP[tone]} ${className}`}>{children}</span>;
}

const STAGE_TONE: Record<string, PillTone> = {
  new: 'gray', contacted: 'blue', offer: 'blue', application: 'blue',
  signed: 'amber', document_check: 'amber', submitted: 'amber',
  activation: 'green', completed: 'green', lost: 'red', cancelled: 'red',
};
export function StagePill({ stage }: { stage: string }) {
  return <Pill tone={STAGE_TONE[stage] ?? 'gray'}>{stageLabel(stage)}</Pill>;
}

/* ---------------- Buttons ---------------- */
export type { BtnVariant };
export function Btn({ children, onClick, variant = 'primary', className = '', disabled, type = 'button', title }: {
  children: ReactNode; onClick?: () => void; variant?: BtnVariant;
  className?: string; disabled?: boolean; type?: 'button' | 'submit'; title?: string;
}) {
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick}
      className={btnClassName(variant, className)}>
      {children}
    </button>
  );
}

export function IconBtn({ children, onClick, title, className = '', raised = false }: {
  children: ReactNode; onClick?: () => void; title?: string; className?: string;
  /** A white chip with the raised effect; the default stays background-less (no effect). */
  raised?: boolean;
}) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick}
      className={`${raised ? ICON_BTN_RAISED : ICON_BTN_BASE} ${className}`}>
      {children}
    </button>
  );
}

/* ---------------- Inputs ---------------- */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="micro text-ink/40 mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

/* ---------------- Modal ---------------- */
// Accessible dialog: role="dialog" + aria-modal, labelled by its title, Esc closes, Tab stays inside, focus moves in on
// open and returns to what had it on close, the page behind does not scroll. On a phone it is a bottom sheet.
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let scrollLocks = 0;

/** Dialog behaviour for any overlay panel: focus in on open and back on close, Esc closes, Tab stays inside, no page scroll. */
export function useDialogBehavior(open: boolean, panel: RefObject<HTMLElement>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    if (scrollLocks++ === 0) document.body.style.overflow = 'hidden';
    // focus the first field, else the panel itself (a dialog must never leave focus behind it)
    const first = panel.current?.querySelector<HTMLElement>('input:not([type="hidden"]), select, textarea');
    (first ?? panel.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) { e.preventDefault(); return; }
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && (document.activeElement === head || document.activeElement === panel.current)) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (--scrollLocks === 0) document.body.style.overflow = '';
      if (before && document.contains(before)) before.focus({ preventScroll: true });
    };
  }, [open]);

}

export function Modal({ open, onClose, title, micro, children, wide }: {
  open: boolean; onClose: () => void; title: string; micro?: string; children: ReactNode; wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogBehavior(open, panel, onClose);

  if (!open) return null;
  // Portal to <body>: the app content is wrapped in a `.animate-fadein` div
  // whose fill-mode leaves a `transform` applied, which would otherwise make
  // that wrapper the containing block for this `position: fixed` overlay and
  // clip the modal inside the content pane instead of the full viewport.
  return createPortal(
    <div className="ui-modal-overlay" onClick={onClose}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`ui-card ui-modal ${wide ? 'ui-modal--wide' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            {micro && <Micro className="mb-1">{micro}</Micro>}
            <h2 id={titleId} className="text-lg font-semibold text-ink tracking-tight">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Κλείσιμο"
            className="text-ink/50 hover:text-ink p-2.5 -m-2 sm:p-1 sm:m-0 rounded-md hover:bg-ink/5">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Empty state / spinner ---------------- */
export function EmptyState({ icon: Icon, title, hint }: { icon: IconType; title: string; hint?: string }) {
  return (
    <div className="text-center py-10 px-4" role="status">
      <div className="w-11 h-11 mx-auto rounded-2xl bg-ink/5 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-ink/45" />
      </div>
      <p className="text-sm font-medium text-ink/75">{title}</p>
      {hint && <p className="text-xs text-ink/50 mt-1">{hint}</p>}
    </div>
  );
}

/** A failed load: says so plainly and offers the retry (never a silent blank). */
export function ErrorState({ title = 'Δεν ήταν δυνατή η φόρτωση', hint, onRetry }: { title?: string; hint?: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-10 px-4" role="alert">
      <p className="text-sm font-medium text-bad-600">{title}</p>
      {hint && <p className="text-xs text-ink/55 mt-1">{hint}</p>}
      {onRetry && <button type="button" className="ui-chip mt-3" onClick={onRetry}>Δοκιμή ξανά</button>}
    </div>
  );
}

export function Spinner() {
  return <div role="status" aria-label="Φόρτωση" className="w-5 h-5 border-2 border-line border-t-ink rounded-full animate-spin" />;
}

/* ---------------- Color helpers (category palette) ---------------- */
export function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map(c => c + c).join('') : v;
  const n = parseInt(full, 16);
  if (isNaN(n)) return [15, 23, 42];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** rgba(hex, alpha) — e.g. rgbaOf('#0066cc', 0.16) */
export function rgbaOf(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Tinted chip background + colored text for a given hex hue. */
export function tinted(hex: string, alpha = 0.16): React.CSSProperties {
  return { background: rgbaOf(hex, alpha), color: hex };
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'lg' ? 'w-9 h-9' : size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const zap = size === 'lg' ? 'w-5 h-5' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className={`${s} rounded-lg bg-gradient-to-br from-brand-500 to-cyan-600 text-white flex items-center justify-center shrink-0 shadow-[0_4px_16px_rgba(0,102,204,0.3)]`}>
      <Zap className={zap} fill="currentColor" strokeWidth={0} />
    </div>
  );
}

/* ---------------- Formatters (el-GR) ---------------- */
export function fmtMoney(n: number | null | undefined) {
  if (n == null || isNaN(n)) return '—';
  return new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('el-GR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('el-GR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtTime(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
}

export function timeUntil(s: string) {
  const diff = new Date(s).getTime() - Date.now();
  const h = Math.round(diff / 36e5);
  if (diff < 0) return `${Math.max(-h, 0) === 0 ? 'πριν λίγο' : `${-h} ω${Math.abs(h) === 1 ? 'ώρα' : 'ώρες'} πριν`}`;
  if (h < 1) return '< 1 ώρα';
  if (h < 24) return `${h} ώρες`;
  return `${Math.round(h / 24)} ημέρες`;
}

export function isToday(s: string) {
  const d = new Date(s);
  const now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export function todayLabel() {
  return new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}