import type { MapCoordinate } from '../maps/types';

export function navigationUrl(
  dest: MapCoordinate,
  opts?: { origin?: MapCoordinate; waypoints?: MapCoordinate[]; label?: string },
): string {
  const p = new URLSearchParams({ api: '1', travelmode: 'driving' });
  if (opts?.origin) p.set('origin', `${opts.origin.lat},${opts.origin.lng}`);
  p.set('destination', `${dest.lat},${dest.lng}`);
  if (opts?.waypoints && opts.waypoints.length > 0) {
    p.set('waypoints', opts.waypoints.map(w => `${w.lat},${w.lng}`).join('|'));
  }
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

export function openNavigation(dest: MapCoordinate, opts?: { origin?: MapCoordinate; waypoints?: MapCoordinate[]; label?: string }) {
  window.open(navigationUrl(dest, opts), '_blank', 'noopener,noreferrer');
}