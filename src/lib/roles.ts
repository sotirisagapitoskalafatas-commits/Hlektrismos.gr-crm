import {
  Phone, Mail, MessageSquare, MessageCircle, FileText, Send, CalendarClock,
  StickyNote, FolderOpen, MapPin, LogIn, LogOut, Users, Camera, PenLine,
  ClipboardCheck, FileCheck, Upload, Power, CheckCircle2, Sparkles,
  LayoutDashboard, Building2, Bot, Map as MapIcon, Compass, Briefcase,
  CalendarDays, Gauge, Settings, Home, ChevronRight, Bell, Plus, Search,
  UserPlus, Sun, MonitorCog, Cog, BarChart3, UsersRound, ShoppingBag, Navigation,
  UserCircle, SlidersHorizontal, Smartphone, Inbox, Wallet, Radar, Boxes, BookOpen, ClipboardList,
} from 'lucide-react';
import { labsVisible } from './labs';
import { DOC_STATUS_TEXT } from './status-text';

export type Role = 'admin' | 'sales_agent';
export const DEFAULT_ROLE: Role = 'sales_agent';

/* ---------------- Exactly two account types ----------------
   admin       = «Admin / Back Office»: ONE shared office login, full access.
   sales_agent = «Sales Agent»: individual accounts, own records only.
   Before phase6/25 the database stored Sales Agents as field_sales / inside_sales; canonicalRole() reads both, so the app works
   before and after that migration. `manager`, `back_office` and unknown values stay as they are and hold no access. */
const SALES_AGENT_ALIASES: readonly string[] = ['sales_agent', 'field_sales', 'inside_sales'];
/** The one conversion point for a role read from the database. */
export const canonicalRole = (r: unknown): Role => (typeof r === 'string' && SALES_AGENT_ALIASES.includes(r) ? 'sales_agent' : (r as Role));
/** The only roles that hold any access in the CRM. */
export const ACTIVE_ROLES: readonly Role[] = ['admin', 'sales_agent'];
export const hasAccess = (r: unknown): r is Role => typeof r === 'string' && (ACTIVE_ROLES as readonly string[]).includes(r);

export const ROLES: { id: Role; label: string; short: string; hint: string }[] = [
  { id: 'admin', label: 'Admin / Back Office', short: 'ΑΔΜ', hint: 'Κοινός λογαριασμός γραφείου · πλήρης πρόσβαση' },
  { id: 'sales_agent', label: 'Sales Agent', short: 'SLS', hint: 'Προσωπικοί πελάτες, πωλήσεις, επισκέψεις και διαδρομές' },
];

export const LEGACY_ROLE_LABEL = 'Παλαιός ρόλος (χωρίς πρόσβαση)';
export function roleLabel(r: Role) {
  if (!hasAccess(r)) return LEGACY_ROLE_LABEL;
  return r === 'sales_agent' ? 'Sales Agent' : 'Admin / Back Office';
}

/* ---------------- Access groups: one per account type ----------------
   office: admin sees everything.   sales: sales_agent sees only their own leads, cases and customers (enforced in the database by
   phase4/18 + phase4/21). */
export type AccessGroup = 'office' | 'sales';
export const ACCESS_GROUPS: { id: AccessGroup; label: string; hint: string; roles: Role[] }[] = [
  { id: 'office', label: 'Admin / Back Office', hint: 'Διαχείριση ομάδας, αναθέσεων και back-office εργασιών.', roles: ['admin'] },
  { id: 'sales', label: 'Sales Agent', hint: 'Προσωπικά leads, πελάτες, επισκέψεις, follow-ups και διαδρομές.', roles: ['sales_agent'] },
];
/** The access category of a role, or null: legacy and unknown roles belong to no category. */
export const accessGroup = (r: Role): AccessGroup | null => (r === 'sales_agent' ? 'sales' : r === 'admin' ? 'office' : null);
export const ACCESS_GROUP_COLOR = {
  office: '#475569',
  sales: '#156db5',
} as const;

export const accessGroupColor = (r: Role): string => { const g = accessGroup(r); return g ? ACCESS_GROUP_COLOR[g] : '#94a3b8'; };
export const accessGroupLabel = (r: Role): string => { const g = accessGroup(r); return g ? ACCESS_GROUPS.find(x => x.id === g)!.label : LEGACY_ROLE_LABEL; };

