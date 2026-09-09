import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { SERVICES, can } from '@/lib/roles';
import { Case, CaseVisit, FollowUp, checkInVisit, checkOutVisit, fetchCases, fetchFollowUps, fetchVisits, getPosition } from '@/lib/api';
import { Btn, Card, CardHeader, EmptyState, Micro, Pill, Spinner, StagePill, fmtTime, isToday, timeUntil, todayLabel } from '@/lib/ui';
import { CalendarClock, Compass, LogIn, LogOut, MapPin, Sun } from 'lucide-react';

export default function MyDayPage() {
  const { role } = useAuth();
  const { openCase, go } = useNav();
  const [visits, setVisits] = useState<CaseVisit[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [v, f, c] = await Promise.all([
      fetchVisits({ user: true }),
      fetchFollowUps({ status: 'all' }),
      fetchCases(),
    ]);
    setVisits(v);
    setFollowUps(f.filter(x => x.status === 'pending'));
    setCases(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const todayVisits = visits.filter(v => v.status === 'planned' || v.status === 'in_progress')
    .sort((a, b) => +(a.scheduled_at ?? a.created_at) - +(b.scheduled_at ?? b.created_at));
  const doneToday = visits.filter(v => v.status === 'completed' && v.ended_at && isToday(v.ended_at));
  const overdueFU = followUps.filter(f => new Date(f.due_at) < now).sort((a, b) => +new Date(a.due_at) - +new Date(b.due_at));
  const todayFU = followUps.filter(f => isToday(f.due_at) && new Date(f.due_at) >= now);
  const nearby = cases.filter(c => c.lat != null && c.lng != null).slice(0, 6);

  const doCheckIn = async (v: CaseVisit) => {
    setBusyId(v.id);
    const c = await getPosition();
    await checkInVisit(v.id, c ?? undefined);
    setBusyId(null);
    load();
  };
  const doCheckOut = async (v: CaseVisit) => {
    setBusyId(v.id);
    const c = await getPosition();
    await checkOutVisit(v.id, c ?? undefined);
    setBusyId(null);
    load();
  };

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Field sales</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Ημέρα μου · {todayLabel()}</h2>
        </div>
        <Btn variant="outline" onClick={() => go('map')}><MapPin className="w-3.5 h-3.5" /> Χάρτης</Btn>
      </div>

      {loading && <div className="flex items-center justify-center py-24"><Spinner /></div>}
      {!loading && (
        <div className="grid lg:grid-cols-5 gap-4">
          {/* Today's visits */}
          <Card className="lg:col-span-3 !p-0" pad={false}>
            <CardHeader micro="Visits" title="Σημερινές επισκέψεις" className="px-5 pt-5"
              action={<Pill tone={todayVisits.length > 0 ? 'blue' : 'green'}>{todayVisits.length} μπροστά · {doneToday.length} έγιναν</Pill>} />
            <div className="px-3 pb-3">
              {todayVisits.length === 0 && doneToday.length === 0 && (
                <EmptyState icon={Compass} title="Καμία προγραμματισμένη επίσκεψη σήμερα" hint="Προγραμματίστε επισκέψεις από το case ή επιλέξτε από το χάρτη." />
              )}
              <div className="space-y-2">
                {todayVisits.map(v => (
                  <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl border border-line bg-paper/50 flex-wrap">
                    <span className="w-8 h-8 rounded-lg bg-white border border-line flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-ink/60" />
                    </span>
                    <button className="flex-1 min-w-[140px] text-left" onClick={() => v.case_id && openCase(v.case_id)}>
                      <div className="text-[13px] font-medium text-ink">{v.case?.customer?.full_name ?? '—'}</div>
                      <div className="text-xs text-ink/45">
                        {v.case ? `${v.case.case_no} · ${v.case.title}` : ''}
                      </div>
                      <div className="text-xs text-ink/45 mt-0.5">{v.purpose || 'Επίσκεψη πεδίου'}</div>
                    </button>
                    <div className="text-right shrink-0">
                      {v.scheduled_at
                        ? <div className="text-[13px] font-medium text-ink">{fmtTime(v.scheduled_at)}</div>
                        : <div className="text-xs text-ink/45">χωρίς ώρα</div>}
                      <div className="text-xs text-ink/40">{v.status === 'planned' ? 'προγραμματισμένη' : 'σε εξέλιξη'}</div>
                    </div>
                    {v.status === 'planned' && can(role, 'check_in') && (
                      <Btn variant="brand" onClick={() => doCheckIn(v)} disabled={busyId === v.id}>
                        {busyId === v.id ? <Spinner /> : <LogIn className="w-3.5 h-3.5" />} Check In
                      </Btn>
                    )}
                    {v.status === 'in_progress' && can(role, 'check_out') && (
                      <Btn variant="ok" onClick={() => doCheckOut(v)} disabled={busyId === v.id}>
                        {busyId === v.id ? <Spinner /> : <LogOut className="w-3.5 h-3.5" />} Check Out
                      </Btn>
                    )}
                  </div>
                ))}
                {doneToday.slice(0, 3).map(v => (
                  <div key={v.id} className="flex items-center gap-3 px-3 py-2 text-[13px] text-ink/45">
                    <CheckDone /> <span className="flex-1">{v.case?.customer?.full_name ?? 'Επίσκεψη'}</span>
                    <span className="text-xs">{v.ended_at ? fmtTime(v.ended_at) : ''} ✓</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Follow ups */}
            <Card>
              <CardHeader micro="Follow ups" title="Επικοινωνίες σήμερα" action={<Btn variant="ghost" onClick={() => go('followups')}>όλα</Btn>} />
              <div className="space-y-1.5">
                {overdueFU.length === 0 && todayFU.length === 0 && (
                  <p className="text-xs text-ink/40 py-2">Κανένα follow up για σήμερα.</p>
                )}
                {[...overdueFU, ...todayFU].slice(0, 5).map(f => {
                  const over = new Date(f.due_at) < now;
                  return (
                    <button key={f.id} onClick={() => f.case_id && openCase(f.case_id)}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 shrink-0 border ${over ? 'spine spine-critical bg-bad-100/50' : 'bg-paper/60 border-line'}`}>
                      <CalendarClock className="w-3.5 h-3.5 text-ink/40 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13px] font-medium text-ink truncate">{f.case?.customer?.full_name ?? '—'}</span>
                        <span className="block text-xs text-ink/45 truncate">{f.reason}</span>
                      </span>
                      <span className={`text-[11px] shrink-0 ${over ? 'text-bad-600' : 'text-ink/40'}`}>{timeUntil(f.due_at)}</span>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Nearby cases */}
            <Card>
              <CardHeader micro="Nearby" title="Κοντινά cases (με GPS)" action={<Btn variant="ghost" onClick={() => go('map')}><MapPin className="w-3 h-3" /> χάρτης</Btn>} />
              <div className="space-y-1.5">
                {nearby.length === 0 && <p className="text-xs text-ink/40 py-2">Κανένα case με αποθηκευμένη θέση.</p>}
                {nearby.map(c => (
                  <button key={c.id} onClick={() => openCase(c.id)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-ink/5 flex items-center gap-2.5">
                    <Sun className="w-3.5 h-3.5 text-warn-600 shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium text-ink truncate">{c.customer?.full_name ?? c.title}</span>
                      <span className="block text-xs text-ink/45 truncate">{SERVICES[c.service_type] ?? c.service_type}{c.address ? ` · ${c.address}` : ''}</span>
                    </span>
                    <StagePill stage={c.current_stage} />
                  </button>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function CheckDone() {
  return (
    <span className="w-5 h-5 rounded-full bg-ok-100 text-ok-600 flex items-center justify-center">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
    </span>
  );
}