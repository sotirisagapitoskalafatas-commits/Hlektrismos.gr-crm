/* Where a planned visit takes place. It is the CASE's stored point (supply address), else the customer's stored
   point. It is never the position of the person planning the visit: an office user planning from the office used
   to save the office as «Σημείο συνάντησης», and the live field_checkin() falls back to that point when the case
   has no coordinates, so the agent's check-in at the customer was then refused or flagged as far away. */

type Point = { lat: number | null; lng: number | null };
type CaseLike = Point & { address?: string | null; customer?: (Point & { address?: string | null; city?: string | null }) | null };

export type MeetingPoint = { label: string; lat: number; lng: number };

const has = <T extends Point>(p: T | null | undefined): p is T & { lat: number; lng: number } =>
  !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng);

/** The stored meeting point, or null when neither the case nor the customer has coordinates (nothing is guessed). */
export function meetingPoint(c: CaseLike): MeetingPoint | null {
  if (has(c)) return { label: c.address?.trim() || c.customer?.address?.trim() || 'Διεύθυνση case', lat: c.lat, lng: c.lng };
  const k = c.customer;
  if (has(k)) return { label: [k.address, k.city].filter(v => v && v.trim()).join(', ') || 'Διεύθυνση πελάτη', lat: k.lat, lng: k.lng };
  return null;
}
