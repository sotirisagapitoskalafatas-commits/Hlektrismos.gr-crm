// Learning Centre («Οδηγός ATLAS»). The guides are documentation, and documentation drifts and invents. These tests make the documents earn their place:
// every guide parses, every «screen label» it quotes exists in the application, every link and tour/map/tree target exists, the two roles are the only roles,
// the role / page / stage tables come from the code, Practice Mode touches nothing real, and learning progress never identifies an employee.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, '');
const ROOT = path.resolve(SRC, '..');
const GUIDE_DIR = path.join(ROOT, 'docs', 'atlas-guide');

let labs = false;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (k === 'atlas.labs' && labs ? 'on' : null), setItem() {}, removeItem() {} } });

const entry = `
export * as markdown from '@/guide/markdown';
export * as search from '@/guide/search';
export * as progress from '@/guide/progress';
export * as tours from '@/guide/tours';
export * as maps from '@/guide/maps';
export * as troubleshoot from '@/guide/troubleshoot';
export * as helps from '@/guide/helps';
export * as whatsnew from '@/guide/whatsnew';
export * as practice from '@/guide/practice';
export * as library from '@/guide/library';
export * as embeds from '@/guide/embeds';
export * as feedback from '@/guide/feedback';
export * as labels from '@/guide/labels';
export * as roles from '@/lib/roles';
export * as navurl from '@/lib/nav-url';
`;
const out = buildSync({ stdin: { contents: entry, resolveDir: SRC, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', logLevel: 'error', alias: { '@': SRC } });
const M = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));

const files = Object.fromEntries(readdirSync(GUIDE_DIR).filter((f) => f.endsWith('.md')).map((f) => [f, readFileSync(path.join(GUIDE_DIR, f), 'utf8')]));
const LIB = M.library.buildLibrary(files);
const ids = new Set(LIB.docs.map((d) => d.meta.id));

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = path.join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const APP_SOURCE = walk(SRC).filter((p) => /\.(ts|tsx)$/.test(p) && !p.startsWith(path.join(SRC, 'guide') + path.sep) && !p.includes('__tests__')).map((p) => readFileSync(p, 'utf8')).join('\n');
const GUIDE_TS = readdirSync(path.join(SRC, 'guide')).filter((f) => f.endsWith('.ts')).map((f) => [f, readFileSync(path.join(SRC, 'guide', f), 'utf8')]);

const PAGES = new Set(M.navurl.PAGE_KEYS);

/* ───────── the documents ───────── */
test('every guide parses, ids are unique and match the file names, README is not a guide', () => {
  assert.deepEqual(LIB.problems, []);
  assert.ok(LIB.docs.length >= 20, `expected a real library, got ${LIB.docs.length}`);
  assert.ok(!LIB.docs.some((d) => d.meta.id === 'README'));
});

test('front matter: only the two real roles, a valid status, level, date and route', () => {
  for (const d of LIB.docs) {
    const m = d.meta;
    assert.ok(m.roles.every((r) => r === 'admin' || r === 'sales_agent'), `${m.id}: roles`);
    assert.match(m.updated, /^\d{4}-\d{2}-\d{2}$/, `${m.id}: updated`);
    assert.match(m.version, /^\d+\.\d+$/, `${m.id}: version`);
    assert.ok(m.summary.length >= 20 && m.summary.length <= 220, `${m.id}: summary length`);
    assert.ok(m.keywords.length >= 3, `${m.id}: keywords`);
    if (m.route) assert.ok(PAGES.has(m.route), `${m.id}: route «${m.route}» is not a page`);
    assert.ok(!M.library.isOutdated(m.version, M.library.GUIDE_VERSION), `${m.id}: outdated`);
  }
});

test('consistent structure: sections every guide of its kind must have', () => {
  const h2 = (d) => d.blocks.filter((b) => b.t === 'h2').map((b) => b.text);
  for (const d of LIB.docs) {
    const sections = h2(d); const has = (p) => sections.some((s) => s.startsWith(p));
    assert.ok(has('Σχετικοί οδηγοί'), `${d.meta.id}: «Σχετικοί οδηγοί»`);
    if (!['Αναφορά', 'Βοήθεια'].includes(d.meta.category)) { assert.ok(has('Τι είναι'), `${d.meta.id}: «Τι είναι»`); assert.ok(has('Ποιοι το χρησιμοποιούν'), `${d.meta.id}: «Ποιοι το χρησιμοποιούν»`); }
    if (['Πωλήσεις', 'Καθημερινή εργασία', 'Πεδίο', 'Back Office', 'Ανάλυση'].includes(d.meta.category)) assert.ok(has('Βήμα προς βήμα'), `${d.meta.id}: «Βήμα προς βήμα»`);
  }
});

test('a planned guide says so and gives no usage steps; a verified guide is not hedged away', () => {
  for (const d of LIB.docs.filter((x) => x.meta.status === 'planned')) {
    assert.match(d.text, /δεν είναι ακόμη διαθέσιμ|δεν υπάρχει ακόμη|δεν υπάρχει|προγραμματισμέν/i, `${d.meta.id}: must state it is not available`);
    assert.ok(!d.blocks.some((b) => b.t === 'h2' && b.text.startsWith('Βήμα προς βήμα') && !/τώρα/.test(b.text)), `${d.meta.id}: planned guide with usage steps`);
  }
  const changePassword = LIB.byId.get('allagi-kodikou');
  assert.equal(changePassword.meta.status, 'partially-verified', 'password change is on main (PR #150), but the Dashboard setting that makes Auth check the current password is not readable');
  assert.match(changePassword.text, /κοινό/); assert.match(changePassword.text, /ΟΛΕΣ|όλες οι άλλες συσκευές|όλο το γραφείο/);
  assert.ok(LIB.docs.some((d) => d.meta.status === 'planned'), 'at least one honest «not available» guide exists');
  const card = readFileSync(path.join(SRC, 'components', 'app', 'PasswordChangeCard.tsx'), 'utf8');
  for (const l of ['Τρέχων κωδικός πρόσβασης', 'Νέος κωδικός πρόσβασης', 'Επιβεβαίωση νέου κωδικού πρόσβασης', 'Αποθήκευση νέου κωδικού']) assert.ok(card.includes(l), `the card really has «${l}»`);
});

test('every link and related id points at a real guide; every route link at a real page', () => {
  assert.deepEqual(M.library.brokenLinks(LIB), []);
  for (const d of LIB.docs) {
    const bad = [];
    const check = (inl) => inl.forEach((x) => { if (x.t === 'route' && !PAGES.has(x.page)) bad.push(x.page); });
    for (const b of d.blocks) { if (b.t === 'p' || b.t === 'callout') check(b.inline); else if (b.t === 'ul' || b.t === 'steps') b.items.forEach(check); }
    assert.deepEqual(bad, [], `${d.meta.id}`);
  }
});

test('LABEL GUARD: every «screen label» in a guide exists verbatim in the application source', () => {
  const missing = [];
  for (const d of LIB.docs) for (const l of M.markdown.quotedLabels(d)) if (!APP_SOURCE.includes(l)) missing.push(`${d.meta.id}: «${l}»`);
  assert.deepEqual(missing, [], 'a guide quotes a label that is not in the application');
});

test('LABEL GUARD also covers the tours, maps, trees, tips and news (static «labels» only)', () => {
  const missing = [];
  for (const [f, src] of GUIDE_TS) {
    if (f === 'markdown.ts' || f === 'library.ts' || f === 'search.ts') continue;
    for (const m of src.matchAll(/«([^»«$\n]{2,80})»/g)) if (!APP_SOURCE.includes(m[1])) missing.push(`${f}: «${m[1]}»`);
  }
  assert.deepEqual(missing, []);
});

test('negative control: the label guard really detects an invented label', () => {
  const doc = M.markdown.parseGuide(files['ti-einai-to-atlas.md'].replace('«Μετατροπή σε Case»', '«Κουμπί που δεν υπάρχει»'));
  assert.ok(M.markdown.quotedLabels(doc).some((l) => !APP_SOURCE.includes(l)));
});

test('the application has exactly two roles and no guide invents a third', () => {
  assert.deepEqual(Object.keys(M.roles.PERMS).sort(), ['admin', 'sales_agent']);
  for (const d of LIB.docs) for (const line of d.text.split('\n')) if (/manager/i.test(line)) assert.match(line, /δεν υπάρχει/i, `${d.meta.id}: «${line.slice(0, 80)}»`);
});

test('no personal data, secrets or real contacts in any guide or in the guide code', () => {
  const all = [...LIB.docs.map((d) => [d.meta.id, d.text]), ...GUIDE_TS.map(([f, s]) => [f, s])];
  for (const [name, text] of all) {
    for (const e of text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) assert.match(e, /@example\.invalid$/, `${name}: email ${e}`);
    assert.ok(!/eyJ[A-Za-z0-9_-]{10,}|sk_(live|test)_|service_role|SUPABASE_[A-Z_]*KEY|[A-Za-z0-9]{32,}/.test(text.replace(/[A-Za-z0-9]{32,}\.md/g, '')), `${name}: looks like a secret`);
    for (const t of text.match(/\b(?:\+?30)?\s?6\d{9}\b|\b2\d{9}\b/g) ?? []) assert.fail(`${name}: real-looking phone number ${t}`);
  }
});

/* ───────── generated tables ───────── */
test('the role table is the permission table of the code', () => {
  const t = M.embeds.roleTable();
  assert.equal(t.head.length, 3);
  for (const row of t.rows) assert.ok(['Ναι', '—'].includes(row[1]) && ['Ναι', '—'].includes(row[2]));
  const row = (name) => t.rows.find((r) => r[0] === name);
  assert.deepEqual(row('Έλεγχος εγγράφου').slice(1), ['Ναι', '—'], 'only the admin verifies documents');
  assert.deepEqual(row('Αλλαγή σταδίου').slice(1), ['Ναι', 'Ναι']);
  assert.deepEqual(row('Ανάθεση').slice(1), ['Ναι', '—']);
});

test('the page table is the navigation of the code: reports, revenue and the queue are admin-only; the guide is for both', () => {
  const t = M.embeds.pageTable(); const r = (n) => t.rows.find((x) => x[0] === n);
  assert.deepEqual(r('Αναφορές').slice(2, 4), ['Ναι', '—']);
  assert.deepEqual(r('Έσοδα').slice(2, 4), ['Ναι', '—']);
  assert.deepEqual(r('Διεκπεραίωση').slice(2, 4), ['Ναι', '—']);
  assert.deepEqual(r('Οδηγός ATLAS').slice(2, 4), ['Ναι', 'Ναι']);
  assert.equal(M.roles.canOpenPage('guide', 'admin'), true);
  assert.equal(M.roles.canOpenPage('guide', 'sales_agent'), true);
});

test('the stage table lists every stage with exactly the transitions of the code', () => {
  const t = M.embeds.stageTable();
  assert.equal(t.rows.length, M.roles.STAGES.length);
  for (const s of M.roles.STAGES) { const row = t.rows.find((r) => r[0] === s.label); assert.equal(row[2].split(', ').filter((x) => x !== '—').length, M.roles.STAGE_TRANSITIONS[s.id].length); }
});

/* ───────── tours ───────── */
test('tours: each role has a tour; steps point only at known anchors and real guides; the sales tour never mentions admin-only places', () => {
  const anchors = new Set(M.tours.TOUR_ANCHORS);
  for (const role of ['admin', 'sales_agent']) {
    const steps = M.tours.TOURS[role]; assert.ok(steps.length >= 6);
    assert.equal(new Set(steps.map((s) => s.id)).size, steps.length, 'unique step ids');
    for (const s of steps) {
      assert.ok(s.title && s.body && s.why, `${role}/${s.id}: title, what and why`);
      for (const t of s.targets) assert.ok(anchors.has(t), `${role}/${s.id}: anchor ${t}`);
      if (s.guide) { assert.ok(ids.has(s.guide), `${role}/${s.id}: guide ${s.guide}`); assert.ok(LIB.byId.get(s.guide).meta.roles.includes(role), `${role}/${s.id}: guide ${s.guide} not visible to the role`); }
    }
  }
  const sales = JSON.stringify(M.tours.TOURS.sales_agent);
  for (const forbidden of ['Διεκπεραίωση', 'Αναφορές', 'Έσοδα', 'Διαχείριση', 'Audit']) assert.ok(!sales.includes(forbidden), `sales tour mentions «${forbidden}»`);
});

test('tour resolution drops steps whose element is not on screen, in order', () => {
  const steps = M.tours.TOURS.admin;
  const only = new Set(['page', 'topbar:search', 'topbar:account']);
  const r = M.tours.resolveSteps(steps, (a) => only.has(a));
  assert.deepEqual(r.map((x) => x.step.id), ['home', 'search', 'account', 'guide']);
  assert.equal(r.find((x) => x.step.id === 'guide').target, 'topbar:account');
  assert.deepEqual(M.tours.resolveSteps(steps, () => false), []);
});

/* ───────── progress ───────── */
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), m }; };

