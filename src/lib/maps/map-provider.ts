import type { MapProvider } from './types';

export async function createMap(): Promise<MapProvider> {
  const mod = await import('./maplibre-provider');
  return mod.createMaplibreProvider();
}