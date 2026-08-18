import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard, Bot, Users, Radar, TrendingUp, MessageSquare,
  Settings, BarChart3, Shield, Globe, Palette, Zap, Phone, Database, FileText, Save, RefreshCw
} from 'lucide-react';

interface SettingEntry {
  id: string;
  setting_key: string;
  setting_value: any;
  category: string;
  description: string;
  updated_at: string;
}

const CATEGORIES = [
  { key: 'general', label: 'Επισκόπηση', icon: LayoutDashboard, desc: 'Ρυθμίσεις επισκόπησης & KPIs' },
  { key: 'agents', label: 'AI Agents', icon: Bot, desc: 'Global AI agent governance' },
  { key: 'leads', label: 'Leads', icon: Users, desc: 'Pipeline, auto-assignment, SLA' },
  { key: 'sources', label: 'Πηγές Leads', icon: Radar, desc: 'Lead ingestion & webhooks' },
  { key: 'market', label: 'Market RAG', icon: TrendingUp, desc: 'Knowledge base & vectors' },
  { key: 'hub', label: 'Agent Hub', icon: MessageSquare, desc: 'Hub capabilities & tools' },
  { key: 'orchestrator', label: 'Orchestrator', icon: Settings, desc: 'Master AI coordinator' },
  { key: 'business', label: 'Εταιρεία', icon: Globe, desc: 'Business profile (ΑΦΜ, ΓΕΜΗ)' },
  { key: 'reports', label: 'Reports', icon: BarChart3, desc: 'Analytics & export' },
  { key: 'users', label: 'Χρήστες & RBAC', icon: Shield, desc: 'Roles & access control' },
  { key: 'scraper', label: 'B2B Scraper', icon: Database, desc: 'Apify & scraping engines' },
  { key: 'appearance', label: 'Εμφάνιση', icon: Palette, desc: 'Theme, colors, branding' },
  { key: 'tariffs', label: 'Τιμολόγια', icon: Zap, desc: 'Energy suppliers & formulas' },
  { key: 'communications', label: 'Τηλεφωνία & SMS', icon: Phone, desc: 'PBX, SMS, Viber gateways' },
  { key: 'security', label: 'Ασφάλεια & GDPR', icon: Shield, desc: 'Audit logs & compliance' },
];

function FieldRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)', display: 'block', marginBottom: '4px' }}>{label}</label>
      {desc && <p style={{ margin: '0 0 6px', fontSize: '11px', color: 'var(--text-muted)' }}>{desc}</p>}
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <input
      type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
    />
  );
}