test('progress scope: the shared admin account is per WORKSTATION and never per person; a sales agent is per account', () => {
  const P = M.progress;
  assert.equal(P.scopeKey('admin', 'u-123'), 'workstation');
  assert.equal(P.scopeKey('admin', null), 'workstation');
  assert.equal(P.scopeKey('sales_agent', 'u-9'), 'user:u-9');
  assert.equal(P.scopeKey('sales_agent', null), 'workstation', 'no id: never pretend to know who');
  assert.ok(!/ποιος υπάλληλος τη συμπλήρωσε/.test(P.SCOPE_NOTE.user) && /δεν δείχνει ποιος υπάλληλος/.test(P.SCOPE_NOTE.workstation));
  const s = memory();
  P.save(s, P.scopeKey('admin', 'u-1'), P.tourComplete(P.emptyProgress()));
  assert.equal(P.load(s, P.scopeKey('admin', 'someone-else')).tour.status, 'completed', 'a different employee at the same workstation sees the same progress, by design');
  assert.equal(P.load(s, P.scopeKey('sales_agent', 'u-1')).tour.status, 'idle', 'a sales account is separate');
  assert.deepEqual([...s.m.keys()], ['atlas.guide.v1.workstation']);
});

test('progress: tour lifecycle (offer once, pause, resume, skip, replay) and version tracking', () => {
  const P = M.progress; let p = P.emptyProgress();
  assert.equal(P.shouldOfferTour(p), true);
  p = P.tourOffered(p); assert.equal(P.shouldOfferTour(p), false, 'offered once, not on every sign-in');
  p = P.tourStart(p); p = P.tourStep(p, 3); p = P.tourPause(p, 3);
  assert.equal(P.canResumeTour(p), true); assert.equal(p.tour.step, 3);
  p = P.tourSkip(p); assert.equal(P.shouldOfferTour(p), false); assert.equal(P.canResumeTour(p), false);
  p = P.tourStart(p); assert.equal(p.tour.step, 0, 'replay starts again');
  p = P.tourComplete(p); assert.equal(P.shouldOfferTour(p), false);
  const old = { ...p, tour: { ...p.tour, version: P.TOUR_VERSION - 1 } };
  assert.equal(P.shouldOfferTour(old), true, 'a new tour version is offered once more');
});

