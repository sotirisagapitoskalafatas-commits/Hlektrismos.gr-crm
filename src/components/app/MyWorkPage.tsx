/* ------------------------------------------------------------------ */
/*  MyWorkPage — universal work inbox (CRM Shell Redesign).           */
/*  Real data only: cases + follow-ups touching the signed-in user.    */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { SERVICES } from '@/lib/roles';
import { Case, FollowUp, fetchCases, fetchFollowUps } from '@/lib/api';
import { Card, CardHeader, EmptyState, Micro, Spinner, StagePill, fmtTime, timeUntil, todayLabel } from '@/lib/ui';
import { Briefcase, CalendarClock, Inbox, Sun } from 'lucide-react';

export default function MyWorkPage() {
  const { user } = useAuth();
  const { openCase } = useNav();
  const [cases, setCases] = useState<Case[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [c, f] = await Promise.all([
      fetchCases(),
      fetchFollowUps({ status: 'all' }),
    ]);
    setCases(c);
    setFollowUps(f);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const uid = user?.id ?? null;

  const mine = useMemo(() => {
    if (!uid) return { cases: [] as Case[], fus: [] as FollowUp[] };
    const openCases = cases.filter(c =>
      c.owner_id === uid || c.inside_sales_owner === uid ||
      c.field_sales_owner === uid || c.back_office_owner === uid ||
      c.next_action_owner_id === uid,
    );
    const now = Date.now();
    const fus = followUps.filter(f => {
      if (f.assignee_id !== uid) return false;
      if (f.status === 'completed' || f.status === 'cancelled') return false;
      if (f.status === 'snoozed') return f.snoozed_until ? new Date(f.snoozed_until).getTime() <= now : false;
      return true;
    }).sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
    return { cases: openCases, fus };
  }, [uid, cases, followUps]);

  const overdueFu = mine.fus.filter(f => new Date(f.due_at).getTime() < Date.now());

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Universal work OS</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">My Work · {todayLabel()}</h2>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-ink/[0.06] text-ink/60 flex items-center justify-center">
              <Briefcase className="w-4.5 h-4.5" />
            </span>
            <div>
              <div className="text-xl font-bold text-ink leading-none">{mine.cases.length}</div>
              <Micro>Ανοιχτά cases μου</Micro>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-brand-500/10 text-brand-600 flex items-center justify-center">
              <CalendarClock className="w-4.5 h-4.5" />
            </span>
            <div>
              <div className="text-xl font-bold text-ink leading-none">{mine.fus.length}</div>
              <Micro>Follow ups μου</Micro>
            </div>
          </div>
        </Card>
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-bad-500/10 text-bad-600 flex items-center justify-center">
              <Sun className="w-4.5 h-4.5" />
            </span>
            <div>
              <div className="text-xl font-bold text-ink leading-none">{overdueFu.length}</div>
              <Micro>καθυστερούν</Micro>
            </div>
          </div>
        </Card>
      </div>

      {loading && <div className="flex items-center justify-center py-24"><Spinner /></div>}
      {!loading && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader micro="Follow ups" title="Επικοινωνίες που με αφορούν"
              action={<span className="pill bg-ink/[0.06] text-ink/60">{mine.fus.length}</span>} />
            <div className="space-y-1.5">
              {mine.fus.length === 0 && (
                <EmptyState icon={Inbox} title="Καμία εκκρεμότητα" hint="Τα follow ups που σας έχουν ανατεθεί θα εμφανιστούν εδώ." />
              )}
              {mine.fus.map(f => {
                const over = new Date(f.due_at).getTime() < Date.now();
                return (
                  <button key={f.id} onClick={() => f.case_id && openCase(f.case_id)}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 border ${over ? 'spine spine-critical bg-bad-100/50' : 'bg-paper/60 border-line'}`}>
                    <CalendarClock className={`w-3.5 h-3.5 shrink-0 ${over ? 'text-bad-600' : 'text-ink/40'}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-ink truncate">{f.case?.customer?.full_name ?? '—'}</span>
                      <span className="block text-xs text-ink/45 truncate">{f.case ? `${f.case.case_no} · ` : ''}{f.reason}{f.due_at ? ` · ${fmtTime(f.due_at)}` : ''}</span>
                    </span>
                    <span className={`text-[11px] shrink-0 ${over ? 'text-bad-600' : 'text-ink/40'}`}>{timeUntil(f.due_at)}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader micro="Cases" title="Aνοιχτά cases που με αφορούν"
              action={<span className="pill bg-ink/[0.06] text-ink/60">{mine.cases.length}</span>} />
            <div className="space-y-1.5">
              {mine.cases.length === 0 && (
                <EmptyState icon={Briefcase} title="Κανένα ανοιχτό case" hint="Τα ενεργά cases που σας έχουν ανατεθεί θα εμφανιστούν εδώ." />
              )}
              {mine.cases.map(c => (
                <button key={c.id} onClick={() => openCase(c.id)}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-ink/5 flex items-center gap-2.5">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate">{c.customer?.full_name ?? c.title}</span>
                    <span className="block text-xs text-ink/45 truncate">{c.case_no} · {SERVICE_LABEL(c)}</span>
                  </span>
                  <StagePill stage={c.current_stage} />
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function SERVICE_LABEL(c: Case) {
  return SERVICES[c.service_type] ?? c.service_type;
}