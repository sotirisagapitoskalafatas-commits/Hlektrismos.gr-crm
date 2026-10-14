/* Atlas AI for the CRM (staff assistant) — v1 is a deterministic, grounded query-and-navigate helper.
   • Answers ONLY from records the signed-in employee has already loaded (the same RLS-scoped calls the screens use).
   • Makes NO external AI call and sends NO customer data anywhere. (An LLM-backed mode needs a staff-authorised,
     policy-gated backend function first — see docs/product/ATLAS_UX_BLUEPRINT.md §8.)
   • Navigation suggestions are limited to pages in the role's navigation. That is a convenience, NOT authorization:
     the database and edge functions remain the security boundary.
   • It never performs a write. Anything it proposes is an action the user clicks themselves.
   It is intentionally unlike the public landing-page chatbot (energy advice for visitors). */

import type { HomeSummary, WorkItem } from './work';

export type AssistantRole = 'admin' | 'manager' | 'inside_sales' | 'field_sales' | 'back_office';

export type AssistantAction =
  | { type: 'case'; id: string }
  | { type: 'lead'; id: string }
  | { type: 'customer'; id: string }
  | { type: 'page'; page: string; filters?: Record<string, string> };

export interface AssistantResult { label: string; sub?: string; action: AssistantAction }
export interface AssistantReply { text: string; results?: AssistantResult[]; suggestions?: string[]; /** false when the request was not recognised */ understood?: boolean }

export interface AssistantCtx {
  role: AssistantRole;
  uid: string;
  now: number;
  /** Pages in this role's navigation (display convenience only). */
  allowedPages: string[];
  items: WorkItem[];
  summary: HomeSummary | null;
  cases: { id: string; case_no: string; title: string; current_stage: string; customer: { full_name: string } | null }[];
  leads: { id: string; full_name: string | null; client_name: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null; status: string | null }[];
  customers: { id: string; full_name: string; phone: string | null; email: string | null; city: string | null }[];
}

