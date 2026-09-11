import { useNav } from '@/lib/nav';
import { Btn, Card, CardHeader, EmptyState, Pill, fmtDate, fmtTime, isToday } from '@/lib/ui';
import { CalendarClock, Compass, Map, MapPin, Route, Users } from 'lucide-react';
import NavigationButton from '@/components/navigation/NavigationButton';
import { CaseVisit } from '@/lib/api';
import type { DashboardData } from './data';
import { overdueFUs, todayFUs } from './data';
import { EmptyNote, KpiCard } from './shared';

const VISIT_LABEL: Record<string, string> = {
  planned: 'Προγραμματισμένη',
  in_progress: 'Σε εξέλιξη',
  completed: 'Ολοκληρώθηκε',
  cancelled: 'Ακυρώθηκε',
};

function sortPending(visits: CaseVisit[]): CaseVisit[] {
  return [...visits]
    .filter(v => v.status === 'planned' || v.status === 'in_progress')
    .sort((a, b) => {
      const ta = a.scheduled_at ? +new Date(a.scheduled_at) : Infinity;
      const tb = b.scheduled_at ? +new Date(b.scheduled_at) : Infinity;
      if (a.status === 'in_progress') return -1;
      if (b.status === 'in_progress') return 1;
      return ta - tb;
    });
}

