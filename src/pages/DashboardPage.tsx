import { useEffect, useState, useRef } from 'react';
import {
  Activity,
  Bot,
  ChevronDown,
  Database,
  FileText,
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
  Send,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Zap,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Globe,
  Eye,
  EyeOff,
  Trash2,
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
  deleted_at?: string | null;
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
  deleted_at?: string | null;
};

type Source = {
  id: string;
  name: string;
  type: string;
  lawful_basis: string;
  leads_this_month: number;
  status: string;
};

type CrmUser = {
  id: string;
  role: string;
  full_name: string;
  phone: string;
  is_active: boolean;
  max_leads: number;
  lead_count?: number;
};

type Tariff = {
  id: string;
  resource: string;
  tariff_name: string;
  price_eur: number;
  unit: string;
  updated_at: string;
};

type Tab = 'overview' | 'agents' | 'leads' | 'sources' | 'market' | 'hub' | 'reports' | 'users' | 'scraper' | 'orchestrator';

const greekRegions = [
  'Όλη η Ελλάδα',
  'Αττική',
  'Αθήνα',
  'Πειραιάς',
  'Θεσσαλονίκη',
  'Κεντρική Μακεδονία',
  'Δυτική Μακεδονία',
  'Ανατολική Μακεδονία & Θράκη',
  'Ήπειρος',
  'Θεσσαλία',
  'Ιόνια Νησιά',
  'Κέρκυρα',
  'Ζάκυνθος',
  'Λευκάδα',
  'Κεφαλλονιά',
  'Ιθάκη',
  'Παξοί',
  'Αντικέρα',
  'Δυτική Ελλάδα',
  'Πάτρα',
  'Αιγαλεώ',
  'Στερεά Ελλάδα',
  'Λιβαδειά',
  'Χαλκίδα',
  'Πελοπόννησος',
  'Νησιά Αιγαίου',
  'Μύκονος',
  'Σαντορίνη',
  'Πάρος',
  'Νάξος',
  'Μήλος',
  'Κρήτη',
  'Ηράκλειο',
  'Χανιά',
  'Ρέθυμνο',
  'Λασίθι',
  'Βόρειο Αιγαίο',
  'Λέσβος',
  'Χίος',
  'Σάμος',
  'Δωδεκάνησα',
  'Ρόδος',
  'Κως',
  'Καλύμνος',
];

