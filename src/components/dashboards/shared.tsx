import type { ComponentType } from 'react';
import { Card, Micro, Spinner } from '@/lib/ui';
import type { DashboardData } from './data';
import { useDashboardData } from './data';

export function DashboardLoader({ children }: { children: (d: DashboardData) => React.ReactNode }) {
  const d = useDashboardData();
  if (!d) return <div className="flex items-center justify-center py-24"><Spinner /></div>;
  return <>{children(d)}</>;
}

export function KpiCard({ label, value, sub, icon: Icon, tone = 'text-ink' }: {
  label: string; value: string; sub?: string; icon?: ComponentType<{ className?: string }>; tone?: string;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <Micro>{label}</Micro>
        {Icon && <Icon className="w-4 h-4 text-ink/30" />}
      </div>
      <div className={`mt-2 text-[26px] font-semibold tracking-tight leading-none ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-ink/40 mt-2">{sub}</div>}
    </Card>
  );
}

export function BarRow({ label, value, pct, sub, tone = 'bg-brand-500' }: {
  label: string; value: number; pct: number; sub?: string; tone?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-[13px] mb-1">
        <span className="font-medium text-ink flex items-center gap-1.5">{label}</span>
        <span className="text-xs text-ink/50">{sub ?? String(value)}</span>
      </div>
      <div className="h-2 rounded-full bg-ink/5 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}

export function EmptyNote({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center px-3 py-5">
      <div className="text-[13px] font-medium text-ink/60">{title}</div>
      {hint && <div className="text-xs text-ink/40 mt-1">{hint}</div>}
    </div>
  );
}