/* ---------------- Role colors (CRM Shell Redesign) ----------------
   Hue per role, used by the role simulator chips, avatar ring and
   notification accents. Design palette. */
export const ROLE_COLOR: Record<Role, string> = {
  admin: '#475569',
  sales_agent: '#0066cc',
};

/* ---------------- Stages ---------------- */
export type Stage =
  | 'new' | 'contacted' | 'offer' | 'application' | 'signed'
  | 'document_check' | 'submitted' | 'activation' | 'completed'
  | 'lost' | 'cancelled';

export const STAGES: { id: Stage; label: string; short: string }[] = [
  { id: 'new', label: 'Νέο', short: 'ΝΕΟ' },
  { id: 'contacted', label: 'Επικοινωνία', short: 'ΕΠΙ' },
  { id: 'offer', label: 'Προσφορά', short: 'ΠΡΟ' },
  { id: 'application', label: 'Αίτηση', short: 'ΑΙΤ' },
  { id: 'signed', label: 'Υπογραφή', short: 'ΥΠΓ' },
  { id: 'document_check', label: 'Έλεγχος εγγράφων', short: 'ΕΓΓ' },
  { id: 'submitted', label: 'Καταχώρηση παρόχου', short: 'ΚΑΤ' },
  { id: 'activation', label: 'Ενεργοποίηση', short: 'ΕΝΕ' },
  { id: 'completed', label: 'Ολοκληρώθηκε', short: 'ΟΛΟ' },
  { id: 'lost', label: 'Χάθηκε', short: 'ΧΑΣ' },
  { id: 'cancelled', label: 'Ακυρώθηκε', short: 'ΑΚΥ' },
];

export function stageLabel(s: string) {
  return STAGES.find(x => x.id === s)?.label ?? s;
}

export const ACTIVE_STAGES: Stage[] = [
  'new', 'contacted', 'offer', 'application', 'signed',
  'document_check', 'submitted', 'activation',
];

export const BACK_OFFICE_STAGES: Stage[] = [
  'signed', 'document_check', 'submitted', 'activation', 'completed',
];

/* ---------------- Activity types & icons ---------------- */
export type ActivityType =
  | 'created' | 'call' | 'email' | 'sms' | 'whatsapp' | 'offer' | 'send_offer'
  | 'follow_up' | 'note' | 'document' | 'visit' | 'meeting' | 'check_in'
  | 'check_out' | 'photo' | 'signature' | 'document_check' | 'application'
  | 'provider_submission' | 'activation' | 'status_change' | 'assignment'
  | 'comment' | 'completed' | 'navigation';

/** The kind of work an activity belongs to. These are work types kept on historical records, not account roles. */
export type WorkTeam = 'inside_sales' | 'field_sales' | 'back_office' | 'admin' | 'system';
export const ACTIVITY_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; team: WorkTeam }> = {
  created: { icon: Sparkles, label: 'Δημιουργία Case', team: 'system' },
  call: { icon: Phone, label: 'Τηλεφωνική Επικοινωνία', team: 'inside_sales' },
  email: { icon: Mail, label: 'Email', team: 'inside_sales' },
  sms: { icon: MessageSquare, label: 'SMS', team: 'inside_sales' },
  whatsapp: { icon: MessageCircle, label: 'WhatsApp', team: 'inside_sales' },
  offer: { icon: FileText, label: 'Δημιουργία Προσφοράς', team: 'inside_sales' },
  send_offer: { icon: Send, label: 'Αποστολή Προσφοράς', team: 'inside_sales' },
  follow_up: { icon: CalendarClock, label: 'Follow Up', team: 'inside_sales' },
  note: { icon: StickyNote, label: 'Σημείωση', team: 'system' },
  document: { icon: FolderOpen, label: 'Έγγραφο', team: 'system' },
  visit: { icon: MapPin, label: 'Επίσκεψη', team: 'field_sales' },
  meeting: { icon: Users, label: 'Συνάντηση', team: 'field_sales' },
  navigation: { icon: Navigation, label: 'Πλοήγηση', team: 'field_sales' },
  check_in: { icon: LogIn, label: 'Check In', team: 'field_sales' },
  check_out: { icon: LogOut, label: 'Check Out', team: 'field_sales' },
  photo: { icon: Camera, label: 'Φωτογραφία', team: 'field_sales' },
  signature: { icon: PenLine, label: 'Υπογραφή', team: 'field_sales' },
  document_check: { icon: ClipboardCheck, label: 'Έλεγχος Εγγράφων', team: 'back_office' },
  application: { icon: FileCheck, label: 'Δημιουργία Αίτησης', team: 'back_office' },
  provider_submission: { icon: Upload, label: 'Καταχώρηση στον Πάροχο', team: 'back_office' },
  activation: { icon: Power, label: 'Ενεργοποίηση', team: 'back_office' },
  status_change: { icon: Gauge, label: 'Αλλαγή Σταδίου', team: 'system' },
  assignment: { icon: Briefcase, label: 'Ανάθεση', team: 'system' },
  comment: { icon: MessageCircle, label: 'Σχόλιο', team: 'system' },
  completed: { icon: CheckCircle2, label: 'Ολοκλήρωση', team: 'system' },
  stage_override: { icon: Gauge, label: 'Παράκαμψη ελέγχου εγγράφων', team: 'system' },
  stage_set: { icon: Gauge, label: 'Αλλαγή σταδίου από Back Office', team: 'back_office' },
  returned: { icon: Briefcase, label: 'Επιστροφή για διόρθωση', team: 'back_office' },
  resubmitted: { icon: Upload, label: 'Επανυποβολή', team: 'system' },
};