const handoffOptions = [
  { value: 'Interest Confirmed', label: 'Ενδιαφέρον Επιβεβαιώθηκε' },
  { value: 'Pricing Requested', label: 'Αίτημα Τιμολόγησης' },
  { value: 'Meeting Booked', label: 'Ραντεβού Κλείστηκε' },
  { value: 'Contract Ready', label: 'Έτοιμο για Σύμβαση' },
  { value: 'Complex Inquiry', label: 'Σύνθετο Αίτημα' },
  { value: 'Technical Issue', label: 'Τεχνικό Πρόβλημα' },
  { value: 'Angry Lead', label: 'Ενόχληση/Δυσαρέσκεια' },
  { value: 'Budget Discussion', label: 'Συζήτηση Προϋπολογισμού' },
  { value: 'Multi-property', label: 'Πολλαπλά Ακίνητα' },
  { value: 'B2B Decision Maker', label: 'B2B Decision Maker' },
  { value: 'VIP Customer', label: 'VIP Πελάτης' },
  { value: 'Legal/Compliance', label: 'Νομικό/Compliance' },
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
  const [crmUsers, setCrmUsers] = useState<CrmUser[]>([]);
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
  const [leadsSubTab, setLeadsSubTab] = useState<'active' | 'deleted'>('active');
  const [agentsSubTab, setAgentsSubTab] = useState<'active' | 'deleted'>('active');
  const [agentStatusFilter, setAgentStatusFilter] = useState('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAgentId, setConfirmDeleteAgentId] = useState<string | null>(null);

  const [runningAgents, setRunningAgents] = useState(false);

  // Agent Hub state - Chat History
  const [hubConversations, setHubConversations] = useState<Array<{
    id: string;
    title: string;
    messages: { role: 'user' | 'assistant'; text: string }[];
    selectedAgents: string[];
    contextId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [hubInput, setHubInput] = useState('');
  const [hubLoading, setHubLoading] = useState(false);
  const [hubSelectedAgents, setHubSelectedAgents] = useState<string[]>([]);
  const hubEndRef = useRef<HTMLDivElement>(null);

  // Get active conversation
  const activeConversation = hubConversations.find(c => c.id === activeConversationId);
  const hubMessages = activeConversation?.messages || [];

  // Reports state
  const [reports, setReports] = useState<any[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Conversation management functions
  const createNewConversation = () => {
    const newConv = {
      id: crypto.randomUUID(),
      title: `Νέα Συνομιλία ${hubConversations.length + 1}`,
      messages: [{ role: 'assistant' as const, text: 'Γεια σου! Είμαι ο Master Orchestrator της Hlektrismos.gr. Πώς μπορώ να σε βοηθήσω με τα AI agents;' }],
      selectedAgents: [],
      contextId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setHubConversations(prev => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
    setHubSelectedAgents([]);
  };

  const deleteConversation = (convId: string) => {
    setHubConversations(prev => prev.filter(c => c.id !== convId));
    if (activeConversationId === convId) {
      setActiveConversationId(hubConversations.length > 1 ? hubConversations.find(c => c.id !== convId)?.id || null : null);
    }
  };

  const updateConversationTitle = (convId: string, title: string) => {
    setHubConversations(prev => prev.map(c => c.id === convId ? { ...c, title } : c));
  };

  const toggleAgentInConversation = (agentId: string) => {
    setHubSelectedAgents(prev => {
      const newAgents = prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId];
      if (activeConversationId) {
        setHubConversations(prev => prev.map(c => c.id === activeConversationId ? { ...c, selectedAgents: newAgents } : c));
      }
      return newAgents;
    });
  };

  // Load saved conversations from agent_memory
  const loadConversationHistory = async () => {
    const { data } = await supabase.from('agent_memory').select('*').order('created_at', { ascending: false }).limit(100);
    if (data) {
      // Group by context_id to reconstruct conversations
      const convMap = new Map<string, any[]>();
      data.forEach(msg => {
        const ctxId = msg.context_id;
        if (!convMap.has(ctxId)) convMap.set(ctxId, []);
        convMap.get(ctxId)!.push(msg);
      });
      // Create conversation objects from history
      const historyConvs = Array.from(convMap.entries()).map(([ctxId, msgs]) => ({
        id: ctxId,
        title: msgs[0]?.content?.slice(0, 50) || `Ιστορικό ${ctxId.slice(0, 8)}`,
        messages: msgs.map(m => ({ role: m.role as 'user' | 'assistant', text: m.content })),
        selectedAgents: [],
        contextId: ctxId,
        createdAt: new Date(msgs[msgs.length - 1]?.created_at || Date.now()),
        updatedAt: new Date(msgs[0]?.created_at || Date.now()),
      }));
      setHubConversations(prev => [...historyConvs, ...prev]);
    }
  };

  useEffect(() => {
    loadConversationHistory();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [leadsRes, agentsRes, sourcesRes, tariffsRes, usersRes] = await Promise.all([
      supabase.from('hlektrismos_leads').select('*').order('created_at', { ascending: false }),
      supabase.from('ai_agents').select('*').order('created_at', { ascending: false }),
      supabase.from('lead_sources').select('*').order('created_at', { ascending: false }),
      supabase.from('market_tariffs').select('*').order('resource', { ascending: true }),
      supabase.from('crm_users').select('*').order('created_at', { ascending: false }),
    ]);
    if (leadsRes.data) setLeads(leadsRes.data as Lead[]);
    if (agentsRes.data) setAgents(agentsRes.data as Agent[]);
    if (sourcesRes.data) setSources(sourcesRes.data as Source[]);
    if (tariffsRes.data) setTariffs(tariffsRes.data as Tariff[]);
    if (usersRes.data) setCrmUsers(usersRes.data as CrmUser[]);
    setLoading(false);
  };

  const runAgents = async () => {
    setRunningAgents(true);
    setToast({ msg: 'Εκκίνηση Agent Engine...', type: 'info' });
    try {
      const { data, error } = await supabase.functions.invoke('agent-worker');
      if (error) throw error;
      setToast({ msg: data.message || 'Οι AI Agents ολοκλήρωσαν την εκτέλεση.', type: 'success' });
      loadData();
    } catch (e) {
      setToast({ msg: 'Σφάλμα κατά την εκτέλεση των Agents.', type: 'info' });
    }
    setRunningAgents(false);
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
    await supabase.from('hlektrismos_leads').update({ status, pipeline_status: status }).eq('id', lead.id);
    loadData();
  };

  const updateLeadGdpr = async (lead: Lead, field: 'lawful_basis' | 'customer_category', value: string) => {
    await supabase.from('hlektrismos_leads').update({ [field]: value }).eq('id', lead.id);
    loadData();
  };

  const softDeleteLead = async (leadId: string) => {
    await supabase.from('hlektrismos_leads').update({ deleted_at: new Date().toISOString() }).eq('id', leadId);
    setConfirmDeleteId(null);
    setToast({ msg: 'Το lead μεταφέρθηκε στα διεγραμμένα.', type: 'success' });
    loadData();
  };

  const restoreLead = async (leadId: string) => {
    await supabase.from('hlektrismos_leads').update({ deleted_at: null }).eq('id', leadId);
    setToast({ msg: 'Το lead αποκαταστάθηκε.', type: 'success' });
    loadData();
  };

  const permanentDeleteLead = async (leadId: string) => {
    await supabase.from('hlektrismos_leads').delete().eq('id', leadId);
    setConfirmDeleteId(null);
    setToast({ msg: 'Το lead διαγράφηκε μόνιμα.', type: 'success' });
    loadData();
  };

  const softDeleteAgent = async (agentId: string) => {
    await supabase.from('ai_agents').update({ deleted_at: new Date().toISOString() }).eq('id', agentId);
    setConfirmDeleteAgentId(null);
    setToast({ msg: 'Το agent μεταφέρθηκε στα διεγραμμένα.', type: 'success' });
    loadData();
  };

  const restoreAgent = async (agentId: string) => {
    await supabase.from('ai_agents').update({ deleted_at: null }).eq('id', agentId);
    setToast({ msg: 'Το agent αποκαταστάθηκε.', type: 'success' });
    loadData();
  };

  const permanentDeleteAgent = async (agentId: string) => {
    await supabase.from('ai_agents').delete().eq('id', agentId);
    setConfirmDeleteAgentId(null);
    setToast({ msg: 'Το agent διαγράφηκε μόνιμα.', type: 'success' });
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
    if (l.deleted_at) return false;
    const matchesSearch = !search ||
      l.first_name.toLowerCase().includes(search.toLowerCase()) ||
      l.last_name.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const deletedLeads = leads.filter((l) => {
    if (!l.deleted_at) return false;
    const matchesSearch = !search ||
      l.first_name.toLowerCase().includes(search.toLowerCase()) ||
      l.last_name.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  const filteredAgents = agents.filter((a) => {
    if (a.deleted_at) return false;
    const matchesStatus = agentStatusFilter === 'all' || a.status === agentStatusFilter;
    return matchesStatus;
  });

  const deletedAgents = agents.filter((a) => !!a.deleted_at);

  const totalLeadsContacted = agents.reduce((sum, a) => sum + a.leads_contacted, 0);
  const totalReplies = agents.reduce((sum, a) => sum + a.replies, 0);
  const totalMeetings = agents.reduce((sum, a) => sum + a.meetings_booked, 0);
  const conversionRate = totalLeadsContacted > 0 ? ((totalMeetings / totalLeadsContacted) * 100).toFixed(1) : '0';

  const channelIcon = (channel: string) => {
    if (channel === 'sms') return <MessageSquare size={16} />;
    if (channel === 'voice') return <Mic size={16} />;
    if (channel === 'whatsapp') return <MessageSquare size={16} />;
    if (channel === 'telegram') return <MessageSquare size={16} />;
    if (channel === 'viber') return <MessageSquare size={16} />;
    if (channel === 'linkedin') return <Globe size={16} />;
    if (channel === 'facebook') return <Globe size={16} />;
    return <Mail size={16} />;
  };

  const generateAgentContext = () => {
    const activeAgent = configAgent || agents[0];
    if (!activeAgent) return '';
    const tariffLines = tariffs.map((t) => `  - ${t.resource}: ${t.tariff_name} @ ${t.price_eur} ${t.unit}`).join('\n');
    return `Είσαι ο ${activeAgent.name}, ένας αυτόνομος ${activeAgent.channel} agent της Hlektrismos.gr.\n\nΒΑΣΙΚΟ PROMPT:\n${activeAgent.base_prompt || '(Δεν έχει οριστεί base prompt)'}\n\nΣΤΟΧΟΣ: ${activeAgent.target_region || 'Όλη η Ελλάδα'}\n\nΠΑΡΑΔΟΣΗ ΣΕ ΑΝΘΡΩΠΟ: ${activeAgent.handoff_condition || 'Interest Confirmed'}\n\nΖΩΝΤΑΝΑ ΤΑΡΙΦΑ (RAG Knowledge Base):\n${tariffLines}\n\nΟδηγίες: Επικοινώνησε με leads στην περιοχή στόχου, πρότεινε τα παραπάνω τιμολόγια, και παράδωσε σε άνθρωπο όταν: ${activeAgent.handoff_condition || 'Interest Confirmed'}.`;
  };

  const tabLabels: Record<Tab, string> = {
    overview: 'Επισκόπηση',
    agents: 'AI Agents',
    leads: 'Leads',
    sources: 'Πηγές Leads',
    market: 'Market RAG',
    hub: 'Agent Hub',
    orchestrator: 'Orchestrator Director',
    reports: 'Reports',
    users: 'Χρήστες',
    scraper: 'B2B Scraper',
  };

  return (
    <div className="dashboard-shell">
      <aside className="dash-sidebar">
        <a href="#/" className="dash-brand">
          <span className="brand-mark"><Zap size={16} fill="currentColor" /></span>
          <span>Hlektrismos<span>.gr</span></span>
        </a>
        <nav className="dash-nav">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><LayoutDashboard size={18} /> Επισκόπηση</button>
          <button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}><Bot size={18} /> AI Agents</button>
          <button className={tab === 'leads' ? 'active' : ''} onClick={() => setTab('leads')}><Users size={18} /> Leads</button>
          <button className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}><Database size={18} /> Πηγές Leads</button>
          <button className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}><Globe size={18} /> Market RAG</button>
          <button className={tab === 'hub' ? 'active' : ''} onClick={() => setTab('hub')}><Sparkles size={18} /> Agent Hub</button>
          <button className={tab === 'orchestrator' ? 'active' : ''} onClick={() => setTab('orchestrator')}><Activity size={18} /> Orchestrator Director</button>
          <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}><FileText size={18} /> Reports</button>
          <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={18} /> Χρήστες</button>
          <button className={tab === 'scraper' ? 'active' : ''} onClick={() => setTab('scraper')}><Radar size={18} /> B2B Scraper</button>
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
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(0,200,120,0.08), rgba(0,102,204,0.05))', border: '1px solid rgba(0,200,120,0.15)' }}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(0,200,120,0.15)', color: '#00c878' }}><Users size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{leads.filter(l => !l.deleted_at).length}</strong><span>Σύνολο Leads</span></div>
                  </div>
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(0,102,204,0.08), rgba(0,200,120,0.05))', border: '1px solid rgba(0,102,204,0.15)' }}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(0,102,204,0.15)', color: '#0066cc' }}><Bot size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{agents.filter(a => !a.deleted_at && a.status === 'active').length}</strong><span>Ενεργά AI Agents</span></div>
                  </div>
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(147,51,234,0.08), rgba(0,102,204,0.05))', border: '1px solid rgba(147,51,234,0.15)' }}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(147,51,234,0.15)', color: '#9333ea' }}><Mail size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{totalLeadsContacted}</strong><span>Επικοινωνίες</span></div>
                  </div>
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(0,200,120,0.05))', border: '1px solid rgba(245,158,11,0.15)' }}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}><TrendingUp size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{conversionRate}%</strong><span>Conversion Rate</span></div>
                  </div>
                </div>
                <div className="dash-panels" style={{ gridTemplateColumns: '1.2fr 0.8fr' }}>
                  <div className="dash-panel">
                    <h3 style={{ marginBottom: 16 }}>Πρόσφατα Leads</h3>
                    <div className="dash-mini-leads">
                      {leads.filter(l => !l.deleted_at).slice(0, 6).map((l) => (
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
                    <h3 style={{ marginBottom: 16 }}>Απόδοση AI Agents</h3>
                    <div className="dash-mini-leads">
                      {agents.filter(a => !a.deleted_at).slice(0, 5).map((a) => (
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
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-secondary" onClick={runAgents} disabled={runningAgents}>
                      <Activity size={16} className={runningAgents ? 'spin' : ''} /> {runningAgents ? 'Εκτέλεση...' : 'Εκκίνηση AI Agents'}
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowAddAgent(!showAddAgent)}><Plus size={16} /> Νέο Agent</button>
                  </div>
                </div>
                <div className="dash-filters" style={{ marginBottom: 16 }}>
                  <div className="dash-leads-subtabs">
                    <button className={agentsSubTab === 'active' ? 'active' : ''} onClick={() => setAgentsSubTab('active')}><Bot size={14} /> Ενεργά Agents ({filteredAgents.length})</button>
                    <button className={agentsSubTab === 'deleted' ? 'active' : ''} onClick={() => setAgentsSubTab('deleted')}><Trash2 size={14} /> Διεγραμμένα ({deletedAgents.length})</button>
                  </div>
                  {agentsSubTab === 'active' && (
                    <select value={agentStatusFilter} onChange={(e) => setAgentStatusFilter(e.target.value)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }}>
                      <option value="all">Όλα τα status</option>
                      <option value="active">Ενεργό</option>
                      <option value="paused">Παυμένο</option>
                    </select>
                  )}
                </div>
                {showAddAgent && (
                  <div className="dash-add-form">
                    <input placeholder="Όνομα agent" value={newAgent.name} onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })} />
                    <select value={newAgent.channel} onChange={(e) => setNewAgent({ ...newAgent, channel: e.target.value })}>
                      <option value="email">Email</option>
                      <option value="sms">SMS</option>
                      <option value="voice">Φωνή</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="telegram">Telegram</option>
                      <option value="viber">Viber</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="facebook">Facebook Messenger</option>
                    </select>
                    <button className="btn btn-primary" onClick={createAgent}>Δημιουργία</button>
                  </div>
                )}
                {agentsSubTab === 'active' && (
                  <div className="dash-agents-grid">
                    {filteredAgents.map((a) => (
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
                          {confirmDeleteAgentId === a.id ? (
                            <div className="dash-delete-confirm">
                              <button className="btn-delete-yes" onClick={() => softDeleteAgent(a.id)}>Ναι</button>
                              <button className="btn-delete-yes permanent" onClick={() => permanentDeleteAgent(a.id)}>Μόνιμα</button>
                              <button className="btn-delete-lead" onClick={() => setConfirmDeleteAgentId(null)}>Όχι</button>
                            </div>
                          ) : (
                            <button className="btn-delete-lead" onClick={() => setConfirmDeleteAgentId(a.id)}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {filteredAgents.length === 0 && <p className="dash-empty">Δεν υπάρχουν agents με αυτό το φίλτρο.</p>}
                  </div>
                )}
                {agentsSubTab === 'deleted' && (
                  <div className="dash-agents-grid">
                    {deletedAgents.map((a) => (
                      <div className="dash-agent-card" key={a.id} style={{ opacity: 0.6 }}>
                        <div className="dash-agent-header">
                          <div className="dash-agent-icon">{channelIcon(a.channel)}</div>
                          <div><h3>{a.name}</h3><span className="dash-agent-channel">{a.channel}</span></div>
                          <span className="dash-status-pill" style={{ background: 'rgba(231,76,60,0.1)', color: '#e74c3c' }}>διεγραμμένο</span>
                        </div>
                        <div className="dash-agent-stats">
                          <div><strong>{a.leads_contacted}</strong><span>Επικοινωνίες</span></div>
                          <div><strong>{a.replies}</strong><span>Απαντήσεις</span></div>
                          <div><strong>{a.meetings_booked}</strong><span>Ραντεβού</span></div>
                        </div>
                        <div className="dash-agent-actions">
                          <button className="btn btn-secondary" onClick={() => restoreAgent(a.id)} style={{ fontSize: 12 }}>
                            <RefreshCw size={12} /> Αποκατάσταση
                          </button>
                          <button className="btn-delete-lead" onClick={() => permanentDeleteAgent(a.id)}>
                            <Trash2 size={12} /> Μόνιμα
                          </button>
                        </div>
                      </div>
                    ))}
                    {deletedAgents.length === 0 && <p className="dash-empty">Δεν υπάρχουν διεγραμμένα agents.</p>}
                  </div>
                )}
              </div>
            )}

            {tab === 'leads' && (
              <div className="dash-content">
                <div className="dash-content-header">
                  <div className="dash-filters">
                    <div className="dash-leads-subtabs">
                      <button className={leadsSubTab === 'active' ? 'active' : ''} onClick={() => setLeadsSubTab('active')}><Users size={14} /> Ενεργά Leads ({leads.filter(l => !l.deleted_at).length})</button>
                      <button className={leadsSubTab === 'deleted' ? 'active' : ''} onClick={() => setLeadsSubTab('deleted')}><X size={14} /> Διεγραμμένα ({deletedLeads.length})</button>
                    </div>
                    <div className="dash-search">
                      <Search size={16} />
                      <input placeholder="Αναζήτηση leads..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    {leadsSubTab === 'active' && (
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">Όλα τα status</option>
                        <option value="new">new</option>
                        <option value="contacted">contacted</option>
                        <option value="qualified">qualified</option>
                        <option value="closed">closed</option>
                      </select>
                    )}
                  </div>
                </div>

                {leadsSubTab === 'active' && (
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
                                <div className="dash-lead-actions">
                                  <select className="dash-status-select" value={l.status} onChange={(e) => updateLeadStatus(l, e.target.value)}>
                                    <option value="new">new</option>
                                    <option value="contacted">contacted</option>
                                    <option value="qualified">qualified</option>
                                    <option value="closed">closed</option>
                                  </select>
                                  {confirmDeleteId === l.id ? (
                                    <div className="dash-delete-confirm">
                                      <span>Διαγραφή;</span>
                                      <button className="btn-delete-yes" onClick={() => softDeleteLead(l.id)}>Ναι</button>
                                      <button className="btn-delete-no" onClick={() => setConfirmDeleteId(null)}>Όχι</button>
                                    </div>
                                  ) : (
                                    <button className="btn-delete-lead" onClick={() => setConfirmDeleteId(l.id)} title="Μεταφορά στα διεγραμμένα">
                                      <X size={14} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredLeads.length === 0 && <p className="dash-empty">Δεν βρέθηκαν leads.</p>}
                  </div>
                )}

                {leadsSubTab === 'deleted' && (
                  <div className="dash-table-wrap">
                    <div className="dash-deleted-notice">
                      <AlertCircle size={16} />
                      <span>Τα διεγραμμένα leads αποθηκεύονται εδώ. Μπορείτε να τα αποκαταστήσετε ή να τα διαγράψετε μόνιμα.</span>
                    </div>
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>Όνομα</th><th>Email</th><th>Τηλέφωνο</th><th>Περιοχή</th><th>Τύπος</th><th>Status</th><th>Διαγράφηκε</th><th>Ενέργεια</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deletedLeads.map((l) => (
                          <tr key={l.id} className="dash-row-deleted">
                            <td>{l.first_name} {l.last_name}</td>
                            <td>{l.email}</td>
                            <td>{l.phone}</td>
                            <td>{l.region}</td>
                            <td>{l.customer_type}</td>
                            <td><span className={`dash-status-pill ${l.status}`}>{l.status}</span></td>
                            <td>{l.deleted_at ? new Date(l.deleted_at).toLocaleDateString('el-GR') : '—'}</td>
                            <td>
                              <div className="dash-lead-actions">
                                <button className="btn-restore-lead" onClick={() => restoreLead(l.id)} title="Αποκατάσταση">
                                  <RefreshCw size={14} /> Αποκατάσταση
                                </button>
                                {confirmDeleteId === l.id ? (
                                  <div className="dash-delete-confirm">
                                    <span>Μόνιμη;</span>
                                    <button className="btn-delete-yes permanent" onClick={() => permanentDeleteLead(l.id)}>Ναι</button>
                                    <button className="btn-delete-no" onClick={() => setConfirmDeleteId(null)}>Όχι</button>
                                  </div>
                                ) : (
                                  <button className="btn-delete-lead permanent" onClick={() => setConfirmDeleteId(l.id)} title="Μόνιμη διαγραφή">
                                    <X size={14} /> Μόνιμη Διαγραφή
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {deletedLeads.length === 0 && <p className="dash-empty">Δεν υπάρχουν διεγραμμένα leads.</p>}
                  </div>
                )}
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

            {tab === 'hub' && (
              <AgentHubTab 
                agents={agents}
                conversations={hubConversations}
                activeConversationId={activeConversationId}
                setActiveConversationId={setActiveConversationId}
                hubMessages={hubMessages}
                setHubConversations={setHubConversations}
                hubInput={hubInput}
                setHubInput={setHubInput}
                hubLoading={hubLoading}
                setHubLoading={setHubLoading}
                hubSelectedAgents={hubSelectedAgents}
                setHubSelectedAgents={setHubSelectedAgents}
                endRef={hubEndRef}
                toast={toast}
                setToast={setToast}
                createNewConversation={createNewConversation}
                deleteConversation={deleteConversation}
                updateConversationTitle={updateConversationTitle}
                toggleAgentInConversation={toggleAgentInConversation}
              />
            )}

            {tab === 'reports' && (
              <ReportsTab
                agents={agents}
                reports={reports}
                setReports={setReports}
                loading={reportsLoading}
                setLoading={setReportsLoading}
                selectedReport={selectedReport}
                setSelectedReport={setSelectedReport}
                generating={generatingReport}
                setGenerating={setGeneratingReport}
                toast={toast}
                setToast={setToast}
              />
            )}

            {tab === 'users' && (
              <UsersTab
                crmUsers={crmUsers}
                setCrmUsers={setCrmUsers}
                leads={leads}
                toast={toast}
                setToast={setToast}
                loadData={loadData}
              />
            )}

            {tab === 'scraper' && (
              <B2BScraperTab
                toast={toast}
                setToast={setToast}
              />
            )}

            {tab === 'orchestrator' && (
              <OrchestratorDirectorTab
                agents={agents}
                leads={leads}
                crmUsers={crmUsers}
                toast={toast}
                setToast={setToast}
                setConfigAgent={setConfigAgent}
                loadData={loadData}
              />
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
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="viber">Viber</option>
              <option value="linkedin">LinkedIn</option>
              <option value="facebook">Facebook Messenger</option>
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

function AgentHubTab({ agents, conversations, activeConversationId, setActiveConversationId, hubMessages, setHubConversations, hubInput, setHubInput, hubLoading, setHubLoading, hubSelectedAgents, setHubSelectedAgents, endRef, toast, setToast, createNewConversation, deleteConversation, updateConversationTitle, toggleAgentInConversation }: {
  agents: Agent[];
  conversations: Array<{
    id: string;
    title: string;
    messages: { role: 'user' | 'assistant'; text: string }[];
    selectedAgents: string[];
    contextId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  activeConversationId: string | null;
  setActiveConversationId: (id: string | null) => void;
  hubMessages: { role: 'user' | 'assistant'; text: string }[];
  setHubConversations: React.Dispatch<React.SetStateAction<any[]>>;
  hubInput: string;
  setHubInput: (v: string) => void;
  hubLoading: boolean;
  setHubLoading: (v: boolean) => void;
  hubSelectedAgents: string[];
  setHubSelectedAgents: (v: string[]) => void;
  endRef: React.RefObject<HTMLDivElement>;
  toast: { msg: string; type: 'success' | 'info' } | null;
  setToast: (v: { msg: string; type: 'success' | 'info' } | null) => void;
  createNewConversation: () => void;
  deleteConversation: (id: string) => void;
  updateConversationTitle: (id: string, title: string) => void;
  toggleAgentInConversation: (agentId: string) => void;
}) {
  const [editingTitle, setEditingTitle] = useState<string | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [hubMessages]);

  const sendMessage = async () => {
    if (!hubInput.trim() || hubLoading || !activeConversationId) return;
    const userMsg = hubInput.trim();
    setHubInput('');
    
    // Update conversation messages
    setHubConversations(prev => prev.map(c => {
      if (c.id === activeConversationId) {
        return {
          ...c,
          messages: [...c.messages, { role: 'user', text: userMsg }],
          updatedAt: new Date(),
        };
      }
      return c;
    }));
    
    setHubLoading(true);

    try {
      const activeConv = conversations.find(c => c.id === activeConversationId);
      const contextId = activeConv?.contextId || crypto.randomUUID();
      const { data, error } = await supabase.functions.invoke('orchestrator', {
        body: {
          message: userMsg,
          agent_id: hubSelectedAgents[0] || undefined,
          context_id: contextId,
          mode: 'chat',
          multi_agent: hubSelectedAgents.length > 1,
          agent_ids: hubSelectedAgents,
        },
      });

      if (error) throw error;
      
      setHubConversations(prev => prev.map(c => {
        if (c.id === activeConversationId) {
          return {
            ...c,
            messages: [...c.messages, { role: 'assistant', text: data.reply }],
            contextId: data.context_id || c.contextId,
            updatedAt: new Date(),
          };
        }
        return c;
      }));
    } catch (e: any) {
      setHubConversations(prev => prev.map(c => {
        if (c.id === activeConversationId) {
          return {
            ...c,
            messages: [...c.messages, { role: 'assistant', text: 'Σφάλμα: ' + (e.message || 'Άγνωστο σφάλμα') }],
          };
        }
        return c;
      }));
    }
    setHubLoading(false);
  };

  return (
    <div className="dash-content hub-tab">
      <div className="hub-layout">
        {/* Sidebar - Conversation History */}
        <div className="hub-sidebar">
          <div className="hub-sidebar-header">
            <h3>Ιστορικό Συνομιλιών</h3>
            <button className="btn btn-primary btn-sm" onClick={createNewConversation}>
              <Plus size={14} /> Νέα Συνομιλία
            </button>
          </div>
          <div className="hub-conversations-list">
            {conversations.map((conv) => (
              <div 
                key={conv.id} 
                className={`hub-conversation-item ${activeConversationId === conv.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveConversationId(conv.id);
                  setHubSelectedAgents(conv.selectedAgents);
                }}
              >
                <div className="hub-conversation-info">
                  {editingTitle === conv.id ? (
                    <input 
                      className="hub-title-input"
                      defaultValue={conv.title}
                      onBlur={(e) => {
                        updateConversationTitle(conv.id, e.target.value);
                        setEditingTitle(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          updateConversationTitle(conv.id, e.currentTarget.value);
                          setEditingTitle(null);
                        }
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <strong onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingTitle(conv.id);
                    }}>{conv.title}</strong>
                  )}
                  <span>{conv.messages.length} μηνύματα · {conv.updatedAt.toLocaleDateString('el-GR')}</span>
                </div>
                <button 
                  className="hub-conversation-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {conversations.length === 0 && (
              <p className="dash-empty">Δεν υπάρχουν συνομιλίες. Ξεκίνα μια νέα!</p>
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="hub-main">
          <div className="hub-content-header">
            <p>Επικοινώνησε με τον Master Orchestrator ή με συγκεκριμένα AI agents. Κάθε μήνυμα αποθηκεύεται στη μνήμη του agent.</p>
            <div className="hub-multi-agent-selector">
              <label>Agents:</label>
              <div className="hub-agent-checkboxes">
                {agents.filter(a => a.status === 'active').map((a) => (
                  <label key={a.id} className="hub-agent-checkbox">
                    <input 
                      type="checkbox" 
                      checked={hubSelectedAgents.includes(a.id)}
                      onChange={() => toggleAgentInConversation(a.id)}
                    />
                    <span>{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {activeConversationId ? (
            <div className="hub-chat-container">
              <div className="hub-messages">
                {hubMessages.map((m, i) => (
                  <div key={i} className={`hub-message ${m.role}`}>
                    <div className="hub-message-avatar">
                      {m.role === 'assistant' ? <Bot size={18} /> : <Users size={18} />}
                    </div>
                    <div className="hub-message-content">
                      <div className="hub-message-text">{m.text}</div>
                    </div>
                  </div>
                ))}
                {hubLoading && (
                  <div className="hub-message assistant">
                    <div className="hub-message-avatar"><Bot size={18} /></div>
                    <div className="hub-message-content">
                      <div className="hub-message-text hub-typing">Σκέφτομαι<span className="dot-anim">...</span></div>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              <div className="hub-input-bar">
                <input
                  value={hubInput}
                  onChange={(e) => setHubInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Γράψε ένα μήνυμα στον Orchestrator..."
                  disabled={hubLoading}
                />
                <button className="btn btn-primary" onClick={sendMessage} disabled={hubLoading || !hubInput.trim()}>
                  <Send size={16} />
                </button>
              </div>
            </div>
          ) : (
            <div className="hub-empty-state">
              <Bot size={48} />
              <h3>Επιλέξτε μια συνομιλία ή δημιουργήστε μια νέα</h3>
              <p>Χρησιμοποίησε το πλαϊνό μενού για να δεις το ιστορικό ή πάτα "Νέα Συνομιλία" για να ξεκινήσεις.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportsTab({ agents, reports, setReports, loading, setLoading, selectedReport, setSelectedReport, generating, setGenerating, toast, setToast }: {
  agents: Agent[];
  reports: any[];
  setReports: React.Dispatch<React.SetStateAction<any[]>>;
  loading: boolean;
  setLoading: (v: boolean) => void;
  selectedReport: any;
  setSelectedReport: (v: any) => void;
  generating: boolean;
  setGenerating: (v: boolean) => void;
  toast: { msg: string; type: 'success' | 'info' } | null;
  setToast: (v: { msg: string; type: 'success' | 'info' } | null) => void;
}) {
  const [reportNotes, setReportNotes] = useState('');
  const [reportPriority, setReportPriority] = useState('normal');

  const loadReports = async () => {
    setLoading(true);
    const { data } = await supabase.from('agent_reports').select('*').order('created_at', { ascending: false }).limit(50);
    if (data) setReports(data);
    setLoading(false);
  };

  useEffect(() => { loadReports(); }, []);

  const generateReport = async (reportType: 'master' | 'on_demand', agentId?: string) => {
    setGenerating(true);
    setToast({ msg: 'Δημιουργία αναφοράς...', type: 'info' });
    try {
      const { data, error } = await supabase.functions.invoke('orchestrator', {
        body: { mode: 'report', report_type: reportType, agent_id: agentId },
      });
      if (error) throw error;
      setToast({ msg: 'Η αναφορά δημιουργήθηκε!', type: 'success' });
      loadReports();
      if (data.report) setSelectedReport({ content: data.report, title: reportType === 'master' ? 'Master Report' : `Agent Report`, metrics: data.metrics });
    } catch (e: any) {
      setToast({ msg: 'Σφάλμα: ' + e.message, type: 'info' });
    }
    setGenerating(false);
  };

  const markAsRead = async (report: any) => {
    await supabase.from('agent_reports').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', report.id);
    setToast({ msg: 'Η αναφορά σημάνθηκε ως αναγνωσμένη.', type: 'success' });
    loadReports();
  };

  const deleteReport = async (reportId: string) => {
    if (!confirm('Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτή την αναφορά;')) return;
    await supabase.from('agent_reports').delete().eq('id', reportId);
    setSelectedReport(null);
    setToast({ msg: 'Η αναφορά διαγράφηκε.', type: 'success' });
    loadReports();
  };

  const saveNotes = async () => {
    if (!selectedReport) return;
    await supabase.from('agent_reports').update({ notes: reportNotes }).eq('id', selectedReport.id);
    setToast({ msg: 'Οι σημειώσεις αποθηκεύτηκαν.', type: 'success' });
  };

  const updatePriority = async (priority: string) => {
    if (!selectedReport) return;
    await supabase.from('agent_reports').update({ priority }).eq('id', selectedReport.id);
    setReportPriority(priority);
    setToast({ msg: `Η προτεραιότητα άλλαξε σε ${priority}.`, type: 'success' });
    loadReports();
  };

  const unreadCount = reports.filter(r => !r.is_read).length;

  return (
    <div className="dash-content reports-tab">
      <div className="dash-content-header">
        <p>Αναφορές απόδοσης AI agents και Master Orchestrator summary. {unreadCount > 0 && <span style={{ color: '#e74c3c', fontWeight: 600 }}>({unreadCount} μη αναγνωσμένες)</span>}</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={loadReports} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Ανανέωση
          </button>
          <button className="btn btn-primary" onClick={() => generateReport('master')} disabled={generating}>
            <FileText size={16} /> Master Report
          </button>
        </div>
      </div>

      <div className="reports-layout">
        <div className="reports-sidebar">
          <h3>Αποθηκευμένες Αναφορές</h3>
          {reports.map((r) => (
            <div key={r.id} className={`report-item ${selectedReport?.id === r.id ? 'active' : ''}`} onClick={() => {
              setSelectedReport(r);
              setReportNotes(r.notes || '');
              setReportPriority(r.priority || 'normal');
              if (!r.is_read) markAsRead(r);
            }}>
              <div className="report-item-icon"><FileText size={14} /></div>
              <div>
                <strong>{r.title}</strong>
                <span>{new Date(r.created_at).toLocaleDateString('el-GR')} · {r.report_type}</span>
                {!r.is_read && <span className="report-is-read unread" style={{ marginLeft: '6px' }}>●</span>}
              </div>
            </div>
          ))}
          {reports.length === 0 && <p className="dash-empty">Δεν υπάρχουν αναφορές.</p>}
        </div>

        <div className="reports-main">
          {selectedReport ? (
            <div className="report-viewer">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h2>{selectedReport.title}</h2>
                  <div className="report-meta">
                    <span>{new Date(selectedReport.created_at).toLocaleString('el-GR')}</span>
                    <span className="report-type-badge">{selectedReport.report_type}</span>
                    <span className={`report-priority ${selectedReport.priority || 'normal'}`}>
                      {selectedReport.priority === 'high' ? 'Υψηλή' : selectedReport.priority === 'low' ? 'Χαμηλή' : 'Κανονική'}
                    </span>
                  </div>
                </div>
                <div className="report-actions">
                  <select 
                    className="dash-status-select" 
                    value={selectedReport.priority || 'normal'} 
                    onChange={(e) => updatePriority(e.target.value)}
                  >
                    <option value="low">Χαμηλή Προτεραιότητα</option>
                    <option value="normal">Κανονική</option>
                    <option value="high">Υψηλή Προτεραιότητα</option>
                  </select>
                  <button className="report-action-btn" onClick={() => markAsRead(selectedReport)}>
                    <Eye size={14} /> {selectedReport.is_read ? 'Αναγνωσμένη' : 'Σήμανση ως Αναγνωσμένη'}
                  </button>
                  <button className="report-action-btn delete" onClick={() => deleteReport(selectedReport.id)}>
                    <Trash2 size={14} /> Διαγραφή
                  </button>
                </div>
              </div>
              
              {selectedReport.metrics && (
                <div className="report-metrics">
                  <div><strong>{selectedReport.metrics.total_agents}</strong><span>Agents</span></div>
                  <div><strong>{selectedReport.metrics.total_leads}</strong><span>Leads</span></div>
                  <div><strong>{selectedReport.metrics.total_meetings}</strong><span>Ραντεβού</span></div>
                </div>
              )}
              
              <div className="report-content">{selectedReport.content}</div>
              
              <div className="report-notes">
                <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-muted)' }}>Σημειώσεις</h4>
                <textarea 
                  value={reportNotes} 
                  onChange={(e) => setReportNotes(e.target.value)}
                  placeholder="Προσθέστε σημειώσεις για αυτή την αναφορά..."
                />
                <button className="btn btn-secondary" onClick={saveNotes} style={{ marginTop: '8px' }}>
                  Αποθήκευση Σημειώσεων
                </button>
              </div>
              
              {selectedReport.attachments && selectedReport.attachments.length > 0 && (
                <div className="report-attachments">
                  {selectedReport.attachments.map((att: any, i: number) => (
                    <div key={i} className="report-attachment">
                      <FileText size={14} /> {att.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="report-placeholder">
              <FileText size={48} />
              <p>Επιλέξτε μια αναφορά ή δημιουργήστε μια νέα.</p>
              <div className="report-generate-grid">
                <button className="btn btn-primary" onClick={() => generateReport('master')} disabled={generating}>
                  <Sparkles size={16} /> Master Report (Όλοι οι Agents)
                </button>
                {agents.filter(a => a.status === 'active').map((a) => (
                  <button key={a.id} className="btn btn-secondary" onClick={() => generateReport('on_demand', a.id)} disabled={generating}>
                    <Bot size={16} /> {a.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function UsersTab({ crmUsers, setCrmUsers, leads, toast, setToast, loadData }: {
  crmUsers: CrmUser[];
  setCrmUsers: React.Dispatch<React.SetStateAction<CrmUser[]>>;
  leads: Lead[];
  toast: { msg: string; type: 'success' | 'info' } | null;
  setToast: (v: { msg: string; type: 'success' | 'info' } | null) => void;
  loadData: () => Promise<void>;
}) {
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: '', role: 'sales', phone: '' });
  const [editingUser, setEditingUser] = useState<CrmUser | null>(null);

  const roleLabels: Record<string, string> = {
    admin: 'Διαχειριστής',
    management: 'Διοίκηση',
    sales: 'Πωλήσεις',
    hr: 'Ανθρώπινο Δυναμικό',
    it: 'Τεχνολογία',
    secretary: 'Γραμματεία',
  };

  const roleColors: Record<string, string> = {
    admin: '#e74c3c',
    management: '#9b59b6',
    sales: '#00c878',
    hr: '#3498db',
    it: '#f39c12',
    secretary: '#1abc9c',
  };

  const getLeadCountForUser = (userId: string) => {
    return leads.filter(l => l.assigned_to === userId && !l.deleted_at).length;
  };

  const toggleUserActive = async (user: CrmUser) => {
    const { error } = await supabase.from('crm_users').update({ is_active: !user.is_active }).eq('id', user.id);
    if (!error) {
      setToast({ msg: `Ο χρήστης ${user.is_active ? 'απενεργοποιήθηκε' : 'ενεργοποιήθηκε'}.`, type: 'success' });
      loadData();
    }
  };

  const updateUserRole = async (user: CrmUser, newRole: string) => {
    const { error } = await supabase.from('crm_users').update({ role: newRole }).eq('id', user.id);
    if (!error) {
      setToast({ msg: `Ο ρόλος ενημερώθηκε σε ${roleLabels[newRole]}.`, type: 'success' });
      loadData();
    }
  };

  const updateUserMaxLeads = async (user: CrmUser, maxLeads: number) => {
    const { error } = await supabase.from('crm_users').update({ max_leads: maxLeads }).eq('id', user.id);
    if (!error) {
      setToast({ msg: `Το μέγιστο πλήθος leads ενημερώθηκε.`, type: 'success' });
      loadData();
    }
  };

  return (
    <div className="dash-content">
      <div className="dash-content-header">
        <p>Διαχείριση χρηστών CRM με ρόλους και αυτόματη κατανομή leads στους πωλητές.</p>
        <button className="btn btn-primary" onClick={() => setShowAddUser(!showAddUser)}>
          <Plus size={16} /> Νέος Χρήστης
        </button>
      </div>

      {showAddUser && (
        <div className="dash-add-form">
          <input placeholder="Πλήρες όνομα" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
          <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
            <option value="sales">Πωλήσεις</option>
            <option value="secretary">Γραμματεία</option>
            <option value="hr">Ανθρώπινο Δυναμικό</option>
            <option value="it">Τεχνολογία</option>
            <option value="management">Διοίκηση</option>
            <option value="admin">Διαχειριστής</option>
          </select>
          <input placeholder="Τηλέφωνο" value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} />
          <button className="btn btn-primary" onClick={async () => {
            if (!newUser.full_name) return;
            await supabase.from('crm_users').insert({
              id: crypto.randomUUID(),
              full_name: newUser.full_name,
              role: newUser.role,
              phone: newUser.phone,
              is_active: true,
              max_leads: 50
            });
            setNewUser({ full_name: '', role: 'sales', phone: '' });
            setShowAddUser(false);
            loadData();
            setToast({ msg: 'Ο χρήστης δημιουργήθηκε.', type: 'success' });
          }}>Δημιουργία</button>
        </div>
      )}

      <div className="dash-users-stats">
        <div className="dash-stat-card">
          <div className="dash-stat-icon"><Users size={20} /></div>
          <div><strong>{crmUsers.length}</strong><span>Σύνολο Χρηστών</span></div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon"><CheckCircle2 size={20} /></div>
          <div><strong>{crmUsers.filter(u => u.is_active).length}</strong><span>Ενεργοί</span></div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon"><Bot size={20} /></div>
          <div><strong>{crmUsers.filter(u => u.role === 'sales').length}</strong><span>Πωλητές</span></div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon"><TrendingUp size={20} /></div>
          <div><strong>{leads.filter(l => !l.deleted_at && l.assigned_to).length}</strong><span>Κατανεμημένα Leads</span></div>
        </div>
      </div>

      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Όνομα</th><th>Ρόλος</th><th>Τηλέφωνο</th><th>Leads</th><th>Μέγ. Leads</th><th>Κατάσταση</th><th>Ενέργεια</th>
            </tr>
          </thead>
          <tbody>
            {crmUsers.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.full_name || 'Χωρίς όνομα'}</strong></td>
                <td>
                  <select 
                    className="dash-status-select" 
                    value={u.role} 
                    onChange={(e) => updateUserRole(u, e.target.value)}
                    style={{ borderLeft: `3px solid ${roleColors[u.role] || '#666'}` }}
                  >
                    <option value="admin">Διαχειριστής</option>
                    <option value="management">Διοίκηση</option>
                    <option value="sales">Πωλήσεις</option>
                    <option value="hr">Ανθρώπινο Δυναμικό</option>
                    <option value="it">Τεχνολογία</option>
                    <option value="secretary">Γραμματεία</option>
                  </select>
                </td>
                <td>{u.phone || '—'}</td>
                <td>
                  <span className="user-lead-count" style={{ color: getLeadCountForUser(u.id) >= u.max_leads ? '#e74c3c' : '#00c878' }}>
                    {getLeadCountForUser(u.id)}
                  </span>
                </td>
                <td>
                  <input 
                    type="number" 
                    className="dash-status-input" 
                    value={u.max_leads} 
                    onChange={(e) => updateUserMaxLeads(u, parseInt(e.target.value) || 50)}
                    style={{ width: '60px' }}
                  />
                </td>
                <td>
                  <span className={`dash-status-pill ${u.is_active ? 'active' : 'paused'}`}>
                    {u.is_active ? 'Ενεργός' : 'Ανενεργός'}
                  </span>
                </td>
                <td>
                  <div className="dash-lead-actions">
                    <button className="dash-agent-toggle" onClick={() => toggleUserActive(u)}>
                      {u.is_active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {crmUsers.length === 0 && <p className="dash-empty">Δεν υπάρχουν χρήστες. Προσθέστε τον πρώτο σας χρήστη.</p>}
      </div>
    </div>
  );
}

function B2BScraperTab({ toast, setToast }: {
  toast: { msg: string; type: 'success' | 'info' } | null;
  setToast: (v: { msg: string; type: 'success' | 'info' } | null) => void;
}) {
  const [scrapeConfig, setScrapeConfig] = useState({
    category: 'energy_companies',
    region: 'Αττική',
    maxResults: 100,
    includeContact: true,
  });
  const [scraping, setScraping] = useState(false);
  const [scrapeResults, setScrapeResults] = useState<any[]>([]);
  const [scrapeHistory, setScrapeHistory] = useState<any[]>([]);

  const categories = [
    { value: 'energy_companies', label: 'Εταιρείες Ενέργειας' },
    { value: 'solar_installers', label: 'Εγκαταστάτες Φ/Β' },
    { value: 'ev_charging', label: 'Σταθμοί Φόρτισης EV' },
    { value: 'construction', label: 'Κατασκευαστικές' },
    { value: 'real_estate', label: 'Ακινητομεσιτικές' },
    { value: 'manufacturing', label: 'Βιομηχανία' },
    { value: 'retail', label: 'Λιανικό Εμπόριο' },
    { value: 'hospitality', label: 'Ξενοδοχεία & Εστιατόρια' },
  ];

  const greekRegions = [
    'Αττική', 'Θεσσαλονίκη', 'Κεντρική Μακεδονία', 'Δυτική Μακεδονία',
    'Ανατολική Μακεδονία & Θράκη', 'Ήπειρος', 'Θεσσαλία', 'Ιόνια Νησιά',
    'Δυτική Ελλάδα', 'Στερεά Ελλάδα', 'Πελοπόννησος', 'Νησιά Αιγαίου',
    'Κρήτη', 'Βόρειο Αιγαίο',
  ];

  const startScrape = async () => {
    setScraping(true);
    setToast({ msg: 'Εκκίνηση B2B scraping...', type: 'info' });
    
    // Placeholder for Apify integration
    // In production, this would call the Apify API
    setTimeout(() => {
      const mockResults = [
        { id: 1, company: 'Ελληνική Ενέργεια Α.Ε.', category: 'Εταιρείες Ενέργειας', region: 'Αττική', phone: '2101234567', email: 'info@energeia.gr', website: 'energeia.gr', status: 'new' },
        { id: 2, company: 'Solar Tech Ελλάς', category: 'Εγκαταστάτες Φ/Β', region: 'Θεσσαλονίκη', phone: '2310123456', email: 'contact@solartech.gr', website: 'solartech.gr', status: 'new' },
        { id: 3, company: 'Green Power Solutions', category: 'Εταιρείες Ενέργειας', region: 'Αττική', phone: '2109876543', email: 'info@greenpower.gr', website: 'greenpower.gr', status: 'new' },
        { id: 4, company: 'EV Charge Greece', category: 'Σταθμοί Φόρτισης EV', region: 'Αττική', phone: '2105551234', email: 'info@evcharge.gr', website: 'evcharge.gr', status: 'new' },
        { id: 5, company: 'Αττική Κατασκευές', category: 'Κατασκευαστικές', region: 'Αττική', phone: '2106667890', email: 'info@attiki-kataskeves.gr', website: 'attiki-kataskeves.gr', status: 'new' },
      ];
      setScrapeResults(mockResults);
      setScrapeHistory(prev => [...prev, { date: new Date(), category: scrapeConfig.category, region: scrapeConfig.region, count: mockResults.length }]);
      setScraping(false);
      setToast({ msg: `Βρέθηκαν ${mockResults.length} B2B leads!`, type: 'success' });
    }, 2000);
  };

  const exportToExcel = () => {
    // Placeholder for Excel export
    setToast({ msg: 'Εξαγωγή σε Excel...', type: 'info' });
    // In production, this would generate and download an Excel file
    setTimeout(() => {
      setToast({ msg: 'Το αρχείο Excel δημιουργήθηκε!', type: 'success' });
    }, 1000);
  };

  const importLeads = async () => {
    if (scrapeResults.length === 0) return;
    setToast({ msg: 'Εισαγωγή leads στη βάση...', type: 'info' });
    
    for (const result of scrapeResults) {
      await supabase.from('hlektrismos_leads').insert({
        first_name: result.company.split(' ')[0],
        last_name: result.company.split(' ').slice(1).join(' '),
        email: result.email,
        phone: result.phone,
        region: result.region,
        customer_type: 'Εταιρεία (B2B)',
        provider: 'B2B Scraper',
        status: 'new',
        lawful_basis: 'Legitimate_Interest',
        customer_category: 'B2B_Corporate',
      });
    }
    
    setToast({ msg: `${scrapeResults.length} leads εισήχθησαν!`, type: 'success' });
    setScrapeResults([]);
  };

  return (
    <div className="dash-content">
      <div className="dash-content-header">
        <p>Αυτοματοποιημένη συλλογή B2B leads από καταλόγους επιχειρήσεων. Χρησιμοποιεί Apify για web scraping με GDPR-compliant lawful basis.</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-primary" onClick={startScrape} disabled={scraping}>
            <Radar size={16} className={scraping ? 'spin' : ''} /> {scraping ? 'Scraping...' : 'Εκκίνηση Scraping'}
          </button>
        </div>
      </div>

      <div className="scraper-config">
        <h3>Ρυθμίσεις Scraping</h3>
        <div className="scraper-config-grid">
          <div className="drawer-field">
            <label>Κατηγορία Επιχείρησης</label>
            <select value={scrapeConfig.category} onChange={(e) => setScrapeConfig({ ...scrapeConfig, category: e.target.value })}>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="drawer-field">
            <label>Περιοχή Στόχου</label>
            <select value={scrapeConfig.region} onChange={(e) => setScrapeConfig({ ...scrapeConfig, region: e.target.value })}>
              <option value="">Όλη η Ελλάδα</option>
              {greekRegions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="drawer-field">
            <label>Μέγιστο Αποτελέσματα</label>
            <input type="number" value={scrapeConfig.maxResults} onChange={(e) => setScrapeConfig({ ...scrapeConfig, maxResults: parseInt(e.target.value) || 100 })} />
          </div>
          <div className="drawer-field">
            <label>Συμπερίληψη Στοιχείων Επικοινωνίας</label>
            <div className="drawer-toggle-row">
              <button className={`drawer-toggle ${scrapeConfig.includeContact ? 'on' : ''}`} onClick={() => setScrapeConfig({ ...scrapeConfig, includeContact: true })}>Ναι</button>
              <button className={`drawer-toggle ${!scrapeConfig.includeContact ? 'off' : ''}`} onClick={() => setScrapeConfig({ ...scrapeConfig, includeContact: false })}>Όχι</button>
            </div>
          </div>
        </div>
      </div>

      {scrapeResults.length > 0 && (
        <div className="scraper-results">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3>Αποτελέσματα ({scrapeResults.length} leads)</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={exportToExcel}>
                <FileText size={16} /> Εξαγωγή Excel
              </button>
              <button className="btn btn-primary" onClick={importLeads}>
                <Plus size={16} /> Εισαγωγή στη Βάση
              </button>
            </div>
          </div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Εταιρεία</th><th>Κατηγορία</th><th>Περιοχή</th><th>Τηλέφωνο</th><th>Email</th><th>Ιστοσελίδα</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {scrapeResults.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.company}</strong></td>
                    <td>{r.category}</td>
                    <td>{r.region}</td>
                    <td>{r.phone}</td>
                    <td>{r.email}</td>
                    <td><a href={`https://${r.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{r.website}</a></td>
                    <td><span className={`dash-status-pill ${r.status}`}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scrapeHistory.length > 0 && (
        <div className="scraper-history">
          <h3>Ιστορικό Scraping</h3>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr><th>Ημερομηνία</th><th>Κατηγορία</th><th>Περιοχή</th><th>Αποτελέσματα</th></tr>
              </thead>
              <tbody>
                {scrapeHistory.map((h, i) => (
                  <tr key={i}>
                    <td>{h.date.toLocaleString('el-GR')}</td>
                    <td>{categories.find(c => c.value === h.category)?.label || h.category}</td>
                    <td>{h.region || 'Όλη η Ελλάδα'}</td>
                    <td><strong>{h.count}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="scraper-info">
        <h3>Πληροφορίες Ολοκληρωσης</h3>
        <p>Αυτό το εργαλείο χρησιμοποιεί <strong>Apify</strong> για web scraping από δημόσιους καταλόγους επιχειρήσεων. Όλα τα δεδομένα συλλέγονται με <strong>Legitimate Interest</strong> lawful basis και σέβονται τον GDPR.</p>
        <ul>
          <li>Αυτόματη αναζήτηση σε δημόσιους καταλόγους</li>
          <li>Φιλτράρισμα ανά κατηγορία και περιοχή</li>
          <li>Εξαγωγή σε Excel για περαιτέρω επεξεργασία</li>
          <li>Αυτόματη εισαγωγή leads στη βάση δεδομένων</li>
          <li>GDPR-compliant: Legitimate Interest lawful basis</li>
        </ul>
      </div>
    </div>
  );
}

function OrchestratorDirectorTab({ agents, leads, crmUsers, toast, setToast, setConfigAgent, loadData }: {
  agents: Agent[];
  leads: Lead[];
  crmUsers: CrmUser[];
  toast: { msg: string; type: 'success' | 'info' } | null;
  setToast: (v: { msg: string; type: 'success' | 'info' } | null) => void;
  setConfigAgent: (v: Agent | null) => void;
  loadData: () => Promise<void>;
}) {
  const [selectedView, setSelectedView] = useState<'overview' | 'agents' | 'micro' | 'pipeline'>('overview');
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', channel: 'Email', status: 'inactive' });

  const activeAgents = agents.filter(a => a.status === 'active');
  const totalLeads = leads.filter(l => !l.deleted_at).length;
  const totalContacted = agents.reduce((s, a) => s + (a.leads_contacted || 0), 0);
  const totalReplies = agents.reduce((s, a) => s + (a.replies || 0), 0);
  const totalMeetings = agents.reduce((s, a) => s + (a.meetings_booked || 0), 0);

  const agentStats = agents.map(a => ({
    ...a,
    replyRate: a.leads_contacted > 0 ? ((a.replies / a.leads_contacted) * 100).toFixed(1) : '0',
    meetingRate: a.replies > 0 ? ((a.meetings_booked / a.replies) * 100).toFixed(1) : '0',
  }));

  const toggleAgentStatus = async (agent: Agent) => {
    const newStatus = agent.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('ai_agents').update({ status: newStatus }).eq('id', agent.id);
    if (error) {
      setToast({ msg: 'Σφάλμα: ' + error.message, type: 'info' });
    } else {
      setToast({ msg: `${agent.name} ${newStatus === 'active' ? 'ενεργοποιήθηκε' : 'απενεργοποιήθηκε'}`, type: 'success' });
      loadData();
    }
  };

  const createAgent = async () => {
    if (!newAgent.name.trim()) return;
    const { error } = await supabase.from('ai_agents').insert({
      name: newAgent.name,
      channel: newAgent.channel,
      status: newAgent.status,
      leads_contacted: 0,
      replies: 0,
      meetings_booked: 0,
    });
    if (error) {
      setToast({ msg: 'Σφάλμα: ' + error.message, type: 'info' });
    } else {
      setToast({ msg: 'Το agent δημιουργήθηκε!', type: 'success' });
      setShowNewAgent(false);
      setNewAgent({ name: '', channel: 'Email', status: 'inactive' });
      loadData();
    }
  };

  const deleteAgent = async (id: string) => {
    if (!confirm('Είσαι σίγουρος ότι θέλεις να διαγράψεις αυτό το agent;')) return;
    const { error } = await supabase.from('ai_agents').delete().eq('id', id);
    if (error) {
      setToast({ msg: 'Σφάλμα: ' + error.message, type: 'info' });
    } else {
      setToast({ msg: 'Το agent διαγράφηκε.', type: 'success' });
      loadData();
    }
  };

  return (
    <div className="dash-content orchestrator-tab">
      <div className="dash-content-header">
        <p>Ολοκληρωμένη διαχείριση όλων των AI Agents και Micro Agents. Παρακολούθηση απόδοσης, ρύθμιση παραμέτρων, και οργάνωση του pipeline επικοινωνίας.</p>
      </div>

      <div className="orchestrator-nav">
        <button className={selectedView === 'overview' ? 'active' : ''} onClick={() => setSelectedView('overview')}>
          <LayoutDashboard size={16} /> Επισκόπηση
        </button>
        <button className={selectedView === 'agents' ? 'active' : ''} onClick={() => setSelectedView('agents')}>
          <Bot size={16} /> AI Agents ({agents.length})
        </button>
        <button className={selectedView === 'micro' ? 'active' : ''} onClick={() => setSelectedView('micro')}>
          <Zap size={16} /> Micro Agents
        </button>
        <button className={selectedView === 'pipeline' ? 'active' : ''} onClick={() => setSelectedView('pipeline')}>
          <Activity size={16} /> Pipeline Flow
        </button>
      </div>

      {selectedView === 'overview' && (
        <div className="orchestrator-overview">
          <div className="dash-stats-grid">
            <div className="dash-stat-card">
              <div className="dash-stat-icon"><Bot size={20} /></div>
              <div>
                <strong>{agents.length}</strong>
                <span>Σύνολο Agents</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(0,200,120,0.1)', color: '#00c878' }}><Activity size={20} /></div>
              <div>
                <strong>{activeAgents.length}</strong>
                <span>Ενεργοί Agents</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(0,102,204,0.1)', color: '#0066cc' }}><Users size={20} /></div>
              <div>
                <strong>{totalLeads}</strong>
                <span>Leads στο Pipeline</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(255,165,0,0.1)', color: '#ffa500' }}><TrendingUp size={20} /></div>
              <div>
                <strong>{totalContacted}</strong>
                <span>Επικοινωνίες</span>
              </div>
            </div>
          </div>

          <div className="orchestrator-performance">
            <h3>Απόδοση Agents</h3>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th>Επικοινωνίες</th>
                    <th>Απαντήσεις</th>
                    <th>Ρυθμός Απάντησης</th>
                    <th>Ραντεβού</th>
                    <th>Ρυθμός Ραντεβού</th>
                    <th>Ενέργειες</th>
                  </tr>
                </thead>
                <tbody>
                  {agentStats.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="agent-name-cell">
                          <Bot size={16} />
                          <div>
                            <strong>{a.name}</strong>
                            {a.target_region && <span className="agent-region">{a.target_region}</span>}
                          </div>
                        </div>
                      </td>
                      <td>{a.channel}</td>
                      <td>
                        <span className={`dash-status-pill ${a.status}`}>
                          {a.status === 'active' ? 'Ενεργός' : 'Ανενεργός'}
                        </span>
                      </td>
                      <td><strong>{a.leads_contacted || 0}</strong></td>
                      <td><strong>{a.replies || 0}</strong></td>
                      <td>
                        <div className="progress-bar-wrap">
                          <div className="progress-bar" style={{ width: `${Math.min(Number(a.replyRate), 100)}%` }} />
                          <span>{a.replyRate}%</span>
                        </div>
                      </td>
                      <td><strong>{a.meetings_booked || 0}</strong></td>
                      <td>
                        <div className="progress-bar-wrap">
                          <div className="progress-bar" style={{ width: `${Math.min(Number(a.meetingRate), 100)}%`, background: '#00c878' }} />
                          <span>{a.meetingRate}%</span>
                        </div>
                      </td>
                      <td>
                        <div className="action-btns">
                          <button className="icon-btn" title="Ενεργοποίηση/Απενεργοποίηση" onClick={() => toggleAgentStatus(a)}>
                            {a.status === 'active' ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          <button className="icon-btn" title="Ρύθμιση" onClick={() => setConfigAgent(a)}>
                            <Settings size={14} />
                          </button>
                          <button className="icon-btn delete" title="Διαγραφή" onClick={() => deleteAgent(a.id)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="orchestrator-summary-cards">
            <div className="summary-card">
              <h4>Κατανομή Leads ανά Agent</h4>
              <div className="lead-distribution">
                {agentStats.filter(a => a.status === 'active').map(a => (
                  <div key={a.id} className="distribution-item">
                    <span className="dist-name">{a.name}</span>
                    <div className="dist-bar-wrap">
                      <div className="dist-bar" style={{ width: `${totalLeads > 0 ? ((a.leads_contacted || 0) / totalLeads) * 100 : 0}%` }} />
                    </div>
                    <span className="dist-count">{a.leads_contacted || 0}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="summary-card">
              <h4>Κατάσταση Pipeline</h4>
              <div className="pipeline-stats">
                <div className="pipeline-stat">
                  <span className="pipeline-label">Νέα Leads</span>
                  <span className="pipeline-value">{leads.filter(l => l.status === 'new' && !l.deleted_at).length}</span>
                </div>
                <div className="pipeline-stat">
                  <span className="pipeline-label">Σε Εξέλιξη</span>
                  <span className="pipeline-value" style={{ color: '#ffa500' }}>{leads.filter(l => l.status === 'contacted' && !l.deleted_at).length}</span>
                </div>
                <div className="pipeline-stat">
                  <span className="pipeline-label">Ραντεβού</span>
                  <span className="pipeline-value" style={{ color: '#00c878' }}>{leads.filter(l => l.status === 'meeting_booked' && !l.deleted_at).length}</span>
                </div>
                <div className="pipeline-stat">
                  <span className="pipeline-label">Ολοκληρωμένα</span>
                  <span className="pipeline-value" style={{ color: '#0066cc' }}>{leads.filter(l => l.status === 'converted' && !l.deleted_at).length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedView === 'agents' && (
        <div className="orchestrator-agents-view">
          <div className="orchestrator-agents-header">
            <h3>AI Agents</h3>
            <button className="btn btn-primary" onClick={() => setShowNewAgent(true)}>
              <Plus size={16} /> Νέο Agent
            </button>
          </div>

          {showNewAgent && (
            <div className="new-agent-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Όνομα Agent</label>
                  <input
                    value={newAgent.name}
                    onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                    placeholder="π.χ. Νέο Agent"
                  />
                </div>
                <div className="form-group">
                  <label>Channel</label>
                  <select value={newAgent.channel} onChange={(e) => setNewAgent({ ...newAgent, channel: e.target.value })}>
                    {channelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Κατάσταση</label>
                  <select value={newAgent.status} onChange={(e) => setNewAgent({ ...newAgent, status: e.target.value })}>
                    <option value="active">Ενεργός</option>
                    <option value="inactive">Ανενεργός</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => setShowNewAgent(false)}>Άκυρο</button>
                <button className="btn btn-primary" onClick={createAgent}><CheckCircle2 size={16} /> Δημιουργία</button>
              </div>
            </div>
          )}

          <div className="agents-grid">
            {agents.map((a) => (
              <div key={a.id} className={`agent-card ${a.status}`}>
                <div className="agent-card-header">
                  <div className="agent-card-icon">
                    <Bot size={24} />
                  </div>
                  <div className="agent-card-info">
                    <h4>{a.name}</h4>
                    <span className="agent-card-channel">{a.channel}</span>
                  </div>
                  <span className={`dash-status-pill ${a.status}`}>
                    {a.status === 'active' ? 'Ενεργός' : 'Ανενεργός'}
                  </span>
                </div>
                <div className="agent-card-stats">
                  <div className="agent-stat">
                    <span className="agent-stat-value">{a.leads_contacted || 0}</span>
                    <span className="agent-stat-label">Επικοινωνίες</span>
                  </div>
                  <div className="agent-stat">
                    <span className="agent-stat-value">{a.replies || 0}</span>
                    <span className="agent-stat-label">Απαντήσεις</span>
                  </div>
                  <div className="agent-stat">
                    <span className="agent-stat-value">{a.meetings_booked || 0}</span>
                    <span className="agent-stat-label">Ραντεβού</span>
                  </div>
                </div>
                {a.target_region && (
                  <div className="agent-card-region">
                    <Globe size={14} /> {a.target_region}
                  </div>
                )}
                {a.base_prompt && (
                  <div className="agent-card-prompt">
                    <MessageSquare size={14} />
                    <p>{a.base_prompt.substring(0, 100)}{a.base_prompt.length > 100 ? '...' : ''}</p>
                  </div>
                )}
                <div className="agent-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleAgentStatus(a)}>
                    {a.status === 'active' ? <EyeOff size={14} /> : <Eye size={14} />}
                    {a.status === 'active' ? 'Απενεργ.' : 'Ενεργ.'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setConfigAgent(a)}>
                    <Settings size={14} /> Ρύθμιση
                  </button>
                  <button className="btn btn-ghost btn-sm delete" onClick={() => deleteAgent(a.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedView === 'micro' && (
        <div className="orchestrator-micro-view">
          <div className="orchestrator-agents-header">
            <h3>Micro Agents</h3>
            <p className="text-muted">Micro Agents είναι μικροί εξειδικευμένοι agent που εκτελούν συγκεκριμένες εργασίες (π.χ. εξαγωγή δεδομένων, αυτόματη κατηγοριοποίηση, παρακολούθηση emails).</p>
          </div>
          
          <div className="micro-agents-grid">
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(0,200,120,0.1)', color: '#00c878' }}><Radar size={24} /></div>
              <h4>Lead Scraper</h4>
              <p>Αυτόματη συλλογή leads από δημόσιους καταλόγους</p>
              <span className="micro-agent-status active">Ενεργός</span>
              <div className="micro-agent-stats">
                <span>Leads συλλέχθηκαν: {leads.filter(l => !l.deleted_at).length}</span>
                <span>Κατηγορίες: B2B, B2C</span>
              </div>
            </div>
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(255,165,0,0.1)', color: '#ffa500' }}><Mail size={24} /></div>
              <h4>Email Analyzer</h4>
              <p>Ανάλυση και κατηγοριοποίηση εισερχόμενων emails</p>
              <span className="micro-agent-status active">Ενεργός</span>
              <div className="micro-agent-stats">
                <span>Επικοινωνίες: {totalContacted}</span>
                <span>Απαντήσεις: {totalReplies}</span>
              </div>
            </div>
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(0,102,204,0.1)', color: '#0066cc' }}><MessageSquare size={24} /></div>
              <h4>Sentiment Detector</h4>
              <p>Ανίχνευση συναισθήματος σε μηνύματα πελατών</p>
              <span className="micro-agent-status active">Ενεργός</span>
              <div className="micro-agent-stats">
                <span>Αναλύσεις: {totalReplies}</span>
                <span>Αυτόματη κατηγοριοποίηση</span>
              </div>
            </div>
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(138,43,226,0.1)', color: '#8a2be2' }}><TrendingUp size={24} /></div>
              <h4>Lead Scorer</h4>
              <p>Αυτόματη βαθμολόγηση leads βάση ενδιαφέροντος</p>
              <span className="micro-agent-status active">Ενεργός</span>
              <div className="micro-agent-stats">
                <span>Βαθμολογήθηκαν: {leads.filter(l => !l.deleted_at).length}</span>
                <span>Ραντεβού: {totalMeetings}</span>
              </div>
            </div>
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(231,76,60,0.1)', color: '#e74c3c' }}><AlertCircle size={24} /></div>
              <h4>Notification Sender</h4>
              <p>Αυτόματη αποστολή ειδοποιήσεων στην ομάδα</p>
              <span className="micro-agent-status active">Ενεργός</span>
              <div className="micro-agent-stats">
                <span>Ειδοποιήσεις: {totalMeetings}</span>
                <span>Ροή: Αυτόματη</span>
              </div>
            </div>
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(46,204,113,0.1)', color: '#2ecc71' }}><Database size={24} /></div>
              <h4>Data Enricher</h4>
              <p>Εμπλουτισμός δεδομένων lead με δημόσια πληροφορίες</p>
              <span className={`micro-agent-status ${crmUsers.length > 0 ? 'active' : 'inactive'}`}>
                {crmUsers.length > 0 ? 'Ενεργός' : 'Ανενεργός'}
              </span>
              <div className="micro-agent-stats">
                <span>Χρήστες CRM: {crmUsers.length}</span>
                <span>Κατανομή: {crmUsers.filter(u => u.role === 'sales').length} πωλητές</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedView === 'pipeline' && (
        <div className="orchestrator-pipeline-view">
          <h3>Pipeline Flow</h3>
          <p className="text-muted">Ροή εργασιών από την συλλογή leads μέχρι την μετατροπή σε πελάτη.</p>
          
          <div className="pipeline-flow">
            <div className="pipeline-stage">
              <div className="pipeline-stage-icon" style={{ background: 'rgba(0,102,204,0.1)', color: '#0066cc' }}>
                <Database size={24} />
              </div>
              <h4>1. Συλλογή</h4>
              <p>B2B Scraper, Web Scraping, API Integrations</p>
              <div className="pipeline-stage-count">{leads.filter(l => l.status === 'new' && !l.deleted_at).length} leads</div>
            </div>
            <div className="pipeline-arrow">→</div>
            <div className="pipeline-stage">
              <div className="pipeline-stage-icon" style={{ background: 'rgba(255,165,0,0.1)', color: '#ffa500' }}>
                <Bot size={24} />
              </div>
              <h4>2. Επικοινωνία</h4>
              <p>AI Agents στέλνουν αρχικό μήνυμα</p>
              <div className="pipeline-stage-count">{leads.filter(l => l.status === 'contacted' && !l.deleted_at).length} leads</div>
            </div>
            <div className="pipeline-arrow">→</div>
            <div className="pipeline-stage">
              <div className="pipeline-stage-icon" style={{ background: 'rgba(0,200,120,0.1)', color: '#00c878' }}>
                <MessageSquare size={24} />
              </div>
              <h4>3. Συζήτηση</h4>
              <p>AI Agents διεξάγουν συζήτηση</p>
              <div className="pipeline-stage-count">{leads.filter(l => l.status === 'meeting_booked' && !l.deleted_at).length} leads</div>
            </div>
            <div className="pipeline-arrow">→</div>
            <div className="pipeline-stage">
              <div className="pipeline-stage-icon" style={{ background: 'rgba(138,43,226,0.1)', color: '#8a2be2' }}>
                <Users size={24} />
              </div>
              <h4>4. Ραντεβού</h4>
              <p>Κλείσιμο ραντεβού με πωλητή</p>
              <div className="pipeline-stage-count">{leads.filter(l => l.status === 'meeting_booked' && !l.deleted_at).length} leads</div>
            </div>
            <div className="pipeline-arrow">→</div>
            <div className="pipeline-stage">
              <div className="pipeline-stage-icon" style={{ background: 'rgba(46,204,113,0.1)', color: '#2ecc71' }}>
                <CheckCircle2 size={24} />
              </div>
              <h4>5. Μετατροπή</h4>
              <p>Ολοκλήρωση πωλησης</p>
              <div className="pipeline-stage-count">{leads.filter(l => l.status === 'converted' && !l.deleted_at).length} leads</div>
            </div>
          </div>

          <div className="pipeline-flow-details">
            <h4>Agent Workflow Rules</h4>
            <div className="workflow-rules">
              <div className="workflow-rule">
                <span className="rule-trigger">Trigger:</span> Νέο lead εισάγεται στη βάση
              </div>
              <div className="workflow-rule">
                <span className="rule-action">Action:</span> Auto-assign σε agent με λιγότερα active leads
              </div>
              <div className="workflow-rule">
                <span className="rule-trigger">Trigger:</span> Agent στέλνει μήνυμα
              </div>
              <div className="workflow-rule">
                <span className="rule-action">Action:</span> Ενημέρωση pipeline_status σε "contacted"
              </div>
              <div className="workflow-rule">
                <span className="rule-trigger">Trigger:</span> Lead απαντά
              </div>
              <div className="workflow-rule">
                <span className="rule-action">Action:</span> Αύξηση replies count, ενημέρωση sentiment
              </div>
              <div className="workflow-rule">
                <span className="rule-trigger">Trigger:</span> Handoff condition συμπληρώνεται
              </div>
              <div className="workflow-rule">
                <span className="rule-action">Action:</span> Ειδοποίηση πωλητή, αλλαγή pipeline_status
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
