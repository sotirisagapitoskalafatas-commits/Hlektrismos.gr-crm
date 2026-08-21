import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  LayoutDashboard, Bot, Users, Radar, TrendingUp, MessageSquare,
  Settings, BarChart3, Shield, Globe, Palette, Zap, Phone, Database,
  FileText, Save, RefreshCw, Mail, Building2, Search, ChevronRight,
  PhoneCall, UserPlus, Eye, EyeOff,
} from 'lucide-react';

interface SettingEntry {
  id: string;
  setting_key: string;
  setting_value: any;
  category: string;
  description: string;
  updated_at: string;
}

// ─── GROUPED NAVIGATION ──────────────────────────────────────────────────────
type GroupDef = { id: string; icon: React.ReactNode; label: string; desc: string; color: string; pages: PageDef[] };
type PageDef = { id: string; label: string; desc?: string; render: (props: { settings: Record<string, any>; update: (k: string, v: any) => void; toast: any; setToast: (v: any) => void }) => React.ReactNode };

const GROUPS: GroupDef[] = [
  {
    id: 'company', icon: <Building2 size={18} />, label: 'Εταιρεία & Εμφάνιση',
    color: '#0ea5e9', desc: 'Στοιχεία, branding, χρήστες, GDPR',
    pages: [
      { id: 'business', label: '🏢 Εταιρικό Προφίλ', desc: 'Επωνυμία, ΑΦΜ, ΓΕΜΗ, διεύθυνση', render: (p) => <BusinessSettings settings={p.settings} update={p.update} /> },
      { id: 'appearance', label: '🎨 Εμφάνιση & Branding', desc: 'Χρώματα, logo, θέμα', render: (p) => <AppearanceSettings settings={p.settings} update={p.update} /> },
      { id: 'users', label: '👤 Χρήστες & RBAC', desc: 'Ρόλοι, πρόσβαση', render: (p) => <UsersSettings settings={p.settings} update={p.update} /> },
      { id: 'security', label: '🔒 Ασφάλεια & GDPR', desc: 'Audit logs, compliance', render: (p) => <SecuritySettings settings={p.settings} update={p.update} /> },
    ],
  },
  {
    id: 'docs', icon: <FileText size={18} />, label: 'Έγγραφα & Πρότυπα',
    color: '#06b6d4', desc: 'Πρότυπα PDF προσφορών & εγγράφων',
    pages: [
      { id: 'templates', label: '📄 Πρότυπα Εγγράφων', desc: 'B2C & B2B προσφορές, συμβάσεις', render: () => <DocumentTemplatesSettings /> },
    ],
  },
  {
    id: 'ai', icon: <Bot size={18} />, label: 'AI & Αυτοματισμοί',
    color: '#059669', desc: 'Agents, Orchestrator, Hub, Scraper',
    pages: [
      { id: 'agents', label: '🤖 AI Agents', desc: 'Governance, κανόνες, όρια', render: (p) => <AgentsSettings settings={p.settings} update={p.update} /> },
      { id: 'orchestrator', label: '🧠 Orchestrator', desc: 'Master AI coordinator', render: (p) => <OrchestratorSettings settings={p.settings} update={p.update} /> },
      { id: 'hub', label: '📡 Agent Hub', desc: 'Δυνατότητες & εργαλεία', render: (p) => <HubSettings settings={p.settings} update={p.update} /> },
      { id: 'scraper', label: '🔍 B2B Scraper', desc: 'SerpApi — κλειδί & ρυθμίσεις', render: (p) => <ScraperSettings settings={p.settings} update={p.update} /> },
    ],
  },
  {
    id: 'comms', icon: <Mail size={18} />, label: 'Leads & Επικοινωνία',
    color: '#8b5cf6', desc: 'Pipelines, Email, SMS, Campaigns, Voice',
    pages: [
      { id: 'leads', label: '📋 Leads', desc: 'Pipeline, auto-assignment, SLA', render: (p) => <LeadsSettings settings={p.settings} update={p.update} /> },
      { id: 'sources', label: '📡 Πηγές Leads', desc: 'Webhooks, ingestion', render: (p) => <SourcesSettings settings={p.settings} update={p.update} /> },
      { id: 'market', label: '📈 Market RAG', desc: 'Knowledge base, vectors', render: (p) => <MarketSettings settings={p.settings} update={p.update} /> },
      { id: 'email', label: '📧 Email (SMTP/IMAP)', desc: 'Ρύθμιση email delivery', render: (p) => <EmailSettings settings={p.settings} update={p.update} /> },
      { id: 'campaigns', label: '📣 Campaigns', desc: 'Resend, Infobip bulk sending', render: (p) => <CampaignSettings settings={p.settings} update={p.update} /> },
      { id: 'voice', label: '📞 Voice AI', desc: 'Vapi.ai, ElevenLabs Greek voices', render: (p) => <VoiceSettings settings={p.settings} update={p.update} /> },
      { id: 'ai-assistant', label: '🤖 AI Widget', desc: 'CRM chatbot widget', render: () => <AiAssistantSettings /> },
      { id: 'communications', label: '💬 SMS & Viber', desc: 'PBX, Viber gateways', render: (p) => <CommunicationsSettings settings={p.settings} update={p.update} /> },
      { id: 'excel-import', label: '📥 Excel Εισαγωγή', desc: 'Μαζική εισαγωγή leads/πελατών', render: () => <ExcelSyncSettings /> },
    ],
  },
  {
    id: 'data', icon: <Database size={18} />, label: 'Δεδομένα & Αναφορές',
    color: '#f59e0b', desc: 'General, Τιμολόγια, Analytics',
    pages: [
      { id: 'general', label: '📊 Επισκόπηση', desc: 'KPIs, ρυθμίσεις γενικές', render: (p) => <GeneralSettings settings={p.settings} update={p.update} /> },
      { id: 'tariffs', label: '⚡ Τιμολόγια Παρόχων', desc: 'Energy tariffs & formulas', render: (p) => <TariffsSettings settings={p.settings} update={p.update} /> },
      { id: 'reports', label: '📊 Reports & Analytics', desc: 'KPIs, export', render: (p) => <ReportsSettings settings={p.settings} update={p.update} /> },
    ],
  },
];

