import type { MapCoordinate } from '../maps/types';

/* ------------------------------------------------------------------ *
 *  Geocoding provider (place / address search + reverse geocoding).   *
 *                                                                     *
 *  Backed by Photon (Komoot) — an OpenStreetMap geocoder that needs   *
 *  no API key and returns streets, businesses, landmarks and places.  *
 *  NOTE: the public Photon server only accepts lang de|en|fr|it (else *
 *  HTTP 400), so we send NO lang param — Photon then returns names in  *
 *  the local OSM language, which for Greece is Greek. This is a        *
 *  distinct capability from CRM search (fetchFieldTargets) and from    *
 *  routing (planRoute); the map's search box combines CRM results with *
 *  these place results, each tagged by source.                        *
 * ------------------------------------------------------------------ */

export type GeocodeResult = {
  label: string;
  sublabel?: string;
  position: MapCoordinate;
  source: 'crm' | 'geocoder';
};

export type GeocodeLookupResult = {
  address?: string;
  label?: string;
  position?: MapCoordinate;
};

const PHOTON_URL = 'https://photon.komoot.io/api/';
const PHOTON_REVERSE_URL = 'https://photon.komoot.io/reverse';
/* Athens/Attica centre — used to bias results toward the operating area. */
const DEFAULT_BIAS: MapCoordinate = { lat: 37.98, lng: 23.73 };

type PhotonFeature = {
  properties?: Record<string, string>;
  geometry?: { coordinates?: number[] };
};

function areaOf(p: Record<string, string>): string {
  return p.city || p.town || p.village || p.district || p.locality || p.suburb || '';
}

/* Human label for a Photon feature. Works for streets (name on the road),
   house numbers, businesses/landmarks (name), and administrative places. */
function labelOf(p: Record<string, string>): { label: string; sublabel: string } {
  const road = p.name || p.street || '';
  const line1 = p.housenumber && road ? `${road} ${p.housenumber}` : road;
  const area = areaOf(p);
  const region = p.state || p.county || '';
  const label = line1 || area || p.country || '';
  const sublabel = [line1 ? area : '', region, !area && !region ? p.country : '']
    .filter(Boolean)
    .join(', ');
  return { label, sublabel };
}

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodeLookupResult | null> {
  try {
    const res = await fetch(`${PHOTON_REVERSE_URL}?lat=${lat}&lon=${lng}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { features?: PhotonFeature[] };
    const f = json.features?.[0];
    if (!f?.properties) return null;
    const p = f.properties;
    const { label, sublabel } = labelOf(p);
    return {
      address: p.housenumber && (p.name || p.street) ? `${p.name || p.street} ${p.housenumber}`.trim() : (p.name || p.street),
      label: [label, sublabel].filter(Boolean).join(', ') || undefined,
      position: { lat, lng },
    };
  } catch {
    return null;
  }
}

export async function geocodeAddress(
  query: string,
  origin?: MapCoordinate,
): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const bias = origin ?? DEFAULT_BIAS;
    /* Photon biases toward lat/lon params (NOT a "bias=proximity" string). */
    /* No lang param — the public Photon server rejects lang=el with HTTP 400. */
    const params = new URLSearchParams({
      q,
      limit: '6',
      lat: String(bias.lat),
      lon: String(bias.lng),
    });
    const res = await fetch(`${PHOTON_URL}?${params.toString()}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const json = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const out: GeocodeResult[] = [];
    for (const f of json.features ?? []) {
      const g = f.geometry?.coordinates;
      const lat = g?.[1];
      const lng = g?.[0];
      /* Only requirement: real coordinates. Do NOT filter by OSM type —
         that previously dropped every street, business and landmark. */
      if (typeof lat !== 'number' || typeof lng !== 'number' || (lat === 0 && lng === 0)) continue;
      const p = f.properties ?? {};
      const { label, sublabel } = labelOf(p);
      if (!label) continue;
      const key = `${label}|${lat.toFixed(5)},${lng.toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label, sublabel: sublabel || undefined, position: { lat, lng }, source: 'geocoder' });
    }
    return out;
  } catch {
    return [];
  }
}
