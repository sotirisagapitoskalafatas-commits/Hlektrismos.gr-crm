import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  X, User, Building2, Phone, Mail, MapPin, Zap, FileText, Calendar,
  Clock, RefreshCw, Upload, Sparkles, MessageSquare, Plus, Globe, Star, ShieldCheck, ExternalLink, AlertTriangle
} from 'lucide-react';

interface Props {
  entityId: string;
  entityType?: 'customer' | 'lead';
  onClose: () => void;
  onUpdate?: () => void;
}

const SWITCHING_STAGES = [
  { key: 'docs_pending', label: 'Συλλογή Δικαιολογητικών', color: '#f59e0b' },
  { key: 'submitted_to_provider', label: 'Αποστολή στον Πάροχο', color: '#3b82f6' },
  { key: 'deddie_meter_reading', label: 'Έλεγχος ΔΕΔΔΗΕ', color: '#8b5cf6' },
  { key: 'activated', label: 'Ενεργοποίηση', color: '#10b981' },
  { key: 'rejected_debt', label: 'Απόρριψη (Οφειλές)', color: '#ef4444' },
  { key: 'rejected_docs', label: 'Απόρριψη (Δικαιολογητικά)', color: '#ef4444' },
];

export default function CustomerFolderSlideout({ entityId, entityType = 'customer', onClose, onUpdate }: Props) {
  const [data, setData] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'contract' | 'bills' | 'documents' | 'timeline' | 'notes' | 'b2b_info'>('contract');
  const [notes, setNotes] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [newNote, setNewNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingSwitch, setUpdatingSwitch] = useState(false);

  useEffect(() => { fetchFullFolderData(); }, [entityId, entityType]);

  const fetchFullFolderData = async () => {
    setLoading(true);

    if (entityType === 'customer') {
      const { data: custData } = await supabase.from('hlektrismos_customers').select('*').eq('id', entityId).single();
      if (custData) {
        setData(custData);
        fetchNotes(custData.lead_id || custData.id);
        fetchDocuments(custData.id);
      }
    } else {
      const { data: leadData } = await supabase.from('hlektrismos_leads').select('*').eq('id', entityId).single();
      if (leadData) {
        setData(leadData);
        if (leadData.source === 'google_maps_scrape' || leadData.customer_type === 'B2B') {
          setActiveTab('b2b_info');
        } else {
          setActiveTab('notes');
        }
        fetchNotes(leadData.id);
        fetchDocuments(leadData.id);
      }
    }

    setLoading(false);
  };

  const fetchNotes = async (leadId: string) => {
    const { data: notesData } = await supabase.from('lead_notes').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
    setNotes(notesData || []);
  };

  const fetchDocuments = async (relatedId: string) => {
    const { data: docsData } = await supabase.from('customer_documents').select('*').or(`customer_id.eq.${relatedId},lead_id.eq.${relatedId}`).order('created_at', { ascending: false });
    setDocuments(docsData || []);
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !data) return;
    const targetLeadId = entityType === 'customer' ? (data.lead_id || data.id) : data.id;
    await supabase.from('lead_notes').insert({ lead_id: targetLeadId, content: newNote, author: 'Σύμβουλος', note_type: 'general' });
    setNewNote('');
    fetchNotes(targetLeadId);
  };

  const updateSwitchingStatus = async (newStatus: string) => {
    setUpdatingSwitch(true);
    await supabase.from('hlektrismos_customers').update({ switching_status: newStatus, updated_at: new Date().toISOString() }).eq('id', data.id);
    setData((c: any) => ({ ...c, switching_status: newStatus }));
    setUpdatingSwitch(false);
    onUpdate?.();
  };

  if (loading || !data) return null;

  const isB2B = data.customer_type === 'B2B' || data.source === 'google_maps_scrape';
  const currentStageIdx = SWITCHING_STAGES.findIndex(s => s.key === data.switching_status);
  const isRejected = data.switching_status?.startsWith('rejected');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 9998, display: 'flex', justifyContent: 'flex-end', transition: 'opacity 0.2s' }}>
      <div style={{ width: '100%', maxWidth: 960, height: '100%', background: 'var(--surface)', boxShadow: '-8px 0 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 32px', background: '#1e293b', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isB2B ? <Building2 size={22} color="#a5b4fc" /> : <User size={22} color="#a5b4fc" />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                  {isB2B && data.company_name ? data.company_name : data.full_name}
                </h2>
                <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: entityType === 'customer' ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)', color: entityType === 'customer' ? '#6ee7b7' : '#fcd34d', border: `1px solid ${entityType === 'customer' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}` }}>
                  {entityType === 'customer' ? 'ΕΝΕΡΓΟΣ ΠΕΛΑΤΗΣ' : 'LEAD / ΠΡΟΟΠΤΙΚΗ'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>ΑΦΜ: {data.afm || '—'}</span>
                <span>•</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={12} /> {data.phone || '—'}</span>
                <span>•</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {data.email || '—'}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ padding: 8, background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', borderRadius: 8 }}><X size={22} /></button>
        </div>

        {/* Quick KPI Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', background: '#f8fafc', borderBottom: '1px solid var(--border)', padding: '12px 0', textAlign: 'center' }}>
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Τύπος</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{isB2B ? 'Εταιρικό (B2B)' : 'Οικιακό (B2C)'}</div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Πάροχος / Πρόγραμμα</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#6366f1' }}>
              {data.active_provider ? `${data.active_provider} (${data.active_program || '—'})` : 'Δεν καταχωρήθηκε'}
            </div>
          </div>
          <div style={{ borderRight: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Περιοχή / Πόλη</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{data.city || data.address || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Πηγή Lead</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981' }}>{data.source || 'Direct Manual'}</div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 32px', gap: 28, background: '#fff' }}>
          {entityType === 'customer' && (
            <button onClick={() => setActiveTab('contract')} style={{ padding: '14px 0', background: 'transparent', border: 'none', borderBottom: activeTab === 'contract' ? '2px solid #6366f1' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: activeTab === 'contract' ? 700 : 600, color: activeTab === 'contract' ? '#6366f1' : '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={14} /> Ενεργό Συμβόλαιο
            </button>
          )}
          {isB2B && (
            <button onClick={() => setActiveTab('b2b_info')} style={{ padding: '14px 0', background: 'transparent', border: 'none', borderBottom: activeTab === 'b2b_info' ? '2px solid #6366f1' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: activeTab === 'b2b_info' ? 700 : 600, color: activeTab === 'b2b_info' ? '#6366f1' : '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 size={14} /> Στοιχεία Scraper & Google Maps
            </button>
          )}
          <button onClick={() => setActiveTab('documents')} style={{ padding: '14px 0', background: 'transparent', border: 'none', borderBottom: activeTab === 'documents' ? '2px solid #6366f1' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: activeTab === 'documents' ? 700 : 600, color: activeTab === 'documents' ? '#6366f1' : '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileText size={14} /> Έγγραφα & Προσφορές ({documents.length})
          </button>
          <button onClick={() => setActiveTab('notes')} style={{ padding: '14px 0', background: 'transparent', border: 'none', borderBottom: activeTab === 'notes' ? '2px solid #6366f1' : '2px solid transparent', cursor: 'pointer', fontSize: 12, fontWeight: activeTab === 'notes' ? 700 : 600, color: activeTab === 'notes' ? '#6366f1' : '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageSquare size={14} /> Σημειώσεις ({notes.length})
          </button>
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 32, background: '#f8fafc' }}>

          {/* TAB: CONTRACT */}
          {activeTab === 'contract' && entityType === 'customer' && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
              <div>
                <div style={{ padding: 24, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                    <Zap size={16} color="#f59e0b" /> Στοιχεία Παροχής & Χρεώσεων
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                    {[
                      ['Αριθμός Παροχής (ΔΕΔΔΗΕ)', data.supply_number || '—'],
                      ['Εκτιμώμενη Κατανάλωση', `${data.estimated_monthly_kwh || '—'} kWh/μήνα`],
                      ['Χρέωση Ενέργειας', `€${data.unit_rate_kwh || '0.00'}/kWh`],
                      ['Μηνιαίο Πάγιο', `€${data.fixed_fee_monthly || '0.00'}/μήνα`],
                      ['Ημερομηνία Έναρξης', data.contract_start_date ? new Date(data.contract_start_date).toLocaleDateString('el-GR') : '—'],
                      ['Κατάσταση', data.contract_status || '—'],
                    ].map(([label, val]) => (
                      <div key={String(label)}>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{String(label)}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{String(val)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Provider Switch Pipeline */}
                <div style={{ padding: 24, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, marginTop: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Provider Switch Pipeline</h3>
                  {!isRejected ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {SWITCHING_STAGES.filter(s => !s.key.startsWith('rejected')).map((stage, i) => {
                        const isDone = currentStageIdx > SWITCHING_STAGES.findIndex(s => s.key === stage.key);
                        const isCurrent = data.switching_status === stage.key;
                        const isFuture = !isDone && !isCurrent;
                        return (
                          <div key={stage.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 10, background: isCurrent ? `${stage.color}08` : 'transparent' }}>
                            <div style={{ width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, background: isDone ? '#d1fae5' : isCurrent ? `${stage.color}20` : '#f1f5f9', color: isDone ? '#065f46' : isCurrent ? stage.color : '#94a3b8', border: isCurrent ? `2px solid ${stage.color}` : '2px solid transparent' }}>
                              {isDone ? '✓' : i + 1}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, color: isFuture ? '#94a3b8' : 'var(--text)' }}>{stage.label}</div>
                            </div>
                            {isCurrent && (
                              <button onClick={() => { const ni = SWITCHING_STAGES.findIndex(s => s.key === stage.key) + 1; if (ni < SWITCHING_STAGES.length - 2) updateSwitchingStatus(SWITCHING_STAGES[ni].key); }} disabled={updatingSwitch} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', fontSize: 10, fontWeight: 700, background: stage.color, color: '#fff', cursor: 'pointer' }}>
                                {updatingSwitch ? '...' : 'Next'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ padding: 14, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <AlertTriangle size={18} color="#dc2626" />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>Απορρίφθηκε</div>
                        <div style={{ fontSize: 11, color: '#991b1b' }}>{data.switching_status === 'rejected_debt' ? 'Unpaid debts' : 'Incomplete documents'}</div>
                      </div>
                      <button onClick={() => updateSwitchingStatus('docs_pending')} style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>Restart</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Renewal Action Sidebox */}
              <div>
                <div style={{ padding: 24, background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 16, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#3730a3' }}>Έλεγχος Ανανέωσης</h4>
                    <p style={{ margin: '8px 0 0', fontSize: 12, color: '#4338ca', lineHeight: 1.6 }}>
                      Υπολογίστε αυτόματα το όφελος μετάβασης σε νέο πάροχο με βάση τις τρέχουσες τιμές ΡΑΑΕΥ.
                    </p>
                  </div>
                  <button style={{ marginTop: 16, padding: '10px 0', width: '100%', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    <RefreshCw size={14} /> Υπολογισμός Όφελους
                  </button>
                </div>

                <div style={{ padding: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, marginTop: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Contact Info</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={13} color="#64748b" /> {data.phone}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={13} color="#64748b" /> {data.email || '—'}</span>
                    {data.address && <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={13} color="#64748b" /> {data.address}</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: B2B SCRAPER METADATA */}
          {activeTab === 'b2b_info' && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
              <div style={{ padding: 24, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                  <Building2 size={16} color="#6366f1" /> Αντλημένα Στοιχεία από SerpApi / Google Maps
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Επωνυμία</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{data.company_name || data.full_name}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Ιστοσελίδα</div>
                    {data.website ? (
                      <a href={data.website.startsWith('http') ? data.website : `https://${data.website}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600, color: '#6366f1', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                        {data.website} <ExternalLink size={12} />
                      </a>
                    ) : (
                      <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Δεν βρέθηκε</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>Διεύθυνση</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{data.address || '—'}{data.city ? `, ${data.city}` : ''}</div>
                  </div>
                </div>
                {data.notes && (
                  <div style={{ marginTop: 20, padding: 14, background: '#f8fafc', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Μεταδεδομένα Scraper</div>
                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{data.notes}</div>
                  </div>
                )}
              </div>
              <div>
                <div style={{ padding: 20, background: '#fff', border: '1px solid var(--border)', borderRadius: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Contact Info</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: 'var(--text)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={13} color="#64748b" /> {data.phone || '—'}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={13} color="#64748b" /> {data.email || '—'}</span>
                    {data.address && <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={13} color="#64748b" /> {data.address}</span>}
                    {data.region && <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Globe size={13} color="#64748b" /> {data.region}</span>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: DOCUMENTS & OFFER PDFs */}
          {activeTab === 'documents' && (
            <div style={{ padding: 24, background: '#fff', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <FileText size={16} color="#6366f1" /> Αρχεία, Προσφορές & Αιτήσεις
                </h3>
                <button style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: '#1e293b', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Upload size={13} /> Ανέβασμα Αρχείου
                </button>
              </div>
              {documents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                  <FileText size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <div style={{ fontSize: 13 }}>Δεν υπάρχουν ανεβασμένα έγγραφα.</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>Generate them from the lead or customer folder.</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {documents.map((doc) => (
                    <div key={doc.id} style={{ padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FileText size={20} color="#6366f1" />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{doc.file_name}</div>
                          <div style={{ fontSize: 10, color: '#94a3b8' }}>{new Date(doc.created_at).toLocaleDateString('el-GR')}</div>
                        </div>
                      </div>
                      <a href={doc.file_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textDecoration: 'none' }}>Λήψη</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: NOTES */}
          {activeTab === 'notes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 10, padding: 14, background: '#fff', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <input value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="Προσθέστε σημείωση επικοινωνίας ή follow-up..."
                  style={{ flex: 1, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, background: '#f8fafc', color: 'var(--text)', outline: 'none' }}
                  onKeyDown={e => e.key === 'Enter' && handleAddNote()} />
                <button onClick={handleAddNote} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={14} /> Προσθήκη
                </button>
              </div>
              {notes.map(n => (
                <div key={n.id} style={{ padding: 14, background: '#fff', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                    <span>{n.author || 'Σύμβουλος'}</span>
                    <span style={{ color: '#94a3b8', fontSize: 10 }}>{new Date(n.created_at).toLocaleString('el-GR')}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{n.content}</p>
                </div>
              ))}
              {notes.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontSize: 12 }}>Δεν υπάρχουν σημειώσεις.</div>}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
