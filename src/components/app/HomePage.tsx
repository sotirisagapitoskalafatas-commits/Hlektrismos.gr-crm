/* Αρχική — a calm personal start page: what needs attention today and what to do next.
   Numbers come from lib/work.ts (same definitions as «Η εργασία μου»). Anything that cannot be known is shown as
   «μη διαθέσιμο», never as 0. The previous role dashboards remain available under «Αναλυτικός πίνακας». */

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useNav } from '@/lib/nav';
import { useWorkData } from '@/lib/useWorkData';
import { fmtMoney, todayLabel } from '@/lib/ui';
import { WorkRow } from '@/components/work/WorkRow';
import { DashboardLoader } from '@/components/dashboards/shared';
import { OperationalStrip } from '@/components/dashboards/OperationalStrip';
import AdminDashboard from '@/components/dashboards/AdminDashboard';
import ManagerDashboard from '@/components/dashboards/ManagerDashboard';
import InsideSalesDashboard from '@/components/dashboards/InsideSalesDashboard';
import FieldSalesDashboard from '@/components/dashboards/FieldSalesDashboard';
import BackOfficeDashboard from '@/components/dashboards/BackOfficeDashboard';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Καλημέρα' : h < 17 ? 'Καλό μεσημέρι' : 'Καλησπέρα';
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Stat({ value, label, alert, onClick }: { value: number | null; label: string; alert?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="atx-stat" onClick={onClick}>
      <div className={`atx-stat-n ${value === null ? 'is-na' : alert && value > 0 ? 'is-alert' : ''}`}>{value === null ? 'μη διαθέσιμο' : value}</div>
      <div className="atx-stat-l">{label}</div>
    </button>
  );
}

