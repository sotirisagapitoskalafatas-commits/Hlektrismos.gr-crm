/* B2B scraper — shared labels and admin settings. The search itself runs in the scrape-b2b edge function
   (key server-side) and lands in the B2B review queue (lib/b2b.ts), never directly in leads. */

import { supabase } from './supabase';

/* Business categories the edge function knows how to query. */
export const B2B_CATEGORIES: { value: string; label: string }[] = [
  { value: 'energy', label: 'Εταιρείες Ενέργειας' },
  { value: 'solar', label: 'Φωτοβολταϊκά & Solar' },
  { value: 'ev_charging', label: 'Σταθμοί Φόρτισης EV' },
  { value: 'real_estate', label: 'Ακίνητα & Μεσιτικά' },
  { value: 'construction', label: 'Κατασκευαστικές & Εργοληπτικές' },
  { value: 'restaurant', label: 'Εστιατόρια & Ταβέρνες' },
  { value: 'hotel', label: 'Ξενοδοχεία & Ενοικιαζόμενα' },
  { value: 'retail', label: 'Λιανικό Εμπόριο & Καταστήματα' },
  { value: 'technology', label: 'Τεχνολογία & Software' },
  { value: 'healthcare', label: 'Υγεία & Ιατρικά' },
  { value: 'automotive', label: 'Αυτοκίνητο & Επισκευές' },
  { value: 'professional', label: 'Επαγγελματικές Υπηρεσίες' },
  { value: 'education', label: 'Εκπαίδευση & Φροντιστήρια' },
  { value: 'fitness', label: 'Γυμναστήρια & Sports' },
  { value: 'beauty', label: 'Ομορφιά & Salon' },
  { value: 'logistics', label: 'Μεταφορές & Logistics' },
  { value: 'bakery', label: 'Φούρνοι & Αρτοποιεία' },
  { value: 'manufacturing', label: 'Βιομηχανία & Παραγωγή' },
  { value: 'agriculture', label: 'Γεωργία & Αγροκτήματα' },
  { value: 'other', label: 'Άλλες Επιχειρήσεις' },
];

/* Regions with Google Maps coordinates in the edge function. */
export const GREEK_REGIONS: string[] = [
  'Αττική', 'Θεσσαλονίκη', 'Κεντρική Ελλάδα', 'Πελοπόννησος',
  'Κρήτη', 'Ιόνια Νησιά', 'Θεσσαλία', 'Ήπειρος',
  'Δυτική Ελλάδα', 'Στερεά Ελλάδα', 'Νησιά Αιγαίου', 'Δυτική Μακεδονία',
  'Ανατολική Μακεδονία & Θράκη', 'Βόρειο Αιγαίο',
];

export function categoryLabel(value: string): string {
  return B2B_CATEGORIES.find(c => c.value === value)?.label ?? value;
}

function logError(method: string, err: unknown) {
  console.error(`[atlas.scraper] ${method}:`, err);
}

/* ---------------- Settings (admin) ---------------- */

export type ScraperConfig = {
  max_results: number;
  /** Used as the cap of searches per run (scrape-b2b). */
  rate_limit_per_minute: number;
  /** Searches allowed per day for the whole workspace (Europe/Athens). */
  daily_query_limit?: number;
  auto_import: boolean;
  default_region: string;
  default_category: string;
};

export const DEFAULT_SCRAPER_CONFIG: ScraperConfig = {
  max_results: 20,
  rate_limit_per_minute: 10,
  daily_query_limit: 100,
  auto_import: false,
  default_region: 'Αττική',
  default_category: 'energy',
};

export type ScraperSettings = { keySet: boolean; config: ScraperConfig };

/* The SerpApi key never leaves the server: the RPC reports only whether
   one is configured. */
export async function fetchScraperSettings(): Promise<ScraperSettings | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('crm_scraper_settings');
  if (error) { logError('fetchScraperSettings', error); return null; }
  const row = (data ?? null) as { key_set?: boolean; config?: Partial<ScraperConfig> } | null;
  if (!row) return null;
  return {
    keySet: row.key_set === true,
    config: { ...DEFAULT_SCRAPER_CONFIG, ...(row.config ?? {}) },
  };
}

export async function saveScraperConfig(config: ScraperConfig): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('crm_set_scraper_config', { p_config: config });
  if (error) { logError('saveScraperConfig', error); return false; }
  return true;
}

export async function setScraperKey(key: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc('crm_set_scraper_key', { p_key: key });
  if (error) { logError('setScraperKey', error); return false; }
  return true;
}
