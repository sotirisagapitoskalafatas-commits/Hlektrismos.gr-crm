/* Tables a guide shows but never copies: they are computed from the application's own data, so a role, a page or a stage can not be documented wrongly.
   `@embed name` in a guide asks for one. PURE. */
import { NAV_SECTIONS, PERMS, STAGES, STAGE_TRANSITIONS, navForRole } from '@/lib/roles';
import type { CaseAction, NavLeaf, Role } from '@/lib/roles';
import { TEAM_LABEL, teamForStage } from '@/lib/case-flow';

export interface EmbedTable { head: string[]; rows: string[][]; note?: string }
const YES = 'Ναι'; const NO = '—';
const ROLES: Role[] = ['admin', 'sales_agent'];
export const ROLE_NAME: Record<Role, string> = { admin: 'Admin / Back Office', sales_agent: 'Sales Agent' };

const ACTION: Record<CaseAction, string> = {
  create_case: 'Δημιουργία case', edit_case: 'Επεξεργασία case', log_call: 'Καταγραφή κλήσης', log_email: 'Καταγραφή email', log_sms: 'Καταγραφή SMS', log_whatsapp: 'Καταγραφή WhatsApp',
  create_offer: 'Δημιουργία προσφοράς', send_offer: 'Αποστολή προσφοράς (δικαίωμα)', create_followup: 'Νέο follow-up', complete_followup: 'Ολοκλήρωση follow-up', add_note: 'Σημείωση', add_document: 'Προσθήκη εγγράφου',
  verify_document: 'Έλεγχος εγγράφου', schedule_visit: 'Προγραμματισμός επίσκεψης', check_in: 'Check In', check_out: 'Check Out', photo: 'Φωτογραφία', meeting: 'Συνάντηση', capture_signature: 'Υπογραφή πελάτη',
  create_application: 'Δημιουργία αίτησης', submit_provider: 'Καταχώρηση στον πάροχο', change_stage: 'Αλλαγή σταδίου', assign: 'Ανάθεση', delete: 'Διαγραφή',
};

/** What each of the two accounts may do. Straight from PERMS. */
export function roleTable(): EmbedTable {
  const actions = Object.keys(ACTION) as CaseAction[];
  return { head: ['Ενέργεια', ROLE_NAME.admin, ROLE_NAME.sales_agent], rows: actions.map((a) => [ACTION[a], ...ROLES.map((r) => ((PERMS[r] as CaseAction[]).includes(a) ? YES : NO))]),
    note: 'Ο πίνακας δείχνει τα δικαιώματα του κώδικα. Ένα δικαίωμα δεν σημαίνει ότι κάθε ενέργεια έχει δική της οθόνη. Επιπλέον, ο Sales Agent μπορεί να βλέπει μόνο τα δικά του leads και cases όταν είναι ενεργή η «Ορατότητα πωλητών».' };
}

/** The pages each account has in its menu. Straight from NAV_SECTIONS / navForRole. */
export function pageTable(): EmbedTable {
  const rows: string[][] = [];
  for (const s of NAV_SECTIONS) for (const l of s.children) {
    const who = ROLES.map((r) => (l.roles.includes(r) ? YES : NO));
    rows.push([l.label, s.label, ...who, l.labs ? 'Δοκιμαστική λειτουργία (Labs)' : l.maturity === 'beta' ? 'Δοκιμαστικό' : 'Σε λειτουργία']);
  }
  return { head: ['Σελίδα', 'Ενότητα', ROLE_NAME.admin, ROLE_NAME.sales_agent, 'Κατάσταση'], rows };
}

/** The stages of a case, who works them (the CRM's own team label) and where they may go next. */
export function stageTable(): EmbedTable {
  const name = (id: string) => STAGES.find((s) => s.id === id)?.label ?? id;
  return { head: ['Στάδιο', 'Ομάδα εργασίας', 'Επιτρεπτή μετάβαση σε'], rows: STAGES.map((s) => {
    const t = teamForStage(s.id);
    return [s.label, t ? TEAM_LABEL[t] : 'Κλειστό', STAGE_TRANSITIONS[s.id].map(name).join(', ') || '—'];
  }) };
}

/** Pages a given account sees right now (labs pages only when the Labs switch is on in that browser). */
export const pagesFor = (role: Role): NavLeaf[] => navForRole(role).flatMap((s) => s.children);

export function embed(name: string): EmbedTable | null {
  switch (name) {
    case 'roles': return roleTable();
    case 'pages': return pageTable();
    case 'stages': return stageTable();
    default: return null;
  }
}
export const EMBED_NAMES = ['roles', 'pages', 'stages'] as const;
