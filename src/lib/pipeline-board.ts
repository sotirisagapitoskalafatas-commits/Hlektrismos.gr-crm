// Pipeline board: groups cases into one lane per active stage and totals each lane. Pure, so it is unit-tested.
// Unknown values are never shown as €0: a lane total is null when none of its cases has a recorded value.
import type { Stage } from './roles';

export interface BoardCase { id: string; current_stage: string; value?: number | null }
export interface Lane<T extends BoardCase> { stage: Stage; cases: T[]; total: number | null; withoutValue: number }

export function groupByStage<T extends BoardCase>(cases: readonly T[], stages: readonly Stage[]): Lane<T>[] {
  const lanes = new Map<string, Lane<T>>(stages.map((s) => [s, { stage: s, cases: [], total: null, withoutValue: 0 }]));
  for (const c of cases) {
    const lane = lanes.get(c.current_stage);
    if (!lane) continue; // lost / cancelled / completed are not lanes
    lane.cases.push(c);
    const v = typeof c.value === 'number' && Number.isFinite(c.value) && c.value > 0 ? c.value : null;
    if (v === null) lane.withoutValue++;
    else lane.total = (lane.total ?? 0) + v;
  }
  return [...lanes.values()];
}

/** The lane to show on a phone: the saved one if it still exists, else the first lane that has cases, else the first. */
export function pickLane<T extends BoardCase>(lanes: readonly Lane<T>[], saved: string | null | undefined): Stage {
  if (saved && lanes.some((l) => l.stage === saved)) return saved as Stage;
  return (lanes.find((l) => l.cases.length > 0) ?? lanes[0]).stage;
}
