/* Role preview («Επίδειξη ρόλου») — presentation only.
   - Availability is decided by the server (rpc role_preview_status: allowlisted QA Admin account, hard expiry
     16/10/2026 00:00 Europe/Athens). The browser adds the same hard stop as a second guard and fails closed.
   - While a preview is active, every write the browser would send is refused locally (see supabase.ts), so a demo
     can never change real data. The preview never touches profiles.role, the JWT or any server permission:
     it only changes which screens the UI renders. It is NOT a security test of the previewed role. */

/** 16 Oct 2026 00:00 in Athens (EEST, UTC+3). */
export const ROLE_PREVIEW_HARD_STOP = Date.parse('2026-10-16T00:00:00+03:00');

/** RPCs that only read and may run during a preview. Everything else that is not GET/HEAD counts as a write. */
export const PREVIEW_READ_RPCS = new Set([
  'field_checkins_for_review', // staged phase4/10 (read-only)
  'role_preview_status', 'role_preview_event', 'staff_list', 'staff_reference_count',
  'get_active_tariff_prices', 'recommend_tariffs', 'field_sales_metrics', 'crm_scraper_settings',
  // read-only functions of the staged phase2/phase3 migrations
  'trash_list', 'trash_references', 'case_document_blockers', 'b2b_queries_today', 'contact_facts',
]);

/** Would this request change data? (pure, unit-tested) */
export function isMutation(rawUrl: string, method: string | undefined): boolean {
  const m = (method ?? 'GET').toUpperCase();
  let path = rawUrl;
  try { path = new URL(rawUrl, 'http://x').pathname; } catch { /* keep raw */ }
  if (path.includes('/auth/v1/')) return false; // token refresh / sign-out must keep working
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return false;
  const rpc = /\/rest\/v1\/rpc\/([a-z0-9_]+)/i.exec(path);
  if (rpc) return !PREVIEW_READ_RPCS.has(rpc[1]);
  return path.includes('/rest/v1/') || path.includes('/storage/v1/') || path.includes('/functions/v1/');
}

let active = false;
export const isPreviewActive = () => active;
export const setPreviewActive = (v: boolean) => { active = v; };

export const PREVIEW_BLOCKED_EVENT = 'atlas:preview-blocked';

/** Server answer → effective availability, using the server clock (never the browser clock alone). */
export function previewAllowed(status: { allowed?: unknown; expires_at?: unknown; server_now?: unknown } | null, clientNow: number, offsetMs: number): boolean {
  if (!status || status.allowed !== true) return false;
  const exp = Date.parse(String(status.expires_at ?? ''));
  const nowServer = clientNow + offsetMs;
  return Number.isFinite(exp) && nowServer < exp && nowServer < ROLE_PREVIEW_HARD_STOP;
}
