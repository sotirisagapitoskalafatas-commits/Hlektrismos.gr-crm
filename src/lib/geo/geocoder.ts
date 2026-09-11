import type { MapCoordinate } from '../maps/types';

export type GeocodeResult = {
  label: string;
  position: MapCoordinate;
  source: 'crm' | 'geocoder';
};

export type GeocodeLookupResult = {
  address?: string;
  label?: string;
  position?: MapCoordinate;
};

const PHOTON_URL = 'https://photon.komoot.io/api/';
const PHOTON_BIAS = 'bias=proximity:23.73,37.98';
const ACCEPTED_TYPES = ['house', 'street', 'venue', 'city', 'town', 'village', 'hamlet', 'suburb', 'neighbourhood'];

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodeLookupResult | null> {
  try {
    const res = await fetch(`${PHOTON_URL}?lat=${lat}&lon=${lng}&${PHOTON_BIAS}&limit=1`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: Array<{ properties?: Record<string, string>; geometry?: { coordinates?: number[] } }> };
    const f = json.features?.[0];
    if (!f) return null;
    const p = f.properties ?? {};
    const label = [p.name, p.city || p.town || p.village, p.county || p.state, p.country].filter(Boolean).join(', ');
    return { address: p.housenumber ? `${p.name || ''} ${p.housenumber}`.trim() : p.name, label, position: { lat, lng } };
  } catch {
    return null;
  }
}

export async function geocodeAddress(
  query: string,
  origin?: MapCoordinate,
): Promise<GeocodeResult[]> {
  if (!query || query.length < 2) return [];
  try {
    const params = new URLSearchParams({ q: query, limit: '5', lang: 'el' });
    params.set('bias', origin ? `proximity:${origin.lng},${origin.lat}` : PHOTON_BIAS.split('bias=')[1]);
    const res = await fetch(`${PHOTON_URL}?${params}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: Array<{ properties?: Record<string, string>; geometry?: { coordinates?: number[] } }> };
    return (json.features ?? [])
      .filter(f => ACCEPTED_TYPES.includes(f.properties?.osm_value ?? f.properties?.osm_key ?? ''))
      .map(f => {
        const p = f.properties ?? {};
        const g = f.geometry?.coordinates;
        const addr = [p.name, p.housenumber, p.city || p.town || p.village, p.county || p.state].filter(Boolean).join(', ');
        return { label: addr || query, position: { lat: g?.[1] ?? 0, lng: g?.[0] ?? 0 }, source: 'geocoder' as const };
      })
      .filter(r => r.position.lat !== 0 || r.position.lng !== 0);
  } catch {
    return [];
  }
}