export function activityLabel(t: string) {
  return ACTIVITY_META[t]?.label ?? t;
}

/* ---------------- Document categories ---------------- */
export const DOC_CATEGORIES: Record<string, string> = {
  bill: 'Λογαριασμός',
  identity: 'Ταυτότητα / Δικαιολογητικά',
  offer: 'Προσφορά',
  application: 'Αίτηση',
  signed: 'Υπογεγραμμένο',
  provider: 'Έγγραφο Παρόχου',
  photo: 'Φωτογραφία πεδίου',
  other: 'Άλλο',
};

export const DOC_STATUSES: Record<string, string> = DOC_STATUS_TEXT;

/* ---------------- Service types ---------------- */
export const SERVICES: Record<string, string> = {
  energy: 'Ρεύμα',
  gas: 'Αέριο',
  solar: 'Φωτοβολταϊκά',
  ev: 'Ηλεκτροκίνηση',
  insurance: 'Ασφάλεια',
  web: 'Web',
};

/* ---------------- Lead pipeline (P1) ---------------- */
export const LEAD_SOURCES: Record<string, { emoji: string; label: string }> = {
  website: { emoji: '🌐', label: 'Ιστοσελίδα' },
  inside_sales: { emoji: '👤', label: 'Inside Sales' },
  field_sales: { emoji: '🚗', label: 'Field Sales' },
  referral: { emoji: '🤝', label: 'Σύσταση' },
  partner: { emoji: '🔗', label: 'Συνεργάτης' },
  campaign: { emoji: '📢', label: 'Καμπάνια' },
  import: { emoji: '📥', label: 'Εισαγωγή' },
  other: { emoji: '📦', label: 'Άλλο' },
  contact: { emoji: '📞', label: 'Φόρμα' },
};

export function leadSourceInfo(source?: string | null): { emoji: string; label: string } {
  return LEAD_SOURCES[source ?? ''] ?? { emoji: '📦', label: source ?? 'Άλλο' };
}

export const LEAD_STATUSES: { id: string; label: string; short: string; emoji: string }[] = [
  { id: 'new', label: 'Νέο', short: 'ΝΕΟ', emoji: '🆕' },
  { id: 'contacted', label: 'Επικοινωνία', short: 'ΕΠΙ', emoji: '📞' },
  { id: 'qualified', label: 'Qualified', short: 'QLF', emoji: '🎯' },
  { id: 'meeting', label: 'Συνάντηση', short: 'ΣΥΝ', emoji: '🤝' },
  { id: 'offer', label: 'Προσφορά', short: 'ΠΡΟ', emoji: '📄' },
  { id: 'converted', label: 'Μετατράπηκε', short: 'ΜΕΤ', emoji: '✅' },
  { id: 'lost', label: 'Χάθηκε', short: 'ΧΑΣ', emoji: '❌' },
  { id: 'unqualified', label: 'Μη Eligible', short: 'ΜΗΔ', emoji: '🚫' },
  { id: 'duplicate', label: 'Διπλότυπο', short: 'ΔΙΠ', emoji: '🔁' },
];

