import { readFileSync, readdirSync } from 'node:fs';

const envLine = readFileSync('.env.local', 'utf8').split(/\r?\n/).find(l => l.startsWith('VITE_CARTO_API_KEY='));
const key = envLine ? envLine.slice('VITE_CARTO_API_KEY='.length).trim() : '';

const all = readdirSync('dist/assets').filter(f => f.endsWith('.js')).map(f => readFileSync('dist/assets/' + f, 'utf8')).join('\n');
const chunks = readdirSync('dist/assets').filter(f => f.endsWith('.js'));

let bundleWithKey = null;
for (const f of chunks) if (readFileSync('dist/assets/' + f, 'utf8').includes(key)) bundleWithKey = f;

console.log('envKeyLen', key.length);
console.log('keyedTemplatePresent', all.includes('voyager/{z}/{x}/{y}.png?key='));
console.log('keyInlinedChunk', bundleWithKey);
console.log('barePngTemplates', (all.match(/voyager\/\{z\}\/\{x\}\/\{y\}\.png"/g) || []).length,
  (all.match(/voyager\/\{z\}\/\{x\}\/\{y\}\.png\?key=/g) || []).length);
console.log('subdomainsConcrete', ['a.', 'b.', 'c.', 'd.'].filter(h => all.includes(h + 'basemaps.cartocdn.com')).join(','));