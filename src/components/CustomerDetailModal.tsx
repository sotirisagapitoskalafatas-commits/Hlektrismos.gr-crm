import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { X, Phone, Mail, MapPin, Building2, FileText, User, GitBranch, Plus, HardDrive } from 'lucide-react';

interface CustomerDetailModalProps {
  customer: any;
  onClose: () => void;
}

const PIPELINE_STAGES = [
  { key: 'intro', label: '1. Intro' },
  { key: 'awaiting_offer', label: '2. Offer' },
  { key: 'awaiting_signature', label: '3. Signature' },
  { key: 'accepted', label: '4. Accepted' },
  { key: 'sent_to_provider', label: '5. Sent' },
  { key: 'active', label: '6. Active' },
];

export default function CustomerDetailModal({ customer, onClose }: CustomerDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'meters' | 'docs' | 'agents' | 'pipeline'>('info');
  const [meters, setMeters] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);

  useEffect(() => {
    if (!customer?.id) return;
    loadData();
  }, [customer?.id]);

  const loadData = async () => {
    const [metersRes, docsRes, agentsRes] = await Promise.all([
      supabase.from('customer_meters').select('*').eq('customer_id', customer.id),
      supabase.from('customer_documents').select('*').eq('customer_id', customer.id),
      supabase.from('customer_agent_attribution').select('*, sales_agents(*)').eq('customer_id', customer.id),
    ]);
    setMeters(metersRes.data || []);
    setDocs(docsRes.data || []);
    setAgents(agentsRes.data || []);
  };

  const tabs = [
    { id: 'info', label: 'Info' },
    { id: 'meters', label: 'Meters' },
    { id: 'docs', label: 'Documents' },
    { id: 'agents', label: 'Sales' },
    { id: 'pipeline', label: 'Pipeline' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: '100%', maxWidth: 800, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{customer.full_name}</h2>
              <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: customer.customer_type === 'B2B' ? 'rgba(139,92,246,0.15)' : 'rgba(16,185,129,0.15)', color: customer.customer_type === 'B2B' ? '#a78bfa' : '#34d399' }}>
                {customer.customer_type || 'B2C'}
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              AFM: {customer.afm || 'N/A'} | {customer.email || 'No email'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 24px', gap: 24 }}>
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              style={{ padding: '12px 0', background: 'none', border: 'none', borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 400, color: activeTab === tab.id ? 'var(--text)' : 'var(--text-muted)' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {activeTab === 'info' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { icon: Phone, label: 'Phone', value: customer.phone },
                { icon: Mail, label: 'Email', value: customer.email },
                { icon: MapPin, label: 'Address', value: customer.address },
                { icon: Building2, label: 'Provider', value: customer.active_provider },
                { icon: HardDrive, label: 'Program', value: customer.active_program },
                { icon: FileText, label: 'Supply #', value: customer.supply_number },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}><Icon size={12} /> {label}</div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{value || '-'}</div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'meters' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {meters.map((m) => (
                <div key={m.id} style={{ padding: 14, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: 'var(--primary)' }}>{m.supply_number}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.meter_type} | {m.property_address || 'No address'}</div>
                  </div>
                  {m.is_main_meter && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: 'rgba(16,185,129,0.15)', color: '#34d399', fontWeight: 600 }}>Main</span>}
                </div>
              ))}
              <button style={{ padding: 10, border: '1px dashed var(--border)', borderRadius: 10, background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Plus size={14} /> Add Meter
              </button>
            </div>
          )}

          {activeTab === 'docs' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Gov ID / Passport', type: 'gov_id' },
                { label: 'E9 Tax Statement', type: 'e9_tax' },
                { label: 'Rental Contract', type: 'rental_contract' },
                { label: 'Energy Bill', type: 'energy_bill' },
                { label: 'Authorization Form', type: 'authorization_form' },
              ].map((doc) => {
                const existing = docs.find((d) => d.document_type === doc.type);
                return (
                  <div key={doc.type} style={{ padding: 14, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{doc.label}</span>
                    {existing ? (
                      <span style={{ fontSize: 11, color: '#34d399' }}>Uploaded: {existing.file_name}</span>
                    ) : (
                      <input type="file" style={{ fontSize: 11 }} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'agents' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {agents.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No sales agents assigned</p>
              ) : agents.map((a: any) => (
                <div key={a.agent_id} style={{ padding: 12, background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{a.sales_agents?.full_name || 'Unknown'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.split_percentage}% split | {a.sales_agents?.agent_type}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'pipeline' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: 'var(--bg)', borderRadius: 12, border: '1px solid var(--border)' }}>
              {PIPELINE_STAGES.map((stage, idx) => {
                const isCurrent = customer.pipeline_stage === stage.key;
                const isPast = PIPELINE_STAGES.findIndex((s) => s.key === customer.pipeline_stage) > idx;
                return (
                  <div key={stage.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                      background: isCurrent ? 'var(--primary)' : isPast ? 'rgba(16,185,129,0.2)' : 'var(--border)',
                      color: isCurrent ? '#fff' : isPast ? '#34d399' : 'var(--text-muted)',
                      boxShadow: isCurrent ? '0 0 0 4px rgba(99,102,241,0.2)' : 'none',
                    }}>
                      {idx + 1}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', maxWidth: 70, textAlign: 'center' }}>{stage.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
