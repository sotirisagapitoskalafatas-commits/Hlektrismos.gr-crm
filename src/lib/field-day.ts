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

export const DEFAULT_ARRIVAL_RADIUS_M = 75;

/** «Φτάσατε στο…;» — the planned visit whose stored location is within radiusM of the current position (closest first).
    Display only: the app asks, the agent taps Check In. Nothing about the position is stored. No prompt when the GPS
    accuracy is worse than twice the radius. */
export function arrivalCandidate<V extends VisitLike>(
  visits: V[], pos: (v: V) => { lat: number; lng: number } | null,
  here: { lat: number; lng: number; accuracy?: number | null } | null, radiusM: number, dismissed: ReadonlySet<string> = new Set(),
): { visit: V; meters: number } | null {
  if (!here || !(radiusM > 0)) return null;
  if (here.accuracy != null && here.accuracy > radiusM * 2) return null;
  let best: { visit: V; meters: number } | null = null;
  for (const v of visits) {
    if (v.status !== 'planned' || dismissed.has(v.id)) continue;
    const p = pos(v);
    if (!p) continue;
    const m = distanceKm(here, p) * 1000;
    if (m <= radiusM && (!best || m < best.meters)) best = { visit: v, meters: m };
  }
  return best;
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

/* Visit outcomes — still defined in code (phase 2). The label is what is stored on the visit (case_visits.result)
   and in the check-out note, so existing records stay readable. `next` says what the app does after check-out:
     sale     → «Νέο Sale»: customer details → documents → handover to Back Office (the agent stays the originator)
     manager  → a follow-up for the Back Office queue, keeping the agent and the visit
     followup → the agent's own next follow-up (date asked)
   Reasons are fixed lists for now (the owner may change them later). */
export type OutcomeNext = 'sale' | 'manager' | 'followup' | 'none';
export interface VisitOutcome { key: string; label: string; next: OutcomeNext; reasons?: readonly string[] }

export const NO_SALE_REASONS = ['Τιμή / κόστος', 'Δέσμευση με τον τρέχοντα πάροχο', 'Λείπουν στοιχεία ή έγγραφα', 'Δεν αποφασίζει ο ίδιος', 'Άλλο'] as const;
export const NOT_INTERESTED_REASONS = ['Ικανοποιημένος με τον πάροχο', 'Δεν θέλει αλλαγή τώρα', 'Κακή προηγούμενη εμπειρία', 'Δεν θέλει επικοινωνία', 'Άλλο'] as const;

export const OUTCOMES: readonly VisitOutcome[] = [
  { key: 'new_sale', label: 'Νέο Sale', next: 'sale' },
  { key: 'interested', label: 'Ενδιαφέρεται — συνέχεια', next: 'followup' },
  { key: 'documents', label: 'Υπογραφή / συλλογή εγγράφων', next: 'followup' },
  { key: 'revisit', label: 'Χρειάζεται νέα επίσκεψη', next: 'followup' },
  { key: 'manager', label: 'Follow-up από υπεύθυνο', next: 'manager' },
  { key: 'no_sale', label: 'Χωρίς πώληση', next: 'none', reasons: NO_SALE_REASONS },
  { key: 'not_interested', label: 'Δεν ενδιαφέρεται', next: 'none', reasons: NOT_INTERESTED_REASONS },
  { key: 'not_found', label: 'Ο πελάτης δεν βρέθηκε', next: 'followup' },
];
export const VISIT_OUTCOMES = OUTCOMES.map(o => o.label);
export const outcomeByLabel = (label: string) => OUTCOMES.find(o => o.label === label) ?? null;

/** Prefix that marks a follow-up as «for the manager / Back Office» (a convention in code until workflows are configurable). */
export const MANAGER_FOLLOWUP_PREFIX = 'Follow-up από υπεύθυνο';
export const isManagerFollowUp = (reason: string | null | undefined) => (reason ?? '').startsWith(MANAGER_FOLLOWUP_PREFIX);

/** Text stored with the check-out, so the outcome survives even when the visit is queued offline. */
export function checkoutNote(outcome: string, notes: string, reason?: string): string {
  return [`Αποτέλεσμα: ${outcome}${reason ? ` — ${reason}` : ''}`, notes.trim()].filter(Boolean).join('\n');
}

/** Can the check-out be sent? An outcome is required; outcomes with reasons need one of the listed reasons. */
export function checkoutReady(outcomeLabel: string, reason: string): boolean {
  const o = outcomeByLabel(outcomeLabel);
  return !!o && (!o.reasons || o.reasons.includes(reason));
}
