import type { MapCoordinate } from '../maps/types';

export type RouteStop = {
  id: string;
  label: string;
  position: MapCoordinate;
  scheduledAt?: string | null;
};

export type RouteLeg = {
  fromIndex: number;
  toIndex: number;
  distanceMeters: number;
  durationSeconds: number;
};

export type RoutePlan = {
  legs: RouteLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  polyline?: MapCoordinate[];
  source: 'osrm' | 'ors' | 'haversine';
  estimated: boolean;
  error?: string | null;
};

export interface RoutingProvider {
  planRoute(stops: RouteStop[]): Promise<RoutePlan>;
}