export default function SettingsPanel({ toast, setToast }: { toast: any; setToast: (v: any) => void }) {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Navigation state
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    const { data } = await supabase.from('crm_settings').select('*');
    const map: Record<string, any> = {};
    (data || []).forEach((e: SettingEntry) => { map[e.setting_key] = e.setting_value; });
    setSettings(map);
    setLoading(false);
  };

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const saveAll = async () => {
    setSaving(true);
    const updates = Object.entries(settings).map(([key, value]) =>
      supabase.from('crm_settings').upsert({ setting_key: key, setting_value: value, category: key.split('_')[0] }, { onConflict: 'setting_key' })
    );
    await Promise.all(updates);
    setSaving(false);
    setDirty(false);
    setToast({ msg: 'Settings saved!', type: 'success' });
  };

  // Search across all pages
  const searchResults = search.length > 1
    ? GROUPS.flatMap(g => g.pages.filter(p =>
        p.label.toLowerCase().includes(search.toLowerCase()) ||
        (p.desc || '').toLowerCase().includes(search.toLowerCase()) ||
        g.label.toLowerCase().includes(search.toLowerCase())
      ).map(p => ({ ...p, group: g })))
    : [];

  const currentGroup = GROUPS.find(g => g.id === activeGroup);
  const currentPage = currentGroup?.pages.find(p => p.id === activePage);

  // Render the active page content
  const renderPage = () => {
    if (!currentPage) return null;
    return currentPage.render({ settings, update: updateSetting, toast, setToast });
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg)' }}>
      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column' }}>
        {/* Search */}
        <div style={{ padding: 14, borderBottom: '1px solid var(--border)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search settings..."
              style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, background: 'var(--bg)', color: 'var(--text)', outline: 'none' }} />
          </div>
        </div>

        {/* Search results or groups */}
        {search.length > 1 ? (
          <div style={{ padding: 8, flex: 1, overflowY: 'auto' }}>
            {searchResults.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: 12, textAlign: 'center' }}>No results</p>
            ) : searchResults.map(r => (
              <button key={r.id} onClick={() => { setActiveGroup(r.group.id); setActivePage(r.id); setSearch(''); }}
                style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left', marginBottom: 2 }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{r.label}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.group.label}</div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ padding: 8, flex: 1, overflowY: 'auto' }}>
            {GROUPS.map(g => (
              <div key={g.id} style={{ marginBottom: 4 }}>
                <button onClick={() => { setActiveGroup(g.id); setActivePage(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: activeGroup === g.id ? `${g.color}15` : 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', textAlign: 'left', borderLeft: activeGroup === g.id ? `3px solid ${g.color}` : '3px solid transparent' }}>
                  <span style={{ color: activeGroup === g.id ? g.color : 'var(--text-muted)' }}>{g.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: activeGroup === g.id ? 700 : 500, color: activeGroup === g.id ? 'var(--text)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</div>
                  </div>
                </button>
                {activeGroup === g.id && (
                  <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                    {g.pages.map(p => (
                      <button key={p.id} onClick={() => setActivePage(p.id)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 12px', background: activePage === p.id ? 'var(--bg)' : 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ fontSize: 12, fontWeight: activePage === p.id ? 600 : 400, color: activePage === p.id ? 'var(--text)' : 'var(--text-muted)' }}>{p.label}</span>
                        {activePage === p.id && <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── CONTENT ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header with breadcrumb + save */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg)' }}>
          <div>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
              <button onClick={() => { setActiveGroup(null); setActivePage(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: 0 }}>Settings</button>
              {activeGroup && <><ChevronRight size={10} /><button onClick={() => setActivePage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: currentPage ? 'var(--text-muted)' : 'var(--text)', fontSize: 12, padding: 0, fontWeight: currentPage ? 400 : 700 }}>{currentGroup?.label}</button></>}
              {currentPage && <><ChevronRight size={10} /><span style={{ color: 'var(--text)', fontWeight: 700 }}>{currentPage.label}</span></>}
            </div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {currentPage?.label || currentGroup?.label || 'Settings'}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={loadSettings} style={{ padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <RefreshCw size={13} /> Reload
            </button>
            <button onClick={saveAll} disabled={!dirty || saving}
              style={{ padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'not-allowed', background: dirty ? 'var(--primary, #6366f1)' : 'var(--border)', color: dirty ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Save size={13} /> {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading settings...</div>
          ) : !activeGroup ? (
            /* HOME — group cards */
            <div>
              <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Settings</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                {GROUPS.map(g => (
                  <button key={g.id} onClick={() => setActiveGroup(g.id)}
                    style={{ padding: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = g.color; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: `${g.color}18`, color: g.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>{g.icon}</div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>{g.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{g.desc}</div>
                    <div style={{ fontSize: 10, color: g.color, fontWeight: 600 }}>{g.pages.length} settings</div>
                  </button>
                ))}
              </div>
            </div>
          ) : !activePage ? (
            /* GROUP HOME — page cards */
            <div>
              <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: currentGroup?.color }}>{currentGroup?.icon}</span> {currentGroup?.label}
              </h2>
              <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: 13 }}>{currentGroup?.desc}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {currentGroup?.pages.map(p => (
                  <button key={p.id} onClick={() => setActivePage(p.id)}
                    style={{ padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = currentGroup?.color; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
                    <div><div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 3 }}>{p.label}</div>{p.desc && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.desc}</div>}</div>
                    <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* PAGE CONTENT */
            <div>{renderPage()}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function loadAll() {}

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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} style={{ position: 'relative', width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer', background: checked ? 'var(--primary, #6366f1)' : 'var(--border)', transition: 'background 0.2s' }}>
      <span style={{ position: 'absolute', top: '2px', left: checked ? '20px' : '2px', width: '18px', height: '18px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
    </button>
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)', outline: 'none', cursor: 'pointer' }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
        style={{ width: 36, height: 36, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', padding: 2, background: 'var(--surface)' }} />
      <TextInput value={value} onChange={onChange} placeholder="#0066cc" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CATEGORY COMPONENTS
// ═══════════════════════════════════════════════════════════════

import { ExcelSyncSettings } from './ExcelSyncSettings';

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
        <FieldRow label="Border Radius">
          <SelectInput value={s.border_radius || '10px'} onChange={(v) => update('appearance_config', { ...s, border_radius: v })} options={[
            { value: '0px', label: 'None (0px)' },
            { value: '6px', label: 'Small (6px)' },
            { value: '10px', label: 'Medium (10px)' },
            { value: '16px', label: 'Large (16px)' },
            { value: '24px', label: 'XL (24px)' },
          ]} />
        </FieldRow>
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
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [filterProvider, setFilterProvider] = useState<string>('all');

  useEffect(() => { loadTariffs(); }, []);

  const loadTariffs = async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_active_tariff_prices');
    if (data) setTariffs(data);
    setLoading(false);
  };

  const startEdit = (t: any) => {
    setEditRow(t.tariff_id);
    setEditValues({
      official_url: t.official_url || '',
      base_price_day: t.base_price_day ?? '',
      base_price_night: t.base_price_night ?? '',
      fixed_fee_monthly: t.fixed_fee_monthly ?? '',
      discounted_price_day: t.discounted_price_day ?? '',
      discount_conditions: t.discount_conditions || '',
    });
  };

  const saveRow = async (t: any) => {
    setSaving(true);
    try {
      // Update energy_tariffs.official_url
      if (editValues.official_url !== (t.official_url || '')) {
        await supabase.from('energy_tariffs').update({ official_url: editValues.official_url || null }).eq('id', t.tariff_id);
      }
      // Update or insert energy_tariff_prices
      const priceUpdate: any = {};
      if (editValues.base_price_day !== '') priceUpdate.base_price_day = Number(editValues.base_price_day);
      if (editValues.base_price_night !== '') priceUpdate.base_price_night = Number(editValues.base_price_night) || null;
      if (editValues.fixed_fee_monthly !== '') priceUpdate.fixed_fee_monthly = Number(editValues.fixed_fee_monthly);
      if (editValues.discounted_price_day !== '') priceUpdate.discounted_price_day = Number(editValues.discounted_price_day) || null;
      if (editValues.discount_conditions !== undefined) priceUpdate.discount_conditions = editValues.discount_conditions || null;
      priceUpdate.unit_rate_kwh = priceUpdate.base_price_day ?? undefined;

      if (Object.keys(priceUpdate).length > 0 && t.validity_from) {
        // Find existing price record for this tariff+validity
        const { data: existing } = await supabase
          .from('energy_tariff_prices')
          .select('id')
          .eq('tariff_id', t.tariff_id)
          .eq('validity_from', t.validity_from)
          .limit(1)
          .maybeSingle();

        if (existing) {
          await supabase.from('energy_tariff_prices').update(priceUpdate).eq('id', existing.id);
        } else {
          await supabase.from('energy_tariff_prices').insert({
            tariff_id: t.tariff_id,
            validity_from: t.validity_from || new Date().toISOString().split('T')[0],
            verification_status: 'needs_review',
            ...priceUpdate,
          });
        }
      }
      setEditRow(null);
      await loadTariffs();
    } catch (e) {
      console.error('Save failed:', e);
    }
    setSaving(false);
  };

  const providers = [...new Set(tariffs.map((t) => t.provider_name))];
  const filtered = filterProvider === 'all' ? tariffs : tariffs.filter((t) => t.provider_name === filterProvider);

  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>⚡ Energy Suppliers & Formulas</h4>
      <FieldRow label="Energy Providers">
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {providers.map((p: string) => (
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

      {/* ─── Individual Tariff Editor ─── */}
      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 style={{ margin: 0, fontSize: '14px' }}>📋 Edit Tariffs (Prices & Links)</h4>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)', color: 'var(--text)' }}
            >
              <option value="all">All Providers</option>
              {providers.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button onClick={loadTariffs} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
              <RefreshCw size={12} /> Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>Loading tariffs...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--text-muted)' }}>Provider</th>
                  <th style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--text-muted)' }}>Program</th>
                  <th style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--text-muted)' }}>Type</th>
                  <th style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--text-muted)' }}>Official URL</th>
                  <th style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--text-muted)' }}>Price Day €/kWh</th>
                  <th style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--text-muted)' }}>Price Night</th>
                  <th style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--text-muted)' }}>Fixed €/mo</th>
                  <th style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--text-muted)' }}>Disc. Price</th>
                  <th style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--text-muted)' }}>Discount Conditions</th>
                  <th style={{ padding: '8px 6px', fontWeight: 600, color: 'var(--text-muted)' }}>Status</th>
                  <th style={{ padding: '8px 6px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const isEditing = editRow === t.tariff_id;
                  return (
                    <tr key={t.tariff_id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 600, whiteSpace: 'nowrap' }}>{t.provider_name}</td>
                      <td style={{ padding: '8px 6px', whiteSpace: 'nowrap' }}>{t.program_name}</td>
                      <td style={{ padding: '8px 6px' }}>
                        <span style={{ padding: '2px 6px', borderRadius: 4, background: t.customer_type === 'B2C' ? '#eff6ff' : '#f0fdf4', color: t.customer_type === 'B2C' ? '#2563eb' : '#16a34a', fontSize: 10, fontWeight: 600 }}>
                          {t.customer_type}
                        </span>
                      </td>
                      <td style={{ padding: '8px 6px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <input value={editValues.official_url} onChange={(e) => setEditValues({ ...editValues, official_url: e.target.value })}
                            style={{ width: '180px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: '#fff' }} />
                        ) : t.official_url ? (
                          <a href={t.official_url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: 11 }}>🔗 Link</a>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        {isEditing ? (
                          <input type="number" step="0.0001" value={editValues.base_price_day} onChange={(e) => setEditValues({ ...editValues, base_price_day: e.target.value })}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: '#fff' }} />
                        ) : t.base_price_day != null ? (
                          <span style={{ fontWeight: 700, color: '#00c878' }}>€{t.base_price_day}</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        {isEditing ? (
                          <input type="number" step="0.0001" value={editValues.base_price_night} onChange={(e) => setEditValues({ ...editValues, base_price_night: e.target.value })}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: '#fff' }} />
                        ) : t.base_price_night != null ? (
                          <span style={{ fontWeight: 600, color: '#7c3aed' }}>€{t.base_price_night}</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        {isEditing ? (
                          <input type="number" step="0.01" value={editValues.fixed_fee_monthly} onChange={(e) => setEditValues({ ...editValues, fixed_fee_monthly: e.target.value })}
                            style={{ width: '60px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: '#fff' }} />
                        ) : t.fixed_fee_monthly != null && t.fixed_fee_monthly > 0 ? (
                          <span>€{t.fixed_fee_monthly}/mo</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        {isEditing ? (
                          <input type="number" step="0.0001" value={editValues.discounted_price_day} onChange={(e) => setEditValues({ ...editValues, discounted_price_day: e.target.value })}
                            style={{ width: '80px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: '#fff' }} />
                        ) : t.discounted_price_day != null ? (
                          <span style={{ color: '#059669', fontWeight: 600 }}>€{t.discounted_price_day}</span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '8px 6px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isEditing ? (
                          <input value={editValues.discount_conditions} onChange={(e) => setEditValues({ ...editValues, discount_conditions: e.target.value })}
                            placeholder="e.g. Direct debit"
                            style={{ width: '120px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 11, background: '#fff' }} />
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.discount_conditions || '—'}</span>
                        )}
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        <span style={{
                          padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                          background: t.verification_status === 'verified' ? '#dcfce7' : t.verification_status === 'needs_review' ? '#fef9c3' : '#f1f5f9',
                          color: t.verification_status === 'verified' ? '#16a34a' : t.verification_status === 'needs_review' ? '#ca8a04' : '#64748b',
                        }}>
                          {t.verification_status === 'verified' ? '✓ Verified' : t.verification_status === 'needs_review' ? '⚠ Review' : t.verification_status || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 6px' }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => saveRow(t)} disabled={saving}
                              style={{ padding: '4px 8px', borderRadius: 4, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                              {saving ? '...' : '💾'}
                            </button>
                            <button onClick={() => setEditRow(null)}
                              style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 11 }}>
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(t)}
                            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', fontSize: 11, color: '#2563eb' }}>
                            ✏️ Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No tariffs found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function AiAssistantSettings() {
  const storageKey = 'crm_ai_widget_config';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } })();
  const [enabled, setEnabled] = useState(saved.enabled !== false);
  const [personaName, setPersonaName] = useState(saved.personaName || 'Αλέξης');
  const [accentColor, setAccentColor] = useState(saved.accentColor || '#0066cc');
  const [greeting, setGreeting] = useState(saved.greeting || 'Γεια σου! Είμαι ο βοηθός CRM της Hlektrismos.gr. Ρώτα με για leads, τιμολόγια, ή οτιδήποτε χρειάζεσαι.');
  const [saved2, setSaved2] = useState(false);

  const save = () => {
    localStorage.setItem(storageKey, JSON.stringify({ enabled, personaName, accentColor, greeting }));
    setSaved2(true);
    setTimeout(() => setSaved2(false), 2000);
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 4px', fontSize: 16 }}>🤖 CRM AI Assistant Widget</h3>
      <p style={{ margin: '0 0 20px', fontSize: 12, color: '#6b7280' }}>Ρυθμίσεις του floating AI chatbot στη γωνιά του dashboard.</p>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: 16, height: 16 }} />
          Ενεργοποίηση Widget
        </label>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280' }}>Εμφανίζει το floating chatbot button στο dashboard.</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>Όνομα Persona</label>
        <input value={personaName} onChange={e => setPersonaName(e.target.value)} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>Χρώμα Widget</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} style={{ width: 48, height: 36, border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }} />
          <span style={{ fontSize: 12, color: '#6b7280' }}>{accentColor}</span>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 4 }}>Μήνυμα Χαιρετισμού</label>
        <textarea value={greeting} onChange={e => setGreeting(e.target.value)} rows={3} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text)', resize: 'vertical' }} />
      </div>

      <button onClick={save} style={{ padding: '10px 20px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
        {saved2 ? '✅ Αποθηκεύτηκε!' : '💾 Αποθήκευση'}
      </button>
    </div>
  );
}

function EmailSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const s = settings.email_config || {};
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardProvider, setWizardProvider] = useState('');

  const testSmtp = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ to: s.smtp_user || s.from_email, subject: "Test Email from Hlektrismos.gr", html: "<p>SMTP test OK ✅</p>", from_name: s.from_name || "Hlektrismos.gr" }),
      });
      const data = await res.json();
      setTestResult(data.success ? { ok: true, msg: "SMTP test email sent!" } : { ok: false, msg: data.error || "Failed" });
    } catch (err: any) { setTestResult({ ok: false, msg: err.message }); }
    setTesting(false);
  };

  const testImap = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setSyncResult(data.success ? { ok: true, msg: data.message || "IMAP sync OK!" } : { ok: false, msg: data.error || "IMAP failed" });
    } catch (err: any) { setSyncResult({ ok: false, msg: err.message }); }
    setSyncing(false);
  };

  const applyWizardPreset = (provider: string) => {
    const presets: Record<string, any> = {
      gmail: { smtp_host: 'smtp.gmail.com', smtp_port: 587, imap_host: 'imap.gmail.com', imap_port: 993 },
      outlook: { smtp_host: 'smtp.office365.com', smtp_port: 587, imap_host: 'outlook.office365.com', imap_port: 993 },
      cpanel: { smtp_host: '', smtp_port: 587, imap_host: '', imap_port: 993 },
    };
    const p = presets[provider] || {};
    update('email_config', { ...s, ...p });
    setWizardProvider(provider);
    setShowWizard(true);
  };

  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>📧 Email Configuration (SMTP + IMAP)</h4>

      {/* Setup Wizard Toggle */}
      <div style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(0,102,204,0.04)', border: '1px solid rgba(0,102,204,0.15)', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>🧙 Quick Setup Wizard</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[['gmail', 'Gmail'], ['outlook', 'Outlook / 365'], ['cpanel', 'cPanel / Custom']].map(([key, label]) => (
            <button key={key} onClick={() => applyWizardPreset(key)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: wizardProvider === key ? 'rgba(0,102,204,0.1)' : '#fff', color: 'var(--text)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>{label}</button>
          ))}
        </div>
        {showWizard && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: '#fff', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, lineHeight: 1.7, color: 'var(--text-muted)' }}>
            {wizardProvider === 'gmail' && (
              <ol style={{ margin: 0, paddingLeft: 16 }}>
                <li>Go to <strong>myaccount.google.com</strong> → Security</li>
                <li>Enable <strong>2-Step Verification</strong> (required)</li>
                <li>Go to <strong>App Passwords</strong> (search in Google Account settings)</li>
                <li>Create a new App Password for "Mail"</li>
                <li>Copy the 16-character password and paste it in <strong>App Password</strong> fields below</li>
                <li>SMTP: <code>smtp.gmail.com:587</code> | IMAP: <code>imap.gmail.com:993</code></li>
              </ol>
            )}
            {wizardProvider === 'outlook' && (
              <ol style={{ margin: 0, paddingLeft: 16 }}>
                <li>Go to <strong>account.microsoft.com</strong> → Security</li>
                <li>Enable <strong>Two-step verification</strong></li>
                <li>Go to <strong>Advanced security options</strong> → App passwords</li>
                <li>Create a new App password</li>
                <li>SMTP: <code>smtp.office365.com:587</code> | IMAP: <code>outlook.office365.com:993</code></li>
              </ol>
            )}
            {wizardProvider === 'cpanel' && (
              <ol style={{ margin: 0, paddingLeft: 16 }}>
                <li>Check your hosting control panel for SMTP/IMAP settings</li>
                <li>Typical SMTP: <code>mail.yourdomain.gr:587</code> (STARTTLS)</li>
                <li>Typical IMAP: <code>mail.yourdomain.gr:993</code> (SSL)</li>
                <li>Use your full email address as username</li>
                <li>Contact your hosting provider if unsure</li>
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Outgoing (SMTP) */}
      <div style={{ marginBottom: 20 }}>
        <h5 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>📤 Outgoing (SMTP)</h5>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <FieldRow label="SMTP Host"><TextInput value={s.smtp_host || ''} onChange={(v) => update('email_config', { ...s, smtp_host: v })} placeholder="smtp.gmail.com" /></FieldRow>
          <FieldRow label="SMTP Port" desc="587 (STARTTLS) or 465 (TLS)"><NumberInput value={s.smtp_port || 587} onChange={(v) => update('email_config', { ...s, smtp_port: v })} min={25} max={65535} /></FieldRow>
          <FieldRow label="Email / Username"><TextInput value={s.smtp_user || ''} onChange={(v) => update('email_config', { ...s, smtp_user: v })} placeholder="your@email.gr" /></FieldRow>
          <FieldRow label="App Password" desc="NOT your real password"><TextInput type="password" value={s.smtp_password || ''} onChange={(v) => update('email_config', { ...s, smtp_password: v })} placeholder="xxxx-xxxx-xxxx-xxxx" /></FieldRow>
          <FieldRow label="From Name"><TextInput value={s.from_name || ''} onChange={(v) => update('email_config', { ...s, from_name: v })} placeholder="Hlektrismos.gr" /></FieldRow>
          <FieldRow label="From Email"><TextInput value={s.from_email || ''} onChange={(v) => update('email_config', { ...s, from_email: v })} placeholder="info@hlektrismos.gr" /></FieldRow>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={testSmtp} disabled={testing || !s.smtp_host} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #0066cc', background: '#0066cc', color: '#fff', fontSize: 13, fontWeight: 600, cursor: testing ? 'wait' : 'pointer', opacity: (!s.smtp_host || testing) ? 0.5 : 1 }}>
            {testing ? '⏳ Testing...' : '🧪 Test SMTP Connection'}
          </button>
          {testResult && <span style={{ fontSize: 12, color: testResult.ok ? '#22c55e' : '#ef4444' }}>{testResult.ok ? '✅' : '❌'} {testResult.msg}</span>}
        </div>
      </div>

      {/* Incoming (IMAP) */}
      <div style={{ marginBottom: 20 }}>
        <h5 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>📥 Incoming (IMAP)</h5>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <FieldRow label="IMAP Host"><TextInput value={s.imap_host || ''} onChange={(v) => update('email_config', { ...s, imap_host: v })} placeholder="imap.gmail.com" /></FieldRow>
          <FieldRow label="IMAP Port" desc="993 (SSL) or 143 (STARTTLS)"><NumberInput value={s.imap_port || 993} onChange={(v) => update('email_config', { ...s, imap_port: v })} min={143} max={993} /></FieldRow>
          <FieldRow label="Email / Username"><TextInput value={s.imap_user || ''} onChange={(v) => update('email_config', { ...s, imap_user: v })} placeholder="your@email.gr" /></FieldRow>
          <FieldRow label="App Password"><TextInput type="password" value={s.imap_password || ''} onChange={(v) => update('email_config', { ...s, imap_password: v })} placeholder="xxxx-xxxx-xxxx-xxxx" /></FieldRow>
        </div>
        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
          <button onClick={testImap} disabled={syncing || !s.imap_host} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #00c878', background: '#00c878', color: '#fff', fontSize: 13, fontWeight: 600, cursor: syncing ? 'wait' : 'pointer', opacity: (!s.imap_host || syncing) ? 0.5 : 1 }}>
            {syncing ? '⏳ Syncing...' : '📥 Test IMAP & Sync Now'}
          </button>
          {syncResult && <span style={{ fontSize: 12, color: syncResult.ok ? '#22c55e' : '#ef4444' }}>{syncResult.ok ? '✅' : '❌'} {syncResult.msg}</span>}
        </div>
      </div>

      <div style={{ padding: '12px 16px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
        ⚠️ Never use your real password. Always create an <strong>App Password</strong> from your email provider's security settings.
      </div>
    </div>
  );
}

function CampaignSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const getVal = (key: string) => {
    const entry = settings[key];
    if (entry && typeof entry === 'object' && entry.setting_value !== undefined) {
      return String(entry.setting_value).replace(/"/g, '');
    }
    if (typeof entry === 'string') return entry.replace(/"/g, '');
    return '';
  };

  const setVal = (key: string, val: string) => {
    update(key, { setting_key: key, setting_value: JSON.stringify(val), category: 'email', description: '' });
  };

  const testResend = async () => {
    setTesting(true);
    setResult(null);
    try {
      const apiKey = getVal('RESEND_API_KEY');
      if (!apiKey) { setResult({ ok: false, msg: 'Enter Resend API key first' }); setTesting(false); return; }
      const res = await fetch('https://api.resend.com/domains', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      setResult(res.ok ? { ok: true, msg: 'Resend API key is valid!' } : { ok: false, msg: `Invalid key (${res.status})` });
    } catch (e: any) { setResult({ ok: false, msg: e.message }); }
    setTesting(false);
  };

  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>📣 Bulk Campaign Settings</h4>
      <div style={{ padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 20, fontSize: 12 }}>
        <strong>⚡ Resend (Email):</strong> 3,000 free emails/month. Get API key at <code>resend.com/api-keys</code>
      </div>
      <FieldRow label="Resend API Key" desc="For bulk email campaigns (replaces SMTP for volume sending)">
        <TextInput type="password" value={getVal('RESEND_API_KEY')} onChange={(v) => setVal('RESEND_API_KEY', v)} placeholder="re_xxxxxxxxxxxx" />
      </FieldRow>
      <button onClick={testResend} style={{ padding: '8px 16px', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 12, marginBottom: 20 }}>
        {testing ? '⏳ Testing...' : '🧪 Test Resend API Key'}
      </button>
      {result && <div style={{ padding: 8, borderRadius: 6, background: result.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${result.ok ? '#bbf7d0' : '#fecaca'}`, fontSize: 12, marginBottom: 16 }}>{result.ok ? '✅' : '❌'} {result.msg}</div>}

      <div style={{ padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, marginBottom: 20, fontSize: 12 }}>
        <strong>📱 Infobip (SMS + Viber + WhatsApp):</strong> Greek local numbers, official Viber Business API. Get key at <code>portal.infobip.com</code>
      </div>
      <FieldRow label="Infobip API Key" desc="For SMS, Viber, and WhatsApp campaigns">
        <TextInput type="password" value={getVal('INFOBIP_API_KEY')} onChange={(v) => setVal('INFOBIP_API_KEY', v)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
      </FieldRow>
      <FieldRow label="Infobip Base URL" desc="Default: https://api.infobip.com">
        <TextInput value={getVal('INFOBIP_BASE_URL')} onChange={(v) => setVal('INFOBIP_BASE_URL', v)} placeholder="https://api.infobip.com" />
      </FieldRow>

      <div style={{ padding: 12, background: '#fefce8', border: '1px solid #fde68a', borderRadius: 8, marginTop: 20, marginBottom: 16, fontSize: 12 }}>
        <strong>⚠️ Twilio (Alternative SMS):</strong> Only if not using Infobip. Get credentials at <code>console.twilio.com</code>
      </div>
      <FieldRow label="Twilio Account SID"><TextInput value={getVal('TWILIO_ACCOUNT_SID')} onChange={(v) => setVal('TWILIO_ACCOUNT_SID', v)} placeholder="ACxxxxxxxxxxxxxxxxxxxx" /></FieldRow>
      <FieldRow label="Twilio Auth Token"><TextInput type="password" value={getVal('TWILIO_AUTH_TOKEN')} onChange={(v) => setVal('TWILIO_AUTH_TOKEN', v)} placeholder="your_auth_token" /></FieldRow>
      <FieldRow label="Twilio Phone Number"><TextInput value={getVal('TWILIO_PHONE_NUMBER')} onChange={(v) => setVal('TWILIO_PHONE_NUMBER', v)} placeholder="+30XXXXXXXXXX" /></FieldRow>
    </div>
  );
}

function VoiceSettings({ settings, update }: { settings: Record<string, any>; update: (k: string, v: any) => void }) {
  const getVal = (key: string) => {
    const entry = settings[key];
    if (entry && typeof entry === 'object' && entry.setting_value !== undefined) {
      return String(entry.setting_value).replace(/"/g, '');
    }
    if (typeof entry === 'string') return entry.replace(/"/g, '');
    return '';
  };

  const setVal = (key: string, val: string) => {
    update(key, { setting_key: key, setting_value: JSON.stringify(val), category: 'voice', description: '' });
  };

  return (
    <div>
      <h4 style={{ margin: '0 0 16px', fontSize: '14px' }}>📞 AI Voice Calling (Greek el-GR)</h4>
      <div style={{ padding: 12, background: '#faf5ff', border: '1px solid #d8b4fe', borderRadius: 8, marginBottom: 20, fontSize: 12 }}>
        <strong>🎙️ Vapi.ai:</strong> Outbound AI voice calls with Greek neural TTS (el-GR-NestorasNeural). ~$0.15/call.
        Get API key at <code>vapi.ai/dashboard</code>
      </div>
      <FieldRow label="Vapi.ai API Key" desc="For AI voice calling with Greek voice">
        <TextInput type="password" value={getVal('VAPI_API_KEY')} onChange={(v) => setVal('VAPI_API_KEY', v)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
      </FieldRow>
      <FieldRow label="Vapi Phone Number ID" desc="The Twilio phone number registered in Vapi">
        <TextInput value={getVal('VAPI_PHONE_NUMBER_ID')} onChange={(v) => setVal('VAPI_PHONE_NUMBER_ID', v)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
      </FieldRow>
      <FieldRow label="ElevenLabs API Key" desc="Optional: For custom Greek voice cloning">
        <TextInput type="password" value={getVal('ELEVENLABS_API_KEY')} onChange={(v) => setVal('ELEVENLABS_API_KEY', v)} placeholder="your_elevenlabs_key" />
      </FieldRow>
      <div style={{ padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginTop: 16, fontSize: 12 }}>
        <strong>🇬🇷 Greek Voice:</strong> Uses Azure Neural TTS <code>el-GR-NestorasNeural</code> (male) or <code>el-GR-AthinaNeural</code> (female).
        System prompt is injected with lead data (name, region, provider) for personalized calls.
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

function DocumentTemplatesSettings() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    const { data } = await supabase.from('document_templates').select('*').order('created_at');
    setTemplates(data || []);
    setLoading(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  const handleSave = async (id: string) => {
    setSaving(true);
    await supabase.from('document_templates').update({ html_content: editContent, updated_at: new Date().toISOString() }).eq('id', id);
    setSaving(false);
    setEditingId(null);
    loadTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Διαγραφή αυτού του προτύπου;')) return;
    await supabase.from('document_templates').delete().eq('id', id);
    loadTemplates();
  };

  const handleDuplicate = async (tpl: any) => {
    await supabase.from('document_templates').insert({
      name: tpl.name + ' (αντίγραφο)',
      template_type: tpl.template_type,
      customer_type: tpl.customer_type,
      html_content: tpl.html_content,
      is_default: false,
    });
    loadTemplates();
  };

  const handleSetDefault = async (id: string, customerType: string) => {
    await supabase.from('document_templates').update({ is_default: false }).eq('template_type', 'offer').eq('customer_type', customerType);
    await supabase.from('document_templates').update({ is_default: true }).eq('id', id);
    loadTemplates();
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Φόρτωση...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h4 style={{ margin: 0, fontSize: 14 }}>📄 Document Templates</h4>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{templates.length} templates</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {templates.map(tpl => (
          <div key={tpl.id} style={{
            border: '1px solid var(--border)', borderRadius: 8, padding: 14, background: 'var(--surface)',
            opacity: editingId && editingId !== tpl.id ? 0.5 : 1,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{tpl.name}</span>
                <span style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px', background: tpl.customer_type === 'B2B' ? '#dbeafe' : '#d1fae5', borderRadius: 4, fontWeight: 600 }}>
                  {tpl.customer_type}
                </span>
                {tpl.is_default && <span style={{ marginLeft: 6, fontSize: 10, color: '#059669', fontWeight: 600 }}>DEFAULT</span>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {!tpl.is_default && tpl.template_type === 'offer' && (
                  <button onClick={() => handleSetDefault(tpl.id, tpl.customer_type)} style={{ padding: '4px 8px', fontSize: 10, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
                    Ορισμός Default
                  </button>
                )}
                <button onClick={() => { setEditingId(tpl.id); setEditContent(tpl.html_content); }} style={{ padding: '4px 8px', fontSize: 10, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
                  ✏️ Επεξεργασία
                </button>
                <button onClick={() => handleDuplicate(tpl)} style={{ padding: '4px 8px', fontSize: 10, border: '1px solid #d1d5db', borderRadius: 4, background: '#fff', cursor: 'pointer' }}>
                  📋 Duplicate
                </button>
                <button onClick={() => handleDelete(tpl.id)} style={{ padding: '4px 8px', fontSize: 10, border: '1px solid #fecaca', borderRadius: 4, background: '#fff', cursor: 'pointer', color: '#dc2626' }}>
                  🗑️
                </button>
              </div>
            </div>
            {editingId === tpl.id ? (
              <div>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  style={{ width: '100%', minHeight: 300, fontFamily: 'monospace', fontSize: 11, padding: 8, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)', color: 'var(--text)' }}
                />
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <button onClick={() => handleSave(tpl.id)} disabled={saving} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 6, background: '#0ea5e9', color: '#fff', cursor: 'pointer' }}>
                    {saving ? 'Αποθήκευση...' : '💾 Αποθήκευση'}
                  </button>
                  <button onClick={() => setEditingId(null)} style={{ padding: '6px 14px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', cursor: 'pointer' }}>
                    Ακύρωση
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', maxHeight: 60, overflow: 'hidden' }}>
                {tpl.html_content.replace(/<[^>]+>/g, '').substring(0, 150)}...
              </div>
            )}
          </div>
        ))}
        {templates.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
            Δεν υπάρχουν templates. Αυτόματα δημιουργήθηκαν B2C & B2B templates.
          </div>
        )}
      </div>
    </div>
  );
}
