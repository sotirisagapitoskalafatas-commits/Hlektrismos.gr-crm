/* ------------------------------------------------------------------ */
/*  OperationalStrip — master-prompt dashboard commander block:        */
/*  Σήμερα (due follow-ups, new leads, active cases, pipeline value),  */
/*  the sales Pipeline (8 stages) and "Needs attention" queue.         */
/*  Rendered above the role-specific dashboard on the Home page.       */
/* ------------------------------------------------------------------ */

import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import type { IconType } from '@/lib/ui';
import { Micro, fmtMoney, fmtTime, rgbaOf } from '@/lib/ui';
import { Briefcase, CalendarClock, UserPlus, Wallet } from 'lucide-react';
import { ACTIVE_STAGES, stageLabel } from '@/lib/roles';
import type { Stage } from '@/lib/roles';
import type { DashboardData } from './data';
import { activeCases, overdueFUs, todayFUs } from './data';
import { pipelineStats } from '@/lib/home-insights';
import { stageText } from '@/lib/case-flow';

const STAGE_HUE: Record<Stage, string> = {
  new: '#2563eb',
  contacted: '#0e7490',
  offer: '#7c3aed',
  application: '#b45309',
  signed: '#15803d',
  document_check: '#334155',
  submitted: '#0369a1',
  activation: '#16a34a',
  completed: '#16a34a',
  lost: '#dc2626',
  cancelled: '#dc2626',
};

function MetricCard({ icon: Icon, label, value, sub, hue, onClick }: {
  icon: IconType; label: string; value: string; sub: string; hue: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="card p-3.5 text-left hover:shadow-md transition-shadow group relative overflow-hidden">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: hue }} aria-hidden="true" />
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: rgbaOf(hue, 0.12) }}>
          <Icon className="w-4 h-4" style={{ color: hue }} aria-hidden="true" />
        </span>
        <Micro className="!text-[9px]">{label}</Micro>
      </div>
      <div className="mt-2 text-[24px] font-semibold leading-none text-ink tracking-tight">{value}</div>
      <div className="mt-1 text-[11px] text-ink/45 truncate">{sub}</div>
    </button>
  );
}

type StripMetric = 'followups' | 'leads' | 'active' | 'pipeline';

/** `pipeline={false}` hides the 8-stage block when the page already shows it; `omit` drops metric cards another module on the page repeats. */
export function OperationalStrip({ d, pipeline = true, omit = [] }: { d: DashboardData; pipeline?: boolean; omit?: StripMetric[] }) {
  const { go, openCase } = useNav();
  const role = useAuth().role;

  const today = todayFUs(d.followUps);
  const overdue = overdueFUs(d.followUps);
  const newLeads = d.leads.filter(l => l.status === 'new').length;
  const active = activeCases(d.cases);
  const attention = [...overdue, ...today].slice(0, 5);

  const pipe = pipelineStats(d.cases);
  const show = (m: StripMetric) => !omit.includes(m);
  const shown = (['followups', 'leads', 'active', 'pipeline'] as StripMetric[]).filter(show).length;
  const compact = shown <= 2 && attention.length > 0;

  return (
    // With ≤2 metric cards, cards and the attention list sit side by side instead of a half-empty row.
    <div className={compact ? 'grid grid-cols-1 lg:grid-cols-12 gap-4 items-start' : 'space-y-5'}>
      {/* Σήμερα */}
      <div className={`grid grid-cols-2 gap-3 ${compact ? 'lg:col-span-4 lg:grid-cols-1' : shown >= 4 ? 'lg:grid-cols-4' : shown === 3 ? 'lg:grid-cols-3' : ''}`}>
        {/* Team-wide figures (all visible records), unlike the personal KPIs at the top of Home. */}
        {show('followups') && <MetricCard icon={CalendarClock} label="Follow-ups ομάδας σήμερα & εκπρόθεσμα" value={String(today.length + overdue.length)}
          sub={`${overdue.length} εκπρόθεσμα`} hue="#b45309" onClick={() => go('followups', { status: 'pending' })} />}
        {show('leads') && <MetricCard icon={UserPlus} label="Νέα leads (όλα)" value={String(newLeads)}
          sub="αναμονή επικοινωνίας" hue="#087CF5" onClick={() => go('leads')} />}
        {show('active') && <MetricCard icon={Briefcase} label="Ενεργά Cases" value={String(active.length)}
          sub={`${d.cases.filter(c => c.current_stage === 'offer').length} σε προσφορά`} hue="#7c3aed" onClick={() => go('cases', { status: 'active' })} />}
        {show('pipeline') && <MetricCard icon={Wallet} label="Pipeline (σταθμισμένο)" value={pipe.weighted === null ? 'μη διαθέσιμο' : fmtMoney(pipe.weighted)}
          sub={pipe.withoutValue ? `${pipe.withoutValue} cases χωρίς αξία εκτός` : 'πιθανολογούμενη αξία'} hue="#15803d" onClick={() => go(role === 'admin' ? 'reports' : 'cases')} />}
      </div>

      {/* Pipeline (8 stages) */}
      {pipeline && <div className="card p-4 lg:col-span-12">
        <div className="flex items-center justify-between mb-3">
          <Micro>Pipeline</Micro>
          <button onClick={() => go('cases')} className="text-[12px] font-medium text-brand-600 hover:underline">Προβολή όλων</button>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {ACTIVE_STAGES.map(s => {
            const count = d.cases.filter(c => c.current_stage === s).length;
            const hue = STAGE_HUE[s];
            return (
              <button key={s} onClick={() => go('cases', { stage: s })}
                className="rounded-lg border border-line bg-paper/40 px-2 py-2 text-center hover:bg-paper transition-colors">
                <div className="text-[15px] font-semibold leading-tight" style={{ color: count > 0 ? hue : 'rgba(15,23,42,0.25)' }}>
                  {count}
                </div>
                <div className="mt-0.5 text-[10.5px] font-medium text-ink/55 leading-tight">{stageText(s)}</div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-ok-600" aria-hidden="true" />
          <span className="text-[11px] text-ink/45">Νέο → Επικοινωνία → Προσφορά → Αίτηση → Υπογραφή → Έγγραφα → Πάροχος → Ενεργοποίηση</span>
        </div>
      </div>}

      {/* Needs attention */}
      {attention.length > 0 && (
        <div className={`card p-4 ${compact ? 'lg:col-span-8' : ''}`}>
          <div className="flex items-center justify-between mb-2">
            <Micro>Follow-ups ομάδας · χρειάζονται προσοχή</Micro>
            <button onClick={() => go('followups')} className="text-[12px] font-medium text-brand-600 hover:underline">Όλα τα follow ups</button>
          </div>
          <div className="space-y-1">
            {attention.map(f => {
              const isOverdue = overdue.includes(f);
              const hue = isOverdue ? '#dc2626' : '#b45309';
              return (
                <button key={f.id} onClick={() => { if (f.case_id) openCase(f.case_id); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ink/[0.035] text-left">
                  <span className="w-1.5 self-stretch rounded-full shrink-0" style={{ background: hue }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink truncate">
                      {f.case?.customer?.full_name ?? f.case?.title ?? 'Follow Up'}
                    </span>
                    <span className="block text-[11px] text-ink/45 truncate">
                      {isOverdue ? 'Εκπρόθεσμο' : 'Σήμερα'} · {f.channel} · <span className="capitalize">{stageLabel(f.case?.current_stage ?? '')}</span>
                    </span>
                  </span>
                  <span className="text-[11px] text-ink/45 whitespace-nowrap font-mono">{fmtTime(f.due_at)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}