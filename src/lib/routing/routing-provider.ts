import { HaversineRoutingProvider } from './haversine-provider';
import { OsrmRoutingProvider } from './osrm-provider';
import { OrsRoutingProvider } from './ors-provider';
import type { RoutePlan, RouteStop, RoutingProvider } from './types';

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

export async function planRoute(stops: RouteStop[]): Promise<RoutePlan> {
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