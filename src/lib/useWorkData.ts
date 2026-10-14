import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { fetchCases, fetchFollowUps, fetchLeads } from '@/lib/api';
import type { Case, FollowUp, Lead } from '@/lib/api';
import { buildHomeSummary, buildWorkItems } from '@/lib/work';
import type { HomeSummary, WorkItem } from '@/lib/work';

interface State { loading: boolean; error: string | null; cases: Case[]; followUps: FollowUp[]; leads: Lead[] }

/**
 * Loads the three record sets Home and My Work are built from, once, and derives everything from them with the
 * pure functions in lib/work.ts — so both screens always show the same numbers.
 *
 * Limitation (documented): the api helpers log and swallow query errors and return [], so a failed query is
 * indistinguishable from "no records". We surface an error only for rejected promises and for being offline.
 */
export function useWorkData() {
  const { user, profile, role } = useAuth();
  const uid = user?.id ?? null;
  const [state, setState] = useState<State>({ loading: true, error: null, cases: [], followUps: [], leads: [] });
  const [now, setNow] = useState(() => Date.now());

  /** Reloads and returns the freshly derived list, so callers can verify an action really took effect. */
  const load = useCallback(async (): Promise<WorkItem[]> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState(s => ({ ...s, loading: false, error: 'Δεν υπάρχει σύνδεση στο διαδίκτυο.' }));
      return [];
    }
    const [c, f, l] = await Promise.allSettled([fetchCases(), fetchFollowUps({ status: 'all' }), fetchLeads()]);
    const failed = [c, f, l].some(r => r.status === 'rejected');
    setState({
      loading: false,
      error: failed ? 'Δεν ήταν δυνατή η φόρτωση όλων των δεδομένων.' : null,
      cases: c.status === 'fulfilled' ? c.value : [],
      followUps: f.status === 'fulfilled' ? f.value : [],
      leads: l.status === 'fulfilled' ? l.value : [],
    });
    const t = Date.now();
    setNow(t);
    const cases = c.status === 'fulfilled' ? c.value : [];
    const followUps = f.status === 'fulfilled' ? f.value : [];
    const leads = l.status === 'fulfilled' ? l.value : [];
    return uid ? buildWorkItems({ uid, now: t, cases, followUps, leads }) : [];
  }, [uid]);

  useEffect(() => { void load(); }, [load]);
  // keep "overdue / today" buckets honest while the page stays open
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(t); }, []);

  const items: WorkItem[] = useMemo(
    () => (uid ? buildWorkItems({ uid, now, cases: state.cases, followUps: state.followUps, leads: state.leads }) : []),
    [uid, now, state.cases, state.followUps, state.leads],
  );

  const isTeamView = role === 'admin' || role === 'manager';
  const summary: HomeSummary | null = useMemo(
    () => (uid ? buildHomeSummary({ uid, isTeamView, items, cases: state.cases, leads: state.leads, followUps: state.followUps, now }) : null),
    [uid, isTeamView, items, state.cases, state.leads, state.followUps, now],
  );

  return { loading: state.loading, error: state.error, items, summary, now, reload: load, role, firstName: (profile?.full_name ?? '').split(' ')[0] };
}
