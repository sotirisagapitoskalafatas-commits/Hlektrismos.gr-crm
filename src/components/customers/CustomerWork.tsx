/* «Αιτήσεις & επισκέψεις» of the customer folder (Customer 360): every application and every visit of this customer, grouped by the supply point it concerns, so the bill,
   the application and the visits of one connection are never mixed with another's. Applications link to their Case; visits show what they were about and how they ended.
   Until the staged SQL (phase7/01, phase7/02) is applied the tab is one neutral sentence, never an error. */
import { useEffect, useMemo, useState } from 'react';
import { useNav } from '@/lib/nav';
import { applicationsAvailable, fetchFieldVisits, listApplications, visitsExtendedAvailable } from '@/lib/field-api';
import type { ApplicationFull, FieldVisit } from '@/lib/field-api';
import { NOT_AVAILABLE_TEXT } from '@/lib/applications';
import { visitStateText, visitSubject } from '@/lib/field-visits';
import { USAGE_LABEL } from '@/lib/supply-points';
import type { SupplyPoint } from '@/lib/supply-points';
import { Card, CardHeader, Pill, Spinner, fmtDateTime } from '@/lib/ui';
import { StatusPill } from '@/components/applications/ApplicationDetail';

export default function CustomerWork({ customerId, points }: { customerId: string; points: SupplyPoint[] | null }) {
  const { go, openCase } = useNav();
  const [apps, setApps] = useState<ApplicationFull[] | null | undefined>(undefined);
  const [visits, setVisits] = useState<FieldVisit[] | null | undefined>(undefined);
  const [ready, setReady] = useState<{ apps: boolean; visits: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [a, v] = await Promise.all([applicationsAvailable(), visitsExtendedAvailable()]);
      if (!alive) return; setReady({ apps: a, visits: v });
      setApps(a ? await listApplications({ customerId }) : null);
      setVisits(v ? await fetchFieldVisits({ customerId }) : null);
    })();
    return () => { alive = false; };
  }, [customerId]);

  const groups = useMemo(() => {
    const m = new Map<string, { title: string; apps: ApplicationFull[]; visits: FieldVisit[] }>();
    const title = (id: string | null) => { const i = (points ?? []).findIndex((p) => p.id === id); const p = i >= 0 ? points![i] : null; return p ? `Παροχή ${i + 1} — ${USAGE_LABEL[p.usage]}${p.property_address ? ` · ${p.property_address}` : ''}` : 'Χωρίς συγκεκριμένη παροχή'; };
    const slot = (id: string | null) => { const k = id ?? '-'; if (!m.has(k)) m.set(k, { title: title(id), apps: [], visits: [] }); return m.get(k)!; };
    for (const p of points ?? []) if (!p.archived_at) slot(p.id);
    for (const a of apps ?? []) slot(a.supply_point_id).apps.push(a);
    for (const v of visits ?? []) slot(v.supply_point_id ?? null).visits.push(v);
    return [...m.entries()].sort(([a], [b]) => (a === '-' ? 1 : b === '-' ? -1 : 0)).map(([id, g]) => ({ id, ...g }));
  }, [apps, visits, points]);

  if (ready === null) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!ready.apps && !ready.visits) return <Card><p className="text-sm text-ink/70" role="status">{NOT_AVAILABLE_TEXT}</p></Card>;
  const total = (apps?.length ?? 0) + (visits?.length ?? 0);
  return (
    <div className="space-y-3" data-testid="customer-work">
      {total === 0 && <Card><p className="text-sm text-ink/60">Δεν υπάρχουν ακόμη αιτήσεις ή επισκέψεις χωρίς Case για αυτόν τον πελάτη. Οι επισκέψεις των cases φαίνονται στην καρτέλα «Επισκέψεις».</p></Card>}
      {groups.map((g) => (
        <Card key={g.id}>
          <CardHeader micro="Παροχή" title={g.title} className="mb-2" />
          {g.apps.length === 0 && g.visits.length === 0 && <p className="text-sm text-ink/50">Καμία αίτηση ή επίσκεψη για αυτή την παροχή.</p>}
          {g.apps.length > 0 && <ul className="space-y-1.5 mb-2" aria-label="Αιτήσεις">{g.apps.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
              <button type="button" className="underline" onClick={() => go('applications', { app: a.id })}>{a.application_no}</button>
              <StatusPill status={a.status} /><span className="text-ink/60">{a.service_type_code ?? 'χωρίς υπηρεσία'}</span>
              {a.primary_case_id && <button type="button" className="text-[13px] underline text-ink/70" onClick={() => openCase(a.primary_case_id!)}>Case {a.case?.case_no ?? ''}</button>}
            </li>))}</ul>}
          {g.visits.length > 0 && <ul className="space-y-1.5" aria-label="Επισκέψεις">{g.visits.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span>{v.scheduled_at ? fmtDateTime(v.scheduled_at) : '—'}</span><Pill tone={v.status === 'completed' ? 'green' : v.status === 'planned' || v.status === 'in_progress' ? 'blue' : 'gray'}>{visitStateText(v)}</Pill>
              <span className="text-ink/60">{v.purpose || visitSubject(v).label}</span>{v.result && <span className="text-ink/50 text-xs">{v.result}</span>}
              {v.case_id && <button type="button" className="text-[13px] underline text-ink/70" onClick={() => openCase(v.case_id!)}>Case</button>}
            </li>))}</ul>}
        </Card>
      ))}
    </div>
  );
}
