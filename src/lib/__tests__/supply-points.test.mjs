import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const js = buildSync({ entryPoints: [fileURLToPath(new URL('../supply-points.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const S = await import('data:text/javascript;base64,' + Buffer.from(js.outputFiles[0].text).toString('base64'));

test('titles: «Παροχή 1 — Οικιακό», «Παροχή 2 — Επαγγελματικό»', () => {
  assert.equal(S.supplyPointTitle(1, 'residential'), 'Παροχή 1 — Οικιακό');
  assert.equal(S.supplyPointTitle(2, 'commercial'), 'Παροχή 2 — Επαγγελματικό');
});

test('supply number: optional; when given, exactly 11 digits (spaces and dashes allowed); the supply number is never confused with the meter', () => {
  for (const ok of [null, undefined, '', '   ', '12345678901', '123 4567 8901', '123-456-789-01', ' 12345678901 ']) { assert.equal(S.supplyNumberOk(ok), true, String(ok)); assert.equal(S.supplyNumberError(ok), null); }
  for (const bad of ['1234567890', '123456789012', '123456789', 'ABC12345678', '12345678901x', '123.456.789.01']) { assert.equal(S.supplyNumberOk(bad), false, bad); assert.match(S.supplyNumberError(bad), /11 ψηφία/); }
  assert.equal(S.supplyNumberKey('123 4567-8901'), '12345678901'); assert.equal(S.supplyNumberKey(' '), null);
  const row = S.draftToRow({ ...S.emptyDraft('commercial'), supply_number: '12345678901', meter_identifier: 'ΜΤ-998877' });
  assert.equal(row.supply_number, '12345678901'); assert.equal(row.meter_identifier, 'ΜΤ-998877'); assert.notEqual(row.supply_number, row.meter_identifier);
});

test('the tariff category code and the commercial tariff name are two separate fields', () => {
  const row = S.draftToRow({ ...S.emptyDraft(), tariff_category_code: 'Γ1Ν', tariff_name: 'Πράσινο Ειδικό' });
  assert.equal(row.tariff_category_code, 'Γ1Ν'); assert.equal(row.tariff_name, 'Πράσινο Ειδικό');
});

test('nothing is mandatory: an empty draft is valid and writes nulls, never empty strings, for the optional fields', () => {
  const d = S.emptyDraft();
  assert.deepEqual(S.draftErrors(d), {});
  assert.deepEqual(S.draftToRow(d), { usage: 'residential', property_address: '', supply_number: null, meter_identifier: null, meter_type: null, meter_note: null, tariff_category_code: null, tariff_name: null, application_date: null, contract_months: null, notes: '' });
});

test('draft errors stop only the save of this connection: supply number, months, date', () => {
  assert.deepEqual(Object.keys(S.draftErrors({ ...S.emptyDraft(), supply_number: '123', contract_months: '0', application_date: '1/2/2026' })).sort(), ['application_date', 'contract_months', 'supply_number']);
  assert.deepEqual(S.draftErrors({ ...S.emptyDraft(), contract_months: '24', application_date: '2026-10-18', supply_number: '12345678901' }), {});
  assert.equal(S.draftToRow({ ...S.emptyDraft(), contract_months: '24' }).contract_months, 24);
  assert.ok(S.draftErrors({ ...S.emptyDraft(), contract_months: '1.5' }).contract_months);
  assert.ok(S.draftErrors({ ...S.emptyDraft(), contract_months: '601' }).contract_months);
});

test('contract duration text', () => {
  assert.equal(S.contractText(null), ''); assert.equal(S.contractText(1), '1 μήνας'); assert.equal(S.contractText(6), '6 μήνες'); assert.equal(S.contractText(12), '1 έτος');
  assert.equal(S.contractText(24), '2 έτη'); assert.equal(S.contractText(18), '1 έτος και 6 μήνες'); assert.equal(S.contractText(25), '2 έτη και 1 μήνας');
});

test('a draft round-trips through a stored connection', () => {
  const p = { id: 'x', customer_id: 'c', usage: 'commercial', property_address: 'Οδός 2', supply_number: '12345678901', supply_number_key: '12345678901', supply_number_ok: true, meter_identifier: 'M1', meter_type: 'three_phase', meter_note: null,
    tariff_category_code: 'Γ21', tariff_name: 'Επαγγελματικό', application_date: '2026-10-01', contract_months: 24, notes: 'σ', needs_review: false, review_note: null, reviewed_at: null, archived_at: null, created_at: '', updated_at: '' };
  assert.deepEqual(S.draftToRow(S.draftFromPoint(p)), { usage: 'commercial', property_address: 'Οδός 2', supply_number: '12345678901', meter_identifier: 'M1', meter_type: 'three_phase', meter_note: null, tariff_category_code: 'Γ21', tariff_name: 'Επαγγελματικό', application_date: '2026-10-01', contract_months: 24, notes: 'σ' });
});

test('tariff options: only active ones that fit the usage; a connection keeps showing its own code even if the option was archived or removed', () => {
  const list = [{ code: 'Γ1', label: 'Γ1', usage: 'residential', active: true, sort: 10 }, { code: 'Γ21', label: 'Γ21', usage: 'commercial', active: true, sort: 30 }, { code: 'Γ22', label: 'Γ22', usage: 'commercial', active: false, sort: 40 }, { code: 'Χ', label: 'Ελεύθερο', usage: 'any', active: true, sort: 5 }];
  assert.deepEqual(S.tariffOptions(list, 'residential', null).map((o) => o.code), ['Χ', 'Γ1']);
  assert.deepEqual(S.tariffOptions(list, 'commercial', 'Γ22').map((o) => [o.code, o.archived]), [['Χ', false], ['Γ21', false], ['Γ22', true]]);
  assert.deepEqual(S.tariffOptions(list, 'commercial', 'ΓΓ99').map((o) => [o.code, o.archived]).pop(), ['ΓΓ99', true]);
});

test('errors are neutral Greek, never migration or developer wording', () => {
  const t = (e) => S.supplyErrorText(e);
  assert.equal(t({ code: 'PGRST205', message: "Could not find the table 'public.customer_supply_points' in the schema cache" }), 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.');
  assert.equal(t({ code: '42P01', message: 'relation "customer_supply_points" does not exist' }), 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.');
  assert.equal(t({ code: 'PGRST202', message: 'Could not find the function public.flag_supply_point_review' }), 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.');
  assert.equal(t({ code: '42501', message: 'new row violates row-level security policy' }), 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.');
  assert.equal(t({ code: 'P0001', message: 'supply_point: the connection belongs to another customer' }), 'Η παροχή ανήκει σε άλλον πελάτη.');
  assert.equal(t({ code: '23514', message: 'violates check constraint' }), 'Κάποιο στοιχείο της παροχής δεν είναι έγκυρο.');
  assert.equal(t({ message: 'boom' }), 'Η παροχή δεν αποθηκεύτηκε. Δοκιμάστε ξανά.');
  for (const e of [{ code: 'PGRST205', message: 'schema cache' }, { code: '42501', message: 'x' }, { message: 'boom' }, { code: '23514', message: 'x' }]) assert.ok(!/migration|phase\d|SQL|schema|PGRST|relation/i.test(t(e)));
  assert.equal(S.isNotInstalled({ code: 'PGRST205', message: '' }), true); assert.equal(S.isNotInstalled({ code: '23505', message: 'duplicate' }), false); assert.equal(S.isNotInstalled(null), false);
});
