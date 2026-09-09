import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import type { Role } from '@/lib/roles';
import { CHANNELS, SERVICES } from '@/lib/roles';
import { Case, FollowUp, fetchCases, fetchFollowUps } from '@/lib/api';
import { Btn, Card, CardHeader, EmptyState, Micro, Pill, StagePill, fmtDateTime, fmtMoney, isToday, todayLabel } from '@/lib/ui';
import { ArrowUpRight, Briefcase, CalendarClock, Compass, LayoutDashboard, Map } from 'lucide-react';
import type { IconType } from '@/lib/ui';

type QuickAction = { icon: IconType; label: string; onClick: () => void };

function useQuickActions(go: (p: 'cases' | 'followups' | 'leads' | 'myday' | 'map' | 'backoffice') => void, role: Role) {
  const all: QuickAction[] = [
    { icon: Briefcase, label: 'Νέο Case', onClick: () => go('cases') },
    { icon: CalendarClock, label: 'Follow Ups', onClick: () => go('followups') },
  ];
  const extra: QuickAction[] = [];
  if (role === 'field_sales') {
    extra.push({ icon: Compass, label: 'Ημέρα μου', onClick: () => go('myday') });
    extra.push({ icon: Map, label: 'Χάρτης', onClick: () => go('map') });
  }
  if (role === 'back_office') {
    extra.push({ icon: LayoutDashboard, label: 'Operations', onClick: () => go('backoffice') });
  }
  if (role === 'inside_sales' || role === 'admin' || role === 'manager') {
    extra.push({ icon: ArrowUpRight, label: 'Leads', onClick: () => go('leads') });
  }
  return [...all, ...extra];
}

