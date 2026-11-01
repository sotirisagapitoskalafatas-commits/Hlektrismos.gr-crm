// The Supabase Auth e-mails of ATLAS CRM. LOCAL: the rendered templates are checked as text. This proves what the files contain; it does NOT prove that Supabase has
// them installed (that is a Dashboard / Management-API step) or that any mailbox received one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = fileURLToPath(new URL('../../../', import.meta.url));
const mod = (rel) => import(pathToFileURL(repo + rel).href);
const { AUTH_TEMPLATES, renderHtml, renderText } = await mod('emails/auth-templates.mjs');
const { renderAll } = await mod('emails/build.mjs');
const dist = (n) => readFileSync(repo + 'emails/dist/' + n, 'utf8').replace(/\r\n/g, '\n');

// The variables Supabase documents per template (docs: auth-email-templates, "Terminology"). {{ .NewEmail }} only in «Change email address»,
// {{ .OldEmail }} only in «Email address changed», {{ .FactorType }} only in the two verification-method notifications.
const ALLOWED = {
  confirmation: ['.ConfirmationURL', '.Email'], invite: ['.ConfirmationURL', '.Email'], magic_link: ['.ConfirmationURL', '.Email'], recovery: ['.ConfirmationURL', '.Email'],
  email_change: ['.ConfirmationURL', '.Email', '.NewEmail'], reauthentication: ['.Token'], password_changed: ['.Email'], email_changed: ['.Email', '.OldEmail'],
  mfa_enrolled: ['.FactorType'], mfa_unenrolled: ['.FactorType'],
};
const vars = (s) => [...s.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1]);

