import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Users, Building2, User, Search, Calendar, Phone, Mail, ChevronRight, Plus, X } from 'lucide-react';
import EntityDetailWindow from './EntityDetailWindow';
import { SERVICES_LIST, PROVIDER_LIST, LEAD_SOURCES } from '../constants/energyData';

export default function CustomersTab() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'B2C' | 'B2B'>('all');
  const [filterServiceType, setFilterServiceType] = useState('all');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [selectedSourceTable, setSelectedSourceTable] = useState<'leads' | 'customers'>('customers');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCustomer, setNewCustomer] = useState<Record<string, string>>({
    full_name: '', company_name: '', afm: '', phone: '', email: '',
    customer_type: 'B2C', active_provider: '', active_program: '',
    supply_number: '', city: '', address: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    setLoading(true);
    const [custRes, leadsRes] = await Promise.all([
      supabase.from('hlektrismos_customers').select('*').order('created_at', { ascending: false }),
      supabase.from('hlektrismos_leads').select('*').or('status.eq.customer,converted_at.not.is.null').is('deleted_at', null).order('created_at', { ascending: false }),
    ]);
    const custs = custRes.data || [];
    // Merge leads with status='customer' as customer entries
    const leadsAsCustomers = (leadsRes.data || []).map(l => ({
      ...l,
      _source_table: 'leads',
      full_name: l.full_name || `${l.first_name || ''} ${l.last_name || ''}`.trim(),
      active_provider: l.current_provider,
      active_program: l.program_name,
      pipeline_stage: l.status,
      contract_status: 'active',
    }));
    // Deduplicate by id
    const allIds = new Set(custs.map((c: any) => c.id));
    const merged = [...custs, ...leadsAsCustomers.filter((l: any) => !allIds.has(l.id))];
    setCustomers(merged);
    setLoading(false);
  };

  const filtered = customers.filter(c => {
    const matchSearch = (c.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.afm || '').includes(search) || (c.phone || '').includes(search) ||
      (c.company_name || '').toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || c.customer_type === typeFilter;
    const matchServiceType = filterServiceType === 'all' || c.service_type === filterServiceType;
    const matchProvider = filterProvider === 'all' || c.active_provider === filterProvider;
    const matchSource = filterSource === 'all' || c.source === filterSource;
    const matchStatus = filterStatus === 'all' || c.pipeline_stage === filterStatus || c.contract_status === filterStatus;
    return matchSearch && matchType && matchServiceType && matchProvider && matchSource && matchStatus;
  });

  const badgeColor = (s: string) => {
    if (s === 'active') return { bg: '#d1fae5', color: '#065f46' };
    if (s === 'intro') return { bg: '#dbeafe', color: '#1e40af' };
    if (s === 'awaiting_offer' || s === 'awaiting_signature') return { bg: '#fef3c7', color: '#92400e' };
    if (s === 'accepted' || s === 'sent_to_provider') return { bg: '#e0e7ff', color: '#3730a3' };
    if (s === 'rejected') return { bg: '#fee2e2', color: '#991b1b' };
    return { bg: '#f3f4f6', color: '#6b7280' };
  };

  const statusLabel = (s: string) => {
    const labels: Record<string, string> = {
      intro: 'Εισαγωγή',
      awaiting_offer: 'Αναμονή Προσφοράς',
      awaiting_signature: 'Αναμονή Υπογραφής',
      accepted: 'Αποδεκτή',
      sent_to_provider: 'Απεσταλμένη στον Πάροχο',
      active: 'Ενεργή',
      rejected: 'Απορρίφθηκε',
    };
    return labels[s] || s || '—';
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.full_name && !newCustomer.company_name) return;
    setSaving(true);
    const { error } = await supabase.from('hlektrismos_customers').insert({
      full_name: newCustomer.full_name || newCustomer.company_name,
      company_name: newCustomer.company_name || null,
      afm: newCustomer.afm || null,
      phone: newCustomer.phone || null,
      email: newCustomer.email || null,
      customer_type: newCustomer.customer_type,
      active_provider: newCustomer.active_provider || 'Unknown',
      active_program: newCustomer.active_program || 'Unknown',
      supply_number: newCustomer.supply_number || null,
      city: newCustomer.city || null,
      address: newCustomer.address || null,
      pipeline_stage: 'intro',
      contract_status: 'active',
    });
    if (!error) {
      setShowAddForm(false);
      setNewCustomer({ full_name: '', company_name: '', afm: '', phone: '', email: '', customer_type: 'B2C', active_provider: '', active_program: '', supply_number: '', city: '', address: '' });
      fetchCustomers();
    }
    setSaving(false);
  };

  const inputStyle: React.CSSProperties = { width: '100%', padding: '6px 10px', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, background: '#fff', color: 'var(--text)', outline: 'none' };
  const labelStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#166534', marginBottom: 3, display: 'block' };

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
          <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Plus size={13} /> Νέος Πελάτης
          </button>
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

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 20px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Φίλτρα:</span>
        <select value={filterServiceType} onChange={e => setFilterServiceType(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}>
          <option value="all">Υπηρεσία: Όλες</option>
          {SERVICES_LIST.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
        </select>
        <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}>
          <option value="all">Πάροχος: Όλοι</option>
          {PROVIDER_LIST.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}>
          <option value="all">Πηγή: Όλες</option>
          {LEAD_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer' }}>
          <option value="all">Κατάσταση: Όλες</option>
          <option value="intro">Εισαγωγή</option>
          <option value="awaiting_offer">Αναμονή Προσφοράς</option>
          <option value="awaiting_signature">Αναμονή Υπογραφής</option>
          <option value="accepted">Αποδεκτή</option>
          <option value="sent_to_provider">Απεσταλμένη στον Πάροχο</option>
          <option value="active">Ενεργή</option>
          <option value="rejected">Απορρίφθηκε</option>
        </select>
        {(filterServiceType !== 'all' || filterProvider !== 'all' || filterSource !== 'all' || filterStatus !== 'all') && (
          <button onClick={() => { setFilterServiceType('all'); setFilterProvider('all'); setFilterSource('all'); setFilterStatus('all'); }}
            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--primary, #6366f1)', color: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
            Καθαρισμός
          </button>
        )}
      </div>

      {/* Add Customer Form */}
      {showAddForm && (
        <div style={{ padding: 20, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Plus size={16} /> Προσθήκη Νέου Πελάτη
            </h3>
            <button onClick={() => setShowAddForm(false)} style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#166534' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
            <div><label style={labelStyle}>Ονοματεπώνυμο *</label><input value={newCustomer.full_name} onChange={e => setNewCustomer(c => ({ ...c, full_name: e.target.value }))} placeholder="Γιώργος Παπαδόπουλος" style={inputStyle} /></div>
            <div><label style={labelStyle}>Επωνυμία (B2B)</label><input value={newCustomer.company_name} onChange={e => setNewCustomer(c => ({ ...c, company_name: e.target.value }))} placeholder="Εταιρεία ΑΕ" style={inputStyle} /></div>
            <div><label style={labelStyle}>ΑΦΜ</label><input value={newCustomer.afm} onChange={e => setNewCustomer(c => ({ ...c, afm: e.target.value }))} placeholder="000000000" style={inputStyle} /></div>
            <div><label style={labelStyle}>Τηλέφωνο</label><input value={newCustomer.phone} onChange={e => setNewCustomer(c => ({ ...c, phone: e.target.value }))} placeholder="2101234567" style={inputStyle} /></div>
            <div><label style={labelStyle}>Email</label><input value={newCustomer.email} onChange={e => setNewCustomer(c => ({ ...c, email: e.target.value }))} placeholder="info@example.gr" style={inputStyle} /></div>
            <div><label style={labelStyle}>Αριθμός Παροχής</label><input value={newCustomer.supply_number} onChange={e => setNewCustomer(c => ({ ...c, supply_number: e.target.value }))} placeholder="DEDDHE-..." style={inputStyle} /></div>
            <div><label style={labelStyle}>Πάροχος</label><input value={newCustomer.active_provider} onChange={e => setNewCustomer(c => ({ ...c, active_provider: e.target.value }))} placeholder="ΔΕΗ" style={inputStyle} /></div>
            <div><label style={labelStyle}>Πρόγραμμα</label><input value={newCustomer.active_program} onChange={e => setNewCustomer(c => ({ ...c, active_program: e.target.value }))} placeholder="Green" style={inputStyle} /></div>
            <div><label style={labelStyle}>Πόλη</label><input value={newCustomer.city} onChange={e => setNewCustomer(c => ({ ...c, city: e.target.value }))} placeholder="Αθήνα" style={inputStyle} /></div>
            <div><label style={labelStyle}>Διεύθυνση</label><input value={newCustomer.address} onChange={e => setNewCustomer(c => ({ ...c, address: e.target.value }))} placeholder="Τσιμισκή 10" style={inputStyle} /></div>
            <div>
              <label style={labelStyle}>Τύπος</label>
              <select value={newCustomer.customer_type} onChange={e => setNewCustomer(c => ({ ...c, customer_type: e.target.value }))} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="B2C">B2C - Οικιακό</option>
                <option value="B2B">B2B - Εταιρικό</option>
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={handleAddCustomer} disabled={saving || (!newCustomer.full_name && !newCustomer.company_name)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: saving ? '#94a3b8' : '#10b981', color: '#fff', fontSize: 11, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Αποθήκευση...' : 'Αποθήκευση Πελάτη'}
            </button>
            <button onClick={() => setShowAddForm(false)} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: 'var(--text)' }}>Άκυρο</button>
          </div>
        </div>
      )}

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
            const bc = badgeColor(c.pipeline_stage || c.contract_status);
            return (
              <div key={c.id} onClick={() => { setSelectedCustomer(c.id); setSelectedSourceTable(c._source_table || 'customers'); }} style={{
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
                    {statusLabel(c.pipeline_stage || c.contract_status)}
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
                    <span>{c.active_provider || '—'}</span>
                    <span style={{ color: 'var(--primary, #6366f1)' }}>{c.active_program || '—'}</span>
                  </div>
                  {c.service_type && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      {SERVICES_LIST.find(s => s.key === c.service_type)?.icon} {c.service_type}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                    <span>{c.unit_rate_kwh ? `€${c.unit_rate_kwh}/kWh` : '—'}</span>
                    <span>{c.fixed_fee_monthly ? `€${c.fixed_fee_monthly}/μήνα` : '—'}</span>
                  </div>
                  {c.source && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                      Πηγή: {LEAD_SOURCES.find(s => s.key === c.source)?.label || c.source}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'var(--text-muted)', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={11} /> Λήξη: {c.contract_end_date ? new Date(c.contract_end_date).toLocaleDateString('el-GR') : '—'}
                  </span>
                  <span style={{ color: 'var(--primary, #6366f1)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }}>
                    Φάκελος <ChevronRight size={12} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedCustomer && (
        <EntityDetailWindow entityId={selectedCustomer} entityType="customer" sourceTable={selectedSourceTable} onClose={() => setSelectedCustomer(null)} onSaved={fetchCustomers} />
      )}
    </div>
  );
}
