/* Several independent electricity connections («Παροχές») per customer — staged phase5/17_customer_supply_points.sql.
   Pure rules and wording, no network. The SQL computes the same supply-number flag (a test compares them). */

export type SupplyUsage = 'residential' | 'commercial';
export const USAGE_LABEL: Record<SupplyUsage, string> = { residential: 'Οικιακό', commercial: 'Επαγγελματικό' };
export const USAGES: SupplyUsage[] = ['residential', 'commercial'];

export type MeterType = 'single_phase' | 'three_phase' | 'night_meter' | 'other';
export const METER_TYPE_LABEL: Record<MeterType, string> = { single_phase: 'Μονοφασικός', three_phase: 'Τριφασικός', night_meter: 'Νυχτερινός', other: 'Άλλος' };

/** A tariff category from the configurable list (tariff_categories). Connections store the CODE text only. */
export type TariffCategory = { code: string; label: string; usage: SupplyUsage | 'any'; active: boolean; sort: number };

export type SupplyPoint = {
  id: string;
  customer_id: string;
  usage: SupplyUsage;
  property_address: string;
  supply_number: string | null;
  supply_number_key: string | null;
  supply_number_ok: boolean;
  meter_identifier: string | null;
  meter_type: MeterType | null;
  meter_note: string | null;
  tariff_category_code: string | null;
  tariff_name: string | null;
  application_date: string | null;
  contract_months: number | null;
  notes: string;
  needs_review: boolean;
  review_note: string | null;
  reviewed_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** What the form edits: strings only; empty means "not given". */
export type SupplyPointDraft = {
  usage: SupplyUsage;
  property_address: string;
  supply_number: string;
  meter_identifier: string;
  meter_type: MeterType | '';
  meter_note: string;
  tariff_category_code: string;
  tariff_name: string;
  application_date: string;
  contract_months: string;
  notes: string;
};

export const SUPPLY_NUMBER_DIGITS = 11;

const blank = (s: string | null | undefined) => (s ?? '').replace(/^ +| +$/g, '') === '';

/** Digits of what was typed, or null when there are none. Same as the SQL generated column supply_number_key. */
export const supplyNumberKey = (s: string | null | undefined): string | null => {
  const d = (s ?? '').replace(/\D/g, '');
  return d === '' ? null : d;
};

/** Empty is fine; otherwise only digits (spaces and dashes allowed) making exactly 11 digits. Same as supply_number_ok in SQL. */
export function supplyNumberOk(s: string | null | undefined): boolean {
  if (blank(s)) return true;
  const t = (s ?? '').replace(/^ +| +$/g, '');
  return /^[0-9][0-9 -]*$/.test(t) && (supplyNumberKey(t)?.length ?? 0) === SUPPLY_NUMBER_DIGITS;
}

/** Message under the field, or null. Never blocks anything except saving this one connection. */
export const supplyNumberError = (s: string | null | undefined): string | null =>
  supplyNumberOk(s) ? null : `Ο Αριθμός Παροχής έχει ${SUPPLY_NUMBER_DIGITS} ψηφία (μόνο αριθμοί).`;

/** «Παροχή 1 — Οικιακό» (position in the list, starting at 1). */
export const supplyPointTitle = (position: number, usage: SupplyUsage) => `Παροχή ${position} — ${USAGE_LABEL[usage]}`;

export const emptyDraft = (usage: SupplyUsage = 'residential'): SupplyPointDraft => ({
  usage, property_address: '', supply_number: '', meter_identifier: '', meter_type: '', meter_note: '', tariff_category_code: '', tariff_name: '',
  application_date: '', contract_months: '', notes: '',
});

export const draftFromPoint = (p: SupplyPoint): SupplyPointDraft => ({
  usage: p.usage, property_address: p.property_address ?? '', supply_number: p.supply_number ?? '', meter_identifier: p.meter_identifier ?? '', meter_type: p.meter_type ?? '',
  meter_note: p.meter_note ?? '', tariff_category_code: p.tariff_category_code ?? '', tariff_name: p.tariff_name ?? '', application_date: p.application_date ?? '',
  contract_months: p.contract_months == null ? '' : String(p.contract_months), notes: p.notes ?? '',
});

const orNull = (s: string) => { const t = s.trim(); return t === '' ? null : t; };

/** The columns to write. Empty strings become null; nothing is required. */
export function draftToRow(d: SupplyPointDraft) {
  const months = d.contract_months.trim() === '' ? null : Number(d.contract_months);
  return {
    usage: d.usage,
    property_address: d.property_address.trim(),
    supply_number: orNull(d.supply_number),
    meter_identifier: orNull(d.meter_identifier),
    meter_type: d.meter_type === '' ? null : d.meter_type,
    meter_note: orNull(d.meter_note),
    tariff_category_code: orNull(d.tariff_category_code),
    tariff_name: orNull(d.tariff_name),
    application_date: orNull(d.application_date),
    contract_months: months,
    notes: d.notes.trim(),
  };
}

/** Problems that stop saving THIS connection (nothing else). Fixed Greek sentences. */
export function draftErrors(d: SupplyPointDraft): { supply_number?: string; contract_months?: string; application_date?: string } {
  const e: { supply_number?: string; contract_months?: string; application_date?: string } = {};
  const n = supplyNumberError(d.supply_number);
  if (n) e.supply_number = n;
  if (d.contract_months.trim() !== '') {
    const m = Number(d.contract_months);
    if (!Number.isInteger(m) || m < 1 || m > 600) e.contract_months = 'Η διάρκεια είναι σε μήνες (1–600).';
  }
  if (d.application_date.trim() !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(d.application_date.trim())) e.application_date = 'Η ημερομηνία δεν είναι έγκυρη.';
  return e;
}

/** «12 μήνες», «2 έτη», «1 έτος και 6 μήνες». */
export function contractText(months: number | null | undefined): string {
  if (months == null) return '';
  const y = Math.floor(months / 12), m = months % 12;
  const ys = y === 1 ? '1 έτος' : `${y} έτη`;
  const ms = m === 1 ? '1 μήνας' : `${m} μήνες`;
  if (y === 0) return ms;
  return m === 0 ? ys : `${ys} και ${ms}`;
}

/** Tariff options for a connection: active ones that fit the usage, plus the connection's own code even if it was archived or removed from the list. */
export function tariffOptions(list: TariffCategory[], usage: SupplyUsage, current: string | null | undefined): { code: string; label: string; archived: boolean }[] {
  const opts = list
    .filter(c => c.active && (c.usage === 'any' || c.usage === usage))
    .sort((a, b) => a.sort - b.sort || a.code.localeCompare(b.code, 'el'))
    .map(c => ({ code: c.code, label: c.label || c.code, archived: false }));
  if (current && !opts.some(o => o.code === current)) {
    const known = list.find(c => c.code === current);
    opts.push({ code: current, label: known?.label || current, archived: true });
  }
  return opts;
}

/** PostgREST: the table or function is not installed yet (the staged SQL has not been applied). */
export const isNotInstalled = (e: { code?: string | null; message?: string | null } | null | undefined) =>
  !!e && (/PGRST20[25]|42P01|42883/.test(e.code ?? '') || /does not exist|schema cache|Could not find the (table|function)/i.test(e.message ?? ''));

/** Greek text for a refused write. Never shows migration or developer wording. */
export function supplyErrorText(error: { code?: string | null; message?: string | null } | null | undefined): string {
  const m = `${error?.code ?? ''} ${error?.message ?? ''}`;
  if (/PREVIEW_READ_ONLY|μόνο ανάγνωση/.test(m)) return 'Προεπισκόπηση ρόλου: μόνο ανάγνωση.';
  if (isNotInstalled(error)) return 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.';
  if (/42501|row-level security|not allowed|permission/i.test(m)) return 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.';
  if (/another customer/i.test(m)) return 'Η παροχή ανήκει σε άλλον πελάτη.';
  if (/23514|check constraint/i.test(m)) return 'Κάποιο στοιχείο της παροχής δεν είναι έγκυρο.';
  return 'Η παροχή δεν αποθηκεύτηκε. Δοκιμάστε ξανά.';
}

/** Name of a connection for lists elsewhere (case rows, document pickers): «Παροχή 2 — Επαγγελματικό», «Αρχειοθετημένη — Οικιακό», or '' when unknown. */
export function supplyLabelFor(points: Pick<SupplyPoint, 'id' | 'usage' | 'archived_at'>[] | null | undefined, id: string | null | undefined): string {
  if (!points || !id) return '';
  const p = points.find(x => x.id === id);
  if (!p) return '';
  if (p.archived_at) return `Αρχειοθετημένη — ${USAGE_LABEL[p.usage]}`;
  const position = points.filter(x => !x.archived_at).findIndex(x => x.id === id) + 1;
  return supplyPointTitle(position, p.usage);
}
