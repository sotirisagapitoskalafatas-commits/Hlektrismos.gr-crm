import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Zap } from 'lucide-react';

interface SupplyPoint {
  id: string; provider_name: string | null; program_name: string | null;
  status: string; estimated_commission: number; monthly_cost: number | null;
}

interface ProviderRow {
  provider: string;
  total: number;
  active: number;
  commission: number;
  monthly: number;
  programs: { program: string; count: number; commission: number }[];
}

export default function OverviewSalesTracker() {
  const [rows, setRows] = useState<ProviderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('supply_points').select('*');
      if (data) {
        const groups: Record<string, ProviderRow> = {};
        for (const sp of data as SupplyPoint[]) {
          const p = sp.provider_name || 'Άγνωστος';
          if (!groups[p]) groups[p] = { provider: p, total: 0, active: 0, commission: 0, monthly: 0, programs: [] };
          groups[p].total += 1;
          if (sp.status === 'active') groups[p].active += 1;
          groups[p].commission += sp.estimated_commission || 0;
          groups[p].monthly += sp.monthly_cost || 0;
          const prog = sp.program_name || 'Χωρίς Πρόγραμμα';
          let pr = groups[p].programs.find(x => x.program === prog);
          if (!pr) { pr = { program: prog, count: 0, commission: 0 }; groups[p].programs.push(pr); }
          pr.count += 1;
          pr.commission += sp.estimated_commission || 0;
        }
        setRows(Object.values(groups).sort((a, b) => b.total - a.total));
      }
      setLoading(false);
    })();
  }, []);

  const totalSupplies = rows.reduce((s, r) => s + r.total, 0);
  const totalActive = rows.reduce((s, r) => s + r.active, 0);
  const totalCommission = rows.reduce((s, r) => s + r.commission, 0);
  const totalMonthly = rows.reduce((s, r) => s + r.monthly, 0);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', marginTop: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Zap size={16} style={{ color: '#f59e0b' }} /> Πωλήσεις & Συμβόλαια ανά Πάροχο
        </h3>
        <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
          <span style={{ color: '#3b82f6', fontWeight: 600 }}>{totalSupplies} παροχές</span>
          <span style={{ color: '#10b981', fontWeight: 600 }}>{totalActive} ενεργές</span>
          <span style={{ color: '#a16207', fontWeight: 600 }}>€{totalCommission.toFixed(2)} προμήθειες</span>
          <span style={{ color: 'var(--text-muted)' }}>€{totalMonthly.toFixed(2)}/μήνα</span>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Φόρτωση...</p>
      ) : rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Δεν υπάρχουν καταχωρημένες παροχές ακόμα.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                {['Πάροχος', 'Προγράμματα', 'Παροχές', 'Ενεργές', 'Προμήθεια €'].map(h => (
                  <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.provider} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>⚡ {r.provider}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {r.programs.map(p => (
                        <span key={p.program} title={`€${p.commission.toFixed(2)} προμήθεια`}
                          style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: '#f1f5f9', color: 'var(--text)' }}>
                          {p.program} ({p.count})
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>{r.total}</td>
                  <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, color: '#10b981' }}>{r.active}</td>
                  <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700, color: '#a16207' }}>€{r.commission.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
