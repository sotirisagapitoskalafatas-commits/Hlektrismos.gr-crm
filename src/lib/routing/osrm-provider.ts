import type { MapCoordinate } from '../maps/types';
import type { RouteLeg, RoutePlan, RouteStop, RoutingProvider } from './types';

type OsrmRoute = {
  geometry?: { type?: string; coordinates?: number[][] };
  legs?: Array<{ distance?: number; duration?: number }>;
  summary?: { distance?: number; duration?: number };
};

export class OsrmRoutingProvider implements RoutingProvider {
  async planRoute(stops: RouteStop[]): Promise<RoutePlan> {
    if (stops.length < 2) throw new Error('Χρειάζονται τουλάχιστον 2 στάσεις για δρομολόγηση.');

    const coords = stops.map(s => `${s.position.lng},${s.position.lat}`).join(';');
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
    const json = (await res.json()) as { code?: string; routes?: OsrmRoute[] };
    if (json.code !== 'Ok' || !json.routes?.length) throw new Error('Δεν βρέθηκε δρομολόγιο OSRM.');

    const route = json.routes[0];
    const legs: RouteLeg[] = (route.legs ?? []).map((leg, i) => ({
      fromIndex: i,
      toIndex: i + 1,
      distanceMeters: Math.round(leg.distance ?? 0),
      durationSeconds: Math.round(leg.duration ?? 0),
    }));

    let polyline: MapCoordinate[] | undefined;
    const coords2d = route.geometry?.coordinates;
    if (coords2d?.length) {
      polyline = coords2d.map(([lng, lat]) => ({ lat, lng }));
    }

    return {
      legs,
      totalDistanceMeters: Math.round(route.summary?.distance ?? legs.reduce((s, l) => s + l.distanceMeters, 0)),
      totalDurationSeconds: Math.round(route.summary?.duration ?? legs.reduce((s, l) => s + l.durationSeconds, 0)),
      polyline,
      source: 'osrm',
      estimated: false,
      error: null,
    };
  }
}
