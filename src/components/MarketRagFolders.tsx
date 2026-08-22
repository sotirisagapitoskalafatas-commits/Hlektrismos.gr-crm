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
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Link2,
  Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import TariffDetailSlideout from './TariffDetailSlideout';

type TariffRow = {
  tariff_id: string;
  provider_name: string;
  program_name: string;
  customer_type: string;
  tariff_color: string | null;
  energy_type: string | null;
  official_url: string | null;
  requires_dual_zone_meter: boolean;
  base_price_day: number | null;
  base_price_night: number | null;
  unit_rate_kwh: number | null;
  fixed_fee_monthly: number | null;
  discounted_price_day: number | null;
  discounted_price_night: number | null;
  discount_conditions: string | null;
  validity_from: string | null;
  validity_until: string | null;
  verification_status: string;
};

type ProviderInfo = {
  name: string;
  color: string;
  b2c: number;
  b2b: number;
  total: number;
  verified: number;
  needsReview: number;
};

const PROVIDER_COLORS: Record<string, string> = {
  'ΔΕΗ': '#1e40af',
  Protergia: '#dc2626',
  'ΗΡΩΝ': '#059669',
  'ZeniΘ': '#d97706',
  nrg: '#0891b2',
  'Φυσικό Αέριο': '#be185d',
  Volton: '#4f46e5',
  'Ελίν': '#b91c1c',
  'Enerwave': '#0ea5e9',
  'Eunice Power': '#7c3aed',
};

const COLOR_BADGES: Record<string, { bg: string; fg: string; label: string }> = {
  green: { bg: '#dcfce7', fg: '#16a34a', label: 'Πράσινο' },
  blue: { bg: '#dbeafe', fg: '#2563eb', label: 'Μπλε' },
  yellow: { bg: '#fef9c3', fg: '#ca8a04', label: 'Κίτρινο' },
  orange: { bg: '#ffedd5', fg: '#ea580c', label: 'Πορτοκαλί' },
};

const ENERGY_ICONS: Record<string, string> = {
  electricity: '⚡',
  gas: '🔥',
  solar: '☀️',
  ev_charging: '🚗',
};

