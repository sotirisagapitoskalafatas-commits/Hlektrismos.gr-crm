/* Admin dashboard, split into parts so Home can place each in its grid area (see components/app/HomePage):
   AdminSummary (Ενεργά Cases, Πελάτες, Pipeline σταθμισμένο, Εκπρόθεσμα Follow Ups), AdminFunnel,
   AdminOperations (Back Office ροή + Έγγραφα & Υπογραφές [+ Στελέχωση]), AdminTopAndNotifications.
   The default export still renders all of them together. Data and actions are unchanged. */

import { useEffect, useState } from 'react';
import { useNav } from '@/lib/nav';
import { ACTIVE_STAGES, BACK_OFFICE_STAGES, stageLabel } from '@/lib/roles';
import { fetchAllCaseStats } from '@/lib/api';
import { Btn, Card, CardHeader, EmptyState, Pill, StagePill, fmtMoney } from '@/lib/ui';
import { BarChart3, Bell, Briefcase, FolderOpen, MonitorCog, PenLine, Users } from 'lucide-react';
import type { DashboardData } from './data';
import { activeCases, lastActionDays, overdueFUs, wonCases, wonValue, ServiceLabel } from './data';
import { isOpenLead, pipelineStats } from '@/lib/home-insights';
import { BarRow, EmptyNote, KpiCard } from './shared';

const ROLE_LABEL: Record<string, string> = { admin: 'Admin / Back Office', sales_agent: 'Sales Agents' };

export function AdminSummary({ d }: { d: DashboardData }) {
  const { go } = useNav();
  const { cases, customers, leads, followUps } = d;
  const active = activeCases(cases);
  const overdue = overdueFUs(followUps);
  const pipe = pipelineStats(cases);
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <button type="button" className="text-left" onClick={() => go('cases', { status: 'active' })}>
        <KpiCard label="Ενεργά Cases" value={String(active.length)} sub={`${wonCases(cases).length} ολοκληρωμένα`} icon={Briefcase} />
      </button>
      {/* «leads στο pipeline» used to count every lead (incl. converted/lost); now only open leads. */}
      <button type="button" className="text-left" onClick={() => go('customers')}>
        <KpiCard label="Πελάτες" value={String(customers.length)} sub={`${leads.filter(isOpenLead).length} ανοιχτά leads`} icon={Users} />
      </button>
      <button type="button" className="text-left" onClick={() => go('reports')}>
        <KpiCard label="Pipeline (σταθμισμένο)" value={pipe.weighted === null ? 'μη διαθέσιμο' : fmtMoney(pipe.weighted)}
          sub={`${pipe.withoutValue ? `${pipe.withoutValue} χωρίς αξία εκτός · ` : ''}${fmtMoney(wonValue(cases))} κερδισμένα`} icon={BarChart3} />
      </button>
      <button type="button" className="text-left" onClick={() => go('followups', { status: 'pending' })}>
        <KpiCard label="Εκπρόθεσμα follow-ups" value={String(overdue.length)} sub="χρειάζονται σήμερα" icon={Bell} tone={overdue.length > 0 ? 'text-bad-600' : 'text-ink'} />
      </button>
    </div>
  );
}

/** Every stage is listed (also when empty); closed outcomes only when they have cases. Rows open the filtered list. */
export function AdminFunnel({ d }: { d: DashboardData }) {
  const { go } = useNav();
  const { cases } = d;
  const active = activeCases(cases);
  const rows = [...ACTIVE_STAGES, 'completed', 'lost', 'cancelled']
    .map(s => ({ stage: s, count: cases.filter(c => c.current_stage === s).length }))
    .filter(r => (ACTIVE_STAGES as string[]).includes(r.stage) || r.count > 0);
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <Card>
      <CardHeader micro="Pipeline" title="Funnel κατά στάδιο" action={<Pill tone="gray">{active.length} ενεργά</Pill>} />
      <div className="space-y-2 mt-1">
        {rows.map(f => (
          <button key={f.stage} type="button" className="block w-full text-left rounded-md hover:bg-ink/[0.03] px-1 -mx-1" onClick={() => go('cases', { stage: f.stage })}>
            <BarRow label={stageLabel(f.stage)} value={f.count} pct={Math.round((f.count / max) * 100)}
              tone={f.stage === 'completed' ? 'bg-ok-600' : f.stage === 'lost' || f.stage === 'cancelled' ? 'bg-bad-600' : 'bg-brand-500'} />
          </button>
        ))}
      </div>
    </Card>
  );
}

