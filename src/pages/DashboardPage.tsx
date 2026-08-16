import { useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  ChevronDown,
  Database,
  Filter,
  LayoutDashboard,
  LogOut,
  Mail,
  MessageSquare,
  Mic,
  Plus,
  Radar,
  Search,
  Settings,
  TrendingUp,
  Users,
  X,
  Zap,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Globe,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

type Lead = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  region: string;
  customer_type: string;
  provider: string;
  status: string;
  created_at: string;
  lawful_basis?: string | null;
  customer_category?: string | null;
  pipeline_status?: string | null;
};

type Agent = {
  id: string;
  name: string;
  channel: string;
  status: string;
  leads_contacted: number;
  replies: number;
  meetings_booked: number;
  target_region?: string | null;
  base_prompt?: string | null;
  handoff_condition?: string | null;
};

type Source = {
  id: string;
  name: string;
  type: string;
  lawful_basis: string;
  leads_this_month: number;
  status: string;
};

type Tariff = {
  id: string;
  resource: string;
  tariff_name: string;
  price_eur: number;
  unit: string;
  updated_at: string;
};

type Tab = 'overview' | 'agents' | 'leads' | 'sources' | 'market';

const greekRegions = [
  'Αττική', 'Θεσσαλονίκη', 'Κεντρική Μακεδονία', 'Δυτική Μακεδονία',
  'Ανατολική Μακεδονία & Θράκη', 'Ήπειρος', 'Θεσσαλία', 'Ιόνια Νησιά',
  'Δυτική Ελλάδα', 'Στερεά Ελλάδα', 'Πελοπόννησος', 'Νησιά Αιγαίου',
  'Κρήτη', 'Βόρειο Αιγαίο',
];

const handoffOptions = [
  { value: 'Interest Confirmed', label: 'Ενδιαφέρον Επιβεβαιώθηκε' },
  { value: 'Pricing Requested', label: 'Αίτημα Τιμολόγησης' },
  { value: 'Angry Lead', label: 'Ενόχληση/Δυσαρέσκεια' },
];

function canActivateAI(lead: Lead): boolean {
  if (lead.customer_category === 'B2C_Household') {
    return lead.lawful_basis === 'Consent';
  }
  if (lead.customer_category === 'B2B_Corporate') {
    return lead.lawful_basis === 'Legitimate_Interest';
  }
  return false;
}

