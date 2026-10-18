/* «Παροχές ρεύματος» on the lead form (staged phase5/17 + 18): an optional, collapsible section. Each connection has the same
   fields as in the customer folder (SupplyFields). Nothing is mandatory; a supply number that is not 11 digits is a warning
   and never blocks the lead. Until the SQL is applied the section is one neutral sentence and the form works as before. */

import { ChevronDown, ChevronRight, Plus, Zap } from 'lucide-react';
import { SupplyFields } from '@/components/customers/SupplyPointsTab';
import { SUPPLY_UNAVAILABLE_TEXT, draftErrors, emptyDraft, supplyPointTitle } from '@/lib/supply-points';
import type { SupplyPointDraft, TariffCategory } from '@/lib/supply-points';

export default function LeadSupplySection({ drafts, setDrafts, tariffs, available, open, setOpen, disabled }: {
  drafts: SupplyPointDraft[];
  setDrafts: (next: SupplyPointDraft[]) => void;
  tariffs: TariffCategory[] | null;
  /** null = still asking, false = the SQL is not applied yet */
  available: boolean | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  disabled?: boolean;
}) {
  const patch = (i: number, p: Partial<SupplyPointDraft>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...p } : d)));
  return (
    <div className="rounded-xl border border-line" data-lead-supply>
      <button type="button" className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[13.5px] font-medium" aria-expanded={open} onClick={() => setOpen(!open)} data-lead-supply-toggle>
        {open ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronRight className="w-4 h-4" aria-hidden="true" />}
        <Zap className="w-4 h-4" aria-hidden="true" /> Παροχές ρεύματος
        <span className="text-ink/55 font-normal">(προαιρετικό){available && drafts.length > 0 ? ` · ${drafts.length}` : ''}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {available === null && <div className="atx-skeleton" data-lead-supply-checking />}
          {available === false && <p className="m-0 text-[13px] text-ink/55" data-lead-supply-unavailable>{SUPPLY_UNAVAILABLE_TEXT}</p>}
          {available && (
            <>
              <p className="m-0 text-[12.5px] text-ink/55">Κάθε παροχή είναι ανεξάρτητη. Η διεύθυνση της παροχής είναι άλλη από τη διεύθυνση κατοικίας του πελάτη. Τίποτα δεν είναι υποχρεωτικό.</p>
              {drafts.map((d, i) => {
                const errors = draftErrors(d);
                return (
                  <div key={i} className="p-3 rounded-xl bg-paper border border-line" data-lead-supply-item={i + 1}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[13px] font-semibold flex-1" data-lead-supply-title>{supplyPointTitle(i + 1, d.usage)}</span>
                      <button type="button" className="atx-link !p-0 text-[12.5px]" disabled={disabled} onClick={() => setDrafts(drafts.filter((_, j) => j !== i))} data-lead-supply-remove>Αφαίρεση</button>
                    </div>
                    <SupplyFields d={d} set={(k, v) => patch(i, { [k]: v } as Partial<SupplyPointDraft>)} errors={errors} tariffs={tariffs} />
                  </div>
                );
              })}
              <button type="button" className="atx-btn atx-btn-quiet inline-flex items-center gap-1.5" disabled={disabled} onClick={() => setDrafts([...drafts, emptyDraft(drafts.length === 0 ? 'residential' : drafts[drafts.length - 1].usage)])} data-lead-supply-add>
                <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Προσθήκη παροχής
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
