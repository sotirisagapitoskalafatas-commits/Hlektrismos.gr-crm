// Read-only pipeline board: one lane per active stage. Opening a card goes to the case; stages are changed there,
// where the document/signature checks and the permission rules are enforced (the board never moves a case itself).
// On a phone one lane is shown at a time, chosen with the chips (the choice is kept in the user's preferences).
import { useMemo } from 'react';
import { groupByStage, pickLane } from '@/lib/pipeline-board';
import { ACTIVE_STAGES, stageLabel, serviceLabel } from '@/lib/roles';
import { fmtDate, fmtMoney } from '@/lib/ui';
import { pillClass, toneForStage } from '@/lib/status-style';
import { PILL_COLORS } from '@/lib/status-style';
import { useDeviceContext } from '@/lib/device-context';
import { usePreferences } from '@/lib/preferences';
import type { Case } from '@/lib/api';

export default function PipelineBoard({ cases, onOpen }: { cases: Case[]; onOpen: (id: string) => void }) {
  const { device } = useDeviceContext();
  const { pipeline_lane, update } = usePreferences();
  const lanes = useMemo(() => groupByStage(cases, ACTIVE_STAGES), [cases]);
  const phone = device === 'PHONE';
  const current = pickLane(lanes, pipeline_lane);
  const shown = phone ? lanes.filter((l) => l.stage === current) : lanes;

  return (
    <div data-pipeline-board>
      {phone && (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" role="group" aria-label="Στάδιο">
          {lanes.map((l) => (
            <button key={l.stage} type="button" className="ui-chip shrink-0" aria-pressed={l.stage === current} onClick={() => update({ pipeline_lane: l.stage })}>
              {stageLabel(l.stage)} <span className="ui-chip__n">{l.cases.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className={phone ? '' : 'ui-board'}>
        {shown.map((l) => (
          <section key={l.stage} className="ui-lane" aria-label={`${stageLabel(l.stage)}: ${l.cases.length} cases`}>
            <header className="ui-lane__head">
              <span className="ui-lane__dot" style={{ background: PILL_COLORS[toneForStage(l.stage)].fg }} aria-hidden="true" />
              <h3 className="ui-lane__title">{stageLabel(l.stage)}</h3>
              <span className={pillClass('gray')}>{l.cases.length}</span>
            </header>
            <p className="ui-lane__sum">
              {l.total === null ? (l.cases.length ? 'χωρίς καταχωρημένη αξία' : '—') : fmtMoney(l.total)}
              {l.total !== null && l.withoutValue > 0 ? ` · ${l.withoutValue} χωρίς αξία` : ''}
            </p>
            <div className="ui-lane__cards">
              {l.cases.length === 0 && <p className="ui-lane__empty">Κανένα case</p>}
              {l.cases.map((c) => (
                <button key={c.id} type="button" className="ui-lift ui-bcard" onClick={() => onOpen(c.id)}>
                  <span className="ui-bcard__no">{c.case_no}</span>
                  <span className="ui-bcard__name">{c.customer?.full_name ?? c.title}</span>
                  <span className="ui-bcard__sub">{serviceLabel(c.service_type)}</span>
                  <span className="ui-bcard__foot">
                    <span className="ui-bcard__val">{c.value > 0 ? fmtMoney(c.value) : <span className="ui-bcard__na">χωρίς αξία</span>}</span>
                    {(c.priority === 'high' || c.priority === 'critical') && <span className={pillClass('red')}>{c.priority === 'critical' ? 'κρίσιμο' : 'υψηλή'}</span>}
                  </span>
                  {c.next_follow_up_at && <span className="ui-bcard__fu">FU: {fmtDate(c.next_follow_up_at)}</span>}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