test('progress: damaged or hand-edited storage can only lose progress, never break the page', () => {
  const P = M.progress; const s = memory();
  for (const bad of ['not json', '{"tour":5}', '{"v":1,"tour":{"status":"hacked","step":-4},"viewed":7,"recent":"x","ratings":{"a":"sideways"}}', 'null', '[]']) {
    s.setItem(P.storageKey('workstation'), bad);
    const p = P.load(s, 'workstation');
    assert.equal(p.tour.status === 'idle' || p.tour.status === 'offered' || p.tour.status === 'completed' || p.tour.status === 'skipped' || p.tour.status === 'paused' || p.tour.status === 'in_progress', true);
    assert.ok(p.tour.step >= 0 && Array.isArray(p.recent) && typeof p.viewed === 'object' && Object.values(p.ratings).every((v) => v === 'up' || v === 'down'));
  }
  assert.doesNotThrow(() => P.load(null, 'workstation'));
  assert.doesNotThrow(() => P.save({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() {} }, 'workstation', P.emptyProgress()));
});

test('progress records only learning facts: no names, emails, customers or timings per person', () => {
  const P = M.progress; let p = P.emptyProgress();
  p = P.markViewed(p, 'case-roi'); p = P.markTopic(p, 'cases'); p = P.markIntro(p, 'leads'); p = P.dismissNews(p, 'learning-centre'); p = P.rate(p, 'case-roi', 'up');
  const s = JSON.stringify(p);
  assert.deepEqual(Object.keys(p).sort(), ['dismissedNews', 'introSeen', 'ratings', 'recent', 'topics', 'tour', 'v', 'viewed']);
  assert.ok(!/@|user|email|name/i.test(s.replace(/dismissedNews|introSeen/g, '')));
  assert.equal(P.unmarkTopic(p, 'cases').topics.cases, undefined);
});

