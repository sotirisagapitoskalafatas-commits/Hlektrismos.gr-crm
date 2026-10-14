import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = buildSync({ entryPoints: [fileURLToPath(new URL('../upload-files.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent' });
const U = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const f = (name, type, size = 1000) => ({ name, type, size });
const PUB = U.PUBLIC_FORM_KINDS;

test('iPhone HEIC/HEIF photos are accepted (were rejected before)', () => {
  assert.deepEqual([U.classifyUpload(f('IMG_0001.HEIC', 'image/heic'), PUB).ok, U.classifyUpload(f('IMG_0001.HEIC', 'image/heic'), PUB).contentType], [true, 'image/heic']);
  assert.equal(U.classifyUpload(f('photo.heif', ''), PUB).contentType, 'image/heif');
});
test('Android pickers with an empty file type are accepted by extension', () => {
  const c = U.classifyUpload(f('Λογαριασμός ΔΕΗ.PDF', ''), PUB);
  assert.equal(c.ok, true); assert.equal(c.contentType, 'application/pdf'); assert.equal(c.ext, 'pdf');
  assert.equal(U.classifyUpload(f('image.jpg', 'image/jpg'), PUB).contentType, 'image/jpeg');
});
test('public form rejects spreadsheets, unknown, empty and oversized files with a Greek reason', () => {
  assert.equal(U.classifyUpload(f('a.xlsx', ''), PUB).ok, false);
  assert.equal(U.classifyUpload(f('a.xlsx', ''), ['pdf', 'image', 'sheet']).ok, true);
  assert.match(U.classifyUpload(f('virus.exe', 'application/x-msdownload'), PUB).error, /δεν υποστηρίζεται/);
  assert.match(U.classifyUpload(f('a.jpg', 'image/jpeg', 0), PUB).error, /κενό/);
  assert.match(U.classifyUpload(f('a.jpg', 'image/jpeg', 26 * 1024 * 1024), PUB).error, /25MB/);
});
test('storage names are ASCII, keep the right extension and do not collide for iPhone «image.jpg»', () => {
  const a = U.storageName('Λογαριασμός ΔΕΗ.HEIC', 'heic', 1), b = U.storageName('image.jpg', 'jpg', 1), c = U.storageName('image.jpg', 'jpg', 1);
  assert.match(a, /^1_[a-z0-9]+_file\.heic$/);
  assert.match(b, /^1_[a-z0-9]+_image\.jpg$/);
  assert.notEqual(b, c);
  assert.equal(U.PUBLIC_FORM_ACCEPT.includes('image/*'), true, 'lets phones offer camera and gallery');
});