function NumberInput({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <input
      type="number" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: '120px', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
    />
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px' }}>
      <div onClick={() => onChange(!checked)} style={{
        width: '40px', height: '22px', borderRadius: '11px', position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
        background: checked ? 'var(--primary, #0066cc)' : 'var(--border)',
      }}>
        <div style={{
          width: '18px', height: '18px', borderRadius: '50%', background: '#fff', position: 'absolute', top: '2px',
          left: checked ? '20px' : '2px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
      {label && <span style={{ color: 'var(--text)' }}>{label}</span>}
    </label>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '36px', height: '36px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer', padding: '2px' }} />
      <TextInput value={value} onChange={onChange} placeholder="#0066cc" />
    </div>
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={{
      padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px',
      background: 'var(--surface)', color: 'var(--text)', outline: 'none', minWidth: '180px',
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export default function SettingsPanel({ toast, setToast }: { toast: any; setToast: (v: any) => void }) {
  const [activeCategory, setActiveCategory] = useState('general');
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from('crm_settings').select('*');
    if (data) {
      const map: Record<string, any> = {};
      data.forEach((s: SettingEntry) => { map[s.setting_key] = s.setting_value; });
      setSettings(map);
    }
    setLoading(false);
    setDirty(false);
  };

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const saveAll = async () => {
    setSaving(true);
    const updates = Object.entries(settings).map(([key, value]) => ({
      setting_key: key,
      setting_value: value,
      category: CATEGORIES.find(c => key.includes(c.key))?.category || 'general',
    }));
    const { error } = await supabase.from('crm_settings').upsert(updates, { onConflict: 'setting_key' });
    setSaving(false);
    if (error) {
      setToast({ msg: 'Σφάλμα αποθήκευσης: ' + error.message, type: 'info' });
    } else {
      setToast({ msg: 'Οι ρυθμίσεις αποθηκεύτηκαν.', type: 'success' });
      setDirty(false);
    }
  };

  const renderCategory = () => {
    switch (activeCategory) {
      case 'general': return <GeneralSettings settings={settings} update={updateSetting} />;
      case 'agents': return <AgentsSettings settings={settings} update={updateSetting} />;
      case 'leads': return <LeadsSettings settings={settings} update={updateSetting} />;
      case 'sources': return <SourcesSettings settings={settings} update={updateSetting} />;
      case 'market': return <MarketSettings settings={settings} update={updateSetting} />;
      case 'hub': return <HubSettings settings={settings} update={updateSetting} />;
      case 'orchestrator': return <OrchestratorSettings settings={settings} update={updateSetting} />;
      case 'business': return <BusinessSettings settings={settings} update={updateSetting} />;
      case 'reports': return <ReportsSettings settings={settings} update={updateSetting} />;
      case 'users': return <UsersSettings settings={settings} update={updateSetting} />;
      case 'scraper': return <ScraperSettings settings={settings} update={updateSetting} />;
      case 'appearance': return <AppearanceSettings settings={settings} update={updateSetting} />;
      case 'tariffs': return <TariffsSettings settings={settings} update={updateSetting} />;
      case 'communications': return <CommunicationsSettings settings={settings} update={updateSetting} />;
      case 'security': return <SecuritySettings settings={settings} update={updateSetting} />;
      default: return null;
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>
      {/* Sidebar */}
      <div style={{ width: '260px', borderRight: '1px solid var(--border)', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>⚙️ Ρυθμίσεις CRM</h2>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>15 κατηγορίες ρυθμίσεων</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {CATEGORIES.map(cat => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: '2px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                  background: activeCategory === cat.key ? 'rgba(0,102,204,0.1)' : 'transparent',
                  color: activeCategory === cat.key ? 'var(--primary, #0066cc)' : 'var(--text)',
                  display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px',
                  fontWeight: activeCategory === cat.key ? 600 : 400,
                  borderLeft: activeCategory === cat.key ? '3px solid var(--primary, #0066cc)' : '3px solid transparent',
                }}
              >
                <Icon size={16} />
                <div>
                  <div>{cat.label}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: 400 }}>{cat.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>
              {CATEGORIES.find(c => c.key === activeCategory)?.label}
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              {CATEGORIES.find(c => c.key === activeCategory)?.desc}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={loadAll} style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--text)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={14} /> Ανανέωση
            </button>
            <button
              onClick={saveAll} disabled={!dirty || saving}
              style={{
                padding: '8px 16px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed',
                background: dirty ? 'var(--primary, #0066cc)' : 'var(--border)', color: dirty ? '#fff' : 'var(--text-muted)',
                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s',
              }}
            >
              <Save size={14} /> {saving ? 'Αποθήκευση...' : 'Αποθήκευση'}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Φόρτωση ρυθμίσεων...</div>
          ) : (
            renderCategory()
          )}
        </div>
      </div>
    </div>
  );
}

function loadAll() {} // placeholder — actual reload is in parent

// ═══════════════════════════════════════════════════════════════
// CATEGORY COMPONENTS
// ═══════════════════════════════════════════════════════════════

function GeneralSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.business_profile || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px', color: 'var(--text)' }}>🏢 Στοιχεία Εταιρείας</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="Επωνυμία"><TextInput value={s.company_name || ''} onChange={(v) => update('business_profile', { ...s, company_name: v })} /></FieldRow>
        <FieldRow label="ΑΦΜ"><TextInput value={s.afm || ''} onChange={(v) => update('business_profile', { ...s, afm: v })} placeholder="000000000" /></FieldRow>
        <FieldRow label="ΓΕΜΗ"><TextInput value={s.gemi || ''} onChange={(v) => update('business_profile', { ...s, gemi: v })} /></FieldRow>
        <FieldRow label="ΔΟΥ"><TextInput value={s.doy || ''} onChange={(v) => update('business_profile', { ...s, doy: v })} /></FieldRow>
        <FieldRow label="Τηλέφωνο"><TextInput value={s.phone || ''} onChange={(v) => update('business_profile', { ...s, phone: v })} /></FieldRow>
        <FieldRow label="Email"><TextInput type="email" value={s.email || ''} onChange={(v) => update('business_profile', { ...s, email: v })} /></FieldRow>
        <FieldRow label="Διεύθυνση"><TextInput value={s.address || ''} onChange={(v) => update('business_profile', { ...s, address: v })} /></FieldRow>
        <FieldRow label="Ωράριο Λειτουργίας"><TextInput value={s.operating_hours || ''} onChange={(v) => update('business_profile', { ...s, operating_hours: v })} /></FieldRow>
        <FieldRow label="ΦΠΑ (%)"><NumberInput value={s.vat_rate || 24} onChange={(v) => update('business_profile', { ...s, vat_rate: v })} min={0} max={100} /></FieldRow>
      </div>
    </div>
  );
}

function AgentsSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.ai_agent_governance || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>🤖 AI Agent Governance</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="Default Model">
          <SelectInput value={s.default_model || 'gemini-3.6-flash'} onChange={(v) => update('ai_agent_governance', { ...s, default_model: v })} options={[
            { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
            { value: 'gemini-3.6-pro', label: 'Gemini 3.6 Pro' },
            { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
          ]} />
        </FieldRow>
        <FieldRow label="Max Tokens / Agent"><NumberInput value={s.max_tokens_per_agent || 4096} onChange={(v) => update('ai_agent_governance', { ...s, max_tokens_per_agent: v })} min={256} max={32768} /></FieldRow>
        <FieldRow label="Temperature"><NumberInput value={s.temperature || 0.7} onChange={(v) => update('ai_agent_governance', { ...s, temperature: v })} min={0} max={2} /></FieldRow>
        <FieldRow label="Monthly Spending Cap (€)"><NumberInput value={s.spending_cap_monthly || 500} onChange={(v) => update('ai_agent_governance', { ...s, spending_cap_monthly: v })} min={0} /></FieldRow>
        <FieldRow label="Μόνο Ελληνικά"><Toggle checked={s.greek_language_only !== false} onChange={(v) => update('ai_agent_governance', { ...s, greek_language_only: v })} /></FieldRow>
      </div>
    </div>
  );
}

function LeadsSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.leads_pipeline_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>📋 Pipeline Configuration</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="SLA (ώρες)"><NumberInput value={s.sla_hours || 48} onChange={(v) => update('leads_pipeline_config', { ...s, sla_hours: v })} min={1} /></FieldRow>
        <FieldRow label="Assignment Strategy">
          <SelectInput value={s.assignment_strategy || 'round_robin'} onChange={(v) => update('leads_pipeline_config', { ...s, assignment_strategy: v })} options={[
            { value: 'round_robin', label: 'Round Robin' },
            { value: 'least_loaded', label: 'Least Loaded' },
            { value: 'region_based', label: 'Region-based' },
          ]} />
        </FieldRow>
        <FieldRow label="Auto-assign"><Toggle checked={s.auto_assign !== false} onChange={(v) => update('leads_pipeline_config', { ...s, auto_assign: v })} /></FieldRow>
        <FieldRow label="Deduplication"><Toggle checked={s.dedup_enabled !== false} onChange={(v) => update('leads_pipeline_config', { ...s, dedup_enabled: v })} /></FieldRow>
      </div>
      <FieldRow label="Pipeline Stages">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(s.stages || ['new','contacted','qualified','converted','lost']).map((stage: string) => (
            <span key={stage} style={{ padding: '4px 12px', borderRadius: '12px', background: 'var(--bg-2)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text)' }}>{stage}</span>
          ))}
        </div>
      </FieldRow>
    </div>
  );
}

function SourcesSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.lead_sources_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>📡 Lead Ingestion</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="Webhook Enabled"><Toggle checked={s.webhook_enabled !== false} onChange={(v) => update('lead_sources_config', { ...s, webhook_enabled: v })} /></FieldRow>
        <FieldRow label="Quality Scoring"><Toggle checked={s.quality_scoring !== false} onChange={(v) => update('lead_sources_config', { ...s, quality_scoring: v })} /></FieldRow>
        <FieldRow label="Auto-tagging"><Toggle checked={s.auto_tag !== false} onChange={(v) => update('lead_sources_config', { ...s, auto_tag: v })} /></FieldRow>
      </div>
    </div>
  );
}

function MarketSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.market_rag_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>📊 Knowledge Base & Vectors</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="Embedding Model">
          <SelectInput value={s.embedding_model || 'text-embedding-3-small'} onChange={(v) => update('market_rag_config', { ...s, embedding_model: v })} options={[
            { value: 'text-embedding-3-small', label: 'OpenAI text-embedding-3-small' },
            { value: 'text-embedding-3-large', label: 'OpenAI text-embedding-3-large' },
          ]} />
        </FieldRow>
        <FieldRow label="Index Schedule">
          <SelectInput value={s.index_schedule || 'daily'} onChange={(v) => update('market_rag_config', { ...s, index_schedule: v })} options={[
            { value: 'hourly', label: 'Κάθε Ώρα' },
            { value: 'daily', label: 'Κάθε Ημέρα' },
            { value: 'weekly', label: 'Εβδομαδιαία' },
          ]} />
        </FieldRow>
      </div>
      <FieldRow label="Data Sources">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(s.sources || ['DAPEEP','PX','provider_websites']).map((src: string) => (
            <span key={src} style={{ padding: '4px 12px', borderRadius: '12px', background: 'rgba(0,102,204,0.1)', color: 'var(--primary, #0066cc)', fontSize: '12px', fontWeight: 500 }}>{src}</span>
          ))}
        </div>
      </FieldRow>
    </div>
  );
}

function HubSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.agent_hub_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>💬 Agent Hub Capabilities</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="MCP Tools Enabled"><Toggle checked={s.mcp_tools_enabled !== false} onChange={(v) => update('agent_hub_config', { ...s, mcp_tools_enabled: v })} /></FieldRow>
        <FieldRow label="Streaming Enabled"><Toggle checked={s.streaming_enabled !== false} onChange={(v) => update('agent_hub_config', { ...s, streaming_enabled: v })} /></FieldRow>
        <FieldRow label="Memory Limit (messages)"><NumberInput value={s.memory_limit_messages || 100} onChange={(v) => update('agent_hub_config', { ...s, memory_limit_messages: v })} min={10} max={1000} /></FieldRow>
        <FieldRow label="Session Timeout (min)"><NumberInput value={s.session_timeout_minutes || 60} onChange={(v) => update('agent_hub_config', { ...s, session_timeout_minutes: v })} min={5} max={480} /></FieldRow>
      </div>
    </div>
  );
}

function OrchestratorSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.orchestrator_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>🎯 Master Orchestrator</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="Autonomy Level">
          <SelectInput value={s.autonomy_level || 'supervised'} onChange={(v) => update('orchestrator_config', { ...s, autonomy_level: v })} options={[
            { value: 'full', label: 'Full Autonomy' },
            { value: 'supervised', label: 'Supervised' },
            { value: 'manual', label: 'Manual Only' },
          ]} />
        </FieldRow>
        <FieldRow label="Max Parallel Agents"><NumberInput value={s.max_parallel_agents || 5} onChange={(v) => update('orchestrator_config', { ...s, max_parallel_agents: v })} min={1} max={20} /></FieldRow>
        <FieldRow label="Human-in-the-Loop"><Toggle checked={s.human_in_loop !== false} onChange={(v) => update('orchestrator_config', { ...s, human_in_loop: v })} /></FieldRow>
        <FieldRow label="Kill Switch (紧急停止)"><Toggle checked={s.kill_switch === true} onChange={(v) => update('orchestrator_config', { ...s, kill_switch: v })} /></FieldRow>
      </div>
    </div>
  );
}

function BusinessSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  return <GeneralSettings settings={settings} update={update} />;
}

function ReportsSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.reports_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>📈 Report Analytics</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="Auto-dispatch"><Toggle checked={s.auto_dispatch !== false} onChange={(v) => update('reports_config', { ...s, auto_dispatch: v })} /></FieldRow>
        <FieldRow label="Dispatch Day">
          <SelectInput value={s.dispatch_day || 'monday'} onChange={(v) => update('reports_config', { ...s, dispatch_day: v })} options={[
            { value: 'monday', label: 'Δευτέρα' },
            { value: 'friday', label: 'Παρασκευή' },
          ]} />
        </FieldRow>
        <FieldRow label="Export Format">
          <SelectInput value={s.export_format || 'pdf'} onChange={(v) => update('reports_config', { ...s, export_format: v })} options={[
            { value: 'pdf', label: 'PDF' },
            { value: 'xlsx', label: 'Excel' },
            { value: 'csv', label: 'CSV' },
          ]} />
        </FieldRow>
      </div>
    </div>
  );
}

function UsersSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.users_rbac_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>👥 Users & Access Control</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="Default Role">
          <SelectInput value={s.default_role || 'sales'} onChange={(v) => update('users_rbac_config', { ...s, default_role: v })} options={[
            { value: 'admin', label: 'Admin' },
            { value: 'management', label: 'Management' },
            { value: 'sales', label: 'Sales' },
            { value: 'hr', label: 'HR' },
            { value: 'it', label: 'IT' },
            { value: 'secretary', label: 'Secretary' },
          ]} />
        </FieldRow>
        <FieldRow label="Session Timeout (min)"><NumberInput value={s.session_timeout_minutes || 30} onChange={(v) => update('users_rbac_config', { ...s, session_timeout_minutes: v })} min={5} max={120} /></FieldRow>
        <FieldRow label="Two-Factor Auth"><Toggle checked={s.two_factor_enabled === true} onChange={(v) => update('users_rbac_config', { ...s, two_factor_enabled: v })} /></FieldRow>
        <FieldRow label="Max Login Attempts"><NumberInput value={s.max_login_attempts || 5} onChange={(v) => update('users_rbac_config', { ...s, max_login_attempts: v })} min={3} max={10} /></FieldRow>
      </div>
    </div>
  );
}

function ScraperSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.b2b_scraper_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>🔍 B2B Scraping Engines</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="Apify API Token" desc="Από apify.com/account#/integrations"><TextInput type="password" value={s.apify_token || ''} onChange={(v) => update('b2b_scraper_config', { ...s, apify_token: v })} placeholder="apify_api_..." /></FieldRow>
        <FieldRow label="Google Maps API Key" desc="Από cloud.google.com/maps"><TextInput type="password" value={s.google_maps_key || ''} onChange={(v) => update('b2b_scraper_config', { ...s, google_maps_key: v })} placeholder="AIzaSy..." /></FieldRow>
        <FieldRow label="Custom Search ID"><TextInput value={s.custom_search_id || ''} onChange={(v) => update('b2b_scraper_config', { ...s, custom_search_id: v })} placeholder="cx=..." /></FieldRow>
        <FieldRow label="Max Results"><NumberInput value={s.max_results || 20} onChange={(v) => update('b2b_scraper_config', { ...s, max_results: v })} min={1} max={100} /></FieldRow>
        <FieldRow label="Rate Limit (per min)"><NumberInput value={s.rate_limit_per_minute || 10} onChange={(v) => update('b2b_scraper_config', { ...s, rate_limit_per_minute: v })} min={1} max={60} /></FieldRow>
        <FieldRow label="Auto-import to Leads"><Toggle checked={s.auto_import === true} onChange={(v) => update('b2b_scraper_config', { ...s, auto_import: v })} /></FieldRow>
      </div>
    </div>
  );
}

function AppearanceSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.appearance_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>🎨 Theme & Branding</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="Primary Color"><ColorInput value={s.primary_color || '#0066cc'} onChange={(v) => update('appearance_config', { ...s, primary_color: v })} /></FieldRow>
        <FieldRow label="Secondary Color"><ColorInput value={s.secondary_color || '#00c878'} onChange={(v) => update('appearance_config', { ...s, secondary_color: v })} /></FieldRow>
        <FieldRow label="Background Color"><ColorInput value={s.bg_color || '#ffffff'} onChange={(v) => update('appearance_config', { ...s, bg_color: v })} /></FieldRow>
        <FieldRow label="Surface Color"><ColorInput value={s.surface_color || '#f8fafc'} onChange={(v) => update('appearance_config', { ...s, surface_color: v })} /></FieldRow>
        <FieldRow label="Theme Mode">
          <SelectInput value={s.theme_mode || 'light'} onChange={(v) => update('appearance_config', { ...s, theme_mode: v })} options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
          ]} />
        </FieldRow>
        <FieldRow label="Layout Density">
          <SelectInput value={s.layout_density || 'comfortable'} onChange={(v) => update('appearance_config', { ...s, layout_density: v })} options={[
            { value: 'compact', label: 'Compact' },
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'spacious', label: 'Spacious' },
          ]} />
        </FieldRow>
        <FieldRow label="Logo URL"><TextInput value={s.logo_url || ''} onChange={(v) => update('appearance_config', { ...s, logo_url: v })} placeholder="https://..." /></FieldRow>
        <FieldRow label="Favicon URL"><TextInput value={s.favicon_url || ''} onChange={(v) => update('appearance_config', { ...s, favicon_url: v })} placeholder="https://..." /></FieldRow>
      </div>
      {/* Live Preview */}
      <div style={{ marginTop: '24px', padding: '20px', background: s.surface_color || '#f8fafc', borderRadius: '12px', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '12px' }}>LIVE PREVIEW</p>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: s.primary_color || '#0066cc' }} />
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: s.secondary_color || '#00c878' }} />
          <button style={{ padding: '8px 16px', borderRadius: '8px', background: s.primary_color || '#0066cc', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600 }}>Primary Button</button>
          <button style={{ padding: '8px 16px', borderRadius: '8px', background: 'transparent', color: s.primary_color || '#0066cc', border: `1px solid ${s.primary_color || '#0066cc'}`, fontSize: '13px', fontWeight: 600 }}>Secondary Button</button>
        </div>
      </div>
    </div>
  );
}

function TariffsSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.energy_tariffs_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>⚡ Energy Suppliers & Formulas</h4>
      <FieldRow label="Energy Providers">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(s.providers || []).map((p: string) => (
            <span key={p} style={{ padding: '4px 12px', borderRadius: '12px', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: '12px', fontWeight: 500 }}>{p}</span>
          ))}
        </div>
      </FieldRow>
      <h4 style={{ margin: '24px 0 12px', fontSize: '13px' }}>📐 Regulated Charges (€/kWh)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <FieldRow label="ΔΕΔΔΗΕ"><NumberInput value={s.regulated_charges?.DEDDIE || 0.00452} onChange={(v) => update('energy_tariffs_config', { ...s, regulated_charges: { ...s.regulated_charges, DEDDIE: v } })} min={0} max={0.1} /></FieldRow>
        <FieldRow label="ΑΔΜΗΕ"><NumberInput value={s.regulated_charges?.ADMIE || 0.003} onChange={(v) => update('energy_tariffs_config', { ...s, regulated_charges: { ...s.regulated_charges, ADMIE: v } })} min={0} max={0.1} /></FieldRow>
        <FieldRow label="ΕΤΜΕΑΡ"><NumberInput value={s.regulated_charges?.ETMEAR || 0.001} onChange={(v) => update('energy_tariffs_config', { ...s, regulated_charges: { ...s.regulated_charges, ETMEAR: v } })} min={0} max={0.1} /></FieldRow>
      </div>
      <h4 style={{ margin: '24px 0 12px', fontSize: '13px' }}>🎨 Price Tier Colors (Πράσινο/Μπλε/Κίτρινο/Πορτοκαλί)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
        <FieldRow label="Πράσινο (€/kWh)"><NumberInput value={s.price_tiers?.green || 0.08} onChange={(v) => update('energy_tariffs_config', { ...s, price_tiers: { ...s.price_tiers, green: v } })} min={0} max={1} /></FieldRow>
        <FieldRow label="Μπλε (€/kWh)"><NumberInput value={s.price_tiers?.blue || 0.10} onChange={(v) => update('energy_tariffs_config', { ...s, price_tiers: { ...s.price_tiers, blue: v } })} min={0} max={1} /></FieldRow>
        <FieldRow label="Κίτρινο (€/kWh)"><NumberInput value={s.price_tiers?.yellow || 0.12} onChange={(v) => update('energy_tariffs_config', { ...s, price_tiers: { ...s.price_tiers, yellow: v } })} min={0} max={1} /></FieldRow>
        <FieldRow label="Πορτοκαλί (€/kWh)"><NumberInput value={s.price_tiers?.orange || 0.15} onChange={(v) => update('energy_tariffs_config', { ...s, price_tiers: { ...s.price_tiers, orange: v } })} min={0} max={1} /></FieldRow>
      </div>
    </div>
  );
}

function CommunicationsSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.communications_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>📱 Telephony & Messaging Gateways</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="SMS Gateway" desc="Twilio / SMS.to / WebSMS">
          <SelectInput value={s.sms_gateway || ''} onChange={(v) => update('communications_config', { ...s, sms_gateway: v })} options={[
            { value: '', label: '— Επιλέξτε —' },
            { value: 'twilio', label: 'Twilio' },
            { value: 'smsto', label: 'SMS.to' },
            { value: 'websms', label: 'WebSMS' },
          ]} />
        </FieldRow>
        <FieldRow label="SMS API Key"><TextInput type="password" value={s.sms_api_key || ''} onChange={(v) => update('communications_config', { ...s, sms_api_key: v })} placeholder="sk_..." /></FieldRow>
        <FieldRow label="Viber Enabled"><Toggle checked={s.viber_enabled === true} onChange={(v) => update('communications_config', { ...s, viber_enabled: v })} /></FieldRow>
        <FieldRow label="Viber API Key"><TextInput type="password" value={s.viber_api_key || ''} onChange={(v) => update('communications_config', { ...s, viber_api_key: v })} /></FieldRow>
        <FieldRow label="PBX Provider">
          <SelectInput value={s.pbx_provider || ''} onChange={(v) => update('communications_config', { ...s, pbx_provider: v })} options={[
            { value: '', label: '— Επιλέξτε —' },
            { value: '3cx', label: '3CX' },
            { value: 'asterisk', label: 'Asterisk' },
            { value: 'twilio_voice', label: 'Twilio Voice' },
          ]} />
        </FieldRow>
        <FieldRow label="SIP Server"><TextInput value={s.pbx_sip_server || ''} onChange={(v) => update('communications_config', { ...s, pbx_sip_server: v })} placeholder="sip.example.com" /></FieldRow>
        <FieldRow label="Email SMTP Host"><TextInput value={s.email_smtp_host || ''} onChange={(v) => update('communications_config', { ...s, email_smtp_host: v })} placeholder="smtp.gmail.com" /></FieldRow>
        <FieldRow label="SMTP Port"><NumberInput value={s.email_smtp_port || 587} onChange={(v) => update('communications_config', { ...s, email_smtp_port: v })} /></FieldRow>
        <FieldRow label="DKIM Enabled"><Toggle checked={s.email_dkim_enabled === true} onChange={(v) => update('communications_config', { ...s, email_dkim_enabled: v })} /></FieldRow>
      </div>
    </div>
  );
}

function SecuritySettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.security_config || {};
  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>🔒 Security, Audit & GDPR</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <FieldRow label="GDPR Auto-anonymize"><Toggle checked={s.gdpr_auto_anonymize !== false} onChange={(v) => update('security_config', { ...s, gdpr_auto_anonymize: v })} /></FieldRow>
        <FieldRow label="Right to be Forgotten"><Toggle checked={s.right_to_be_forgotten !== false} onChange={(v) => update('security_config', { ...s, right_to_be_forgotten: v })} /></FieldRow>
        <FieldRow label="Audit Log Enabled"><Toggle checked={s.audit_log_enabled !== false} onChange={(v) => update('security_config', { ...s, audit_log_enabled: v })} /></FieldRow>
        <FieldRow label="Consent Log Retention (days)"><NumberInput value={s.consent_log_retention_days || 730} onChange={(v) => update('security_config', { ...s, consent_log_retention_days: v })} min={90} max={3650} /></FieldRow>
      </div>
      <FieldRow label="IP Whitelist" desc="Αφήστε κενό για ελεύθερη πρόσβαση">
        <TextInput value={(s.ip_whitelist || []).join(', ')} onChange={(v) => update('security_config', { ...s, ip_whitelist: v.split(',').map((ip: string) => ip.trim()).filter(Boolean) })} placeholder="192.168.1.1, 10.0.0.1" />
      </FieldRow>
    </div>
  );
}