export function leadStatusInfo(status?: string | null): { id: string; label: string; short: string; emoji: string } {
  return LEAD_STATUSES.find(x => x.id === status) ?? { id: status ?? 'new', label: status ?? 'Νέο', short: status ?? 'ΝΕΟ', emoji: '🆕' };
}

/* ---------------- Navigation (CRM OS shell) ----------------
   Single source of truth: sections → leaf items.
   Each category and every subcategory carries its own icon,
   permission list, maturity dot, optional count badge and
   optional Atlas accent. The shell renders this config. */
export type ModuleMaturity = 'live' | 'beta' | 'planned' | 'blocked';
export type PageKey =
  | 'home' | 'mywork' | 'leads' | 'prospecting' | 'providers' | 'cases' | 'followups' | 'customers'
  | 'map' | 'myday' | 'field' | 'backoffice' | 'reports' | 'revenue' | 'admin'
  | 'automations' | 'aiworkforce' | 'account' | 'preferences' | 'homelayout' | 'guide' | 'applications';

export type NavBadge = 'leads' | 'followups' | 'backoffice' | 'cases' | 'customers';

/* Shell-wide count feed: nav badges + top-bar quick-action counts. */
export type ShellCounts = {
  leads: number;
  followups: number;
  backoffice: number;
  cases: number;
  customers: number;
};

export type NavLeaf = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  page: PageKey;
  roles: Role[];
  maturity?: ModuleMaturity;
  badge?: NavBadge;
  accent?: boolean;
  /** Outside the brief / unfinished: shown only to an admin with «Πειραματικές λειτουργίες» on (lib/labs.ts). */
  labs?: boolean;
};

export type NavSection = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  children: NavLeaf[];
};

/* ---------------- Category colors (CRM Shell Redesign) ----------------
   Each category and its leaves carry the design-computed hue. Active
   leaves render as rgba(color,.16) + 2px colored left border; count
   badges use rgba(color,.14). */
export type NavSectionId = 'home' | 'mywork' | 'crm' | 'sales' | 'field' | 'operations' | 'analytics' | 'ai' | 'system';

// One restrained primary blue for every destination (Apple-inspired single accent). Kept as a map so call sites are unchanged.
export const CATEGORY_COLORS: Record<NavSectionId, string> = {
  home: '#0066cc', mywork: '#0066cc', crm: '#0066cc', sales: '#0066cc', field: '#0066cc',
  operations: '#0066cc', analytics: '#0066cc', ai: '#0066cc', system: '#0066cc',
};

