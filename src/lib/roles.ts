import {
  Phone, Mail, MessageSquare, MessageCircle, FileText, Send, CalendarClock,
  StickyNote, FolderOpen, MapPin, LogIn, LogOut, Users, Camera, PenLine,
  ClipboardCheck, FileCheck, Upload, Power, CheckCircle2, Sparkles,
  LayoutDashboard, Building2, Bot, Map as MapIcon, Compass, Briefcase,
  CalendarDays, Gauge, Settings, Home, ChevronRight, Bell, Plus, Search,
  UserPlus, ChartNoAxesColumn, Sun, Route as RouteIcon, MonitorCog, Files,
  Cog, BarChart3, Filter, Stethoscope, ShieldCheck, UsersRound, ShoppingBag, Navigation,
} from 'lucide-react';

export type Role = 'admin' | 'manager' | 'inside_sales' | 'field_sales' | 'back_office';
export const DEFAULT_ROLE: Role = 'admin';

export const ROLES: { id: Role; label: string; short: string; hint: string }[] = [
  { id: 'admin', label: 'Διαχειριστής', short: 'ΑΔΜ', hint: 'Πλήρης πρόσβαση' },
  { id: 'manager', label: 'Διευθυντής', short: 'ΔΝΣ', hint: 'Εποπτεία & reporting' },
  { id: 'inside_sales', label: 'Inside Sales', short: 'INS', hint: 'Εξ αποστάσεως πωλήσεις' },
  { id: 'field_sales', label: 'Field Sales', short: 'FLD', hint: 'Πωλήσεις πεδίου & επισκέψεις' },
  { id: 'back_office', label: 'Back Office', short: 'BO', hint: 'Λειτουργική ολοκλήρωση' },
];

export function roleLabel(r: Role) {
  return ROLES.find(x => x.id === r)?.label ?? r;
}

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
  { id: 'document_check', label: 'Έλεγχος Εγγράφων', short: 'ΕΓΓ' },
  { id: 'submitted', label: 'Καταχώρηση Παρόχου', short: 'ΚΑΤ' },
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
  | 'comment' | 'completed';

export const ACTIVITY_META: Record<string, { icon: React.ComponentType<{ className?: string }>; label: string; team: Role | 'system' }> = {
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

export const DOC_STATUSES: Record<string, string> = {
  required: 'Απαιτείται',
  received: 'Παραλήφθηκε',
  verified: 'Ελέγχθηκε',
  rejected: 'Απορρίφθηκε',
  missing: 'Λείπει',
};

/* ---------------- Service types ---------------- */
export const SERVICES: Record<string, string> = {
  energy: 'Ρεύμα',
  gas: 'Αέριο',
  solar: 'Φωτοβολταϊκά',
  ev: 'Ηλεκτροκίνηση',
  insurance: 'Ασφάλεια',
  web: 'Web',
};

/* ---------------- Navigation (CRM OS shell) ----------------
   Single source of truth: sections → leaf items.
   Each category and every subcategory carries its own icon,
   permission list, maturity dot, optional count badge and
   optional Atlas accent. The shell renders this config. */
export type ModuleMaturity = 'live' | 'beta' | 'planned' | 'blocked';
export type PageKey =
  | 'home' | 'leads' | 'cases' | 'followups' | 'customers'
  | 'map' | 'myday' | 'backoffice' | 'providers' | 'reports' | 'admin';

export type NavBadge = 'leads' | 'followups' | 'backoffice';

export type NavLeaf = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  page: PageKey;
  roles: Role[];
  maturity?: ModuleMaturity;
  badge?: NavBadge;
  accent?: boolean;
};

export type NavSection = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  children: NavLeaf[];
};

