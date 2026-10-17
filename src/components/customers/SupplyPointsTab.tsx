/* «Παροχές» (staged phase5/17): the customer's electricity connections, each its own card. Home and business connections
   are independent: nothing is shared between cards, and creating or saving one never changes another. Until the SQL is
   applied the tab is one neutral sentence — never an error. */

import { useState } from 'react';
import { Plus, Zap } from 'lucide-react';
import { createSupplyPoint } from '@/lib/api';
import { METER_TYPE_LABEL, USAGES, USAGE_LABEL, contractText, emptyDraft, supplyNumberError, supplyPointTitle } from '@/lib/supply-points';
import type { SupplyPoint, SupplyUsage } from '@/lib/supply-points';
import { useToast } from '@/lib/toast';
import { fmtDate } from '@/lib/ui';

export const SUPPLY_UNAVAILABLE_TEXT = 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.';

const dash = (v: string | null | undefined) => (v && v.trim() !== '' ? v : '—');

export function SupplyPointCard({ point, position }: { point: SupplyPoint; position: number }) {
  const numberWarning = point.supply_number_ok ? null : supplyNumberError(point.supply_number);
  return (
    <div className="atx-panel" style={{ padding: 20 }} data-supply-card={position} data-supply-usage={point.usage} data-supply-id={point.id}>
      <div className="flex items-center gap-2.5 flex-wrap mb-3">
        <span className="atx-icon" aria-hidden="true"><Zap size={16} /></span>
        <h2 className="atx-section-title m-0" data-supply-title>{supplyPointTitle(position, point.usage)}</h2>
        {point.needs_review && <span className="atx-tag t-warning" data-supply-review>Προς έλεγχο</span>}
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
        <dt className="text-[var(--atx-muted)]">Διεύθυνση ακινήτου</dt><dd className="m-0 font-medium" data-supply-field="address">{dash(point.property_address)}</dd>
        <dt className="text-[var(--atx-muted)]">Αριθμός Παροχής</dt>
        <dd className="m-0 font-medium" data-supply-field="number">{dash(point.supply_number)}{numberWarning && <span className="block text-[12.5px] font-normal" style={{ color: 'var(--atx-amber)' }} data-supply-number-warning>{numberWarning}</span>}</dd>
        <dt className="text-[var(--atx-muted)]">Μετρητής / Ρολόι ΔΕΗ</dt>
        <dd className="m-0 font-medium" data-supply-field="meter">{[point.meter_identifier, point.meter_type ? METER_TYPE_LABEL[point.meter_type] : null, point.meter_note].filter(Boolean).join(' · ') || '—'}</dd>
        <dt className="text-[var(--atx-muted)]">Κατηγορία τιμολογίου</dt><dd className="m-0 font-medium" data-supply-field="category">{dash(point.tariff_category_code)}</dd>
        <dt className="text-[var(--atx-muted)]">Ονομασία τιμολογίου</dt><dd className="m-0 font-medium" data-supply-field="tariff">{dash(point.tariff_name)}</dd>
        <dt className="text-[var(--atx-muted)]">Ημερομηνία αίτησης</dt><dd className="m-0 font-medium" data-supply-field="applied">{point.application_date ? fmtDate(point.application_date) : '—'}</dd>
        <dt className="text-[var(--atx-muted)]">Διάρκεια συμβολαίου</dt><dd className="m-0 font-medium" data-supply-field="contract">{dash(contractText(point.contract_months))}</dd>
      </dl>
    </div>
  );
}

export default function SupplyPointsTab({ customerId, points, canEdit, reload }: {
  customerId: string;
  /** undefined = still loading; null = the SQL is not applied yet */
  points: SupplyPoint[] | null | undefined;
  canEdit: boolean;
  reload: () => void;
}) {
  const { toast } = useToast();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);

  if (points === undefined) return <div className="atx-panel">{[0, 1].map(i => <div key={i} className="atx-skeleton" />)}</div>;
  if (points === null) {
    return <div className="atx-panel"><div className="atx-empty" data-supply-unavailable><strong>Παροχές</strong>{SUPPLY_UNAVAILABLE_TEXT}</div></div>;
  }

  const active = points.filter(p => !p.archived_at);
  const add = async (usage: SupplyUsage) => {
    if (busy) return;
    setBusy(true);
    const r = await createSupplyPoint(customerId, emptyDraft(usage));
    setBusy(false);
    setChoosing(false);
    if (r.error) { toast(r.error, 'bad'); return; }
    toast('Η παροχή προστέθηκε.', 'ok');
    reload();
  };

  return (
    <div className="space-y-4" data-supply-tab>
      <div className="flex items-center gap-3 flex-wrap">
        <p className="m-0 text-[13px] text-[var(--atx-muted)] flex-1 min-w-[220px]">
          Κάθε παροχή (οικιακή ή επαγγελματική) είναι ανεξάρτητη: δική της διεύθυνση, αριθμός παροχής, τιμολόγιο και έγγραφα.
        </p>
        {canEdit && !choosing && <button className="atx-btn atx-btn-primary inline-flex items-center gap-1.5" onClick={() => setChoosing(true)} data-supply-add><Plus size={15} aria-hidden="true" /> Νέα παροχή</button>}
        {canEdit && choosing && (
          <span className="inline-flex items-center gap-2" data-supply-choose>
            {USAGES.map(u => <button key={u} className="atx-btn atx-btn-quiet" disabled={busy} onClick={() => void add(u)} data-supply-new={u}>{USAGE_LABEL[u]}</button>)}
            <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={() => setChoosing(false)}>Άκυρο</button>
          </span>
        )}
      </div>
      {active.length === 0 ? (
        <div className="atx-panel"><div className="atx-empty" data-supply-empty><strong>Καμία παροχή ακόμη</strong>Προσθέστε μια οικιακή ή επαγγελματική παροχή του πελάτη με το «Νέα παροχή».</div></div>
      ) : active.map((p, i) => <SupplyPointCard key={p.id} point={p} position={i + 1} />)}
    </div>
  );
}
