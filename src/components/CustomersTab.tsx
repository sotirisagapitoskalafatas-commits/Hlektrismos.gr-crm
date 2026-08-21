import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Building2, User, Search, Calendar, Phone, Mail, ChevronRight } from 'lucide-react';
import CustomerFolderSlideout from './CustomerFolderSlideout';
import CustomerDetailModal from './CustomerDetailModal';

export default function CustomersTab() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'B2C' | 'B2B'>('all');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailModalId, setDetailModalId] = useState<string | null>(null);

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    const { data } = await supabase.from('hlektrismos_customers').select('*').order('created_at', { ascending: false });
    setCustomers(data || []);
    setLoading(false);
  };

  const filtered = customers.filter(c => {
    const matchSearch = (c.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.afm || '').includes(search) || (c.phone || '').includes(search) ||
      (c.company_name || '').toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || c.customer_type === typeFilter;
    return matchSearch && matchType;
  });

  const badgeColor = (s: string) => {
    if (s === 'active') return { bg: '#d1fae5', color: '#065f46' };
    if (s === 'expiring_soon') return { bg: '#fef3c7', color: '#92400e' };
    return { bg: '#fee2e2', color: '#991b1b' };
  };

  const statusLabel = (s: string) => {
    if (s === 'active') return 'Ενεργό';
    if (s === 'expiring_soon') return 'Λήγει Σύντομα';
    if (s === 'expired') return 'Έληξε';
    if (s === 'pending_switch') return 'Μεταφορά';
    return s || '—';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '16px 20px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} style={{ color: '#6366f1' }} /> Πελάτες & Ενεργά Συμβόλαια
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Διαχείριση ενεργών πελατών, παρακολούθηση λήξεων συμβολαίων</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Αναζήτηση..."
              style={{ width: 220, padding: '7px 10px 7px 32px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', color: 'var(--text)', outline: 'none' }} />
          </div>
          <div style={{ display: 'flex', background: 'var(--bg)', borderRadius: 8, padding: 2, gap: 2 }}>
            {(['all', 'B2C', 'B2B'] as const).map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} style={{
                padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                background: typeFilter === t ? 'var(--primary, #6366f1)' : 'transparent',
                color: typeFilter === t ? '#fff' : 'var(--text-muted)',
              }}>{t === 'all' ? 'Όλοι' : t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Φόρτωση...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 12, border: '1px dashed var(--border)' }}>
          Δεν βρέθηκαν πελάτες.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {filtered.map(c => {
            const bc = badgeColor(c.contract_status);
            return (
              <div key={c.id} onClick={() => setDetailModalId(c.id)} style={{
                padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                cursor: 'pointer', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 10,
              }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: c.customer_type === 'B2B' ? '#ede9fe' : '#dbeafe', color: c.customer_type === 'B2B' ? '#6d28d9' : '#1e40af', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {c.customer_type === 'B2B' ? <Building2 size={10} /> : <User size={10} />} {c.customer_type}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: bc.bg, color: bc.color }}>
                    {statusLabel(c.contract_status)}
                  </span>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                    {c.customer_type === 'B2B' && c.company_name ? c.company_name : c.full_name}
                  </div>
                  {c.customer_type === 'B2B' && c.full_name && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.full_name}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Phone size={11} /> {c.phone}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Mail size={11} /> {c.email || '—'}</span>
                </div>
                <div style={{ padding: 10, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600 }}>
                    <span>{c.active_provider}</span>
                    <span style={{ color: 'var(--primary, #6366f1)' }}>{c.active_program}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    <span>€{c.unit_rate_kwh}/kWh</span>
                    <span>€{c.fixed_fee_monthly}/μήνα πάγιο</span>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={11} /> Λήξη: {c.contract_end_date ? new Date(c.contract_end_date).toLocaleDateString('el-GR') : '—'}
                  </span>
                  <span onClick={(e) => { e.stopPropagation(); setSelectedCustomerId(c.id); }} style={{ color: 'var(--primary, #6366f1)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
                    Φάκελος <ChevronRight size={12} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedCustomerId && (
        <CustomerFolderSlideout customerId={selectedCustomerId} onClose={() => setSelectedCustomerId(null)} onUpdate={fetchCustomers} />
      )}
      {detailModalId && (
        <CustomerDetailModal customerId={detailModalId} onClose={() => setDetailModalId(null)} />
      )}
    </div>
  );
}
