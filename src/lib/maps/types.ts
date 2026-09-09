export type MapCoordinate = { lat: number; lng: number };

export type MapMarkerData = {
  id: string;
  position: MapCoordinate;
  title: string;
  subtitle?: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
};

export type MapProviderOpts = {
  center?: MapCoordinate;
  zoom?: number;
  onMarkerClick?: (id: string) => void;
  onMapClick?: () => void;
};

export interface MapProvider {
  init(container: HTMLElement, opts?: MapProviderOpts): Promise<void>;
  isReady(): boolean;
  addMarkers(markers: MapMarkerData[]): void;
  clearMarkers(): void;
  fitBounds(coords: MapCoordinate[], opts?: { padding?: number; maxZoom?: number }): void;
  setViewport(center: MapCoordinate, zoom?: number): void;
  invalidateSize(): void;
  drawRoute(points: MapCoordinate[], color?: string): void;
  clearRoute(): void;
  destroy(): void;
}