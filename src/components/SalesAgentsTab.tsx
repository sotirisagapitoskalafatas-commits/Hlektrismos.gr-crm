import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Trash2, Edit2, Save, X, TrendingUp, DollarSign, Award } from 'lucide-react';
import { PROVIDER_LIST } from '../constants/energyData';

interface SalesAgent {
  id: string; full_name: string; email: string | null; phone: string | null;
  role: string; active: boolean; target_providers: string[] | null;
  commission_rate_pct: number | null; notes: string | null; created_at: string;
}

const inputS: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 12, background: 'var(--surface)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
};
const labelS: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 };

export default function SalesAgentsTab() {
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [form, setForm] = useState<Record<string, any>>({
    full_name: '', email: '', phone: '', role: 'sales',
    commission_rate_pct: '10', target_providers: [], notes: '',
  });
  const [stats, setStats] = useState<Record<string, { total_commission: number; supply_count: number }>>({});

  useEffect(() => { loadAgents(); }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const loadAgents = async () => {
    setLoading(true);
    const [agentsRes, statsRes] = await Promise.all([
      supabase.from('sales_agents').select('*').eq('active', true).order('full_name'),
      supabase.from('supply_points').select('sales_agent_id, estimated_commission'),
    ]);
    if (agentsRes.data) setAgents(agentsRes.data as SalesAgent[]);
    if (statsRes.data) {
      const s: Record<string, { total_commission: number; supply_count: number }> = {};
      for (const sp of statsRes.data) {
        if (!sp.sales_agent_id) continue;
        if (!s[sp.sales_agent_id]) s[sp.sales_agent_id] = { total_commission: 0, supply_count: 0 };
        s[sp.sales_agent_id].total_commission += sp.estimated_commission || 0;
        s[sp.sales_agent_id].supply_count += 1;
      }
      setStats(s);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) return;
    const payload = {
      full_name: form.full_name.trim(), email: form.email || null, phone: form.phone || null,
      role: form.role, commission_rate_pct: parseFloat(form.commission_rate_pct) || 10,
      target_providers: form.target_providers?.length ? form.target_providers : null,
      notes: form.notes || null,
    };
    if (editingId) {
      const { error } = await supabase.from('sales_agents').update(payload).eq('id', editingId);
      if (error) { setToast({ msg: \`Σφάλμα: ${error.message}\`, type: 'error' }); return; }
    } else {
      const { error } = await supabase.from('sales_agents').insert({ ...payload, active: true });
      if (error) { setToast({ msg: \`Σφάλμα: ${error.message}\`, type: 'error' }); return; }
    }
    setToast({ msg: 'Αποθηκεύτηκε.', type: 'success' });
    setShowAdd(false); setEditingId(null);
    setForm({ full_name: '', email: '', phone: '', role: 'sales', commission_rate_pct: '10', target_providers: [], notes: '' });
    loadAgents();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Απενεργοποίηση πωλητή;')) return;
    const { error } = await supabase.from('sales_agents').update({ active: false }).eq('id', id);
    if (!error) { setToast({ msg: 'Απενεργοποιήθηκε.', type: 'success' }); loadAgents(); }
  };

  const startEdit = (agent: SalesAgent) => {
    setEditingId(agent.id);
    setForm({
      full_name: agent.full_name, email: agent.email || '', phone: agent.phone || '',
      role: agent.role, commission_rate_pct: String(agent.commission_rate_pct || 10),
      target_providers: agent.target_providers || [], notes: agent.notes || '',
    });
    setShowAdd(true);
  };

  const toggleProvider = (p: string) => {
    setForm(f => {
      const curr = f.target_providers || [];
      return { ...f, target_providers: curr.includes(p) ? curr.filter((x: string) => x !== p) : [...curr, p] };
    });
  };

  const totalCommission = agents.reduce((sum, a) => sum + (stats[a.id]?.total_commission || 0), 0);
  const totalSupplies = agents.reduce((sum, a) => sum + (stats[a.id]?.supply_count || 0), 0);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Φόρτωση...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {toast && (
        <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 9999, padding: '10px 20px', borderRadius: 8,
          background: toast.type === 'success' ? '#dcfce7' : '#fee2e2', color: toast.type === 'success' ? '#166534' : '#991b1b',
          fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {toast.msg}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={18} style={{ color: '#f59e0b' }} /> Πωλητές & Προμήθειες
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Διαχείριση πωλητών, αποτελέσματα, προμήθειες</p>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}><UserPlus size={14} /> {agents.length} ενεργοί</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10b981' }}><DollarSign size={14} /> €{totalCommission.toFixed(2)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#3b82f6' }}><TrendingUp size={14} /> {totalSupplies} παροχές</span>
          </div>
          <button onClick={() => { setShowAdd(!showAdd); setEditingId(null); setForm({ full_name: '', email: '', phone: '', role: 'sales', commission_rate_pct: '10', target_providers: [], notes: '' }); }}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <UserPlus size={13} /> Νέος Πωλητής
          </button>
        </div>
      </div>

      {showAdd && (
        <div style={{ padding: 20, background: '#f0f9ff', borderRadius: 12, border: '1px solid #bae6fd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0369a1' }}>{editingId ? 'Επεξεργασία' : 'Προσθήκη'} Πωλητή</h3>
            <button onClick={() => { setShowAdd(false); setEditingId(null); }} style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#0369a1' }}><X size={16} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div><label style={labelS}>Ονοματεπώνυμο *</label><input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={inputS} /></div>
            <div><label style={labelS}>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputS} /></div>
            <div><label style={labelS}>Τηλέφωνο</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputS} /></div>
            <div><label style={labelS}>Ρόλος</label><select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inputS}>
              <option value="sales">Πωλητής</option><option value="admin">Admin</option><option value="management">Διοίκηση</option>
            </select></div>
            <div><label style={labelS}>Ποσοστό Προμήθειας (%)</label><input type="number" value={form.commission_rate_pct} onChange={e => setForm(f => ({ ...f, commission_rate_pct: e.target.value }))} style={inputS} /></div>
            <div style={{ gridColumn: 'span 3' }}><label style={labelS}>Σημειώσεις</label><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputS, resize: 'vertical' }} /></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label style={labelS}>Τομείς Ενδιαφέροντος (Πάροχοι)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {PROVIDER_LIST.map(p => (
                <button key={p} onClick={() => toggleProvider(p)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid', fontSize: 11, cursor: 'pointer',
                  borderColor: form.target_providers?.includes(p) ? 'var(--primary)' : 'var(--border)',
                  background: form.target_providers?.includes(p) ? 'var(--primary)' : 'transparent',
                  color: form.target_providers?.includes(p) ? '#fff' : 'var(--text)' }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={handleSave} disabled={!form.full_name.trim()} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: form.full_name.trim() ? 'var(--primary)' : '#94a3b8', color: '#fff', fontSize: 12, fontWeight: 600, cursor: form.full_name.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Save size={13} /> {editingId ? 'Ενημέρωση' : 'Αποθήκευση'}
            </button>
            <button onClick={() => { setShowAdd(false); setEditingId(null); }} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, cursor: 'pointer', color: 'var(--text)' }}>Ακύρωση</button>
          </div>
        </div>
      )}

      {agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 12, border: '1px dashed var(--border)' }}>
          Δεν υπάρχουν ενεργοί πωλητές.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {agents.map(a => (
            <div key={a.id} style={{ padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{a.full_name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.role}</div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => startEdit(a)} style={{ padding: 4, borderRadius: 4, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}><Edit2 size={12} /></button>
                  <button onClick={() => handleDelete(a.id)} style={{ padding: 4, borderRadius: 4, border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={12} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
                {a.email && <span>{a.email}</span>}
                {a.phone && <span>{a.phone}</span>}
              </div>
              <div style={{ display: 'flex', gap: 12, padding: 10, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{stats[a.id]?.supply_count || 0}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Παροχές</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#10b981' }}>€{(stats[a.id]?.total_commission || 0).toFixed(2)}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Προμήθεια</div>
                </div>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>{a.commission_rate_pct || 10}%</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Rate</div>
                </div>
              </div>
              {a.target_providers && a.target_providers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {a.target_providers.map(p => (
                    <span key={p} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: '#dbeafe', color: '#1e40af' }}>{p}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}