/* ───────── maps ───────── */
test('process maps: the case map is generated from the application stages and transitions', () => {
  const cm = M.maps.caseMap();
  assert.deepEqual(cm.nodes.map((n) => n.id), M.roles.STAGES.map((s) => s.id));
  for (const n of cm.nodes) {
    assert.deepEqual(n.outcomes.map((o) => o.to), M.roles.STAGE_TRANSITIONS[n.id]);
    assert.equal(n.id === 'completed' ? n.kind === 'end' : true, true);
  }
  assert.equal(cm.status, 'verified');
});

test('every map is well-formed: unique node ids, outcomes lead to real nodes, routes and guides exist, warnings are never presented as rules', () => {
  for (const m of M.maps.MAPS()) {
    const nodeIds = new Set(m.nodes.map((n) => n.id)); assert.equal(nodeIds.size, m.nodes.length, `${m.id}: duplicate node`);
    assert.ok(m.verified.length > 20, `${m.id}: says what was verified`);
    for (const n of m.nodes) {
      for (const o of n.outcomes) if (o.to !== null) assert.ok(nodeIds.has(o.to), `${m.id}/${n.id} → ${o.to}`);
      if (n.route) assert.ok(PAGES.has(n.route), `${m.id}/${n.id}: route ${n.route}`);
      if (n.guide) assert.ok(ids.has(n.guide), `${m.id}/${n.id}: guide ${n.guide}`);
      assert.ok(!(n.warning && n.rule && n.warning === n.rule));
    }
  }
});

