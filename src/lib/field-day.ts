/* Field Sales day logic (pure, unit-tested). Fixes two bugs of the previous screen:
   visits were sorted with `+isoString` (NaN → random order) and labelled "today" while including every open visit. */

import { distanceKm } from './geo/distance';

export interface VisitLike {
  id: string;
  status: 'planned' | 'in_progress' | 'completed' | 'cancelled';
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
}

const t = (s: string | null | undefined) => (s ? new Date(s).getTime() : NaN);
function sameDay(a: number, b: number) {
  const x = new Date(a), y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

export interface DayGroups<V> {
  /** In progress first, then today's planned by time, then planned without a time. */
  today: V[];
  /** Planned for an earlier day and never started. */
  overdue: V[];
  upcoming: V[];
  doneToday: V[];
  /** The visit to focus on: the one in progress, else the next planned today, else the oldest overdue. */
  next: V | null;
}

export function groupVisits<V extends VisitLike>(visits: V[], now: number): DayGroups<V> {
  const open = visits.filter(v => v.status === 'planned' || v.status === 'in_progress');
  const inProgress = open.filter(v => v.status === 'in_progress');
  const planned = open.filter(v => v.status === 'planned');
  const at = (v: V) => t(v.scheduled_at);
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);

  const todayPlanned = planned.filter(v => Number.isFinite(at(v)) && sameDay(at(v), now)).sort((a, b) => at(a) - at(b));
  const undated = planned.filter(v => !Number.isFinite(at(v))).sort((a, b) => t(a.created_at) - t(b.created_at));
  const overdue = planned.filter(v => Number.isFinite(at(v)) && at(v) < startOfToday.getTime()).sort((a, b) => at(a) - at(b));
  const upcoming = planned.filter(v => Number.isFinite(at(v)) && at(v) > startOfToday.getTime() && !sameDay(at(v), now)).sort((a, b) => at(a) - at(b));
  const doneToday = visits.filter(v => v.status === 'completed' && Number.isFinite(t(v.ended_at)) && sameDay(t(v.ended_at), now))
    .sort((a, b) => t(b.ended_at) - t(a.ended_at));

  const today = [...inProgress.sort((a, b) => t(a.started_at) - t(b.started_at)), ...todayPlanned, ...undated];
  const nextPlanned = todayPlanned.find(v => at(v) >= now - 30 * 60_000) ?? todayPlanned[0];
  const next = inProgress[0] ?? nextPlanned ?? undated[0] ?? overdue[0] ?? null;
  return { today, overdue, upcoming, doneToday, next };
}

/** Cases with stored coordinates, nearest first when the position is known; never invents coordinates. */
export function nearestCases<C extends { lat: number | null; lng: number | null }>(cases: C[], here: { lat: number; lng: number } | null, limit = 6) {
  const located = cases.filter(c => c.lat != null && c.lng != null) as (C & { lat: number; lng: number })[];
  if (!here) return { sorted: false, items: located.slice(0, limit).map(c => ({ c, km: null as number | null })) };
  return {
    sorted: true,
    items: located.map(c => ({ c, km: distanceKm(here, c) as number | null })).sort((a, b) => (a.km ?? 0) - (b.km ?? 0)).slice(0, limit),
  };
}

export const VISIT_OUTCOMES = [
  'Ενδιαφέρεται — συνέχεια',
  'Υπογραφή / συλλογή εγγράφων',
  'Χρειάζεται νέα επίσκεψη',
  'Δεν ενδιαφέρεται',
  'Ο πελάτης δεν βρέθηκε',
] as const;

/** Text stored with the check-out, so the outcome survives even when the visit is queued offline. */
export function checkoutNote(outcome: string, notes: string): string {
  return [`Αποτέλεσμα: ${outcome}`, notes.trim()].filter(Boolean).join('\n');
}
