// Chatbot AI transparency: the first message says it is an AI, and direct questions
// («Είσαι AI ή chatbot;») always get a truthful answer, on the client and in the
// `chat` edge function prompt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// Bundle the real hook with React; replace ./supabase with a stub that records calls.
const out = await build({
  stdin: {
    contents: `import { createElement } from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { useJarvisChat } from '@/lib/jarvis-chat';
      export * as identity from '../supabase/functions/_shared/ai-identity';
      export function mountChat() {
        let api;
        const Probe = () => { api = useJarvisChat(); return null; };
        renderToStaticMarkup(createElement(Probe));
        return api;
      }`,
    resolveDir: SRC, loader: 'tsx',
  },
  bundle: true, write: false, format: 'cjs', platform: 'node', logLevel: 'silent', jsx: 'automatic',
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
  alias: { '@': SRC.replace(/[\\/]$/, '') },
  plugins: [{
    name: 'stub-supabase',
    setup(b) {
      b.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'supabase-stub', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: 'export const supabase = { functions: { invoke: (...a) => globalThis.__invoke(...a) } };', loader: 'js',
      }));
    },
  }],
});
const file = join(mkdtempSync(join(tmpdir(), 'ai-identity-')), 'chat.cjs');
writeFileSync(file, out.outputFiles[0].text);
const M = createRequire(import.meta.url)(file);
const { AI_GREETING, AI_IDENTITY_REPLY, AI_IDENTITY_RULES, ASSISTANT_NAME, isIdentityQuestion } = M.identity;

let calls = [];
globalThis.__invoke = async (name, opts) => { calls.push({ name, opts }); return { data: { reply: 'Απάντηση του μοντέλου.' }, error: null }; };

const DIRECT_QUESTIONS = [
  'Είσαι AI ή chatbot;', 'είσαι ai;', 'ΕΙΣΑΙ ΡΟΜΠΟΤ;', 'Εισαι bot?', 'Είσαι άνθρωπος;', 'Είσαι πραγματικός άνθρωπος;',
  'είσαι ζωντανός υπάλληλος;', 'Μήπως είσαι τεχνητή νοημοσύνη;', 'Μιλάω με bot;', 'μιλάμε με άνθρωπο ή με μηχανή;',
  'Are you a bot?', 'are you human', 'r u AI?',
];
const NOT_IDENTITY = [
  'Πόσο κοστίζει το ρεύμα;', 'Είσαι ανοιχτά το Σάββατο;', 'Θέλω φωτοβολταϊκά για το σπίτι', 'Μιλάω με τον πάροχό μου αύριο',
  'Είσαι σίγουρος για την τιμή;', 'Πληρώνω 150€ τον μήνα στη ΔΕΗ',
];

test('the first chat message discloses that the assistant is an AI and keeps its name', () => {
  const chat = M.mountChat();
  assert.equal(chat.messages.length, 1);
  assert.equal(chat.messages[0].from, 'jarvis');
  assert.equal(chat.messages[0].text, AI_GREETING);
  assert.match(AI_GREETING, /τεχνητής νοημοσύνης \(AI\)/);
  assert.ok(AI_GREETING.includes(ASSISTANT_NAME), 'name «Αλέξης» kept');
});

test('direct identity questions are recognised (accents and case ignored)', () => {
  for (const q of DIRECT_QUESTIONS) assert.equal(isIdentityQuestion(q), true, q);
  for (const q of NOT_IDENTITY) assert.equal(isIdentityQuestion(q), false, q);
});

test('«Είσαι AI ή chatbot;» gets the truthful fixed answer in the chat', async () => {
  for (const q of ['Είσαι AI ή chatbot;', 'Είσαι άνθρωπος;', 'Are you a bot?']) {
    calls = [];
    const chat = M.mountChat();
    const reply = await chat.send(q);
    assert.equal(reply, AI_IDENTITY_REPLY, q);
    assert.equal(calls.length, 0, 'answered without relying on the model');
  }
  assert.match(AI_IDENTITY_REPLY, /^Ναι, είμαι ο Αλέξης, ψηφιακός βοηθός τεχνητής νοημοσύνης \(AI\)/);
  assert.match(AI_IDENTITY_REPLY, /όχι άνθρωπος/);
});

test('other questions still go to the chat service unchanged', async () => {
  calls = [];
  const chat = M.mountChat();
  const reply = await chat.send('Πόσο κοστίζει το ρεύμα;');
  assert.equal(reply, 'Απάντηση του μοντέλου.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'chat');
  assert.deepEqual(Object.keys(calls[0].opts.body).sort(), ['messages', 'visitorInfo'], 'payload shape unchanged');
});

test('the model prompt requires honesty and no longer tells it to deny being an AI', () => {
  const src = readFileSync(join(ROOT, 'supabase/functions/chat/index.ts'), 'utf8');
  for (const banned of ['ΠΟΤΕ μην πεις ότι είσαι AI', 'ζωντανός υπάλληλος υποστήριξης', 'Μιλάς σαν πραγματικός άνθρωπος, όχι ρομπότ', 'Αν ρωτήσουν αν είσαι bot, απάντησε "Είμαι ο Αλέξης, σύμβουλος ενέργειας']) {
    assert.equal(src.includes(banned), false, `still contains: ${banned}`);
  }
  assert.match(src, /import \{[^}]*AI_IDENTITY_RULES[^}]*\} from "\.\.\/_shared\/ai-identity\.ts"/);
  assert.match(src, /\$\{AI_IDENTITY_RULES\}/, 'rules are in the system prompt');
  assert.match(src, /isIdentityQuestion\(lastUser\.content\)/, 'server answers identity questions directly too');
  assert.match(AI_IDENTITY_RULES, /Δεν είσαι άνθρωπος/);
  assert.match(AI_IDENTITY_RULES, /Μην ισχυριστείς ποτέ ότι είσαι άνθρωπος/);
  assert.ok(AI_IDENTITY_RULES.includes(AI_IDENTITY_REPLY));
});