const ALL: Role[] = ['admin', 'sales_agent'];

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'home',
    label: 'Αρχική',
    icon: Home,
    children: [
      { key: 'dashboard', label: 'Αρχική', icon: LayoutDashboard, page: 'home', roles: ALL, maturity: 'live' },
    ],
  },
  {
    id: 'mywork',
    label: 'Η εργασία μου',
    icon: Inbox,
    children: [
      { key: 'mywork', label: 'Η εργασία μου', icon: Inbox, page: 'mywork', roles: ALL, maturity: 'live' },
      { key: 'followups', label: 'Follow-ups', icon: CalendarClock, page: 'followups', roles: ALL, maturity: 'live', badge: 'followups' },
    ],
  },
  {
    id: 'crm',
    label: 'CRM',
    icon: UsersRound,
    children: [
      { key: 'leads', label: 'Leads', icon: UserPlus, page: 'leads', roles: ['admin', 'sales_agent'], maturity: 'live', badge: 'leads' },
      { key: 'customers', label: 'Πελάτες', icon: UsersRound, page: 'customers', roles: ['admin', 'sales_agent'], maturity: 'live', badge: 'customers' },
    ],
  },
  {
    id: 'sales',
    label: 'Πωλήσεις',
    icon: ShoppingBag,
    children: [
      { key: 'cases', label: 'Cases', icon: Briefcase, page: 'cases', roles: ALL, maturity: 'live', badge: 'cases' },
      { key: 'applications', label: 'Αιτήσεις', icon: ClipboardList, page: 'applications', roles: ALL, maturity: 'beta' },
      { key: 'prospecting', label: 'B2B Prospecting', icon: Radar, page: 'prospecting', roles: ['admin', 'sales_agent'], maturity: 'beta', labs: true },
      { key: 'providers', label: 'Πάροχοι', icon: Boxes, page: 'providers', roles: ['admin', 'sales_agent'], maturity: 'live' },
    ],
  },
  {
    id: 'field',
    label: 'Πεδίο',
    icon: Navigation,
    children: [
      { key: 'myday', label: 'Ημέρα μου', icon: Sun, page: 'myday', roles: ['admin', 'sales_agent'], maturity: 'live' },
      { key: 'map', label: 'Χάρτης', icon: MapIcon, page: 'map', roles: ['admin', 'sales_agent'], maturity: 'live' },
      { key: 'fieldmode', label: 'Λειτουργία Πεδίου', icon: Smartphone, page: 'field', roles: ['admin', 'sales_agent'], maturity: 'beta' },
    ],
  },
  {
    id: 'operations',
    label: 'Διεκπεραίωση',
    icon: Cog,
    children: [
      { key: 'backoffice', label: 'Διεκπεραίωση', icon: MonitorCog, page: 'backoffice', roles: ['admin'], maturity: 'live', badge: 'backoffice' },
    ],
  },
  {
    id: 'analytics',
    label: 'Ανάλυση',
    icon: BarChart3,
    children: [
      { key: 'reports', label: 'Αναφορές', icon: Gauge, page: 'reports', roles: ['admin'], maturity: 'live' },
      { key: 'revenue', label: 'Έσοδα', icon: Wallet, page: 'revenue', roles: ['admin'], maturity: 'live' },
    ],
  },
  {
    id: 'ai',
    label: 'Atlas AI',
    icon: Bot,
    children: [
      { key: 'automations', label: 'Αυτοματισμοί', icon: Bot, page: 'automations', roles: ['admin'], maturity: 'beta', accent: true, labs: true },
      { key: 'aiworkforce', label: 'AI Εργατικό Δυναμικό', icon: Bot, page: 'aiworkforce', roles: ['admin'], maturity: 'beta', accent: true, labs: true },
    ],
  },
  {
    id: 'system',
    label: 'Ρυθμίσεις',
    icon: Settings,
    children: [
      { key: 'preferences', label: 'Προτιμήσεις', icon: SlidersHorizontal, page: 'preferences', roles: ALL, maturity: 'live' },
      { key: 'homelayout', label: 'Αρχική σελίδα', icon: LayoutDashboard, page: 'homelayout', roles: ALL, maturity: 'live' },
      { key: 'account', label: 'Λογαριασμός', icon: UserCircle, page: 'account', roles: ALL, maturity: 'live' },
      { key: 'guide', label: 'Οδηγός ATLAS', icon: BookOpen, page: 'guide', roles: ALL, maturity: 'live' },
      { key: 'settings', label: 'Διαχείριση', icon: Settings, page: 'admin', roles: ['admin'], maturity: 'live' },
    ],
  },
];

export function navForRole(role: Role): NavSection[] {
  if (!hasAccess(role)) return []; // legacy / unknown roles: no navigation at all
  return NAV_SECTIONS
    .map(s => ({ ...s, children: s.children.filter(i => i.roles.includes(role) && (!i.labs || labsVisible(role))) }))
    .filter(s => s.children.length > 0);
}


/** The single page-boundary rule (AppShell): a page may be shown only if the role's own navigation contains it (Labs pages
 *  additionally need the admin's Labs switch). A case opens for any role with
 *  access. Unknown pages and legacy / unknown roles are refused. */
export function canOpenPage(page: PageKey | 'case', role: Role): boolean {
  if (!hasAccess(role)) return false;
  if (page === 'case') return true;
  return navForRole(role).some(s => s.children.some(i => i.page === page));
}

export function flattenNav(sections: NavSection[]): { section: NavSection; item: NavLeaf }[] {
  return sections.flatMap(s => s.children.map(item => ({ section: s, item })));
}

export function findNav(page: PageKey | 'case'): { section: NavSection; item: NavLeaf } | null {
  for (const s of NAV_SECTIONS) {
    for (const item of s.children) {
      if (item.page === page) return { section: s, item };
    }
  }
  return null;
}

