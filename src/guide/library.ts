/* The guide library: parses every document and checks it as a whole. PURE (the files are passed in), so the app and the tests build the same library from the
   same files. A document that does not parse is reported, never rendered half-way. */
import { parseGuide, quotedLabels } from './markdown';
import type { GuideDoc, GuideRole } from './markdown';

export interface Library { docs: GuideDoc[]; byId: Map<string, GuideDoc>; categories: string[]; problems: string[] }

/** `files` maps a path to its Markdown text. README.md and files that start with `_` are notes for maintainers, not guides. */
export function buildLibrary(files: Record<string, string>): Library {
  const docs: GuideDoc[] = []; const problems: string[] = [];
  for (const [path, src] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const name = path.split(/[\\/]/).pop() ?? path;
    if (/^readme\.md$/i.test(name) || name.startsWith('_')) continue;
    try {
      const d = parseGuide(src);
      if (`${d.meta.id}.md` !== name) problems.push(`${name}: το αρχείο πρέπει να λέγεται ${d.meta.id}.md`);
      docs.push(d);
    } catch (e) { problems.push(`${name}: ${(e as Error).message}`); }
  }
  const byId = new Map<string, GuideDoc>();
  for (const d of docs) { if (byId.has(d.meta.id)) problems.push(`διπλό id: ${d.meta.id}`); byId.set(d.meta.id, d); }
  const categories = [...new Set(docs.map((d) => d.meta.category))];
  return { docs, byId, categories, problems };
}

export const forRole = (lib: Library, role: GuideRole): GuideDoc[] => lib.docs.filter((d) => d.meta.roles.includes(role));

/** A document is outdated when its version is older than the one the application currently ships. Compared as numbers: «1.10» is newer than «1.9». */
export function isOutdated(version: string, current: string): boolean {
  const a = version.split('.').map(Number); const b = current.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) { const x = a[i] ?? 0; const y = b[i] ?? 0; if (x !== y) return x < y; }
  return false;
}
export const GUIDE_VERSION = '1.0';

/** Every id a document points at (related list and guide: links) that does not exist. */
export function brokenLinks(lib: Library): string[] {
  const out: string[] = [];
  for (const d of lib.docs) {
    for (const r of d.meta.related) if (!lib.byId.has(r)) out.push(`${d.meta.id} → related ${r}`);
    const walk = (inl: { t: string; id?: string }[]) => inl.forEach((x) => { if (x.t === 'guide' && x.id && !lib.byId.has(x.id)) out.push(`${d.meta.id} → ${x.id}`); });
    for (const b of d.blocks) {
      if (b.t === 'p' || b.t === 'callout') walk(b.inline);
      else if (b.t === 'ul' || b.t === 'steps') b.items.forEach(walk);
      else if (b.t === 'table') b.rows.forEach((r) => r.forEach(walk));
    }
  }
  return out;
}
export { quotedLabels };
