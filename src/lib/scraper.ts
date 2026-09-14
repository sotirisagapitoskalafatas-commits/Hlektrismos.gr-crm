/* ------------------------------------------------------------------ */
/*  B2B Prospecting (scraper) — data layer.                            */
/*                                                                     */
/*  Search runs in the `scrape-b2b` edge function (SerpApi Google Maps  */
/*  engine, key held server-side in crm_settings). The import step      */
/*  stays on the client so scraped businesses enter the CRM through     */
/*  createLead() — same attribution, provider resolution and pipeline   */
/*  status as a hand-typed lead.                                       */
/* ------------------------------------------------------------------ */

import { supabase } from './supabase';
import { createLead } from './api';

export type ScrapedBusiness = {
  company: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  category: string;
  region: string;
  source: string;
  rating: number | null;
  totalReviews: number | null;
  placeId: string | null;
  lat: number | null;
  lng: number | null;
};

export type ScrapeSourceInfo = { api: string; query: string; region: string; ll: string };

export type ScrapeResult = {
  businesses: ScrapedBusiness[];
  sourceInfo: ScrapeSourceInfo | null;
  error: string | null;
};

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

/* ---------------- Search ---------------- */

export async function runB2BScrape(params: {
  category: string; region: string; maxResults: number;
}): Promise<ScrapeResult> {
  const empty: ScrapeResult = { businesses: [], sourceInfo: null, error: null };
  if (!supabase) return { ...empty, error: 'Η σύνδεση με τη βάση δεν είναι διαθέσιμη.' };
  try {
    const { data, error } = await supabase.functions.invoke('scrape-b2b', {
      body: {
        category: params.category,
        region: params.region,
        maxResults: params.maxResults,
        importToDb: false,
      },
    });
    if (error) throw error;
    if (data?.error) return { ...empty, error: String(data.error) };
    const businesses = Array.isArray(data?.businesses) ? (data.businesses as ScrapedBusiness[]) : [];
    return { businesses, sourceInfo: (data?.source_info ?? null) as ScrapeSourceInfo | null, error: null };
  } catch (e) {
    logError('runB2BScrape', e);
    const msg = e instanceof Error ? e.message : String(e);
    return { ...empty, error: `Η αναζήτηση απέτυχε: ${msg}` };
  }
}

/* ---------------- Import to the lead pipeline ---------------- */

export function normalizePhone(v: string | null | undefined): string {
  const digits = (v ?? '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function existingLeadPhones(): Promise<Set<string>> {
  const out = new Set<string>();
  if (!supabase) return out;
  const { data, error } = await supabase.from('leads').select('phone');
  if (error) { logError('existingLeadPhones', error); return out; }
  for (const row of data ?? []) {
    const p = normalizePhone((row as { phone: string | null }).phone);
    if (p) out.add(p);
  }
  return out;
}

export type ImportOutcome = { imported: number; duplicates: number; failed: number };

/* Scraped businesses become `import` leads tagged with a source label —
   `leads.source` is a constrained enum, so the scraper identifies itself
   through source_label instead of a new source value. */
export async function importScrapedBusinesses(
  list: ScrapedBusiness[],
  opts?: { serviceCategory?: string },
): Promise<ImportOutcome> {
  const outcome: ImportOutcome = { imported: 0, duplicates: 0, failed: 0 };
  const known = await existingLeadPhones();
  const service = opts?.serviceCategory ?? 'energy';

  for (const b of list) {
    const phone = normalizePhone(b.phone);
    if (phone && known.has(phone)) { outcome.duplicates++; continue; }

    const notes = [
      `Πηγή: ${b.source === 'serpapi' ? 'SerpApi Google Maps' : b.source}`,
      b.category ? `Κατηγορία: ${b.category}` : null,
      b.address ? `Διεύθυνση: ${b.address}` : null,
      b.website ? `Ιστοσελίδα: ${b.website}` : null,
      b.rating ? `Αξιολόγηση: ${b.rating} (${b.totalReviews ?? 0} κριτικές)` : null,
    ].filter(Boolean).join(' | ');

    const lead = await createLead({
      full_name: b.company,
      company: b.company,
      phone: b.phone || null,
      email: b.email || null,
      address: b.address || null,
      region: b.region || null,
      service_category: service,
      lead_type: 'B2B',
      source: 'import',
      source_label: 'B2B Scraper · Google Maps',
      status: 'new',
      comments: notes,
      lat: b.lat ?? null,
      lng: b.lng ?? null,
      location_source: b.lat != null && b.lng != null ? 'scraper' : null,
    });

    if (lead) { outcome.imported++; if (phone) known.add(phone); }
    else outcome.failed++;
  }
  return outcome;
}

/* ---------------- CSV export ---------------- */

export function businessesToCsv(list: ScrapedBusiness[]): string {
  const headers = ['Εταιρεία', 'Κατηγορία', 'Περιοχή', 'Τηλέφωνο', 'Ιστοσελίδα', 'Διεύθυνση', 'Πηγή', 'Αξιολόγηση', 'Κριτικές'];
  const rows = list.map(r => [
    r.company, r.category, r.region, r.phone, r.website, r.address, r.source,
    r.rating != null ? String(r.rating) : '', r.totalReviews != null ? String(r.totalReviews) : '',
  ]);
  const esc = (c: string) => `"${(c ?? '').replace(/"/g, '""')}"`;
  /* BOM keeps Greek readable when Excel opens the file. */
  return '﻿' + [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
}

/* ---------------- Settings (admin) ---------------- */

export type ScraperConfig = {
  max_results: number;
  rate_limit_per_minute: number;
  auto_import: boolean;
  default_region: string;
  default_category: string;
};

export const DEFAULT_SCRAPER_CONFIG: ScraperConfig = {
  max_results: 20,
  rate_limit_per_minute: 10,
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