export default function FieldSalesDashboard({ d }: { d: DashboardData }) {
  const { go, openCase } = useNav();
  const { visits, followUps } = d;

  const pending = sortPending(visits);
  const next = pending[0];
  const inProgress = visits.filter(v => v.status === 'in_progress').length;
  const plannedToday = visits.filter(v => v.status === 'planned' && v.scheduled_at && isToday(v.scheduled_at)).length;
  const completedToday = visits.filter(v => v.status === 'completed' && v.ended_at && isToday(v.ended_at)).length;
  const overdue = overdueFUs(followUps);
  const today = todayFUs(followUps);
  const todayVisits = visits.filter(v => v.scheduled_at && isToday(v.scheduled_at) && v.status !== 'cancelled');

  const ctas = [
    { icon: Compass, label: 'Ημέρα μου', sub: 'πρόγραμμα & check-in', onClick: () => go('myday') },
    { icon: Map, label: 'Χάρτης', sub: 'cases & επισκέψεις', onClick: () => go('map') },
    { icon: Route, label: 'Δρομολόγιο', sub: 'βέλτιστη σειρά', onClick: () => go('map', { focus: 'route' }) },
    { icon: Users, label: 'Cases', sub: 'όλα τα ανοιχτά', onClick: () => go('cases') },
  ];

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Σε εξέλιξη" value={String(inProgress)} sub="επισκέψεις τώρα" icon={MapPin} tone={inProgress > 0 ? 'text-brand-600' : 'text-ink'} />
        <KpiCard label="Σήμερα" value={String(plannedToday)} sub="προγραμματισμένες" icon={CalendarClock} tone={plannedToday > 0 ? 'text-brand-600' : 'text-ink'} />
        <KpiCard label="Ολοκληρώθηκαν" value={String(completedToday)} sub="σήμερα" icon={MapPin} tone="text-ink" />
        <KpiCard label="Follow Ups" value={String(overdue.length + today.length)} sub={`${today.length} σήμερα · ${overdue.length} εκπρόθεσμα`} icon={CalendarClock} tone={overdue.length > 0 ? 'text-bad-600' : 'text-ink'} />
      </div>

      {/* Big CTAs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {ctas.map(c => (
          <button key={c.label} onClick={c.onClick}
            className="flex items-center gap-3 rounded-2xl border border-line bg-white p-4 text-left hover:border-brand-500/40 transition-colors active:scale-[0.99]">
            <span className="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0">
              <c.icon className="w-5 h-5 text-brand-600" />
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-ink leading-tight">{c.label}</span>
              <span className="block text-xs text-ink/45 truncate">{c.sub}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Next stop */}
        <Card className="lg:col-span-2">
          <CardHeader micro="Next stop" title="Επόμενη επίσκεψη" action={next && <Pill tone={next.status === 'in_progress' ? 'blue' : 'gray'}>{VISIT_LABEL[next.status]}</Pill>} />
          {!next && <EmptyState icon={MapPin} title="Δεν υπάρχουν προγραμματισμένες επισκέψεις" hint="Οι επισκέψεις του ημερολογίου εμφανίζονται εδώ." />}
          {next && (
            <div className="mt-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[15px] font-semibold text-ink">{next.case?.customer?.full_name ?? next.case?.title}</div>
                  <div className="text-xs text-ink/50 mt-0.5">{next.case?.case_no} · {next.case?.title}</div>
                </div>
                <Pill tone="blue">{VISIT_LABEL[next.status]}</Pill>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-ink/60">
                <span className="flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-ink/40" />{next.scheduled_at ? `${fmtDate(next.scheduled_at)} · ${fmtTime(next.scheduled_at)}` : 'Χωρίς ώρα'}</span>
                {next.location?.label && <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-ink/40" />{next.location.label}</span>}
                {next.purpose && <span className="flex items-center gap-1.5">{next.purpose}</span>}
              </div>
              <div className="mt-4 flex gap-2">
                <Btn variant="primary" onClick={() => next.case_id && openCase(next.case_id)}>Άνοιγμα Case</Btn>
                {next.location && typeof next.location.lat === 'number' && typeof next.location.lng === 'number' && (
                  <NavigationButton destination={{ lat: next.location.lat, lng: next.location.lng, label: next.case?.customer?.full_name ?? next.case?.title }} caseId={next.case_id ?? undefined} label="Πλοήγηση" showSelector={false} />
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Today's / pending visits */}
        <Card className="lg:col-span-3 !p-0" pad={false}>
          <CardHeader micro="Επισκέψεις" title="Σημερινές & εκκρεμείς" className="px-5 pt-5"
            action={<Pill tone="gray">{pending.length}</Pill>} />
          <div className="px-3 pb-3 space-y-1">
            {todayVisits.length === 0 && pending.length === 0 && <EmptyNote title="Δεν υπάρχουν επισκέψεις" hint="Προγραμματίστε μια επίσκεψη από το case." />}
            {pending.map(v => (
              <button key={v.id} onClick={() => v.case_id && openCase(v.case_id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-ink/[0.03] text-left">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${v.status === 'in_progress' ? 'bg-brand-500/10' : 'bg-ink/5'}`}>
                  <MapPin className={`w-3.5 h-3.5 ${v.status === 'in_progress' ? 'text-brand-600' : 'text-ink/40'}`} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium text-ink truncate">{v.case?.customer?.full_name ?? v.case?.title}</span>
                  <span className="block text-xs text-ink/45 truncate">{v.purpose || v.case?.title} · {v.scheduled_at ? `${fmtDate(v.scheduled_at)} ${fmtTime(v.scheduled_at)}` : '—'}</span>
                </span>
                <Pill tone={v.status === 'in_progress' ? 'blue' : 'gray'}>{VISIT_LABEL[v.status]}</Pill>
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* Follow ups */}
      <Card className="!p-0" pad={false}>
        <CardHeader micro="Follow Ups" title="Σημερινά & εκπρόθεσμα" className="px-5 pt-5"
          action={<Pill tone={overdue.length + today.length > 0 ? 'red' : 'green'}>{overdue.length + today.length}</Pill>} />
        <div className="px-3 pb-3 space-y-1">
          {today.length === 0 && overdue.length === 0 && <EmptyState icon={CalendarClock} title="Δεν υπάρχουν εκκρεμή follow ups" hint="Όλες οι ενέργειες εντός προγράμματος." />}
          {[...overdue, ...today].slice(0, 5).map(f => (
            <button key={f.id} onClick={() => f.case_id && openCase(f.case_id)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ink/[0.03] text-left">
              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${overdue.includes(f) ? 'bg-bad-600/10' : 'bg-brand-500/10'}`}>
                <CalendarClock className={`w-3.5 h-3.5 ${overdue.includes(f) ? 'text-bad-600' : 'text-brand-600'}`} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-ink truncate">{f.case?.customer?.full_name ?? f.case?.case_no}</span>
                <span className="block text-xs text-ink/45 truncate">{f.reason}</span>
              </span>
              <span className={`text-xs font-medium shrink-0 ${overdue.includes(f) ? 'text-bad-600' : 'text-ink/50'}`}>{fmtDate(f.due_at)}</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}