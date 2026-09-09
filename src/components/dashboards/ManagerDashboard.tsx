import { useNav } from '@/lib/nav';
import { BACK_OFFICE_STAGES, stageLabel } from '@/lib/roles';
import { Btn, Card, CardHeader, EmptyState, Pill, StagePill, fmtDateTime, fmtMoney } from '@/lib/ui';
import { History, MonitorCog, Target, Users } from 'lucide-react';
import type { DashboardData } from './data';
import { activeCases, lastActionDays, lostCases, overdueFUs, pipelineValue, wonCases, wonValue, ServiceLabel } from './data';
import { BarRow, EmptyNote, KpiCard } from './shared';

function leaderTitle(a: 'inside_sales_owner' | 'field_sales_owner' | 'back_office_owner'): string {
  return a === 'inside_sales_owner' ? 'Inside Sales' : a === 'field_sales_owner' ? 'Field Sales' : 'Back Office';
}

export default function ManagerDashboard({ d }: { d: DashboardData }) {
  const { go, openCase } = useNav();
  const { cases, leads, followUps } = d;

  const active = activeCases(cases);
  const won = wonCases(cases);
  const lost = lostCases(cases);
  const finished = won.length + lost.length;
  const winRate = finished > 0 ? Math.round((won.length / finished) * 100) : 0;
  const overdue = overdueFUs(followUps);
  const bo = active.filter(c => BACK_OFFICE_STAGES.includes(c.current_stage));

  const owners: { key: 'inside_sales_owner' | 'field_sales_owner' | 'back_office_owner'; n: number }[]
    = (['inside_sales_owner', 'field_sales_owner', 'back_office_owner'] as const)
      .map(key => ({ key, n: active.filter(c => c[key]).length }))
      .filter(x => x.n > 0);
  const totalActiveForTeam = Math.max(1, ...owners.map(o => o.n));

  const aging = [...active]
    .map(c => ({ stage: c.current_stage, days: lastActionDays(c) }))
    .reduce<Record<string, number>>((m, x) => { m[x.stage] = Math.max(m[x.stage] ?? 0, x.days); return m; }, {});
  const agingList = Object.entries(aging).sort((a, b) => b[1] - a[1]);

  const bottlenecks = [...active].sort((a, b) => lastActionDays(b) - lastActionDays(a)).slice(0, 5);
  const oldestBo = [...bo].sort((a, b) => lastActionDays(b) - lastActionDays(a));

  const total = cases.length;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Ενεργά Cases" value={String(active.length)} sub={`${total} συνολικά`} icon={Target} />
        <KpiCard label="Win rate" value={`${winRate}%`} sub={`${won.length} κερδισμένα · ${lost.length} χαμένα`} tone="text-ok-600" icon={Target} />
        <KpiCard label="Pipeline (σταθμισμένο)" value={fmtMoney(pipelineValue(cases))} sub={`αξία ${fmtMoney(wonValue(cases))} κερδισμένων`} icon={Target} />
        <KpiCard label="Εκπρόθεσμα Follow Ups" value={String(overdue.length)} sub="χρειάζονται σήμερα" icon={History} tone={overdue.length > 0 ? 'text-bad-600' : 'text-ink'} />
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Outcome split + conversion */}
        <Card className="lg:col-span-2">
          <CardHeader micro="Αποτελέσματα" title="Έκβαση cases" action={<Pill tone="gray">{cases.length}</Pill>} />
          <div className="mt-2 space-y-3">
            <BarRow label="Ενεργά" value={active.length} pct={pct(active.length)} tone="bg-brand-500" />
            <BarRow label="Κερδισμένα" value={won.length} pct={pct(won.length)} tone="bg-ok-600" />
            <BarRow label="Χαμένα / Ακυρωθέντα" value={lost.length} pct={pct(lost.length)} tone="bg-bad-600" />
          </div>
          <div className="mt-4 pt-4 border-t border-line">
            <div className="flex items-center justify-between text-[13px] mb-2">
              <span className="font-medium text-ink">Μετατροπή</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { k: 'Leads', v: leads.length },
                { k: 'Cases', v: cases.length },
                { k: 'Κερδισμένα', v: won.length },
              ].map(x => (
                <div key={x.k} className="rounded-lg bg-ink/[0.03] py-2">
                  <div className="text-lg font-semibold text-ink leading-none">{x.v}</div>
                  <div className="text-[11px] text-ink/45 mt-1">{x.k}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Stage aging + bottlenecks */}
        <Card className="lg:col-span-3 !p-0" pad={false}>
          <CardHeader micro="Απόδοση" title="Παλαιότητα κατά στάδιο" className="px-5 pt-5"
            action={<Pill tone="amber">{agingList.length ? Math.max(...agingList.map(a => a[1])) : 0} ημ. max</Pill>} />
          <div className="px-4 py-3 space-y-2.5">
            {agingList.map(([stage, days]) => (
              <BarRow key={stage} label={stageLabel(stage)} value={days} pct={Math.min(100, Math.round((days / 8) * 100))} sub={`τελευταίο βήμα πριν ${days} ημ.`}
                tone={days >= 7 ? 'bg-bad-600' : days >= 4 ? 'bg-amber-500' : 'bg-brand-500'} />
            ))}
            {agingList.length === 0 && <EmptyNote title="Κανένα ενεργό case" />}
          </div>
          <div className="border-t border-line px-5 py-4">
            <div className="flex items-center gap-2 mb-2">
              <History className="w-3.5 h-3.5 text-ink/40" />
              <span className="text-[13px] font-semibold text-ink">Σημεία συμφόρησης</span>
            </div>
            <div className="space-y-1">
              {bottlenecks.map(c => (
                <button key={c.id} onClick={() => openCase(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ink/[0.03] text-left">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate">{c.customer?.full_name ?? c.case_no}</span>
                    <span className="block text-xs text-ink/45 truncate">{ServiceLabel(c.service_type)} · χωρίς βήμα {lastActionDays(c)} ημ.</span>
                  </span>
                  <StagePill stage={c.current_stage} />
                </button>
              ))}
              {bottlenecks.length === 0 && <EmptyNote title="Δεν υπάρχουν σημεία συμφόρησης" />}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Team workload */}
        <Card className="lg:col-span-2">
          <CardHeader micro="Ομάδα" title="Φόρτος εργασιών" action={<Users className="w-3.5 h-3.5 text-ink/30" />} />
          <div className="mt-2 space-y-1.5">
            {owners.map(o => (
              <div key={o.key} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-ink/[0.03]">
                <span className="flex-1 text-[13px] text-ink/70">{leaderTitle(o.key)}</span>
                <span className="w-20 h-1.5 rounded-full bg-ink/10 overflow-hidden">
                  <span className={`block h-full rounded-full ${o.key === 'inside_sales_owner' ? 'bg-brand-500' : o.key === 'field_sales_owner' ? 'bg-ok-600' : 'bg-amber-500'}`}
                    style={{ width: `${Math.round((o.n / totalActiveForTeam) * 100)}%` }} />
                </span>
                <span className="text-[13px] font-semibold text-ink w-4 text-right">{o.n}</span>
              </div>
            ))}
            {owners.length === 0 && <EmptyNote title="Καμία ανάθεση" hint="Ορίστε υπεύθυνους από το case." />}
          </div>
        </Card>

        {/* Back office ops review */}
        <Card className="lg:col-span-3 !p-0" pad={false}>
          <CardHeader micro="Operations review" title="Back Office σε ροή" className="px-5 pt-5"
            action={<Btn variant="ghost" onClick={() => go('backoffice')}><MonitorCog className="w-3.5 h-3.5" /> Operations</Btn>} />
          <div className="px-3 pb-3 space-y-1">
            {oldestBo.length === 0 && <EmptyState icon={MonitorCog} title="Δεν υπάρχουν εργασίες σε ροή" hint="Cases σε στάδια ελέγχου/ενεργοποίησης εμφανίζονται εδώ." />}
            {oldestBo.map(c => (
              <button key={c.id} onClick={() => openCase(c.id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ink/[0.03] text-left">
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium text-ink truncate">
                    <span className="font-mono text-ink/40 text-[11px] mr-2">{c.case_no}</span>{c.customer?.full_name ?? c.title}
                  </span>
                  <span className="block text-xs text-ink/45 truncate">{ServiceLabel(c.service_type)} · {fmtMoney(c.value || 0)} · βήμα {lastActionDays(c)} ημ.</span>
                </span>
                <StagePill stage={c.current_stage} />
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Overdue follow ups */}
      <Card className="!p-0" pad={false}>
        <CardHeader micro="Εκκρεμότητες" title="Εκπρόθεσμα Follow Ups" className="px-5 pt-5"
          action={<Pill tone={overdue.length > 0 ? 'red' : 'green'}>{overdue.length}</Pill>} />
        <div className="px-3 pb-3 space-y-1">
          {overdue.length === 0 && <EmptyState icon={History} title="Δεν υπάρχουν εκπρόθεσμα follow ups" hint="Όλες οι ενέργειες εντός προγράμματος." />}
          {overdue.map(f => (
            <button key={f.id} onClick={() => f.case_id && openCase(f.case_id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ink/[0.03] text-left">
              <span className="w-7 h-7 rounded-lg bg-bad-600/10 flex items-center justify-center shrink-0">
                <History className="w-3.5 h-3.5 text-bad-600" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-ink truncate">{f.case?.customer?.full_name ?? f.case?.case_no}</span>
                <span className="block text-xs text-ink/45 truncate">{f.reason} · {f.case?.title}</span>
              </span>
              <span className="text-xs text-bad-600 font-medium shrink-0">{fmtDateTime(f.due_at)}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}