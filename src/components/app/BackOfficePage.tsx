import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { BACK_OFFICE_STAGES, SERVICES, STAGES, can } from '@/lib/roles';
import type { Stage } from '@/lib/roles';
import { Case, changeStage, fetchCases } from '@/lib/api';
import { Btn, Card, CardHeader, EmptyState, Micro, Pill, Spinner, StagePill, fmtDate, fmtMoney } from '@/lib/ui';
import { ClipboardCheck, Plus } from 'lucide-react';

export default function BackOfficePage() {
  const { role } = useAuth();
  const { openCase } = useNav();
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const list = await fetchCases({ includeDone: true });
    setCases(list.filter(c => BACK_OFFICE_STAGES.includes(c.current_stage)));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const grouped = BACK_OFFICE_STAGES.map(s => ({
    stage: s,
    items: cases.filter(c => c.current_stage === s).sort((a, b) => +new Date(a.updated_at) - +new Date(b.updated_at)),
  }));

  const titleFor = (s: Stage) => STAGES.find(st => st.id === s)?.label ?? s;

  const nextFor = (c: Case): Stage | null => {
    if (c.current_stage === 'signed') return 'document_check';
    if (c.current_stage === 'document_check') return 'submitted';
    if (c.current_stage === 'submitted') return 'activation';
    return null;
  };

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Back Office</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Operations</h2>
        </div>
        <Pill tone={cases.filter(c => ['document_check', 'signed'].includes(c.current_stage)).length > 0 ? 'amber' : 'green'}>
          {cases.length} σε ροή
        </Pill>
      </div>

      {loading && <div className="flex items-center justify-center py-24"><Spinner /></div>}
      {!loading && cases.length === 0 && (
        <Card>
          <EmptyState icon={ClipboardCheck} title="Καμία εργασία back office" hint="Cases στα στάδια υπογεγραμμένο → ενεργοποίηση θα εμφανιστούν εδώ." />
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {grouped.map(g => (
          <Card key={g.stage} className="!p-0" pad={false}>
            <CardHeader
              micro={`${g.items.length} cases`}
              title={titleFor(g.stage)}
              className="px-5 pt-5"
              action={<StagePill stage={g.stage} />}
            />
            <div className="px-3 pb-3 space-y-1">
              {g.items.length === 0 && <div className="text-xs text-ink/40 px-3 py-2">Κενό — κανένα case εδώ.</div>}
              {g.items.map(c => {
                const next = nextFor(c);
                return (
                  <div key={c.id}
                    className="w-full px-3 py-2.5 rounded-lg hover:bg-ink/[0.03] transition-colors flex items-center gap-3 cursor-pointer"
                    onClick={() => openCase(c.id)}>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-ink truncate">
                        <span className="font-mono text-ink/40 text-[11px] mr-2">{c.case_no}</span>
                        {c.customer?.full_name ?? c.title}
                      </span>
                      <span className="block text-xs text-ink/45 truncate">
                        {SERVICES[c.service_type] ?? c.service_type}
                        {c.provider ? ` · ${c.provider}` : ''}
                        {' · τελευταίο βήμα '}{fmtDate(c.updated_at)}
                      </span>
                    </span>
                    {c.priority === 'high' || c.priority === 'critical' ? <Pill tone="red">προσοχή</Pill> : null}
                    <span className="text-[13px] font-semibold text-ink/80">{fmtMoney(c.value)}</span>
                    {next && can(role, 'change_stage') && (
                      <span onClick={e => e.stopPropagation()}>
                        <Btn variant="outline" onClick={() => changeStage(c.id, next, role).then(load)}>
                          <Plus className="w-3 h-3" /> επόμενο
                        </Btn>
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}