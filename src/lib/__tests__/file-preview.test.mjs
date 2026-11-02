import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const out = await build({
  entryPoints: [fileURLToPath(new URL('../file-preview.ts', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'silent',
});
const preview = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

test('common image uploads are previewed inline from MIME type or filename', () => {
  for (const [mime, name] of [
    ['image/png', 'preview.png'], ['image/jpeg', 'photo.jpg'], ['image/webp', 'scan.webp'],
    ['', 'preview (2).png'], [null, 'photo.jpeg'], ['image/svg+xml', 'drawing.svg'],
  ]) assert.equal(preview.filePreviewKind(mime, name), 'image');
});

test('PDF uploads are previewed inline from MIME type or filename', () => {
  assert.equal(preview.filePreviewKind('application/pdf', 'report.pdf'), 'pdf');
  assert.equal(preview.filePreviewKind('', 'report.pdf'), 'pdf');
});

test('unsupported and browser-incompatible files stay as download/open links', () => {
  assert.equal(preview.filePreviewKind('application/msword', 'letter.doc'), 'unsupported');
  assert.equal(preview.filePreviewKind('image/heic', 'photo.heic'), 'unsupported');
  assert.equal(preview.filePreviewKind('', 'archive.zip'), 'unsupported');
});
