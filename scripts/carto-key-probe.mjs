import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const envLine = readFileSync('.env.local', 'utf8').split(/\r?\n/).find(l => l.startsWith('VITE_CARTO_API_KEY='));
const key = envLine ? envLine.slice('VITE_CARTO_API_KEY='.length).trim() : '';
if (!key) throw new Error('VITE_CARTO_API_KEY not in .env.local');

const sleep = ms => new Promise(r => setTimeout(r, ms));

function pngIs256(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return 'bad-sig';
  if (buf.toString('latin1', 12, 16) !== 'IHDR') return 'no-ihdr';
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

async function probe(tile, label) {
  for (let i = 0; i < 8; i++) {
    try {
      const r = await fetch(tile, { headers: { 'user-agent': 'jekkcode-carto-probe/1.0' } });
      const buf = Buffer.from(await r.arrayBuffer());
      return {
        label, status: r.status, type: r.headers.get('content-type'),
        bytes: buf.length, dims: pngIs256(buf),
        md5: createHash('md5').update(buf).digest('hex'),
      };
    } catch (e) { if (i === 7) return { label, status: -1, err: String(e.message).slice(0, 60) }; await sleep(3000 * (i + 1)); }
  }
}

const tiles = [
  'https://a.basemaps.cartocdn.com/rastertiles/voyager/11/1160/789.png',
  'https://b.basemaps.cartocdn.com/rastertiles/voyager/7/63/42.png',
  { label: null }, // replaced below
];

async function run() {
  const anon = await probe(tiles[0], 'anon-11_1160_789');
  const keyed = await probe(`https://a.basemaps.cartocdn.com/rastertiles/voyager/11/1160/789.png?key=${key}`, 'keyed-11_1160_789');
  const anon2 = await probe(tiles[1], 'anon-7_63_42');
  const keyed2 = await probe(`https://b.basemaps.cartocdn.com/rastertiles/voyager/7/63/42.png?key=${key}`, 'keyed-7_63_42');

  for (const r of [anon, keyed, anon2, keyed2]) {
    console.log(r.label,
      r.status,
      r.type ?? '',
      r.dims ?? r.err ?? '',
      `bytes=${r.bytes ?? '?'}`,
      `md5=${r.md5 ? r.md5.slice(0, 12) : '?'}`);
  }

  const ok = r =>
    r.status === 200 &&
    !r.err &&
    String(r.type).includes('image/png') &&
    String(r.dims).startsWith('256x') &&
    Boolean(r.md5);

  const ks = ok(keyed) && ok(keyed2);
  const diff = keyed.md5 && anon.md5 && keyed.md5 !== anon.md5;
  const diff2 = keyed2.md5 && anon2.md5 && keyed2.md5 !== anon2.md5;
  const noAuthErr = [keyed, keyed2].every(r => ![400, 401, 402, 403, 429].includes(r.status));

  console.log('KEYED_TILES_200_VALID', ks);
  console.log('KEYED_DIFFERS_FROM_ANON (watermark removed)', diff && diff2, { d1: diff, d2: diff2 });
  console.log('NO_AUTH_ERROR_STATUS', noAuthErr);
}

run().catch(e => { console.error('PROBE ERROR', e); process.exit(2); });