test('maps keep the honest distinction: missing documents only WARN', () => {
  const warned = M.maps.caseMap().nodes.filter((n) => n.warning);
  assert.ok(warned.length >= 3);
  for (const n of warned) assert.match(n.warning, /δεν σας εμποδίζει|προειδοποίηση/);
});

/* ───────── search and the assistant ───────── */
const docsFor = (role) => M.library.forRole(LIB, role);

test('search: Greek, accents, endings and synonyms find the right guide; role visibility is respected', () => {
  const S = M.search;
  const top = (q, role) => S.search(docsFor(role ?? 'admin'), q, role ?? 'admin')[0]?.doc.meta.id;
  assert.equal(top('πως φτιάχνω νέο lead'), 'lead-dimiourgia');
  assert.equal(top('ΠΑΡΑΔΟΣΗ στο back office'), 'paradosi-sto-back-office');
  assert.equal(top('ανεβασμα εγγραφου'), 'eggrafa');
  assert.equal(top('στάδια case'), 'case-roi');
  assert.equal(top('κωδικός'), S.search(docsFor('admin'), 'κωδικός', 'admin')[0].doc.meta.id);
  assert.deepEqual(S.search(docsFor('admin'), 'πως να το', 'admin'), [], 'only stop words: nothing');
  const hitIds = (role, q) => S.search(docsFor(role), q, role).map((h) => h.doc.meta.id);
  assert.ok(!hitIds('sales_agent', 'διεκπεραίωση ουρά back office').includes('diekperaiosi-back-office'), 'a sales agent never gets an admin-only guide');
  assert.ok(hitIds('admin', 'διεκπεραίωση ουρά').includes('diekperaiosi-back-office'));
});

test('assistant: answers only from guides; says planned, forbidden or no documentation; never invents', () => {
  const S = M.search;
  const a = S.answer(docsFor('sales_agent'), 'πως κάνω check in', 'sales_agent');
  assert.equal(a.kind, 'answer'); assert.equal(a.doc.meta.id, 'imera-mou-kai-check-in'); assert.ok(a.steps.length >= 3);
  assert.deepEqual(a.steps, a.doc.blocks.find((b) => b.t === 'steps').items.map((i) => i.map((x) => x.v).join('')), 'the steps are the guide\'s own, verbatim');
  const pw = S.answer(docsFor('admin'), 'πως αλλάζω τον κωδικό μου', 'admin');
  assert.equal(pw.kind, 'answer'); assert.equal(pw.doc.meta.id, 'allagi-kodikou'); assert.ok(pw.steps.length >= 4);
  assert.equal(S.answer(docsFor('admin'), 'ποιες λειτουργίες δεν είναι ακόμη διαθέσιμες', 'admin').kind, 'planned');
  const f = S.answer(LIB.docs, 'funnel', 'sales_agent');
  assert.equal(f.kind, 'forbidden'); assert.match(f.message, /δεν είναι διαθέσιμη στον λογαριασμό σας/);
  const none = S.answer(docsFor('admin'), 'ποια είναι η καλύτερη πίτσα', 'admin');
  assert.equal(none.kind, 'none'); assert.match(none.message, /Δεν υπάρχει τεκμηρίωση/);
  assert.ok(M.search.answer(docsFor('admin'), '', 'admin').kind === 'none');
});