test('every template exists, in Greek, with a subject, a preview line and an inline-styled table layout', () => {
  assert.deepEqual(AUTH_TEMPLATES.map((t) => t.key).sort(), Object.keys(ALLOWED).sort());
  for (const t of AUTH_TEMPLATES) {
    const html = renderHtml(t);
    assert.ok(/[Α-Ωα-ω]{3,}/.test(t.subject) && /[Α-Ωα-ω]{3,}/.test(html), t.key + ': Greek');
    assert.ok(t.preheader.length > 10 && html.includes(t.preheader), t.key + ': preview line is in the document');
    assert.match(html, /^<!doctype html>/i); assert.match(html, /<html lang="el"/); assert.match(html, /role="presentation"/); assert.match(html, /max-width:560px/);
    assert.ok(html.includes('HLEKTRISMOS') && html.includes('ATLAS CRM') && html.includes('Ασφαλής διαχείριση επαγγελματικών δεδομένων.'), t.key + ': brand and footer');
    assert.match(html, /style="/); assert.ok(!/<style|<link|@import|<script|<iframe|<img|javascript:|on(click|load|error)=/i.test(html), t.key + ': inline CSS only, nothing external, no script');
  }
});

test('each template uses only the variables Supabase supports for THAT template, and every variable in the text exists in the list', () => {
  for (const t of AUTH_TEMPLATES) {
    const used = [...new Set([...vars(renderHtml(t)), ...vars(t.subject)])].sort();
    for (const v of used) assert.ok(ALLOWED[t.key].includes(v), `${t.key} uses {{ ${v} }} which this template does not support`);
    assert.deepEqual(t.variables.slice().sort(), ALLOWED[t.key].slice().sort(), t.key + ': declared variables');
  }
  assert.ok(vars(renderHtml(AUTH_TEMPLATES.find((t) => t.key === 'email_change'))).includes('.NewEmail'));
  for (const t of AUTH_TEMPLATES.filter((x) => x.key !== 'email_change')) assert.ok(!vars(renderHtml(t)).includes('.NewEmail'), t.key + ' must not use .NewEmail');
  for (const t of AUTH_TEMPLATES.filter((x) => x.key !== 'email_changed')) assert.ok(!vars(renderHtml(t)).includes('.OldEmail'), t.key + ' must not use .OldEmail');
});

test('the action link is exactly the Supabase confirmation URL: never rebuilt, never hard-coded, never localhost, never plain http', () => {
  for (const t of AUTH_TEMPLATES) {
    const html = renderHtml(t);
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    if (t.action) assert.deepEqual(hrefs, ['{{ .ConfirmationURL }}'], t.key + ': the one link is the Supabase variable');
    else assert.deepEqual(hrefs, [], t.key + ': no link');
    assert.ok(!/localhost|127\.0\.0\.1|https?:\/\/|\{\{\s*\.SiteURL|\{\{\s*\.RedirectTo|token_hash|\.TokenHash/i.test(html), t.key + ': no hard-coded or rebuilt address');
  }
});

test('the Admin e-mail-change template matches the specification word for word and does not misstate the state of the change', () => {
  const t = AUTH_TEMPLATES.find((x) => x.key === 'email_change'); const html = renderHtml(t);
  assert.equal(t.subject, 'Ασφάλεια λογαριασμού ATLAS — Επιβεβαίωση αλλαγής email');
  assert.equal(t.preheader, 'Ζητήθηκε αλλαγή της διεύθυνσης σύνδεσης του λογαριασμού σας.');
  for (const s of ['Επιβεβαίωση αλλαγής email', 'Λάβαμε αίτημα αλλαγής της διεύθυνσης σύνδεσης του λογαριασμού σας στο ATLAS CRM.', 'Νέα διεύθυνση email', '{{ .NewEmail }}', 'Επιβεβαίωση νέου email',
    'Εάν δεν ζητήσατε αυτή την αλλαγή, μην επιβεβαιώσετε το αίτημα. Επικοινωνήστε με τον υπεύθυνο διαχείρισης του λογαριασμού σας.']) assert.ok(html.includes(s), s);
  // sent to both addresses under Secure email change: it says both are needed and that nothing has changed yet
  assert.match(html, /μόνο όταν επιβεβαιωθεί και από τις δύο διευθύνσεις/); assert.match(html, /συνεχίζετε να συνδέεστε με την τρέχουσα/);
  assert.ok(!/ολοκληρώθηκε επιτυχώς|άλλαξε/.test(html.replace(/<title>[\s\S]*?<\/title>/, '')), 'a request is never described as a completed change');
  assert.ok(!/Η αλλαγή email ολοκληρώθηκε/.test(html));
});

test('a completed change has its own notification template (the OLD and NEW address), separate from the request', () => {
  const done = AUTH_TEMPLATES.find((x) => x.key === 'email_changed'); const html = renderHtml(done);
  assert.ok(html.includes('{{ .OldEmail }}') && html.includes('{{ .Email }}') && html.includes('Η αλλαγή email ολοκληρώθηκε'));
  assert.equal(done.notification, 'mailer_notifications_email_changed_enabled');
  assert.ok(!html.includes('{{ .ConfirmationURL }}'), 'a notification asks for nothing');
});

test('reauthentication shows the one-time code and warns not to share it; notifications carry no button', () => {
  const r = AUTH_TEMPLATES.find((x) => x.key === 'reauthentication');
  assert.ok(renderHtml(r).includes('{{ .Token }}') && /Μην μοιραστείτε αυτόν τον κωδικό/.test(renderHtml(r)));
  for (const k of ['password_changed', 'email_changed', 'mfa_enrolled', 'mfa_unenrolled']) assert.ok(!/<a /.test(renderHtml(AUTH_TEMPLATES.find((x) => x.key === k))), k);
});

test('plain-text versions exist, carry the same link variable and no markup', () => {
  for (const t of AUTH_TEMPLATES) {
    const txt = renderText(t);
    assert.ok(!/<[a-z!/]/i.test(txt), t.key + ': no HTML in plain text');
    if (t.action) assert.ok(txt.includes('{{ .ConfirmationURL }}'), t.key);
    assert.ok(txt.includes('HLEKTRISMOS') && txt.includes('Ασφάλεια:'));
  }
});

test('the special characters of Greek names and addresses cannot break the layout: variables are placed as text and the layout has no raw interpolation of data', () => {
  const html = renderHtml(AUTH_TEMPLATES.find((x) => x.key === 'email_change'));
  assert.ok(/word-break:break-all/.test(html), 'a long address wraps');
  assert.ok(!/\$\{|undefined|\[object/.test(html), 'no leftover interpolation');
});

test('the committed files are exactly what the source renders (run `node emails/build.mjs` after a change), and the Management-API payload has every template', () => {
  const files = renderAll();
  for (const [n, c] of Object.entries(files)) { assert.ok(existsSync(repo + 'emails/dist/' + n), n + ' is committed'); assert.equal(dist(n), c, n + ' is up to date'); }
  const payload = JSON.parse(dist('supabase-auth-templates.json'));
  for (const t of AUTH_TEMPLATES) { assert.equal(payload[t.subjectField], t.subject); assert.equal(payload[t.contentField], renderHtml(t)); }
  assert.ok(!/(sbp_|sb_secret|eyJ[A-Za-z0-9_-]{20,}|password\s*=)/i.test(JSON.stringify(payload)), 'no credential in the payload');
});
