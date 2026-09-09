import { distanceKm, durationMinutes } from '@/lib/geo/distance';
import type { RouteLeg, RoutePlan, RouteStop, RoutingProvider } from './types';

export class HaversineRoutingProvider implements RoutingProvider {
  async planRoute(stops: RouteStop[]): Promise<RoutePlan> {
    const legs: RouteLeg[] = [];
    for (let i = 0; i < stops.length - 1; i++) {
      const km = distanceKm(stops[i].position, stops[i + 1].position);
      legs.push({
        fromIndex: i,
        toIndex: i + 1,
        distanceMeters: Math.round(km * 1000),
        durationSeconds: durationMinutes(km) * 60,
      });
    }
    return {
      legs,
      totalDistanceMeters: legs.reduce((s, l) => s + l.distanceMeters, 0),
      totalDurationSeconds: legs.reduce((s, l) => s + l.durationSeconds, 0),
      polyline: undefined,
      source: 'haversine',
      estimated: true,
      error: null,
    };
  }
}