export function AdminOperations({ d, showStaffing = true }: { d: DashboardData; showStaffing?: boolean }) {
  const { go, openCase } = useNav();
  const { cases, staff } = d;
  const active = activeCases(cases);
  const bo = active.filter(c => BACK_OFFICE_STAGES.includes(c.current_stage));

  const [stats, setStats] = useState<Map<string, { documents: number; signatures: number }>>(new Map());
  useEffect(() => {
    let alive = true;
    (async () => {
      const ids = active.map(c => c.id);
      if (ids.length === 0) return;
      const m = await fetchAllCaseStats(ids);
      if (!alive) return;
      const out = new Map<string, { documents: number; signatures: number }>();
      m.forEach((s, id) => {
        const docs = s.documents.filter(x => x.status !== 'verified' && x.status !== 'approved').length;
        const sigs = s.signatures.filter(x => x.status !== 'verified' && x.status !== 'approved' && x.status !== 'accepted').length;
        out.set(id, { documents: docs, signatures: sigs });
      });
      setStats(out);
    })();
    return () => { alive = false; };
  }, [cases.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const pendingDocs = [...stats.values()].reduce((s, x) => s + x.documents, 0);
  const pendingSigs = [...stats.values()].reduce((s, x) => s + x.signatures, 0);
  const teamRows = Object.keys(ROLE_LABEL).map(r => ({ role: r, label: ROLE_LABEL[r], count: staff.filter(s => s.role === r).length })).filter(t => t.count > 0);

  return (
    <div className="space-y-4">
      <Card className="!p-0" pad={false}>
        <CardHeader micro="Operations" title="Back Office ροή" className="px-5 pt-5"
          action={<Btn variant="outline" onClick={() => go('backoffice')}><MonitorCog className="w-3.5 h-3.5" /> Operations</Btn>} />
        <div className="px-3 pb-3 space-y-1">
          {bo.length === 0 && <EmptyNote title="Καμία εργασία σε ροή" hint="Cases σε στάδια ελέγχου/ενεργοποίησης εμφανίζονται εδώ." />}
          {bo.slice(0, 5).map(c => (
            <button key={c.id} onClick={() => openCase(c.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ink/[0.03] text-left">
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-ink truncate">{c.customer?.full_name ?? c.title}</span>
                <span className="block text-xs text-ink/45 truncate">{c.case_no} · {ServiceLabel(c.service_type)} · τελευταίο βήμα {lastActionDays(c)} ημ.</span>
              </span>
              <StagePill stage={c.current_stage} />
            </button>
          ))}
        </div>
      </Card>

      <div className={`grid grid-cols-1 gap-4 ${showStaffing ? 'sm:grid-cols-2' : ''}`}>
        <Card>
          <CardHeader micro="Έλεγχος" title="Έγγραφα & Υπογραφές" action={<Pill tone={pendingDocs + pendingSigs > 0 ? 'amber' : 'green'}>{pendingDocs + pendingSigs}</Pill>} />
          <div className="mt-1 space-y-2">
            <button onClick={() => go('backoffice')} className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-line bg-white hover:bg-ink/[0.03]">
              <span className="flex items-center gap-2 text-[13px] text-ink/70"><FolderOpen className="w-3.5 h-3.5 text-ink/40" /> Έγγραφα προς έλεγχο</span>
              <span className="text-[13px] font-semibold">{pendingDocs}</span>
            </button>
            <button onClick={() => go('backoffice')} className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-line bg-white hover:bg-ink/[0.03]">
              <span className="flex items-center gap-2 text-[13px] text-ink/70"><PenLine className="w-3.5 h-3.5 text-ink/40" /> Υπογραφές σε εκκρεμότητα</span>
              <span className="text-[13px] font-semibold">{pendingSigs}</span>
            </button>
          </div>
        </Card>

        {showStaffing && (
          <Card>
            <CardHeader micro="Ομάδα" title="Στελέχωση" action={<Pill tone="gray">{staff.length}</Pill>} />
            <div className="mt-1 space-y-1.5">
              {teamRows.map(t => (
                <div key={t.role} className="flex items-center justify-between px-3 py-2 rounded-lg bg-ink/[0.03]">
                  <span className="text-[13px] text-ink/70">{t.label}</span>
                  <span className="text-[13px] font-semibold">{t.count}</span>
                </div>
              ))}
              {teamRows.length === 0 && <EmptyNote title="Κανένας χρήστης" hint="Οι λογαριασμοί εμφανίζονται εδώ." />}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export function AdminTopAndNotifications({ d }: { d: DashboardData }) {
  const { go, openCase } = useNav();
  const { cases, notifs, unread } = d;
  const topCases = [...activeCases(cases)].sort((a, b) => (b.value || 0) * (b.probability || 0) - (a.value || 0) * (a.probability || 0)).slice(0, 6);
  return (
    <div className="space-y-4">
      <Card className="!p-0" pad={false}>
        <CardHeader micro="Pipeline" title="Κορυφαία Cases" className="px-5 pt-5"
          action={<Btn variant="ghost" onClick={() => go('cases')}>Όλα τα cases</Btn>} />
        <div className="px-3 pb-3 space-y-1">
          {topCases.length === 0 && <EmptyState icon={Briefcase} title="Δεν υπάρχουν ενεργά cases" hint="Δημιουργήστε το πρώτο σας case." />}
          {topCases.map(c => (
            <button key={c.id} onClick={() => openCase(c.id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ink/[0.03] text-left">
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-ink truncate">
                  <span className="font-mono text-ink/40 text-[11px] mr-2">{c.case_no}</span>{c.customer?.full_name ?? c.title}
                </span>
                <span className="block text-xs text-ink/45 truncate">{ServiceLabel(c.service_type)} · {c.value ? `${fmtMoney((c.value || 0) * ((c.probability || 0) / 100))} σταθμ.` : 'χωρίς αξία'}</span>
              </span>
              <span className="text-[13px] font-semibold text-ink/80 shrink-0">{c.value ? fmtMoney(c.value) : '—'}</span>
              <StagePill stage={c.current_stage} />
            </button>
          ))}
        </div>
      </Card>

      <Card className="!p-0" pad={false}>
        <CardHeader micro="Ειδοποιήσεις" title="Τελευταία συμβάντα" className="px-5 pt-5"
          action={unread > 0 ? <Pill tone="red">{unread}</Pill> : undefined} />
        <div className="px-3 pb-3 space-y-1">
          {notifs.length === 0 && <div className="px-3 py-2 text-[13px] text-ink/50">Καμία ειδοποίηση</div>}
          {notifs.slice(0, 5).map(n => (
            <button key={n.id} onClick={() => n.case_id && openCase(n.case_id)}
              className="w-full flex gap-2.5 px-3 py-2 rounded-lg hover:bg-ink/5 text-left">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${n.read_at ? 'bg-ink/15' : 'bg-brand-500'}`} />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ink truncate">{n.title}</span>
                {n.body && <span className="block text-xs text-ink/50 mt-0.5 truncate">{n.body}</span>}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

/** `showStaffing={false}` when the page already shows staffing (Home «Η ομάδα» panel). */
export default function AdminDashboard({ d, showStaffing = true }: { d: DashboardData; showStaffing?: boolean }) {
  return (
    <div className="space-y-4">
      <AdminSummary d={d} />
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
        <AdminFunnel d={d} />
        <AdminOperations d={d} showStaffing={showStaffing} />
        <div className="lg:col-span-2 xl:col-span-1"><AdminTopAndNotifications d={d} /></div>
      </div>
    </div>
  );
}