/** False when the page is a labs module (lib/labs.ts) the role may not see; the shell then shows Αρχική. */
export function labsPageAllowed(page: PageKey | 'case', role: Role): boolean {
  return !findNav(page)?.item.labs || labsVisible(role);
}

export function sectionColor(s: Pick<NavSection, 'id'>): string {
  return CATEGORY_COLORS[s.id as NavSectionId] ?? CATEGORY_COLORS.home;
}

export function categoryColor(page: PageKey | 'case'): string {
  const nav = findNav(page);
  return nav ? sectionColor(nav.section) : CATEGORY_COLORS.home;
}

export const PAGE_TITLES: Record<PageKey, string> = {
  home: 'Αρχική',
  mywork: 'Η εργασία μου',
  leads: 'Leads',
  prospecting: 'B2B Prospecting',
  providers: 'Πάροχοι & Προγράμματα',
  cases: 'Cases',
  customers: 'Πελάτες',
  followups: 'Follow-ups',
  myday: 'Ημέρα μου',
  map: 'Χάρτης',
  field: 'Λειτουργία Πεδίου',
  backoffice: 'Διεκπεραίωση',
  reports: 'Αναφορές',
  revenue: 'Έσοδα',
  admin: 'Διαχείριση',
  automations: 'Αυτοματισμοί',
  aiworkforce: 'AI Εργατικό Δυναμικό',
  account: 'Λογαριασμός',
  preferences: 'Προτιμήσεις',
  homelayout: 'Αρχική σελίδα',
  guide: 'Οδηγός ATLAS',
  applications: 'Αιτήσεις',
};

export const MATURITY_LABEL: Record<ModuleMaturity, { label: string; dot: string }> = {
  live: { label: 'Σε λειτουργία', dot: 'dot-live' },
  beta: { label: 'Δοκιμαστικό', dot: 'dot-beta' },
  planned: { label: 'Προγραμματισμένο', dot: 'dot-planned' },
  blocked: { label: 'Μπλοκαρισμένο', dot: 'dot-blocked' },
};

/* ---------------- Permissions ---------------- */
export type CaseAction =
  | 'create_case' | 'edit_case' | 'log_call' | 'log_email' | 'log_sms' | 'log_whatsapp'
  | 'create_offer' | 'send_offer' | 'create_followup' | 'complete_followup'
  | 'add_note' | 'add_document' | 'verify_document'
  | 'schedule_visit' | 'check_in' | 'check_out' | 'photo' | 'meeting'
  | 'capture_signature' | 'create_application' | 'submit_provider' | 'change_stage'
  | 'assign' | 'delete';

export const PERMS: Record<Role, CaseAction[]> = {
  admin: ['create_case', 'edit_case', 'log_call', 'log_email', 'log_sms', 'log_whatsapp', 'create_offer', 'send_offer', 'create_followup', 'complete_followup', 'add_note', 'add_document', 'verify_document', 'schedule_visit', 'check_in', 'check_out', 'photo', 'meeting', 'capture_signature', 'create_application', 'submit_provider', 'change_stage', 'assign', 'delete'],
  sales_agent: ['create_case', 'edit_case', 'log_call', 'log_email', 'log_sms', 'log_whatsapp', 'create_offer', 'send_offer', 'create_followup', 'complete_followup', 'add_note', 'add_document', 'change_stage', 'schedule_visit', 'check_in', 'check_out', 'photo', 'meeting', 'capture_signature'],
};

export function can(role: Role, action: CaseAction): boolean {
  if (!hasAccess(role)) return false; // legacy and unknown roles can do nothing, whatever PERMS says
  return (PERMS[role] ?? []).includes(action);
}

/* ---------------- Stage transition matrix ---------------- */
export const STAGE_TRANSITIONS: Record<Stage, Stage[]> = {
  new: ['contacted', 'lost', 'cancelled'],
  contacted: ['offer', 'application', 'lost', 'cancelled'],
  offer: ['application', 'signed', 'lost', 'cancelled'],
  application: ['signed', 'document_check', 'lost', 'cancelled'],
  signed: ['document_check', 'lost', 'cancelled'],
  document_check: ['submitted', 'application', 'lost', 'cancelled'],
  submitted: ['activation', 'document_check', 'lost', 'cancelled'],
  activation: ['completed', 'submitted', 'lost', 'cancelled'],
  completed: [],
  lost: ['new'],
  cancelled: ['new'],
};

