/* Is «sales agents see only their own records» active on the database? (staged SQL phase4/18, docs/ops/PENDING_MIGRATIONS.md)
   The answer comes from the database itself (public.sales_scope_status); when that function does not exist yet the
   caller shows the neutral «not available yet» sentence instead of claiming anything. */

import { supabase } from './supabase';

export interface SalesScope { enabled: boolean; tables: string[] }

/** null = not installed / unreadable (show the neutral message); otherwise the real state. */
export async function fetchSalesScope(): Promise<SalesScope | null> {
  const { data, error } = await supabase.rpc('sales_scope_status');
  if (error || !data || typeof data !== 'object') return null;
  const d = data as { enabled?: unknown; tables?: unknown };
  return { enabled: d.enabled === true, tables: Array.isArray(d.tables) ? d.tables.map(String) : [] };
}