/* ───────── troubleshooting ───────── */
test('decision trees are well-formed, finish, and point at real guides', () => {
  for (const t of M.troubleshoot.TREES) {
    assert.ok(t.nodes[t.start], `${t.id}: start`);
    const seen = new Set(); const stack = [t.start];
    while (stack.length) {
      const id = stack.pop(); if (seen.has(id)) continue; seen.add(id);
      const n = t.nodes[id]; assert.ok(n, `${t.id}: missing node ${id}`);
      assert.ok(n.result || (n.options && n.options.length >= 2) || t.checker, `${t.id}/${id}: a node must ask or answer`);
      for (const o of n.options ?? []) { assert.ok(t.nodes[o.next], `${t.id}/${id} → ${o.next}`); stack.push(o.next); }
      if (n.result?.guide) assert.ok(ids.has(n.result.guide), `${t.id}/${id}: guide ${n.result.guide}`);
    }
    assert.deepEqual(Object.keys(t.nodes).filter((k) => !seen.has(k)), [], `${t.id}: unreachable nodes`);
  }
  const pw = M.troubleshoot.TREES.find((t) => t.id === 'cannot-change-password');
  assert.equal(pw.status, 'partially-verified'); assert.ok(pw.nodes.msg.options.length >= 4);
});

test('stage-move checker answers from the real transition table and the real permissions', () => {
  const C = M.troubleshoot; const T = M.roles.STAGE_TRANSITIONS;
  for (const from of Object.keys(T)) for (const to of Object.keys(T)) {
    if (from === to) continue;
    const r = C.checkStageMove('sales_agent', from, to);
    assert.equal(r.allowed, T[from].includes(to), `${from}→${to}`);
  }
  assert.match(C.checkStageMove('sales_agent', 'contacted', 'activation').text, /Επιτρέπονται: .*Προσφορά/);
  assert.equal(C.checkStageMove('sales_agent', 'completed', 'new').allowed, false);
  assert.match(C.checkStageMove('admin', 'new', 'completed').text, /μόνο όταν έχει ενεργοποιηθεί στο σύστημα/, 'the admin override depends on staged SQL and says so');
  assert.doesNotMatch(C.checkStageMove('sales_agent', 'new', 'completed').text, /Back Office\)/, 'a sales agent is not told about an admin-only control');
});

test('page-access checker agrees with canOpenPage for both roles and every page', () => {
  for (const role of ['admin', 'sales_agent']) for (const page of M.troubleshoot.CHECKABLE_PAGES) {
    assert.equal(M.troubleshoot.checkPageAccess(role, page).allowed, M.roles.canOpenPage(page, role), `${role}/${page}`);
  }
  assert.equal(M.troubleshoot.checkPageAccess('sales_agent', 'reports').allowed, false);
  assert.equal(M.troubleshoot.checkPageAccess('admin', 'reports').allowed, true);
  assert.ok(M.troubleshoot.CHECKABLE_PAGES.every((p) => PAGES.has(p)));
});

test('the 25 MB upload limit in the guides is the limit in the code', () => {
  const mb = Math.round(readFileSync(path.join(SRC, 'lib', 'upload-files.ts'), 'utf8').match(/MAX_UPLOAD_BYTES = (\d+) \* 1024 \* 1024/)[1]);
  for (const id of ['eggrafa', 'syxnes-erotiseis']) assert.match(LIB.byId.get(id).text, new RegExp(`${mb} MB`), id);
  assert.match(M.helps.HELP_TIPS.find((t) => t.id === 'doc-type').text, new RegExp(`${mb} MB`));
});

/* ───────── contextual help and news ───────── */
test('contextual help: page intros and tips point at real pages and guides the role may open', () => {
  for (const i of M.helps.PAGE_INTROS) { assert.ok(PAGES.has(i.page), i.page); assert.ok(ids.has(i.guide), i.guide); }
  for (const t of M.helps.HELP_TIPS) {
    assert.ok(ids.has(t.guide), t.guide);
    for (const r of t.roles) assert.ok(LIB.byId.get(t.guide).meta.roles.includes(r), `${t.id}: guide not visible to ${r}`);
  }
  assert.deepEqual(M.helps.tipsFor('sales_agent').map((t) => t.id).filter((i) => i === 'agent-visibility'), [], 'a sales agent gets no tip about an admin setting');
  assert.ok(M.helps.introFor('home') && M.helps.introFor('nonexistent') === null);
});

