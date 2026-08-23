import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, DollarSign, Zap, Users, BarChart3 } from 'lucide-react';
import { PROVIDERS_AND_PROGRAMS, PROVIDER_COLORS } from '../constants/energyData';

interface SupplyPoint {
  id: string; entity_id: string; entity_type: string;
  supply_number: string; provider_name: string | null; program_name: string | null;
  sales_agent_id: string | null; status: string; estimated_commission: number;
  monthly_cost: number | null; created_at: string;
}

interface Agent { id: string; full_name: string; }

interface ProviderGroup {
  provider: string; supplyCount: number; totalCommission: number;
  programs: Record<string, { count: number; commission: number; monthlyCost: number }>;
  agents: Record<string, { name: string; count: number; commission: number }>;
}

export default function ProvidersCommissionsTab() {
  const [supplyPoints, setSupplyPoints] = useState<SupplyPoint[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [spRes, agRes] = await Promise.all([
        supabase.from('supply_points').select('*').order('created_at', { ascending: false }),
        supabase.from('sales_agents').select('id, full_name'),
      ]);
      if (spRes.data) setSupplyPoints(spRes.data as SupplyPoint[]);
      if (agRes.data) setAgents(agRes.data as Agent[]);
      setLoading(false);
    })();
  }, []);

  const agentName = (id: string | null) => id ? (agents.find(a => a.id === id)?.full_name || '—') : '—';

  const groups: Record<string, ProviderGroup> = {};
  for (const sp of supplyPoints) {
    const pname = sp.provider_name || 'Άγνωστος';
    if (!groups[pname]) groups[pname] = { provider: pname, supplyCount: 0, totalCommission: 0, programs: {}, agents: {} };
    groups[pname].supplyCount += 1;
    groups[pname].totalCommission += sp.estimated_commission || 0;
    const prog = sp.program_name || 'Άγνωστο';
    if (!groups[pname].programs[prog]) groups[pname].programs[prog] = { count: 0, commission: 0, monthlyCost: 0 };
    groups[pname].programs[prog].count += 1;
    groups[pname].programs[prog].commission += sp.estimated_commission || 0;
    groups[pname].programs[prog].monthlyCost += sp.monthly_cost || 0;
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
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Ανάλυση παροχών, προγράμματα και προμήθειες</p>
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
          {sorted.map(g => {
            const color = PROVIDER_COLORS[g.provider] || '#6b7280';
            return (
              <div key={g.provider} style={{ padding: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 4, height: 32, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{g.provider}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.supplyCount} παροχές</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#10b981' }}>€{g.totalCommission.toFixed(2)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>σύνολο προμήθειας</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Προγράμματα:</div>
                  {Object.entries(g.programs).map(([prog, data]) => {
                    const colorMap: Record<string, { bg: string; text: string }> = {
                      green: { bg: '#dcfce7', text: '#166534' }, blue: { bg: '#dbeafe', text: '#1e40af' },
                      yellow: { bg: '#fef9c3', text: '#854d0e' }, orange: { bg: '#ffedd5', text: '#9a3412' },
                    };
                    const progInfo = PROVIDERS_AND_PROGRAMS.find(p => p.provider === g.provider && p.program === prog);
                    const progColor = progInfo?.color || 'blue';
                    const colors = colorMap[progColor] || colorMap.blue;
                    return (
                      <div key={prog} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 6, marginBottom: 4, background: 'var(--bg)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: colors.bg, color: colors.text }}>{progColor}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{prog}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                          <span>{data.count}×</span>
                          <span style={{ color: '#10b981', fontWeight: 600 }}>€{data.commission.toFixed(2)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

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
    </div>
  );
}