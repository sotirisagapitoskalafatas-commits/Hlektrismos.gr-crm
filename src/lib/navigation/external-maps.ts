/* ---------------- External Native Navigation Service ----------------
   The CRM knows the destination and route context but does NOT implement
   turn-by-turn navigation. Navigation is handed off to a native app:
     Google Maps / Apple Maps / Waze
   via official HTTPS universal URLs. On mobile the OS/browser resolves the
   URL to the installed app; on desktop it falls back to the browser.

   The rule: never navigate using invalid or fabricated coordinates.
   Preference resolution: saved user preference, else platform default
   (iOS → Apple Maps, Android/other → Google Maps).
   Origin is optional — if GPS is unavailable we still allow destination-only
   navigation. We never fabricate an origin. */

export type NavigationApp = 'auto' | 'google' | 'apple' | 'waze';
export type NavigationTravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

export interface LocationCoords {
  lat: number;
  lng: number;
  label?: string;
}

export interface NavigationRequest {
  destination: LocationCoords;
  origin?: LocationCoords | null;
  waypoints?: LocationCoords[];
  app?: NavigationApp;
  travelMode?: NavigationTravelMode;
}

export type NavigationErrorCode =
  | 'INVALID_DESTINATION'
  | 'INVALID_ORIGIN'
  | 'GPS_PERMISSION_DENIED'
  | 'LOCATION_UNAVAILABLE'
  | 'NAVIGATION_UNAVAILABLE'
  | 'OFFLINE';

export const NAVIGATION_ERRORS: Record<NavigationErrorCode, string> = {
  INVALID_DESTINATION: 'Μη έγκυρος προορισμός (INVALID DESTINATION).',
  INVALID_ORIGIN: 'Μη έγκυρη αφετηρία (INVALID ORIGIN).',
  GPS_PERMISSION_DENIED: 'Αρνηθήκατε την πρόσβαση στη θέση. Ενεργοποιήστε την άδεια GPS.',
  LOCATION_UNAVAILABLE: 'Η θέση σας δεν είναι διαθέσιμη (LOCATION UNAVAILABLE).',
  NAVIGATION_UNAVAILABLE: 'Η πλοήγηση δεν είναι διαθέσιμη σε αυτή τη συσκευή.',
  OFFLINE: 'Εκτός σύνδεσης. Η πλοήγηση μπορεί να μην είναι διαθέσιμη.',
};

export function isValidCoordinate(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

export function assertValidLocation(location: LocationCoords, label: string): void {
  if (!isValidCoordinate(location.lat, -90, 90) || !isValidCoordinate(location.lng, -180, 180)) {
    throw new Error(label === 'Destination' ? 'INVALID_DESTINATION' : 'INVALID_ORIGIN');
  }
}

export function getPlatform(): 'ios' | 'android' | 'other' {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent ?? '' : '';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/* ---------------- URL builders ---------------- */

export function buildGoogleMapsUrl(request: NavigationRequest): string {
  assertValidLocation(request.destination, 'Destination');

  const params = new URLSearchParams({
    api: '1',
    destination: `${request.destination.lat},${request.destination.lng}`,
    travelmode: request.travelMode ?? 'driving',
    dir_action: 'navigate',
  });

  if (request.origin) {
    assertValidLocation(request.origin, 'Origin');
    params.set('origin', `${request.origin.lat},${request.origin.lng}`);
  }

  if (request.waypoints && request.waypoints.length > 0) {
    const valid = request.waypoints.filter(w => isValidCoordinate(w.lat, -90, 90) && isValidCoordinate(w.lng, -180, 180));
    if (valid.length > 0) {
      params.set('waypoints', valid.map(w => `${w.lat},${w.lng}`).join('|'));
    }
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildAppleMapsUrl(request: NavigationRequest): string {
  assertValidLocation(request.destination, 'Destination');

  const params = new URLSearchParams({
    daddr: `${request.destination.lat},${request.destination.lng}`,
    dirflg: 'd',
  });

  if (request.destination.label) {
    params.set('q', encodeURIComponent(request.destination.label));
  }
  if (request.origin) {
    assertValidLocation(request.origin, 'Origin');
    params.set('saddr', `${request.origin.lat},${request.origin.lng}`);
  }

  return `https://maps.apple.com/?${params.toString()}`;
}

export function buildWazeUrl(request: NavigationRequest): string {
  assertValidLocation(request.destination, 'Destination');

  const params = new URLSearchParams({
    ll: `${request.destination.lat},${request.destination.lng}`,
    navigate: 'yes',
    zoom: '17',
  });

  return `https://waze.com/ul?${params.toString()}`;
}

/* ---------------- App resolution ---------------- */

export function resolveNavigationApp(preference: NavigationApp): 'google' | 'apple' | 'waze' {
  if (preference === 'apple') return 'apple';
  if (preference === 'waze') return 'waze';
  if (preference === 'google') return 'google';
  return getPlatform() === 'ios' ? 'apple' : 'google';
}

export function buildNavigationUrl(request: NavigationRequest): string {
  const app = resolveNavigationApp(request.app ?? 'auto');
  switch (app) {
    case 'apple': return buildAppleMapsUrl(request);
    case 'waze': return buildWazeUrl(request);
    case 'google': default: return buildGoogleMapsUrl(request);
  }
}

export function openExternalNavigation(request: NavigationRequest): void {
  const url = buildNavigationUrl(request);
  // Normal web/PWA behavior: allow the OS/browser to resolve the universal URL.
  window.location.assign(url);
}

/* ---------------- Service abstraction (web → Capacitor later) ---------------- */

export interface NavigationService {
  openDirections(request: NavigationRequest): Promise<void>;
}

export class WebNavigationService implements NavigationService {
  async openDirections(request: NavigationRequest): Promise<void> {
    openExternalNavigation(request);
  }
}

export class CapacitorNavigationService extends WebNavigationService {
  // Native adapter for Capacitor/Cordova. Until the Browser plugin is wired in,
  // it inherits the universal-URL web behavior which still launches installed
  // maps apps on Android/iOS.
}

export function getNavigationService(): NavigationService {
  const hasCapacitor = typeof window !== 'undefined' && typeof (window as { Capacitor?: unknown }).Capacitor !== 'undefined';
  return hasCapacitor ? new CapacitorNavigationService() : new WebNavigationService();
}

/* ---------------- User preference (per browser/user, like other nav prefs) ---------------- */

export const NAV_APP_OPTIONS: { id: NavigationApp; label: string }[] = [
  { id: 'auto', label: 'Αυτόματο' },
  { id: 'google', label: 'Google Maps' },
  { id: 'apple', label: 'Apple Maps' },
  { id: 'waze', label: 'Waze' },
];

const NAV_APP_KEY = 'atlas.nav.app';

export function getNavigationPreference(): NavigationApp {
  if (typeof window === 'undefined') return 'auto';
  const v = window.localStorage.getItem(NAV_APP_KEY);
  return v === 'google' || v === 'apple' || v === 'waze' ? v : 'auto';
}

export function setNavigationPreference(app: NavigationApp): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(NAV_APP_KEY, app);
  window.dispatchEvent(new Event('atlas:prefs'));
}

export function navigationAppLabel(app: NavigationApp): string {
  return NAV_APP_OPTIONS.find(o => o.id === app)?.label ?? app;
}