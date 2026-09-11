/* ------------------------------------------------------------------ */
/*  QuickAdd — topbar "Νέο" menu (CRM Shell Redesign).                */
/*  Role-gated quick-creation entries. Each entry routes to the real   */
/*  module (which owns its create flow) — no fabricated data here.     */
/* ------------------------------------------------------------------ */

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { can, categoryColor, findNav } from '@/lib/roles';
import type { CaseAction, PageKey, Role } from '@/lib/roles';
import { rgbaOf } from '@/lib/ui';
import {
  Briefcase, CalendarClock, ChevronRight, FileCheck, MapPin, Plus,
  UserPlus, Users, X,
} from 'lucide-react';

type QuickItem = {
  id: string;
  label: string;
  sub: string;
  page: PageKey;
  icon: React.ComponentType<{ className?: string }>;
  actions: CaseAction[];
};

const ITEMS: QuickItem[] = [
  { id: 'case', label: 'Νέο Case', sub: 'δημιουργία πώλησης', page: 'cases', icon: Briefcase, actions: ['create_case'] },
  { id: 'followup', label: 'Follow Up', sub: 'προγραμματισμός επικοινωνίας', page: 'followups', icon: CalendarClock, actions: ['create_followup'] },
  { id: 'visit', label: 'Επίσκεψη', sub: 'προγραμματισμός πεδίου', page: 'map', icon: MapPin, actions: ['schedule_visit'] },
  { id: 'application', label: 'Αίτηση', sub: 'αίτηση υπηρεσίας', page: 'backoffice', icon: FileCheck, actions: ['create_application'] },
  { id: 'lead', label: 'Lead', sub: 'νέο υποψήφιο', page: 'leads', icon: UserPlus, actions: [] },
  { id: 'customer', label: 'Πελάτης', sub: 'νέος πελάτης', page: 'customers', icon: Users, actions: [] },
];

function itemAllowed(role: Role, item: QuickItem): boolean {
  if (item.actions.length > 0) return item.actions.some(a => can(role, a));
  const nav = findNav(item.page);
  return nav ? nav.item.roles.includes(role) : false;
}

export default function QuickAdd() {
  const { role } = useAuth();
  const { go } = useNav();
  const [open, setOpen] = useState(false);

  const items = ITEMS.filter(i => itemAllowed(role, i));

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu"
        title="Γρήγορη δημιουργία"
        className="flex items-center gap-1.5 h-9 px-3.5 rounded-[9px] bg-brand-500 text-white text-[13px] font-semibold hover:brightness-110 transition-[filter] shadow-[0_4px_16px_rgba(0,102,204,0.28)]">
        <Plus className="w-4 h-4" />
        <span className="hidden md:inline">Νέο</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-72 card p-2 shadow-cardlg z-50 animate-fadein" role="menu" aria-label="Γρήγορη δημιουργία">
            <div className="px-2 py-1.5 flex items-center justify-between">
              <span className="micro">Γρήγορη δημιουργία</span>
              <button onClick={() => setOpen(false)} aria-label="Κλείσιμο" className="text-ink/40 hover:text-ink p-0.5 rounded hover:bg-ink/5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {items.map(it => {
                const c = categoryColor(it.page);
                return (
                  <button key={it.id} role="menuitem"
                    onClick={() => { go(it.page); setOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-left hover:bg-ink/5 group">
                    <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: rgbaOf(c, 0.12) }}>
                      <it.icon className="w-4 h-4" style={{ color: c }} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-ink leading-tight">{it.label}</span>
                      <span className="block text-[11px] text-ink/45 truncate">{it.sub}</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-ink/25 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                );
              })}
              {items.length === 0 && (
                <div className="text-center text-xs text-ink/40 py-4">Δεν υπάρχουν διαθέσιμες ενέργειες για τον ρόλο σας.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}