/** Lower-case, strip Greek tonos/diaeresis, final sigma → sigma. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/\s+/g, ' ').trim();
}

const PAGES: { page: string; label: string; re: RegExp }[] = [
  { page: 'home', label: 'Αρχική', re: /(αρχικη|home|dashboard|πινακα)/ },
  { page: 'mywork', label: 'Η εργασία μου', re: /(εργασια μου|my ?work)/ },
  { page: 'followups', label: 'Follow-ups', re: /(follow|παρακολουθηση|υπενθυμισ)/ },
  { page: 'leads', label: 'Leads', re: /(leads?|υποψηφι)/ },
  { page: 'customers', label: 'Πελάτες', re: /(πελατ)/ },
  { page: 'cases', label: 'Cases', re: /(cases?|υποθεσ)/ },
  { page: 'prospecting', label: 'B2B Prospecting', re: /(prospect|b2b)/ },
  { page: 'providers', label: 'Πάροχοι & Προγράμματα', re: /(παροχ|προγραμματα)/ },
  { page: 'myday', label: 'Ημέρα μου', re: /(ημερα μου|my ?day)/ },
  { page: 'map', label: 'Χάρτης', re: /(χαρτη|map)/ },
  { page: 'backoffice', label: 'Λειτουργίες', re: /(λειτουργι|back ?office)/ },
  { page: 'reports', label: 'Αναφορές', re: /(αναφορ|report)/ },
  { page: 'revenue', label: 'Έσοδα', re: /(εσοδα|revenue)/ },
  { page: 'automations', label: 'Αυτοματισμοί', re: /(αυτοματισμ)/ },
  { page: 'aiworkforce', label: 'AI Εργατικό Δυναμικό', re: /(ai εργατικο|workforce)/ },
  { page: 'preferences', label: 'Προτιμήσεις', re: /(προτιμησ)/ },
  { page: 'admin', label: 'Διαχείριση', re: /(διαχειρισ|ρυθμισ)/ },
];

const leadName = (l: AssistantCtx['leads'][number]) =>
  (l.full_name || l.client_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || '').trim() || 'Χωρίς όνομα';

export function suggestionsFor(role: AssistantRole): string[] {
  const base = ['Τι έχω σήμερα;', 'Εκπρόθεσμα follow-ups', 'Βρες πελάτη…'];
  if (role === 'admin' || role === 'manager') return [...base, 'Σύνοψη ομάδας', 'Άνοιξε Cases'];
  if (role === 'field_sales') return [...base, 'Άνοιξε Ημέρα μου'];
  if (role === 'back_office') return [...base, 'Άνοιξε Λειτουργίες'];
  return [...base, 'Leads για επικοινωνία', 'Άνοιξε Leads'];
}

const HELP: AssistantReply = {
  text: 'Μπορώ να σας δείξω την εργασία σας, να βρω πελάτες, leads και cases από τα δεδομένα που ήδη βλέπετε, και να ανοίξω ενότητες του CRM. Δεν κάνω αλλαγές στα δεδομένα και δεν στέλνω στοιχεία πελατών σε εξωτερική υπηρεσία.',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const itemAction = (i: WorkItem): AssistantAction =>
  i.caseId ? { type: 'case', id: i.caseId } : i.leadId ? { type: 'lead', id: i.leadId } : { type: 'page', page: 'mywork' };
const asResult = (i: WorkItem): AssistantResult => ({ label: i.title, sub: i.subtitle, action: itemAction(i) });

function search(term: string, ctx: AssistantCtx): AssistantResult[] {
  const t = norm(term);
  if (t.length < 2) return [];
  const has = (...v: (string | null | undefined)[]) => v.some(x => !!x && norm(x).includes(t));
  const out: AssistantResult[] = [];
  for (const c of ctx.cases) if (has(c.case_no, c.title, c.customer?.full_name)) out.push({ label: c.customer?.full_name ?? c.title, sub: `Case ${c.case_no}`, action: { type: 'case', id: c.id } });
  for (const l of ctx.leads) if (has(leadName(l), l.phone, l.email)) out.push({ label: leadName(l), sub: 'Lead', action: { type: 'lead', id: l.id } });
  for (const c of ctx.customers) if (has(c.full_name, c.phone, c.email)) out.push({ label: c.full_name, sub: `Πελάτης${c.city ? ` · ${c.city}` : ''}`, action: { type: 'customer', id: c.id } });
  return out.slice(0, 8);
}

export function answer(input: string, ctx: AssistantCtx): AssistantReply {
  const q = norm(input);
  if (!q) return { ...HELP, suggestions: suggestionsFor(ctx.role) };
  const sugg = suggestionsFor(ctx.role);

  if (/^(βοηθεια|help|τι μπορεις|τι κανεις|ποιος εισαι)/.test(q)) return { ...HELP, suggestions: sugg };

  // explicit search: «βρες …», «ψάξε …», «αναζήτησε …»
  const s = /^(βρεσ|ψαξε|αναζητησε|αναζητηση|search|find)\s+(.+)$/.exec(q);
  if (s) {
    const term = s[2].replace(/^(τον|την|το|τουσ|τα|πελατη|πελατισσα|lead|case)\s+/, '');
    const results = search(term, ctx);
    return results.length
      ? { text: `Βρήκα ${plural(results.length, 'αποτέλεσμα', 'αποτελέσματα')} για «${term}».`, results, suggestions: sugg }
      : { text: `Δεν βρήκα κάτι για «${term}» στα δεδομένα που βλέπετε.`, suggestions: sugg };
  }

  // navigation: «άνοιξε …», «πήγαινε …», «δείξε …»
  const nav = /^(ανοιξε|ανοιγμα|πηγαινε|παμε|δειξε|δειξε μου)\s+(.+)$/.exec(q);
  if (nav) {
    const target = PAGES.find(p => p.re.test(nav[2]));
    if (!target) return { text: `Δεν αναγνώρισα την ενότητα «${nav[2]}».`, suggestions: sugg };
    if (!ctx.allowedPages.includes(target.page)) return { text: `Η ενότητα «${target.label}» δεν είναι διαθέσιμη για τον ρόλο σας.`, suggestions: sugg };
    return { text: `Ανοίγω: ${target.label}.`, results: [{ label: target.label, action: { type: 'page', page: target.page } }], suggestions: sugg };
  }

  if (/(ομαδ|team)/.test(q)) {
    if (ctx.role !== 'admin' && ctx.role !== 'manager') return { text: 'Η σύνοψη ομάδας είναι διαθέσιμη σε διευθυντές και διαχειριστές.', suggestions: sugg };
    const t = ctx.summary?.team;
    if (!t) return { text: 'Τα στοιχεία ομάδας δεν είναι διαθέσιμα αυτή τη στιγμή.', suggestions: sugg };
    return {
      text: `Ομάδα: ${plural(t.unassignedNewLeads, 'νέο lead', 'νέα leads')} χωρίς ανάθεση, ${plural(t.staleCases, 'case', 'cases')} χωρίς κίνηση 7+ ημέρες, ${plural(t.overdueFollowUps, 'εκπρόθεσμο follow-up', 'εκπρόθεσμα follow-ups')}.`,
      results: ([
        { label: 'Leads χωρίς ανάθεση', action: { type: 'page', page: 'leads' } },
        { label: 'Cases', action: { type: 'page', page: 'cases' } },
      ] as AssistantResult[]).filter(r => r.action.type === 'page' && ctx.allowedPages.includes(r.action.page)),
      suggestions: sugg,
    };
  }

  if (/(εκπροθεσμ|καθυστερ)/.test(q)) {
    const od = ctx.items.filter(i => i.bucket === 'overdue');
    return od.length
      ? { text: `Έχετε ${plural(od.length, 'εκπρόθεσμο follow-up', 'εκπρόθεσμα follow-ups')}.`, results: od.slice(0, 6).map(asResult), suggestions: sugg }
      : { text: 'Δεν έχετε εκπρόθεσμα follow-ups.', suggestions: sugg };
  }

  if (/(leads?.*(επικοινων|πρωτη)|πρωτη επικοινων|νεα leads|leads για)/.test(q)) {
    const ls = ctx.items.filter(i => i.kind === 'lead');
    return ls.length
      ? { text: `Έχετε ${plural(ls.length, 'lead', 'leads')} που περιμένει πρώτη επικοινωνία.`, results: ls.slice(0, 6).map(asResult), suggestions: sugg }
      : { text: 'Δεν υπάρχει lead που να περιμένει πρώτη επικοινωνία από εσάς.', suggestions: sugg };
  }

  if (/(τι εχω|τι πρεπει|προτεραιοτ|σημερα|εργασια μου|τι να κανω)/.test(q)) {
    const now = ctx.items.filter(i => i.bucket !== 'upcoming');
    return now.length
      ? { text: `Έχετε ${plural(now.length, 'εργασία', 'εργασίες')} που χρειάζονται ενέργεια.`, results: now.slice(0, 6).map(asResult), suggestions: sugg }
      : { text: 'Δεν υπάρχει εργασία που να περιμένει εσάς αυτή τη στιγμή.', suggestions: sugg };
  }

  if (/(ποσα|ποσεσ|ποσοι)\s.*case/.test(q)) {
    const n = ctx.items.filter(i => i.kind === 'case').length;
    return { text: `Έχετε ${plural(n, 'case', 'cases')} που περιμένουν ενέργεια από εσάς.`, suggestions: sugg };
  }

  // a bare name / case number: try search before giving up
  const results = search(q, ctx);
  if (results.length) return { text: `Βρήκα ${plural(results.length, 'αποτέλεσμα', 'αποτελέσματα')} για «${input.trim()}».`, results, suggestions: sugg };
  return { text: 'Δεν κατάλαβα το αίτημα, ή δεν βρήκα σχετικά δεδομένα. ' + HELP.text, suggestions: sugg, understood: false };
}
