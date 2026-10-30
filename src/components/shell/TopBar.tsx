// Floating glass top bar: logo, the five module links, search (⌘K), «Δημιουργία», Atlas AI, notifications,
// Προσαρμογή and the avatar menu. Behaviour is the old header's (same notification feed, quick-create menu,
// PWA install, role preview switcher), in the v2 layout.
import { useEffect, useRef, useState } from 'react';
import {
  Bell, ChevronDown, CircleHelp, Download, LogOut, Search, Settings, SlidersHorizontal, Sparkles, UserCircle, Zap,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { accessGroupLabel } from '@/lib/roles';
import { isStandalone, usePwaInstall } from '@/lib/pwa';
import { markNotificationsRead } from '@/lib/api';
import { rgbaOf, timeUntil } from '@/lib/ui';
import QuickAdd from '@/components/app/QuickAdd';
import RoleSwitcher from '@/components/app/RoleSwitcher';
import { firstPage } from './ModuleMap';
import type { ModuleDef } from './ModuleMap';
import { notifMeta, useNotifications } from './useShellData';
import ShellAvatar from './ShellAvatar';

const STROKE = 1.6;

interface TopBarProps {
  modules: ModuleDef[];
  activeId: string | null;
  /** The role has the Διαχείριση page (derived from navForRole in AppShell). */
  hasAdmin: boolean;
  onOpenPalette: () => void;
  onOpenAssistant: () => void;
  onSignOut: () => void;
}

export default function TopBar({ modules, activeId, hasAdmin, onOpenPalette, onOpenAssistant, onSignOut }: TopBarProps) {
  const { role, profile, user, preview } = useAuth();
  const { go, openCase } = useNav();
  const { notifs, unread, load } = useNotifications();
  const { canInstall, install } = usePwaInstall();
  const [open, setOpen] = useState<null | 'notifs' | 'acct'>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const acctRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const realRole = profile?.role ?? role;
  const caption = preview.role ? `Προεπισκόπηση: ${accessGroupLabel(preview.role)}` : accessGroupLabel(realRole);

  const close = () => {
    const was = open;
    setOpen(null);
    (was === 'acct' ? acctRef : bellRef).current?.focus(); // focus returns to the button that opened the menu
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  useEffect(() => {
    if (open === 'acct') menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  };

  const toggleNotifs = async () => {
    const next = open !== 'notifs';
    setOpen(next ? 'notifs' : null);
    if (next) { await markNotificationsRead(); load(); }
  };
  const goAndClose = (fn: () => void) => { setOpen(null); fn(); };

  return (
    <header className="shell-topbar" aria-label="Κύρια γραμμή">
      <button className="shell-brand" onClick={() => go('home')} aria-label="ATLAS — Αρχική">
        <span className="shell-logo"><Zap className="w-5 h-5" strokeWidth={STROKE} fill="currentColor" aria-hidden="true" /></span>
        <span className="shell-wordmark">ATLAS</span>
      </button>

      <nav className="shell-seg" aria-label="Ενότητες">
        {modules.map((m) => (
          <button key={m.id} className="shell-seg__link" aria-current={m.id === activeId ? 'page' : undefined}
            onClick={() => go(firstPage(m))}>
            {m.label}
          </button>
        ))}
      </nav>

      <div className="shell-spacer" />

      <button className="shell-search" onClick={onOpenPalette} aria-label="Αναζήτηση (⌘K)">
        <Search className="w-4 h-4 shrink-0" strokeWidth={STROKE} aria-hidden="true" />
        <span className="truncate">Αναζήτηση…</span>
        <kbd className="shell-kbd">⌘K</kbd>
      </button>

      <QuickAdd />

      <button className="shell-icon" onClick={onOpenAssistant} title="Atlas AI — βοηθός CRM" aria-label="Atlas AI βοηθός">
        <Sparkles className="w-[19px] h-[19px]" strokeWidth={STROKE} aria-hidden="true" />
      </button>

      {canInstall && !isStandalone() && (
        <button className="shell-icon shell-hide-narrow" onClick={() => void install()} title="Εγκατάσταση εφαρμογής" aria-label="Εγκατάσταση εφαρμογής">
          <Download className="w-[19px] h-[19px]" strokeWidth={STROKE} aria-hidden="true" />
        </button>
      )}

      <div className="relative">
        <button ref={bellRef} className="shell-icon" onClick={toggleNotifs} title="Ειδοποιήσεις" aria-label={unread > 0 ? `Ειδοποιήσεις, ${unread} νέες` : 'Ειδοποιήσεις'}
          aria-haspopup="dialog" aria-expanded={open === 'notifs'}>
          <Bell className="w-[19px] h-[19px]" strokeWidth={STROKE} aria-hidden="true" />
          {unread > 0 && <span className="shell-dot" aria-hidden="true" />}
        </button>
        {open === 'notifs' && (
          <>
            <div className="fixed inset-0 z-50" onClick={() => setOpen(null)} />
            <div className="shell-menu" role="dialog" aria-label="Ειδοποιήσεις">
              <div className="px-2 py-1.5 flex items-center justify-between">
                <span className="ui-section-label">Ειδοποιήσεις</span>
                {unread > 0 && <span className="ui-pill ui-pill--blue">{unread}</span>}
              </div>
              <div className="max-h-72 overflow-y-auto mt-1">
                {notifs.length === 0 && <div className="text-center text-[13px] py-6" style={{ color: 'var(--ui-muted)' }}>Καμία ειδοποίηση</div>}
                {notifs.map((n) => {
                  const m = notifMeta(n.type);
                  return (
                    <button key={n.id} className="shell-menu__item !block"
                      onClick={() => goAndClose(() => { if (n.case_id) openCase(n.case_id); })}>
                      <span className="flex items-center gap-1.5 mb-0.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: n.read_at ? 'rgba(15,23,42,0.15)' : m.color }} />
                        <span className="rounded-full px-2 text-[11px] font-medium" style={{ background: rgbaOf(m.color, 0.12), color: m.color }}>{m.label}</span>
                        <span className="ml-auto text-[11px] whitespace-nowrap" style={{ color: 'var(--ui-muted)' }}>{timeUntil(n.created_at)}</span>
                      </span>
                      <span className="block text-[13px] font-medium leading-tight" style={{ color: 'var(--ui-text)' }}>{n.title}</span>
                      {n.body && <span className="block text-xs truncate" style={{ color: 'var(--ui-muted)' }}>{n.body}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <button className="shell-icon shell-hide-narrow" onClick={() => go('preferences')} title="Προσαρμογή CRM" aria-label="Προσαρμογή CRM">
        <SlidersHorizontal className="w-[19px] h-[19px]" strokeWidth={STROKE} aria-hidden="true" />
      </button>

      <div className="relative">
        <button ref={acctRef} className="shell-user" onClick={() => setOpen(open === 'acct' ? null : 'acct')}
          aria-haspopup="menu" aria-expanded={open === 'acct'} aria-label="Λογαριασμός">
          <ShellAvatar name={profile?.full_name} path={profile?.avatar_url} />
          <span className="shell-user__text text-left">
            <span className="shell-user__name block">{profile?.full_name ?? 'Χρήστης'}</span>
            <span className="shell-user__role block">{caption}</span>
          </span>
          <ChevronDown className="w-3.5 h-3.5 shell-user__text" strokeWidth={STROKE} aria-hidden="true" />
        </button>
        {open === 'acct' && (
          <>
            <div className="fixed inset-0 z-50" onClick={() => setOpen(null)} />
            <div className="shell-menu" role="menu" aria-label="Λογαριασμός" ref={menuRef} onKeyDown={onMenuKey}>
              <div className="flex items-center gap-3 px-2 py-2">
                <ShellAvatar name={profile?.full_name} path={profile?.avatar_url} size={44} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold truncate" style={{ color: 'var(--ui-text)' }}>{profile?.full_name ?? 'Χρήστης'}</span>
                  <span className="block text-xs truncate" style={{ color: 'var(--ui-muted)' }}>{user?.email ?? ''}</span>
                </span>
              </div>
              <div className="px-2 pb-2 flex items-center justify-between gap-2">
                <span className="text-[12px]" style={{ color: 'var(--ui-muted)' }}>Ρόλος</span>
                <span className="ui-pill ui-pill--blue">{accessGroupLabel(realRole)}</span>
              </div>
              <div className="shell-menu__sep" />
              <button role="menuitem" className="shell-menu__item" onClick={() => goAndClose(() => go('account'))}>
                <UserCircle className="w-4 h-4" strokeWidth={STROKE} aria-hidden="true" /> Προφίλ &amp; λογαριασμός
              </button>
              <button role="menuitem" className="shell-menu__item" onClick={() => goAndClose(() => go('preferences'))}>
                <SlidersHorizontal className="w-4 h-4" strokeWidth={STROKE} aria-hidden="true" /> Προσαρμογή CRM
              </button>
              {hasAdmin && (
                <button role="menuitem" className="shell-menu__item" onClick={() => goAndClose(() => go('admin'))}>
                  <Settings className="w-4 h-4" strokeWidth={STROKE} aria-hidden="true" /> Διαχείριση
                </button>
              )}
              <button role="menuitem" className="shell-menu__item" onClick={() => goAndClose(() => { window.location.hash = '/faq'; })}>
                <CircleHelp className="w-4 h-4" strokeWidth={STROKE} aria-hidden="true" /> Κέντρο βοήθειας
              </button>
              {preview.allowed && (
                <>
                  <div className="shell-menu__sep" />
                  <div className="px-2 py-1"><RoleSwitcher onPicked={() => setOpen(null)} /></div>
                </>
              )}
              <div className="shell-menu__sep" />
              <button role="menuitem" className="shell-menu__item" style={{ color: '#b3261e' }} onClick={() => { setOpen(null); onSignOut(); }}>
                <LogOut className="w-4 h-4" strokeWidth={STROKE} aria-hidden="true" /> Αποσύνδεση
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