export default function MarketRagFolders() {
  const [tariffs, setTariffs] = useState<TariffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'B2B' | 'B2C'>('B2C');
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [selectedTariff, setSelectedTariff] = useState<TariffRow | null>(null);

  useEffect(() => {
    loadTariffs();
  }, []);

  const loadTariffs = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_active_tariff_prices');
    if (error) {
      console.error('[MarketRagFolders] RPC error, falling back to direct query:', error);
      const { data: fallback } = await supabase
        .from('energy_tariffs')
        .select('id, provider_name, program_name, customer_type, tariff_color, energy_type, official_url, requires_dual_zone_meter, is_active')
        .eq('is_active', true)
        .order('provider_name');
      if (fallback) {
        setTariffs(
          fallback.map((t: any) => ({
            tariff_id: t.id,
            provider_name: t.provider_name,
            program_name: t.program_name,
            customer_type: typeof t.customer_type === 'string' ? t.customer_type : String(t.customer_type || 'B2C'),
            tariff_color: typeof t.tariff_color === 'string' ? t.tariff_color : String(t.tariff_color || 'green'),
            energy_type: t.energy_type || 'electricity',
            official_url: t.official_url,
            requires_dual_zone_meter: t.requires_dual_zone_meter || false,
            base_price_day: null,
            base_price_night: null,
            unit_rate_kwh: null,
            fixed_fee_monthly: null,
            discounted_price_day: null,
            discounted_price_night: null,
            discount_conditions: null,
            validity_from: null,
            validity_until: null,
            verification_status: 'unverified',
          }))
        );
      }
    } else if (data) {
      setTariffs(data);
    }
    setLoading(false);
  };

  const syncTariffs = async () => {
    setSyncing(true);
    const providers = ['ΔΕΗ', 'Protergia', 'ΗΡΩΝ', 'nrg', 'ZeniΘ', 'Volton', 'Φυσικό Αέριο', 'Ελίν', 'Enerwave', 'Eunice Power'];
    let synced = 0;
    let failed = 0;
    for (const provider of providers) {
      try {
        console.log(`[sync] ${provider}...`);
        const { error } = await supabase.functions.invoke('scrape-program-details', {
          body: { provider },
        });
        if (error) throw error;
        synced++;
      } catch (e: any) {
        console.error(`[sync] Failed ${provider}:`, e.message);
        failed++;
      }
    }
    await loadTariffs();
    alert(`Sync ολοκληρώθηκε: ${synced} επιτυχή / ${failed} αποτυχίες`);
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

  const providerCounts: ProviderInfo[] = providers.map((p) => {
    const pTariffs = tariffs.filter((t) => t.provider_name === p);
    return {
      name: p,
      color: PROVIDER_COLORS[p] || '#64748b',
      b2c: pTariffs.filter((t) => t.customer_type === 'B2C').length,
      b2b: pTariffs.filter((t) => t.customer_type === 'B2B').length,
      total: pTariffs.length,
      verified: pTariffs.filter((t) => t.verification_status === 'verified').length,
      needsReview: pTariffs.filter((t) => t.verification_status === 'needs_review').length,
    };
  });

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
      {selectedTariff && (
        <TariffDetailSlideout
          tariff={{
            tariff_id: selectedTariff.tariff_id,
            provider_name: selectedTariff.provider_name,
            program_name: selectedTariff.program_name,
            customer_type: selectedTariff.customer_type,
            tariff_color: selectedTariff.tariff_color,
            energy_type: selectedTariff.energy_type,
            official_url: selectedTariff.official_url,
            terms_pdf_url: null,
            requires_dual_zone_meter: selectedTariff.requires_dual_zone_meter,
            base_price_day: selectedTariff.base_price_day,
            base_price_night: selectedTariff.base_price_night,
            unit_rate_kwh: selectedTariff.unit_rate_kwh,
            fixed_fee_monthly: selectedTariff.fixed_fee_monthly,
            discounted_price_day: selectedTariff.discounted_price_day,
            discounted_price_night: selectedTariff.discounted_price_night,
            discount_conditions: selectedTariff.discount_conditions,
            validity_from: selectedTariff.validity_from,
            validity_until: selectedTariff.validity_until,
            verification_status: selectedTariff.verification_status,
          }}
          onClose={() => setSelectedTariff(null)}
        />
      )}

      <div className="dash-content-header">
        <p>Ετήσιο κατάλογος προγραμμάτων ενέργειας. Δεδομένα από τη βάση δεδομένων με επίσημες συνδέσεις παρόχων.</p>
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
                {/* Verification badges on provider header */}
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {pc.verified > 0 && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: '#dcfce7',
                        color: '#16a34a',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      <ShieldCheck size={10} />
                      {pc.verified}
                    </span>
                  )}
                  {pc.needsReview > 0 && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: '#fef9c3',
                        color: '#ca8a04',
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    >
                      <ShieldAlert size={10} />
                      {pc.needsReview}
                    </span>
                  )}
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
                  {providerTariffs.map((t) => {
                    const colorBadge = t.tariff_color ? COLOR_BADGES[t.tariff_color] : null;
                    const isVerified = t.verification_status === 'verified';
                    const needsReview = t.verification_status === 'needs_review';
                    return (
                      <div
                        key={t.tariff_id}
                        onClick={() => setSelectedTariff(t)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 14px',
                          borderRadius: 10,
                          border: '1px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f8fafc';
                          e.currentTarget.style.borderColor = 'var(--border)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.borderColor = 'transparent';
                        }}
                      >
                        <FileText size={18} style={{ color: pc.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{t.program_name}</span>
                            {/* Verification indicator */}
                            {isVerified && (
                              <ShieldCheck size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
                            )}
                            {needsReview && (
                              <ShieldAlert size={13} style={{ color: '#ca8a04', flexShrink: 0 }} />
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            <span>{ENERGY_ICONS[t.energy_type || ''] || '⚡'} {t.energy_type || '—'}</span>
                            {t.unit_rate_kwh != null && <span>€{t.unit_rate_kwh}/kWh</span>}
                            {t.fixed_fee_monthly != null && t.fixed_fee_monthly > 0 && <span>€{t.fixed_fee_monthly}/mo fixed</span>}
                            {t.discounted_price_day != null && (
                              <span style={{ color: '#059669', fontWeight: 500 }}>€{t.discounted_price_day}/kWh (disc.)</span>
                            )}
                          </div>
                        </div>
                        {/* Color badge */}
                        {colorBadge && (
                          <span
                            style={{
                              padding: '3px 10px',
                              borderRadius: 6,
                              background: colorBadge.bg,
                              color: colorBadge.fg,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {colorBadge.label}
                          </span>
                        )}
                        {/* Official URL indicator */}
                        {t.official_url && (
                          <Link2 size={12} style={{ color: '#2563eb', flexShrink: 0, opacity: 0.5 }} />
                        )}
                      </div>
                    );
                  })}
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
                <th>Energy</th>
                <th>Verified</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {filteredByCategory.map((t) => {
                const isVerified = t.verification_status === 'verified';
                const needsReview = t.verification_status === 'needs_review';
                return (
                  <tr
                    key={t.tariff_id}
                    onClick={() => setSelectedTariff(t)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    <td>
                      <strong style={{ color: PROVIDER_COLORS[t.provider_name] || 'var(--text)' }}>
                        {t.provider_name}
                      </strong>
                    </td>
                    <td>{t.program_name}</td>
                    <td>
                      {t.tariff_color && COLOR_BADGES[t.tariff_color] ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '2px 10px',
                            borderRadius: 6,
                            background: COLOR_BADGES[t.tariff_color].bg,
                            color: COLOR_BADGES[t.tariff_color].fg,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              background: COLOR_BADGES[t.tariff_color].fg,
                              display: 'inline-block',
                            }}
                          />
                          {COLOR_BADGES[t.tariff_color].label}
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
                    <td>
                      {isVerified && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#16a34a', fontSize: 11, fontWeight: 600 }}>
                          <ShieldCheck size={12} />
                        </span>
                      )}
                      {needsReview && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#ca8a04', fontSize: 11, fontWeight: 600 }}>
                          <ShieldAlert size={12} />
                        </span>
                      )}
                      {!isVerified && !needsReview && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#94a3b8', fontSize: 11 }}>
                          <ShieldQuestion size={12} />
                        </span>
                      )}
                    </td>
                    <td>
                      {t.official_url ? (
                        <a
                          href={t.official_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ color: '#2563eb' }}
                        >
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredByCategory.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
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
