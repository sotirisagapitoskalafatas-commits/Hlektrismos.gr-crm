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
  address?: string;
  phone?: string;
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


export type BusinessCandidate = {
  id: string;
  label: string;
  sublabel?: string;
  /** Public OSM street address, when the feature carries one. */
  address?: string;
  /** Public OSM phone tag, when present. */
  phone?: string;
  position: MapCoordinate;
  category?: string;
  source: 'OpenStreetMap / Photon';
  sourceUrl: string;
};

function businessCategory(properties: Record<string, string>): string | undefined {
  const key = properties.osm_key || properties.category || '';
  const value = properties.osm_value || '';
  const allowed = new Set(['shop', 'office', 'craft', 'industrial', 'commercial', 'amenity', 'healthcare', 'leisure', 'tourism']);
  if (!allowed.has(key)) return undefined;
  return [key, value].filter(Boolean).join(' · ');
}

function pointToSegmentKm(point: MapCoordinate, a: MapCoordinate, b: MapCoordinate): number {
  const latScale = 111.32;
  const lngScale = 111.32 * Math.cos((point.lat * Math.PI) / 180);
  const ax = (a.lng - point.lng) * lngScale;
  const ay = (a.lat - point.lat) * latScale;
  const bx = (b.lng - point.lng) * lngScale;
  const by = (b.lat - point.lat) * latScale;
  const dx = bx - ax;
  const dy = by - ay;
  const denominator = dx * dx + dy * dy;
  const t = denominator > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / denominator)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

function distanceToRouteKm(point: MapCoordinate, route: MapCoordinate[]): number {
  if (route.length === 0) return Infinity;
  if (route.length === 1) {
    const lat = (route[0].lat - point.lat) * 111.32;
    const lng = (route[0].lng - point.lng) * 111.32 * Math.cos((point.lat * Math.PI) / 180);
    return Math.hypot(lat, lng);
  }
  let distance = Infinity;
  for (let i = 1; i < route.length; i++) distance = Math.min(distance, pointToSegmentKm(point, route[i - 1], route[i]));
  return distance;
}

/**
 * Searches named OSM features near a route through Photon. Results are limited to public map data,
 * a small number of sampled route centres, and a configurable corridor; it does not imply complete business coverage.
 */
export async function discoverBusinessesAlongRoute(
  query: string,
  route: MapCoordinate[],
  radiusKm = 1.25,
): Promise<BusinessCandidate[]> {
  const q = query.trim();
  if (q.length < 2 || route.length === 0) return [];
  const centreIndexes = route.length <= 3
    ? route.map((_, i) => i)
    : [...new Set([0, Math.floor((route.length - 1) / 2), route.length - 1])];
  const centres = centreIndexes.map(i => route[i]);
  const candidates = await Promise.all(centres.map(async (centre) => {
    try {
      const params = new URLSearchParams({ q, limit: '10', lat: String(centre.lat), lon: String(centre.lng) });
      const response = await fetch(PHOTON_URL + '?' + params.toString(), { headers: { Accept: 'application/json' } });
      if (!response.ok) return [] as BusinessCandidate[];
      const json = await response.json() as { features?: PhotonFeature[] };
      const found: BusinessCandidate[] = [];
      for (const feature of json.features ?? []) {
        const props = feature.properties ?? {};
        const name = (props.name ?? '').trim();
        const category = businessCategory(props);
        const coordinates = feature.geometry?.coordinates;
        const lat = coordinates?.[1];
        const lng = coordinates?.[0];
        if (!name || !category || typeof lat !== 'number' || typeof lng !== 'number') continue;
        const position = { lat, lng };
        if (distanceToRouteKm(position, route) > radiusKm) continue;
        const line = labelOf(props);
        const sourceUrl = 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=18/' + lat + '/' + lng;
        found.push({
          id: name.toLocaleLowerCase('el') + '-' + lat.toFixed(5) + '-' + lng.toFixed(5),
          label: name,
          sublabel: [line.sublabel, category].filter(Boolean).join(' · ') || undefined,
          address: [props.street ? [props.street, props.housenumber].filter(Boolean).join(' ') : '', props.postcode || '', areaOf(props), props.state || ''].filter(Boolean).join(', ') || undefined,
          phone: props.phone || props['contact:phone'] || undefined,
          position,
          category,
          source: 'OpenStreetMap / Photon',
          sourceUrl,
        });
      }
      return found;
    } catch {
      return [] as BusinessCandidate[];
    }
  }));
  const seen = new Set<string>();
  return candidates.flat().filter(candidate => {
    const key = candidate.label.toLocaleLowerCase('el') + '|' + candidate.position.lat.toFixed(5) + ',' + candidate.position.lng.toFixed(5);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => distanceToRouteKm(a.position, route) - distanceToRouteKm(b.position, route));
}
