const fs = require('fs');
const path = require('path');

const content = `import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { UserPlus, Trash2, Edit2, Save, X, TrendingUp, DollarSign, Award, ChevronDown, ChevronRight, Users, Zap } from 'lucide-react';
import { PROVIDER_LIST, PROVIDERS_AND_PROGRAMS } from '../constants/energyData';

interface SalesAgent {
  id: string; full_name: string; email: string | null; phone: string | null;
  role: string; active: boolean; agent_type: string; target_providers: string[] | null;
  notes: string | null; created_at: string;
}

interface AgentProviderCommission {
  id?: string; agent_id: string; provider_name: string; program_name: string | null;
  fixed_rate: number; per_kwh_rate: number;
}

// key = provider::program (or provider::_default)
const ckey = (provider: string, program?: string | null) => \`\${provider}::\${program || '_default'}\`;
type CommMap = Record<string, { fixed_rate: string; per_kwh_rate: string }>;

const inputS: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 12, background: 'var(--surface)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
};
const labelS: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 3 };
const miniInput: React.CSSProperties = {
  width: 90, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 5,
  fontSize: 11, background: 'var(--surface)', color: 'var(--text)', outline: 'none', textAlign: 'right',
};

const PROGRAM_COLOR_BG: Record<string, string> = {
  green: '#dcfce7', blue: '#dbeafe', yellow: '#fef9c3', orange: '#ffedd5',
};
const PROGRAM_COLOR_FG: Record<string, string> = {
  green: '#166534', blue: '#1e40af', yellow: '#854d0e', orange: '#9a3412',
};

export default function SalesAgentsTab() {
  const [agents, setAgents] = useState<SalesAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({
    full_name: '', email: '', phone: '', role: 'sales', agent_type: 'employee', notes: '',
  });
  const [comms, setComms] = useState<CommMap>({});
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Record<string, { total_commission: number; supply_count: number }>>({});
  const [attributions, setAttributions] = useState<Record<string, { leads: number; customers: number }>>({});
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  useEffect(() => { loadAgents(); }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const loadAgents = async () => {
    setLoading(true);
    const [agentsRes, statsRes, attrRes] = await Promise.all([
      supabase.from('sales_agents').select('*').eq('active', true).order('full_name'),
      supabase.from('supply_points').select('sales_agent_id, estimated_commission'),
      supabase.from('customer_agent_attribution').select('agent_id, customer_type'),
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
    if (attrRes.data) {
      const a: Record<string, { leads: number; customers: number }> = {};
      for (const row of attrRes.data) {
        if (!row.agent_id) continue;
        if (!a[row.agent_id]) a[row.agent_id] = { leads: 0, customers: 0 };
        if (row.customer_type === 'lead') a[row.agent_id].leads += 1;
        else a[row.agent_id].customers += 1;
      }
      setAttributions(a);
    }
    setLoading(false);
  };

  const loadProviderCommissions = async (agentId: string) => {
    const { data } = await supabase.from('agent_provider_commissions').select('*').eq('agent_id', agentId);
    const map: CommMap = {};
    if (data) {
      for (const c of data as AgentProviderCommission[]) {
        map[ckey(c.provider_name, c.program_name)] = {
          fixed_rate: String(c.fixed_rate ?? ''),
          per_kwh_rate: String(c.per_kwh_rate ?? ''),
        };
      }
    }
    setComms(map);
    // Auto-expand providers that have commissions
    setExpandedProviders(new Set([...new Set(Object.keys(map).map(k => k.split('::')[0]))]));
  };

  const saveProviderCommissions = async (agentId: string) => {
    await supabase.from('agent_provider_commissions').delete().eq('agent_id', agentId);
    const rows = Object.entries(comms)
      .filter(([, v]) => parseFloat(v.fixed_rate) > 0 || parseFloat(v.per_kwh_rate) > 0)
      .map(([k, v]) => {
        const [provider, program] = k.split('::');
        return {
          agent_id: agentId,
          provider_name: provider,
          program_name: program === '_default' ? null : program,
          fixed_rate: parseFloat(v.fixed_rate) || 0,
          per_kwh_rate: parseFloat(v.per_kwh_rate) || 0,
        };
      });
    if (rows.length > 0) await supabase.from('agent_provider_commissions').insert(rows);
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) return;
    setSaving(true);
    // Derive target_providers from commission keys
    const providers = [...new Set(
      Object.entries(comms).filter(([, v]) => parseFloat(v.fixed_rate) > 0 || parseFloat(v.per_kwh_rate) > 0).map(([k]) => k.split('::')[0])
    )];
    const payload = {
      full_name: form.full_name.trim(), email: form.email || null, phone: form.phone || null,
      role: form.role, agent_type: form.agent_type,
      target_providers: providers.length ? providers : null,
      notes: form.notes || null,
    };
    try {
      if (editingId) {
        const { error } = await supabase.from('sales_agents').update(payload).eq('id', editingId);
        if (error) throw error;
        await saveProviderCommissions(editingId);
      } else {
        const { data, error } = await supabase.from('sales_agents').insert({ ...payload, active: true }).select('id').single();
        if (error) throw error;
        if (data?.id) await saveProviderCommissions(data.id);
      }
      setToast({ msg: 'Αποθηκεύτηκε.', type: 'success' });
      setShowAdd(false); setEditingId(null); resetForm();
      loadAgents();
    } catch (err: any) {
      setToast({ msg: \`Σφάλμα: \${err.message}\`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({ full_name: '', email: '', phone: '', role: 'sales', agent_type: 'employee', notes: '' });
    setComms({});
    setExpandedProviders(new Set());
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Απενεργοποίηση πωλητή;')) return;
    const { error } = await supabase.from('sales_agents').update({ active: false }).eq('id', id);
    if (!error) { setToast({ msg: 'Απενεργοποιήθηκε.', type: 'success' }); loadAgents(); }
  };

  const startEdit = async (agent: SalesAgent) => {
    setEditingId(agent.id);
    setForm({
      full_name: agent.full_name, email: agent.email || '', phone: agent.phone || '',
      role: agent.role, agent_type: agent.agent_type || 'employee', notes: agent.notes || '',
    });
    await loadProviderCommissions(agent.id);
    setShowAdd(true);
  };

  const updateComm = (provider: string, program: string | null, field: 'fixed_rate' | 'per_kwh_rate', value: string) => {
    setComms(c => ({
      ...c,
      [ckey(provider, program)]: { ...(c[ckey(provider, program)] || { fixed_rate: '', per_kwh_rate: '' }), [field]: value },
    }));
  };

  const toggleProviderExpanded = (p: string) => {
    setExpandedProviders(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };

  const programsFor = (p: string) => PROVIDERS_AND_PROGRAMS.filter(pp => pp.provider === p);

  const hasAnyCommissionFor = (p: string) =>
    Object.entries(comms).some(([k, v]) => k.startsWith(\`\${p}::\`) && (parseFloat(v.fixed_rate) > 0 || parseFloat(v.per_kwh_rate) > 0));

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

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Award size={18} style={{ color: '#f59e0b' }} /> Πωλητές & Προμήθειες
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Προμήθειες ανά πάροχο & πρόγραμμα, σύνδεση με πελάτες</p>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}><Users size={14} /> {agents.length} ενεργοί</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10b981' }}><DollarSign size={14} /> €{totalCommission.toFixed(2)}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#3b82f6' }}><Zap size={14} /> {totalSupplies} παροχές</span>
          </div>
          <button onClick={() => { setShowAdd(!showAdd); setEditingId(null); resetForm(); }}
            style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
            <UserPlus size={13} /> Νέος Πωλητής
          </button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAdd && (
        <div style={{ padding: 20, background: '#f0f9ff', borderRadius: 12, border: '1px solid #bae6fd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0369a1' }}>{editingId ? 'Επεξεργασία' : 'Προσθήκη'} Πωλητή</h3>
            <button onClick={() => { setShowAdd(false); setEditingId(null); }} style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#0369a1' }}><X size={16} /></button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
            <div><label style={labelS}>Ονοματεπώνυμο *</label><input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} style={inputS} /></div>
            <div><label style={labelS}>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputS} /></div>
            <div><label style={labelS}>Τηλέφωνο</label><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inputS} /></div>
            <div>
              <label style={labelS}>Ρόλος</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inputS}>
                <option value="sales">Πωλητής</option><option value="admin">Admin</option><option value="management">Διοίκηση</option>
              </select>
            </div>
            <div>
              <label style={labelS}>Τύπος Συνεργασίας</label>
              <select value={form.agent_type} onChange={e => setForm(f => ({ ...f, agent_type: e.target.value }))} style={inputS}>
                <option value="employee">👤 Εργαζόμενος</option>
                <option value="contractor">🤝 Εξωτερικός Συνεργάτης</option>
              </select>
            </div>
          </div>

          {/* Provider/Program Commission Accordion */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Προμήθειες ανά Πάροχο / Πρόγραμμα
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {PROVIDER_LIST.map(p => {
                const expanded = expandedProviders.has(p);
                const active = hasAnyCommissionFor(p);
                const progs = programsFor(p);
                return (
                  <div key={p} style={{ background: 'var(--surface)', borderRadius: 8, border: \`1px solid \${active ? '#10b981' : 'var(--border)'}\`, overflow: 'hidden' }}>
                    <button onClick={() => toggleProviderExpanded(p)} style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', background: active ? '#f0fdf4' : 'transparent', border: 'none', cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {p}
                        {active && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: '#10b981', color: '#fff' }}>ΕΝΕΡΓΗ</span>}
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{progs.length} προγράμματα</span>
                    </button>
                    {expanded && (
                      <div style={{ borderTop: '1px solid var(--border)' }}>
                        {/* Provider default row */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 130px', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)' }}>★ Προεπιλογή Παρόχου</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <input type="number" step="0.01" min="0" placeholder="€" value={comms[ckey(p, null)]?.fixed_rate || ''}
                              onChange={e => updateComm(p, null, 'fixed_rate', e.target.value)} style={{ ...miniInput, width: 70 }} />
                            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>/B2C</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <input type="number" step="0.001" min="0" placeholder="€" value={comms[ckey(p, null)]?.per_kwh_rate || ''}
                              onChange={e => updateComm(p, null, 'per_kwh_rate', e.target.value)} style={{ ...miniInput, width: 70 }} />
                            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>/kWh B2B</span>
                          </div>
                        </div>
                        {/* Programs */}
                        {progs.map(prog => (
                          <div key={prog.program + prog.customerType} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 130px', alignItems: 'center', gap: 8, padding: '6px 12px 6px 28px', borderBottom: '1px solid var(--border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                                background: PROGRAM_COLOR_BG[prog.color], color: PROGRAM_COLOR_FG[prog.color] }}>
                                {prog.customerType}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text)' }}>{prog.program}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <input type="number" step="0.01" min="0" placeholder="€" value={comms[ckey(p, prog.program)]?.fixed_rate || ''}
                                onChange={e => updateComm(p, prog.program, 'fixed_rate', e.target.value)} style={{ ...miniInput, width: 70 }}
                                disabled={prog.customerType !== 'B2C'} />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <input type="number" step="0.001" min="0" placeholder="€" value={comms[ckey(p, prog.program)]?.per_kwh_rate || ''}
                                onChange={e => updateComm(p, prog.program, 'per_kwh_rate', e.target.value)} style={{ ...miniInput, width: 70 }}
                                disabled={prog.customerType !== 'B2B'} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={labelS}>Σημειώσεις</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputS, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={handleSave} disabled={!form.full_name.trim() || saving} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: form.full_name.trim() && !saving ? 'var(--primary)' : '#94a3b8', color: '#fff', fontSize: 12, fontWeight: 600, cursor: form.full_name.trim() && !saving ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Save size={13} /> {saving ? 'Αποθήκευση...' : editingId ? 'Ενημέρωση' : 'Αποθήκευση'}
            </button>
            <button onClick={() => { setShowAdd(false); setEditingId(null); }} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 12, cursor: 'pointer', color: 'var(--text)' }}>Ακύρωση</button>
          </div>
        </div>
      )}

      {/* Agent Cards */}
      {agents.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 12, border: '1px dashed var(--border)' }}>
          Δεν υπάρχουν ενεργοί πωλητές.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
          {agents.map(a => {
            const attr = attributions[a.id] || { leads: 0, customers: 0 };
            const isExpanded = expandedAgent === a.id;
            return (
              <div key={a.id} style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{a.full_name}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                        background: a.agent_type === 'contractor' ? '#fef3c7' : '#dbeafe',
                        color: a.agent_type === 'contractor' ? '#92400e' : '#1e40af' }}>
                        {a.agent_type === 'contractor' ? '🤝 Εξωτερικός' : '👤 Εργαζόμενος'}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{a.role}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => startEdit(a)} title="Επεξεργασία" style={{ padding: 5, borderRadius: 5, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer' }}><Edit2 size={12} /></button>
                    <button onClick={() => handleDelete(a.id)} title="Απενεργοποίηση" style={{ padding: 5, borderRadius: 5, border: 'none', background: '#fee2e2', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={12} /></button>
                  </div>
                </div>

                {(a.email || a.phone) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 11, color: 'var(--text-muted)' }}>
                    {a.email && <span>✉️ {a.email}</span>}
                    {a.phone && <span>📞 {a.phone}</span>}
                  </div>
                )}

                {/* Stats Row */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1, textAlign: 'center', padding: 8, background: '#eff6ff', borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1d4ed8' }}>{attr.customers}</div>
                    <div style={{ fontSize: 9, color: '#1e40af' }}>Πελάτες</div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', padding: 8, background: '#f0fdf4', borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#166534' }}>{attr.leads}</div>
                    <div style={{ fontSize: 9, color: '#166534' }}>Leads</div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', padding: 8, background: '#faf5ff', borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#7e22ce' }}>{stats[a.id]?.supply_count || 0}</div>
                    <div style={{ fontSize: 9, color: '#7e22ce' }}>Παροχές</div>
                  </div>
                  <div style={{ flex: 1, textAlign: 'center', padding: 8, background: '#fefce8', borderRadius: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#a16207' }}>€{(stats[a.id]?.total_commission || 0).toFixed(0)}</div>
                    <div style={{ fontSize: 9, color: '#a16207' }}>Προμήθεια</div>
                  </div>
                </div>

                {/* Expandable commission details */}
                <button onClick={() => setExpandedAgent(isExpanded ? null : a.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--primary)', padding: 0, alignSelf: 'flex-start' }}>
                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  Προμήθειες ανά Πάροχο
                </button>
                {isExpanded && <AgentCommissionSummary agentId={a.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AgentCommissionSummary({ agentId }: { agentId: string }) {
  const [rows, setRows] = useState<AgentProviderCommission[]>([]);

  useEffect(() => {
    supabase.from('agent_provider_commissions').select('*').eq('agent_id', agentId).order('provider_name')
      .then(({ data }) => setRows((data as AgentProviderCommission[]) || []));
  }, [agentId]);

  if (rows.length === 0) return <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Δεν έχουν οριστεί προμήθειες.</div>;

  // Group by provider
  const groups: Record<string, AgentProviderCommission[]> = {};
  for (const r of rows) {
    if (!groups[r.provider_name]) groups[r.provider_name] = [];
    groups[r.provider_name].push(r);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11 }}>
      {Object.entries(groups).map(([provider, items]) => {
        const def = items.find(i => !i.program_name);
        const overrides = items.filter(i => i.program_name);
        return (
          <div key={provider} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '5px 10px', background: 'var(--bg)', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
              <span>{provider}</span>
              {def && (
                <span style={{ color: '#059669', fontWeight: 600 }}>
                  ★ €{def.fixed_rate}/B2C · €{def.per_kwh_rate}/kWh
                </span>
              )}
            </div>
            {overrides.length > 0 && (
              <div style={{ padding: '4px 10px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {overrides.map(o => (
                  <span key={o.id || o.program_name} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: 'var(--text)' }}>
                    {o.program_name}: €{o.fixed_rate}/€{o.per_kwh_rate}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'components', 'SalesAgentsTab.tsx'), content, 'utf8');
console.log('SalesAgentsTab.tsx written:', content.length, 'bytes');
