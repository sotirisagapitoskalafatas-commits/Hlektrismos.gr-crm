import { HaversineRoutingProvider } from './haversine-provider';
import { OsrmRoutingProvider } from './osrm-provider';
import { OrsRoutingProvider } from './ors-provider';
import type { RoutePlan, RouteStop, RoutingProvider } from './types';
import type { NavigationTravelMode } from '@/lib/navigation/external-maps';

const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY as string | undefined;

function buildProviderChain(): RoutingProvider[] {
  const chain: RoutingProvider[] = [new OsrmRoutingProvider()];
  if (ORS_API_KEY) chain.push(new OrsRoutingProvider(ORS_API_KEY));
  chain.push(new HaversineRoutingProvider());
  return chain;
}

export function getRoutingProvider(): RoutingProvider {
  return buildProviderChain()[0];
}

export async function planRoute(stops: RouteStop[], travelMode: NavigationTravelMode = 'driving'): Promise<RoutePlan> {
  if (stops.length < 2) throw new Error('Χρειάζονται τουλάχιστον 2 στάσεις για δρομολόγηση.');

  // OSRM's public endpoint is driving-only. Walking/cycling distances must never be presented as
  // driving directions; use the configured ORS profile when available, otherwise be explicit
  // that the output is a straight-line estimate and defer turn-by-turn navigation to the selected app.
  if (travelMode !== 'driving') {
    if (ORS_API_KEY) {
      const profile = travelMode === 'walking' ? 'foot-walking' : 'cycling-regular';
      try {
        return await new OrsRoutingProvider(ORS_API_KEY, profile).planRoute(stops);
      } catch (error) {
        const estimated = await new HaversineRoutingProvider().planRoute(stops);
        estimated.error = 'Το προφίλ ' + (travelMode === 'walking' ? 'πεζής μετακίνησης' : 'ποδηλάτου')
          + ' δεν είναι διαθέσιμο από τον πάροχο. Η απόσταση είναι ευθείας γραμμής, όχι πραγματική διαδρομή.';
        return estimated;
      }
    }
    const estimated = await new HaversineRoutingProvider().planRoute(stops);
    estimated.error = 'Δεν έχει ρυθμιστεί πάροχος για ' + (travelMode === 'walking' ? 'πεζή μετακίνηση' : 'ποδήλατο')
      + '. Εμφανίζεται μόνο εκτίμηση ευθείας απόστασης· η πλοήγηση ανοίγει στην επιλεγμένη εξωτερική εφαρμογή.';
    return estimated;
  }

  const chain = buildProviderChain();
  let lastError: unknown = null;
  for (const provider of chain) {
    try {
      return await provider.planRoute(stops);
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  const fallback = new HaversineRoutingProvider();
  const plan = await fallback.planRoute(stops);
  plan.error = lastError instanceof Error
    ? lastError.message
    : 'Η υπηρεσία δρομολόγησης δεν είναι διαθέσιμη — χρησιμοποιήθηκε εκτίμηση ευθείας απόστασης.';
  return plan;
}
