export type LatLng = { lat: number; lng: number };

export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  return Math.round(distanceKm(a, b) * 1000);
}

export function formatDistance(km: number): string {
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} μ`;
  return `${km.toFixed(1).replace('.', ',')} χλμ`;
}

export function durationMinutes(km: number, speedKmh = 45): number {
  return Math.max(1, Math.round((km / speedKmh) * 60));
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} λεπτά`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} ώρες` : `${h} ώρες ${m} λεπτά`;
}