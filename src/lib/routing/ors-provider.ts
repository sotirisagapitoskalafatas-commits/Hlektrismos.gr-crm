import type { MapCoordinate } from '../maps/types';
import { decodePolyline } from './polyline';
import type { RouteLeg, RoutePlan, RouteStop, RoutingProvider } from './types';

type OrsSegment = { distance?: number; duration?: number };
type OrsRoute = {
  summary?: { distance?: number; duration?: number };
  segments?: OrsSegment[];
  geometry?: string;
};

export class OrsRoutingProvider implements RoutingProvider {
  constructor(private apiKey: string) {}

  async planRoute(stops: RouteStop[]): Promise<RoutePlan> {
    if (stops.length < 2) throw new Error('Χρειάζονται τουλάχιστον 2 στάσεις για δρομολόγηση.');
    const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: this.apiKey },
      body: JSON.stringify({ coordinates: stops.map(s => [s.position.lng, s.position.lat]) }),
    });
    if (!res.ok) throw new Error(`openrouteservice HTTP ${res.status}`);
    const json = (await res.json()) as { routes?: OrsRoute[] };
    const route = json.routes?.[0];
    if (!route) throw new Error('Δεν βρέθηκε διαδρομή.');

    const legs: RouteLeg[] = (route.segments ?? []).map((seg, i) => ({
      fromIndex: i,
      toIndex: i + 1,
      distanceMeters: Math.round(seg.distance ?? 0),
      durationSeconds: Math.round(seg.duration ?? 0),
    }));

    let polyline: MapCoordinate[] | undefined;
    if (route.geometry) {
      polyline = decodePolyline(route.geometry).map(([lat, lng]) => ({ lat, lng }));
    }

    return {
      legs,
      totalDistanceMeters: Math.round(route.summary?.distance ?? legs.reduce((s, l) => s + l.distanceMeters, 0)),
      totalDurationSeconds: Math.round(route.summary?.duration ?? legs.reduce((s, l) => s + l.durationSeconds, 0)),
      polyline,
      source: 'ors',
      estimated: false,
      error: null,
    };
  }
}