export default function HomePage() {
  const { role } = useAuth();
  const { go, openCase } = useNav();
  const [cases, setCases] = useState<Case[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [c, f] = await Promise.all([fetchCases(), fetchFollowUps({ status: 'all' })]);
    setCases(c.filter(x => x.current_stage !== 'completed'));
    setFollowUps(f.filter(x => x.status === 'pending' || x.status === 'snoozed'));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const active = cases;
  const pipeline = active.reduce((s, c) => s + (c.value || 0) * ((c.probability || 0) / 100), 0);
  const overdue = followUps.filter(f => f.status === 'pending' && new Date(f.due_at) < now)
    .sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
  const todayList = followUps.filter(f => f.status === 'pending' && isToday(f.due_at) && new Date(f.due_at) >= now);
  const soon = followUps.filter(f => f.status === 'pending' && !isToday(f.due_at) && new Date(f.due_at) > now)
    .sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
  const needsYou = [...overdue, ...todayList, ...soon].slice(0, 7);

  const quick = useQuickActions(go, role);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Καλημέρα' : hour < 18 ? 'Καλησπέρα' : 'Καλησπέρα';
  const recent = [...active].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 5);

  if (loading) {
    return <div className="flex items-center justify-center py-24"><div className="w-6 h-6 border-2 border-line border-t-ink rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <Micro tone="brand">Command Center</Micro>
          <h2 className="text-xl font-semibold text-ink tracking-tight mt-1">{greeting} · {todayLabel()}</h2>
        </div>
        <div className="flex gap-2">
          {quick.slice(0, 3).map(a => (
            <Btn key={a.label} variant="outline" onClick={a.onClick}>
              <a.icon className="w-3.5 h-3.5" /> {a.label}
            </Btn>
          ))}
        </div>
      </div>

      {/* Vitals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { micro: 'Active Cases', value: String(active.length), sub: 'νέα · επικοινωνία · προσφορά·…', tone: 'text-ink' as const },
          { micro: 'Σημερινά Follow Ups', value: String(overdue.length + todayList.length), sub: `${todayList.length} σήμερα · ${overdue.length} εκπρόθεσμα`, tone: overdue.length > 0 ? 'text-bad-600' as const : 'text-ok-600' as const },
          { micro: 'Pipeline Value', value: fmtMoney(pipeline), sub: 'σταθμισμένη αξία', tone: 'text-ink' as const },
          { micro: 'Εκπρόθεσμα', value: String(overdue.length), sub: 'χρειάζονται σήμερα', tone: overdue.length > 0 ? 'text-bad-600' as const : 'text-ink/40' as const },
        ].map(v => (
          <Card key={v.micro}>
            <Micro>{v.micro}</Micro>
            <div className={`mt-2 text-[26px] font-semibold tracking-tight leading-none ${v.tone}`}>{v.value}</div>
            <div className="text-xs text-ink/40 mt-2">{v.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-5">
        {/* Needs you — attention queue */}
        <Card className="lg:col-span-3 !p-0" pad={false}>
          <CardHeader micro="Attention queue" title="Χρειάζεται την προσοχή σας" className="px-5 pt-5"
            action={
              <Btn variant="ghost" onClick={() => go('followups')}>
                Όλα τα Follow Ups <ArrowUpRight className="w-3.5 h-3.5" />
              </Btn>
            } />
          <div className="px-3 pb-3">
            {needsYou.length === 0 && (
              <EmptyState icon={CalendarClock} title="Δεν υπάρχουν εκκρεμή follow ups" hint="Όλα εντός προγράμματος — ωραία δουλειά." />
            )}
            {needsYou.map(f => {
              const isOver = new Date(f.due_at) < now;
              const isTod = isToday(f.due_at) && !isOver;
              const sev = isOver ? 'critical' : isTod ? 'high' : 'medium';
              const custName = f.case?.customer?.full_name ?? f.case?.case_no ?? '—';
              const channel = CHANNELS[f.channel] ?? f.channel;
              return (
                <button key={f.id} onClick={() => f.case_id && openCase(f.case_id)}
                  className={`w-full text-left spine spine-${sev} rounded-lg px-3 py-2.5 hover:bg-ink/[0.03] transition-colors flex items-center gap-3`}>
                  <span className="w-7 h-7 rounded-lg bg-ink/5 flex items-center justify-center shrink-0">
                    <CalendarClock className="w-3.5 h-3.5 text-ink/50" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate">{custName}</span>
                    <span className="block text-xs text-ink/45 truncate">{channel} · {f.case?.title}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5 shrink-0">
                    <span className="text-xs font-medium text-ink/70">{fmtDateTime(f.due_at)}</span>
                    {f.priority === 'high' || f.priority === 'critical'
                      ? <Pill tone="red">{f.priority === 'critical' ? 'Κρίσιμο' : 'Υψηλό'}</Pill>
                      : <Pill tone="gray">Κανονικό</Pill>}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Right column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Quick actions */}
          <Card>
            <CardHeader micro="Quick actions" title="Γρήγορες ενέργειες" />
            <div className="space-y-1.5">
              {quick.map(a => (
                <button key={a.label} onClick={a.onClick}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-ink/5 transition-colors text-[13px] font-medium text-ink/80">
                  <a.icon className="w-4 h-4 text-ink/40" /> {a.label}
                  <ArrowUpRight className="w-3.5 h-3.5 ml-auto text-ink/30" />
                </button>
              ))}
            </div>
          </Card>

          {/* Pipeline top */}
          <Card className="!p-0" pad={false}>
            <CardHeader micro="Pipeline" title="Κορυφαία Cases" className="px-5 pt-5" />
            <div className="px-3 pb-3 space-y-1">
              {recent.length === 0 && (
                <EmptyState icon={Briefcase} title="Δεν υπάρχουν ενεργά cases" hint="Δημιουργήστε το πρώτο σας case από την ενότητα Cases." />
              )}
              {recent.map(c => (
                <button key={c.id} onClick={() => openCase(c.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-ink/[0.03] transition-colors flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-medium text-ink truncate">
                      <span className="font-mono text-ink/40 text-[11px] mr-2">{c.case_no}</span>{c.customer?.full_name ?? c.title}
                    </span>
                    <span className="block text-xs text-ink/45 truncate">{SERVICES[c.service_type] ?? c.service_type} · {c.title}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-[13px] font-semibold text-ink/80">{fmtMoney(c.value)}</span>
                    <StagePill stage={c.current_stage} />
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}