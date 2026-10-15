/* Check-ins flagged for review (staged phase4/10): far from the stored address, no GPS, poor accuracy, no stored address.
   The check-in itself was accepted; this is the manager's control instead of a hard rejection. */

import { supabase } from './supabase';

export type ReviewFlag = 'far_from_address' | 'gps_uncertain' | 'no_gps' | 'no_target';
export interface FlaggedCheckin {
  id: string; created_at: string; agent: string; case_id: string | null; case_no: string | null; customer: string | null;
  review_flag: ReviewFlag; distance_m: number | null; accuracy_m: number | null; radius_m: number | null;
}

export const FLAG_TEXT: Record<ReviewFlag, string> = {
  far_from_address: 'Μακριά από τη διεύθυνση',
  gps_uncertain: 'Χαμηλή ακρίβεια GPS',
  no_gps: 'Χωρίς θέση GPS',
  no_target: 'Το case δεν έχει διεύθυνση στον χάρτη',
};

export function flagDetail(c: Pick<FlaggedCheckin, 'review_flag' | 'distance_m' | 'accuracy_m' | 'radius_m'>): string {
  if (c.review_flag === 'far_from_address' && c.distance_m != null) return `${Math.round(c.distance_m)} μ (όριο ${c.radius_m ?? 150} μ)`;
  if (c.review_flag === 'gps_uncertain' && c.accuracy_m != null) return `ακρίβεια ±${c.accuracy_m} μ`;
  return '';
}

/** null = the review is not available yet (migration not applied) or the role may not see it. */
export async function fetchFlaggedCheckins(days = 30): Promise<FlaggedCheckin[] | null> {
  const { data, error } = await supabase.rpc('field_checkins_for_review', { p_days: days });
  if (error) return null;
  return (data ?? []) as FlaggedCheckin[];
}

export async function markCheckinReviewed(id: string, note?: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('review_field_checkin', { p_id: id, p_note: note?.trim() || null });
  if (error) return /not allowed|42501/i.test(error.message) ? 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.' : 'Η ενέργεια απέτυχε.';
  return data === false ? 'Έχει ήδη ελεγχθεί.' : null;
}
