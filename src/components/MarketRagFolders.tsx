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

type ProviderDoc = {
  id: string;
  provider_name: string;
  program_name: string;
  category: string;
  energy_type: string;
  price_per_kwh: number | null;
  fixed_fee_monthly: number | null;
  document_title: string;
  file_path: string;
  extracted_text: string | null;
  source_url: string | null;
  last_verified: string | null;
  created_at: string;
};

type Tariff = {
  id: string;
  resource: string;
  tariff_name: string;
  price_eur: number;
  unit: string;
  provider_name: string | null;
  program_name: string | null;
  last_verified: string | null;
};

type ProviderFolder = {
  name: string;
  docs: ProviderDoc[];
};

const PROVIDER_COLORS: Record<string, string> = {
  'ΔΕΗ': '#1a73e8',
  'Protergia': '#00c878',
  'ΗΡΩΝ': '#f59e0b',
};

const ENERGY_ICONS: Record<string, string> = {
  'Electricity': '⚡',
  'Natural Gas': '🔥',
  'Photovoltaic': '☀️',
  'EV Charging': '🚗',
};

export default function MarketRagFolders() {
  const [docs, setDocs] = useState<ProviderDoc[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<'B2B' | 'B2C'>('B2C');
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [selectedDoc, setSelectedDoc] = useState<ProviderDoc | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [docsRes, tariffsRes] = await Promise.all([
      supabase.from('hlektrismos_provider_docs').select('*').order('provider_name'),
      supabase.from('market_tariffs').select('*').order('resource'),
    ]);
    if (docsRes.data) setDocs(docsRes.data);
    if (tariffsRes.data) setTariffs(tariffsRes.data);
    setLoading(false);
  };

  const toggleProvider = (name: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Group docs by provider within active category
  const filteredDocs = docs.filter(
    (d) =>
      d.category === activeCategory &&
      (searchQuery === '' ||
        d.provider_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.program_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.document_title.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const providerFolders: ProviderFolder[] = [];
  const providerMap = new Map<string, ProviderDoc[]>();
  for (const doc of filteredDocs) {
    const existing = providerMap.get(doc.provider_name) || [];
    existing.push(doc);
    providerMap.set(doc.provider_name, existing);
  }
  for (const [name, providerDocs] of providerMap) {
    providerFolders.push({ name, docs: providerDocs });
  }
  providerFolders.sort((a, b) => a.name.localeCompare(b.name, 'el'));

  // Tariffs for active category
  const filteredTariffs = tariffs.filter((t) => {
    if (activeCategory === 'B2C') return t.unit === '€/kWh';
    return true;
  });

  if (loading) {
    return (
      <div className="dash-content" style={{ textAlign: 'center', padding: 64 }}>
        <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', color: 'var(--text-muted)' }} />
        <p style={{ marginTop: 12, color: 'var(--text-muted)' }}>Loading market data...</p>
      </div>
    );
  }

  return (
    <div className="dash-content">
      <div className="dash-content-header">
        <p>Browse energy provider programs and market tariffs. Documents are indexed for RAG retrieval by AI agents.</p>
        <button className="btn btn-ghost" onClick={loadData}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['B2C', 'B2B'] as const).map((cat) => (
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
            <span style={{
              padding: '2px 8px',
              borderRadius: 12,
              background: activeCategory === cat ? 'rgba(255,255,255,0.25)' : 'var(--surface-2, #f5f7fa)',
              fontSize: 11,
              fontWeight: 700,
            }}>
              {cat === 'B2C' ? docs.filter((d) => d.category === 'B2C').length : docs.filter((d) => d.category === 'B2B').length}
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
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
        {providerFolders.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <FolderOpen size={32} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
            No provider documents found for {activeCategory}
          </div>
        )}
        {providerFolders.map((folder) => {
          const isExpanded = expandedProviders.has(folder.name);
          const color = PROVIDER_COLORS[folder.name] || 'var(--text-muted)';
          return (
            <div key={folder.name} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
              {/* Provider header */}
              <div
                onClick={() => toggleProvider(folder.name)}
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
                {isExpanded ? <ChevronDown size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <ChevronRight size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                {isExpanded ? <FolderOpen size={20} style={{ color, flexShrink: 0 }} /> : <Folder size={20} style={{ color, flexShrink: 0 }} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{folder.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {folder.docs.length} program{folder.docs.length !== 1 ? 's' : ''} · {folder.docs.filter((d) => d.energy_type === 'Electricity').length} electricity, {folder.docs.filter((d) => d.energy_type === 'Natural Gas').length} gas, {folder.docs.filter((d) => d.energy_type === 'Photovoltaic').length} solar
                  </div>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 8, background: `${color}15`, color, fontSize: 12, fontWeight: 700 }}>
                  {folder.docs.length} docs
                </span>
              </div>

              {/* Documents list */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '8px 12px' }}>
                  {folder.docs.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        background: selectedDoc?.id === doc.id ? 'rgba(0,200,120,0.06)' : 'transparent',
                        border: selectedDoc?.id === doc.id ? '1px solid rgba(0,200,120,0.2)' : '1px solid transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <FileText size={18} style={{ color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{doc.document_title}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span>{ENERGY_ICONS[doc.energy_type] || '⚡'} {doc.energy_type}</span>
                          {doc.price_per_kwh != null && <span>€{doc.price_per_kwh}/kWh</span>}
                          {doc.fixed_fee_monthly != null && doc.fixed_fee_monthly > 0 && <span>€{doc.fixed_fee_monthly}/mo fixed</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'var(--surface-2, #f5f7fa)', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {doc.program_name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected Document Detail */}
      {selectedDoc && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={20} style={{ color: PROVIDER_COLORS[selectedDoc.provider_name] || 'var(--text-muted)' }} />
              {selectedDoc.document_title}
            </h3>
            <button onClick={() => setSelectedDoc(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18 }}>×</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div style={{ padding: '12px 14px', background: 'var(--surface-2, #f5f7fa)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Provider</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: PROVIDER_COLORS[selectedDoc.provider_name] || 'var(--text)' }}>{selectedDoc.provider_name}</div>
            </div>
            <div style={{ padding: '12px 14px', background: 'var(--surface-2, #f5f7fa)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Program</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedDoc.program_name}</div>
            </div>
            <div style={{ padding: '12px 14px', background: 'var(--surface-2, #f5f7fa)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Energy Type</div>
              <div style={{ fontSize: 14 }}>{ENERGY_ICONS[selectedDoc.energy_type] || '⚡'} {selectedDoc.energy_type}</div>
            </div>
            <div style={{ padding: '12px 14px', background: 'var(--surface-2, #f5f7fa)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Price</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#00c878' }}>
                {selectedDoc.price_per_kwh != null ? `€${selectedDoc.price_per_kwh}/kWh` : '—'}
              </div>
            </div>
            <div style={{ padding: '12px 14px', background: 'var(--surface-2, #f5f7fa)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Fixed Fee</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {selectedDoc.fixed_fee_monthly != null && selectedDoc.fixed_fee_monthly > 0 ? `€${selectedDoc.fixed_fee_monthly}/mo` : 'None'}
              </div>
            </div>
            <div style={{ padding: '12px 14px', background: 'var(--surface-2, #f5f7fa)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Category</div>
              <div style={{ fontSize: 14 }}><Tag size={12} style={{ marginRight: 4 }} />{selectedDoc.category}</div>
            </div>
          </div>

          {selectedDoc.extracted_text && (
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Zap size={14} /> RAG Extracted Summary
              </h4>
              <div style={{ background: 'var(--surface-2, #f5f7fa)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, fontSize: 14, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                {selectedDoc.extracted_text}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
            <Clock size={12} /> Created: {new Date(selectedDoc.created_at).toLocaleDateString('el-GR')}
            {selectedDoc.last_verified && <span>· Verified: {new Date(selectedDoc.last_verified).toLocaleDateString('el-GR')}</span>}
          </div>
        </div>
      )}

      {/* Market Tariffs Summary */}
      <div style={{ marginTop: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Euro size={18} /> Market Tariffs ({filteredTariffs.length})
        </h3>
        <div className="dash-table-wrap">
          <table className="dash-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Tariff Name</th>
                <th>Price</th>
                <th>Unit</th>
                <th>Provider</th>
              </tr>
            </thead>
            <tbody>
              {filteredTariffs.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.resource}</strong></td>
                  <td>{t.tariff_name}</td>
                  <td style={{ fontWeight: 700, color: '#00c878' }}>€{t.price_eur}</td>
                  <td>{t.unit}</td>
                  <td>{t.provider_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
