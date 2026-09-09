import { useEffect, useState } from 'react';
import { SERVICES, STAGES, stageLabel } from '@/lib/roles';
import { Case, CaseVisit, Customer, FollowUp, Lead, fetchCases, fetchCustomers, fetchFollowUps, fetchLeads, fetchVisits } from '@/lib/api';
import { Card, CardHeader, Micro, Pill, Spinner, fmtMoney } from '@/lib/ui';
import { BarChart3, Briefcase, CalendarClock, Gauge, TrendingUp, Users } from 'lucide-react';

type Dataset = {
  customers: Customer[];
  cases: Case[];
  leads: Lead[];
  followUps: FollowUp[];
  visits: CaseVisit[];
};

export default function ReportsPage() {
  const [d, setD] = useState<Dataset | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [customers, cases, leads, followUps, visits] = await Promise.all([
        fetchCustomers(),
        fetchCases({ includeDone: true }),
        fetchLeads(),
        fetchFollowUps({ status: 'all' }),
        fetchVisits(),
      ]);
      if (!alive) return;
      setD({ customers, cases, leads, followUps, visits });
    })();
    return () => { alive = false; };
  }, []);

  if (!d) return <div className="flex items-center justify-center py-24"><Spinner /></div>;

  const { customers, cases, leads, followUps, visits } = d;
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const active = cases.filter(c => c.current_stage !== 'completed' && c.current_stage !== 'lost' && c.current_stage !== 'cancelled');
  const won = cases.filter(c => c.current_stage === 'completed');
  const pipelineWeighted = active.reduce((s, c) => s + (c.value || 0) * ((c.probability || 0) / 100), 0);
  const leadsToday = leads.filter(l => new Date(l.created_at).getTime() >= new Date().setHours(0, 0, 0, 0)).length;

  const pendingFus = followUps.filter(f => f.status === 'pending' && new Date(f.due_at).getTime() <= today.getTime());
  const overdueFus = pendingFus.filter(f => new Date(f.due_at).getTime() <= Date.now());
  const completedFus = followUps.filter(f => f.status === 'completed');

  const funnel = STAGES.map(s => ({ label: stageLabel(s.id), id: s.id, count: cases.filter(c => c.current_stage === s.id).length }))
    .filter(x => x.count > 0 || ['contacted', 'signed', 'completed'].includes(x.id));

  const serviceRows = [...new Set(cases.map(c => c.service_type).filter(Boolean))].map(service => {
    const ks = cases.filter(c => c.service_type === service);
    const activeK = ks.filter(k => k.current_stage !== 'completed' && k.current_stage !== 'lost' && k.current_stage !== 'cancelled');
    return { label: SERVICES[service] ?? service, key: service, count: ks.length, active: activeK.length, value: ks.reduce((s, k) => s + (k.value || 0), 0) };
  }).sort((a, b) => b.count - a.count);

  const sourceRows = [...new Set(leads.map(l => l.source).filter(Boolean) as string[])].map(src => ({
    label: src === 'website' ? 'Ιστοσελίδα' : src === 'contact' ? 'Φόρμα επικοινωνίας' : src,
    count: leads.filter(l => l.source === src).length,
  })).sort((a, b) => b.count - a.count);

  const cityRows = [...new Set(customers.map(c => c.city).filter(Boolean) as string[])].map(city => ({
    label: city, count: customers.filter(c => c.city === city).length,
  })).sort((a, b) => b.count - a.count);

  const fuStatus = [
    { key: 'pending', label: 'Εκκρεμή', value: followUps.filter(f => f.status === 'pending').length, tone: 'bg-brand-500' },
    { key: 'overdue', label: 'Εκπρόθεσμα', value: overdueFus.length, tone: 'bg-bad-500' },
    { key: 'snoozed', label: 'Αναβληθέντα', value: followUps.filter(f => f.status === 'snoozed').length, tone: 'bg-warn-500' },
    { key: 'completed', label: 'Ολοκληρωμένα', value: completedFus.length, tone: 'bg-ok-500' },
  ];

  const kpis = [
    { micro: 'Leads', value: String(leads.length), sub: `${leadsToday} σήμερα`, icon: Users },
    { micro: 'Ενεργά Cases', value: String(active.length), sub: `${won.length} στην ολοκλήρωση`, icon: Briefcase },
    { micro: 'Pipeline (σταθμισμένο)', value: fmtMoney(pipelineWeighted), sub: 'αξία × πιθανότητα', icon: TrendingUp },
    { micro: 'Αξία κερδισμένων', value: fmtMoney(won.reduce((s, c) => s + (c.value || 0), 0)), sub: `${won.length} ολοκληρωμένα`, icon: Gauge },
  ];

  const maxFunnel = Math.max(1, ...funnel.map(f => f.count));
  const maxService = Math.max(1, ...serviceRows.map(s => s.count));
  const maxSource = Math.max(1, ...sourceRows.map(s => s.count));
  const maxCity = Math.max(1, ...cityRows.map(s => s.count));
  const totalFu = fuStatus.reduce((s, f) => s + f.value, 0) || 1;

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Insights</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Reports · Πωλήσεις & Pipeline</h2>
        </div>
        <Pill tone="gray">
          {customers.length} πελάτες · {cases.length} cases · {leads.length} leads · {visits.length} επισκέψεις
        </Pill>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.micro}>
            <div className="flex items-center justify-between">
              <Micro>{k.micro}</Micro>
              <k.icon className="w-4 h-4 text-ink/30" />
            </div>
            <div className="mt-2 text-[26px] font-semibold tracking-tight leading-none text-ink">{k.value}</div>
            <div className="text-xs text-ink/40 mt-2">{k.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Funnel by stage */}
        <Card>
          <CardHeader micro="Pipeline" title="Funnel κατά στάδιο" action={<Pill tone="gray">{active.length} ενεργά</Pill>} />
          <div className="space-y-2.5 mt-1">
            {funnel.map(f => (
              <BarRow key={f.id} label={stageLabel(f.id)} value={f.count} pct={Math.round((f.count / maxFunnel) * 100)}
                sub={f.count === 0 ? '0 cases' : undefined} />
            ))}
            {funnel.length === 0 && <p className="text-xs text-ink/40 py-4 text-center">Δεν υπάρχουν cases ακόμα.</p>}
          </div>
        </Card>

        {/* Follow-up velocity */}
        <Card>
          <CardHeader micro="Follow Ups" title="Ταχύτητα ολοκλήρωσης" action={<Pill tone="gray">{pendingFus.length} σε εκκρεμότητα</Pill>} />
          <div className="space-y-3 mt-1">
            <div className="flex h-9 rounded-xl overflow-hidden border border-line bg-ink/[0.02]">
              {fuStatus.map(f => (
                <div key={f.key} className={`${f.tone}`} style={{ width: `${(f.value / totalFu) * 100}%` }} title={`${f.label}: ${f.value}`} />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {fuStatus.map(f => (
                <div key={f.key} className="rounded-xl border border-line bg-white px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${f.tone}`} />
                    <span className="micro text-ink/40">{f.label}</span>
                  </div>
                  <div className="text-[20px] font-semibold text-ink leading-tight mt-1">{f.value}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-ink/45">
              <CalendarClock className="w-3.5 h-3.5" />
              {followUps.length === 0
                ? 'Κανένα follow up δεν έχει καταγραφεί ακόμα.'
                : `${completedFus.length} από ${followUps.length} follow ups ολοκληρώθηκαν.`}
            </div>
          </div>
        </Card>

        {/* Cases by service */}
        <Card>
          <CardHeader micro="Product mix" title="Cases ανά υπηρεσία" action={<Pill tone="gray">{serviceRows.length}</Pill>} />
          <div className="space-y-2.5 mt-1">
            {serviceRows.map(s => (
              <div key={s.key}>
                <div className="flex items-center justify-between text-[13px] mb-1">
                  <span className="font-medium text-ink">{s.label}</span>
                  <span className="text-xs text-ink/50">{s.count} cases{s.active > 0 ? ` · ${s.active} ενεργά` : ''} · {fmtMoney(s.value)}</span>
                </div>
                <div className="h-2 rounded-full bg-ink/5 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((s.count / maxService) * 100)}%` }} />
                </div>
              </div>
            ))}
            {serviceRows.length === 0 && <p className="text-xs text-ink/40 py-4 text-center">Κανένα case ακόμα.</p>}
          </div>
        </Card>

        {/* Leads by source + customers by city */}
        <div className="space-y-4">
          <Card>
            <CardHeader micro="Inbound" title="Leads ανά πηγή" action={<Pill tone="gray">{leads.length}</Pill>} />
            <div className="space-y-2.5 mt-1">
              {sourceRows.map(sRow => (
                <BarRow key={sRow.label} label={sRow.label} value={sRow.count} pct={Math.round((sRow.count / maxSource) * 100)} />
              ))}
              {sourceRows.length === 0 && <p className="text-xs text-ink/40 py-4 text-center">Κανένα lead ακόμα.</p>}
            </div>
          </Card>
          <Card>
            <CardHeader micro="Διεσπαρμένοι λογαριασμοί" title="Πελάτες ανά πόλη" action={<Pill tone="gray">{customers.length}</Pill>} />
            <div className="space-y-2.5 mt-1">
              {cityRows.map(cRow => (
                <BarRow key={cRow.label} label={cRow.label} value={cRow.count} pct={Math.round((cRow.count / maxCity) * 100)} />
              ))}
              {cityRows.length === 0 && <p className="text-xs text-ink/40 py-4 text-center">Κανένας πελάτης ακόμα.</p>}
            </div>
          </Card>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-ink/40 px-1">
        <BarChart3 className="w-3.5 h-3.5" />
        Τα στοιχεία υπολογίζονται σε πραγματικό χρόνο από τη βάση — χωρίς αποθηκευμένες εγγραφές.
      </div>
    </div>
  );
}

function BarRow({ label, value, pct, sub }: { label: string; value: number; pct: number; sub?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[13px] mb-1">
        <span className="font-medium text-ink">{label}</span>
        <span className="text-xs text-ink/50">{sub ?? `${value}`}</span>
      </div>
      <div className="h-2 rounded-full bg-ink/5 overflow-hidden">
        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}