import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, User, Building2, Phone, Mail, Zap, FileText, Calendar, RefreshCw, MessageSquare, Plus, AlertTriangle } from 'lucide-react';

interface Props { customerId: string; onClose: () => void; onUpdate: () => void; }

const SWITCHING_STAGES = [
  { key: 'docs_pending', label: 'Συλλογή Δικαιολογητικών', color: '#f59e0b' },
  { key: 'submitted_to_provider', label: 'Αποστολή στον Πάροχο', color: '#3b82f6' },
  { key: 'deddie_meter_reading', label: 'Έλεγχος ΔΕΔΔΗΕ', color: '#8b5cf6' },
  { key: 'activated', label: 'Ενεργοποίηση', color: '#10b981' },
  { key: 'rejected_debt', label: 'Απόρριψη (Οφειλές)', color: '#ef4444' },
  { key: 'rejected_docs', label: 'Απόρριψη (Δικαιολογητικά)', color: '#ef4444' },
];

export default function CustomerFolderSlideout({ customerId, onClose, onUpdate }: Props) {
  const [customer, setCustomer] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'contract' | 'documents' | 'notes'>('contract');
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingSwitch, setUpdatingSwitch] = useState(false);

  useEffect(() => { fetchCustomer(); }, [customerId]);

  const fetchCustomer = async () => {
    setLoading(true);
    const { data: cust } = await supabase.from('hlektrismos_customers').select('*').eq('id', customerId).single();
    if (cust) {
      setCustomer(cust);
      if (cust.lead_id) {
        const { data: n } = await supabase.from('lead_notes').select('*').eq('lead_id', cust.lead_id).order('created_at', { ascending: false });
        setNotes(n || []);
      }
    }
    setLoading(false);
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !customer?.lead_id) return;
    await supabase.from('lead_notes').insert({ lead_id: customer.lead_id, content: newNote, author: 'Consultant', note_type: 'general' });
    setNewNote('');
    fetchCustomer();
  };

  const updateSwitchingStatus = async (newStatus: string) => {
    setUpdatingSwitch(true);
    await supabase.from('hlektrismos_customers').update({ switching_status: newStatus, updated_at: new Date().toISOString() }).eq('id', customer.id);
    setCustomer((c: any) => ({ ...c, switching_status: newStatus }));
    setUpdatingSwitch(false);
    onUpdate();
  };

  if (loading || !customer) return null;

  const currentStageIdx = SWITCHING_STAGES.findIndex(s => s.key === customer.switching_status);
  const isRejected = customer.switching_status?.startsWith('rejected');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ width: '100%', maxWidth: 640, height: '100%', background: 'var(--surface)', boxShadow: '-8px 0 30px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', background: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {customer.customer_type === 'B2B' ? <Building2 size={18} color="#a5b4fc" /> : <User size={18} color="#a5b4fc" />}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{customer.customer_type === 'B2B' && customer.company_name ? customer.company_name : customer.full_name}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>AFM: {customer.afm || 'N/A'} | {customer.phone}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', background: '#f8fafc', borderBottom: '1px solid var(--border)', padding: '10px 0', textAlign: 'center' }}>
          <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>PROVIDER</div><div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{customer.active_provider}</div></div>
          <div style={{ borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>PROGRAM</div><div style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>{customer.active_program}</div></div>
          <div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>CONTRACT END</div><div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>{customer.contract_end_date ? new Date(customer.contract_end_date).toLocaleDateString('el-GR') : 'N/A'}</div></div>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px', gap: 20 }}>
          {[{ key: 'contract', icon: <Zap size={14} />, label: 'Contract' }, { key: 'documents', icon: <FileText size={14} />, label: 'Documents' }, { key: 'notes', icon: <MessageSquare size={14} />, label: 'Notes' }].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)} style={{ padding: '10px 0', background: 'transparent', border: 'none', borderBottom: activeTab === tab.key ? '2px solid #6366f1' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: activeTab === tab.key ? '#6366f1' : '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
          {activeTab === 'contract' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}><Zap size={14} color="#f59e0b" /> Supply Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {[['Supply Number', customer.supply_number || 'N/A'], ['Consumption', `${customer.estimated_monthly_kwh || 'N/A'} kWh/mo`], ['Rate', `EUR${customer.unit_rate_kwh || 'N'}/kWh`], ['Fixed Fee', `EUR${customer.fixed_fee_monthly || 'N/A'}/mo`], ['Start', customer.contract_start_date ? new Date(customer.contract_end_date).toLocaleDateString('el-GR') : 'N/A'], ['Status', customer.contract_status || 'N/A']].map(([label, val]) => (
                    <div key={String(label)}><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{String(label)}</div><div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{String(val)}</div></div>
                  ))}
                </div>
              </div>

              <div style={{ padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <h3 style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Provider Switch Pipeline</h3>
                {!isRejected ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {SWITCHING_STAGES.filter(s => !s.key.startsWith('rejected')).map((stage, i) => {
                      const isDone = currentStageIdx > SWITCHING_STAGES.findIndex(s => s.key === stage.key);
                      const isCurrent = customer.switching_status === stage.key;
                      const isFuture = !isDone && !isCurrent;
                      return (
                        <div key={stage.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, background: isDone ? '#d1fae5' : isCurrent ? `${stage.color}20` : 'var(--bg)', color: isDone ? '#065f46' : isCurrent ? stage.color : 'var(--text-muted)', border: isCurrent ? `2px solid ${stage.color}` : '2px solid transparent' }}>
                            {isDone ? '\u2713' : i + 1}
                          </div>
                          <div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: isFuture ? 'var(--text-muted)' : 'var(--text)' }}>{stage.label}</div></div>
                          {isCurrent && (
                            <button onClick={() => { const ni = SWITCHING_STAGES.findIndex(s => s.key === stage.key) + 1; if (ni < SWITCHING_STAGES.length - 2) updateSwitchingStatus(SWITCHING_STAGES[ni].key); }} disabled={updatingSwitch} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 700, background: stage.color, color: '#fff', cursor: 'pointer' }}>
                              {updatingSwitch ? '...' : 'Next'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: 12, background: '#fef2f2', borderRadius: 8, border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={16} color="#dc2626" />
                    <div><div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>Rejected</div><div style={{ fontSize: 11, color: '#991b1b' }}>{customer.switching_status === 'rejected_debt' ? 'Unpaid debts' : 'Incomplete documents'}</div></div>
                    <button onClick={() => updateSwitchingStatus('docs_pending')} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Restart</button>
                  </div>
                )}

                {customer.contract_end_date && (
                  <div style={{ marginTop: 14, padding: 12, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1' }}>Renewal Check</div><div style={{ fontSize: 10, color: '#0284c7' }}>Auto-notify 45 days before expiry</div></div>
                    <button style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: '#0ea5e9', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={11} /> New Tariffs</button>
                  </div>
                )}
              </div>

              <div style={{ padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Contact Info</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={13} color="#64748b" /> {customer.phone}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={13} color="#64748b" /> {customer.email || 'N/A'}</span>
                  {customer.address && <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Calendar size={13} color="#64748b" /> {customer.address}</span>}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Add note..." style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--surface)', color: 'var(--text)', outline: 'none' }} onKeyDown={e => e.key === 'Enter' && handleAddNote()} />
                <button onClick={handleAddNote} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={13} /> Add</button>
              </div>
              {notes.map(n => (
                <div key={n.id} style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                    <span>{n.author}</span><span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{new Date(n.created_at).toLocaleString('el-GR')}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>{n.content}</p>
                </div>
              ))}
              {notes.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>No notes yet.</div>}
            </div>
          )}

          {activeTab === 'documents' && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <FileText size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ fontSize: 13 }}>Documents (offers, contracts) will appear here.</p>
              <p style={{ fontSize: 11 }}>Generate them from the lead or customer folder.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