/* ---------------- Follow-up channels ---------------- */
export const CHANNELS: Record<string, string> = {
  phone: 'Τηλέφωνο',
  email: 'Email',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  visit: 'Επίσκεψη',
  meeting: 'Συνάντηση',
  other: 'Άλλο',
};

export const SERVICE_TYPES = Object.keys(SERVICES);

/** Greek text for a stored service value. The website form stores English words («electricity»); never show them raw. */
const SERVICE_ALIASES: Record<string, string> = {
  electricity: 'Ρεύμα', power: 'Ρεύμα', natural_gas: 'Αέριο', 'natural-gas': 'Αέριο', photovoltaic: 'Φωτοβολταϊκά', pv: 'Φωτοβολταϊκά',
  mobility: 'Ηλεκτροκίνηση', ev_charging: 'Ηλεκτροκίνηση',
};
export function serviceLabel(v: string | null | undefined, empty = 'Ενέργεια'): string {
  if (!v) return empty;
  return SERVICES[v] ?? SERVICE_ALIASES[v.toLowerCase()] ?? v;
}
/** Greek text for a stored property type (the website form stores «apartment», «house», …). Free text already in Greek is kept. */
const PROPERTY_LABELS: Record<string, string> = {
  apartment: 'Διαμέρισμα', house: 'Μονοκατοικία', detached: 'Μονοκατοικία', maisonette: 'Μεζονέτα', studio: 'Γκαρσονιέρα',
  business: 'Επαγγελματικός χώρος', commercial: 'Επαγγελματικός χώρος', shop: 'Κατάστημα', office: 'Γραφείο', farm: 'Αγροτικό', land: 'Οικόπεδο',
};
export function propertyLabel(v: string | null | undefined): string {
  if (!v) return '';
  return PROPERTY_LABELS[v.toLowerCase()] ?? v;
}

/* Re-exported icons used across the app */
export {
  Phone, Mail, MessageSquare, MessageCircle, FileText, Send, CalendarClock,
  StickyNote, FolderOpen, MapPin, LogIn, LogOut, Users, Camera, PenLine,
  ClipboardCheck, FileCheck, Upload, Power, CheckCircle2, Sparkles,
  LayoutDashboard, Building2, Bot, MapIcon, Compass, Briefcase,
  CalendarDays, Gauge, Settings, ChevronRight, Bell, Plus, Search, Home,
};

export type { Role as UserRole };

/* ---------------- Timeline / team filters ---------------- */
export const TEAM_FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Όλα' },
  { id: 'sales_agent', label: 'Sales Agent' },
  { id: 'back_office', label: 'Back Office' },
  { id: 'system', label: 'Σύστημα' },
];/* ---------------- Org role predicates (Phase 1.1) ----------------
   Canonical role keys: admin > field_sales > inside_sales. Legacy manager / back_office rank below everything (level 0) and
   are rejected by isOrgRole / asOrgRole, so no hierarchy or fallback can lift them.
   `Role`, `ROLES`, `DEFAULT_ROLE`, `can()` above remain the app's source of
   truth for the UI catalog and per-role permission matrix. */
export const ORG_ROLES: readonly Role[] = ALL;

export type OrgRole = Role;

export const ROLE_LEVEL: Record<OrgRole, number> = {
  admin: 5,
  sales_agent: 2,
};

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === 'string' && (ALL as readonly string[]).includes(value);
}

export function asOrgRole(value: unknown): OrgRole | null {
  return isOrgRole(value) ? value : null;
}

export function hasRole(roles: readonly OrgRole[] | null | undefined, role: OrgRole): boolean {
  return roles?.includes(role) ?? false;
}

export function hasAnyRole(roles: readonly OrgRole[] | null | undefined, candidates: readonly OrgRole[]): boolean {
  return candidates.some((role) => hasRole(roles, role));
}

export function isAtLeastRole(roles: readonly OrgRole[] | null | undefined, min: OrgRole): boolean {
  if (!hasAccess(min)) return false;
  const minLevel = ROLE_LEVEL[min];
  return (roles ?? []).some((role) => hasAccess(role) && ROLE_LEVEL[role] >= minLevel);
}

export function canManageRoles(roles: readonly OrgRole[] | null | undefined): boolean {
  return hasRole(roles, 'admin'); // only the shared Admin / Back Office login manages accounts
}