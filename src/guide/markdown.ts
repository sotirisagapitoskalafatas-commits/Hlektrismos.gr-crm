/* Learning Centre documents: a small, strict Markdown subset with front matter. PURE (no React, no Vite), so tests read the same files from disk
   that the app bundles. The authors are the maintainers of docs/atlas-guide, so the subset is deliberately small and fails loudly in tests.

   Front matter (all keys required; see validateMeta):
     id, title, category, roles: [admin, sales_agent], level: beginner|intermediate|advanced, status: verified|partially-verified|planned,
     updated: YYYY-MM-DD, version, area (the feature area that owns it), route (a page key or none), related: [ids], keywords: [...], summary
   Body:   ## Heading · ### Subheading · paragraphs · "- " lists · "1. " numbered steps · "| a | b |" tables · "> [!ΠΡΟΣΟΧΗ] text" callouts
   Inline: **bold** · `code` · [text](guide:ID) · [text](route:PAGE) · «UI label»   (a «label» must exist verbatim in the application source: a test checks) */

export type GuideRole = 'admin' | 'sales_agent';
export type GuideLevel = 'beginner' | 'intermediate' | 'advanced';
export type GuideStatus = 'verified' | 'partially-verified' | 'planned';

export interface GuideMeta {
  id: string; title: string; category: string; roles: GuideRole[]; level: GuideLevel; status: GuideStatus;
  updated: string; version: string; area: string; route: string | null; related: string[]; keywords: string[]; summary: string;
}

export type Inline =
  | { t: 'text'; v: string } | { t: 'b'; v: string } | { t: 'code'; v: string } | { t: 'label'; v: string }
  | { t: 'guide'; v: string; id: string } | { t: 'route'; v: string; page: string };

export type Block =
  | { t: 'h2'; id: string; text: string } | { t: 'h3'; text: string }
  | { t: 'p'; inline: Inline[] }
  | { t: 'ul'; items: Inline[][] } | { t: 'steps'; items: Inline[][] }
  | { t: 'table'; head: string[]; rows: Inline[][][] }
  | { t: 'callout'; tone: 'warn' | 'tip' | 'info'; inline: Inline[] }
  /** A table or diagram the page builds from the live code (permissions, navigation, stages): never copied into prose, so it can not drift. */
  | { t: 'embed'; name: string };

export interface GuideDoc { meta: GuideMeta; blocks: Block[]; text: string }

const LEVELS: GuideLevel[] = ['beginner', 'intermediate', 'advanced'];
const STATUSES: GuideStatus[] = ['verified', 'partially-verified', 'planned'];

const list = (v: string): string[] => {
  const m = /^\[(.*)\]$/.exec(v.trim());
  return m ? m[1].split(',').map((x) => x.trim()).filter(Boolean) : [];
};

/** Splits `---` front matter from the body. Throws on a malformed document: a broken guide must fail a test, never render half-way. */
export function splitFrontMatter(src: string): { meta: Record<string, string>; body: string } {
  const s = src.replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(s);
  if (!m) throw new Error('missing front matter');
  const meta: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim()) continue;
    const i = line.indexOf(':');
    if (i < 1) throw new Error(`bad front matter line: ${line}`);
    meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

export function toMeta(raw: Record<string, string>): GuideMeta {
  const get = (k: string) => { const v = raw[k]; if (v === undefined || v === '') throw new Error(`front matter «${k}» is required`); return v; };
  const level = get('level') as GuideLevel; const status = get('status') as GuideStatus;
  if (!LEVELS.includes(level)) throw new Error(`level «${level}»`);
  if (!STATUSES.includes(status)) throw new Error(`status «${status}»`);
  const roles = list(get('roles')) as GuideRole[];
  if (!roles.length || roles.some((r) => r !== 'admin' && r !== 'sales_agent')) throw new Error(`roles «${raw.roles}»: exactly the two real roles`);
  const route = raw.route && raw.route !== 'none' ? raw.route : null;
  return { id: get('id'), title: get('title'), category: get('category'), roles, level, status, updated: get('updated'), version: get('version'), area: get('area'), route,
    related: list(raw.related ?? '[]'), keywords: list(raw.keywords ?? '[]'), summary: get('summary') };
}

