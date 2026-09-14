/* ------------------------------------------------------------------ */
/*  Provider + program picker — fed by the energy catalog in           */
/*  src/constants/energyData.ts (providers, programs, tariff colour    */
/*  and the official programme page).                                  */
/*                                                                     */
/*  The labels chosen here are resolved to providers/products rows by   */
/*  createLead()/updateCase() through src/lib/catalog.ts.              */
/* ------------------------------------------------------------------ */

import {
  PROVIDERS_AND_PROGRAMS, PROVIDER_COLORS, TARIFF_COLOR_MAP,
  type ProviderProgram,
} from '@/constants/energyData';
import { Field } from '@/lib/ui';
import { ExternalLink } from 'lucide-react';

/* CRM service keys (roles.SERVICES) → catalog serviceType. */
const SERVICE_TO_TYPE: Record<string, ProviderProgram['serviceType']> = {
  energy: 'electricity',
  gas: 'gas',
  solar: 'solar',
  ev: 'ev',
};

export function providersFor(service?: string | null, customerType?: 'B2C' | 'B2B' | null): string[] {
  const type = service ? SERVICE_TO_TYPE[service] : undefined;
  const rows = PROVIDERS_AND_PROGRAMS.filter(p =>
    (!type || p.serviceType === type) && (!customerType || p.customerType === customerType));
  return [...new Set((rows.length > 0 ? rows : PROVIDERS_AND_PROGRAMS).map(p => p.provider))];
}

export function programsFor(
  provider: string,
  service?: string | null,
  customerType?: 'B2C' | 'B2B' | null,
): ProviderProgram[] {
  const type = service ? SERVICE_TO_TYPE[service] : undefined;
  const rows = PROVIDERS_AND_PROGRAMS.filter(p =>
    p.provider === provider
    && (!type || p.serviceType === type)
    && (!customerType || p.customerType === customerType));
  return rows.length > 0
    ? rows
    : PROVIDERS_AND_PROGRAMS.filter(p => p.provider === provider);
}

export function ProviderDot({ provider, className = '' }: { provider: string; className?: string }) {
  const color = PROVIDER_COLORS[provider] ?? '#94a3b8';
  return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${className}`} style={{ background: color }} aria-hidden="true" />;
}

export function ProgramColorPill({ program }: { program: ProviderProgram }) {
  const c = TARIFF_COLOR_MAP[program.color];
  if (!c) return null;
  return <span className="pill" style={{ background: c.bg, color: c.text }}>{c.label}</span>;
}

export default function ProviderProgramPicker({
  provider, program, service, customerType, onChange, labels,
}: {
  provider: string;
  program: string;
  service?: string | null;
  customerType?: 'B2C' | 'B2B' | null;
  onChange: (next: { provider: string; program: string }) => void;
  labels?: { provider?: string; program?: string };
}) {
  const providers = providersFor(service, customerType);
  const programs = provider ? programsFor(provider, service, customerType) : [];
  const selected = programs.find(p => p.program === program) ?? null;

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <Field label={labels?.provider ?? 'Πάροχος'}>
        <select className="field" value={provider}
          onChange={e => onChange({ provider: e.target.value, program: '' })}>
          <option value="">— Επιλογή παρόχου —</option>
          {providers.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
      <Field label={labels?.program ?? 'Πρόγραμμα'}>
        <select className="field" value={program} disabled={!provider}
          onChange={e => onChange({ provider, program: e.target.value })}>
          <option value="">{provider ? '— Επιλογή προγράμματος —' : '— Επιλέξτε πάροχο πρώτα —'}</option>
          {programs.map(p => (
            <option key={`${p.provider}-${p.program}-${p.customerType}`} value={p.program}>
              {p.program} · {p.customerType}
            </option>
          ))}
        </select>
        {selected && (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <ProgramColorPill program={selected} />
            {selected.officialUrl && (
              <a className="text-[11px] text-brand-600 hover:underline inline-flex items-center gap-1"
                href={selected.officialUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3 h-3" /> Επίσημη σελίδα προγράμματος
              </a>
            )}
          </div>
        )}
      </Field>
    </div>
  );
}
