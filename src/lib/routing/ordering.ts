/* Stop ordering — one interface, so the free/local logic can later be swapped for a real optimisation service
   (e.g. OpenRouteService optimisation, Google Route Optimization, Mapbox Optimization) WITHOUT touching the screens.
   No paid provider and no API key here: those wait for the owner's decision.

   Built-in providers (pure, no network):
     scheduled — by scheduled visit time, unscheduled last (the behaviour the route panel always had; default)
     nearest   — greedy nearest-neighbour from the first stop (or a given start), straight-line distance
   Chosen with VITE_STOP_ORDERING (scheduled | nearest). An unknown value falls back to «scheduled».
   The route LINE (distance/time) still comes from routing-provider.ts; replacing the public OSRM demo server there is
   part of the same provider decision. */

import { distanceKm } from '../geo/distance';

export interface OrderStop { id: string; lat: number; lng: number; scheduledAt?: string | null }
export interface OrderResult<S extends OrderStop> { stops: S[]; provider: string; note?: string }
export interface StopOrderingProvider {
  id: string;
  label: string;
  /** Must return every stop exactly once. `start` is the agent's position when known. */
  order<S extends OrderStop>(stops: S[], start?: { lat: number; lng: number } | null): Promise<OrderResult<S>>;
}

const t = (s?: string | null) => (s ? new Date(s).getTime() : NaN);

export const scheduledOrdering: StopOrderingProvider = {
  id: 'scheduled',
  label: 'Με βάση την ώρα επίσκεψης',
  async order(stops) {
    const out = [...stops].sort((a, b) => {
      const x = t(a.scheduledAt), y = t(b.scheduledAt);
      if (Number.isFinite(x) && Number.isFinite(y)) return x - y;
      if (Number.isFinite(x)) return -1;
      if (Number.isFinite(y)) return 1;
      return 0;
    });
    return { stops: out, provider: 'scheduled' };
  },
};

export const nearestOrdering: StopOrderingProvider = {
  id: 'nearest',
  label: 'Πλησιέστερη επόμενη στάση (ευθεία απόσταση)',
  async order(stops, start) {
    const left = [...stops];
    const out: typeof stops = [];
    let here = start ?? (left.length ? { lat: left[0].lat, lng: left[0].lng } : null);
    while (left.length && here) {
      let best = 0;
      for (let i = 1; i < left.length; i++) if (distanceKm(here, left[i]) < distanceKm(here, left[best])) best = i;
      const [next] = left.splice(best, 1);
      out.push(next);
      here = { lat: next.lat, lng: next.lng };
    }
    return { stops: out, provider: 'nearest', note: 'Ευθεία απόσταση — όχι βελτιστοποίηση με οδικό δίκτυο.' };
  },
};

const PROVIDERS: Record<string, StopOrderingProvider> = { scheduled: scheduledOrdering, nearest: nearestOrdering };

export function getOrderingProvider(id: string | undefined = import.meta.env?.VITE_STOP_ORDERING as string | undefined): StopOrderingProvider {
  return PROVIDERS[(id ?? '').trim()] ?? scheduledOrdering;
}
