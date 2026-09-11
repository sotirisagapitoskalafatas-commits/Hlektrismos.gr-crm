import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ROLES, roleLabel } from '@/lib/roles';
import type { Role } from '@/lib/roles';
import { Btn, Card, CardHeader, Micro, Pill } from '@/lib/ui';
import { getNavigationPreference, setNavigationPreference, NAV_APP_OPTIONS, navigationAppLabel } from '@/lib/navigation/external-maps';
import type { NavigationApp } from '@/lib/navigation/external-maps';
import { History, Navigation, PanelLeft, RefreshCcw, SlidersHorizontal, UserCog } from 'lucide-react';

export function dispatchPrefsChanged() {
  window.dispatchEvent(new Event('atlas:prefs'));
}

export default function PreferencesPage() {
  const { role, profile, setRoleOverride, clearRoleOverride } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('atlas.nav.collapsed') === '1');
  const [navApp, setNavApp] = useState<NavigationApp>(() => getNavigationPreference());

  const realRole = profile?.role ?? null;
  const sim = role !== realRole;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('atlas.nav.collapsed', next ? '1' : '0');
    dispatchPrefsChanged();
  };

  const changeNavApp = (next: NavigationApp) => {
    setNavApp(next);
    setNavigationPreference(next);
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Micro tone="brand">Προτιμήσεις</Micro>
        <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Ρυθμίσεις εργασίας</h2>
      </div>

      {/* Interface */}
      <Card>
        <CardHeader micro="Περιβάλλον εργασίας" title="Εμφάνιση" className="mb-3" />
        <div className="space-y-1">
          <label className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 cursor-pointer hover:border-ink/25 transition-colors">
            <PanelLeft className="w-4 h-4 text-ink/40 shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] font-medium text-ink">Σύμπτυξη sidebar</span>
              <span className="block text-xs text-ink/45">Η πλευρική πλοήγηση εμφανίζεται συμπτυγμένη ως εικονίδια.</span>
            </span>
            <input type="checkbox" checked={collapsed} onChange={toggleCollapsed}
              className="w-4 h-4 accent-brand-500" aria-label="Σύμπτυξη sidebar" />
          </label>
        </div>
        <p className="text-[11px] text-ink/40 mt-3 flex items-center gap-1.5">
          <SlidersHorizontal className="w-3 h-3" />
          Οι προτιμήσεις αποθηκεύονται τοπικά σε αυτόν τον browser και εφαρμόζονται αμέσως.
        </p>
      </Card>

      {/* Navigation app */}
      <Card>
        <CardHeader micro="Πλοήγηση" title="Εφαρμογή πλοήγησης" className="mb-3" />
        <select value={navApp} onChange={e => changeNavApp(e.target.value as NavigationApp)}
          aria-label="Εφαρμογή πλοήγησης"
          className="w-full sm:w-72 text-[13px] font-medium bg-white border border-line rounded-lg px-2 py-2 text-ink focus:outline-none focus:border-brand-500 appearance-none">
          {NAV_APP_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <div className="flex items-start gap-2 text-[11px] text-ink/40 mt-3">
          <Navigation className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span className="flex-1 text-xs text-ink/45">
            Με «Αυτόματο» η πιο ενδεδειγμένη εφαρμογή επιλέγεται αυτόματα (Apple Maps σε iOS, αλλιώς Google Maps).
            Τα κουμπιά «Πλοήγηση» της εφαρμογής τη χρησιμοποιούν άμεσα. Τρέχουσα: <strong className="text-ink/70">{navigationAppLabel(navApp)}</strong>
          </span>
        </div>
      </Card>

      {/* Role simulator */}
      <Card>
        <CardHeader micro="Επίδειξη" title="Προσομοίωση ρόλου" className="mb-3" />
        <div className="flex items-center gap-2 mb-3">
          <Pill tone={sim ? 'amber' : 'green'}>{sim ? 'sim' : 'πραγματικός'}</Pill>
          <span className="text-[13px] text-ink/70">
            Τρέχων ρόλος: <strong className="text-ink">{roleLabel(role)}</strong>
            {sim && realRole ? <span className="text-ink/45 font-normal"> (φυσικός: {roleLabel(realRole)})</span> : null}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select value={role} onChange={e => setRoleOverride(e.target.value as Role)}
            aria-label="Προσομοίωση ρόλου"
            className="flex-1 sm:flex-none sm:w-64 text-[13px] font-medium bg-white border border-line rounded-lg px-2 py-2 text-ink focus:outline-none focus:border-brand-500 appearance-none">
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          {sim && (
            <Btn variant="outline" onClick={clearRoleOverride} title="Επαναφορά στον φυσικό ρόλο">
              <RefreshCcw className="w-3.5 h-3.5" /> Επαναφορά
            </Btn>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-ink/45 mt-3 bg-ink/[0.03] rounded-lg px-3 py-2">
          <UserCog className="w-3.5 h-3.5 shrink-0" />
          Η προσομοίωση είναι προσωρινή και βοηθά στην επίδειξη των ρόλων. Ο φυσικός ρόλος προέρχεται από τον λογαριασμό σας.
        </div>
      </Card>

      {/* History */}
      <Card>
        <CardHeader micro="Αλλαγές" title="Πώς προσφέρονται οι προτιμήσεις" className="mb-3" />
        <div className="flex items-center gap-2 text-[11px] text-ink/45">
          <History className="w-3.5 h-3.5 shrink-0" />
          Η σύμπτυξη και η προσομοίωση ρόλου εφαρμόζονται άμεσα σε όλη την εφαρμογή χωρίς ανανέωση.
        </div>
      </Card>
    </div>
  );
}