import { useEffect, useState } from 'react';
import {
  AppNotification, Case, CaseVisit, Customer, FollowUp, Lead, StaffProfile,
  fetchCases, fetchCustomers, fetchFollowUps, fetchLeads, fetchNotifications, fetchStaff, fetchVisits,
} from '@/lib/api';
import { ACTIVITY_META, SERVICES, stageLabel } from '@/lib/roles';
import { isToday } from '@/lib/ui';

export type DashboardData = {
  customers: Customer[];
  cases: Case[];
  leads: Lead[];
  followUps: FollowUp[];
  visits: CaseVisit[];
  staff: StaffProfile[];
  notifs: AppNotification[];
  unread: number;
};

export function useDashboardData(): DashboardData | null {
  const [d, setD] = useState<DashboardData | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [customers, cases, leads, followUps, visits, staff, notifs] = await Promise.all([
        fetchCustomers(),
        fetchCases({ includeDone: true }),
        fetchLeads(),
        fetchFollowUps({ status: 'all' }),
        fetchVisits(),
        fetchStaff(),
        fetchNotifications(),
      ]);
      if (!alive) return;
      setD({
        customers,
        cases,
        leads,
        followUps,
        visits,
        staff,
        notifs,
        unread: notifs.filter(n => !n.read_at).length,
      });
    })();
    return () => { alive = false; };
  }, []);
  return d;
}

/* ---------------- Derived helpers (real data, no estimates) ---------------- */
const TERMINAL = ['completed', 'lost', 'cancelled'];
export function activeCases(cases: Case[]): Case[] {
  return cases.filter(c => !TERMINAL.includes(c.current_stage));
}
export function wonCases(cases: Case[]): Case[] {
  return cases.filter(c => c.current_stage === 'completed');
}
export function lostCases(cases: Case[]): Case[] {
  return cases.filter(c => c.current_stage === 'lost' || c.current_stage === 'cancelled');
}
export function pipelineValue(cases: Case[]): number {
  return activeCases(cases).reduce((s, c) => s + (c.value || 0) * ((c.probability || 0) / 100), 0);
}
export function wonValue(cases: Case[]): number {
  return wonCases(cases).reduce((s, c) => s + (c.value || 0), 0);
}

export function overdueFUs(followUps: FollowUp[]): FollowUp[] {
  const now = Date.now();
  return followUps
    .filter(f => f.status === 'pending' && new Date(f.due_at).getTime() < now)
    .sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
}
export function todayFUs(followUps: FollowUp[]): FollowUp[] {
  const now = Date.now();
  return followUps
    .filter(f => f.status === 'pending' && isToday(f.due_at) && new Date(f.due_at).getTime() >= now)
    .sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
}
export function upcomingFUs(followUps: FollowUp[]): FollowUp[] {
  return followUps
    .filter(f => f.status === 'pending' && new Date(f.due_at).getTime() > new Date().setHours(23, 59, 59, 999))
    .sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
}

export function funnel(cases: Case[]): { label: string; count: number; stage: string }[] {
  const stages = ['new', 'contacted', 'offer', 'application', 'signed', 'document_check', 'submitted', 'activation', 'completed', 'lost', 'cancelled'];
  return stages
    .map(s => ({ stage: s, label: stageLabel(s), count: cases.filter(c => c.current_stage === s).length }))
    .filter(x => x.count > 0);
}

export function lastActionDays(c: Case): number {
  return Math.max(0, Math.round((Date.now() - new Date(c.updated_at).getTime()) / 86400000));
}

export function ServiceLabel(type: string): string {
  return SERVICES[type] ?? type;
}

export function CaseActivityHint(c: Case): string {
  const meta = ACTIVITY_META[c.current_stage as keyof typeof ACTIVITY_META];
  return meta ? meta.label : stageLabel(c.current_stage);
}