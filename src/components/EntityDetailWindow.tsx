import { useState, useEffect, useCallback } from 'react';
import { X, Save, Plus, Trash2, Upload, Download, Maximize2, Minimize2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SERVICES_LIST, PROVIDER_LIST, LEAD_SOURCES, getProgramsForProvider } from '../constants/energyData';

interface SupplyPoint {
  id: string; entity_id: string; entity_type: 'lead' | 'customer';
  supply_number: string; provider_name: string | null; program_name: string | null;
  sales_agent_id: string | null; status: string; estimated_commission: number;
  monthly_cost: number | null; created_at: string;
}

interface EntityDocument {
  id: string; entity_id: string; entity_type: 'lead' | 'customer';
  document_type: string; file_name: string | null; file_url: string;
  file_size_bytes: number | null; created_at: string;
}

interface Agent { id: string; full_name: string; }

interface EntityDetailWindowProps {
  entityId: string;
  entityType: 'lead' | 'customer';
  sourceTable?: 'leads' | 'customers';
  onClose: () => void;
  onSaved?: () => void;
}

const DOC_TYPES = [
  { key: 'ID', label: 'Ταυτότητα' },
  { key: 'E9', label: 'Ε9' },
  { key: 'RENTAL_CONTRACT', label: 'Μισθωτήριο' },
  { key: 'OUR_CONTRACT', label: 'Συμβόλαιο Εμάς' },
  { key: 'CURRENT_BILL', label: 'Τρέχων Λογαριασμός' },
  { key: 'PREVIOUS_BILL', label: 'Προηγούμενος Λογαριασμός' },
];

const TABS = [
  { key: 'general', label: 'Γενικά' },
  { key: 'supplies', label: 'Παροχές' },
  { key: 'documents', label: 'Έγγραφα' },
  { key: 'offers', label: 'Προσφορές' },
];

const inputS: React.CSSProperties = {
  width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 6,
  fontSize: 13, background: 'var(--surface)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
};
const labelS: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 };
const btnP: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
};
const btnD: React.CSSProperties = {
  padding: '4px 8px', borderRadius: 4, border: 'none', background: '#fee2e2', color: '#dc2626', fontSize: 11, cursor: 'pointer',
};
const thS: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid var(--border)',
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: 0.5,
};
const tdS: React.CSSProperties = {
  padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)',
};

