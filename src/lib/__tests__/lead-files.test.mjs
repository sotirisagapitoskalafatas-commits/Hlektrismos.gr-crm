import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../lead-files.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const L = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('website files are read defensively from the free-form jsonb column', () => {
  assert.deepEqual(L.leadFiles(null), []);
  assert.deepEqual(L.leadFiles('x'), []);
  const f = L.leadFiles([{ path: 'contact-forms/1_a_bill.pdf', name: 'ΔΕΗ.pdf', type: 'application/pdf', size: 2048 }, { name: 'no path' }, null, { path: 'contact-forms/2_b.jpg' }]);
  assert.equal(f.length, 2);
  assert.equal(f[1].name, '2_b.jpg');
});
test('filed website files point at the website bucket and are no longer pending', () => {
  const files = L.leadFiles([{ path: 'contact-forms/a.pdf', name: 'a.pdf' }, { path: 'contact-forms/b.jpg', name: 'b.jpg' }]);
  assert.equal(L.leadFileRef('contact-forms/a.pdf'), 'hlektrismos_docs/contact-forms/a.pdf');
  assert.equal(L.leadFilePath('hlektrismos_docs/contact-forms/a.pdf'), 'contact-forms/a.pdf');
  assert.equal(L.leadFilePath('cases/123_x.pdf'), null, 'normal case documents keep their bucket');
  const left = L.unfiledLeadFiles(files, [{ file_url: 'hlektrismos_docs/contact-forms/a.pdf' }, { file_url: 'cases/1.pdf' }, { file_url: null }]);
  assert.deepEqual(left.map((x) => x.name), ['b.jpg']);
  assert.equal(L.fileSizeText(2048), '2 KB');
  assert.equal(L.fileSizeText(3 * 1024 * 1024), '3.0 MB');
});

test('a file may carry the electricity connection it belongs to (staged phase5/18); entries without a tag are unchanged', () => {
  const raw = [{ path: 'leads/a/bill.pdf', name: 'bill.pdf', type: 'application/pdf', size: 10, supply_point_id: 'sp-1' }, { path: 'leads/a/id.pdf', name: 'id.pdf' }, { path: 'leads/a/x.pdf', name: 'x.pdf', supply_point_id: 5 }];
  const f = L.leadFiles(raw);
  assert.equal(f[0].supply_point_id, 'sp-1');
  assert.ok(!('supply_point_id' in f[1]), 'untagged stays exactly as before');
  assert.ok(!('supply_point_id' in f[2]), 'a non-string tag is ignored');
});
