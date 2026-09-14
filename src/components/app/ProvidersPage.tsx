/* ------------------------------------------------------------------ */
/*  Providers & Programs — the energy catalog, connected to the CRM.  */
/*                                                                     */
/*  The full provider/program catalog lives in                         */
/*  src/constants/energyData.ts (tariff colour, service type, B2C/B2B  */
/*  and official programme URL). This page renders it and overlays     */
/*  live usage — how many leads and cases reference each provider and   */
/*  programme, plus open-pipeline value — from fetchProviderUsage().    */
/* ------------------------------------------------------------------ */

import { useEffect, useMemo, useState } from 'react';
import { ProviderUsage, fetchProviderUsage } from '@/lib/api';
import {
  PROVIDERS_AND_PROGRAMS, PROVIDER_COLORS, PROVIDER_LIST, SERVICES_LIST,
  TARIFF_COLOR_MAP, getProgramsForProvider, type ProviderProgram,
} from '@/constants/energyData';
import { Card, EmptyState, Micro, Pill, Spinner, fmtMoney } from '@/lib/ui';
import {
  ChevronDown, ChevronRight, ExternalLink, Layers, ShoppingBag, Wallet, Zap,
} from 'lucide-react';

/* energyData serviceType → Greek service label (from SERVICES_LIST). */
const TYPE_LABEL: Record<ProviderProgram['serviceType'], string> = {
  electricity: 'Ρεύμα',
  gas: 'Φυσικό Αέριο',
  solar: 'Φωτοβολταϊκά',
  ev: 'Ηλεκτροκίνηση',
};

const EMPTY_USAGE: ProviderUsage = { byProvider: {}, totalLeads: 0, totalCases: 0, totalPipeline: 0 };

type ServiceFilter = 'all' | ProviderProgram['serviceType'];
type CustomerFilter = 'all' | 'B2C' | 'B2B';

