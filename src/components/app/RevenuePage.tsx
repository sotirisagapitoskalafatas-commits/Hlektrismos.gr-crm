/* ------------------------------------------------------------------ */
/*  RevenuePage — έσοδα control center (CRM Shell Redesign).          */
/*  Real data only: signed-in offers (case_offers) + live case pipeline.*/
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNav } from '@/lib/nav';
import { STAGES, stageLabel } from '@/lib/roles';
import type { Stage } from '@/lib/roles';
import { Case, RevenueOffer, fetchAllOffers, fetchCases } from '@/lib/api';
import { Card, CardHeader, EmptyState, Micro, Spinner, fmtDate, fmtMoney } from '@/lib/ui';
import { FileText, TrendingUp, Wallet } from 'lucide-react';

const OFFER_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Πρόχειρο', cls: 'bg-ink/[0.06] text-ink/60' },
  sent: { label: 'Απεστάλη', cls: 'bg-brand-50 text-brand-600' },
  accepted: { label: 'Αποδεκτή', cls: 'bg-ok-100 text-ok-600' },
  rejected: { label: 'Απορρίφθηκε', cls: 'bg-bad-100 text-bad-600' },
};
function offerMeta(s: string) {
  return OFFER_STATUS[s] ?? { label: s, cls: 'bg-ink/[0.06] text-ink/60' };
}

export default function RevenuePage() {
  const { openCase } = useNav();
  const [offers, setOffers] = useState<RevenueOffer[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [o, c] = await Promise.all([fetchAllOffers(), fetchCases()]);
    setOffers(o);
    setCases(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const { pipelineValue, funnel, offersTotal, byStatus } = useMemo(() => {
    const pipelineValue = cases.reduce((s, c) => s + (c.value ?? 0) * ((c.probability ?? 0) / 100), 0);
    const perStage = new Map<Stage, { count: number; value: number }>();
    for (const c of cases) {
      const e = perStage.get(c.current_stage) ?? { count: 0, value: 0 };
      e.count += 1;
      e.value += (c.value ?? 0);
      perStage.set(c.current_stage, e);
    }
    const funnel = STAGES
      .filter(s => perStage.has(s.id))
      .map(s => ({ stage: (perStage.get(s.id) as { count: number; value: number }) }));
    const offersTotal = offers.reduce((s, o) => s + (o.amount ?? 0), 0);
    const byStatus = offers.reduce<Record<string, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + (o.amount ?? 0);
      return acc;
    }, {});
    return { pipelineValue, funnel, offersTotal, byStatus };
  }, [cases, offers]);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Analytics · Revenue</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Έσοδα</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-600 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5" />
            </span>
            <div>
              <div className="text-xl font-bold text-ink leading-none">{fmtMoney(Math.round(pipelineValue))}</div>
              <Micro>Pipeline (ανοικτά cases × πιθανότητα)</Micro>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-ok-500/10 text-ok-600 flex items-center justify-center">
              <Wallet className="w-4.5 h-4.5" />
            </span>
            <div>
              <div className="text-xl font-bold text-ink leading-none">{fmtMoney(offersTotal)}</div>
              <Micro>Προσφορές ({offers.length})</Micro>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-ink/[0.06] text-ink/60 flex items-center justify-center">
              <FileText className="w-4.5 h-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(byStatus).map(([st, v]) => (
                  <span key={st} className={`pill text-[10px] ${offerMeta(st).cls}`}>{offerMeta(st).label} · {fmtMoney(Math.round(v))}</span>
                ))}
                {Object.keys(byStatus).length === 0 && <span className="text-xs text-ink/40">καμία προσφορά ακόμα</span>}
              </div>
              <Micro className="mt-1">ανά κατάσταση προσφοράς</Micro>
            </div>
          </div>
        </Card>
      </div>

      {loading && <div className="flex items-center justify-center py-24"><Spinner /></div>}
      {!loading && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader micro="Pipeline" title="Ανοικτά cases ανά στάδιο" />
            {funnel.length === 0 && <p className="text-xs text-ink/40 py-2">Κανένα ενεργό case.</p>}
            <div className="space-y-2">
              {funnel.map(({ stage }) => (
                <div key={stage.stage.id} className="rounded-xl border border-line bg-paper/50 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-ink">{stageLabel(stage.stage.id)}</span>
                    <span className="text-[13px] font-semibold text-ink">{fmtMoney(Math.round(stage.value))}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-0.5">
                    <span className="micro text-ink/40">{STAGES.findIndex(s => s.id === stage.stage.id) + 1} / {STAGES.length}</span>
                    <span className="pill bg-ink/[0.06] text-ink/60">· {stage.count} cases</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader micro="Offers" title="Προσφορές με πελάτη / case" />
            <div className="space-y-1.5">
              {offers.length === 0 && <EmptyState icon={FileText} title="Καμία προσφορά ακόμα" hint="Οι προσφορές που δημιουργούνται στα cases θα εμφανιστούν εδώ." />}
              {offers.map(o => {
                const m = offerMeta(o.status);
                return (
                  <button key={o.id} onClick={() => openCase(o.case_id)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-ink/5 flex items-center gap-3">
                    <span className="font-mono text-[11px] text-ink/45 w-20 truncate shrink-0">{o.offer_no}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-ink truncate">{o.case?.customer?.full_name ?? o.case?.title ?? '—'}</span>
                      <span className="block text-xs text-ink/45 truncate">{o.case ? `${o.case.case_no} · ${stageLabel(o.case.current_stage)}` : ''}{o.valid_until ? ` · ισχύει έως ${fmtDate(o.valid_until)}` : ''}</span>
                    </span>
                    <span className={`pill text-[10px] shrink-0 ${m.cls}`}>{m.label}</span>
                    <span className="text-[13px] font-semibold text-ink shrink-0">{fmtMoney(Math.round(o.amount))}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}