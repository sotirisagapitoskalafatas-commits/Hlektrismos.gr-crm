import { useState } from 'react';
import { Navigation } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Btn } from '@/lib/ui';
import { fieldAllowed } from '@/lib/field-sales/policy';
import { getCurrentLocation } from '@/lib/geo/location';
import { addActivity } from '@/lib/api';
import {
  NAV_APP_OPTIONS,
  NAVIGATION_ERRORS,
  assertValidLocation,
  buildNavigationUrl,
  getNavigationPreference,
  getNavigationService,
  navigationAppLabel,
  resolveNavigationApp,
  setNavigationPreference,
} from '@/lib/navigation/external-maps';
import type { LocationCoords, NavigationApp } from '@/lib/navigation/external-maps';

type Props = {
  destination: LocationCoords;
  origin?: LocationCoords | null;
  waypoints?: LocationCoords[];
  caseId?: string;
  label?: string;
  variant?: 'primary' | 'outline' | 'ghost' | 'brand' | 'ok' | 'stop';
  className?: string;
  showSelector?: boolean;
};

/* Hand-off button: Πλοήγηση → native Google/Apple/Waze.
   The CRM decides the destination/context; the native app does the
   turn-by-turn. Origin is optional (never fabricated). Logs
   NavigationStarted on the case timeline when a caseId is present. */
export default function NavigationButton({
  destination,
  origin,
  waypoints,
  caseId,
  label = 'Πλοήγηση',
  variant = 'outline',
  className = '',
  showSelector = true,
}: Props) {
  const { role } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [app, setApp] = useState<NavigationApp>(() => getNavigationPreference());

  if (!fieldAllowed(role, 'route')) return null;

  const changeApp = (next: NavigationApp) => {
    setApp(next);
    setNavigationPreference(next);
    toast(`Προτίμηση πλοήγησης: ${navigationAppLabel(next)}`, 'info');
  };

  const handleNavigate = async () => {
    try {
      assertValidLocation(destination, 'Destination');
    } catch {
      toast(NAVIGATION_ERRORS.INVALID_DESTINATION, 'warn');
      return;
    }

    let useOrigin = origin ?? null;
    if (!useOrigin) {
      try {
        const l = await getCurrentLocation();
        useOrigin = { lat: l.lat, lng: l.lng };
      } catch {
        /* destination-only navigation is fine */
      }
    }

    const request = { destination, origin: useOrigin, waypoints, app };
    try {
      buildNavigationUrl(request);
    } catch (e) {
      const code = (e as Error).message;
      toast(code === 'INVALID_ORIGIN' ? NAVIGATION_ERRORS.INVALID_ORIGIN : NAVIGATION_ERRORS.INVALID_DESTINATION, 'warn');
      return;
    }

    if (caseId && role) {
      void addActivity(caseId, {
        role,
        activity_type: 'navigation',
        title: 'Ξεκίνησε πλοήγηση',
        description: destination.label ?? `${destination.lat}, ${destination.lng}`,
        location: { lat: destination.lat, lng: destination.lng, label: destination.label ?? null },
        metadata: {
          navigation_app: resolveNavigationApp(app),
          origin: useOrigin ? { lat: useOrigin.lat, lng: useOrigin.lng } : null,
        },
      });
    }

    setBusy(true);
    try {
      await getNavigationService().openDirections(request);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Btn variant={variant} className={className} onClick={() => void handleNavigate()} disabled={busy}>
        <Navigation className="w-3.5 h-3.5" /> {label}
      </Btn>
      {showSelector && (
        <select
          value={app}
          onChange={e => changeApp(e.target.value as NavigationApp)}
          aria-label="Εφαρμογή πλοήγησης"
          title="Εφαρμογή πλοήγησης"
          onClick={e => e.stopPropagation()}
          className="px-1.5 py-1.5 rounded-lg border border-line bg-white text-[11px] text-ink/70 focus:outline-none focus:border-brand-500 appearance-none cursor-pointer"
        >
          {NAV_APP_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      )}
    </div>
  );
}