const ALL: Role[] = ['admin', 'manager', 'inside_sales', 'field_sales', 'back_office'];

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    children: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, page: 'home', roles: ALL, maturity: 'live' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: ShoppingBag,
    children: [
      { key: 'leads', label: 'Leads', icon: UserPlus, page: 'leads', roles: ['admin', 'manager', 'inside_sales'], maturity: 'live', badge: 'leads' },
      { key: 'cases', label: 'Cases', icon: Briefcase, page: 'cases', roles: ALL, maturity: 'live' },
      { key: 'pipeline', label: 'My Pipeline', icon: ChartNoAxesColumn, page: 'cases', roles: ['admin', 'manager', 'inside_sales'], maturity: 'planned' },
      { key: 'followups', label: 'Follow Ups', icon: CalendarClock, page: 'followups', roles: ALL, maturity: 'live', badge: 'followups' },
      { key: 'calendar', label: 'Calendar', icon: CalendarDays, page: 'followups', roles: ['admin', 'manager', 'inside_sales'], maturity: 'planned' },
    ],
  },
  {
    id: 'field',
    label: 'Field Sales',
    icon: Navigation,
    children: [
      { key: 'myday', label: 'Ημέρα μου', icon: Sun, page: 'myday', roles: ['admin', 'manager', 'field_sales'], maturity: 'live' },
      { key: 'visits', label: 'Επισκέψεις', icon: MapPin, page: 'myday', roles: ['admin', 'manager', 'field_sales'], maturity: 'planned' },
      { key: 'map', label: 'Χάρτης', icon: MapIcon, page: 'map', roles: ['admin', 'manager', 'field_sales'], maturity: 'live' },
      { key: 'route', label: 'Route', icon: RouteIcon, page: 'map', roles: ['admin', 'manager', 'field_sales'], maturity: 'planned' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: Cog,
    children: [
      { key: 'backoffice', label: 'Back Office', icon: MonitorCog, page: 'backoffice', roles: ['admin', 'manager', 'back_office'], maturity: 'live', badge: 'backoffice' },
      { key: 'documents', label: 'Documents', icon: Files, page: 'backoffice', roles: ['admin', 'manager', 'back_office'], maturity: 'planned' },
      { key: 'signatures', label: 'Signatures', icon: PenLine, page: 'backoffice', roles: ['admin', 'manager', 'back_office'], maturity: 'planned' },
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: Users,
    children: [
      { key: 'customers', label: 'Customers', icon: UsersRound, page: 'customers', roles: ['admin', 'manager', 'inside_sales', 'field_sales'], maturity: 'planned' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    children: [
      { key: 'reports', label: 'Reports', icon: Gauge, page: 'reports', roles: ['admin', 'manager'], maturity: 'planned' },
      { key: 'pipeline', label: 'Pipeline', icon: Filter, page: 'cases', roles: ['admin', 'manager'], maturity: 'planned' },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    icon: Sparkles,
    accent: true,
    children: [
      { key: 'atlas', label: 'Atlas AI', icon: Sparkles, page: 'admin', roles: ALL, maturity: 'planned', accent: true },
      { key: 'diagnostic', label: 'Sales Diagnostic', icon: Stethoscope, page: 'admin', roles: ['admin', 'manager', 'inside_sales'], maturity: 'planned', accent: true },
    ],
  },
  {
    id: 'system',
    label: 'System',
    icon: Settings,
    children: [
      { key: 'settings', label: 'Settings', icon: Settings, page: 'admin', roles: ['admin', 'manager'], maturity: 'planned' },
      { key: 'users', label: 'Users', icon: UsersRound, page: 'admin', roles: ['admin'], maturity: 'planned' },
      { key: 'rlp', label: 'Roles & Permissions', icon: ShieldCheck, page: 'admin', roles: ['admin'], maturity: 'planned' },
    ],
  },
];

export function navForRole(role: Role): NavSection[] {
  return NAV_SECTIONS
    .map(s => ({ ...s, children: s.children.filter(i => i.roles.includes(role)) }))
    .filter(s => s.children.length > 0);
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

export const PAGE_TITLES: Record<PageKey, string> = {
  home: 'Πίνακας Ελέγχου',
  leads: 'Leads',
  cases: 'Cases',
  customers: 'Πελάτες',
  followups: 'Follow Ups',
  myday: 'Ημέρα μου',
  map: 'Χάρτης',
  backoffice: 'Operations',
  providers: 'Πάροχοι',
  reports: 'Reports',
  admin: 'Διαχείριση',
};

export const MATURITY_LABEL: Record<ModuleMaturity, { label: string; dot: string }> = {
  live: { label: 'Live', dot: 'dot-live' },
  beta: { label: 'Beta', dot: 'dot-beta' },
  planned: { label: 'Planned', dot: 'dot-planned' },
  blocked: { label: 'Blocked', dot: 'dot-blocked' },
};

/* ---------------- Permissions ---------------- */
export type CaseAction =
  | 'create_case' | 'edit_case' | 'log_call' | 'log_email' | 'log_sms' | 'log_whatsapp'
  | 'create_offer' | 'send_offer' | 'create_followup' | 'complete_followup'
  | 'add_note' | 'add_document' | 'verify_document'
  | 'schedule_visit' | 'check_in' | 'check_out' | 'photo' | 'meeting'
  | 'capture_signature' | 'create_application' | 'submit_provider' | 'change_stage'
  | 'assign' | 'delete';

const PERMS: Record<Role, CaseAction[]> = {
  admin: ['create_case', 'edit_case', 'log_call', 'log_email', 'log_sms', 'log_whatsapp', 'create_offer', 'send_offer', 'create_followup', 'complete_followup', 'add_note', 'add_document', 'verify_document', 'schedule_visit', 'check_in', 'check_out', 'photo', 'meeting', 'capture_signature', 'create_application', 'submit_provider', 'change_stage', 'assign', 'delete'],
  manager: ['create_case', 'edit_case', 'log_call', 'log_email', 'log_sms', 'log_whatsapp', 'create_offer', 'send_offer', 'create_followup', 'complete_followup', 'add_note', 'add_document', 'verify_document', 'schedule_visit', 'check_in', 'check_out', 'photo', 'meeting', 'capture_signature', 'create_application', 'submit_provider', 'change_stage', 'assign'],
  inside_sales: ['create_case', 'edit_case', 'log_call', 'log_email', 'log_sms', 'log_whatsapp', 'create_offer', 'send_offer', 'create_followup', 'complete_followup', 'add_note', 'add_document', 'change_stage', 'assign'],
  field_sales: ['log_call', 'log_email', 'log_whatsapp', 'create_offer', 'send_offer', 'create_followup', 'complete_followup', 'add_note', 'add_document', 'schedule_visit', 'check_in', 'check_out', 'photo', 'meeting', 'capture_signature', 'change_stage'],
  back_office: ['add_note', 'add_document', 'verify_document', 'create_application', 'submit_provider', 'change_stage', 'complete_followup'],
};

export function can(role: Role, action: CaseAction): boolean {
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
  { id: 'inside_sales', label: 'Inside Sales' },
  { id: 'field_sales', label: 'Field Sales' },
  { id: 'back_office', label: 'Back Office' },
  { id: 'system', label: 'Σύστημα' },
];