// Data feeds shared by the top bar and the sidebar: nav badge counts and notifications.
// Moved unchanged from AppShell.tsx (same queries, same filters).
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ACTIVE_STAGES, BACK_OFFICE_STAGES } from '@/lib/roles';
import type { ShellCounts, Stage } from '@/lib/roles';
import { fetchCases, fetchCustomers, fetchFollowUps, fetchLeads, fetchNotifications } from '@/lib/api';
import type { AppNotification } from '@/lib/api';

export function useShellCounts(): ShellCounts {
  const { role } = useAuth();
  const [counts, setCounts] = useState<ShellCounts>({ leads: 0, followups: 0, backoffice: 0, cases: 0, customers: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      const [leads, fus, cases, customers] = await Promise.all([
        fetchLeads(), fetchFollowUps({ status: 'all' }), fetchCases(), fetchCustomers(),
      ]);
      if (!alive) return;
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const followups = fus.filter(f => {
        if (f.status === 'completed' || f.status === 'cancelled') return false;
        if (f.status === 'snoozed') return f.snoozed_until ? new Date(f.snoozed_until).getTime() <= endOfToday.getTime() : false;
        return new Date(f.due_at).getTime() <= endOfToday.getTime();
      }).length;
      const backoffice = cases.filter(c => BACK_OFFICE_STAGES.includes(c.current_stage)).length;
      const activeCases = cases.filter(c => ACTIVE_STAGES.includes(c.current_stage as Stage)).length;
      setCounts({
        leads: leads.length,
        followups,
        backoffice: Math.max(0, backoffice),
        cases: activeCases,
        customers: customers.length,
      });
    })();
    return () => { alive = false; };
  }, [role]);

  return counts;
}

export function useNotifications() {
  const { role } = useAuth();
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    const list = await fetchNotifications();
    setNotifs(list);
    setUnread(list.filter(n => !n.read_at).length);
  }, []);
  useEffect(() => { load(); }, [load, role]);
  return { notifs, unread, load };
}

/** Notification type chips. */
const NOTIF_TYPE: Record<string, { label: string; color: string }> = {
  followup: { label: 'Follow Up', color: '#0066cc' },
  visit: { label: 'Επίσκεψη', color: '#b45309' },
  document: { label: 'Έγγραφο', color: '#7c3aed' },
};
export function notifMeta(type: string) {
  return NOTIF_TYPE[type] ?? { label: 'Σύστημα', color: '#0e7490' };
}

/** Compact sidebar preference. Same storage key and event as the preferences page (until it moves to the server). */
const COMPACT_KEY = 'atlas.nav.collapsed';
const readCompact = (): boolean => { try { return localStorage.getItem(COMPACT_KEY) === '1'; } catch { return false; } };

export function useCompactPref() {
  const [compact, setCompact] = useState(readCompact);
  useEffect(() => {
    const sync = () => setCompact(readCompact());
    window.addEventListener('atlas:prefs', sync);
    return () => window.removeEventListener('atlas:prefs', sync);
  }, []);
  const toggle = useCallback(() => {
    const next = !readCompact();
    try { localStorage.setItem(COMPACT_KEY, next ? '1' : '0'); } catch { /* storage blocked: the choice lasts for this page view */ }
    setCompact(next);
    window.dispatchEvent(new Event('atlas:prefs'));
  }, []);
  return { compact, toggle };
}
