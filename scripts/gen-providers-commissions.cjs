const fs = require('fs');
const path = require('path');

const content = `import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, DollarSign, Zap, Users, BarChart3, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react';
import { PROVIDERS_AND_PROGRAMS, PROVIDER_COLORS } from '../constants/energyData';
import EntityDetailWindow from './EntityDetailWindow';

interface SupplyPoint {
  id: string; entity_id: string; entity_type: string;
  supply_number: string; provider_name: string | null; program_name: string | null;
  sales_agent_id: string | null; status: string; estimated_commission: number;
  monthly_cost: number | null; created_at: string;
}

interface Agent { id: string; full_name: string; }

interface EntityInfo { name: string; type: 'lead' | 'customer'; }

interface ProgramGroup { count: number; commission: number; monthlyCost: number; items: SupplyPoint[]; }

interface ProviderGroup {
  provider: string; supplyCount: number; totalCommission: number;
  programs: Record<string, ProgramGroup>;
  agents: Record<string, { name: string; count: number; commission: number }>;
}

export default function ProvidersCommissionsTab() {
  const [supplyPoints, setSupplyPoints] = useState<SupplyPoint[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [entityMap, setEntityMap] = useState<Record<string, EntityInfo>>({});
  const [loading, setLoading] = useState(true);
  const [expandedPrograms, setExpandedPrograms] = useState<Set<string>>(new Set());
  const [openEntity, setOpenEntity] = useState<{ id: string; type: 'lead' | 'customer' } | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [spRes, agRes] = await Promise.all([
        supabase.from('supply_points').select('*').order('created_at', { ascending: false }),
        supabase.from('sales_agents').select('id, full_name'),
      ]);
      const spData = (spRes.data as SupplyPoint[]) || [];
      if (spRes.data) setSupplyPoints(spData);
      if (agRes.data) setAgents(agRes.data as Agent[]);

      // Resolve entity names from both tables
      const ids = [...new Set(spData.map(s => s.entity_id).filter(Boolean))];
      if (ids.length > 0) {
        const map: Record<string, EntityInfo> = {};
        const [leadsRes, custRes] = await Promise.all([
          supabase.from('hlektrismos_leads').select('id, first_name, last_name, company_name').in('id', ids),
          supabase.from('hlektrismos_customers').select('id, full_name, company_name').in('id', ids),
        ]);
        for (const l of (leadsRes.data || []) as any[]) {
          map[l.id] = { name: [l.first_name, l.last_name].filter(Boolean).join(' ') || l.company_name || 'Lead', type: 'lead' };
        }
        for (const c of (custRes.data || []) as any[]) {
          map[c.id] = { name: c.full_name || c.company_name || 'Πελάτης', type: 'customer' };
        }
        setEntityMap(map);
      }
      setLoading(false);
    })();
  }, []);

  const reload = async () => {
    const { data } = await supabase.from('supply_points').select('*').order('created_at', { ascending: false });
    if (data) setSupplyPoints(data as SupplyPoint[]);
  };

  const agentName = (id: string | null) => id ? (agents.find(a => a.id === id)?.full_name || '—') : '—';

  const updateSupplyField = async (id: string, field: 'status' | 'estimated_commission', value: string) => {
    const patch: Record<string, any> = {};
    if (field === 'status') patch.status = value;
    else patch.estimated_commission = parseFloat(value) || 0;
    await supabase.from('supply_points').update(patch).eq('id', id);
    reload();
  };

  const toggleProgram = (key: string) => {
    setExpandedPrograms(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const openFolder = (entityId: string) => {
    const info = entityMap[entityId];
    if (!info) return;
    setOpenEntity({ id: entityId, type: info.type });
  };

  const STATUS_OPTIONS = [
    { value: 'active', label: 'Ενεργή', color: '#10b981' },
    { value: 'pending', label: 'Σε Εκκρεμότητα', color: '#f59e0b' },
    { value: 'docs_pending', label: 'Έγγραφα σε εκκρεμότητα', color: '#f59e0b' },
    { value: 'submitted_to_provider', label: 'Υποβλήθηκε στον Πάροχο', color: '#3b82f6' },
    { value: 'deddie_meter_reading', label: 'Μέτρηση ΔΕΔΔΗΕ', color: '#8b5cf6' },
    { value: 'inactive', label: 'Ανενεργή', color: '#6b7280' },
  ];
  const statusInfo = (s: string) => STATUS_OPTIONS.find(o => o.value === s) || { label: s, color: '#6b7280' };

  const groups: Record<string, ProviderGroup> = {};
  for (const sp of supplyPoints) {
    const pname = sp.provider_name || 'Άγνωστος';
    if (!groups[pname]) groups[pname] = { provider: pname, supplyCount: 0, totalCommission: 0, programs: {}, agents: {} };
    groups[pname].supplyCount += 1;
    groups[pname].totalCommission += sp.estimated_commission || 0;
    const prog = sp.program_name || 'Χωρίς Πρόγραμμα';
    if (!groups[pname].programs[prog]) groups[pname].programs[prog] = { count: 0, commission: 0, monthlyCost: 0, items: [] };
    groups[pname].programs[prog].count += 1;
    groups[pname].programs[prog].commission += sp.estimated_commission || 0;
    groups[pname].programs[prog].monthlyCost += sp.monthly_cost || 0;
    groups[pname].programs[prog].items.push(sp);
    if (sp.sales_agent_id) {
      const aname = agentName(sp.sales_agent_id);
      if (!groups[pname].agents[sp.sales_agent_id]) groups[pname].agents[sp.sales_agent_id] = { name: aname, count: 0, commission: 0 };
      groups[pname].agents[sp.sales_agent_id].count += 1;
      groups[pname].agents[sp.sales_agent_id].commission += sp.estimated_commission || 0;
    }
  }

  const sorted = Object.values(groups).sort((a, b) => b.supplyCount - a.supplyCount);
  const grandTotal = supplyPoints.reduce((s, sp) => s + (sp.estimated_commission || 0), 0);
  const activeCount = supplyPoints.filter(sp => sp.status === 'active').length;

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Φόρτωση...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={18} style={{ color: '#3b82f6' }} /> Πάροχοι & Προμήθειες
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Ανάλυση παροχών, πελάτες ανά πρόγραμμα, προμήθειες</p>
        </div>
        <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}><Zap size={14} /> {supplyPoints.length} σύνολο</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10b981' }}><DollarSign size={14} /> €{grandTotal.toFixed(2)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#3b82f6' }}><Users size={14} /> {activeCount} ενεργές</span>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 12, border: '1px dashed var(--border)' }}>
          Δεν υπάρχουν καταχωρημένες παροχές.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: 16 }}>
          {sorted.map(g => {
            const color = PROVIDER_COLORS[g.provider] || '#6b7280';
            return (
              <div key={g.provider} style={{ padding: 20, background: 'var(--surface)', border: \`1px solid \${color}30\`, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 4, height: 32, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{g.provider}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.supplyCount} παροχές · {Object.keys(g.programs).length} προγράμματα</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#10b981' }}>€{g.totalCommission.toFixed(2)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>σύνολο προμήθειας</div>
                  </div>
                </div>

                {/* Programs with expandable customer lists */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Προγράμματα (κλικ για προβολή πελατών):</div>
                  {Object.entries(g.programs).map(([prog, data]) => {
                    const key = \`\${g.provider}::\${prog}\`;
                    const expanded = expandedPrograms.has(key);
                    const colorMap: Record<string, { bg: string; text: string }> = {
                      green: { bg: '#dcfce7', text: '#166534' }, blue: { bg: '#dbeafe', text: '#1e40af' },
                      yellow: { bg: '#fef9c3', text: '#854d0e' }, orange: { bg: '#ffedd5', text: '#9a3412' },
                    };
                    const progInfo = PROVIDERS_AND_PROGRAMS.find(p => p.provider === g.provider && p.program === prog);
                    const progColor = progInfo?.color || 'blue';
                    const colors = colorMap[progColor] || colorMap.blue;
                    return (
                      <div key={prog} style={{ border: \`1px solid \${expanded ? color + '50' : 'var(--border)'}\`, borderRadius: 8, marginBottom: 6, overflow: 'hidden' }}>
                        <button onClick={() => toggleProgram(key)} style={{
                          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '7px 10px', background: expanded ? 'var(--bg)' : 'transparent',
                          border: 'none', cursor: 'pointer',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: colors.bg, color: colors.text }}>{progColor}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{prog}</span>
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', alignItems: 'center' }}>
                            <Users size={11} />
                            <span>{data.count} πελάτες</span>
                            <span style={{ color: '#10b981', fontWeight: 600 }}>€{data.commission.toFixed(2)}</span>
                          </div>
                        </button>

                        {expanded && (
                          <div style={{ borderTop: '1px solid var(--border)' }}>
                            {data.items.length === 0 ? (
                              <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-muted)' }}>Κανένας πελάτης.</div>
                            ) : data.items.map(sp => {
                              const ent = entityMap[sp.entity_id];
                              const st = statusInfo(sp.status);
                              return (
                                <div key={sp.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                                  {/* Customer name -> open folder */}
                                  <button onClick={() => openFolder(sp.entity_id)} title="Άνοιγμα φακέλου"
                                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}>
                                    <FolderOpen size={13} style={{ color: '#6366f1' }} />
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#6366f1' }}>
                                      {ent?.name || 'Άγνωστος'}
                                    </span>
                                    {ent?.type === 'customer' && (
                                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#dbeafe', color: '#1e40af' }}>ΠΕΛΑΤΗΣ</span>
                                    )}
                                  </button>
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{sp.supply_number}</span>

                                  {/* Inline status edit */}
                                  <select value={sp.status} onChange={e => updateSupplyField(sp.id, 'status', e.target.value)}
                                    title="Αλλαγή κατάστασης"
                                    style={{ fontSize: 10, padding: '2px 6px', borderRadius: 5, border: \`1px solid \${st.color}40\`, background: \`\${st.color}10\`, color: st.color, cursor: 'pointer', fontWeight: 600 }}>
                                    {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                  </select>

                                  {/* Inline commission edit */}
                                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3 }}>
                                    <input type="number" step="0.01" min="0" defaultValue={sp.estimated_commission}
                                      onBlur={e => updateSupplyField(sp.id, 'estimated_commission', e.target.value)}
                                      title="Εκτ. προμήθεια — επεξεργασία"
                                      style={{ width: 60, fontSize: 11, padding: '2px 6px', textAlign: 'right', border: '1px solid var(--border)', borderRadius: 5, background: 'var(--surface)', color: '#059669', fontWeight: 700 }} />
                                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>€</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Agents */}
                {Object.keys(g.agents).length > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Πωλητές:</div>
                    {Object.values(g.agents).sort((a, b) => b.commission - a.commission).map(ag => (
                      <div key={ag.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, color: 'var(--text)' }}>👤 {ag.name}</span>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                          <span style={{ color: '#3b82f6', fontWeight: 600 }}>{ag.count} παροχές</span>
                          <span style={{ color: '#10b981', fontWeight: 600 }}>€{ag.commission.toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Customer folder slideout */}
      {openEntity && (
        <EntityDetailWindow
          entityId={openEntity.id}
          entityType={openEntity.type}
          onClose={() => setOpenEntity(null)}
          onSaved={() => { setOpenEntity(null); reload(); }}
        />
      )}
    </div>
  );
}
`;

fs.writeFileSync(path.join(__dirname, '..', 'src', 'components', 'ProvidersCommissionsTab.tsx'), content, 'utf8');
console.log('ProvidersCommissionsTab.tsx written:', content.length, 'bytes');
