/* A case about a customer who has electricity connections («Παροχές») but is not linked to one: the office is asked to pick
   (a conversion links a case only when exactly one connection results — with several it is never guessed).
   Nothing is shown when the staged SQL (phase5/17) is not applied, the customer has no connection, or the case is already linked. */

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { fetchSupplyPoints, linkCaseToSupplyPoint } from '@/lib/api';
import type { Case } from '@/lib/api';
import { supplyLabelFor } from '@/lib/supply-points';
import type { SupplyPoint } from '@/lib/supply-points';
import { useToast } from '@/lib/toast';

export const CASE_SUPPLY_HINT_TEXT = 'Επιλέξτε παροχή για αυτή την υπόθεση';

export default function CaseSupplyHint({ c, onLinked }: { c: Pick<Case, 'id' | 'customer_id' | 'supply_point_id'>; onLinked: () => void }) {
  const { toast } = useToast();
  const [points, setPoints] = useState<SupplyPoint[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!c.customer_id || c.supply_point_id) { setPoints(null); return; }
    void fetchSupplyPoints(c.customer_id).then(p => { if (alive) setPoints(p); });
    return () => { alive = false; };
  }, [c.customer_id, c.supply_point_id]);
  const active = (points ?? []).filter(p => !p.archived_at);
  if (c.supply_point_id || active.length === 0) return null;
  const pick = async (id: string) => {
    if (!id || busy) return;
    setBusy(true);
    const err = await linkCaseToSupplyPoint(c.id, id);
    setBusy(false);
    if (err) { toast(err, 'bad'); return; }
    toast('Η υπόθεση συνδέθηκε με την παροχή.', 'ok');
    onLinked();
  };
  return (
    <div className="atx-notice flex items-center gap-3 flex-wrap" data-case-supply-hint>
      <Zap size={15} aria-hidden="true" />
      <span className="font-medium">{CASE_SUPPLY_HINT_TEXT}</span>
      <select className="field !py-1.5 text-[13px] w-auto min-w-[220px]" value="" disabled={busy} aria-label="Παροχή της υπόθεσης" onChange={e => void pick(e.target.value)} data-case-supply-select>
        <option value="">Επιλογή παροχής…</option>
        {active.map(p => <option key={p.id} value={p.id}>{supplyLabelFor(points, p.id)}{p.property_address ? ` · ${p.property_address}` : ''}</option>)}
      </select>
    </div>
  );
}