test("what's new: planned things are labelled planned, links are real, dismissal hides", () => {
  for (const n of M.whatsnew.NEWS) { if (n.guide) assert.ok(ids.has(n.guide)); assert.match(n.date, /^\d{4}-\d{2}-\d{2}$/); }
  assert.equal(M.whatsnew.NEWS.find((n) => n.id === 'password-change').status, 'available');
  for (const n of M.whatsnew.NEWS) assert.ok(n.status === 'available' || n.status === 'planned');
  assert.equal(M.whatsnew.newsFor('admin', ['learning-centre']).some((n) => n.id === 'learning-centre'), false);
});

/* ───────── practice mode ───────── */
test('PRACTICE MODE is isolated: the module imports no client, no API, no storage and no network', () => {
  const src = readFileSync(path.join(SRC, 'guide', 'practice.ts'), 'utf8');
  const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
  assert.deepEqual([...new Set(imports)].sort(), ['./troubleshoot', '@/lib/documents', '@/lib/roles', '@/lib/upload-files'].sort());
  assert.ok(!/fetch\(|XMLHttpRequest|localStorage|sessionStorage|supabase|navigator\.|WebSocket|sendBeacon|indexedDB/.test(src));
  const t = readFileSync(path.join(SRC, 'guide', 'troubleshoot.ts'), 'utf8');
  assert.ok(!/fetch\(|localStorage|supabase|@\/lib\/api/.test(t), 'the checker practice relies on is pure too');
  for (const p of ['@/lib/documents', '@/lib/upload-files', '@/lib/roles']) {
    const f = path.join(SRC, `${p.slice(2)}.ts`); const s = readFileSync(f, 'utf8');
    assert.ok(!/from '[^']*(supabase|\/api)'/.test(s), `${p} reaches the API`);
  }
});

test('practice: at runtime it makes no network call and writes no storage, whatever the learner does', () => {
  let touched = 0;
  const realFetch = globalThis.fetch; globalThis.fetch = () => { touched++; throw new Error('network'); };
  const real = globalThis.localStorage; Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { touched++; return null; }, setItem() { touched++; }, removeItem() { touched++; } } });
  try {
    const P = M.practice; let s = P.initialPractice();
    for (const a of [{ t: 'create_lead', name: P.SYNTHETIC.names[0] }, { t: 'contact_lead' }, { t: 'convert_lead' }, { t: 'move', to: 'contacted' }, { t: 'move', to: 'activation' }, { t: 'upload', docType: 'bill_electricity', mb: 2 }, { t: 'upload', docType: 'bill_electricity', mb: 30 }, { t: 'upload', docType: '', mb: 1 }]) {
      s = P.actLogged(s, a, 'sales_agent').state;
    }
    assert.equal(touched, 0, 'practice touched network or storage');
  } finally { globalThis.fetch = realFetch; Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: real }); }
});

test('practice follows the application rules and the exercises can be completed', () => {
  const P = M.practice; const role = 'sales_agent';
  let r = P.act(P.initialPractice(), { t: 'create_lead', name: '  ' }, role); assert.equal(r.ok, false); assert.match(r.message, /υποχρεωτικό/);
  r = P.act(P.initialPractice(), { t: 'convert_lead' }, role); assert.equal(r.ok, false);
  let s = P.act(P.initialPractice(), { t: 'create_lead', name: P.SYNTHETIC.names[0] }, role).state;
  s = P.act(s, { t: 'contact_lead' }, role).state;
  s = P.act(s, { t: 'convert_lead' }, role).state; assert.equal(s.kase.stage, 'new');
  assert.equal(P.act(s, { t: 'move', to: 'activation' }, role).ok, false, 'new → activation is not allowed');
  const big = P.act(s, { t: 'upload', docType: 'bill_electricity', mb: 30 }, role); assert.equal(big.ok, false); assert.match(big.message, /25 MB/);
  assert.equal(P.act(s, { t: 'upload', docType: 'made_up_type', mb: 1 }, role).ok, false);
  // the three exercises are finishable by following only allowed actions
  const ex = Object.fromEntries(P.EXERCISES.map((e) => [e.id, e]));
  s = P.actLogged(s, { t: 'move', to: 'activation' }, role).state; // a refused attempt, remembered
  s = P.act(s, { t: 'move', to: 'contacted' }, role).state; s = P.act(s, { t: 'move', to: 'offer' }, role).state; s = P.act(s, { t: 'move', to: 'signed' }, role).state;
  s = P.act(s, { t: 'upload', docType: 'bill_electricity', mb: 2 }, role).state; s = P.actLogged(s, { t: 'upload', docType: 'bill_electricity', mb: 30 }, role).state;
  for (const e of P.EXERCISES) assert.equal(P.progressOf(e, s).done, e.tasks.length, e.id);
  assert.equal(P.progressOf(ex['first-lead'], P.initialPractice()).next.text.startsWith('Δημιουργήστε'), true);
  for (const e of P.EXERCISES) assert.ok(ids.has(e.guide));
});