export default function EntityDetailWindow({ entityId, entityType, sourceTable, onClose, onSaved }: EntityDetailWindowProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [entity, setEntity] = useState<any>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [supplyPoints, setSupplyPoints] = useState<SupplyPoint[]>([]);
  const [documents, setDocuments] = useState<EntityDocument[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [showAddSupply, setShowAddSupply] = useState(false);
  const [newSupply, setNewSupply] = useState({
    supply_number: '', provider_name: '', program_name: '',
    sales_agent_id: '', estimated_commission: '0', monthly_cost: '',
  });
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const table = sourceTable === 'leads' ? 'hlektrismos_leads' : entityType === 'customer' ? 'hlektrismos_customers' : 'hlektrismos_leads';

  const loadEntity = useCallback(async () => {
    setLoading(true);
    const [entityRes, supplyRes, docsRes, agentsRes] = await Promise.all([
      supabase.from(table).select('*').eq('id', entityId).single(),
      supabase.from('supply_points').select('*').eq('entity_id', entityId).eq('entity_type', entityType).order('created_at', { ascending: false }),
      supabase.from('entity_documents').select('*').eq('entity_id', entityId).eq('entity_type', entityType).order('created_at', { ascending: false }),
      supabase.from('sales_agents').select('id, full_name').eq('active', true),
    ]);
    if (entityRes.data) {
      const e = entityRes.data;
      // If lead used as customer, normalize name fields
      if (entityType === 'customer' && !e.full_name && (e.first_name || e.last_name)) {
        e.full_name = `${e.first_name || ''} ${e.last_name || ''}`.trim();
      }
      setEntity(e); setEditForm(e);
    }
    if (supplyRes.data) setSupplyPoints(supplyRes.data as SupplyPoint[]);
    if (docsRes.data) setDocuments(docsRes.data as EntityDocument[]);
    if (agentsRes.data) setAgents(agentsRes.data as Agent[]);
    setLoading(false);
  }, [entityId, entityType, table]);

  useEffect(() => { loadEntity(); }, [loadEntity]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const entityName = entityType === 'customer'
    ? (entity?.full_name || `${entity?.first_name || ''} ${entity?.last_name || ''}`.trim() || 'Πελάτης')
    : `${entity?.first_name || ''} ${entity?.last_name || ''}`.trim() || 'Lead';

  const currentProvider = editForm.current_provider || editForm.active_provider || '';
  const providerPrograms = currentProvider ? getProgramsForProvider(currentProvider) : [];
  const availablePrograms = [...new Set(providerPrograms.map(p => p.program))];

  const saveGeneral = async () => {
    setSaving(true);
    const useLeadFields = (sourceTable === 'leads' && entityType === 'customer') || entityType === 'lead';
    const allowed = entityType === 'customer' && !useLeadFields
      ? ['full_name', 'company_name', 'phone', 'email', 'afm', 'address', 'city', 'active_provider', 'active_program', 'supply_number', 'pipeline_stage', 'notes', 'service_type', 'source', 'government_id']
      : ['first_name', 'last_name', 'phone', 'email', 'region', 'status', 'company_name', 'address', 'comments', 'customer_type', 'service_type', 'source', 'assigned_to', 'current_provider', 'program_name', 'government_id'];
    const payload: Record<string, any> = {};
    for (const k of allowed) { if (k in editForm) payload[k] = editForm[k]; }
    // For leads used as customers, map full_name back to first/last
    if (useLeadFields && payload.full_name) {
      const parts = payload.full_name.split(' ');
      payload.first_name = parts[0] || '';
      payload.last_name = parts.slice(1).join(' ');
      delete payload.full_name;
    }
    // Map customer field names to lead field names
    if (useLeadFields) {
      if (payload.active_provider !== undefined) { payload.current_provider = payload.active_provider; delete payload.active_provider; }
      if (payload.active_program !== undefined) { payload.program_name = payload.active_program; delete payload.active_program; }
      if (payload.pipeline_stage !== undefined) delete payload.pipeline_stage;
      if (payload.notes !== undefined) { payload.comments = payload.notes; delete payload.notes; }
    }
    const { error } = await supabase.from(table).update(payload).eq('id', entityId);
    setSaving(false);
    if (error) setToast({ msg: `Σφάλμα: ${error.message}`, type: 'error' });
    else { setToast({ msg: 'Αποθηκεύτηκε.', type: 'success' }); onSaved?.(); }
  };

  const addSupplyPoint = async () => {
    if (!newSupply.supply_number.trim()) return;
    const { error } = await supabase.from('supply_points').insert({
      entity_id: entityId, entity_type: entityType,
      supply_number: newSupply.supply_number.trim(),
      provider_name: newSupply.provider_name || null,
      program_name: newSupply.program_name || null,
      sales_agent_id: newSupply.sales_agent_id || null,
      estimated_commission: parseFloat(newSupply.estimated_commission) || 0,
      monthly_cost: newSupply.monthly_cost ? parseFloat(newSupply.monthly_cost) : null,
    });
    if (error) setToast({ msg: `Σφάλμα: ${error.message}`, type: 'error' });
    else {
      setToast({ msg: 'Παροχή προστέθηκε.', type: 'success' });
      setShowAddSupply(false);
      setNewSupply({ supply_number: '', provider_name: '', program_name: '', sales_agent_id: '', estimated_commission: '0', monthly_cost: '' });
      loadEntity();
    }
  };

  const deleteSupplyPoint = async (id: string) => {
    if (!confirm('Διαγραφή παροχής;')) return;
    const { error } = await supabase.from('supply_points').delete().eq('id', id);
    if (!error) { setToast({ msg: 'Διαγράφηκε.', type: 'success' }); loadEntity(); }
  };

  const handleDocUpload = async (docType: string, file: File) => {
    setUploadingDoc(docType);
    const path = `${entityType}s/${entityId}/${docType}/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage.from('hlektrismos_docs').upload(path, file);
    if (uploadErr) { setToast({ msg: `Σφάλμα upload: ${uploadErr.message}`, type: 'error' }); setUploadingDoc(null); return; }
    const { data: urlData } = supabase.storage.from('hlektrismos_docs').getPublicUrl(path);
    const { error: insertErr } = await supabase.from('entity_documents').insert({
      entity_id: entityId, entity_type: entityType, document_type: docType,
      file_name: file.name, file_url: urlData.publicUrl, file_size_bytes: file.size,
    });
    setUploadingDoc(null);
    if (insertErr) setToast({ msg: `Σφάλμα: ${insertErr.message}`, type: 'error' });
    else { setToast({ msg: 'Έγγραφο ανέβηκε.', type: 'success' }); loadEntity(); }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm('Διαγραφή εγγράφου;')) return;
    const { error } = await supabase.from('entity_documents').delete().eq('id', id);
    if (!error) { setToast({ msg: 'Διαγράφηκε.', type: 'success' }); loadEntity(); }
  };

  const getField = (label: string, key: string, type = 'text') => (
    <div key={key} style={{ marginBottom: 12 }}>
      <label style={labelS}>{label}</label>
      <input type={type} value={editForm[key] || ''} onChange={e => setEditForm((f: any) => ({ ...f, [key]: e.target.value }))} style={inputS} />
    </div>
  );

  const getTextarea = (label: string, key: string) => (
    <div key={key} style={{ marginBottom: 12 }}>
      <label style={labelS}>{label}</label>
      <textarea value={editForm[key] || ''} onChange={e => setEditForm((f: any) => ({ ...f, [key]: e.target.value }))} rows={3} style={{ ...inputS, resize: 'vertical' }} />
    </div>
  );

  const getSelect = (label: string, key: string, options: { value: string; label: string }[]) => (
    <div key={key} style={{ marginBottom: 12 }}>
      <label style={labelS}>{label}</label>
      <select value={editForm[key] || ''} onChange={e => setEditForm((f: any) => ({ ...f, [key]: e.target.value }))} style={inputS}>
        <option value="">-- Επιλέξτε --</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );

  const renderGeneral = () => {
    if (entityType === 'customer') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', maxWidth: 700 }}>
          {getField('Ονοματεπώνυμο', 'full_name')}
          {getField('Εταιρεία', 'company_name')}
          {getField('ΑΦΜ', 'afm')}
          {getField('Α.Τ. / Ταυτότητα', 'government_id')}
          {getField('Τηλέφωνο', 'phone', 'tel')}
          {getField('Email', 'email', 'email')}
          {getField('Διεύθυνση', 'address')}
          {getField('Πόλη', 'city')}
          {getSelect('Υπηρεσία Ενδιαφέροντος', 'service_type', SERVICES_LIST.map(s => ({ value: s.key, label: `${s.icon} ${s.label}` })))}
          {getSelect('Πάροχος (Τρέχων)', 'active_provider', PROVIDER_LIST.map(p => ({ value: p, label: p })))}
          {getSelect('Πρόγραμμα', 'active_program', availablePrograms.map(p => ({ value: p, label: p })))}
          {getSelect('Πηγή', 'source', LEAD_SOURCES.map(s => ({ value: s.key, label: s.label })))}
          {getSelect('Κατάσταση', 'pipeline_stage', [
            { value: 'intro', label: 'Εισαγωγή' },
            { value: 'awaiting_offer', label: 'Αναμονή Προσφοράς' },
            { value: 'awaiting_signature', label: 'Αναμονή Υπογραφής' },
            { value: 'accepted', label: 'Αποδεκτή' },
            { value: 'sent_to_provider', label: 'Απεσταλμένη στον Πάροχο' },
            { value: 'active', label: 'Ενεργή' },
            { value: 'rejected', label: 'Απορρίφθηκε' },
          ])}
          {getTextarea('Σημειώσεις', 'notes')}
        </div>
      );
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px', maxWidth: 700 }}>
        {getField('Όνομα', 'first_name')}
        {getField('Επώνυμο', 'last_name')}
        {getField('Τηλέφωνο', 'phone', 'tel')}
        {getField('Email', 'email', 'email')}
        {getField('Περιοχή', 'region')}
        {getField('Εταιρεία', 'company_name')}
        {getField('Διεύθυνση', 'address')}
        {getField('Α.Τ. / Ταυτότητα', 'government_id')}
        {getSelect('Υπηρεσία Ενδιαφέροντος', 'service_type', SERVICES_LIST.map(s => ({ value: s.key, label: `${s.icon} ${s.label}` })))}
        {getSelect('Πάροχος (Τρέχων)', 'current_provider', PROVIDER_LIST.map(p => ({ value: p, label: p })))}
        {getSelect('Πρόγραμμα', 'program_name', availablePrograms.map(p => ({ value: p, label: p })))}
        {getSelect('Πηγή', 'source', LEAD_SOURCES.map(s => ({ value: s.key, label: s.label })))}
        {getSelect('Κατάσταση', 'status', [
          { value: 'new', label: 'Νέο' },
          { value: 'contacted', label: 'Επικοινωνήθηκε' },
          { value: 'qualified', label: 'Qualified' },
          { value: 'proposal', label: 'Προσφορά' },
          { value: 'won', label: 'Κερδισμένο' },
          { value: 'lost', label: 'Χαμένο' },
        ])}
        {getSelect('Τύπος', 'customer_type', [
          { value: 'B2C', label: 'B2C (Ιδιώτης)' },
          { value: 'B2B', label: 'B2B (Επιχείρηση)' },
        ])}
        {getTextarea('Σημειώσεις', 'comments')}
      </div>
    );
  };

  const renderSupplies = () => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          Αριθμοί Παροχής ΔΕΔΔΗΕ ({supplyPoints.length})
        </h3>
        <button onClick={() => setShowAddSupply(!showAddSupply)} style={btnP}>
          <Plus size={14} /> Προσθήκη Παροχής
        </button>
      </div>
      {showAddSupply && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 4 }}>Αριθ. Παροχής *</label>
              <input value={newSupply.supply_number} onChange={e => setNewSupply(p => ({ ...p, supply_number: e.target.value }))} style={inputS} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 4 }}>Πάροχος</label>
              <select value={newSupply.provider_name} onChange={e => setNewSupply(p => ({ ...p, provider_name: e.target.value, program_name: '' }))} style={inputS}>
                <option value="">-- Επιλέξτε --</option>
                {PROVIDER_LIST.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 4 }}>Πρόγραμμα</label>
              <select value={newSupply.program_name} onChange={e => setNewSupply(p => ({ ...p, program_name: e.target.value }))} style={inputS}>
                <option value="">-- Επιλέξτε --</option>
                {getProgramsForProvider(newSupply.provider_name).map((p, i) => (
                  <option key={i} value={p.program}>{p.program} ({p.color})</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 4 }}>Πωλητής</label>
              <select value={newSupply.sales_agent_id} onChange={e => setNewSupply(p => ({ ...p, sales_agent_id: e.target.value }))} style={inputS}>
                <option value="">-- Επιλέξτε --</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 4 }}>Εκτ. Προμήθεια (€)</label>
              <input type="number" value={newSupply.estimated_commission} onChange={e => setNewSupply(p => ({ ...p, estimated_commission: e.target.value }))} style={inputS} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 4 }}>Εκτ. Μηνιαίο (€)</label>
              <input type="number" value={newSupply.monthly_cost} onChange={e => setNewSupply(p => ({ ...p, monthly_cost: e.target.value }))} style={inputS} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={addSupplyPoint} disabled={!newSupply.supply_number.trim()} style={{ ...btnP, opacity: newSupply.supply_number.trim() ? 1 : 0.5 }}>Αποθήκευση</button>
            <button onClick={() => setShowAddSupply(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>Ακύρωση</button>
          </div>
        </div>
      )}
      {supplyPoints.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Δεν υπάρχουν καταχωρημένες παροχές.</p>
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--surface)' }}>
              <th style={thS}>Αριθ. Παροχής</th>
              <th style={thS}>Πάροχος</th>
              <th style={thS}>Πρόγραμμα</th>
              <th style={thS}>Πωλητής</th>
              <th style={thS}>Κατάσταση</th>
              <th style={thS}>Εκτ. Προμήθεια</th>
              <th style={thS}>Εκτ. Μηνιαίο</th>
              <th style={{ ...thS, width: 50 }}></th>
            </tr></thead>
            <tbody>
              {supplyPoints.map(sp => {
                const agentName = agents.find(a => a.id === sp.sales_agent_id)?.full_name || '-';
                return (
                  <tr key={sp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={tdS}><strong>{sp.supply_number}</strong></td>
                    <td style={tdS}>{sp.provider_name || '-'}</td>
                    <td style={tdS}>{sp.program_name || '-'}</td>
                    <td style={tdS}>{agentName}</td>
                    <td style={tdS}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                        background: sp.status === 'active' ? '#dcfce7' : sp.status === 'pending' ? '#fef9c3' : '#fee2e2',
                        color: sp.status === 'active' ? '#166534' : sp.status === 'pending' ? '#854d0e' : '#991b1b' }}>
                        {sp.status}
                      </span>
                    </td>
                    <td style={{ ...tdS, fontVariantNumeric: 'tabular-nums' }}>{sp.estimated_commission > 0 ? `€${sp.estimated_commission.toFixed(2)}` : '-'}</td>
                    <td style={{ ...tdS, fontVariantNumeric: 'tabular-nums' }}>{sp.monthly_cost ? `€${sp.monthly_cost.toFixed(2)}` : '-'}</td>
                    <td style={{ ...tdS, textAlign: 'center' }}>
                      <button onClick={() => deleteSupplyPoint(sp.id)} style={btnD}><Trash2 size={12} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  const renderDocuments = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {DOC_TYPES.filter(dt => dt.key !== 'OFFER').map(dt => {
        const doc = documents.find(d => d.document_type === dt.key);
        const isUploading = uploadingDoc === dt.key;
        return (
          <div key={dt.key} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{dt.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {doc ? `Ανέβηκε: ${new Date(doc.created_at).toLocaleDateString('el-GR')}` : 'Δεν υπάρχει'}
                </div>
              </div>
            </div>
            {doc ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ ...btnP, textDecoration: 'none', fontSize: 12, padding: '6px 12px' }}>
                  <Download size={12} /> Λήψη
                </a>
                <button onClick={() => deleteDocument(doc.id)} style={btnD}>Διαγραφή</button>
              </div>
            ) : (
              <label style={{ ...btnP, cursor: 'pointer', opacity: isUploading ? 0.5 : 1, fontSize: 12, padding: '6px 12px' }}>
                <Upload size={12} /> {isUploading ? 'Ανέβασμα...' : 'Μεταφόρτωση'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(dt.key, f); e.target.value = ''; }}
                  disabled={isUploading} />
              </label>
            )}
          </div>
        );
      })}
    </div>
  );

  const renderOffers = () => {
    const offers = documents.filter(d => d.document_type === 'OFFER');
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Προσφορές ({offers.length})</h3>
          <label style={{ ...btnP, cursor: 'pointer' }}>
            <Upload size={14} /> Μεταφόρτωση Προσφοράς
            <input type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload('OFFER', f); e.target.value = ''; }} />
          </label>
        </div>
        {offers.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Δεν υπάρχουν καταχωρημένες προσφορές.</p>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {offers.map(offer => (
              <div key={offer.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{offer.file_name || 'Offer'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{new Date(offer.created_at).toLocaleDateString('el-GR')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={offer.file_url} target="_blank" rel="noopener noreferrer" style={{ ...btnP, textDecoration: 'none', fontSize: 12, padding: '6px 12px' }}>
                    <Download size={12} />
                  </a>
                  <button onClick={() => deleteDocument(offer.id)} style={btnD}><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: 40, alignSelf: 'center' }}>Φόρτωση...</div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }} />

      {/* Drawer */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: isFullScreen ? '100vw' : 'min(700px, 95vw)',
        height: '100vh', background: 'var(--bg, #fff)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-12px 0 48px rgba(0,0,0,0.1)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.3s ease',
      }}>
        {/* Toast */}
        {toast && (
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, padding: '10px 20px', borderRadius: 8,
            background: toast.type === 'success' ? '#dcfce7' : '#fee2e2', color: toast.type === 'success' ? '#166534' : '#991b1b',
            fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            {toast.msg}
          </div>
        )}

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{entityName}</h2>
            <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
              background: entityType === 'customer' ? '#dbeafe' : '#dcfce7', color: entityType === 'customer' ? '#1e40af' : '#166534' }}>
              {entityType === 'customer' ? 'Πελάτης' : 'Lead'}
            </span>
            {entity?.service_type && (
              <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>
                {SERVICES_LIST.find(s => s.key === entity.service_type)?.icon} {entity.service_type}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={saveGeneral} disabled={saving} style={btnP}>
              <Save size={14} /> {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </button>
            <button onClick={() => setIsFullScreen(!isFullScreen)} title={isFullScreen ? 'Σμίκρυνση' : 'Πλήρης Οθόνη'}
              style={{ padding: 8, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', color: 'var(--text-muted)', display: 'grid', placeItems: 'center' }}>
              {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button onClick={onClose} style={{ padding: '8px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', padding: '0 24px', background: 'var(--surface)', flexShrink: 0 }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '10px 20px', border: 'none', borderBottom: activeTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
              background: 'transparent', color: activeTab === tab.key ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: activeTab === tab.key ? 700 : 500, fontSize: 13, cursor: 'pointer',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {activeTab === 'general' && renderGeneral()}
          {activeTab === 'supplies' && renderSupplies()}
          {activeTab === 'documents' && renderDocuments()}
          {activeTab === 'offers' && renderOffers()}
        </div>
      </div>
    </div>
  );
}