export default function DashboardPage() {
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [tariffs, setTariffs] = useState<Tariff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', channel: 'email' });
  const [newSource, setNewSource] = useState({ name: '', type: 'opt-in', lawful_basis: 'consent' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [configAgent, setConfigAgent] = useState<Agent | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' } | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const loadData = async () => {
    setLoading(true);
    const [leadsRes, agentsRes, sourcesRes, tariffsRes] = await Promise.all([
      supabase.from('powerfor_leads').select('*').order('created_at', { ascending: false }),
      supabase.from('ai_agents').select('*').order('created_at', { ascending: false }),
      supabase.from('lead_sources').select('*').order('created_at', { ascending: false }),
      supabase.from('market_tariffs').select('*').order('resource', { ascending: true }),
    ]);
    if (leadsRes.data) setLeads(leadsRes.data as Lead[]);
    if (agentsRes.data) setAgents(agentsRes.data as Agent[]);
    if (sourcesRes.data) setSources(sourcesRes.data as Source[]);
    if (tariffsRes.data) setTariffs(tariffsRes.data as Tariff[]);
    setLoading(false);
  };

  const createAgent = async () => {
    if (!newAgent.name) return;
    await supabase.from('ai_agents').insert({ name: newAgent.name, channel: newAgent.channel, status: 'active' });
    setNewAgent({ name: '', channel: 'email' });
    setShowAddAgent(false);
    loadData();
  };

  const toggleAgentStatus = async (agent: Agent) => {
    const newStatus = agent.status === 'active' ? 'paused' : 'active';
    await supabase.from('ai_agents').update({ status: newStatus }).eq('id', agent.id);
    loadData();
  };

  const saveAgentConfig = async (updates: Partial<Agent>) => {
    if (!configAgent) return;
    await supabase.from('ai_agents').update(updates).eq('id', configAgent.id);
    setConfigAgent({ ...configAgent, ...updates });
    loadData();
    setToast({ msg: 'Η διαμόρφωση του agent αποθηκεύτηκε.', type: 'success' });
  };

  const createSource = async () => {
    if (!newSource.name) return;
    await supabase.from('lead_sources').insert({ name: newSource.name, type: newSource.type, lawful_basis: newSource.lawful_basis });
    setNewSource({ name: '', type: 'opt-in', lawful_basis: 'consent' });
    setShowAddSource(false);
    loadData();
  };

  const updateLeadStatus = async (lead: Lead, status: string) => {
    await supabase.from('powerfor_leads').update({ status, pipeline_status: status }).eq('id', lead.id);
    loadData();
  };

  const updateLeadGdpr = async (lead: Lead, field: 'lawful_basis' | 'customer_category', value: string) => {
    await supabase.from('powerfor_leads').update({ [field]: value }).eq('id', lead.id);
    loadData();
  };

  const syncTariffs = async () => {
    setSyncing(true);
    const now = new Date().toISOString();
    await supabase.from('market_tariffs').update({ updated_at: now }).in('resource', ['Electricity', 'Natural Gas', 'Photovoltaic']);
    setSyncing(false);
    setToast({ msg: 'Η βάση γνώσης ενημερώθηκε.', type: 'success' });
    loadData();
  };

  const updateTariffPrice = async (t: Tariff) => {
    const newPrice = prompt(`Εισάγετε νέα τιμή για το ${t.tariff_name}:`, t.price_eur.toString());
    if (newPrice !== null && !isNaN(parseFloat(newPrice))) {
      await supabase.from('market_tariffs').update({ price_eur: parseFloat(newPrice), updated_at: new Date().toISOString() }).eq('id', t.id);
      loadData();
      setToast({ msg: 'Η τιμή ενημερώθηκε.', type: 'success' });
    }
  };

  const filteredLeads = leads.filter((l) => {
    const matchesSearch = !search ||
      l.first_name.toLowerCase().includes(search.toLowerCase()) ||
      l.last_name.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalLeadsContacted = agents.reduce((sum, a) => sum + a.leads_contacted, 0);
  const totalReplies = agents.reduce((sum, a) => sum + a.replies, 0);
  const totalMeetings = agents.reduce((sum, a) => sum + a.meetings_booked, 0);
  const conversionRate = totalLeadsContacted > 0 ? ((totalMeetings / totalLeadsContacted) * 100).toFixed(1) : '0';

  const channelIcon = (channel: string) => {
    if (channel === 'sms') return <MessageSquare size={16} />;
    if (channel === 'voice') return <Mic size={16} />;
    return <Mail size={16} />;
  };

  const generateAgentContext = () => {
    const activeAgent = configAgent || agents[0];
    if (!activeAgent) return '';
    const tariffLines = tariffs.map((t) => `  - ${t.resource}: ${t.tariff_name} @ ${t.price_eur} ${t.unit}`).join('\n');
    return `Είσαι ο ${activeAgent.name}, ένας αυτόνομος ${activeAgent.channel} agent της PowerFor.\n\nΒΑΣΙΚΟ PROMPT:\n${activeAgent.base_prompt || '(Δεν έχει οριστεί base prompt)'}\n\nΣΤΟΧΟΣ: ${activeAgent.target_region || 'Όλη η Ελλάδα'}\n\nΠΑΡΑΔΟΣΗ ΣΕ ΑΝΘΡΩΠΟ: ${activeAgent.handoff_condition || 'Interest Confirmed'}\n\nΖΩΝΤΑΝΑ ΤΑΡΙΦΑ (RAG Knowledge Base):\n${tariffLines}\n\nΟδηγίες: Επικοινώνησε με leads στην περιοχή στόχου, πρότεινε τα παραπάνω τιμολόγια, και παράδωσε σε άνθρωπο όταν: ${activeAgent.handoff_condition || 'Interest Confirmed'}.`;
  };

  const tabLabels: Record<Tab, string> = {
    overview: 'Επισκόπηση',
    agents: 'AI Agents',
    leads: 'Leads',
    sources: 'Πηγές Leads',
    market: 'Market RAG',
  };

  return (
    <div className="dashboard-shell">
      <aside className="dash-sidebar">
        <a href="#/" className="dash-brand">
          <span className="brand-mark"><Zap size={16} fill="currentColor" /></span>
          <span>Power<span>For</span></span>
        </a>
        <nav className="dash-nav">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><LayoutDashboard size={18} /> Επισκόπηση</button>
          <button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}><Bot size={18} /> AI Agents</button>
          <button className={tab === 'leads' ? 'active' : ''} onClick={() => setTab('leads')}><Users size={18} /> Leads</button>
          <button className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}><Database size={18} /> Πηγές Leads</button>
          <button className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}><Globe size={18} /> Market RAG</button>
        </nav>
        <div className="dash-sidebar-footer">
          <div className="dash-user">
            <div className="dash-user-avatar">{user?.email?.[0]?.toUpperCase()}</div>
            <span>{user?.email}</span>
          </div>
          <button className="dash-logout" onClick={signOut}><LogOut size={16} /> Αποσύνδεση</button>
        </div>
      </aside>

      <div className="dash-main">
        <header className="dash-header">
          <h1>{tabLabels[tab]}</h1>
          <div className="dash-header-right">
            <span className="dash-live"><span className="dash-live-dot" /> Live</span>
          </div>
        </header>

        {toast && (
          <div className={`dash-toast ${toast.type}`}>
            {toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {toast.msg}
          </div>
        )}

        {loading ? (
          <div className="dash-loading">Φόρτωση δεδομένων...</div>
        ) : (
          <>
            {tab === 'overview' && (
              <div className="dash-overview">
                <div className="dash-stats-grid">
                  <div className="dash-stat-card"><div className="dash-stat-icon"><Users size={20} /></div><div><strong>{leads.length}</strong><span>Σύνολο Leads</span></div></div>
                  <div className="dash-stat-card"><div className="dash-stat-icon"><Bot size={20} /></div><div><strong>{agents.length}</strong><span>Ενεργά AI Agents</span></div></div>
                  <div className="dash-stat-card"><div className="dash-stat-icon"><Mail size={20} /></div><div><strong>{totalLeadsContacted}</strong><span>Επικοινωνίες</span></div></div>
                  <div className="dash-stat-card"><div className="dash-stat-icon"><TrendingUp size={20} /></div><div><strong>{conversionRate}%</strong><span>Conversion Rate</span></div></div>
                </div>
                <div className="dash-panels">
                  <div className="dash-panel">
                    <h3>Πρόσφατα Leads</h3>
                    <div className="dash-mini-leads">
                      {leads.slice(0, 5).map((l) => (
                        <div className="dash-mini-lead" key={l.id}>
                          <div className="dash-mini-lead-avatar">{l.first_name[0]}{l.last_name[0]}</div>
                          <div><strong>{l.first_name} {l.last_name}</strong><span>{l.email}</span></div>
                          <span className={`dash-status-pill ${l.status}`}>{l.status}</span>
                        </div>
                      ))}
                      {leads.length === 0 && <p className="dash-empty">Δεν υπάρχουν leads ακόμα.</p>}
                    </div>
                  </div>
                  <div className="dash-panel">
                    <h3>Απόδοση AI Agents</h3>
                    <div className="dash-mini-leads">
                      {agents.slice(0, 5).map((a) => (
                        <div className="dash-mini-lead" key={a.id}>
                          <div className="dash-mini-lead-icon">{channelIcon(a.channel)}</div>
                          <div><strong>{a.name}</strong><span>{a.leads_contacted} επικοινωνίες · {a.meetings_booked} ραντεβού</span></div>
                          <span className={`dash-status-pill ${a.status}`}>{a.status}</span>
                        </div>
                      ))}
                      {agents.length === 0 && <p className="dash-empty">Δεν υπάρχουν agents ακόμα.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'agents' && (
              <div className="dash-content">
                <div className="dash-content-header">
                  <p>Διαχειριστείτε τα αυτόνομα AI agents που αναζητούν, προκριματίζουν και επικοινωνούν με leads.</p>
                  <button className="btn btn-primary" onClick={() => setShowAddAgent(!showAddAgent)}><Plus size={16} /> Νέο Agent</button>
                </div>
                {showAddAgent && (
                  <div className="dash-add-form">
                    <input placeholder="Όνομα agent" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} />
                    <select value={newAgent.channel} onChange={(e) => setNewAgent({ ...newAgent, channel: e.target.value })}>
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                      <option value="voice">Φωνή</option>
                    </select>
                    <button className="btn btn-primary" onClick={createAgent}>Δημιουργία</button>
                  </div>
                )}
                <div className="dash-agents-grid">
                  {agents.map((a) => (
                    <div className="dash-agent-card" key={a.id}>
                      <div className="dash-agent-header">
                        <div className="dash-agent-icon">{channelIcon(a.channel)}</div>
                        <div><h3>{a.name}</h3><span className="dash-agent-channel">{a.channel}</span></div>
                        <span className={`dash-status-pill ${a.status}`}>{a.status}</span>
                      </div>
                      <div className="dash-agent-stats">
                        <div><strong>{a.leads_contacted}</strong><span>Επικοινωνίες</span></div>
                        <div><strong>{a.replies}</strong><span>Απαντήσεις</span></div>
                        <div><strong>{a.meetings_booked}</strong><span>Ραντεβού</span></div>
                      </div>
                      {a.target_region && <div className="dash-agent-region"><Globe size={14} /> {a.target_region}</div>}
                      <div className="dash-agent-actions">
                        <button className="dash-agent-toggle" onClick={() => setConfigAgent(a)}>
                          <Settings size={14} /> Διαμόρφωση
                        </button>
                        <button className="dash-agent-toggle" onClick={() => toggleAgentStatus(a)}>
                          {a.status === 'active' ? 'Παύση' : 'Ενεργοποίηση'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {agents.length === 0 && <p className="dash-empty">Δεν υπάρχουν agents. Δημιουργήστε το πρώτο σας agent.</p>}
                </div>
              </div>
            )}

            {tab === 'leads' && (
              <div className="dash-content">
                <div className="dash-content-header">
                  <div className="dash-filters">
                    <div className="dash-search">
                      <Search size={16} />
                      <input placeholder="Αναζήτηση leads..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="all">Όλα τα status</option>
                      <option value="new">new</option>
                      <option value="contacted">contacted</option>
                      <option value="qualified">qualified</option>
                      <option value="closed">closed</option>
                    </select>
                  </div>
                </div>
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Όνομα</th><th>Email</th><th>Τηλέφωνο</th><th>Περιοχή</th><th>Τύπος</th><th>Κατηγορία</th><th>GDPR</th><th>Status</th><th>AI Agent</th><th>Ενέργεια</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeads.map((l) => {
                        const aiOk = canActivateAI(l);
                        return (
                          <tr key={l.id}>
                            <td>{l.first_name} {l.last_name}</td>
                            <td>{l.email}</td>
                            <td>{l.phone}</td>
                            <td>{l.region}</td>
                            <td>{l.customer_type}</td>
                            <td>
                              <select className="dash-status-select" value={l.customer_category || ''} onChange={(e) => updateLeadGdpr(l, 'customer_category', e.target.value)}>
                                <option value="" disabled>—</option>
                                <option value="B2C_Household">B2C</option>
                                <option value="B2B_Corporate">B2B</option>
                              </select>
                            </td>
                            <td>
                              <div className="gdpr-badge-wrap">
                                <select className="dash-status-select" value={l.lawful_basis || ''} onChange={(e) => updateLeadGdpr(l, 'lawful_basis', e.target.value)}>
                                  <option value="" disabled>—</option>
                                  <option value="Consent">Consent</option>
                                  <option value="Legitimate_Interest">Leg. Interest</option>
                                </select>
                                <span className={`gdpr-badge ${aiOk ? 'ok' : 'blocked'}`}>{aiOk ? 'OK' : 'Missing'}</span>
                              </div>
                            </td>
                            <td><span className={`dash-status-pill ${l.status}`}>{l.status}</span></td>
                            <td>
                              <button className={`ai-activate-btn ${aiOk ? 'active' : 'disabled'}`} disabled={!aiOk} title={!aiOk ? 'Missing GDPR Consent' : undefined} onClick={() => aiOk && setToast({ msg: `AI Agent ενεργοποιήθηκε για ${l.first_name} ${l.last_name}.`, type: 'info' })}>
                                <Zap size={14} /> {aiOk ? 'Ενεργό' : 'Αποκλεισμένο'}
                              </button>
                            </td>
                            <td>
                              <select className="dash-status-select" value={l.status} onChange={(e) => updateLeadStatus(l, e.target.value)}>
                                <option value="new">new</option>
                                <option value="contacted">contacted</option>
                                <option value="qualified">qualified</option>
                                <option value="closed">closed</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredLeads.length === 0 && <p className="dash-empty">Δεν βρέθηκαν leads.</p>}
                </div>
              </div>
            )}

            {tab === 'sources' && (
              <div className="dash-content">
                <div className="dash-content-header">
                  <p>Πηγές leads με GDPR-compliant lawful basis. Καμία εξαγωγή από third-party sites.</p>
                  <button className="btn btn-primary" onClick={() => setShowAddSource(!showAddSource)}><Plus size={16} /> Νέα Πηγή</button>
                </div>
                {showAddSource && (
                  <div className="dash-add-form">
                    <input placeholder="Όνομα πηγής" value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} />
                    <select value={newSource.type} onChange={(e) => setNewSource({ ...newSource, type: e.target.value })}>
                      <option value="opt-in">Opt-in</option>
                      <option value="partner">Partner</option>
                      <option value="first-party">First-party</option>
                    </select>
                    <select value={newSource.lawful_basis} onChange={(e) => setNewSource({ ...newSource, lawful_basis: e.target.value })}>
                      <option value="consent">Consent</option>
                      <option value="legitimate-interest">Legitimate Interest</option>
                    </select>
                    <button className="btn btn-primary" onClick={createSource}>Δημιουργία</button>
                  </div>
                )}
                <div className="dash-sources-grid">
                  {sources.map((s) => (
                    <div className="dash-source-card" key={s.id}>
                      <div className="dash-source-header">
                        <div className="dash-source-icon"><Radar size={18} /></div>
                        <div><h3>{s.name}</h3><span>{s.type}</span></div>
                        <span className={`dash-status-pill ${s.status}`}>{s.status}</span>
                      </div>
                      <div className="dash-source-meta">
                        <div><span>Lawful Basis</span><strong>{s.lawful_basis}</strong></div>
                        <div><span>Leads αυτόν τον μήνα</span><strong>{s.leads_this_month}</strong></div>
                      </div>
                    </div>
                  ))}
                  {sources.length === 0 && <p className="dash-empty">Δεν υπάρχουν πηγές. Προσθέστε την πρώτη σας πηγή.</p>}
                </div>
              </div>
            )}

            {tab === 'market' && (
              <div className="dash-content">
                <div className="dash-content-header">
                  <p>Δυναμικά τιμολόγια αγοράς που τροφοδοτούν τη βάση γνώσης των AI agents (RAG pipeline).</p>
                  <button className="btn btn-primary" onClick={syncTariffs} disabled={syncing}>
                    <RefreshCw size={16} className={syncing ? 'spin' : ''} /> {syncing ? 'Συγχρονισμός...' : 'Sync Data'}
                  </button>
                </div>
                <div className="rag-layout">
                  <div className="rag-tariffs-panel">
                    <h3 className="rag-section-title"><TrendingUp size={18} /> Live Tariffs (DAM)</h3>
                    <div className="dash-table-wrap">
                      <table className="dash-table">
                        <thead>
                          <tr><th>Πόρος</th><th>Ταρίφα</th><th>Τιμή</th><th>Μονάδα</th><th>Ενημέρωση</th></tr>
                        </thead>
                        <tbody>
                          {tariffs.map((t) => (
                            <tr key={t.id}>
                              <td><span className={`rag-resource-tag ${t.resource.toLowerCase().replace(/\s/g, '-')}`}>{t.resource}</span></td>
                              <td>{t.tariff_name}</td>
                              <td style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => updateTariffPrice(t)} title="Κλικ για επεξεργασία"><strong>{t.price_eur.toFixed(4)}</strong></td>
                              <td>{t.unit}</td>
                              <td>{new Date(t.updated_at).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {tariffs.length === 0 && <p className="dash-empty">Δεν υπάρχουν τιμολόγια.</p>}
                    </div>
                  </div>
                  <div className="rag-context-panel">
                    <h3 className="rag-section-title"><Bot size={18} /> Agent Context (RAG Output)</h3>
                    <p className="rag-context-desc">Το ακριβές system prompt που δημιουργείται από τον συνδυασμό Live Tariffs + Base Prompt Template.</p>
                    <div className="rag-agent-select">
                      <label>Agent</label>
                      <select value={configAgent?.id || agents[0]?.id || ''} onChange={(e) => { const found = agents.find((a) => a.id === e.target.value); if (found) setConfigAgent(found); }}>
                        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    </div>
                    <pre className="rag-context-window">{generateAgentContext()}</pre>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {configAgent && (
        <AgentConfigDrawer agent={configAgent} onClose={() => setConfigAgent(null)} onSave={saveAgentConfig} />
      )}
    </div>
  );
}

function AgentConfigDrawer({ agent, onClose, onSave }: {
  agent: Agent;
  onClose: () => void;
  onSave: (updates: Partial<Agent>) => void;
}) {
  const [channel, setChannel] = useState(agent.channel);
  const [region, setRegion] = useState(agent.target_region || '');
  const [status, setStatus] = useState(agent.status);
  const [prompt, setPrompt] = useState(agent.base_prompt || '');
  const [handoff, setHandoff] = useState(agent.handoff_condition || 'Interest Confirmed');

  const handleSave = () => {
    onSave({ channel, target_region: region, status, base_prompt: prompt, handoff_condition: handoff });
    onClose();
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2><Settings size={20} /> Διαμόρφωση Agent</h2>
          <button className="drawer-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="drawer-body">
          <div className="drawer-field-group">
            <h3 className="drawer-agent-name">{agent.name}</h3>
          </div>
          <div className="drawer-field">
            <label>Τύπος Καναλιού</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="voice">Φωνή</option>
            </select>
          </div>
          <div className="drawer-field">
            <label>Περιοχή Στόχου</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">Όλη η Ελλάδα</option>
              {greekRegions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="drawer-field">
            <label>Κατάσταση</label>
            <div className="drawer-toggle-row">
              <button className={`drawer-toggle ${status === 'active' ? 'on' : ''}`} onClick={() => setStatus('active')}>Live</button>
              <button className={`drawer-toggle ${status === 'paused' ? 'off' : ''}`} onClick={() => setStatus('paused')}>Paused</button>
            </div>
          </div>
          <div className="drawer-field">
            <label>Base Prompt Template</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Γράψε τις οδηγίες για το LLM στα ελληνικά..." rows={6} />
          </div>
          <div className="drawer-field">
            <label>Παράδοση σε Άνθρωπο Όταν:</label>
            <select value={handoff} onChange={(e) => setHandoff(e.target.value)}>
              {handoffOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="drawer-footer">
          <button className="btn btn-ghost" onClick={onClose}>Άκυρο</button>
          <button className="btn btn-primary" onClick={handleSave}><CheckCircle2 size={16} /> Αποθήκευση</button>
        </div>
      </div>
    </div>
  );
}
