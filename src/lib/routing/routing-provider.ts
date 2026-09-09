import { HaversineRoutingProvider } from './haversine-provider';
import { OrsRoutingProvider } from './ors-provider';
import type { RoutePlan, RouteStop, RoutingProvider } from './types';

const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY as string | undefined;

export function getRoutingProvider(): RoutingProvider {
  if (ORS_API_KEY) return new OrsRoutingProvider(ORS_API_KEY);
  return new HaversineRoutingProvider();
}

export async function planRoute(stops: RouteStop[]): Promise<RoutePlan> {
  const provider = getRoutingProvider();
  try {
    return await provider.planRoute(stops);
  } catch (err) {
    const fallback = new HaversineRoutingProvider();
    const plan = await fallback.planRoute(stops);
    plan.error = err instanceof Error ? err.message : 'Η υπηρεσία δρομολόγησης δεν είναι διαθέσιμη — χρησιμοποιήθηκε εκτίμηση ευθείας απόστασης.';
    return plan;
  }
}