export default function ProvidersPage() {
  const [usage, setUsage] = useState<ProviderUsage>(EMPTY_USAGE);
  const [loading, setLoading] = useState(true);
  const [service, setService] = useState<ServiceFilter>('all');
  const [customer, setCustomer] = useState<CustomerFilter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      const u = await fetchProviderUsage();
      if (!alive) return;
      setUsage(u);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  /* Providers that still have at least one programme after filtering. */
  const providers = useMemo(() => {
    const matches = (p: ProviderProgram) =>
      (service === 'all' || p.serviceType === service)
      && (customer === 'all' || p.customerType === customer);
    return PROVIDER_LIST
      .map(name => ({ name, programs: getProgramsForProvider(name).filter(matches) }))
      .filter(p => p.programs.length > 0);
  }, [service, customer]);

  const visibleProgramCount = providers.reduce((n, p) => n + p.programs.length, 0);

  const toggle = (name: string) =>
    setExpanded(s => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });

  const serviceTabs: { id: ServiceFilter; label: string }[] = [
    { id: 'all', label: 'Όλες οι υπηρεσίες' },
    ...SERVICES_LIST.map(s => {
      const type = (Object.keys(TYPE_LABEL) as ProviderProgram['serviceType'][]).find(t => TYPE_LABEL[t] === s.key);
      return { id: (type ?? 'all') as ServiceFilter, label: `${s.icon} ${s.label}` };
    }),
  ];

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Micro tone="brand">Sales</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Πάροχοι & Προγράμματα</h2>
        </div>
        <Pill tone="gray">{PROVIDER_LIST.length} πάροχοι · {PROVIDERS_AND_PROGRAMS.length} προγράμματα</Pill>
      </div>

      {/* KPI row — catalog size + live CRM usage */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={ShoppingBag} label="Πάροχοι" value={String(PROVIDER_LIST.length)} tone="#0066cc" />
        <Kpi icon={Layers} label="Προγράμματα" value={String(PROVIDERS_AND_PROGRAMS.length)} tone="#7c3aed" />
        <Kpi icon={Zap} label="Cases με πάροχο" value={loading ? '—' : String(usage.totalCases)} tone="#15803d" />
        <Kpi icon={Wallet} label="Ενεργό pipeline" value={loading ? '—' : fmtMoney(usage.totalPipeline)} tone="#0e7490" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {serviceTabs.map(t => (
            <button key={t.id} onClick={() => setService(t.id)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${service === t.id ? 'bg-ink text-paper' : 'bg-white border border-line text-ink/55 hover:text-ink'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 ml-auto">
          {(['all', 'B2C', 'B2B'] as CustomerFilter[]).map(c => (
            <button key={c} onClick={() => setCustomer(c)}
              className={`rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${customer === c ? 'bg-brand-500 text-white' : 'bg-white border border-line text-ink/55 hover:text-ink'}`}>
              {c === 'all' ? 'Όλοι' : c}
            </button>
          ))}
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-16"><Spinner /></div>}

      {!loading && providers.length === 0 && (
        <Card><EmptyState icon={Layers} title="Κανένα πρόγραμμα" hint="Δοκιμάστε άλλο φίλτρο υπηρεσίας ή τύπου πελάτη." /></Card>
      )}

      {!loading && providers.length > 0 && (
        <div className="space-y-3">
          <Micro>{providers.length} πάροχοι · {visibleProgramCount} προγράμματα σε αυτό το φίλτρο</Micro>
          {providers.map(({ name, programs }) => {
            const color = PROVIDER_COLORS[name] ?? '#64748b';
            const u = usage.byProvider[name];
            const open = expanded.has(name);
            return (
              <Card key={name} className="!p-0" pad={false}>
                <button onClick={() => toggle(name)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-ink/[0.015]">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-ink">{name}</div>
                    <div className="text-[11px] text-ink/45">{programs.length} προγράμματα σε προβολή</div>
                  </div>
                  {u && (u.cases > 0 || u.leads > 0) && (
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {u.leads > 0 && <Pill tone="blue">{u.leads} leads</Pill>}
                      {u.cases > 0 && <Pill tone="green">{u.cases} cases</Pill>}
                      {u.pipelineValue > 0 && <Pill tone="gray">{fmtMoney(u.pipelineValue)}</Pill>}
                    </div>
                  )}
                  {open ? <ChevronDown className="w-4 h-4 text-ink/35 shrink-0" /> : <ChevronRight className="w-4 h-4 text-ink/35 shrink-0" />}
                </button>

                {open && (
                  <div className="border-t border-line px-2.5 pb-3 overflow-x-auto">
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="text-left text-ink/40">
                          <th className="px-2.5 py-2 font-medium">Πρόγραμμα</th>
                          <th className="px-2.5 py-2 font-medium">Υπηρεσία</th>
                          <th className="px-2.5 py-2 font-medium">Τύπος</th>
                          <th className="px-2.5 py-2 font-medium">Τιμολόγιο</th>
                          <th className="px-2.5 py-2 font-medium text-right">Leads</th>
                          <th className="px-2.5 py-2 font-medium text-right">Cases</th>
                          <th className="px-2.5 py-2 font-medium"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {programs.map(p => {
                          const pu = u?.programs[p.program];
                          const tc = TARIFF_COLOR_MAP[p.color];
                          return (
                            <tr key={`${p.program}-${p.customerType}`}>
                              <td className="px-2.5 py-2.5 font-medium text-ink">{p.program}</td>
                              <td className="px-2.5 py-2.5 text-ink/60">{TYPE_LABEL[p.serviceType]}</td>
                              <td className="px-2.5 py-2.5">
                                <Pill tone={p.customerType === 'B2B' ? 'blue' : 'gray'}>{p.customerType}</Pill>
                              </td>
                              <td className="px-2.5 py-2.5">
                                {tc && <span className="pill" style={{ background: tc.bg, color: tc.text }}>{tc.label}</span>}
                              </td>
                              <td className="px-2.5 py-2.5 text-right tabular-nums text-ink/70">{pu?.leads ?? 0}</td>
                              <td className="px-2.5 py-2.5 text-right tabular-nums text-ink/70">{pu?.cases ?? 0}</td>
                              <td className="px-2.5 py-2.5 text-right">
                                {p.officialUrl && (
                                  <a href={p.officialUrl} target="_blank" rel="noopener noreferrer"
                                    title="Επίσημη σελίδα προγράμματος"
                                    className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-[11px] text-ink/40">
        Ο κατάλογος προέρχεται από το energyData· τα νούμερα leads/cases και το pipeline
        υπολογίζονται ζωντανά από τα δεδομένα του CRM (πάροχος & πρόγραμμα ανά lead/case).
      </p>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: {
  icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${tone}1f`, color: tone }}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[17px] font-bold text-ink leading-none tabular-nums truncate">{value}</div>
          <Micro className="mt-1">{label}</Micro>
        </div>
      </div>
    </Card>
  );
}