/** `**bold**`, `` `code` ``, `[text](guide:id)`, `[text](route:page)`, «label». Everything else is text. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((guide|route):([A-Za-z0-9_-]+)\)|«([^»]+)»/g;
  let last = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'b', v: m[1] });
    else if (m[2] !== undefined) out.push({ t: 'code', v: m[2] });
    else if (m[3] !== undefined) out.push(m[4] === 'guide' ? { t: 'guide', v: m[3], id: m[5] } : { t: 'route', v: m[3], page: m[5] });
    else out.push({ t: 'label', v: m[6] });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9α-ω]+/g, '-').replace(/^-|-$/g, '') || 'section';
const CALLOUT: Record<string, 'warn' | 'tip' | 'info'> = { 'ΠΡΟΣΟΧΗ': 'warn', 'ΣΥΜΒΟΥΛΗ': 'tip', 'ΣΗΜΕΙΩΣΗ': 'info' };

export function parseBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = []; let i = 0; const used = new Set<string>();
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m: RegExpExecArray | null;
    if ((m = /^## (.+)$/.exec(line))) { let id = slug(m[1]); let n = 2; while (used.has(id)) id = `${slug(m[1])}-${n++}`; used.add(id); blocks.push({ t: 'h2', id, text: m[1].trim() }); i++; continue; }
    if ((m = /^@embed ([a-z-]+)\s*$/.exec(line))) { blocks.push({ t: 'embed', name: m[1] }); i++; continue; }
    if ((m = /^### (.+)$/.exec(line))) { blocks.push({ t: 'h3', text: m[1].trim() }); i++; continue; }
    if (/^\|/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r: string) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]); const body2 = rows.slice(2).map(cells);
      blocks.push({ t: 'table', head, rows: body2.map((r) => r.map(parseInline)) }); continue;
    }
    if (/^> /.test(line)) {
      let text = ''; while (i < lines.length && /^> ?/.test(lines[i])) text += `${lines[i++].replace(/^> ?/, '')} `;
      const c = /^\[!([Α-Ω]+)\]\s*(.*)$/.exec(text.trim());
      blocks.push({ t: 'callout', tone: c ? CALLOUT[c[1]] ?? 'info' : 'info', inline: parseInline(c ? c[2] : text.trim()) }); continue;
    }
    if (/^- /.test(line)) { const items: Inline[][] = []; while (i < lines.length && /^- /.test(lines[i])) items.push(parseInline(lines[i++].slice(2))); blocks.push({ t: 'ul', items }); continue; }
    if (/^\d+\. /.test(line)) { const items: Inline[][] = []; while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(parseInline(lines[i++].replace(/^\d+\. /, ''))); blocks.push({ t: 'steps', items }); continue; }
    let text = ''; while (i < lines.length && lines[i].trim() && !/^(#{2,3} |\||> |- |\d+\. |@embed )/.test(lines[i])) text += `${lines[i++].trim()} `;
    blocks.push({ t: 'p', inline: parseInline(text.trim()) });
  }
  return blocks;
}

const plain = (inl: Inline[]) => inl.map((x) => x.v).join('');
export function blocksText(blocks: Block[]): string {
  return blocks.map((b) => b.t === 'h2' || b.t === 'h3' ? b.text : b.t === 'p' || b.t === 'callout' ? plain(b.inline)
    : b.t === 'ul' || b.t === 'steps' ? b.items.map(plain).join(' ') : b.t === 'table' ? [...b.head, ...b.rows.flat().map(plain)].join(' ') : '').join('\n');
}

export function parseGuide(src: string): GuideDoc {
  const { meta, body } = splitFrontMatter(src);
  const blocks = parseBlocks(body);
  return { meta: toMeta(meta), blocks, text: blocksText(blocks) };
}

/** The UI labels a guide quotes: every «…». A test requires each to exist verbatim in the application source. */
export function quotedLabels(doc: GuideDoc): string[] {
  const out: string[] = [];
  const walk = (inl: Inline[]) => inl.forEach((x) => { if (x.t === 'label') out.push(x.v); });
  for (const b of doc.blocks) {
    if (b.t === 'p' || b.t === 'callout') walk(b.inline);
    else if (b.t === 'ul' || b.t === 'steps') b.items.forEach(walk);
    else if (b.t === 'table') b.rows.forEach((r) => r.forEach(walk));
  }
  return out;
}