test('practice data is obviously fake', () => {
  const S = M.practice.SYNTHETIC;
  assert.match(S.banner, /ΔΟΚΙΜΑΣΤΙΚΗ/); assert.match(S.email, /@example\.invalid$/); assert.match(S.phone, /000 0000/);
  assert.ok(S.files.some((f) => f.mb > 25), 'one synthetic file is over the limit, to teach the limit');
});

/* ───────── wiring into the app ───────── */
test('the guide is a real page of the application, in the navigation of both roles, and reachable from a URL', () => {
  assert.equal(M.roles.PAGE_TITLES.guide, 'Οδηγός ATLAS');
  for (const role of ['admin', 'sales_agent']) assert.ok(M.roles.navForRole(role).some((s) => s.children.some((c) => c.page === 'guide')), role);
  const v = M.navurl.parseView('#/dashboard?view=guide&f.doc=case-roi&f.tab=maps');
  assert.deepEqual(v, { page: 'guide', caseId: null, filters: { doc: 'case-roi', tab: 'maps' } });
  assert.equal(M.navurl.buildHash(v), '#/dashboard?view=guide&f.doc=case-roi&f.tab=maps');
});

/* ───────── feedback (report a problem): nothing is sent, and a note that looks sensitive can not be copied ───────── */
test('report-a-problem refuses emails, phone numbers, ID-like numbers, keys and passwords, and accepts a plain description', () => {
  const F = M.feedback;
  for (const bad of ['γράψτε στο maria@gmail.com', 'τηλέφωνο 6912345678', 'ΑΦΜ 123456789', `το κλειδί είναι ${['sk', 'live', 'x'.repeat(30)].join('_')}`, 'κωδικός: hunter2', 'IBAN GR16 0110 1250']) {
    assert.ok(F.sensitive(bad).length > 0, bad); assert.equal(F.canCopy(bad + ' περισσότερα λόγια'), false, bad);
  }
  const good = 'Στον οδηγό Έγγραφα το όριο μεγέθους φαίνεται παλιό.';
  assert.deepEqual(F.sensitive(good), []); assert.equal(F.canCopy(good), true);
  assert.equal(F.canCopy('λίγο'), false, 'too short');
  const r = F.buildReport({ kind: 'wrong', guideId: 'eggrafa', role: 'admin', version: '1.0', note: good });
  assert.match(r, /Admin \/ Back Office/); assert.match(r, /eggrafa/); assert.ok(!/@|user|id:/i.test(r.replace('Back Office', '')));
});

test('shared labels cover every status and level the documents use', () => {
  for (const d of LIB.docs) { assert.ok(M.labels.STATUS_TEXT[d.meta.status], d.meta.id); assert.ok(M.labels.LEVEL_TEXT[d.meta.level], d.meta.id); }
});

test('the learning code never sends learning data anywhere: no fetch, XHR, beacon, analytics or storage outside progress.ts', () => {
  const comps = path.join(SRC, 'components', 'guide');
  const sources = [...readdirSync(comps).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => [f, readFileSync(path.join(comps, f), 'utf8')]), ...GUIDE_TS];
  for (const [f, raw] of sources) {
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(!/fetch\(|XMLHttpRequest|sendBeacon|WebSocket|supabase|@vercel\/analytics|posthog|gtag|mixpanel/i.test(src), `${f}: network or analytics`);
    if (f !== 'useGuideProgress.ts') assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(src), `${f}: storage outside the progress hook`);
  }
});