export default function HomePage() {
  const { go } = useNav();
  const { loading, error, items, summary, now, reload, role, firstName } = useWorkData();
  const [classic, setClassic] = useState(false);

  const attention = items.filter(i => i.bucket !== 'upcoming');
  const top = attention.slice(0, 5);

  const headline = (() => {
    if (!summary) return '';
    if (summary.overdue > 0) return `Έχετε ${plural(summary.overdue, 'εκπρόθεσμο follow-up', 'εκπρόθεσμα follow-ups')} που χρειάζονται προσοχή.`;
    if (attention.length > 0) return `Έχετε ${plural(attention.length, 'εργασία', 'εργασίες')} για σήμερα.`;
    return 'Δεν υπάρχει κάτι επείγον αυτή τη στιγμή.';
  })();

  return (
    <div className="atx-page">
      <div className="atx-head">
        <p className="atx-eyebrow">{todayLabel()}</p>
        <h1 className="atx-title">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
        {!loading && !error && <p className="atx-sub">{headline}</p>}
      </div>

      {error && (
        <div className="atx-notice mt-5 flex items-center justify-between gap-3" role="alert">
          <span>{error}</span>
          <button className="atx-btn atx-btn-quiet" onClick={() => void reload()}>Δοκιμή ξανά</button>
        </div>
      )}

      <div role="region" className="atx-section" aria-label="Σύνοψη">
        <div className="atx-stats">
          <Stat value={loading || !summary ? null : summary.overdue} alert label="Εκπρόθεσμα follow-ups" onClick={() => go('mywork', { tab: 'today', kind: 'followup' })} />
          <Stat value={loading || !summary ? null : summary.today} label="Follow-ups σήμερα" onClick={() => go('mywork', { tab: 'today', kind: 'followup' })} />
          <Stat value={loading || !summary ? null : summary.awaitingFirstContact} label="Leads για πρώτη επικοινωνία" onClick={() => go('mywork', { tab: 'today', kind: 'lead' })} />
          <Stat value={loading || !summary ? null : summary.casesNeedingMyAction} label="Cases που περιμένουν εσάς" onClick={() => go('mywork', { tab: 'today', kind: 'case' })} />
        </div>
      </div>

      <div role="region" className="atx-section" aria-label="Προτεραιότητες">
        <div className="atx-section-head">
          <h2 className="atx-section-title">Τι να κάνετε τώρα</h2>
          <button className="atx-link" onClick={() => go('mywork')}>
            Όλη η εργασία{!loading && attention.length > top.length ? ` (${attention.length})` : ''}
          </button>
        </div>
        <div className="atx-panel" aria-busy={loading}>
          {loading && [0, 1, 2].map(i => <div key={i} className="atx-skeleton" aria-hidden="true" />)}
          {!loading && top.length === 0 && (
            <div className="atx-empty">
              <CheckCircle2 className="mx-auto mb-3" size={28} aria-hidden="true" />
              <strong>Όλα είναι υπό έλεγχο</strong>
              Δεν υπάρχει εργασία που να περιμένει εσάς αυτή τη στιγμή.
            </div>
          )}
          {!loading && top.length > 0 && (
            <ul className="m-0 p-0 list-none">
              {top.map(row => <WorkRow key={row.key} item={row} now={now} onChanged={reload} />)}
            </ul>
          )}
        </div>
      </div>

      {summary?.team && (
        <div role="region" className="atx-section" aria-label="Η ομάδα">
          <div className="atx-section-head"><h2 className="atx-section-title">Η ομάδα</h2></div>
          <div className="atx-panel">
            <ul className="m-0 p-0 list-none">
              {[
                { n: summary.team.unassignedNewLeads, label: 'Νέα leads χωρίς ανάθεση', hint: 'Περιμένουν υπεύθυνο', go: () => go('leads'), alert: true },
                { n: summary.team.staleCases, label: 'Cases χωρίς κίνηση 7+ ημέρες', hint: 'Ενεργά cases που δεν έχουν ενημερωθεί', go: () => go('cases'), alert: true },
                { n: summary.team.overdueFollowUps, label: 'Εκπρόθεσμα follow-ups ομάδας', hint: 'Όλων των υπαλλήλων', go: () => go('followups', { status: 'pending' }), alert: true },
              ].map(r => (
                <li key={r.label} className="atx-row">
                  <button type="button" className="atx-row-main" onClick={r.go}>
                    <span className="atx-row-title">{r.label}</span>
                    <span className="atx-row-sub">{r.hint}</span>
                  </button>
                  <span className={`atx-stat-n !text-[22px] ${r.alert && r.n > 0 ? 'is-alert' : ''}`}>{r.n}</span>
                </li>
              ))}
              <li className="atx-row">
                <button type="button" className="atx-row-main" onClick={() => go('cases')}>
                  <span className="atx-row-title">Καταγεγραμμένη αξία ενεργών cases</span>
                  <span className="atx-row-sub">
                    {summary.team.activeCasesWithoutValue > 0
                      ? `${plural(summary.team.activeCasesWithoutValue, 'ενεργό case', 'ενεργά cases')} χωρίς καταχωρημένη αξία δεν περιλαμβάνονται`
                      : 'Όλα τα ενεργά cases έχουν αξία'}
                  </span>
                </button>
                <span className="atx-stat-n !text-[22px]">{summary.team.pipelineKnownValue > 0 ? fmtMoney(summary.team.pipelineKnownValue) : 'μη διαθέσιμο'}</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      <div role="region" className="atx-section" aria-label="Αναλυτικός πίνακας">
        <button className="atx-link" aria-expanded={classic} onClick={() => setClassic(v => !v)}>
          {classic ? 'Απόκρυψη αναλυτικού πίνακα' : 'Αναλυτικός πίνακας (πλήρης προβολή ανά ρόλο)'}
        </button>
        {classic && (
          <div className="mt-4 space-y-5">
            <DashboardLoader>
              {d => (
                <>
                  <OperationalStrip d={d} />
                  {role === 'admin' ? <AdminDashboard d={d} />
                    : role === 'manager' ? <ManagerDashboard d={d} />
                    : role === 'inside_sales' ? <InsideSalesDashboard d={d} />
                    : role === 'field_sales' ? <FieldSalesDashboard d={d} />
                    : <BackOfficeDashboard d={d} />}
                </>
              )}
            </DashboardLoader>
          </div>
        )}
      </div>
    </div>
  );
}
