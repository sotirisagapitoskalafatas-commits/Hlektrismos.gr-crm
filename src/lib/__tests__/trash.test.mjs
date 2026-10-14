import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// trash.ts imports the supabase client; stub it so the pure helpers can be tested in Node.
const out = await build({
  entryPoints: [fileURLToPath(new URL('../trash.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
  plugins: [{ name: 'stub', setup(b) { b.onResolve({ filter: /\/supabase$/ }, () => ({ path: 'stub', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = {};' })); } }],
});
const T = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('only admin/manager trash; only admin purges; trashed rows never in normal lists', () => {
  assert.deepEqual(['admin', 'manager', 'inside_sales', 'field_sales', 'back_office'].map(T.canTrash), [true, true, false, false, false]);
  assert.deepEqual(['admin', 'manager', 'back_office'].map(T.canPurge), [true, false, false]);
  assert.deepEqual(T.notTrashed([{ id: 1 }, { id: 2, deleted_at: '2026-10-14' }, { id: 3, deleted_at: null }]).map((r) => r.id), [1, 3]);
});

test('database refusals become clear Greek messages', () => {
  assert.equal(T.trashError('purge: referenced by {"cases": 2, "consent_records": 1}', 'x'),
    'Δεν επιτρέπεται οριστική διαγραφή: συνδέεται με 2 cases, 1 καταγραφές συγκατάθεσης. Το ιστορικό του CRM διατηρείται.');
  assert.equal(T.trashError('trash: customer has 3 open case(s)', 'x'), 'Ο πελάτης έχει 3 ανοιχτά cases. Κλείστε ή ολοκληρώστε τα πρώτα.');
  assert.equal(T.trashError('purge: only an administrator can delete permanently', 'x'), 'Μόνο ο διαχειριστής μπορεί να διαγράψει οριστικά.');
  assert.match(T.trashError('Could not find the function public.trash_record', 'x'), /phase2\/06/);
  assert.equal(T.trashError('something else', 'fallback'), 'fallback');
  assert.equal(T.describeReferences({ cases: 1, follow_ups: 0 }), '1 cases');
});
