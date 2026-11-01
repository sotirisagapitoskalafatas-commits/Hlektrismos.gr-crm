// How the Field Visits / Applications screens are wired into the existing CRM (source-level: no browser, no network). The point of each check is a promise made in
// docs/product/FIELD_VISITS_AND_APPLICATIONS.md: nothing existing changes until the staged SQL is applied, the Case workflow is untouched, and nothing new reaches around the database.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\/]$/, '');
const read = (f) => readFileSync(path.join(SRC, f), 'utf8').replace(/\r\n/g, '\n');
const noComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('the Applications page is a real page for both roles, in the nav, the module map, the URL and the shell', () => {
  assert.match(read('lib/roles.ts'), /key: 'applications', label: 'Αιτήσεις'[^\n]*roles: ALL/);
  assert.match(read('lib/roles.ts'), /applications: 'Αιτήσεις'/);
  assert.match(read('lib/nav-url.ts'), /'applications'/);
  assert.match(read('components/shell/ModuleMap.ts'), /keys: \['cases', 'applications', 'backoffice'\]/);
  assert.match(read('components/app/AppShell.tsx'), /case 'applications': return <ApplicationsPage \/>/);
  assert.match(read('components/app/AppShell.tsx'), /'guide', 'applications'\]\)/, 'the page draws its own heading');
});

test('everything new is behind an availability probe: the existing screens only change shape when the staged SQL is installed', () => {
  assert.match(read('components/visits/StandaloneVisitsPanel.tsx'), /if \(!available\) return null/);
  assert.match(read('components/applications/ApplicationsPage.tsx'), /NOT_AVAILABLE_TEXT/);
  assert.match(read('components/customers/CustomerDetail.tsx'), /work: workAvail/);
  assert.match(read('components/customers/CustomerWork.tsx'), /NOT_AVAILABLE_TEXT/);
  assert.match(read('components/field-sales/FieldApplicationsQueue.tsx'), /if \(apps === null && visits === null\) return null/);
  assert.match(read('components/app/MyDayPage.tsx'), /<StandaloneVisitsPanel \/>/);
});

test('the folder tabs are exactly what they were unless the work tab is asked for', async () => {
  const src = read('lib/folder.ts');
  assert.match(src, /\(t\.id !== 'work' \|\| !!opts\.work\)/);
});

test('the case-centred loaders never receive a visit without a Case (they would crash on it)', () => {
  assert.match(read('lib/api.ts'), /\.not\('case_id', 'is', null\)/);
});

test('no new code reaches around the database: no service key, no public URL, no raw SQL, no local storage of documents or identities', () => {
  for (const f of ['lib/field-api.ts', 'lib/applications.ts', 'lib/field-visits.ts', 'components/applications/ApplicationWizard.tsx', 'components/applications/ApplicationDetail.tsx', 'components/applications/ApplicationsPage.tsx',
    'components/visits/StandaloneVisitsPanel.tsx', 'components/visits/VisitScheduler.tsx', 'components/customers/CustomerWork.tsx', 'components/field-sales/FieldApplicationsQueue.tsx']) {
    const s = noComments(read(f));
    assert.ok(!/service_role|SERVICE_ROLE|getPublicUrl|\.sql\(|exec_sql|localStorage|sessionStorage|indexedDB/.test(s), f);
  }
});

test('the Case workflow is untouched: no new code moves a Case between stages or writes cases / case_documents', () => {
  for (const f of ['lib/field-api.ts', 'components/applications/ApplicationWizard.tsx', 'components/applications/ApplicationDetail.tsx', 'components/visits/StandaloneVisitsPanel.tsx', 'components/field-sales/FieldApplicationsQueue.tsx']) {
    const s = noComments(read(f));
    assert.ok(!/from\('cases'\)|from\('case_documents'\)|set_case_stage|\.update\(\{[^}]*current_stage/.test(s), f);   // reading a case through an embed is fine; writing one is not
  }
});

test('the wizard never creates a customer, and the submit goes through the one dedicated operation', () => {
  const w = noComments(read('components/applications/ApplicationWizard.tsx')) + noComments(read('lib/field-api.ts'));
  assert.ok(!/from\('customers'\)\s*\.(insert|upsert)|createCustomer|convert_lead_to_case/.test(w));
  assert.equal((w.match(/rpc\('submit_energy_application'/g) ?? []).length, 1);
  assert.match(read('components/applications/ApplicationWizard.tsx'), /Μπορείτε να συνεχίσετε και χωρίς όλα τα έγγραφα/);
});

test('only the shared Admin login claims no individual identity: the screens say the decision is recorded as the shared account', () => {
  assert.match(read('components/field-sales/FieldApplicationsQueue.tsx'), /κοινό λογαριασμό Admin \/ Back Office/);
});


test('standalone visit outcomes use one atomic RPC and offline replay preserves the structured result', () => {
  const panel = noComments(read('components/visits/StandaloneVisitsPanel.tsx'));
  assert.match(panel, /fieldCheckoutWithOutcome/);
  assert.doesNotMatch(panel, /await updateVisitNotes|await saveVisitOutcome/);
  assert.match(noComments(read('lib/api.ts')), /rpc\('field_checkout_with_outcome'/);
  assert.match(noComments(read('lib/offline/sync.ts')), /fieldCheckoutWithOutcome[\s\S]*outcomeKey/);
  assert.match(noComments(read('lib/field-visits.ts')), /outcomeKey/);
});

test('the offline queue retries transport errors instead of treating them as a missing visit', () => {
  const api = noComments(read('lib/api.ts'));
  assert.match(api, /fieldCheckoutWithOutcome[\s\S]*code: 'RPC_ERROR'/);
  const field = noComments(read('lib/field-visits.ts'));
  const start = field.indexOf('export function classifyReplay');
  const end = field.indexOf('export const QUEUE_FORBIDDEN_KEYS', start);
  const replay = field.slice(start, end);
  assert.match(replay, /res\.code === 'NO_VISIT'/);
  assert.match(replay, /res\.code === 'OUTCOME_CONFLICT'/);
  assert.match(replay, /return 'retry';/);
});

test('all check-in/check-out RPC failures stay retryable instead of being mislabelled as missing visits', () => {
  const api = noComments(read('lib/api.ts'));
  assert.match(api, /fieldCheckin\([\s\S]*?code: 'RPC_ERROR'/);
  assert.match(api, /fieldCheckout\([\s\S]*?code: 'RPC_ERROR'/);
  assert.match(api, /fieldCheckoutWithOutcome\([\s\S]*?code: 'RPC_ERROR'/);
});
