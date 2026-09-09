import { useNav } from '@/lib/nav';
import { stageLabel } from '@/lib/roles';
import { Card, CardHeader, EmptyState, Pill, StagePill, fmtDateTime, fmtMoney, isToday } from '@/lib/ui';
import { CalendarClock, Phone, Plus, UserPlus } from 'lucide-react';
import type { DashboardData } from './data';
import { activeCases, funnel, lastActionDays, overdueFUs, todayFUs, ServiceLabel } from './data';
import { BarRow, EmptyNote, KpiCard } from './shared';

export default function InsideSalesDashboard({ d }: { d: DashboardData }) {
  const { go, openCase } = useNav();
  const { cases, leads, followUps } = d;

  const active = activeCases(cases);
  const newLeadsToday = leads.filter(l => l.created_at && isToday(l.created_at)).length;
  const toContact = leads.filter(l => l.status === 'new' || l.status === 'qualified');
  const overdue = overdueFUs(followUps);
  const today = todayFUs(followUps);
  const offer = active.filter(c => c.current_stage === 'offer').length;

  const sorted = [...active].sort((a, b) => (b.value || 0) * (b.probability || 0) - (a.value || 0) * (a.probability || 0));
  const maxFunnel = Math.max(1, ...funnel(cases).map(f => f.count));

  const allLeads = [...leads].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="Νέα leads σήμερα" value={String(newLeadsToday)} sub={`${leads.length} συνολικά`} icon={UserPlus} tone={newLeadsToday > 0 ? 'text-brand-600' : 'text-ink'} />
        <KpiCard label="Προς επικοινωνία" value={String(toContact.length)} sub="νέα ή qualified" icon={Phone} />
        <KpiCard label="Ενεργά Cases" value={String(active.length)} sub={`${offer} στο στάδιο προσφοράς`} icon={CalendarClock} />
        <KpiCard label="Follow Ups σήμερα" value={String(overdue.length + today.length)} sub={`${today.length} σήμερα · ${overdue.length} εκπρόθεσμα`} icon={Plus} tone={overdue.length > 0 ? 'text-bad-600' : 'text-ink'} />
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Leads needing contact */}
        <Card className="lg:col-span-2 !p-0" pad={false}>
          <CardHeader micro="Leads" title="Χρειάζονται επικοινωνία" className="px-5 pt-5"
            action={<Pill tone={toContact.length > 0 ? 'red' : 'green'}>{toContact.length}</Pill>} />
          <div className="px-3 pb-3 space-y-1">
            {toContact.length === 0 && <EmptyState icon={UserPlus} title="Δεν υπάρχουν leads για επικοινωνία" hint="Τα νέα leads εμφανίζονται εδώ." />}
            {toContact.map(l => {
              const name = l.full_name ?? l.client_name ?? [l.first_name, l.last_name].filter(Boolean).join(' ') ?? '—';
              return (
                <button key={l.id} onClick={() => go('leads')}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-ink/[0.03] text-left">
                  <span className="w-7 h-7 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
                    <Phone className="w-3.5 h-3.5 text-brand-600" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate">{name || 'Ανώνυμο lead'}</span>
                    <span className="block text-xs text-ink/45 truncate">
                      {l.service_category ? ServiceLabel(l.service_category) : 'Γενικό'} · {l.created_at ? `${isToday(l.created_at) ? 'σήμερα' : 'σε αναμονή'}` : '—'}
                    </span>
                  </span>
                  <Pill tone={l.status === 'new' ? 'blue' : 'amber'}>{l.status === 'new' ? 'Νέο' : 'Qualified'}</Pill>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Funnel + overdue */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader micro="Pipeline" title="Funnel κατά στάδιο" action={<Pill tone="gray">{active.length} ενεργά</Pill>} />
            <div className="mt-2 space-y-2.5">
              {funnel(cases).filter(f => f.stage !== 'completed' && f.stage !== 'lost').map(f => (
                <BarRow key={f.stage} label={stageLabel(f.stage)} value={f.count} pct={Math.round((f.count / maxFunnel) * 100)} tone="bg-brand-500" />
              ))}
              {funnel(cases).filter(f => f.stage !== 'completed' && f.stage !== 'lost').length === 0 && <EmptyNote title="Δεν υπάρχουν ενεργά cases" />}
            </div>
          </Card>

          <Card className="!p-0" pad={false}>
            <CardHeader micro="Follow Ups" title="Εκπρόθεσμα & σημερινά" className="px-5 pt-5"
              action={<Pill tone={overdue.length + today.length > 0 ? 'red' : 'green'}>{overdue.length + today.length}</Pill>} />
            <div className="px-3 pb-3 space-y-1">
              {overdue.length === 0 && today.length === 0 && <EmptyState icon={CalendarClock} title="Δεν υπάρχουν εκκρεμή follow ups" hint="Όλες οι ενέργειες εντός προγράμματος." />}
              {[...overdue, ...today].slice(0, 5).map(f => (
                <button key={f.id} onClick={() => f.case_id && openCase(f.case_id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-ink/[0.03] text-left">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${overdue.includes(f) ? 'bg-bad-600/10' : 'bg-brand-500/10'}`}>
                    <CalendarClock className={`w-3.5 h-3.5 ${overdue.includes(f) ? 'text-bad-600' : 'text-brand-600'}`} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate">{f.case?.customer?.full_name ?? f.case?.case_no}</span>
                    <span className="block text-xs text-ink/45 truncate">{f.reason} · {f.case?.title}</span>
                  </span>
                  <span className={`text-xs font-medium shrink-0 ${overdue.includes(f) ? 'text-bad-600' : 'text-ink/50'}`}>{fmtDateTime(f.due_at)}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Active cases next action */}
      <Card className="!p-0" pad={false}>
        <CardHeader micro="Επόμενη ενέργεια" title="Ενεργά Cases" className="px-5 pt-5"
          action={<Pill tone="gray">{active.length}</Pill>} />
        <div className="px-3 pb-3 space-y-1">
          {sorted.length === 0 && <EmptyState icon={CalendarClock} title="Δεν υπάρχουν ενεργά cases" hint="Δημιουργήστε το πρώτο σας case." />}
          {sorted.map(c => (
            <button key={c.id} onClick={() => openCase(c.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-ink/[0.03] text-left">
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-ink truncate">
                  <span className="font-mono text-ink/40 text-[11px] mr-2">{c.case_no}</span>{c.customer?.full_name ?? c.title}
                </span>
                <span className="block text-xs text-ink/45 truncate">
                  {c.next_action || stageLabel(c.current_stage)} · {ServiceLabel(c.service_type)} · χωρίς βήμα {lastActionDays(c)} ημ.
                </span>
              </span>
              <span className="hidden sm:block text-xs text-ink/45 shrink-0">{fmtMoney((c.value || 0) * ((c.probability || 0) / 100))} σταθμ.</span>
              <span className="text-[13px] font-semibold text-ink/80 shrink-0">{fmtMoney(c.value)}</span>
              <StagePill stage={c.current_stage} />
            </button>
          ))}
        </div>
        {allLeads.length > 0 && (
          <div className="border-t border-line px-5 py-2.5">
            <button onClick={() => go('leads')} className="flex items-center gap-2 text-[13px] font-medium text-brand-600 hover:underline">
              <Plus className="w-3.5 h-3.5" /> Προβολή όλων των leads ({allLeads.length})
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}