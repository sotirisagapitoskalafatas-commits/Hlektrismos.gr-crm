import { useEffect, useState } from 'react';
import { useNav } from '@/lib/nav';
import { BACK_OFFICE_STAGES, stageLabel } from '@/lib/roles';
import { fetchAllCaseStats } from '@/lib/api';
import { Btn, Card, CardHeader, EmptyState, Pill, StagePill, fmtMoney } from '@/lib/ui';
import { FileCheck2, FolderOpen, MonitorCog, PenLine, ScanSearch, Timer } from 'lucide-react';
import type { DashboardData } from './data';
import { activeCases, lastActionDays, lostCases, wonCases, ServiceLabel } from './data';
import { BarRow, EmptyNote, KpiCard } from './shared';

export default function BackOfficeDashboard({ d }: { d: DashboardData }) {
  const { go, openCase } = useNav();
  const { cases } = d;

  const active = activeCases(cases);
  const bo = active.filter(c => BACK_OFFICE_STAGES.includes(c.current_stage));
  const won = wonCases(cases);
  const lost = lostCases(cases);
  const finished = won.length + lost.length;

  const [stats, setStats] = useState<Map<string, { documents: number; signatures: number }>>(new Map());
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = bo.map(c => c.id);
      if (ids.length === 0) return;
      const m = await fetchAllCaseStats(ids);
      if (!alive) return;
      const out = new Map<string, { documents: number; signatures: number }>();
      m.forEach((s, id) => {
        const docs = s.documents.filter(x => x.status !== 'verified' && x.status !== 'approved').length;
        const sigs = s.signatures.filter(x => x.status !== 'verified' && x.status !== 'approved' && x.status !== 'accepted').length;
        out.set(id, { documents: docs, signatures: sigs });
      });
      setStats(out);
    })();
    return () => { alive = false; };
  }, [bo.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingDocs = [...stats.values()].reduce((s, x) => s + x.documents, 0);
  const pendingSigs = [...stats.values()].reduce((s, x) => s + x.signatures, 0);
  const pendingCases = bo.filter(c => {
    const s = stats.get(c.id);
    return s && (s.documents > 0 || s.signatures > 0);
  });
  const maxDays = bo.length ? Math.max(...bo.map(c => lastActionDays(c))) : 0;

  const queue = BACK_OFFICE_STAGES
    .map(s => ({ stage: s, count: bo.filter(c => c.current_stage === s).length }))
    .filter(x => x.count > 0);
  const totalQueueCount = queue.reduce((s, x) => s + x.count, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Σε ροή" value={String(totalQueueCount)} sub="στάδια BO" icon={MonitorCog} tone={totalQueueCount > 0 ? 'text-brand-600' : 'text-ink'} />
        <KpiCard label="Έγγραφα προς έλεγχο" value={String(pendingDocs)} sub="μη επαληθευμένα" icon={FolderOpen} tone={pendingDocs > 0 ? 'text-amber-600' : 'text-ink'} />
        <KpiCard label="Υπογραφές εκκρεμείς" value={String(pendingSigs)} sub="μη ολοκληρωμένες" icon={PenLine} tone={pendingSigs > 0 ? 'text-amber-600' : 'text-ink'} />
        <KpiCard label="Ολοκληρωμένα" value={String(won.length)} sub={finished > 0 ? `${Math.round((won.length / finished) * 100)}% win rate` : '—'} icon={FileCheck2} tone="text-ok-600" />
      </div>

      {/* Stage queue + aging */}
      <Card>
        <CardHeader micro="Ουρά εργασιών" title="Φόρτος ανά στάδιο" className="!mb-2"
          action={<Pill tone={maxDays >= 7 ? 'red' : 'amber'}><Timer className="w-3 h-3" /> παλαιότερο {maxDays} ημ.</Pill>} />
        <div className="space-y-3">
          {queue.map(x => (
            <BarRow key={x.stage} label={`${stageLabel(x.stage)} (${x.count})`} value={x.count} pct={Math.round((x.count / Math.max(1, ...queue.map(q => q.count))) * 100)} tone="bg-brand-500" />
          ))}
          {queue.length === 0 && <EmptyNote title="Δεν υπάρχουν εργασίες σε ροή" />}
        </div>
      </Card>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Pending list */}
        <Card className="lg:col-span-3 !p-0" pad={false}>
          <CardHeader micro="Εκκρεμείς εργασίες" title="Back Office σε ροή" className="px-5 pt-5"
            action={<Btn variant="ghost" onClick={() => go('backoffice')}><MonitorCog className="w-3.5 h-3.5" /> Operations</Btn>} />
          <div className="px-3 pb-3 space-y-1">
            {bo.length === 0 && <EmptyState icon={MonitorCog} title="Δεν υπάρχουν εργασίες" hint="Cases στα στάδια ελέγχου/ενεργοποίησης εμφανίζονται εδώ." />}
            {[...bo].sort((a, b) => lastActionDays(b) - lastActionDays(a)).map(c => {
              const s = stats.get(c.id);
              return (
                <button key={c.id} onClick={() => openCase(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-ink/[0.03] text-left">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate">
                      <span className="font-mono text-ink/40 text-[11px] mr-2">{c.case_no}</span>{c.customer?.full_name ?? c.title}
                    </span>
                    <span className="block text-xs text-ink/45 truncate">
                      {ServiceLabel(c.service_type)} · {fmtMoney(c.value || 0)} · βήμα {lastActionDays(c)} ημ.
                      {s && s.documents + s.signatures > 0 && ` · ${s.documents} έγγρ. + ${s.signatures} υπογρ.`}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {s && s.documents + s.signatures > 0 && <Pill tone="amber">{s.documents + s.signatures}</Pill>}
                    <StagePill stage={c.current_stage} />
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Docs & signatures + conversion */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader micro="Έλεγχος" title="Έγγραφα & Υπογραφές" action={<Pill tone={pendingDocs + pendingSigs > 0 ? 'amber' : 'green'}>{pendingDocs + pendingSigs}</Pill>} />
            <div className="mt-1 space-y-2">
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-ink/[0.03]">
                <span className="flex items-center gap-2 text-[13px] text-ink/70"><FolderOpen className="w-4 h-4 text-ink/40" /> Να επαληθευτούν</span>
                <span className="text-[13px] font-semibold">{pendingDocs}</span>
              </div>
              <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-ink/[0.03]">
                <span className="flex items-center gap-2 text-[13px] text-ink/70"><PenLine className="w-4 h-4 text-ink/40" /> Υπογραφές</span>
                <span className="text-[13px] font-semibold">{pendingSigs}</span>
              </div>
              {pendingCases.length > 0 && (
                <div className="px-3 py-2">
                  <div className="text-[11px] font-medium text-ink/40 mb-1">Σε cases:</div>
                  <div className="flex flex-wrap gap-1.5">
                    {pendingCases.slice(0, 4).map(c => (
                      <button key={c.id} onClick={() => openCase(c.id)}
                        className="px-2 py-1 rounded-md bg-warn-100 text-warn-600 text-[11px] font-medium hover:opacity-80">
                        {c.case_no}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <Btn variant="outline" className="w-full" onClick={() => go('backoffice')}>
                <ScanSearch className="w-3.5 h-3.5" /> Άνοιγμα ελέγχου εγγράφων
              </Btn>
            </div>
          </Card>

          <Card>
            <CardHeader micro="Απόδοση" title="Ολοκληρωμένα vs Χαμένα" />
            <div className="mt-2 space-y-2.5">
              <BarRow label="Ολοκληρωμένα" value={won.length} pct={finished > 0 ? Math.round((won.length / finished) * 100) : 0} tone="bg-ok-600" sub={String(won.length)} />
              <BarRow label="Χαμένα / Ακυρωθέντα" value={lost.length} pct={finished > 0 ? Math.round((lost.length / finished) * 100) : 0} tone="bg-bad-600" sub={String(lost.length)} />
            </div>
            <div className="mt-3 pt-3 border-t border-line flex items-center justify-between">
              <span className="text-xs text-ink/50">Μέγιστη αξία σε ροή</span>
              <span className="text-[13px] font-semibold text-ink">{fmtMoney(Math.max(...bo.map(c => c.value || 0), 0))}</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}