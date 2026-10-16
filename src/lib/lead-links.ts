/* Links back to the lead a case came from (UNIFIED_CUSTOMER_FOLDER.md §3, B4). Pure, no database access.
   Only roles that already open leads get a link: the roles with «Leads» in the menu, plus Back Office, which
   opens leads from «Νέα leads με έγγραφα». Field Sales keeps the text only. Visibility is not changed: the
   database (RLS) still decides what each user can read. */
import type { Role } from './roles';

const OPENS_LEADS: readonly Role[] = ['admin', 'manager', 'inside_sales', 'back_office'];
export const canOpenLead = (role: Role) => OPENS_LEADS.includes(role);
