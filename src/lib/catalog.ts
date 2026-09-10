import { supabase } from './supabase';

export type CatalogProvider = {
  id: string;
  name: string;
  slug: string;
  category: string;
  aliases: string[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  code: string;
  category: string;
  provider_id: string | null;
};

export type Catalog = {
  providers: CatalogProvider[];
  products: CatalogProduct[];
};

let catalogCache: Catalog | null = null;
let catalogPromise: Promise<Catalog | null> | null = null;

export async function loadCatalog(refresh = false): Promise<Catalog | null> {
  if (catalogCache && !refresh) return catalogCache;
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    try {
      if (!supabase) return null;
      const [providersRes, productsRes] = await Promise.all([
        supabase.from('providers').select('id, name, slug, category, metadata').order('name'),
        supabase.from('products').select('id, name, code, category, provider_id').order('name'),
      ]);
      if (providersRes.error || productsRes.error) return null;
      catalogCache = {
        providers: (providersRes.data ?? []).map(p => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          category: p.category,
          aliases: Array.isArray(p.metadata?.aliases) ? p.metadata.aliases : [],
        })),
        products: (productsRes.data ?? []) as CatalogProduct[],
      };
      return catalogCache;
    } finally {
      catalogPromise = null;
    }
  })();
  return catalogPromise;
}

export function legacyLabelKey(v: string | null | undefined): string {
  return (v ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function resolveProviderId(label: string | null | undefined, catalog: Catalog | null = null): string | null {
  const key = legacyLabelKey(label);
  if (!key || !catalog) return null;
  const matches = catalog.providers.filter(
    p =>
      legacyLabelKey(p.name) === key ||
      legacyLabelKey(p.slug) === key ||
      p.aliases.some(a => legacyLabelKey(a) === key),
  );
  return matches.length === 1 ? matches[0].id : null;
}

export function productCodeFor(program: string | null | undefined): string | null {
  const v = (program ?? '').toLowerCase();
  if (!v) return null;
  if (v.includes('φωτοβολταϊκ') || v.includes('solar') || v.includes('ηλιακ')) return 'solar';
  if (v.includes('αέριο') || v.includes('gaz') || v.includes('gas')) return 'gas';
  if (v.includes('ηλεκτροκίνη') || v.includes('φόρτισ') || v.includes('φορτισ') || v === 'ev') return 'ev';
  if (v.includes('ασφαλ')) return 'insurance';
  if (v.includes('ιστοσελίδ') || v.includes('web')) return 'web';
  return null;
}

export function productCodeForCategory(category: string | null | undefined): string | null {
  switch (category) {
    case 'electricity':
      return 'energy';
    case 'gas':
      return 'gas';
    case 'solar':
      return 'solar';
    case 'ev':
      return 'ev';
    case 'insurance':
      return 'insurance';
    case 'web':
      return 'web';
    default:
      return null;
  }
}

export function resolveProductId(
  program: string | null | undefined,
  providerId: string | null | undefined,
  catalog: Catalog | null = null,
): string | null {
  if (!catalog) return null;
  const code =
    productCodeFor(program) ??
    (providerId ? productCodeForCategory(catalog.providers.find(p => p.id === providerId)?.category) : null);
  if (!code) return null;
  const matches = catalog.products.filter(p => p.code === code);
  return matches.length === 1 ? matches[0].id : null;
}

export type CatalyzedRow = {
  provider?: string | null;
  program?: string | null;
  provider_id?: string | null;
  product_id?: string | null;
};

export function applyCanonicalLabels<T extends CatalyzedRow>(rows: T[], catalog: Catalog | null): T[] {
  if (!catalog) return rows;
  for (const row of rows) {
    if (row.provider_id) {
      const provider = catalog.providers.find(p => p.id === row.provider_id);
      if (provider) row.provider = provider.name;
    }
    if (row.product_id) {
      const product = catalog.products.find(p => p.id === row.product_id);
      if (product) row.program = product.name;
    }
  }
  return rows;
}