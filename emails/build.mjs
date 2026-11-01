// Renders every Auth e-mail to emails/dist: <key>.html, <key>.txt, and supabase-auth-templates.json (the Management-API payload; no secret in it).
//   node emails/build.mjs          write the files
//   node emails/build.mjs --check  fail if the committed files differ from what the source renders
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { AUTH_TEMPLATES, renderHtml, renderText } from './auth-templates.mjs';

const dist = join(dirname(fileURLToPath(import.meta.url)), 'dist');
export function renderAll() {
  const files = {};
  const payload = {};
  for (const t of AUTH_TEMPLATES) {
    const html = renderHtml(t);
    files[`${t.key}.html`] = html;
    files[`${t.key}.txt`] = renderText(t);
    payload[t.subjectField] = t.subject;
    payload[t.contentField] = html;
  }
  files['supabase-auth-templates.json'] = JSON.stringify(payload, null, 2) + '\n';
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = renderAll();
  if (process.argv.includes('--check')) {
    const stale = Object.entries(files).filter(([n, c]) => !existsSync(join(dist, n)) || readFileSync(join(dist, n), 'utf8').replace(/\r\n/g, '\n') !== c).map(([n]) => n);
    if (stale.length) { console.error('stale: ' + stale.join(', ')); process.exit(1); }
    console.log('emails/dist is up to date (' + Object.keys(files).length + ' files)');
  } else {
    mkdirSync(dist, { recursive: true });
    for (const [n, c] of Object.entries(files)) writeFileSync(join(dist, n), c);
    console.log('wrote ' + Object.keys(files).length + ' files to emails/dist');
  }
}
