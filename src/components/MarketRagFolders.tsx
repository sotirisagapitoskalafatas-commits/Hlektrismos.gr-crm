import { useState, useEffect } from 'react';
import {
  FolderOpen,
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  Zap,
  Building2,
  Clock,
  ExternalLink,
  Search,
  Loader2,
  RefreshCw,
  Tag,
  Euro,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Tariff = {
  id: string;
  provider_name: string;
  program_name: string;
  customer_type: string;
  tariff_color: string | null;
  unit_rate_kwh: number | null;
  fixed_fee_monthly: number | null;
  energy_type: string | null;
  created_at: string;
};

type ProviderInfo = {
  name: string;
  color: string;
  b2c: number;
  b2b: number;
  total: number;
};

const PROVIDER_COLORS: Record<string, string> = {
  'ΔΕΗ': '#1e40af',
  'Protergia': '#dc2626',
  'ΗΡΩΝ': '#059669',
  'ZeniΘ': '#d97706',
  'Elpedison': '#7c3aed',
  'nrg': '#0891b2',
  'Φυσικό Αέριο': '#be185d',
  'Volton': '#4f46e5',
  'We Energy': '#0d9488',
  'Ελίν': '#b91c1c',
};

const ENERGY_ICONS: Record<string, string> = {
  Electricity: '⚡',
  'Natural Gas': '🔥',
  Photovoltaic: '☀️',
  'EV Charging': '🚗',
};

export default function MarketRagFolders() {
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'B2B' | 'B2C'>('B2C');
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadTariffs();
  }, []);

  const loadTariffs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('market_tariffs')
      .select('*')
      .order('provider_name');
    if (data) setTariffs(data);
    setLoading(false);
  };

  const syncTariffs = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke('autonomous-tariff-scraper');
      if (error) throw error;
      await loadTariffs();
    } catch (e: any) {
      alert(`Σφάλμα: ${e.message}`);
    }
    setSyncing(false);
  };

  const toggleProvider = (name: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const providers = [...new Set(tariffs.map((t) => t.provider_name))];

  const providerCounts: ProviderInfo[] = providers.map((p) => ({
    name: p,
    color: PROVIDER_COLORS[p] || '#64748b',
    b2c: tariffs.filter((t) => t.provider_name === p && t.customer_type === 'B2C').length,
    b2b: tariffs.filter((t) => t.provider_name === p && t.customer_type === 'B2B').length,
    total: tariffs.filter((t) => t.provider_name === p).length,
  }));

  const filteredByCategory = tariffs.filter((t) => t.customer_type === activeCategory);

  const filteredProviders = providerCounts.filter((pc) => {
    if (searchQuery === '') return true;
    const q = searchQuery.toLowerCase();
    if (pc.name.toLowerCase().includes(q)) return true;
    return filteredByCategory.some(
      (t) =>
        t.provider_name === pc.name &&
        (t.program_name.toLowerCase().includes(q) || t.provider_name.toLowerCase().includes(q))
    );
  });

  if (loading) {
    return (
      <div className="dash-content" style={{ textAlign: 'center', padding: 64 }}>
        <Loader2
          size={32}
          style={{ animation: 'spin 1s linear infinite', display: 'inline-block', color: 'var(--text-muted)' }}
        />
        <p style={{ marginTop: 12, color: 'var(--text-muted)' }}>Loading market data...</p>
      </div>
    );
  }

  return (
    <div className="dash-content">
      <div className="dash-content-header">
        <p>Browse energy provider programs and market tariffs. Data is fetched dynamically from the database.</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={loadTariffs}>
            <RefreshCw size={16} /> Refresh
          </button>
          <button
            className="btn btn-primary"
            onClick={syncTariffs}
            disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {syncing ? (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <RefreshCw size={16} />
            )}
            {syncing ? 'Syncing...' : 'Sync Tariffs Now'}
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['B2C', 'B2B'] as const).map((cat) => {
          const count = tariffs.filter((t) => t.customer_type === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: activeCategory === cat ? '#00c878' : '#fff',
                color: activeCategory === cat ? '#fff' : 'var(--text)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s',
              }}
            >
              {cat === 'B2C' ? <Zap size={14} /> : <Building2 size={14} />}
              {cat === 'B2C' ? 'Business to Consumer' : 'Business to Business'}
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: activeCategory === cat ? 'rgba(255,255,255,0.25)' : 'var(--surface-2, #f5f7fa)',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search
          size={16}
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search providers, programs..."
          style={{
            width: '100%',
            padding: '10px 14px 10px 38px',
            background: '#fff',
            border: '1px solid var(--border)',
            borderRadius: 10,
            fontSize: 14,
            color: 'var(--text)',
            outline: 'none',
          }}
        />
      </div>

      {/* Provider Folders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {filteredProviders.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <FolderOpen size={32} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
            No providers found for {activeCategory}
          </div>
        )}
        {filteredProviders.map((pc) => {
          const isExpanded = expandedProviders.has(pc.name);
          const providerTariffs = filteredByCategory
            .filter((t) => t.provider_name === pc.name)
            .filter(
              (t) =>
                searchQuery === '' ||
                t.program_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.provider_name.toLowerCase().includes(searchQuery.toLowerCase())
            );
          const count = activeCategory === 'B2C' ? pc.b2c : pc.b2b;
          return (
            <div
              key={pc.name}
              style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}
            >
              {/* Provider header */}
              <div
                onClick={() => toggleProvider(pc.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 18px',
                  cursor: 'pointer',
                  background: isExpanded ? 'var(--surface-2, #f5f7fa)' : '#fff',
                  transition: 'background 0.15s',
                }}
              >
                {isExpanded ? (
                  <ChevronDown size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                ) : (
                  <ChevronRight size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                )}
                {isExpanded ? (
                  <FolderOpen size={20} style={{ color: pc.color, flexShrink: 0 }} />
                ) : (
                  <Folder size={20} style={{ color: pc.color, flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{pc.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {count} tariff{count !== 1 ? 's' : ''} &middot; {pc.b2c} B2C, {pc.b2b} B2B
                  </div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 8, background: `${pc.color}15`, color: pc.color, fontSize: 12, fontWeight: 700 }}>
                  {count} plans
                </span>
              </div>

              {/* Tariff list */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px' }}>
                  {providerTariffs.length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No tariffs found for this category
                    </div>
                  )}
                  {providerTariffs.map((t) => (
                    <div
                      key={t.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 10,
                        border: '1px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <FileText size={18} style={{ color: pc.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{t.program_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span>{ENERGY_ICONS[t.energy_type || ''] || '⚡'} {t.energy_type || '—'}</span>
                          {t.unit_rate_kwh != null && <span>€{t.unit_rate_kwh}/kWh</span>}
                          {t.fixed_fee_monthly != null && t.fixed_fee_monthly > 0 && <span>€{t.fixed_fee_monthly}/mo fixed</span>}
                        </div>
                      </div>
                      {t.tariff_color && (
                        <span
                          style={{
                            padding: '3px 10px',
                            borderRadius: 6,
                            background: t.tariff_color,
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {t.tariff_color}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Market Tariffs Summary Table */}
      <div style={{ marginTop: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Euro size={18} /> Market Tariffs ({filteredByCategory.length})
        </h3>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Program</th>
                <th>Color</th>
                <th>€/kWh</th>
                <th>Fixed Fee</th>
                <th>Energy Type</th>
              </tr>
            </thead>
            <tbody>
              {filteredByCategory.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong style={{ color: PROVIDER_COLORS[t.provider_name] || 'var(--text)' }}>
                      {t.provider_name}
                    </strong>
                  </td>
                  <td>{t.program_name}</td>
                  <td>
                    {t.tariff_color ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '2px 10px',
                          borderRadius: 6,
                          background: t.tariff_color,
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                        {t.tariff_color}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ fontWeight: 700, color: '#00c878' }}>
                    {t.unit_rate_kwh != null ? `€${t.unit_rate_kwh}` : '—'}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {t.fixed_fee_monthly != null && t.fixed_fee_monthly > 0 ? `€${t.fixed_fee_monthly}/mo` : '—'}
                  </td>
                  <td>{t.energy_type || '—'}</td>
                </tr>
              ))}
              {filteredByCategory.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                    No tariffs for {activeCategory}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
