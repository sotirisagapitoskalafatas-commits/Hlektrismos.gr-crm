import { ComponentType, ReactNode } from 'react';
import { X, Zap } from 'lucide-react';
import { stageLabel } from './roles';

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
  return <div className={`card ${pad ? 'p-5' : ''} ${className}`}>{children}</div>;
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
const PILL_MAP: Record<PillTone, string> = {
  green: 'bg-ok-100 text-ok-600',
  amber: 'bg-warn-100 text-warn-600',
  red: 'bg-bad-100 text-bad-600',
  blue: 'bg-brand-50 text-brand-600',
  gray: 'bg-ink/[0.06] text-ink/60',
  ink: 'bg-ink text-paper',
};
export function Pill({ children, tone = 'gray', className = '' }: {
  children: ReactNode; tone?: PillTone; className?: string;
}) {
  return <span className={`pill ${PILL_MAP[tone]} ${className}`}>{children}</span>;
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
export type BtnVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'ok' | 'brand';
const BTN_MAP: Record<BtnVariant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink/85',
  outline: 'bg-white text-ink border border-line hover:border-ink/30',
  ghost: 'text-ink/70 hover:text-ink hover:bg-ink/5',
  danger: 'bg-bad-600 text-white hover:bg-bad-600/90',
  ok: 'bg-ok-600 text-white hover:bg-ok-600/90',
  brand: 'bg-brand-500 text-white hover:bg-brand-600',
};
export function Btn({ children, onClick, variant = 'primary', className = '', disabled, type = 'button', title }: {
  children: ReactNode; onClick?: () => void; variant?: BtnVariant;
  className?: string; disabled?: boolean; type?: 'button' | 'submit'; title?: string;
}) {
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none ${BTN_MAP[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function IconBtn({ children, onClick, title, className = '' }: {
  children: ReactNode; onClick?: () => void; title?: string; className?: string;
}) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-ink/50 hover:text-ink hover:bg-ink/5 transition-colors ${className}`}>
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
export function Modal({ open, onClose, title, micro, children, wide }: {
  open: boolean; onClose: () => void; title: string; micro?: string; children: ReactNode; wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 backdrop-blur-[2px] p-4 sm:p-8"
      onClick={onClose}>
      <div className={`card w-full ${wide ? 'max-w-2xl' : 'max-w-md'} p-6 animate-fadein my-4 sm:my-8`}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            {micro && <Micro className="mb-1">{micro}</Micro>}
            <h2 className="text-lg font-semibold text-ink tracking-tight">{title}</h2>
          </div>
          <button onClick={onClose}
            className="text-ink/40 hover:text-ink p-1 rounded-md hover:bg-ink/5">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------------- Empty state / spinner ---------------- */
export function EmptyState({ icon: Icon, title, hint }: { icon: IconType; title: string; hint?: string }) {
  return (
    <div className="text-center py-10 px-4">
      <div className="w-10 h-10 mx-auto rounded-xl bg-ink/5 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-ink/40" />
      </div>
      <p className="text-sm font-medium text-ink/70">{title}</p>
      {hint && <p className="text-xs text-ink/40 mt-1">{hint}</p>}
    </div>
  );
}

export function Spinner() {
  return <div className="w-5 h-5 border-2 border-line border-t-ink rounded-full animate-spin" />;
}

export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'lg' ? 'w-9 h-9' : size === 'sm' ? 'w-6 h-6' : 'w-7 h-7';
  const zap = size === 'lg' ? 'w-5 h-5' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  return (
    <div className={`${s} rounded-lg bg-ink text-paper flex items-center justify-center shrink-0`}>
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