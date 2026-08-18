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
  ShieldCheck,
  FolderOpen,
  ImageIcon,
  ExternalLink,
  Download,
  Calendar,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import SettingsPanel from '@/components/SettingsPanel';
import DocumentGenerator from '@/components/DocumentGenerator';

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
  property_type?: string | null;
  comments?: string | null;
  bill_file_path?: string | null;
  bill_file_name?: string | null;
  bill_files?: Array<{ path: string; name: string; type: string; size: number }> | null;
  assigned_to?: string | null;
  assigned_at?: string | null;
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

type Tab = 'overview' | 'agents' | 'leads' | 'sources' | 'market' | 'hub' | 'reports' | 'users' | 'scraper' | 'orchestrator' | 'settings' | 'email' | 'documents';

const greekRegions = [
  'ΞΞ»Ξ· Ξ· Ξ•Ξ»Ξ»Ξ¬Ξ΄Ξ±',
  'Ξ‘Ο„Ο„ΞΉΞΊΞ®',
  'Ξ‘ΞΈΞ®Ξ½Ξ±',
  'Ξ ΞµΞΉΟΞ±ΞΉΞ¬Ο‚',
  'ΞΞµΟƒΟƒΞ±Ξ»ΞΏΞ½Ξ―ΞΊΞ·',
  'ΞΞµΞ½Ο„ΟΞΉΞΊΞ® ΞΞ±ΞΊΞµΞ΄ΞΏΞ½Ξ―Ξ±',
  'Ξ”Ο…Ο„ΞΉΞΊΞ® ΞΞ±ΞΊΞµΞ΄ΞΏΞ½Ξ―Ξ±',
  'Ξ‘Ξ½Ξ±Ο„ΞΏΞ»ΞΉΞΊΞ® ΞΞ±ΞΊΞµΞ΄ΞΏΞ½Ξ―Ξ± & ΞΟΞ¬ΞΊΞ·',
  'Ξ‰Ο€ΞµΞΉΟΞΏΟ‚',
  'ΞΞµΟƒΟƒΞ±Ξ»Ξ―Ξ±',
  'Ξ™ΟΞ½ΞΉΞ± ΞΞ·ΟƒΞΉΞ¬',
  'ΞΞ­ΟΞΊΟ…ΟΞ±',
  'Ξ–Ξ¬ΞΊΟ…Ξ½ΞΈΞΏΟ‚',
  'Ξ›ΞµΟ…ΞΊΞ¬Ξ΄Ξ±',
  'ΞΞµΟ†Ξ±Ξ»Ξ»ΞΏΞ½ΞΉΞ¬',
  'Ξ™ΞΈΞ¬ΞΊΞ·',
  'Ξ Ξ±ΞΎΞΏΞ―',
  'Ξ‘Ξ½Ο„ΞΉΞΊΞ­ΟΞ±',
  'Ξ”Ο…Ο„ΞΉΞΊΞ® Ξ•Ξ»Ξ»Ξ¬Ξ΄Ξ±',
  'Ξ Ξ¬Ο„ΟΞ±',
  'Ξ‘ΞΉΞ³Ξ±Ξ»ΞµΟ',
  'Ξ£Ο„ΞµΟΞµΞ¬ Ξ•Ξ»Ξ»Ξ¬Ξ΄Ξ±',
  'Ξ›ΞΉΞ²Ξ±Ξ΄ΞµΞΉΞ¬',
  'Ξ§Ξ±Ξ»ΞΊΞ―Ξ΄Ξ±',
  'Ξ ΞµΞ»ΞΏΟ€ΟΞ½Ξ½Ξ·ΟƒΞΏΟ‚',
  'ΞΞ·ΟƒΞΉΞ¬ Ξ‘ΞΉΞ³Ξ±Ξ―ΞΏΟ…',
  'ΞΟΞΊΞΏΞ½ΞΏΟ‚',
  'Ξ£Ξ±Ξ½Ο„ΞΏΟΞ―Ξ½Ξ·',
  'Ξ Ξ¬ΟΞΏΟ‚',
  'ΞΞ¬ΞΎΞΏΟ‚',
  'ΞΞ®Ξ»ΞΏΟ‚',
  'ΞΟΞ®Ο„Ξ·',
  'Ξ—ΟΞ¬ΞΊΞ»ΞµΞΉΞΏ',
  'Ξ§Ξ±Ξ½ΞΉΞ¬',
  'Ξ΅Ξ­ΞΈΟ…ΞΌΞ½ΞΏ',
  'Ξ›Ξ±ΟƒΞ―ΞΈΞΉ',
  'Ξ’ΟΟΞµΞΉΞΏ Ξ‘ΞΉΞ³Ξ±Ξ―ΞΏ',
  'Ξ›Ξ­ΟƒΞ²ΞΏΟ‚',
  'Ξ§Ξ―ΞΏΟ‚',
  'Ξ£Ξ¬ΞΌΞΏΟ‚',
  'Ξ”Ο‰Ξ΄ΞµΞΊΞ¬Ξ½Ξ·ΟƒΞ±',
  'Ξ΅ΟΞ΄ΞΏΟ‚',
  'ΞΟ‰Ο‚',
  'ΞΞ±Ξ»ΟΞΌΞ½ΞΏΟ‚',
];

const handoffOptions = [
  { value: 'Interest Confirmed', label: 'Ξ•Ξ½Ξ΄ΞΉΞ±Ο†Ξ­ΟΞΏΞ½ Ξ•Ο€ΞΉΞ²ΞµΞ²Ξ±ΞΉΟΞΈΞ·ΞΊΞµ' },
  { value: 'Pricing Requested', label: 'Ξ‘Ξ―Ο„Ξ·ΞΌΞ± Ξ¤ΞΉΞΌΞΏΞ»ΟΞ³Ξ·ΟƒΞ·Ο‚' },
  { value: 'Meeting Booked', label: 'Ξ΅Ξ±Ξ½Ο„ΞµΞ²ΞΏΟ ΞΞ»ΞµΞ―ΟƒΟ„Ξ·ΞΊΞµ' },
  { value: 'Contract Ready', label: 'ΞΟ„ΞΏΞΉΞΌΞΏ Ξ³ΞΉΞ± Ξ£ΟΞΌΞ²Ξ±ΟƒΞ·' },
  { value: 'Complex Inquiry', label: 'Ξ£ΟΞ½ΞΈΞµΟ„ΞΏ Ξ‘Ξ―Ο„Ξ·ΞΌΞ±' },
  { value: 'Technical Issue', label: 'Ξ¤ΞµΟ‡Ξ½ΞΉΞΊΟ Ξ ΟΟΞ²Ξ»Ξ·ΞΌΞ±' },
  { value: 'Angry Lead', label: 'Ξ•Ξ½ΟΟ‡Ξ»Ξ·ΟƒΞ·/Ξ”Ο…ΟƒΞ±ΟΞ­ΟƒΞΊΞµΞΉΞ±' },
  { value: 'Budget Discussion', label: 'Ξ£Ο…Ξ¶Ξ®Ο„Ξ·ΟƒΞ· Ξ ΟΞΏΟ‹Ο€ΞΏΞ»ΞΏΞ³ΞΉΟƒΞΌΞΏΟ' },
  { value: 'Multi-property', label: 'Ξ ΞΏΞ»Ξ»Ξ±Ο€Ξ»Ξ¬ Ξ‘ΞΊΞ―Ξ½Ξ·Ο„Ξ±' },
  { value: 'B2B Decision Maker', label: 'B2B Decision Maker' },
  { value: 'VIP Customer', label: 'VIP Ξ ΞµΞ»Ξ¬Ο„Ξ·Ο‚' },
  { value: 'Legal/Compliance', label: 'ΞΞΏΞΌΞΉΞΊΟ/Compliance' },
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
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [configAgent, setConfigAgent] = useState<Agent | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'info' } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [leadsSubTab, setLeadsSubTab] = useState<'all' | 'new' | 'contacted' | 'qualified' | 'converted' | 'lost' | 'deleted'>('all');
  const [agentsSubTab, setAgentsSubTab] = useState<'active' | 'deleted'>('active');
  const [agentStatusFilter, setAgentStatusFilter] = useState('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [confirmDeleteAgentId, setConfirmDeleteAgentId] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [billUrls, setBillUrls] = useState<Array<{ url: string; name: string; type: string; size: number }>>([]);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);

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

  // Fetch a signed URL for the uploaded bill whenever a lead detail is opened.
  useEffect(() => {
    if (!openLead) {
      setBillUrls([]);
      setBillError(null);
      setBillLoading(false);
      return;
    }
    let cancelled = false;
    setBillLoading(true);
    setBillError(null);
    setBillUrls([]);

    const filesToLoad = openLead.bill_files && openLead.bill_files.length > 0
      ? openLead.bill_files
      : openLead.bill_file_path
        ? [{ path: openLead.bill_file_path, name: openLead.bill_file_name || 'Ξ›ΞΏΞ³Ξ±ΟΞΉΞ±ΟƒΞΌΟΟ‚', type: 'application/pdf', size: 0 }]
        : [];

    if (filesToLoad.length === 0) {
      setBillLoading(false);
      return;
    }

    (async () => {
      const results: Array<{ url: string; name: string; type: string; size: number }> = [];
      for (const file of filesToLoad) {
        const { data, error } = await supabase.storage
          .from('energy-bills')
          .createSignedUrl(file.path, 60 * 10);
        if (cancelled) return;
        if (!error && data?.signedUrl) {
          results.push({ url: data.signedUrl, name: file.name, type: file.type, size: file.size });
        }
      }
      if (!cancelled) {
        setBillUrls(results);
        setBillLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [openLead]);

  // Conversation management functions
  const createNewConversation = () => {
    const newConv = {
      id: crypto.randomUUID(),
      title: `ΞΞ­Ξ± Ξ£Ο…Ξ½ΞΏΞΌΞΉΞ»Ξ―Ξ± ${hubConversations.length + 1}`,
      messages: [{ role: 'assistant' as const, text: 'Ξ“ΞµΞΉΞ± ΟƒΞΏΟ…! Ξ•Ξ―ΞΌΞ±ΞΉ ΞΏ Master Orchestrator Ο„Ξ·Ο‚ Hlektrismos.gr. Ξ ΟΟ‚ ΞΌΟ€ΞΏΟΟ Ξ½Ξ± ΟƒΞµ Ξ²ΞΏΞ·ΞΈΞ®ΟƒΟ‰ ΞΌΞµ Ο„Ξ± AI agents;' }],
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
        title: msgs[0]?.content?.slice(0, 50) || `Ξ™ΟƒΟ„ΞΏΟΞΉΞΊΟ ${ctxId.slice(0, 8)}`,
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
    setToast({ msg: 'Ξ•ΞΊΞΊΞ―Ξ½Ξ·ΟƒΞ· Agent Engine...', type: 'info' });
    try {
      const { data, error } = await supabase.functions.invoke('agent-worker');
      if (error) throw error;
      setToast({ msg: data.message || 'ΞΞΉ AI Agents ΞΏΞ»ΞΏΞΊΞ»Ξ®ΟΟ‰ΟƒΞ±Ξ½ Ο„Ξ·Ξ½ ΞµΞΊΟ„Ξ­Ξ»ΞµΟƒΞ·.', type: 'success' });
      loadData();
    } catch (e) {
      setToast({ msg: 'Ξ£Ο†Ξ¬Ξ»ΞΌΞ± ΞΊΞ±Ο„Ξ¬ Ο„Ξ·Ξ½ ΞµΞΊΟ„Ξ­Ξ»ΞµΟƒΞ· Ο„Ο‰Ξ½ Agents.', type: 'info' });
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
    setToast({ msg: 'Ξ— Ξ΄ΞΉΞ±ΞΌΟΟΟ†Ο‰ΟƒΞ· Ο„ΞΏΟ… agent Ξ±Ο€ΞΏΞΈΞ·ΞΊΞµΟΟ„Ξ·ΞΊΞµ.', type: 'success' });
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
    setToast({ msg: 'Ξ¤ΞΏ lead ΞΌΞµΟ„Ξ±Ο†Ξ­ΟΞΈΞ·ΞΊΞµ ΟƒΟ„Ξ± Ξ΄ΞΉΞµΞ³ΟΞ±ΞΌΞΌΞ­Ξ½Ξ±.', type: 'success' });
    loadData();
  };

  const restoreLead = async (leadId: string) => {
    await supabase.from('hlektrismos_leads').update({ deleted_at: null }).eq('id', leadId);
    setToast({ msg: 'Ξ¤ΞΏ lead Ξ±Ο€ΞΏΞΊΞ±Ο„Ξ±ΟƒΟ„Ξ¬ΞΈΞ·ΞΊΞµ.', type: 'success' });
    loadData();
  };

  const permanentDeleteLead = async (leadId: string) => {
    await supabase.from('hlektrismos_leads').delete().eq('id', leadId);
    setConfirmDeleteId(null);
    setToast({ msg: 'Ξ¤ΞΏ lead Ξ΄ΞΉΞ±Ξ³ΟΞ¬Ο†Ξ·ΞΊΞµ ΞΌΟΞ½ΞΉΞΌΞ±.', type: 'success' });
    loadData();
  };

  const bulkSoftDeleteLeads = async () => {
    if (selectedLeads.size === 0) return;
    const ids = Array.from(selectedLeads);
    await supabase.from('hlektrismos_leads').update({ deleted_at: new Date().toISOString() }).in('id', ids);
    setSelectedLeads(new Set());
    setToast({ msg: `${ids.length} leads ΞΌΞµΟ„Ξ±Ο†Ξ­ΟΞΈΞ·ΞΊΞ±Ξ½ ΟƒΟ„Ξ± Ξ΄ΞΉΞµΞ³ΟΞ±ΞΌΞΌΞ­Ξ½Ξ±.`, type: 'success' });
    loadData();
  };

  const toggleLeadSelection = (id: string) => {
    setSelectedLeads(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllLeads = () => {
    if (selectedLeads.size === filteredLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filteredLeads.map(l => l.id)));
    }
  };

  const softDeleteAgent = async (agentId: string) => {
    await supabase.from('ai_agents').update({ deleted_at: new Date().toISOString() }).eq('id', agentId);
    setConfirmDeleteAgentId(null);
    setToast({ msg: 'Ξ¤ΞΏ agent ΞΌΞµΟ„Ξ±Ο†Ξ­ΟΞΈΞ·ΞΊΞµ ΟƒΟ„Ξ± Ξ΄ΞΉΞµΞ³ΟΞ±ΞΌΞΌΞ­Ξ½Ξ±.', type: 'success' });
    loadData();
  };

  const restoreAgent = async (agentId: string) => {
    await supabase.from('ai_agents').update({ deleted_at: null }).eq('id', agentId);
    setToast({ msg: 'Ξ¤ΞΏ agent Ξ±Ο€ΞΏΞΊΞ±Ο„Ξ±ΟƒΟ„Ξ¬ΞΈΞ·ΞΊΞµ.', type: 'success' });
    loadData();
  };

  const permanentDeleteAgent = async (agentId: string) => {
    await supabase.from('ai_agents').delete().eq('id', agentId);
    setConfirmDeleteAgentId(null);
    setToast({ msg: 'Ξ¤ΞΏ agent Ξ΄ΞΉΞ±Ξ³ΟΞ¬Ο†Ξ·ΞΊΞµ ΞΌΟΞ½ΞΉΞΌΞ±.', type: 'success' });
    loadData();
  };

  const syncTariffs = async () => {
    setSyncing(true);
    const now = new Date().toISOString();
    await supabase.from('market_tariffs').update({ updated_at: now }).in('resource', ['Electricity', 'Natural Gas', 'Photovoltaic']);
    setSyncing(false);
    setToast({ msg: 'Ξ— Ξ²Ξ¬ΟƒΞ· Ξ³Ξ½ΟΟƒΞ·Ο‚ ΞµΞ½Ξ·ΞΌΞµΟΟΞΈΞ·ΞΊΞµ.', type: 'success' });
    loadData();
  };

  const updateTariffPrice = async (t: Tariff) => {
    const newPrice = prompt(`Ξ•ΞΉΟƒΞ¬Ξ³ΞµΟ„Ξµ Ξ½Ξ­Ξ± Ο„ΞΉΞΌΞ® Ξ³ΞΉΞ± Ο„ΞΏ ${t.tariff_name}:`, t.price_eur.toString());
    if (newPrice !== null && !isNaN(parseFloat(newPrice))) {
      await supabase.from('market_tariffs').update({ price_eur: parseFloat(newPrice), updated_at: new Date().toISOString() }).eq('id', t.id);
      loadData();
      setToast({ msg: 'Ξ— Ο„ΞΉΞΌΞ® ΞµΞ½Ξ·ΞΌΞµΟΟΞΈΞ·ΞΊΞµ.', type: 'success' });
    }
  };

  // Lead counts per status folder
  const leadCounts = {
    all: leads.filter(l => !l.deleted_at).length,
    new: leads.filter(l => !l.deleted_at && l.status === 'new').length,
    contacted: leads.filter(l => !l.deleted_at && l.status === 'contacted').length,
    qualified: leads.filter(l => !l.deleted_at && l.status === 'qualified').length,
    converted: leads.filter(l => !l.deleted_at && l.status === 'converted').length,
    lost: leads.filter(l => !l.deleted_at && l.status === 'lost').length,
    deleted: leads.filter(l => !!l.deleted_at).length,
  };

  const filteredLeads = leads.filter((l) => {
    // Deleted sub-tab: only show deleted leads
    if (leadsSubTab === 'deleted') {
      if (!l.deleted_at) return false;
    } else {
      // All other sub-tabs: only show non-deleted leads
      if (l.deleted_at) return false;
      // 'all' shows everything, otherwise filter by specific status
      if (leadsSubTab !== 'all' && l.status !== leadsSubTab) return false;
    }

    // Search filter
    const matchesSearch = !search ||
      l.first_name.toLowerCase().includes(search.toLowerCase()) ||
      l.last_name.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase()) ||
      (l.phone && l.phone.includes(search)) ||
      (l.region && l.region.toLowerCase().includes(search.toLowerCase()));

    // Date range filter
    let matchesDate = true;
    if (dateFrom || dateTo) {
      const created = l.created_at ? new Date(l.created_at) : null;
      if (created) {
        if (dateFrom) matchesDate = matchesDate && created >= new Date(dateFrom);
        if (dateTo) matchesDate = matchesDate && created <= new Date(dateTo + 'T23:59:59');
      }
    }

    return matchesSearch && matchesDate;
  });

  const deletedLeads = leads.filter((l) => {
    if (!l.deleted_at) return false;
    const matchesSearch = !search ||
      l.first_name.toLowerCase().includes(search.toLowerCase()) ||
      l.last_name.toLowerCase().includes(search.toLowerCase()) ||
      l.email.toLowerCase().includes(search.toLowerCase());

    let matchesDate = true;
    if (dateFrom || dateTo) {
      const deleted = new Date(l.deleted_at);
      if (dateFrom) matchesDate = matchesDate && deleted >= new Date(dateFrom);
      if (dateTo) matchesDate = matchesDate && deleted <= new Date(dateTo + 'T23:59:59');
    }
    return matchesSearch && matchesDate;
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
    return `Ξ•Ξ―ΟƒΞ±ΞΉ ΞΏ ${activeAgent.name}, Ξ­Ξ½Ξ±Ο‚ Ξ±Ο…Ο„ΟΞ½ΞΏΞΌΞΏΟ‚ ${activeAgent.channel} agent Ο„Ξ·Ο‚ Hlektrismos.gr.\n\nΞ’Ξ‘Ξ£Ξ™ΞΞ PROMPT:\n${activeAgent.base_prompt || '(Ξ”ΞµΞ½ Ξ­Ο‡ΞµΞΉ ΞΏΟΞΉΟƒΟ„ΞµΞ― base prompt)'}\n\nΞ£Ξ¤ΞΞ§ΞΞ£: ${activeAgent.target_region || 'ΞΞ»Ξ· Ξ· Ξ•Ξ»Ξ»Ξ¬Ξ΄Ξ±'}\n\nΞ Ξ‘Ξ΅Ξ‘Ξ”ΞΞ£Ξ— Ξ£Ξ• Ξ‘ΞΞΞ΅Ξ©Ξ Ξ: ${activeAgent.handoff_condition || 'Interest Confirmed'}\n\nΞ–Ξ©ΞΞ¤Ξ‘ΞΞ‘ Ξ¤Ξ‘Ξ΅Ξ™Ξ¦Ξ‘ (RAG Knowledge Base):\n${tariffLines}\n\nΞΞ΄Ξ·Ξ³Ξ―ΞµΟ‚: Ξ•Ο€ΞΉΞΊΞΏΞΉΞ½ΟΞ½Ξ·ΟƒΞµ ΞΌΞµ leads ΟƒΟ„Ξ·Ξ½ Ο€ΞµΟΞΉΞΏΟ‡Ξ® ΟƒΟ„ΟΟ‡ΞΏΟ…, Ο€ΟΟΟ„ΞµΞΉΞ½Ξµ Ο„Ξ± Ο€Ξ±ΟΞ±Ο€Ξ¬Ξ½Ο‰ Ο„ΞΉΞΌΞΏΞ»ΟΞ³ΞΉΞ±, ΞΊΞ±ΞΉ Ο€Ξ±ΟΞ¬Ξ΄Ο‰ΟƒΞµ ΟƒΞµ Ξ¬Ξ½ΞΈΟΟ‰Ο€ΞΏ ΟΟ„Ξ±Ξ½: ${activeAgent.handoff_condition || 'Interest Confirmed'}.`;
  };

  const tabLabels: Record<Tab, string> = {
    overview: 'Ξ•Ο€ΞΉΟƒΞΊΟΟ€Ξ·ΟƒΞ·',
    agents: 'AI Agents',
    leads: 'Leads',
    sources: 'Ξ Ξ·Ξ³Ξ­Ο‚ Leads',
    market: 'Market RAG',
    hub: 'Agent Hub',
    orchestrator: 'Orchestrator Director',
    settings: 'Ξ΅Ο…ΞΈΞΌΞ―ΟƒΞµΞΉΟ‚ & Integrations',
    email: 'π“§ Email',
    reports: 'Reports',
    users: 'Ξ§ΟΞ®ΟƒΟ„ΞµΟ‚',
    scraper: 'B2B Scraper',
    documents: '\u0395\u03b3\u03b3\u03c1\u03b1\u03c6\u03ac',
  };

  return (
    <div className="dashboard-shell">
      <aside className="dash-sidebar">
        <a href="#/" className="dash-brand">
          <span className="brand-mark"><Zap size={16} fill="currentColor" /></span>
          <span>Hlektrismos<span>.gr</span></span>
        </a>
        <nav className="dash-nav">
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><LayoutDashboard size={18} /> Ξ•Ο€ΞΉΟƒΞΊΟΟ€Ξ·ΟƒΞ·</button>
          <button className={tab === 'agents' ? 'active' : ''} onClick={() => setTab('agents')}><Bot size={18} /> AI Agents</button>
          <button className={tab === 'leads' ? 'active' : ''} onClick={() => setTab('leads')}><Users size={18} /> Leads</button>
          <button className={tab === 'sources' ? 'active' : ''} onClick={() => setTab('sources')}><Database size={18} /> Ξ Ξ·Ξ³Ξ­Ο‚ Leads</button>
          <button className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}><Globe size={18} /> Market RAG</button>
          <button className={tab === 'hub' ? 'active' : ''} onClick={() => setTab('hub')}><Sparkles size={18} /> Agent Hub</button>
          <button className={tab === 'orchestrator' ? 'active' : ''} onClick={() => setTab('orchestrator')}><Activity size={18} /> Orchestrator Director</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><Settings size={18} /> Ξ΅Ο…ΞΈΞΌΞ―ΟƒΞµΞΉΟ‚</button>
          <button className={tab === 'reports' ? 'active' : ''} onClick={() => setTab('reports')}><FileText size={18} /> Reports</button>
          <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}><Users size={18} /> Ξ§ΟΞ®ΟƒΟ„ΞµΟ‚</button>
          <button className={tab === 'scraper' ? 'active' : ''} onClick={() => setTab('scraper')}><Radar size={18} /> B2B Scraper</button>
          <button className={tab === 'email' ? 'active' : ''} onClick={() => setTab('email')}><Mail size={18} /> π“§ Email</button>
          <button className={tab === 'documents' ? 'active' : ''} onClick={() => setTab('documents')}><FileText size={18} /> Έγγραφα</button>
        </nav>
        <div className="dash-sidebar-footer">
          <div className="dash-user">
            <div className="dash-user-avatar">{user?.email?.[0]?.toUpperCase()}</div>
            <span>{user?.email}</span>
          </div>
          <button className="dash-logout" onClick={signOut}><LogOut size={16} /> Ξ‘Ο€ΞΏΟƒΟΞ½Ξ΄ΞµΟƒΞ·</button>
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
          <div className="dash-loading">Ξ¦ΟΟΟ„Ο‰ΟƒΞ· Ξ΄ΞµΞ΄ΞΏΞΌΞ­Ξ½Ο‰Ξ½...</div>
        ) : (
          <>
            {tab === 'overview' && (
              <div className="dash-overview">
                <div className="dash-stats-grid">
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(0,200,120,0.08), rgba(0,102,204,0.05))', border: '1px solid rgba(0,200,120,0.15)', cursor: 'pointer' }} onClick={() => setTab('leads')}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(0,200,120,0.15)', color: '#00c878' }}><Users size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{leads.filter(l => !l.deleted_at).length}</strong><span>Ξ£ΟΞ½ΞΏΞ»ΞΏ Leads</span></div>
                  </div>
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(0,102,204,0.08), rgba(0,200,120,0.05))', border: '1px solid rgba(0,102,204,0.15)', cursor: 'pointer' }} onClick={() => setTab('agents')}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(0,102,204,0.15)', color: '#0066cc' }}><Bot size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{agents.filter(a => !a.deleted_at && a.status === 'active').length}</strong><span>Ξ•Ξ½ΞµΟΞ³Ξ¬ AI Agents</span></div>
                  </div>
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(147,51,234,0.08), rgba(0,102,204,0.05))', border: '1px solid rgba(147,51,234,0.15)', cursor: 'pointer' }} onClick={() => setTab('email')}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(147,51,234,0.15)', color: '#9333ea' }}><Mail size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{totalLeadsContacted}</strong><span>Ξ•Ο€ΞΉΞΊΞΏΞΉΞ½Ο‰Ξ½Ξ―ΞµΟ‚</span></div>
                  </div>
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(0,200,120,0.05))', border: '1px solid rgba(245,158,11,0.15)', cursor: 'pointer' }} onClick={() => setTab('reports')}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}><TrendingUp size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{conversionRate}%</strong><span>Conversion Rate</span></div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px' }}>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>π“‹ Ξ ΟΟΟƒΟ†Ξ±Ο„Ξ± Leads</h3>
                      <button onClick={() => setTab('leads')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>Ξ ΟΞΏΞ²ΞΏΞ»Ξ® ΟΞ»Ο‰Ξ½ β†’</button>
                    </div>
                    {leads.filter(l => !l.deleted_at).slice(0, 5).map(l => (
                      <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <strong style={{ fontSize: '13px', color: 'var(--text)' }}>{l.first_name} {l.last_name}</strong>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>{l.region}</span>
                        </div>
                        <span className={`dash-status-pill ${l.status}`}>{l.status}</span>
                      </div>
                    ))}
                    {leads.filter(l => !l.deleted_at).length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ leads.</p>}
                  </div>

                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>π¤– AI Agents Status</h3>
                      <button onClick={() => setTab('agents')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>Ξ”ΞΉΞ±Ο‡ΞµΞ―ΟΞΉΟƒΞ· β†’</button>
                    </div>
                    {agents.filter(a => !a.deleted_at).slice(0, 5).map(a => (
                      <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Bot size={14} />
                          <div>
                            <strong style={{ fontSize: '13px', color: 'var(--text)' }}>{a.name}</strong>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>{a.channel}</span>
                          </div>
                        </div>
                        <span className={`dash-status-pill ${a.status}`}>
                          {a.status === 'active' ? 'Ξ•Ξ½ΞµΟΞ³ΟΟ‚' : 'Ξ‘Ξ½ΞµΞ½ΞµΟΞ³ΟΟ‚'}
                        </span>
                      </div>
                    ))}
                    {agents.filter(a => !a.deleted_at).length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ agents.</p>}
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '24px' }}>
                  {[
                    { icon: 'π¤–', label: 'Agent Hub', tab: 'hub', desc: 'AI ΟƒΟ…Ξ½ΞΏΞΌΞΉΞ»Ξ―Ξ±' },
                    { icon: 'π”', label: 'B2B Scraper', tab: 'scraper', desc: 'Ξ‘Ξ½Ξ±Ξ¶Ξ®Ο„Ξ·ΟƒΞ· leads' },
                    { icon: 'π“', label: 'Orchestrator', tab: 'orchestrator', desc: 'Director view' },
                    { icon: 'π“', label: 'Email', tab: 'email', desc: 'Ξ”ΞΉΞ±Ο‡ΞµΞ―ΟΞΉΟƒΞ· email' },
                  ].map((action) => (
                    <button
                      key={action.tab}
                      onClick={() => setTab(action.tab as Tab)}
                      style={{
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
                        padding: '16px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                      <div style={{ fontSize: '24px', marginBottom: '6px' }}>{action.icon}</div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>{action.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{action.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'agents' && (
              <div className="dash-content">
                <div className="dash-content-header">
                  <p>Ξ”ΞΉΞ±Ο‡ΞµΞ―ΟΞΉΟƒΞ· AI Agents β€” Ο€Ξ±ΟΞ±ΞΊΞΏΞ»ΞΏΟΞΈΞ·ΟƒΞ· Ξ±Ο€ΟΞ΄ΞΏΟƒΞ·Ο‚, ΟΟΞΈΞΌΞΉΟƒΞ· Ο€Ξ±ΟΞ±ΞΌΞ­Ο„ΟΟ‰Ξ½, ΞµΞ½ΞµΟΞ³ΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ·/Ξ±Ο€ΞµΞ½ΞµΟΞ³ΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ·.</p>
                  <button className="btn btn-primary" onClick={() => setConfigAgent(null)}><Plus size={16} /> ΞΞ­ΞΏ Agent</button>
                </div>
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Agent</th><th>Channel</th><th>Status</th><th>Ξ ΞµΟΞΉΞΏΟ‡Ξ®</th><th>Ξ•Ο€ΞΉΞΊΞΏΞΉΞ½Ο‰Ξ½Ξ―ΞµΟ‚</th><th>Ξ‘Ο€Ξ±Ξ½Ο„Ξ®ΟƒΞµΞΉΟ‚</th><th>Ξ΅Ξ±Ξ½Ο„ΞµΞ²ΞΏΟ</th><th>Ξ•Ξ½Ξ­ΟΞ³ΞµΞΉΞ±</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.filter(a => !a.deleted_at).map((a) => (
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
                              {a.status === 'active' ? 'Ξ•Ξ½ΞµΟΞ³ΟΟ‚' : a.status === 'paused' ? 'Ξ Ξ±Ο…ΞΌΞ­Ξ½ΞΏΟ‚' : a.status}
                            </span>
                          </td>
                          <td>{a.target_region || 'β€”'}</td>
                          <td><strong>{a.leads_contacted || 0}</strong></td>
                          <td><strong>{a.replies || 0}</strong></td>
                          <td><strong>{a.meetings_booked || 0}</strong></td>
                          <td>
                            <div className="dash-lead-actions">
                              <button className="icon-btn" title="Ξ•Ξ½ΞµΟΞ³ΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ·/Ξ‘Ο€ΞµΞ½ΞµΟΞ³ΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ·" onClick={async () => {
                                const newStatus = a.status === 'active' ? 'paused' : 'active';
                                await supabase.from('ai_agents').update({ status: newStatus }).eq('id', a.id);
                                loadData();
                              }}>
                                {a.status === 'active' ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                              <button className="icon-btn" title="Ξ΅Ο…ΞΈΞΌΞ―ΟƒΞµΞΉΟ‚" onClick={() => setConfigAgent(a)}>
                                <Settings size={14} />
                              </button>
                              <button className="icon-btn" title="Ξ”ΞΉΞ±Ξ³ΟΞ±Ο†Ξ®" onClick={async () => {
                                await supabase.from('ai_agents').update({ deleted_at: new Date().toISOString() }).eq('id', a.id);
                                loadData();
                              }}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {agents.filter(a => !a.deleted_at).length === 0 && (
                        <tr><td colSpan={8} className="dash-empty">Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ agents. Ξ Ξ±Ο„Ξ®ΟƒΟ„Ξµ "ΞΞ­ΞΏ Agent" Ξ³ΞΉΞ± Ξ½Ξ± Ξ΄Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ®ΟƒΞµΟ„Ξµ.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'leads' && (
              <div className="dash-content">
                {/* Content Header */}
                <div className="dash-content-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ margin: 0 }}>Ξ”ΞΉΞ±Ο‡ΞµΞ―ΟΞΉΟƒΞ· Leads β€” Ξ±Ξ½Ξ±Ξ¶Ξ®Ο„Ξ·ΟƒΞ·, Ο†Ξ―Ξ»Ο„ΟΞ±, Ξ±Ξ½Ξ¬ΞΈΞµΟƒΞ· ΟƒΞµ AI agents.</p>
                    {selectedLeads.size > 0 ? (
                      <button
                        onClick={bulkSoftDeleteLeads}
                        style={{
                          padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                          background: '#e74c3c', color: '#fff', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.15s',
                        }}
                      >
                        <Trash2 size={14} /> Ξ”ΞΉΞ±Ξ³ΟΞ±Ο†Ξ® ({selectedLeads.size})
                      </button>
                    ) : (
                      <button className="btn btn-primary" onClick={() => { setSearch(''); setStatusFilter('all'); setDateFrom(''); setDateTo(''); setLeadsSubTab('all'); }}>
                        <RefreshCw size={14} /> Ξ•Ο€Ξ±Ξ½Ξ±Ο†ΞΏΟΞ¬ Ξ¦Ξ―Ξ»Ο„ΟΟ‰Ξ½
                      </button>
                    )}
                  </div>

                  {/* Sub-tabs (folders) */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {[
                      { key: 'all', label: 'ΞΞ»Ξ±', icon: 'π“' },
                      { key: 'new', label: 'ΞΞ­Ξ±', icon: 'π†•' },
                      { key: 'contacted', label: 'Ξ•Ο€ΞΉΞΊΞΏΞΉΞ½Ο‰Ξ½Ξ®ΞΈΞ·ΞΊΞµ', icon: 'π“' },
                      { key: 'qualified', label: 'Qualified', icon: 'β…' },
                      { key: 'converted', label: 'ΞΞµΟ„Ξ±Ο„ΟΞ¬Ο€Ξ·ΞΊΞµ', icon: 'π‰' },
                      { key: 'lost', label: 'Ξ§Ξ±ΞΌΞ­Ξ½Ξ±', icon: 'β' },
                      { key: 'deleted', label: 'Ξ”ΞΉΞµΞ³ΟΞ±ΞΌΞΌΞ­Ξ½Ξ±', icon: 'π—‘οΈ' },
                    ].map((folder) => (
                      <button
                        key={folder.key}
                        onClick={() => setLeadsSubTab(folder.key as any)}
                        style={{
                          padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                          border: '1px solid', cursor: 'pointer', transition: 'all 0.2s',
                          background: leadsSubTab === folder.key ? 'var(--text)' : 'var(--surface)',
                          color: leadsSubTab === folder.key ? 'var(--bg)' : 'var(--text)',
                          borderColor: leadsSubTab === folder.key ? 'var(--text)' : 'var(--border)',
                          display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                      >
                        <span>{folder.icon}</span>
                        <span>{folder.label}</span>
                        <span style={{
                          background: leadsSubTab === folder.key ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                          borderRadius: '10px', padding: '1px 7px', fontSize: '11px',
                        }}>
                          {leadCounts[folder.key as keyof typeof leadCounts]}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Search + Date Filters */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 300px' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        placeholder="Ξ‘Ξ½Ξ±Ξ¶Ξ®Ο„Ξ·ΟƒΞ· ΞΌΞµ ΟΞ½ΞΏΞΌΞ±, email, Ο„Ξ·Ξ»Ξ­Ο†Ο‰Ξ½ΞΏ Ξ® Ο€ΞµΟΞΉΞΏΟ‡Ξ®..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)' }}
                      />
                      {search && (
                        <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}>β•</button>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        title="Ξ‘Ο€Ο"
                        style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', background: 'var(--surface)', color: 'var(--text)' }}
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>β€”</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        title="ΞΟ‰Ο‚"
                        style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', background: 'var(--surface)', color: 'var(--text)' }}
                      />
                    </div>
                    {(search || dateFrom || dateTo) && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {filteredLeads.length} Ξ±Ο€ΞΏΟ„ΞµΞ»Ξ­ΟƒΞΌΞ±Ο„Ξ±
                      </span>
                    )}
                  </div>
                </div>

                {/* Active leads table */}
                {leadsSubTab !== 'deleted' && (
                  <div className="dash-table-wrap">
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={filteredLeads.length > 0 && selectedLeads.size === filteredLeads.length}
                              onChange={toggleAllLeads}
                              style={{ accentColor: '#0066cc', cursor: 'pointer' }}
                            />
                          </th>
                          <th>ΞΞ½ΞΏΞΌΞ±</th><th>Email</th><th>Ξ¤Ξ·Ξ»Ξ­Ο†Ο‰Ξ½ΞΏ</th><th>Ξ ΞµΟΞΉΞΏΟ‡Ξ®</th><th>Ξ¤ΟΟ€ΞΏΟ‚</th><th>ΞΞ±Ο„Ξ·Ξ³ΞΏΟΞ―Ξ±</th><th>GDPR</th><th>Status</th><th>AI Agent</th><th>Ξ•Ξ½Ξ­ΟΞ³ΞµΞΉΞ±</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLeads.map((l) => {
                          const aiOk = canActivateAI(l);
                          return (
                            <tr key={l.id} className="dash-row-clickable" style={selectedLeads.has(l.id) ? { background: 'rgba(0,102,204,0.06)' } : undefined} onClick={() => setOpenLead(l)}>
                              <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={selectedLeads.has(l.id)}
                                  onChange={() => toggleLeadSelection(l.id)}
                                  style={{ accentColor: '#0066cc', cursor: 'pointer' }}
                                />
                              </td>
                              <td>
                                <button className="dash-lead-name-btn" onClick={(e) => { e.stopPropagation(); setOpenLead(l); }}>
                                  {l.first_name} {l.last_name}
                                </button>
                              </td>
                              <td>{l.email}</td>
                              <td>{l.phone}</td>
                              <td>{l.region}</td>
                              <td>{l.customer_type}</td>
                              <td>
                                <select className="dash-status-select" value={l.customer_category || ''} onChange={(e) => updateLeadGdpr(l, 'customer_category', e.target.value)} onClick={(e) => e.stopPropagation()}>
                                  <option value="" disabled>β€”</option>
                                  <option value="B2C_Household">B2C</option>
                                  <option value="B2B_Corporate">B2B</option>
                                </select>
                              </td>
                              <td>
                                <div className="gdpr-badge-wrap">
                                  <select className="dash-status-select" value={l.lawful_basis || ''} onChange={(e) => updateLeadGdpr(l, 'lawful_basis', e.target.value)} onClick={(e) => e.stopPropagation()}>
                                    <option value="" disabled>β€”</option>
                                    <option value="Consent">Consent</option>
                                    <option value="Legitimate_Interest">Leg. Interest</option>
                                  </select>
                                  <span className={`gdpr-badge ${aiOk ? 'ok' : 'blocked'}`}>{aiOk ? 'OK' : 'Missing'}</span>
                                </div>
                              </td>
                              <td>
                                <select className="dash-status-select" value={l.status || 'new'} onChange={(e) => updateLeadGdpr(l, 'status', e.target.value)} onClick={(e) => e.stopPropagation()}>
                                  <option value="new">New</option>
                                  <option value="contacted">Contacted</option>
                                  <option value="qualified">Qualified</option>
                                  <option value="converted">Converted</option>
                                  <option value="lost">Lost</option>
                                </select>
                              </td>
                              <td>
                                <span className={`dash-status-pill ${l.assigned_to ? 'assigned' : 'unassigned'}`}>
                                  {l.assigned_to ? l.assigned_to.substring(0, 8) : 'Unassigned'}
                                </span>
                              </td>
                              <td>
                                <div className="dash-lead-actions" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => softDeleteLead(l.id)}
                                    title="ΞΞµΟ„Ξ±Ο†ΞΏΟΞ¬ ΟƒΟ„Ξ± Ξ”ΞΉΞµΞ³ΟΞ±ΞΌΞΌΞ­Ξ½Ξ±"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                                      padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)',
                                      background: 'rgba(231,76,60,0.06)', color: '#e74c3c', cursor: 'pointer',
                                      fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = '#e74c3c'; e.currentTarget.style.color = '#fff'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(231,76,60,0.06)'; e.currentTarget.style.color = '#e74c3c'; }}
                                  >
                                    <Trash2 size={13} /> Ξ”ΞΉΞ±Ξ³ΟΞ±Ο†Ξ®
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredLeads.length === 0 && <p className="dash-empty">Ξ”ΞµΞ½ Ξ²ΟΞ­ΞΈΞ·ΞΊΞ±Ξ½ leads ΟƒΞµ Ξ±Ο…Ο„ΟΞ½ Ο„ΞΏΞ½ Ο†Ξ¬ΞΊΞµΞ»ΞΏ.</p>}
                  </div>
                )}

                {/* Deleted leads table */}
                {leadsSubTab === 'deleted' && (
                  <div className="dash-table-wrap">
                    <div className="dash-deleted-notice">
                      <AlertCircle size={16} />
                      <span>Ξ¤Ξ± Ξ΄ΞΉΞµΞ³ΟΞ±ΞΌΞΌΞ­Ξ½Ξ± leads Ξ±Ο€ΞΏΞΈΞ·ΞΊΞµΟΞΏΞ½Ο„Ξ±ΞΉ ΞµΞ΄Ο. ΞΟ€ΞΏΟΞµΞ―Ο„Ξµ Ξ½Ξ± Ο„Ξ± Ξ±Ο€ΞΏΞΊΞ±Ο„Ξ±ΟƒΟ„Ξ®ΟƒΞµΟ„Ξµ Ξ® Ξ½Ξ± Ο„Ξ± Ξ΄ΞΉΞ±Ξ³ΟΞ¬ΟΞµΟ„Ξµ ΞΌΟΞ½ΞΉΞΌΞ±.</span>
                    </div>
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>ΞΞ½ΞΏΞΌΞ±</th><th>Email</th><th>Ξ¤Ξ·Ξ»Ξ­Ο†Ο‰Ξ½ΞΏ</th><th>Ξ ΞµΟΞΉΞΏΟ‡Ξ®</th><th>Ξ¤ΟΟ€ΞΏΟ‚</th><th>Status</th><th>Ξ”ΞΉΞ±Ξ³ΟΞ¬Ο†Ξ·ΞΊΞµ</th><th>Ξ•Ξ½Ξ­ΟΞ³ΞµΞΉΞ±</th>
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
                            <td>{l.deleted_at ? new Date(l.deleted_at).toLocaleDateString('el-GR') : 'β€”'}</td>
                            <td>
                              <div className="dash-lead-actions">
                                <button className="btn-restore-lead" onClick={() => restoreLead(l.id)} title="Ξ‘Ο€ΞΏΞΊΞ±Ο„Ξ¬ΟƒΟ„Ξ±ΟƒΞ·">
                                  <RefreshCw size={14} /> Ξ‘Ο€ΞΏΞΊΞ±Ο„Ξ¬ΟƒΟ„Ξ±ΟƒΞ·
                                </button>
                                {confirmDeleteId === l.id ? (
                                  <div className="dash-delete-confirm">
                                    <span>ΞΟΞ½ΞΉΞΌΞ·;</span>
                                    <button className="btn-delete-yes permanent" onClick={() => permanentDeleteLead(l.id)}>ΞΞ±ΞΉ</button>
                                    <button className="btn-delete-no" onClick={() => setConfirmDeleteId(null)}>ΞΟ‡ΞΉ</button>
                                  </div>
                                ) : (
                                  <button className="btn-delete-lead permanent" onClick={() => setConfirmDeleteId(l.id)} title="ΞΟΞ½ΞΉΞΌΞ· Ξ΄ΞΉΞ±Ξ³ΟΞ±Ο†Ξ®">
                                    <X size={14} /> ΞΟΞ½ΞΉΞΌΞ· Ξ”ΞΉΞ±Ξ³ΟΞ±Ο†Ξ®
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {deletedLeads.length === 0 && <p className="dash-empty">Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ Ξ΄ΞΉΞµΞ³ΟΞ±ΞΌΞΌΞ­Ξ½Ξ± leads.</p>}
                  </div>
                )}
              </div>
            )}

            {tab === 'sources' && (
              <div className="dash-content">
                <div className="dash-content-header">
                  <p>Ξ Ξ·Ξ³Ξ­Ο‚ leads ΞΌΞµ GDPR-compliant lawful basis. ΞΞ±ΞΌΞ―Ξ± ΞµΞΎΞ±Ξ³Ο‰Ξ³Ξ® Ξ±Ο€Ο third-party sites.</p>
                  <button className="btn btn-primary" onClick={() => setShowAddSource(!showAddSource)}><Plus size={16} /> ΞΞ­Ξ± Ξ Ξ·Ξ³Ξ®</button>
                </div>
                {showAddSource && (
                  <div className="dash-add-form">
                    <input placeholder="ΞΞ½ΞΏΞΌΞ± Ο€Ξ·Ξ³Ξ®Ο‚" value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} />
                    <select value={newSource.type} onChange={(e) => setNewSource({ ...newSource, type: e.target.value })}>
                      <option value="opt-in">Opt-in</option>
                      <option value="partner">Partner</option>
                      <option value="first-party">First-party</option>
                    </select>
                    <select value={newSource.lawful_basis} onChange={(e) => setNewSource({ ...newSource, lawful_basis: e.target.value })}>
                      <option value="consent">Consent</option>
                      <option value="legitimate-interest">Legitimate Interest</option>
                    </select>
                    <button className="btn btn-primary" onClick={createSource}>Ξ”Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ―Ξ±</button>
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
                        <div><span>Leads Ξ±Ο…Ο„ΟΞ½ Ο„ΞΏΞ½ ΞΌΞ®Ξ½Ξ±</span><strong>{s.leads_this_month}</strong></div>
                      </div>
                    </div>
                  ))}
                  {sources.length === 0 && <p className="dash-empty">Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ Ο€Ξ·Ξ³Ξ­Ο‚. Ξ ΟΞΏΟƒΞΈΞ­ΟƒΟ„Ξµ Ο„Ξ·Ξ½ Ο€ΟΟΟ„Ξ· ΟƒΞ±Ο‚ Ο€Ξ·Ξ³Ξ®.</p>}
                </div>
              </div>
            )}

            {tab === 'market' && (
              <div className="dash-content">
                <div className="dash-content-header">
                  <p>Ξ”Ο…Ξ½Ξ±ΞΌΞΉΞΊΞ¬ Ο„ΞΉΞΌΞΏΞ»ΟΞ³ΞΉΞ± Ξ±Ξ³ΞΏΟΞ¬Ο‚ Ο€ΞΏΟ… Ο„ΟΞΏΟ†ΞΏΞ΄ΞΏΟ„ΞΏΟΞ½ Ο„Ξ· Ξ²Ξ¬ΟƒΞ· Ξ³Ξ½ΟΟƒΞ·Ο‚ Ο„Ο‰Ξ½ AI agents (RAG pipeline).</p>
                  <button className="btn btn-primary" onClick={syncTariffs} disabled={syncing}>
                    <RefreshCw size={16} className={syncing ? 'spin' : ''} /> {syncing ? 'Ξ£Ο…Ξ³Ο‡ΟΞΏΞ½ΞΉΟƒΞΌΟΟ‚...' : 'Sync Data'}
                  </button>
                </div>
                <div className="rag-layout">
                  <div className="rag-tariffs-panel">
                    <h3 className="rag-section-title"><TrendingUp size={18} /> Live Tariffs (DAM)</h3>
                    <div className="dash-table-wrap">
                      <table className="dash-table">
                        <thead>
                          <tr><th>Ξ ΟΟΞΏΟ‚</th><th>Ξ¤Ξ±ΟΞ―Ο†Ξ±</th><th>Ξ¤ΞΉΞΌΞ®</th><th>ΞΞΏΞ½Ξ¬Ξ΄Ξ±</th><th>Ξ•Ξ½Ξ·ΞΌΞ­ΟΟ‰ΟƒΞ·</th></tr>
                        </thead>
                        <tbody>
                          {tariffs.map((t) => (
                            <tr key={t.id}>
                              <td><span className={`rag-resource-tag ${t.resource.toLowerCase().replace(/\s/g, '-')}`}>{t.resource}</span></td>
                              <td>{t.tariff_name}</td>
                              <td style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={() => updateTariffPrice(t)} title="ΞΞ»ΞΉΞΊ Ξ³ΞΉΞ± ΞµΟ€ΞµΞΎΞµΟΞ³Ξ±ΟƒΞ―Ξ±"><strong>{t.price_eur.toFixed(4)}</strong></td>
                              <td>{t.unit}</td>
                              <td>{new Date(t.updated_at).toLocaleString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {tariffs.length === 0 && <p className="dash-empty">Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ Ο„ΞΉΞΌΞΏΞ»ΟΞ³ΞΉΞ±.</p>}
                    </div>
                  </div>
                  <div className="rag-context-panel">
                    <h3 className="rag-section-title"><Bot size={18} /> Agent Context (RAG Output)</h3>
                    <p className="rag-context-desc">Ξ¤ΞΏ Ξ±ΞΊΟΞΉΞ²Ξ­Ο‚ system prompt Ο€ΞΏΟ… Ξ΄Ξ·ΞΌΞΉΞΏΟ…ΟΞ³ΞµΞ―Ο„Ξ±ΞΉ Ξ±Ο€Ο Ο„ΞΏΞ½ ΟƒΟ…Ξ½Ξ΄Ο…Ξ±ΟƒΞΌΟ Live Tariffs + Base Prompt Template.</p>
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
            {tab === 'settings' && (
              <SettingsPanel toast={toast} setToast={setToast} />
            )}
            {tab === 'email' && (
              <EmailTab toast={toast} setToast={setToast} />
            )}
            {tab === 'documents' && (
              <DocumentGenerator toast={toast} setToast={setToast} />
            )}
          </>
        )}
      </div>

      {configAgent && (
        <AgentConfigDrawer agent={configAgent} onClose={() => setConfigAgent(null)} onSave={saveAgentConfig} />
      )}

      {openLead && (
        <div className="modal-overlay" onClick={() => setOpenLead(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700, width: '95vw', maxHeight: '85vh', overflow: 'auto' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0 }}>{openLead.first_name} {openLead.last_name}</h3>
              <button className="modal-close" onClick={() => setOpenLead(null)}>x</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div className="detail-group"><label>Email</label><span>{openLead.email || 'β€”'}</span></div>
                <div className="detail-group"><label>Ξ¤Ξ·Ξ»Ξ­Ο†Ο‰Ξ½ΞΏ</label><span>{openLead.phone || 'β€”'}</span></div>
                <div className="detail-group"><label>Ξ ΞµΟΞΉΞΏΟ‡Ξ®</label><span>{openLead.region || 'β€”'}</span></div>
                <div className="detail-group"><label>Ξ¤ΟΟ€ΞΏΟ‚</label><span>{openLead.customer_type || 'β€”'}</span></div>
                <div className="detail-group"><label>ΞΞ±Ο„Ξ·Ξ³ΞΏΟΞ―Ξ±</label><span>{openLead.customer_category || 'β€”'}</span></div>
                <div className="detail-group"><label>Ξ Ξ¬ΟΞΏΟ‡ΞΏΟ‚</label><span>{openLead.provider || 'β€”'}</span></div>
                <div className="detail-group"><label>Status</label><span className={`dash-status-pill ${openLead.status}`}>{openLead.status}</span></div>
                <div className="detail-group"><label>Ξ”Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ®ΞΈΞ·ΞΊΞµ</label><span>{new Date(openLead.created_at).toLocaleDateString('el-GR')}</span></div>
                {openLead.assigned_to && <div className="detail-group"><label>Ξ‘Ξ½Ο„ΞΉΟ€ΟΟΟƒΟ‰Ο€ΞΏΟ‚</label><span>{crmUsers.find(u => u.id === openLead.assigned_to)?.full_name || openLead.assigned_to}</span></div>}
                {openLead.comments && <div className="detail-group" style={{ gridColumn: '1 / -1' }}><label>Ξ£Ο‡ΟΞ»ΞΉΞ±</label><span>{openLead.comments}</span></div>}
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <h4 style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}><FileText size={18} /> Ξ‘Ξ½ΞµΞ²Ξ±ΟƒΞΌΞ­Ξ½Ξ± Ξ‘ΟΟ‡ΞµΞ―Ξ±</h4>
                {billLoading && <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Ξ¦ΟΟΟ„Ο‰ΟƒΞ·...</div>}
                {billError && <div style={{ padding: 12, background: 'rgba(231,76,60,0.1)', borderRadius: 8, color: '#e74c3c', fontSize: 13 }}><AlertCircle size={14} /> {billError}</div>}
                {!billLoading && !billError && billUrls.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}><FolderOpen size={32} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ Ξ±Ξ½ΞµΞ²Ξ±ΟƒΞΌΞ­Ξ½Ξ± Ξ±ΟΟ‡ΞµΞ―Ξ±</div>}
                {billUrls.length > 0 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{billUrls.map((file, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    {file.type === 'application/pdf' ? <FileText size={24} style={{ color: '#e74c3c', flexShrink: 0 }} /> : <ImageIcon size={24} style={{ color: '#00c878', flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{file.type === 'application/pdf' ? 'PDF' : file.type === 'image/jpeg' ? 'JPEG' : 'PNG'}{file.size > 0 ? ` Β· ${(file.size / 1024 / 1024).toFixed(1)}MB` : ''}</div>
                    </div>
                    <a href={file.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 12, flexShrink: 0, textDecoration: 'none' }}><ExternalLink size={14} /> Ξ ΟΞΏΞ²ΞΏΞ»Ξ®</a>
                    <a href={file.url} download={file.name} className="btn btn-ghost" style={{ fontSize: 12, flexShrink: 0, textDecoration: 'none' }}><Download size={14} /> Ξ›Ξ®ΟΞ·</a>
                  </div>
                ))}</div>}
              </div>
            </div>
          </div>
        </div>
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
          <h2><Settings size={20} /> Ξ”ΞΉΞ±ΞΌΟΟΟ†Ο‰ΟƒΞ· Agent</h2>
          <button className="drawer-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="drawer-body">
          <div className="drawer-field-group">
            <h3 className="drawer-agent-name">{agent.name}</h3>
          </div>
          <div className="drawer-field">
            <label>Ξ¤ΟΟ€ΞΏΟ‚ ΞΞ±Ξ½Ξ±Ξ»ΞΉΞΏΟ</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="voice">Ξ¦Ο‰Ξ½Ξ®</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="viber">Viber</option>
              <option value="linkedin">LinkedIn</option>
              <option value="facebook">Facebook Messenger</option>
            </select>
          </div>
          <div className="drawer-field">
            <label>Ξ ΞµΟΞΉΞΏΟ‡Ξ® Ξ£Ο„ΟΟ‡ΞΏΟ…</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">ΞΞ»Ξ· Ξ· Ξ•Ξ»Ξ»Ξ¬Ξ΄Ξ±</option>
              {greekRegions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="drawer-field">
            <label>ΞΞ±Ο„Ξ¬ΟƒΟ„Ξ±ΟƒΞ·</label>
            <div className="drawer-toggle-row">
              <button className={`drawer-toggle ${status === 'active' ? 'on' : ''}`} onClick={() => setStatus('active')}>Live</button>
              <button className={`drawer-toggle ${status === 'paused' ? 'off' : ''}`} onClick={() => setStatus('paused')}>Paused</button>
            </div>
          </div>
          <div className="drawer-field">
            <label>Base Prompt Template</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ξ“ΟΞ¬ΟΞµ Ο„ΞΉΟ‚ ΞΏΞ΄Ξ·Ξ³Ξ―ΞµΟ‚ Ξ³ΞΉΞ± Ο„ΞΏ LLM ΟƒΟ„Ξ± ΞµΞ»Ξ»Ξ·Ξ½ΞΉΞΊΞ¬..." rows={6} />
          </div>
          <div className="drawer-field">
            <label>Ξ Ξ±ΟΞ¬Ξ΄ΞΏΟƒΞ· ΟƒΞµ Ξ†Ξ½ΞΈΟΟ‰Ο€ΞΏ ΞΟ„Ξ±Ξ½:</label>
            <select value={handoff} onChange={(e) => setHandoff(e.target.value)}>
              {handoffOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <div className="drawer-footer">
          <button className="btn btn-ghost" onClick={onClose}>Ξ†ΞΊΟ…ΟΞΏ</button>
          <button className="btn btn-primary" onClick={handleSave}><CheckCircle2 size={16} /> Ξ‘Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ·</button>
        </div>
      </div>
    </div>
  );
}

/* β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•
   AGENT HUB β€” Chat Input Toolbar (Claude-style + menu, mic, voice)
   β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β• */

function AgentChatInputToolbar({ onSendMessage, onOpenSettings }: {
  onSendMessage: (msg: string) => void;
  onOpenSettings: (tab: string) => void;
}) {
  const [message, setMessage] = useState('');
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (message.trim()) {
        onSendMessage(message);
        setMessage('');
        setShowPlusMenu(false);
      }
    }
  };

  const menuItemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    width: '100%', padding: '8px 14px', background: 'transparent', border: 'none',
    color: 'var(--text)', fontSize: '13px', cursor: 'pointer', textAlign: 'left'
  };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: '880px', margin: '0 auto' }}>
      {/* Attachment / Actions Popover (+ Menu) */}
      {showPlusMenu && (
        <div style={{
          position: 'absolute', bottom: '60px', left: '0', width: '260px',
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.3)', zIndex: 1000, padding: '6px 0',
          color: 'var(--text)', fontSize: '13px'
        }}>
          <button onClick={() => fileInputRef.current?.click()} style={menuItemStyle}>
            <span>π“ Ξ ΟΞΏΟƒΞΈΞ®ΞΊΞ· Ξ±ΟΟ‡ΞµΞ―Ο‰Ξ½ Ξ® Ο†Ο‰Ο„ΞΏΞ³ΟΞ±Ο†ΞΉΟΞ½</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-2)', padding: '2px 6px', borderRadius: '4px' }}>Ctrl+U</span>
          </button>
          <button onClick={() => onOpenSettings('skills')} style={menuItemStyle}>
            <span>π“ Ξ ΟΞΏΟƒΞΈΞ®ΞΊΞ· ΟƒΞµ project</span><span>β€Ί</span>
          </button>
          <button onClick={() => onOpenSettings('connectors')} style={menuItemStyle}>
            <span>π™ Ξ ΟΞΏΟƒΞΈΞ®ΞΊΞ· Ξ±Ο€Ο GitHub</span>
          </button>
          <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
          <button onClick={() => onOpenSettings('skills')} style={menuItemStyle}>
            <span>π› οΈ Skills (Ξ”ΞµΞΎΞΉΟΟ„Ξ·Ο„ΞµΟ‚)</span><span>β€Ί</span>
          </button>
          <button onClick={() => onOpenSettings('connectors')} style={menuItemStyle}>
            <span>π” Connectors (Ξ£Ο…Ξ½Ξ΄Ξ­ΟƒΞµΞΉΟ‚)</span><span>β€Ί</span>
          </button>
          <button onClick={() => onOpenSettings('plugins')} style={menuItemStyle}>
            <span>π§© Plugins (Ξ ΟΟΟƒΞΈΞµΟ„Ξ±)</span><span>β€Ί</span>
          </button>
          <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
          <button onClick={() => setWebSearchEnabled(!webSearchEnabled)} style={{ ...menuItemStyle, justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>π Ξ‘Ξ½Ξ±Ξ¶Ξ®Ο„Ξ·ΟƒΞ· ΟƒΟ„ΞΏ Web</span>
            {webSearchEnabled && <span style={{ color: '#10b981', fontWeight: 'bold' }}>β“</span>}
          </button>
        </div>
      )}

      <input type="file" ref={fileInputRef} style={{ display: 'none' }} multiple onChange={(e) => console.log(e.target.files)} />

      {/* Main Input Capsule */}
      <div style={{
        display: 'flex', alignItems: 'center', background: 'var(--bg-2)',
        border: '1px solid var(--border)', borderRadius: '24px', padding: '8px 14px', gap: '10px'
      }}>
        <button onClick={() => setShowPlusMenu(!showPlusMenu)} style={{
          background: showPlusMenu ? 'rgba(0,102,204,0.15)' : 'rgba(0,0,0,0.06)',
          border: 'none', borderRadius: '50%', width: '32px', height: '32px',
          color: 'var(--text)', cursor: 'pointer', fontSize: '18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} title="Ξ ΟΞΏΟƒΞΈΞ®ΞΊΞ· Ο…Ξ»ΞΉΞΊΞΏΟ & ΞµΟΞ³Ξ±Ξ»ΞµΞ―Ο‰Ξ½">+</button>

        <textarea
          value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Ξ£Ο„ΞµΞ―Ξ»Ο„Ξµ ΞΌΞ®Ξ½Ο…ΞΌΞ± ΟƒΟ„ΞΏΞ½ Agent Hub..." rows={1}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '14px', resize: 'none', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => setIsRecording(!isRecording)} style={{
            background: isRecording ? 'rgba(239,68,68,0.15)' : 'transparent',
            border: 'none', borderRadius: '50%', width: '32px', height: '32px',
            color: isRecording ? '#ef4444' : 'var(--text-muted)', cursor: 'pointer', fontSize: '16px'
          }} title="Ξ¦Ο‰Ξ½Ξ·Ο„ΞΉΞΊΞ® Ο…Ο€Ξ±Ξ³ΟΟΞµΟ…ΟƒΞ·">π™οΈ</button>
          <button style={{
            background: 'transparent', border: 'none', borderRadius: '50%', width: '32px', height: '32px',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px'
          }} title="Live Voice Assistant Stream">π“</button>
          <button
            onClick={() => {
              if (message.trim()) {
                onSendMessage(message);
                setMessage('');
                setShowPlusMenu(false);
              }
            }}
            disabled={!message.trim()}
            style={{
              background: message.trim() ? 'var(--text)' : 'rgba(0,0,0,0.06)',
              color: message.trim() ? 'var(--bg)' : 'var(--text-muted)',
              border: 'none', borderRadius: '50%', width: '32px', height: '32px',
              cursor: message.trim() ? 'pointer' : 'not-allowed',
              fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
            title="Ξ‘Ο€ΞΏΟƒΟ„ΞΏΞ»Ξ® ΞΌΞ·Ξ½ΟΞΌΞ±Ο„ΞΏΟ‚"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•
   AGENT HUB β€” Settings Modal (Claude-inspired, 6 tabs)
   β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β• */

function AgentSettingsModal({ isOpen, onClose, initialTab = 'general' }: {
  isOpen: boolean; onClose: () => void; initialTab?: string;
}) {
  const [activeCategory, setActiveCategory] = useState(initialTab);
  const [generateMemory, setGenerateMemory] = useState(true);
  const [userName, setUserName] = useState('Agapitos Kalafatas');
  const [callName, setCallName] = useState('Agapitos');
  const [workDescription, setWorkDescription] = useState('Software Engineer & AI Solutions Architect');
  const [instructions, setInstructions] = useState('Prefer concise responses, direct TypeScript / SQL snippets, and structured markdown tables.');
  const [toolAccessMode, setToolAccessMode] = useState('Tools already loaded');
  const [connectorSearch, setConnectorSearch] = useState(true);
  const [switchModels, setSwitchModels] = useState(true);
  const [classifySessions, setClassifySessions] = useState(false);
  const [artifacts, setArtifacts] = useState(true);
  const [aiArtifacts, setAiArtifacts] = useState(true);
  const [inlineVisualizations, setInlineVisualizations] = useState(true);
  const [codeTheme, setCodeTheme] = useState('dark');
  const [codeFont, setCodeFont] = useState('Fira Code');
  const [interfaceFont, setInterfaceFont] = useState('Inter');
  const [transcriptSize, setTranscriptSize] = useState('Normal');
  const [transcriptWidth, setTranscriptWidth] = useState('Maximized');
  const [codeExecution, setCodeExecution] = useState(true);
  const [networkEgress, setNetworkEgress] = useState(false);
  const [branchPrefix, setBranchPrefix] = useState('agent/');
  const [autoPR, setAutoPR] = useState(false);
  const [autofixPR, setAutofixPR] = useState(true);

  if (!isOpen) return null;

  const navSectionHeader: React.CSSProperties = { fontSize: '10px', fontWeight: 'bold' as const, color: 'var(--text-muted)', padding: '12px 8px 4px 8px', letterSpacing: '0.5px' };
  const navItemStyle = (active: boolean): React.CSSProperties => ({ display: 'block', width: '100%', textAlign: 'left' as const, padding: '8px 10px', background: active ? 'rgba(0,102,204,0.1)' : 'transparent', border: 'none', borderRadius: '6px', color: active ? 'var(--text)' : 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', fontWeight: active ? '600' as const : 'normal' as const });
  const tabHeaderStyle: React.CSSProperties = { margin: '0 0 4px 0', fontSize: '22px', fontWeight: 'bold' as const, color: 'var(--text)' };
  const subTextStyle: React.CSSProperties = { margin: 0, fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' };
  const sectionContainer: React.CSSProperties = { marginTop: '24px', display: 'flex', flexDirection: 'column' as const };
  const sectionTitleStyle: React.CSSProperties = { fontSize: '15px', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '12px' };
  const labelStyle: React.CSSProperties = { fontSize: '14px', fontWeight: '600' as const, color: 'var(--text)', marginBottom: '2px' };
  const helpTextStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.4' };
  const selectStyle: React.CSSProperties = { padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px', outline: 'none' };
  const inputStyle: React.CSSProperties = { padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '13px', outline: 'none' };
  const checkboxStyle: React.CSSProperties = { width: '20px', height: '20px', accentColor: '#0066cc', cursor: 'pointer', marginTop: '2px' };

  const ToggleRow = ({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (c: boolean) => void }) => (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ paddingRight: '40px' }}><div style={labelStyle}>{label}</div><div style={helpTextStyle}>{description}</div></div>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={checkboxStyle} />
    </div>
  );

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '980px', height: '720px', background: 'var(--bg)', borderRadius: '16px', border: '1px solid var(--border)', display: 'flex', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.4)', color: 'var(--text)' }}>
        {/* Left Sidebar Navigation */}
        <div style={{ width: '240px', background: 'var(--bg-2)', borderRight: '1px solid var(--border)', padding: '20px 12px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          <div style={{ fontSize: '15px', fontWeight: 'bold', padding: '0 8px', color: 'var(--text)' }}>Ξ΅Ο…ΞΈΞΌΞ―ΟƒΞµΞΉΟ‚ Agent</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={navSectionHeader}>Ξ“Ξ•ΞΞ™ΞΞ‘</div>
            <button onClick={() => setActiveCategory('general')} style={navItemStyle(activeCategory === 'general')}>β™οΈ General</button>
            <button onClick={() => setActiveCategory('visuals')} style={navItemStyle(activeCategory === 'visuals')}>π¨ Appearance & Visuals</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={navSectionHeader}>CAPABILITIES</div>
            <button onClick={() => setActiveCategory('code')} style={navItemStyle(activeCategory === 'code')}>π’» Code & Execution</button>
            <button onClick={() => setActiveCategory('connectors')} style={navItemStyle(activeCategory === 'connectors')}>π” Connectors</button>
            <button onClick={() => setActiveCategory('security')} style={navItemStyle(activeCategory === 'security')}>π”’ Security & Tokens</button>
          </div>
          <button onClick={onClose} style={{ marginTop: 'auto', padding: '10px', background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}>β– ΞΞ»ΞµΞ―ΟƒΞΉΞΌΞΏ</button>
        </div>

        {/* Right Content Pane */}
        <div style={{ flex: 1, padding: '32px', overflowY: 'auto' }}>
          {activeCategory === 'general' && (
            <div>
              <h2 style={tabHeaderStyle}>General Settings</h2>
              <p style={subTextStyle}>Manage how the AI interacts with tools, models, and sessions.</p>
              <div style={sectionContainer}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div><label style={labelStyle}>Tool access mode</label><div style={helpTextStyle}>Controls how connector tools are loaded in new conversations.</div></div>
                  <select value={toolAccessMode} onChange={e => setToolAccessMode(e.target.value)} style={selectStyle}><option>Tools already loaded</option><option>Load on demand</option></select>
                </div>
                <ToggleRow label="Connector search" description="Let the AI search the connector directory and surface ones relevant to your conversation." checked={connectorSearch} onChange={setConnectorSearch} />
                <ToggleRow label="Switch models when flagged" description="When safeguards flag a message, automatically switch to a different model to keep chatting." checked={switchModels} onChange={setSwitchModels} />
                <ToggleRow label="Classify session states" description="Allow the Agent to automatically classify sessions as blocked, ready for review, or done." checked={classifySessions} onChange={setClassifySessions} />
              </div>
            </div>
          )}
          {activeCategory === 'visuals' && (
            <div>
              <h2 style={tabHeaderStyle}>Visuals & Appearance</h2>
              <p style={subTextStyle}>Customize the interface, typography, and how generated artifacts are displayed.</p>
              <div style={sectionContainer}>
                <h3 style={sectionTitleStyle}>Artifacts & Output</h3>
                <ToggleRow label="Artifacts" description="Generate code, documents, and designs in a dedicated window alongside your conversation." checked={artifacts} onChange={setArtifacts} />
                <ToggleRow label="AI-powered artifacts" description="Build apps and interactive documents that use the AI inside the artifact." checked={aiArtifacts} onChange={setAiArtifacts} />
                <ToggleRow label="Inline visualizations" description="Allow the Agent to generate interactive visualizations, charts, and diagrams directly in the conversation." checked={inlineVisualizations} onChange={setInlineVisualizations} />
              </div>
              <div style={sectionContainer}>
                <h3 style={sectionTitleStyle}>Interface & Typography</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div><label style={labelStyle}>Code appearance</label><div style={helpTextStyle}>Light or dark theme for code blocks.</div></div>
                  <select value={codeTheme} onChange={e => setCodeTheme(e.target.value)} style={selectStyle}><option value="dark">Dark Theme</option><option value="light">Light Theme</option></select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '16px' }}>
                  <div><label style={labelStyle}>Interface font</label><select value={interfaceFont} onChange={e => setInterfaceFont(e.target.value)} style={{...selectStyle, marginTop: '8px', width: '100%'}}><option>Inter</option><option>System Default</option><option>Roboto</option></select></div>
                  <div><label style={labelStyle}>Code font</label><select value={codeFont} onChange={e => setCodeFont(e.target.value)} style={{...selectStyle, marginTop: '8px', width: '100%'}}><option>Fira Code</option><option>JetBrains Mono</option><option>Consolas</option></select></div>
                  <div><label style={labelStyle}>Transcript text size</label><select value={transcriptSize} onChange={e => setTranscriptSize(e.target.value)} style={{...selectStyle, width: '100%'}}><option>Small</option><option>Normal</option><option>Large</option></select></div>
                  <div><label style={labelStyle}>Transcript width</label><select value={transcriptWidth} onChange={e => setTranscriptWidth(e.target.value)} style={{...selectStyle, width: '100%'}}><option>Standard</option><option>Wide</option><option>Maximized</option></select></div>
                </div>
              </div>
            </div>
          )}
          {activeCategory === 'code' && (
            <div>
              <h2 style={tabHeaderStyle}>Code Execution & Pull Requests</h2>
              <p style={subTextStyle}>Manage how the AI interacts with your local environment and repositories.</p>
              <div style={sectionContainer}>
                <h3 style={sectionTitleStyle}>Code Execution & File Creation</h3>
                <ToggleRow label="Code execution and file creation" description="The Agent can execute code and create and edit docs, spreadsheets, presentations, PDFs, and data reports." checked={codeExecution} onChange={setCodeExecution} />
                <ToggleRow label="Allow network egress β οΈ" description="Allow the Agent to access common package managers to install packages and libraries." checked={networkEgress} onChange={setNetworkEgress} />
              </div>
              <div style={sectionContainer}>
                <h3 style={sectionTitleStyle}>Pull Requests</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div><label style={labelStyle}>Branch prefix</label><div style={helpTextStyle}>Prefix added to branch names.</div></div>
                  <input type="text" value={branchPrefix} onChange={e => setBranchPrefix(e.target.value)} style={{...inputStyle, width: '200px'}} />
                </div>
                <ToggleRow label="Create pull requests automatically" description="When the AI pushes changes to a branch, it automatically opens a pull request." checked={autoPR} onChange={setAutoPR} />
                <ToggleRow label="Autofix pull requests" description="The AI automatically monitors PRs for CI failures and responds proactively." checked={autofixPR} onChange={setAutofixPR} />
              </div>
            </div>
          )}
          {activeCategory === 'connectors' && (
            <div>
              <h2 style={tabHeaderStyle}>Connectors</h2>
              <p style={subTextStyle}>Ξ£Ο…Ξ½Ξ΄Ξ­ΟƒΟ„Ξµ ΞµΞΎΟ‰Ο„ΞµΟΞΉΞΊΞ­Ο‚ Ο€Ξ»Ξ±Ο„Ο†ΟΟΞΌΞµΟ‚ Ξ³ΞΉΞ± Ξ±Ο…Ο„ΟΞΌΞ±Ο„Ξ· Ξ±Ξ½Ξ¬ΞΊΟ„Ξ·ΟƒΞ· Ξ΄ΞµΞ΄ΞΏΞΌΞ­Ξ½Ο‰Ξ½.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '20px' }}>
                {[
                  { name: 'GitHub Integration', status: 'Connected', icon: 'π™', type: 'Web' },
                  { name: 'Supabase Database', status: 'Connected', icon: 'β΅', type: 'Database' },
                  { name: 'Vercel Deployments', status: 'Connected', icon: 'β–²', type: 'Web' },
                  { name: 'Gmail Workspace', status: 'Disconnected', icon: 'π“§', type: 'Email' },
                  { name: 'Google Drive', status: 'Disconnected', icon: 'π“', type: 'Storage' },
                  { name: 'Railway App', status: 'Connected', icon: 'π‚', type: 'Web' },
                ].map((conn, idx) => (
                  <div key={idx} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '20px' }}>{conn.icon}</span>
                      <div><div style={{ fontWeight: '600', fontSize: '13px' }}>{conn.name}</div><div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{conn.type}</div></div>
                    </div>
                    <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: conn.status === 'Connected' ? 'rgba(16,185,129,0.12)' : 'rgba(0,0,0,0.06)', color: conn.status === 'Connected' ? '#10b981' : 'var(--text-muted)' }}>{conn.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {activeCategory === 'security' && (
            <div>
              <h2 style={tabHeaderStyle}>Security & Authorization</h2>
              <p style={subTextStyle}>Manage active sessions and application scopes.</p>
              <div style={sectionContainer}>
                <h3 style={sectionTitleStyle}>Authorization tokens</h3>
                <div style={helpTextStyle}>Created when you sign in to the Agent Hub. Revoke a token to sign out from that device.</div>
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-2)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div><div style={{ fontWeight: 'bold', fontSize: '14px' }}>Agent Hub Web Session</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Created: 18 Aug 2026 β€Ά Last used: Just now</div></div>
                    <button style={{ background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Revoke</button>
                  </div>
                </div>
              </div>
              <div style={sectionContainer}>
                <h3 style={sectionTitleStyle}>Application Scopes</h3>
                <div style={helpTextStyle}>Manage what data the connected applications have access to.</div>
                <div style={{ padding: '16px', background: 'var(--bg-2)', borderRadius: '8px', marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>No external applications are currently requesting scopes.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•
   AGENT HUB TAB β€” Full Layout (Sidebar + Header + Chat + Input)
   β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β•β• */

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
  const [hubApiKey, setHubApiKey] = useState(() => localStorage.getItem('hub_api_key') || '');
  const [hubModel, setHubModel] = useState(() => localStorage.getItem('hub_model') || 'gemini-3.6-flash');
  const [showHubSettings, setShowHubSettings] = useState(false);

  const GEMINI_MODELS = [
    { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (Latest)', desc: 'Ξ¤ΞΏ Ο€ΞΉΞΏ Ο€ΟΟΟƒΟ†Ξ±Ο„ΞΏ & Ο„Ξ±Ο‡Ο' },
    { value: 'gemini-3.6-pro', label: 'Gemini 3.6 Pro', desc: 'Ξ¤ΞΏ Ο€ΞΉΞΏ Ο€ΟΟΟƒΟ†Ξ±Ο„ΞΏ & Ξ­ΞΎΟ…Ο€Ξ½ΞΏ' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Ξ¤Ξ±Ο‡Ο, stable' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'ΞΞΎΟ…Ο€Ξ½ΞΏ, Ξ±ΟΞ³ΟΟ„ΞµΟΞΏ' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'Ξ“ΟΞ®Ξ³ΞΏΟΞΏ, Ο€Ξ±Ξ»Ξ±ΞΉΟΟ„ΞµΟΞΏ' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', desc: 'Ξ•Ξ»Ξ±Ο†ΟΟ, budget-friendly' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', desc: 'ΞΞ»Ξ±ΟƒΞΉΞΊΟ pro ΞΌΞΏΞ½Ο„Ξ­Ξ»ΞΏ' },
  ];

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
          api_key: hubApiKey || undefined,
          model: hubModel || undefined,
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
            messages: [...c.messages, { role: 'assistant', text: 'Ξ£Ο†Ξ¬Ξ»ΞΌΞ±: ' + (e.message || 'Ξ†Ξ³Ξ½Ο‰ΟƒΟ„ΞΏ ΟƒΟ†Ξ¬Ξ»ΞΌΞ±') }],
          };
        }
        return c;
      }));
    }
    setHubLoading(false);
  };

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* β•β•β• INNER SIDEBAR: Ξ™Ξ£Ξ¤ΞΞ΅Ξ™ΞΞ Ξ£Ξ¥ΞΞΞΞ™Ξ›Ξ™Ξ©Ξ β•β•β• */}
      <div style={{ width: '260px', borderRight: '1px solid var(--border)', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <button onClick={createNewConversation} style={{ width: '100%', padding: '10px', background: 'var(--text)', color: 'var(--bg)', borderRadius: '8px', fontWeight: '600', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px' }}>
            <Plus size={14} /> ΞΞ­Ξ± Ξ£Ο…Ξ½ΞΏΞΌΞΉΞ»Ξ―Ξ±
          </button>
        </div>

        <div style={{ padding: '12px', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', fontWeight: 600 }}>Ξ™ΟƒΟ„ΞΏΟΞΉΞΊΟ Ξ£Ο…Ξ½ΞΏΞΌΞΉΞ»ΞΉΟΞ½</div>
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => { setActiveConversationId(conv.id); setHubSelectedAgents(conv.selectedAgents); }}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: '4px',
                background: activeConversationId === conv.id ? 'rgba(0,102,204,0.1)' : 'transparent',
                border: 'none', borderRadius: '8px', cursor: 'pointer',
                color: activeConversationId === conv.id ? 'var(--text)' : 'var(--text-muted)',
                fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderLeft: activeConversationId === conv.id ? '3px solid var(--primary)' : '3px solid transparent',
              }}
            >
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontWeight: activeConversationId === conv.id ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                  π’¬ {conv.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{conv.messages.length} ΞΌΞ·Ξ½ΟΞΌΞ±Ο„Ξ± Β· {conv.updatedAt.toLocaleDateString('el-GR')}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', fontSize: '12px', opacity: 0.6 }}>π—‘οΈ</button>
            </div>
          ))}
          {conversations.length === 0 && (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px', padding: '20px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }}>
              Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ ΟƒΟ…Ξ½ΞΏΞΌΞΉΞ»Ξ―ΞµΟ‚.<br/>ΞΞµΞΊΞ―Ξ½Ξ± ΞΌΞΉΞ± Ξ½Ξ­Ξ±!
            </div>
          )}
        </div>

        {/* Settings Trigger */}
        <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setShowHubSettings(!showHubSettings)} style={{ width: '100%', textAlign: 'left', padding: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            β™οΈ Ξ΅Ο…ΞΈΞΌΞ―ΟƒΞµΞΉΟ‚ Agent
          </button>
        </div>
      </div>

      {/* β•β•β• KENTRIKO PARATHYRO CHAT β•β•β• */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* HEADER: Ξ•Ξ Ξ™Ξ›ΞΞ“Ξ— ΞΞΞΞ¤Ξ•Ξ›ΞΞ¥ */}
        <div style={{ padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Agent Hub</span>
            <span style={{ fontSize: '11px', background: 'rgba(16,185,129,0.12)', color: '#10b981', padding: '3px 10px', borderRadius: '12px' }}>
              {hubLoading ? 'β³ Processing...' : 'β— Online'}
            </span>
            {hubApiKey && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {GEMINI_MODELS.find(m => m.value === hubModel)?.label || hubModel}
              </span>
            )}
            {!hubApiKey && (
              <span style={{ fontSize: '11px', color: '#f59e0b' }}>
                β οΈ Ξ§Ο‰ΟΞ―Ο‚ API Key
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              value={hubModel}
              onChange={(e) => { setHubModel(e.target.value); localStorage.setItem('hub_model', e.target.value); }}
              style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', outline: 'none' }}
            >
              {GEMINI_MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <button onClick={() => setShowHubSettings(!showHubSettings)} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px', color: 'var(--text)' }} title="Ξ΅Ο…ΞΈΞΌΞ―ΟƒΞµΞΉΟ‚">β™οΈ</button>
          </div>
        </div>

        {/* API Key Settings Panel (toggled) */}
        {showHubSettings && (
          <div style={{ padding: '16px 24px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>β™οΈ Ξ΅Ο…ΞΈΞΌΞ―ΟƒΞµΞΉΟ‚ API & ΞΞΏΞ½Ο„Ξ­Ξ»ΞΏΟ…</div>
            <div className="drawer-field">
              <label style={{ fontWeight: 500, fontSize: '12px' }}>Google Gemini API Key</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="password" value={hubApiKey} onChange={(e) => { setHubApiKey(e.target.value); localStorage.setItem('hub_api_key', e.target.value); }} placeholder="AIzaSy..." style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)' }} />
                {hubApiKey && <button onClick={() => { setHubApiKey(''); localStorage.removeItem('hub_api_key'); }} style={{ padding: '6px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)' }}>ΞΞ±ΞΈΞ±ΟΞΉΟƒΞΌΟΟ‚</button>}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Ξ›Ξ®ΟΞ· Ξ±Ο€Ο: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Google AI Studio</a> Β· Ξ¤ΞΏ ΞΊΞ»ΞµΞΉΞ΄Ξ― Ξ±Ο€ΞΏΞΈΞ·ΞΊΞµΟΞµΟ„Ξ±ΞΉ ΞΌΟΞ½ΞΏ ΟƒΟ„ΞΏΞ½ browser ΟƒΞΏΟ…
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(0,102,204,0.08)', padding: '8px 12px', borderRadius: '8px' }}>
              π’΅ <strong>Ξ ΟΟ‚ Ξ΄ΞΏΟ…Ξ»ΞµΟΞµΞΉ:</strong> Ξ¤ΞΏ API key ΟƒΞΏΟ… Ο‡ΟΞ·ΟƒΞΉΞΌΞΏΟ€ΞΏΞΉΞµΞ―Ο„Ξ±ΞΉ Ξ±Ο€ΞµΟ…ΞΈΞµΞ―Ξ±Ο‚ ΟƒΟ„Ξ· ΞΊΞ»Ξ®ΟƒΞ· Ο€ΟΞΏΟ‚ Google. Ξ”ΞµΞ½ Ξ±Ο€ΞΏΞΈΞ·ΞΊΞµΟΞµΟ„Ξ±ΞΉ ΟƒΟ„ΞΏΞ½ server.
            </div>
          </div>
        )}

        {/* AGENT SELECTOR (multi-agent checkboxes) */}
        <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Agents:</span>
          {agents.filter(a => a.status === 'active').map((a) => (
            <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text)', cursor: 'pointer', padding: '3px 8px', borderRadius: '12px', background: hubSelectedAgents.includes(a.id) ? 'rgba(0,102,204,0.12)' : 'rgba(0,0,0,0.04)' }}>
              <input type="checkbox" checked={hubSelectedAgents.includes(a.id)} onChange={() => toggleAgentInConversation(a.id)} style={{ accentColor: '#0066cc' }} />
              <span>{a.name}</span>
            </label>
          ))}
        </div>

        {/* MESSAGE FEED */}
        {activeConversationId ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {hubMessages.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', maxWidth: '800px', width: '100%', margin: '0 auto', flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                {/* Avatar */}
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: m.role === 'assistant' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--bg-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0, border: '1px solid var(--border)' }}>
                  {m.role === 'assistant' ? 'π¤–' : 'π‘¤'}
                </div>
                {/* Message Bubble */}
                <div style={{
                  background: m.role === 'user' ? 'var(--bg-2)' : 'transparent',
                  padding: m.role === 'user' ? '12px 16px' : '6px 0',
                  borderRadius: '12px', fontSize: '14px', lineHeight: '1.7', color: 'var(--text)',
                  flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {hubLoading && (
              <div style={{ display: 'flex', gap: '12px', maxWidth: '800px', width: '100%', margin: '0 auto' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>π¤–</div>
                <div style={{ padding: '12px 16px', background: 'var(--bg-2)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>
                  Ξ£ΞΊΞ­Ο†Ο„ΞΏΞΌΞ±ΞΉ<span className="dot-anim">...</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        ) : (
          /* EMPTY STATE */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '40px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>π¤–</div>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>Ξ“ΞµΞΉΞ± ΟƒΞΏΟ…! Ξ•Ξ―ΞΌΞ±ΞΉ ΞΏ AI Agent</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '400px', margin: 0 }}>
              Ξ ΟΟ‚ ΞΌΟ€ΞΏΟΟ Ξ½Ξ± ΟƒΞ±Ο‚ Ξ²ΞΏΞ·ΞΈΞ®ΟƒΟ‰ ΟƒΞ®ΞΌΞµΟΞ±; Ξ”ΞΏΞΊΞΉΞΌΞ¬ΟƒΟ„Ξµ ΞΌΞ―Ξ± Ξ±Ο€Ο Ο„ΞΉΟ‚ Ο€Ξ±ΟΞ±ΞΊΞ¬Ο„Ο‰ ΞµΞ½Ξ­ΟΞ³ΞµΞΉΞµΟ‚:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
              {[
                'π“ Ξ‘Ξ½Ξ¬Ξ»Ο…ΟƒΞ· Ο„Ο‰Ξ½ Leads ΞΌΞΏΟ…',
                'π“‹ Ξ”Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ―Ξ± Report Ξ³ΞΉΞ± Market RAG',
                'π” Ξ’ΟΞµΟ‚ Ξ½Ξ­Ξ± B2B leads ΟƒΟ„Ξ·Ξ½ Ξ‘Ο„Ο„ΞΉΞΊΞ®',
                'π’° Ξ¤ΞΉΞΌΞ­Ο‚ ΟΞµΟΞΌΞ±Ο„ΞΏΟ‚ ΟƒΞ®ΞΌΞµΟΞ±',
                'π“§ Ξ£Ο„ΞµΞ―Ξ»Ξµ email ΟƒΞµ lead',
              ].map((suggestion, idx) => (
                <button key={idx} onClick={() => { setHubInput(suggestion); createNewConversation(); }} style={{
                  padding: '8px 16px', background: 'var(--bg-2)', border: '1px solid var(--border)',
                  borderRadius: '20px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)',
                  transition: 'all 0.2s',
                }}>
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* INPUT TOOLBAR */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <AgentChatInputToolbar
            onSendMessage={(msg) => { setHubInput(msg); setTimeout(() => sendMessage(), 100); }}
            onOpenSettings={(tab) => setShowHubSettings(true)}
          />
          <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Ξ Agent Hub ΞΌΟ€ΞΏΟΞµΞ― Ξ½Ξ± ΞΊΞ¬Ξ½ΞµΞΉ Ξ»Ξ¬ΞΈΞ·. Ξ Ξ±ΟΞ±ΞΊΞ±Ξ»Ο ΞµΞ»Ξ­Ξ³Ο‡ΞµΟ„Ξµ Ο„ΞΉΟ‚ Ο€Ξ»Ξ·ΟΞΏΟ†ΞΏΟΞ―ΞµΟ‚.
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AgentSettingsModal isOpen={showHubSettings} onClose={() => setShowHubSettings(false)} />
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
    setToast({ msg: 'Ξ”Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ―Ξ± Ξ±Ξ½Ξ±Ο†ΞΏΟΞ¬Ο‚...', type: 'info' });
    try {
      const { data, error } = await supabase.functions.invoke('orchestrator', {
        body: { mode: 'report', report_type: reportType, agent_id: agentId },
      });
      if (error) throw error;
      setToast({ msg: 'Ξ— Ξ±Ξ½Ξ±Ο†ΞΏΟΞ¬ Ξ΄Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ®ΞΈΞ·ΞΊΞµ!', type: 'success' });
      loadReports();
      if (data.report) setSelectedReport({ content: data.report, title: reportType === 'master' ? 'Master Report' : `Agent Report`, metrics: data.metrics });
    } catch (e: any) {
      setToast({ msg: 'Ξ£Ο†Ξ¬Ξ»ΞΌΞ±: ' + e.message, type: 'info' });
    }
    setGenerating(false);
  };

  const markAsRead = async (report: any) => {
    await supabase.from('agent_reports').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', report.id);
    setToast({ msg: 'Ξ— Ξ±Ξ½Ξ±Ο†ΞΏΟΞ¬ ΟƒΞ·ΞΌΞ¬Ξ½ΞΈΞ·ΞΊΞµ Ο‰Ο‚ Ξ±Ξ½Ξ±Ξ³Ξ½Ο‰ΟƒΞΌΞ­Ξ½Ξ·.', type: 'success' });
    loadReports();
  };

  const deleteReport = async (reportId: string) => {
    if (!confirm('Ξ•Ξ―ΟƒΞ±ΞΉ ΟƒΞ―Ξ³ΞΏΟ…ΟΞΏΟ‚ ΟΟ„ΞΉ ΞΈΞ­Ξ»ΞµΞΉΟ‚ Ξ½Ξ± Ξ΄ΞΉΞ±Ξ³ΟΞ¬ΟΞµΞΉΟ‚ Ξ±Ο…Ο„Ξ® Ο„Ξ·Ξ½ Ξ±Ξ½Ξ±Ο†ΞΏΟΞ¬;')) return;
    await supabase.from('agent_reports').delete().eq('id', reportId);
    setSelectedReport(null);
    setToast({ msg: 'Ξ— Ξ±Ξ½Ξ±Ο†ΞΏΟΞ¬ Ξ΄ΞΉΞ±Ξ³ΟΞ¬Ο†Ξ·ΞΊΞµ.', type: 'success' });
    loadReports();
  };

  const saveNotes = async () => {
    if (!selectedReport) return;
    await supabase.from('agent_reports').update({ notes: reportNotes }).eq('id', selectedReport.id);
    setToast({ msg: 'ΞΞΉ ΟƒΞ·ΞΌΞµΞΉΟΟƒΞµΞΉΟ‚ Ξ±Ο€ΞΏΞΈΞ·ΞΊΞµΟΟ„Ξ·ΞΊΞ±Ξ½.', type: 'success' });
  };

  const updatePriority = async (priority: string) => {
    if (!selectedReport) return;
    await supabase.from('agent_reports').update({ priority }).eq('id', selectedReport.id);
    setReportPriority(priority);
    setToast({ msg: `Ξ— Ο€ΟΞΏΟ„ΞµΟΞ±ΞΉΟΟ„Ξ·Ο„Ξ± Ξ¬Ξ»Ξ»Ξ±ΞΎΞµ ΟƒΞµ ${priority}.`, type: 'success' });
    loadReports();
  };

  const unreadCount = reports.filter(r => !r.is_read).length;

  return (
    <div className="dash-content reports-tab">
      <div className="dash-content-header">
        <p>Ξ‘Ξ½Ξ±Ο†ΞΏΟΞ­Ο‚ Ξ±Ο€ΟΞ΄ΞΏΟƒΞ·Ο‚ AI agents ΞΊΞ±ΞΉ Master Orchestrator summary. {unreadCount > 0 && <span style={{ color: '#e74c3c', fontWeight: 600 }}>({unreadCount} ΞΌΞ· Ξ±Ξ½Ξ±Ξ³Ξ½Ο‰ΟƒΞΌΞ­Ξ½ΞµΟ‚)</span>}</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={loadReports} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spin' : ''} /> Ξ‘Ξ½Ξ±Ξ½Ξ­Ο‰ΟƒΞ·
          </button>
          <button className="btn btn-primary" onClick={() => generateReport('master')} disabled={generating}>
            <FileText size={16} /> Master Report
          </button>
        </div>
      </div>

      <div className="reports-layout">
        <div className="reports-sidebar">
          <h3>Ξ‘Ο€ΞΏΞΈΞ·ΞΊΞµΟ…ΞΌΞ­Ξ½ΞµΟ‚ Ξ‘Ξ½Ξ±Ο†ΞΏΟΞ­Ο‚</h3>
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
                <span>{new Date(r.created_at).toLocaleDateString('el-GR')} Β· {r.report_type}</span>
                {!r.is_read && <span className="report-is-read unread" style={{ marginLeft: '6px' }}>β—</span>}
              </div>
            </div>
          ))}
          {reports.length === 0 && <p className="dash-empty">Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ Ξ±Ξ½Ξ±Ο†ΞΏΟΞ­Ο‚.</p>}
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
                      {selectedReport.priority === 'high' ? 'Ξ¥ΟΞ·Ξ»Ξ®' : selectedReport.priority === 'low' ? 'Ξ§Ξ±ΞΌΞ·Ξ»Ξ®' : 'ΞΞ±Ξ½ΞΏΞ½ΞΉΞΊΞ®'}
                    </span>
                  </div>
                </div>
                <div className="report-actions">
                  <select 
                    className="dash-status-select" 
                    value={selectedReport.priority || 'normal'} 
                    onChange={(e) => updatePriority(e.target.value)}
                  >
                    <option value="low">Ξ§Ξ±ΞΌΞ·Ξ»Ξ® Ξ ΟΞΏΟ„ΞµΟΞ±ΞΉΟΟ„Ξ·Ο„Ξ±</option>
                    <option value="normal">ΞΞ±Ξ½ΞΏΞ½ΞΉΞΊΞ®</option>
                    <option value="high">Ξ¥ΟΞ·Ξ»Ξ® Ξ ΟΞΏΟ„ΞµΟΞ±ΞΉΟΟ„Ξ·Ο„Ξ±</option>
                  </select>
                  <button className="report-action-btn" onClick={() => markAsRead(selectedReport)}>
                    <Eye size={14} /> {selectedReport.is_read ? 'Ξ‘Ξ½Ξ±Ξ³Ξ½Ο‰ΟƒΞΌΞ­Ξ½Ξ·' : 'Ξ£Ξ®ΞΌΞ±Ξ½ΟƒΞ· Ο‰Ο‚ Ξ‘Ξ½Ξ±Ξ³Ξ½Ο‰ΟƒΞΌΞ­Ξ½Ξ·'}
                  </button>
                  <button className="report-action-btn delete" onClick={() => deleteReport(selectedReport.id)}>
                    <Trash2 size={14} /> Ξ”ΞΉΞ±Ξ³ΟΞ±Ο†Ξ®
                  </button>
                </div>
              </div>
              
              {selectedReport.metrics && (
                <div className="report-metrics">
                  <div><strong>{selectedReport.metrics.total_agents}</strong><span>Agents</span></div>
                  <div><strong>{selectedReport.metrics.total_leads}</strong><span>Leads</span></div>
                  <div><strong>{selectedReport.metrics.total_meetings}</strong><span>Ξ΅Ξ±Ξ½Ο„ΞµΞ²ΞΏΟ</span></div>
                </div>
              )}
              
              <div className="report-content">{selectedReport.content}</div>
              
              <div className="report-notes">
                <h4 style={{ margin: '0 0 8px', fontSize: '13px', color: 'var(--text-muted)' }}>Ξ£Ξ·ΞΌΞµΞΉΟΟƒΞµΞΉΟ‚</h4>
                <textarea 
                  value={reportNotes} 
                  onChange={(e) => setReportNotes(e.target.value)}
                  placeholder="Ξ ΟΞΏΟƒΞΈΞ­ΟƒΟ„Ξµ ΟƒΞ·ΞΌΞµΞΉΟΟƒΞµΞΉΟ‚ Ξ³ΞΉΞ± Ξ±Ο…Ο„Ξ® Ο„Ξ·Ξ½ Ξ±Ξ½Ξ±Ο†ΞΏΟΞ¬..."
                />
                <button className="btn btn-secondary" onClick={saveNotes} style={{ marginTop: '8px' }}>
                  Ξ‘Ο€ΞΏΞΈΞ®ΞΊΞµΟ…ΟƒΞ· Ξ£Ξ·ΞΌΞµΞΉΟΟƒΞµΟ‰Ξ½
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
              <p>Ξ•Ο€ΞΉΞ»Ξ­ΞΎΟ„Ξµ ΞΌΞΉΞ± Ξ±Ξ½Ξ±Ο†ΞΏΟΞ¬ Ξ® Ξ΄Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ®ΟƒΟ„Ξµ ΞΌΞΉΞ± Ξ½Ξ­Ξ±.</p>
              <div className="report-generate-grid">
                <button className="btn btn-primary" onClick={() => generateReport('master')} disabled={generating}>
                  <Sparkles size={16} /> Master Report (ΞΞ»ΞΏΞΉ ΞΏΞΉ Agents)
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
  const [newUser, setNewUser] = useState({ full_name: '', role: 'sales', phone: '', email: '', password: '' });
  const [editingUser, setEditingUser] = useState<CrmUser | null>(null);

  const roleLabels: Record<string, string> = {
    admin: 'Ξ”ΞΉΞ±Ο‡ΞµΞΉΟΞΉΟƒΟ„Ξ®Ο‚',
    management: 'Ξ”ΞΉΞΏΞ―ΞΊΞ·ΟƒΞ·',
    sales: 'Ξ Ο‰Ξ»Ξ®ΟƒΞµΞΉΟ‚',
    hr: 'Ξ‘Ξ½ΞΈΟΟΟ€ΞΉΞ½ΞΏ Ξ”Ο…Ξ½Ξ±ΞΌΞΉΞΊΟ',
    it: 'Ξ¤ΞµΟ‡Ξ½ΞΏΞ»ΞΏΞ³Ξ―Ξ±',
    secretary: 'Ξ“ΟΞ±ΞΌΞΌΞ±Ο„ΞµΞ―Ξ±',
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
      setToast({ msg: `Ξ Ο‡ΟΞ®ΟƒΟ„Ξ·Ο‚ ${user.is_active ? 'Ξ±Ο€ΞµΞ½ΞµΟΞ³ΞΏΟ€ΞΏΞΉΞ®ΞΈΞ·ΞΊΞµ' : 'ΞµΞ½ΞµΟΞ³ΞΏΟ€ΞΏΞΉΞ®ΞΈΞ·ΞΊΞµ'}.`, type: 'success' });
      loadData();
    }
  };

  const updateUserRole = async (user: CrmUser, newRole: string) => {
    const { error } = await supabase.from('crm_users').update({ role: newRole }).eq('id', user.id);
    if (!error) {
      setToast({ msg: `Ξ ΟΟΞ»ΞΏΟ‚ ΞµΞ½Ξ·ΞΌΞµΟΟΞΈΞ·ΞΊΞµ ΟƒΞµ ${roleLabels[newRole]}.`, type: 'success' });
      loadData();
    }
  };

  const updateUserMaxLeads = async (user: CrmUser, maxLeads: number) => {
    const { error } = await supabase.from('crm_users').update({ max_leads: maxLeads }).eq('id', user.id);
    if (!error) {
      setToast({ msg: `Ξ¤ΞΏ ΞΌΞ­Ξ³ΞΉΟƒΟ„ΞΏ Ο€Ξ»Ξ®ΞΈΞΏΟ‚ leads ΞµΞ½Ξ·ΞΌΞµΟΟΞΈΞ·ΞΊΞµ.`, type: 'success' });
      loadData();
    }
  };

  return (
    <div className="dash-content">
      <div className="dash-content-header">
        <p>Ξ”ΞΉΞ±Ο‡ΞµΞ―ΟΞΉΟƒΞ· Ο‡ΟΞ·ΟƒΟ„ΟΞ½ CRM ΞΌΞµ ΟΟΞ»ΞΏΟ…Ο‚ ΞΊΞ±ΞΉ Ξ±Ο…Ο„ΟΞΌΞ±Ο„Ξ· ΞΊΞ±Ο„Ξ±Ξ½ΞΏΞΌΞ® leads ΟƒΟ„ΞΏΟ…Ο‚ Ο€Ο‰Ξ»Ξ·Ο„Ξ­Ο‚.</p>
        <button className="btn btn-primary" onClick={() => setShowAddUser(!showAddUser)}>
          <Plus size={16} /> ΞΞ­ΞΏΟ‚ Ξ§ΟΞ®ΟƒΟ„Ξ·Ο‚
        </button>
      </div>

      {showAddUser && (
        <div className="dash-add-form">
          <input placeholder="Ξ Ξ»Ξ®ΟΞµΟ‚ ΟΞ½ΞΏΞΌΞ±" value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} />
          <select value={newUser.role} onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
            <option value="sales">Ξ Ο‰Ξ»Ξ®ΟƒΞµΞΉΟ‚</option>
            <option value="secretary">Ξ“ΟΞ±ΞΌΞΌΞ±Ο„ΞµΞ―Ξ±</option>
            <option value="hr">Ξ‘Ξ½ΞΈΟΟΟ€ΞΉΞ½ΞΏ Ξ”Ο…Ξ½Ξ±ΞΌΞΉΞΊΟ</option>
            <option value="it">Ξ¤ΞµΟ‡Ξ½ΞΏΞ»ΞΏΞ³Ξ―Ξ±</option>
            <option value="management">Ξ”ΞΉΞΏΞ―ΞΊΞ·ΟƒΞ·</option>
            <option value="admin">Ξ”ΞΉΞ±Ο‡ΞµΞΉΟΞΉΟƒΟ„Ξ®Ο‚</option>
          </select>
          <input placeholder="Ξ¤Ξ·Ξ»Ξ­Ο†Ο‰Ξ½ΞΏ" value={newUser.phone} onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })} />
          <input placeholder="Email" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
          <input placeholder="ΞΟ‰Ξ΄ΞΉΞΊΟΟ‚" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
          <button className="btn btn-primary" onClick={async () => {
            if (!newUser.full_name || !newUser.email || !newUser.password) return;
            const { error } = await supabase.rpc('create_crm_user', {
              p_full_name: newUser.full_name,
              p_role: newUser.role,
              p_phone: newUser.phone,
              p_email: newUser.email,
              p_password: newUser.password,
            });
            if (error) { setToast({ msg: 'Ξ£Ο†Ξ¬Ξ»ΞΌΞ±: ' + error.message, type: 'info' }); return; }
            setNewUser({ full_name: '', role: 'sales', phone: '', email: '', password: '' });
            setShowAddUser(false);
            loadData();
            setToast({ msg: 'Ξ Ο‡ΟΞ®ΟƒΟ„Ξ·Ο‚ Ξ΄Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ®ΞΈΞ·ΞΊΞµ.', type: 'success' });
          }}>Ξ”Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ―Ξ±</button>
        </div>
      )}

      <div className="dash-users-stats">
        <div className="dash-stat-card">
          <div className="dash-stat-icon"><Users size={20} /></div>
          <div><strong>{crmUsers.length}</strong><span>Ξ£ΟΞ½ΞΏΞ»ΞΏ Ξ§ΟΞ·ΟƒΟ„ΟΞ½</span></div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon"><CheckCircle2 size={20} /></div>
          <div><strong>{crmUsers.filter(u => u.is_active).length}</strong><span>Ξ•Ξ½ΞµΟΞ³ΞΏΞ―</span></div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon"><Bot size={20} /></div>
          <div><strong>{crmUsers.filter(u => u.role === 'sales').length}</strong><span>Ξ Ο‰Ξ»Ξ·Ο„Ξ­Ο‚</span></div>
        </div>
        <div className="dash-stat-card">
          <div className="dash-stat-icon"><TrendingUp size={20} /></div>
          <div><strong>{leads.filter(l => !l.deleted_at && l.assigned_to).length}</strong><span>ΞΞ±Ο„Ξ±Ξ½ΞµΞΌΞ·ΞΌΞ­Ξ½Ξ± Leads</span></div>
        </div>
      </div>

      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>ΞΞ½ΞΏΞΌΞ±</th><th>Ξ΅ΟΞ»ΞΏΟ‚</th><th>Ξ¤Ξ·Ξ»Ξ­Ο†Ο‰Ξ½ΞΏ</th><th>Leads</th><th>ΞΞ­Ξ³. Leads</th><th>ΞΞ±Ο„Ξ¬ΟƒΟ„Ξ±ΟƒΞ·</th><th>Ξ•Ξ½Ξ­ΟΞ³ΞµΞΉΞ±</th>
            </tr>
          </thead>
          <tbody>
            {crmUsers.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.full_name || 'Ξ§Ο‰ΟΞ―Ο‚ ΟΞ½ΞΏΞΌΞ±'}</strong></td>
                <td>
                  <select 
                    className="dash-status-select" 
                    value={u.role} 
                    onChange={(e) => updateUserRole(u, e.target.value)}
                    style={{ borderLeft: `3px solid ${roleColors[u.role] || '#666'}` }}
                  >
                    <option value="admin">Ξ”ΞΉΞ±Ο‡ΞµΞΉΟΞΉΟƒΟ„Ξ®Ο‚</option>
                    <option value="management">Ξ”ΞΉΞΏΞ―ΞΊΞ·ΟƒΞ·</option>
                    <option value="sales">Ξ Ο‰Ξ»Ξ®ΟƒΞµΞΉΟ‚</option>
                    <option value="hr">Ξ‘Ξ½ΞΈΟΟΟ€ΞΉΞ½ΞΏ Ξ”Ο…Ξ½Ξ±ΞΌΞΉΞΊΟ</option>
                    <option value="it">Ξ¤ΞµΟ‡Ξ½ΞΏΞ»ΞΏΞ³Ξ―Ξ±</option>
                    <option value="secretary">Ξ“ΟΞ±ΞΌΞΌΞ±Ο„ΞµΞ―Ξ±</option>
                  </select>
                </td>
                <td>{u.phone || 'β€”'}</td>
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
                    {u.is_active ? 'Ξ•Ξ½ΞµΟΞ³ΟΟ‚' : 'Ξ‘Ξ½ΞµΞ½ΞµΟΞ³ΟΟ‚'}
                  </span>
                </td>
                <td>
                  <div className="dash-lead-actions">
                    <button className="dash-agent-toggle" onClick={() => toggleUserActive(u)}>
                      {u.is_active ? 'Ξ‘Ο€ΞµΞ½ΞµΟΞ³ΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ·' : 'Ξ•Ξ½ΞµΟΞ³ΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ·'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {crmUsers.length === 0 && <p className="dash-empty">Ξ”ΞµΞ½ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ Ο‡ΟΞ®ΟƒΟ„ΞµΟ‚. Ξ ΟΞΏΟƒΞΈΞ­ΟƒΟ„Ξµ Ο„ΞΏΞ½ Ο€ΟΟΟ„ΞΏ ΟƒΞ±Ο‚ Ο‡ΟΞ®ΟƒΟ„Ξ·.</p>}
      </div>
    </div>
  );
}
function B2BScraperTab({ toast, setToast }: {
  toast: { msg: string; type: 'success' | 'info' } | null;
  setToast: (v: { msg: string; type: 'success' | 'info' } | null) => void;
}) {
  const [scrapeConfig, setScrapeConfig] = useState({
    category: 'energy',
    region: '',
    maxResults: 50,
    source: 'auto',
    importToDb: false,
    apifyToken: '',
    googleApiKey: '',
  });
  const [scraping, setScraping] = useState(false);
  const [scrapeResults, setScrapeResults] = useState<any[]>([]);
  const [scrapeSourceInfo, setScrapeSourceInfo] = useState<any>(null);
  const [scrapeHistory, setScrapeHistory] = useState<any[]>([]);
  const [selectedForImport, setSelectedForImport] = useState<Set<number>>(new Set());
  const [showApiConfig, setShowApiConfig] = useState(false);

  const categories = [
    { value: 'energy', label: 'Εταιρείες Ενέργειας' },
    { value: 'solar', label: 'Φωτοβολταϊκά & Solar' },
    { value: 'ev_charging', label: 'Σταθμοί Φόρτισης EV' },
    { value: 'real_estate', label: 'Ακίνητα & Μεσιτικά' },
    { value: 'construction', label: 'Κατασκευαστικές & Εργοληπτικές' },
    { value: 'restaurant', label: 'Εστιατόρια & Ταβέρνες' },
    { value: 'hotel', ξενοδοχεία: 'Ξενοδοχεία & Ενοικιαζόμενα' },
    { value: 'retail', label: 'Λιανικό Εμπόριο & Καταστήματα' },
    { value: 'technology', label: 'Τεχνολογία & Software' },
    { value: 'healthcare', label: 'Υγεία & Ιατρικά' },
    { value: 'automotive', label: 'Αυτοκίνητο & Επισκευές' },
    { value: 'professional', label: 'Επαγγελματικές Υπηρεσίες' },
    { value: 'education', label: 'Εκπαίδευση & Φροντιστήρια' },
    { value: 'fitness', label: 'Γυμναστήρια & Sports' },
    { value: 'beauty', label: 'Ομορφιά & Salon' },
    { value: 'logistics', label: 'Μεταφορές & Logistics' },
    { value: 'bakery', label: 'Φούρνοι & Αρτοποιεία' },
    { value: 'manufacturing', label: 'Βιομηχανία & Παραγωγή' },
    { value: 'agriculture', label: 'Γεωργία & Αγροκτήματα' },
    { value: 'other', label: 'Άλλες Επιχειρήσεις' },
  ];

  const sources = [
    { value: 'auto', label: 'Αυτόματο (όλες οι πηγές)', desc: 'Apify → Google Places → Custom Search' },
    { value: 'apify', label: 'Apify (Google Maps Scraper)', desc: 'Αυθεντικά δεδομένα Google Maps' },
    { value: 'google_places', label: 'Google Places API', desc: 'Nearby Search API' },
    { value: 'google_search', label: 'Google Custom Search', desc: 'Web search results' },
  ];

  const greekRegions = [
    'Αττική', 'Θεσσαλονίκη', 'Κεντρική Ελλάδα', 'Πελοπόννησος',
    'Κρήτη', 'Ιόνια Νησιά', 'Θεσσαλία', 'Ήπειρος',
    'Δυτική Ελλάδα', 'Στερεά Ελλάδα', 'Νησιά Αιγαίου', 'Δυτική Μακεδονία',
    'Ανατολική Μακεδονία & Θράκη', 'Βόρειο Αιγαίο',
  ];

  const loadSavedConfig = async () => {
    const { data } = await supabase.from('crm_settings').select('value').eq('key', 'scraper_apify_token').single();
    if (data?.value?.token && !scrapeConfig.apifyToken) {
      setScrapeConfig(prev => ({ ...prev, apifyToken: data.value.token }));
    }
    const { data: gData } = await supabase.from('crm_settings').select('value').eq('key', 'scraper_google_key').single();
    if (gData?.value?.key && !scrapeConfig.googleApiKey) {
      setScrapeConfig(prev => ({ ...prev, googleApiKey: gData.value.key }));
    }
  };

  useEffect(() => { loadSavedConfig(); }, []);

  const startScrape = async () => {
    setScraping(true);
    setToast({ msg: 'Εκκίνηση B2B scraping...', type: 'info' });

    try {
      const { data, error } = await supabase.functions.invoke('scrape-b2b', {
        body: {
          category: scrapeConfig.category,
          region: scrapeConfig.region,
          maxResults: scrapeConfig.maxResults,
          source: scrapeConfig.source,
          importToDb: false,
          apifyToken: scrapeConfig.apifyToken,
          googleApiKey: scrapeConfig.googleApiKey,
        },
      });

      if (error) throw error;

      if (data?.businesses) {
        setScrapeResults(data.businesses);
        setScrapeSourceInfo(data.source_info);
        setScrapeHistory(prev => [...prev, {
          date: new Date(),
          category: scrapeConfig.category,
          region: scrapeConfig.region || 'Όλη Ελλάδα',
          source: data.source_info?.api || scrapeConfig.source,
          count: data.businesses.length,
        }]);
        setToast({ msg: `Βρέθηκαν ${data.businesses.length} B2B leads (${data.source_info?.api})!`, type: 'success' });
      } else if (data?.error) {
        setToast({ msg: data.error, type: 'info' });
      }
    } catch (err: any) {
      setToast({ msg: `Σφάλμα scraping: ${err.message}`, type: 'info' });
    } finally {
      setScraping(false);
    }
  };

  const saveApiConfig = async () => {
    await supabase.from('crm_settings').upsert({ key: 'scraper_apify_token', value: { token: scrapeConfig.apifyToken }, category: 'scraper' });
    await supabase.from('crm_settings').upsert({ key: 'scraper_google_key', value: { key: scrapeConfig.googleApiKey }, category: 'scraper' });
    setToast({ msg: 'API keys αποθηκεύτηκαν!', type: 'success' });
    setShowApiConfig(false);
  };

  const exportToCsv = () => {
    if (scrapeResults.length === 0) return;
    const headers = ['Εταιρεία', 'Κατηγορία', 'Περιοχή', 'Τηλέφωνο', 'Email', 'Ιστοσελίδα', 'Διεύθυνση', 'Πηγή', 'Αξιολόγηση', 'Reviews'];
    const rows = scrapeResults.map(r => [
      r.company, r.category, r.region, r.phone, r.email, r.website, r.address, r.source, r.rating || '', r.totalReviews || ''
    ]);

    const BOM = '\uFEFF';
    const csv = BOM + [headers.join(','), ...rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `b2b_leads_${scrapeConfig.category}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ msg: `CSV εξάχθηκε! (${scrapeResults.length} γραμμές)`, type: 'success' });
  };

  const importSelectedToDb = async () => {
    const toImport = scrapeResults.filter((_, i) => selectedForImport.size === 0 || selectedForImport.has(i));
    if (toImport.length === 0) { setToast({ msg: 'Επιλέξτε leads για εισαγωγή', type: 'info' }); return; }

    setToast({ msg: `Εισαγωγή ${toImport.length} leads...`, type: 'info' });

    try {
      const { data, error } = await supabase.functions.invoke('scrape-b2b', {
        body: {
          category: scrapeConfig.category,
          region: scrapeConfig.region,
          maxResults: toImport.length,
          source: scrapeConfig.source,
          importToDb: true,
          apifyToken: scrapeConfig.apifyToken,
          googleApiKey: scrapeConfig.googleApiKey,
        },
      });

      if (error) throw error;
      setToast({ msg: `${data?.imported || toImport.length} leads εισήχθησαν στη βάση!`, type: 'success' });
      setSelectedForImport(new Set());
    } catch (err: any) {
      setToast({ msg: `Σφάλμα εισαγωγής: ${err.message}`, type: 'info' });
    }
  };

  const toggleSelectAll = () => {
    if (selectedForImport.size === scrapeResults.length) {
      setSelectedForImport(new Set());
    } else {
      setSelectedForImport(new Set(scrapeResults.map((_, i) => i)));
    }
  };

  const hasApiKeys = !!(scrapeConfig.apifyToken || scrapeConfig.googleApiKey);

  return (
    <div className="dash-content">
      <div className="dash-content-header">
        <p>Αυτοματοποιημένη συλλογή B2B leads από Google Maps και web sources. Real δεδομένα εταιρειών με GDPR-compliant lawful basis.</p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-ghost" onClick={() => setShowApiConfig(!showApiConfig)}>
            <Settings size={16} /> API Keys
          </button>
          <button className="btn btn-primary" onClick={startScrape} disabled={scraping || !hasApiKeys}>
            <Radar size={16} className={scraping ? 'spin' : ''} /> {scraping ? 'Scraping...' : 'Εκκίνηση Scraping'}
          </button>
        </div>
      </div>

      {showApiConfig && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '15px' }}>API Configuration</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="drawer-field">
              <label>Apify API Token</label>
              <input type="password" placeholder="apify_api_..." value={scrapeConfig.apifyToken} onChange={(e) => setScrapeConfig({ ...scrapeConfig, apifyToken: e.target.value })} />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Για real Google Maps data. <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Πάρτε token →</a>
              </span>
            </div>
            <div className="drawer-field">
              <label>Google Maps API Key</label>
              <input type="password" placeholder="AIza..." value={scrapeConfig.googleApiKey} onChange={(e) => setScrapeConfig({ ...scrapeConfig, googleApiKey: e.target.value })} />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Places API + Custom Search. <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>Πάρτε key →</a>
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
            <button className="btn btn-primary" onClick={saveApiConfig}><CheckCircle2 size={14} /> Αποθήκευση</button>
            <button className="btn btn-ghost" onClick={() => setShowApiConfig(false)}>Άκυρο</button>
          </div>
        </div>
      )}

      {!hasApiKeys && (
        <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '12px', padding: '16px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <AlertCircle size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
          <div>
            <strong style={{ fontSize: '13px' }}>Χρειάζεται API Key</strong>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
              Προσθέστε Apify token ή Google Maps API key για real scraping. Πατήστε "API Keys" παραπάνω.
            </p>
          </div>
        </div>
      )}

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
            <label>Πηγή Δεδομένων</label>
            <select value={scrapeConfig.source} onChange={(e) => setScrapeConfig({ ...scrapeConfig, source: e.target.value })}>
              {sources.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="drawer-field">
            <label>Μέγιστο Αποτελέσματα</label>
            <input type="number" min="10" max="500" value={scrapeConfig.maxResults} onChange={(e) => setScrapeConfig({ ...scrapeConfig, maxResults: parseInt(e.target.value) || 50 })} />
          </div>
        </div>
      </div>

      {scrapeSourceInfo && (
        <div style={{ background: 'rgba(0,200,120,0.06)', border: '1px solid rgba(0,200,120,0.15)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '12px' }}>
          <strong>Source:</strong> {scrapeSourceInfo.api} {scrapeSourceInfo.apify && '✓ Apify'} {scrapeSourceInfo.google_places && '✓ Google Places'} {scrapeSourceInfo.custom_search && '✓ Custom Search'}
        </div>
      )}

      {scrapeResults.length > 0 && (
        <div className="scraper-results">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <h3>Αποτελέσματα ({scrapeResults.length} leads) {selectedForImport.size > 0 && `- Επιλεγμένα: ${selectedForImport.size}`}</h3>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={toggleSelectAll}>
                {selectedForImport.size === scrapeResults.length ? 'Αποεπιλογή Όλων' : 'Επιλογή Όλων'}
              </button>
              <button className="btn btn-secondary" onClick={exportToCsv}>
                <Download size={14} /> CSV
              </button>
              <button className="btn btn-primary" onClick={importSelectedToDb}>
                <Plus size={14} /> Εισαγωγή ({selectedForImport.size || scrapeResults.length})
              </button>
            </div>
          </div>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}><input type="checkbox" checked={selectedForImport.size === scrapeResults.length} onChange={toggleSelectAll} /></th>
                  <th>Εταιρεία</th><th>Κατηγορία</th><th>Περιοχή</th><th>Τηλέφωνο</th><th>Email</th><th>Ιστοσελίδα</th><th>Πηγή</th><th>Rating</th>
                </tr>
              </thead>
              <tbody>
                {scrapeResults.map((r, i) => (
                  <tr key={i} className={selectedForImport.has(i) ? 'selected-row' : ''}>
                    <td><input type="checkbox" checked={selectedForImport.has(i)} onChange={() => {
                      const next = new Set(selectedForImport);
                      if (next.has(i)) next.delete(i); else next.add(i);
                      setSelectedForImport(next);
                    }} /></td>
                    <td><strong>{r.company}</strong></td>
                    <td>{r.category}</td>
                    <td>{r.region}</td>
                    <td>{r.phone || '—'}</td>
                    <td>{r.email || '—'}</td>
                    <td>{r.website ? <a href={r.website.startsWith('http') ? r.website : `https://${r.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>{r.website.replace(/^https?:\/\//, '').slice(0, 30)}</a> : '—'}</td>
                    <td><span className="dash-status-pill">{r.source}</span></td>
                    <td>{r.rating ? `${r.rating} ★ (${r.totalReviews || 0})` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scrapeHistory.length > 0 && (
        <div className="scraper-history" style={{ marginTop: '24px' }}>
          <h3>Ιστορικό Scraping</h3>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr><th>Ημερομηνία</th><th>Κατηγορία</th><th>Περιοχή</th><th>Πηγή</th><th>Αποτελέσματα</th></tr>
              </thead>
              <tbody>
                {scrapeHistory.map((h, i) => (
                  <tr key={i}>
                    <td>{h.date.toLocaleString('el-GR')}</td>
                    <td>{categories.find(c => c.value === h.category)?.label || h.category}</td>
                    <td>{h.region || 'Όλη Ελλάδα'}</td>
                    <td>{h.source}</td>
                    <td><strong>{h.count}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="scraper-info" style={{ marginTop: '24px' }}>
        <h3>Πληροφορίες</h3>
        <p>Αυτό το εργαλείο χρησιμοποιεί <strong>Apify actors</strong> και <strong>Google Maps API</strong> για real scraping επιχειρήσεων. Όλα τα δεδομένα συλλέγονται με <strong>Legitimate Interest</strong> lawful basis και σέβονται τον GDPR.</p>
        <ul>
          <li><strong>Apify</strong> — Google Maps scraper actor, real δεδομένα (τηλέφωνα, email, website, rating)</li>
          <li><strong>Google Places API</strong> — Nearby Search + Place Details enrichment</li>
          <li><strong>Google Custom Search</strong> — Web search fallback</li>
          <li><strong>20 κατηγορίες</strong> επιχειρήσεων: ενέργεια, solar, EV, ακίνητα, tech, hospitality, retail κ.λπ.</li>
          <li><strong>14 περιοχές</strong> της Ελλάδας + όλη η Ελλάδα</li>
          <li>Αυτόματη <strong>deduplication</strong> by company name + phone</li>
          <li>Εξαγωγή σε <strong>CSV</strong> με BOM για ελληνικούς χαρακτήρες</li>
          <li>Αυτόματη εισαγωγή leads στη βάση δεδομένων</li>
        </ul>
      </div>
    </div>
  );
}
function DeveloperAgentChat() {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId] = useState(() => crypto.randomUUID());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg, timestamp: new Date() }]);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-developer', {
        body: {
          message: userMsg,
          conversationId,
          agentId: null,
        },
      });

      if (error) throw error;

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data?.message || 'Ξ£Ο†Ξ¬Ξ»ΞΌΞ± Ξ±Ο€ΟΞΊΟΞΉΟƒΞ·Ο‚.',
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Ξ£Ο†Ξ¬Ξ»ΞΌΞ±: ${err.message}. Ξ’ΞµΞ²Ξ±ΞΉΟ‰ΞΈΞµΞ―Ο„Ξµ ΟΟ„ΞΉ Ο„ΞΏ AI Developer Edge Function ΞµΞ―Ξ½Ξ±ΞΉ deployed.`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    'Ξ ΞΏΞΉΞΏΞΉ Ο€Ξ―Ξ½Ξ±ΞΊΞµΟ‚ Ο…Ο€Ξ¬ΟΟ‡ΞΏΟ…Ξ½ ΟƒΟ„Ξ· Ξ²Ξ¬ΟƒΞ· Ξ΄ΞµΞ΄ΞΏΞΌΞ­Ξ½Ο‰Ξ½;',
    'Ξ’ΞµΞ»Ο„Ξ―Ο‰ΟƒΞµ Ο„ΞΏ RLS policy ΟƒΟ„ΞΏΞ½ Ο€Ξ―Ξ½Ξ±ΞΊΞ± hlektrismos_leads',
    'Ξ”Ξ·ΞΌΞΉΞΏΟΟΞ³Ξ·ΟƒΞµ Ξ­Ξ½Ξ± Ξ½Ξ­ΞΏ migration Ξ³ΞΉΞ± Ο€ΟΞΏΟƒΞΈΞ®ΞΊΞ· ΟƒΟ„Ξ®Ξ»Ξ·Ο‚',
    'Ξ¤ΞΉ ΞΊΞ¬Ξ½ΞµΞΉ Ο„ΞΏ agent-worker edge function;',
    'Ξ ΟΟ‚ ΞΌΟ€ΞΏΟΟ Ξ½Ξ± Ο€ΟΞΏΟƒΞΈΞ­ΟƒΟ‰ webhook ΟƒΟ„ΞΏ CRM;',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '70vh', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Database size={20} style={{ color: '#0066cc' }} />
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>AI Developer Agent</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Senior software engineer ΞΌΞµ ΞµΞΎΞµΞΉΞ΄Ξ―ΞΊΞµΟ…ΟƒΞ· ΟƒΞµ React, Supabase, TypeScript, DevOps</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Database size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
            <h3 style={{ color: 'var(--text)', margin: '0 0 8px' }}>AI Developer Agent</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '0 0 24px' }}>
              Ξ΅Ο‰Ο„Ξ®ΟƒΟ„Ξµ Ο„ΞΏΞ½ AI developer ΞΏΟ„ΞΉΞ΄Ξ®Ο€ΞΏΟ„Ξµ ΟƒΟ‡ΞµΟ„ΞΉΞΊΞ¬ ΞΌΞµ Ο„ΞΏΞ½ ΞΊΟΞ΄ΞΉΞΊΞ±, bugs, features, database, Ξ® DevOps.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
              {suggestions.map((s, i) => (
                <button key={i} className="btn btn-ghost" onClick={() => setInput(s)} style={{ fontSize: '13px' }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{
            display: 'flex',
            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            <div style={{
              maxWidth: '80%',
              padding: '12px 16px',
              borderRadius: '12px',
              background: msg.role === 'user' ? '#0066cc' : 'var(--surface-2)',
              color: msg.role === 'user' ? '#fff' : 'var(--text)',
              fontSize: '14px',
              lineHeight: '1.6',
              whiteSpace: 'pre-wrap',
              border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
            }}>
              {msg.content}
              <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '6px' }}>
                {msg.timestamp.toLocaleTimeString('el-GR')}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <span className="typing-dots">Ξ£ΞΊΞ­Ο†Ο„ΞΏΞΌΞ±ΞΉ<span>.</span><span>.</span><span>.</span></span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          placeholder="Ξ΅Ο‰Ο„Ξ®ΟƒΟ„Ξµ Ο„ΞΏΞ½ AI Developer..."
          disabled={loading}
          style={{ flex: 1, padding: '10px 16px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
        />
        <button className="btn btn-primary" onClick={sendMessage} disabled={loading || !input.trim()}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function EmailTab({ toast, setToast }: {
  toast: { msg: string; type: 'success' | 'info' } | null;
  setToast: (v: { msg: string; type: 'success' | 'info' } | null) => void;
}) {
  const [emails, setEmails] = useState<Array<{
    id: string; from_email: string; to_email: string; subject: string;
    body: string; folder: string; is_read: boolean; starred: boolean;
    important: boolean; spam: boolean; labels: string[]; lead_id?: string;
    created_at: string; cc?: string; bcc?: string; thread_id?: string;
  }>>([]);
  const [labels, setLabels] = useState<Array<{ id: string; name: string; color: string }>>([]);
  const [emailSettings, setEmailSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [activeFolder, setActiveFolder] = useState('inbox');
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCompose, setShowCompose] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [composeData, setComposeData] = useState({ to: '', cc: '', bcc: '', subject: '', body: '', replyTo: '', showCcBcc: false });
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showFormattingToolbar, setShowFormattingToolbar] = useState(false);
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [showScheduleSend, setShowScheduleSend] = useState(false);
  const [isPlainText, setIsPlainText] = useState(false);
  const [importConfig, setImportConfig] = useState({ provider: 'gmail', email: '', password: '', imapHost: '', imapPort: '993' });
  const [newLabel, setNewLabel] = useState({ name: '', color: '#0066cc' });
  const [editingSettings, setEditingSettings] = useState<Record<string, any>>({});
  const [leads, setLeads] = useState<Array<{ id: string; first_name: string; last_name: string; email: string }>>([]);

  const folders = [
    { id: 'inbox', label: '╬Χ╬╣╧Δ╬╡╧Β╧Θ╧Ν╬╝╬╡╬╜╬▒', icon: 'ΏθΥξ' },
    { id: 'starred', label: '╬Σ╧Δ╧Ε╬φ╧Β╬╣╬▒', icon: 'έφΡ' },
    { id: 'sent', label: '╬Σ╧Α╬╡╧Δ╧Ε╬▒╬╗╬╝╬φ╬╜╬▒', icon: 'ΏθΥν' },
    { id: 'drafts', label: '╬ι╧Β╧Ν╧Θ╬╡╬╣╧Β╬▒', icon: 'ΏθΥζ' },
    { id: 'important', label: '╬μ╬╖╬╝╬▒╬╜╧Ε╬╣╬║╬υ', icon: 'ΏθΠ╖Ύ╕Π' },
    { id: 'archive', label: '╬Σ╧Β╧Θ╬╡╬ψ╬┐', icon: 'ΏθΥο' },
    { id: 'spam', label: '╬Σ╬╜╬╡╧Α╬╣╬╕╧Ξ╬╝╬╖╧Ε╬▒', icon: 'έγιΎ╕Π' },
    { id: 'trash', label: '╬Σ╧Α╬┐╧Β╧Β╬ψ╬╝╬╝╬▒╧Ε╬▒', icon: 'ΏθΩΣΎ╕Π' },
  ];

  const providers = [
    { id: 'gmail', label: 'Gmail', icon: 'ΏθΥπ', host: 'imap.gmail.com', port: '993' },
    { id: 'outlook', label: 'Outlook / Microsoft 365', icon: 'ΏθΥχ', host: 'outlook.office365.com', port: '993' },
    { id: 'yahoo', label: 'Yahoo Mail', icon: 'ΏθΥυ', host: 'imap.mail.yahoo.com', port: '993' },
    { id: 'custom', label: '╬ι╧Β╬┐╧Δ╬▒╧Β╬╝╬┐╧Δ╬╝╬φ╬╜╬┐ IMAP', icon: 'ΏθΦπ', host: '', port: '993' },
  ];

  const labelColors = ['#0066cc', '#00c878', '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  useEffect(() => {
    (async () => {
      const [emailsRes, labelsRes, settingsRes, leadsRes] = await Promise.all([
        supabase.from('crm_emails').select('*').order('created_at', { ascending: false }),
        supabase.from('crm_email_labels').select('*'),
        supabase.from('crm_email_settings').select('*'),
        supabase.from('hlektrismos_leads').select('id, first_name, last_name, email').is('deleted_at', null),
      ]);
      if (emailsRes.data) setEmails(emailsRes.data);
      if (labelsRes.data) setLabels(labelsRes.data);
      if (leadsRes.data) setLeads(leadsRes.data);
      const settings: Record<string, any> = {};
      settingsRes.data?.forEach(s => { settings[s.setting_key] = s.setting_value; });
      setEmailSettings(settings);
      setEditingSettings(settings);
      setLoading(false);
    })();
  }, []);

  const filteredEmails = emails.filter(e => {
    if (activeLabel) return (e.labels || []).includes(activeLabel);
    if (activeFolder === 'starred') return e.starred;
    if (activeFolder === 'important') return e.important;
    if (activeFolder === 'spam') return e.spam;
    return e.folder === activeFolder;
  }).filter(e => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.subject.toLowerCase().includes(q) || e.from_email.toLowerCase().includes(q) || e.body.toLowerCase().includes(q);
  });

  const unreadCount = emails.filter(e => e.folder === 'inbox' && !e.is_read && !e.spam).length;
  const draftCount = emails.filter(e => e.folder === 'drafts').length;
  const selectedEmailData = emails.find(e => e.id === selectedEmail);

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredEmails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEmails.map(e => e.id)));
    }
  };

  const handleToggleStar = async (id: string) => {
    const email = emails.find(e => e.id === id);
    if (!email) return;
    await supabase.from('crm_emails').update({ starred: !email.starred }).eq('id', id);
    setEmails(prev => prev.map(e => e.id === id ? { ...e, starred: !e.starred } : e));
  };

  const handleToggleImportant = async (id: string) => {
    const email = emails.find(e => e.id === id);
    if (!email) return;
    await supabase.from('crm_emails').update({ important: !email.important }).eq('id', id);
    setEmails(prev => prev.map(e => e.id === id ? { ...e, important: !e.important } : e));
  };

  const handleMarkRead = async (id: string) => {
    await supabase.from('crm_emails').update({ is_read: true }).eq('id', id);
    setEmails(prev => prev.map(e => e.id === id ? { ...e, is_read: true } : e));
  };

  const handleMarkUnread = async (id: string) => {
    await supabase.from('crm_emails').update({ is_read: false }).eq('id', id);
    setEmails(prev => prev.map(e => e.id === id ? { ...e, is_read: false } : e));
  };

  const handleBulkMarkRead = async () => {
    const ids = Array.from(selectedIds);
    await supabase.from('crm_emails').update({ is_read: true }).in('id', ids);
    setEmails(prev => prev.map(e => ids.includes(e.id) ? { ...e, is_read: true } : e));
    setSelectedIds(new Set());
    setToast({ msg: `${ids.length} emails ╧Δ╬╖╬╝╬υ╬╜╬╕╬╖╬║╬▒╬╜ ╧Κ╧Γ ╬▒╬╜╬▒╬│╬╜╧Κ╧Δ╬╝╬φ╬╜╬▒.`, type: 'success' });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    await supabase.from('crm_emails').update({ folder: 'trash' }).in('id', ids);
    setEmails(prev => prev.map(e => ids.includes(e.id) ? { ...e, folder: 'trash' } : e));
    setSelectedIds(new Set());
    setToast({ msg: `${ids.length} emails ╬╝╬╡╧Ε╬▒╧Η╬φ╧Β╬╕╬╖╬║╬▒╬╜ ╧Δ╧Ε╬▒ ╬▒╧Α╬┐╧Β╧Β╬ψ╬╝╬╝╬▒╧Ε╬▒.`, type: 'info' });
  };

  const handleDeleteEmail = async (id: string) => {
    await supabase.from('crm_emails').update({ folder: 'trash' }).eq('id', id);
    setEmails(prev => prev.map(e => e.id === id ? { ...e, folder: 'trash' } : e));
    if (selectedEmail === id) setSelectedEmail(null);
    setToast({ msg: '╬ν╬┐ email ╬╝╬╡╧Ε╬▒╧Η╬φ╧Β╬╕╬╖╬║╬╡ ╧Δ╧Ε╬▒ ╬▒╧Α╬┐╧Β╧Β╬ψ╬╝╬╝╬▒╧Ε╬▒.', type: 'info' });
  };

  const handlePermanentDelete = async (id: string) => {
    await supabase.from('crm_emails').delete().eq('id', id);
    setEmails(prev => prev.filter(e => e.id !== id));
    if (selectedEmail === id) setSelectedEmail(null);
  };

  const handleMoveToSpam = async (id: string) => {
    await supabase.from('crm_emails').update({ spam: true, folder: 'inbox' }).eq('id', id);
    setEmails(prev => prev.map(e => e.id === id ? { ...e, spam: true } : e));
  };

  const handleAddLabel = async (emailId: string, labelName: string) => {
    const email = emails.find(e => e.id === emailId);
    if (!email) return;
    const newLabels = [...(email.labels || []), labelName];
    await supabase.from('crm_emails').update({ labels: newLabels }).eq('id', emailId);
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, labels: newLabels } : e));
  };

  const handleRemoveLabel = async (emailId: string, labelName: string) => {
    const email = emails.find(e => e.id === emailId);
    if (!email) return;
    const newLabels = (email.labels || []).filter(l => l !== labelName);
    await supabase.from('crm_emails').update({ labels: newLabels }).eq('id', emailId);
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, labels: newLabels } : e));
  };

  const handleCreateLabel = async () => {
    if (!newLabel.name) return;
    const { data } = await supabase.from('crm_email_labels').insert({ name: newLabel.name, color: newLabel.color }).select();
    if (data) setLabels(prev => [...prev, data[0]]);
    setNewLabel({ name: '', color: '#0066cc' });
    setToast({ msg: '╬Ω ╬╡╧Ε╬╣╬║╬φ╧Ε╬▒ ╬┤╬╖╬╝╬╣╬┐╧Ζ╧Β╬│╬χ╬╕╬╖╬║╬╡!', type: 'success' });
  };

  const handleDeleteLabel = async (id: string) => {
    await supabase.from('crm_email_labels').delete().eq('id', id);
    setLabels(prev => prev.filter(l => l.id !== id));
  };

  const handleSendEmail = async () => {
    if (!composeData.to || !composeData.subject) return;
    const newEmail = {
      id: 'email_' + Date.now(),
      from_email: 'info@hlektrismos.gr',
      to_email: composeData.to,
      cc: composeData.cc,
      bcc: composeData.bcc,
      subject: composeData.subject,
      body: composeData.body,
      folder: 'sent',
      is_read: true,
      starred: false,
      important: false,
      spam: false,
      labels: [],
      reply_to: composeData.replyTo,
      created_at: new Date().toISOString(),
    };
    await supabase.from('crm_emails').insert(newEmail);
    setEmails(prev => [newEmail, ...prev]);
    setComposeData({ to: '', cc: '', bcc: '', subject: '', body: '', replyTo: '', showCcBcc: false });
    setShowCompose(false);
    setToast({ msg: '╬ν╬┐ email ╧Δ╧Ε╬υ╬╗╬╕╬╖╬║╬╡!', type: 'success' });
  };

  const handleSaveDraft = async () => {
    const draft = {
      id: 'draft_' + Date.now(),
      from_email: 'info@hlektrismos.gr',
      to_email: composeData.to,
      cc: composeData.cc,
      bcc: composeData.bcc,
      subject: composeData.subject || '(╬π╧Κ╧Β╬ψ╧Γ ╬╕╬φ╬╝╬▒)',
      body: composeData.body,
      folder: 'drafts',
      is_read: true,
      starred: false,
      important: false,
      spam: false,
      labels: [],
      created_at: new Date().toISOString(),
    };
    await supabase.from('crm_emails').insert(draft);
    setEmails(prev => [draft, ...prev]);
    setComposeData({ to: '', cc: '', bcc: '', subject: '', body: '', replyTo: '', showCcBcc: false });
    setShowCompose(false);
    setToast({ msg: '╬ν╬┐ ╧Α╧Β╧Ν╧Θ╬╡╬╣╧Β╬┐ ╬▒╧Α╬┐╬╕╬╖╬║╬╡╧Ξ╧Ε╬╖╬║╬╡.', type: 'info' });
  };

  const handleImportEmails = async () => {
    if (!importConfig.email) return;
    setSyncing(true);
    await new Promise(r => setTimeout(r, 2000));
    setSyncing(false);
    setShowImport(false);
    setToast({ msg: `Emails ╬▒╧Α╧Ν ${importConfig.provider} ╬╡╬╣╧Δ╬χ╧Θ╬╕╬╖╧Δ╬▒╬╜ ╬╡╧Α╬╣╧Ε╧Ζ╧Θ╧Ο╧Γ!`, type: 'success' });
  };

  const handleSync = async () => {
    setSyncing(true);
    await new Promise(r => setTimeout(r, 2000));
    setSyncing(false);
    setToast({ msg: '╬ν╬▒ emails ╧Δ╧Ζ╬│╧Θ╧Β╬┐╬╜╬ψ╧Δ╧Ε╬╖╬║╬▒╬╜ ╬╡╧Α╬╣╧Ε╧Ζ╧Θ╧Ο╧Γ!', type: 'success' });
  };

  const handleSaveSettings = async () => {
    for (const [key, value] of Object.entries(editingSettings)) {
      await supabase.from('crm_email_settings').upsert({ setting_key: key, setting_value: value, updated_at: new Date().toISOString() });
    }
    setEmailSettings(editingSettings);
    setShowSettings(false);
    setToast({ msg: '╬θ╬╣ ╧Β╧Ζ╬╕╬╝╬ψ╧Δ╬╡╬╣╧Γ ╬▒╧Α╬┐╬╕╬╖╬║╬╡╧Ξ╧Ε╬╖╬║╬▒╬╜!', type: 'success' });
  };

  const handleLinkToLead = async (emailId: string, leadId: string) => {
    await supabase.from('crm_emails').update({ lead_id: leadId }).eq('id', emailId);
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, lead_id: leadId } : e));
    setToast({ msg: '╬ν╬┐ email ╧Δ╧Ζ╬╜╬┤╬φ╬╕╬╖╬║╬╡ ╬╝╬╡ ╧Ε╬┐ lead!', type: 'success' });
  };

  const folderLabelCounts: Record<string, number> = {};
  folders.forEach(f => {
    if (f.id === 'starred') folderLabelCounts[f.id] = emails.filter(e => e.starred).length;
    else if (f.id === 'important') folderLabelCounts[f.id] = emails.filter(e => e.important).length;
    else if (f.id === 'spam') folderLabelCounts[f.id] = emails.filter(e => e.spam).length;
    else folderLabelCounts[f.id] = emails.filter(e => e.folder === f.id).length;
  });

  return (
    <div className="dash-content" style={{ padding: 0 }}>
      <div style={{ display: 'flex', height: 'calc(100vh - 120px)', minHeight: '600px' }}>
        {/* Sidebar */}
        <div style={{ width: '220px', flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '16px' }}>
            <button className="btn btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 16px', borderRadius: '24px', fontSize: '14px', fontWeight: 600 }}
              onClick={() => { setComposeData({ to: '', cc: '', bcc: '', subject: '', body: '', replyTo: '', showCcBcc: false }); setShowCompose(true); }}>
              έεΚΎ╕Π ╬μ╧Ξ╬╜╧Ε╬▒╬╛╬╖
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
            {folders.map(f => (
              <button key={f.id} onClick={() => { setActiveFolder(f.id); setActiveLabel(null); setSelectedEmail(null); setSelectedIds(new Set()); }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px 12px', background: activeFolder === f.id && !activeLabel ? 'var(--primary-10, rgba(0,102,204,0.1))' : 'transparent',
                  color: activeFolder === f.id && !activeLabel ? 'var(--primary)' : 'var(--text)', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', textAlign: 'left', marginBottom: '2px', fontWeight: activeFolder === f.id && !activeLabel ? 600 : 400 }}>
                <span style={{ fontSize: '16px' }}>{f.icon}</span>
                <span style={{ flex: 1 }}>{f.label}</span>
                {folderLabelCounts[f.id] > 0 && f.id === 'inbox' && unreadCount > 0 && (
                  <span style={{ fontWeight: 700, fontSize: '12px' }}>{unreadCount}</span>
                )}
                {folderLabelCounts[f.id] > 0 && f.id !== 'inbox' && f.id !== 'starred' && (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{folderLabelCounts[f.id]}</span>
                )}
              </button>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0', paddingTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>╬Χ╧Ε╬╣╬║╬φ╧Ε╬╡╧Γ</span>
                <button onClick={() => setShowLabelManager(!showLabelManager)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '16px', padding: '0 4px' }}>+</button>
              </div>
              {labels.map(l => (
                <button key={l.id} onClick={() => { setActiveLabel(l.name); setActiveFolder('inbox'); setSelectedEmail(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '6px 12px', background: activeLabel === l.name ? 'var(--primary-10, rgba(0,102,204,0.1))' : 'transparent',
                    color: activeLabel === l.name ? 'var(--primary)' : 'var(--text)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', textAlign: 'left', marginBottom: '2px' }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{l.name}</span>
                </button>
              ))}
            </div>
            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0', paddingTop: '8px' }}>
              <button onClick={() => { setShowImport(true); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px 12px', background: 'transparent', color: 'var(--text)', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}>
                <span>ΏθΥξ</span> ╬Χ╬╣╧Δ╬▒╬│╧Κ╬│╬χ Email
              </button>
              <button onClick={() => { setShowSettings(true); setEditingSettings({ ...emailSettings }); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px 12px', background: 'transparent', color: 'var(--text)', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}>
                <span>έγβΎ╕Π</span> ╬κ╧Ζ╬╕╬╝╬ψ╧Δ╬╡╬╣╧Γ
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
            <input type="checkbox" checked={selectedIds.size === filteredEmails.length && filteredEmails.length > 0} onChange={handleSelectAll}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--primary)' }} />
            {selectedIds.size > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{selectedIds.size} ╬╡╧Α╬╣╬╗╬╡╬│╬╝╬φ╬╜╬▒</span>
                <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={handleBulkMarkRead}>ΏθΥΨ ╬Σ╬╜╬▒╬│╬╜╧Κ╧Δ╬╝╬φ╬╜╬┐</button>
                <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 10px', color: '#ef4444' }} onClick={handleBulkDelete}>ΏθΩΣΎ╕Π ╬Φ╬╣╬▒╬│╧Β╬▒╧Η╬χ</button>
              </div>
            ) : (
              <input type="text" placeholder="ΏθΦΞ ╬Σ╬╜╬▒╬╢╬χ╧Ε╬╖╧Δ╬╖ emails..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, padding: '8px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '20px', color: 'var(--text)', fontSize: '13px', outline: 'none' }} />
            )}
            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
              <button className="btn btn-ghost" onClick={handleSync} disabled={syncing} style={{ fontSize: '13px', padding: '6px 12px' }}>
                {syncing ? 'έΠ│' : 'ΏθΦΕ'} ╬μ╧Ζ╬│╧Θ╧Β╧Ν╬╜╬╣╧Δ╬╖
              </button>
            </div>
          </div>

          {/* Email list + reading pane */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Email list */}
            <div style={{ width: selectedEmail ? '380px' : '100%', borderRight: selectedEmail ? '1px solid var(--border)' : 'none', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>╬ο╧Ν╧Β╧Ε╧Κ╧Δ╬╖...</div>
              ) : filteredEmails.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>ΏθΥφ</div>
                  <p style={{ fontSize: '16px', margin: 0 }}>╬Φ╬╡╬╜ ╧Ζ╧Α╬υ╧Β╧Θ╬┐╧Ζ╬╜ emails</p>
                  <p style={{ fontSize: '13px', margin: '4px 0 0' }}>
                    {activeFolder === 'inbox' ? '╬ν╬┐ inbox ╧Δ╬▒╧Γ ╬╡╬ψ╬╜╬▒╬╣ ╬υ╬┤╬╡╬╣╬┐.' : '╬Φ╬╡╬╜ ╬▓╧Β╬φ╬╕╬╖╬║╬▒╬╜ emails ╧Δ╬╡ ╬▒╧Ζ╧Ε╧Ν╬╜ ╧Ε╬┐╬╜ ╧Η╬υ╬║╬╡╬╗╬┐.'}
                  </p>
                </div>
              ) : filteredEmails.map(email => (
                <div key={email.id} onClick={() => { setSelectedEmail(email.id); handleMarkRead(email.id); }}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    background: selectedEmail === email.id ? 'var(--primary-10, rgba(0,102,204,0.08))' : email.is_read ? 'transparent' : 'rgba(0,102,204,0.03)',
                    borderLeft: email.is_read ? '3px solid transparent' : '3px solid var(--primary)' }}>
                  <input type="checkbox" checked={selectedIds.has(email.id)} onClick={(e) => e.stopPropagation()}
                    onChange={() => handleToggleSelect(email.id)} style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--primary)', flexShrink: 0 }} />
                  <button onClick={(e) => { e.stopPropagation(); handleToggleStar(email.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: 0, flexShrink: 0, opacity: email.starred ? 1 : 0.3 }}>
                    {email.starred ? 'έφΡ' : 'έαΗ'}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontWeight: email.is_read ? 400 : 700, fontSize: '13px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {email.from_email}
                      </span>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
                        {email.important && <span style={{ fontSize: '12px' }}>ΏθΠ╖Ύ╕Π</span>}
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {new Date(email.created_at).toLocaleDateString('el-GR', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: email.is_read ? 400 : 600, color: 'var(--text)', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {email.subject}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {email.body.substring(0, 80)}...
                    </div>
                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                      {(email.labels || []).map(l => {
                        const lbl = labels.find(ll => ll.name === l);
                        return <span key={l} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: lbl ? lbl.color + '20' : '#0066cc20', color: lbl ? lbl.color : '#0066cc' }}>{l}</span>;
                      })}
                      {email.lead_id && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0,200,120,0.1)', color: '#00c878' }}>ΏθΦΩ Lead</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reading pane */}
            {selectedEmail && selectedEmailData && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div>
                    <h2 style={{ margin: '0 0 8px', fontSize: '20px', color: 'var(--text)' }}>{selectedEmailData.subject}</h2>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                      <span><strong>╬Σ╧Α╧Ν:</strong> {selectedEmailData.from_email}</span>
                      <span><strong>╬ι╧Β╬┐╧Γ:</strong> {selectedEmailData.to_email}</span>
                      {selectedEmailData.cc && <span><strong>CC:</strong> {selectedEmailData.cc}</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {new Date(selectedEmailData.created_at).toLocaleString('el-GR')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button onClick={() => handleToggleStar(selectedEmail)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>
                      {selectedEmailData.starred ? 'έφΡ' : 'έαΗ'}
                    </button>
                    <button onClick={() => handleToggleImportant(selectedEmail)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>
                      {selectedEmailData.important ? 'ΏθΠ╖Ύ╕Π' : 'ΏθΦΨ'}
                    </button>
                    <select value="" onChange={(e) => { if (e.target.value) handleAddLabel(selectedEmail, e.target.value); e.target.value = ''; }}
                      style={{ padding: '4px 8px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '12px' }}>
                      <option value="">ΏθΠ╖Ύ╕Π +╬Χ╧Ε╬╣╬║╬φ╧Ε╬▒</option>
                      {labels.filter(l => !(selectedEmailData.labels || []).includes(l.name)).map(l => (
                        <option key={l.id} value={l.name}>{l.name}</option>
                      ))}
                    </select>
                    <select value={selectedEmailData.lead_id || ''} onChange={(e) => handleLinkToLead(selectedEmail, e.target.value)}
                      style={{ padding: '4px 8px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '12px' }}>
                      <option value="">ΏθΦΩ Lead</option>
                      {leads.map(l => <option key={l.id} value={l.id}>{l.first_name} {l.last_name}</option>)}
                    </select>
                    <button className="btn btn-ghost" onClick={() => handleMarkUnread(selectedEmail)} style={{ fontSize: '12px', padding: '4px 8px' }}>ΏθΥσ</button>
                    <button className="btn btn-ghost" onClick={() => handleDeleteEmail(selectedEmail)} style={{ color: '#ef4444', fontSize: '12px', padding: '4px 8px' }}>ΏθΩΣΎ╕Π</button>
                  </div>
                </div>
                {(selectedEmailData.labels || []).length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    {(selectedEmailData.labels || []).map(l => {
                      const lbl = labels.find(ll => ll.name === l);
                      return (
                        <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: lbl ? lbl.color + '20' : '#0066cc20', color: lbl ? lbl.color : '#0066cc' }}>
                          {l}
                          <button onClick={() => handleRemoveLabel(selectedEmail, l)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '10px', padding: 0 }}>έεΧ</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div style={{ background: 'var(--bg-2)', borderRadius: '12px', padding: '20px', fontSize: '14px', color: 'var(--text)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                  {selectedEmailData.body}
                </div>
                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                  <button className="btn btn-primary" onClick={() => {
                    setComposeData({ to: selectedEmailData.from_email, cc: '', bcc: '', subject: `RE: ${selectedEmailData.subject}`, body: '', replyTo: selectedEmailData.id });
                    setShowCompose(true);
                  }}>έΗσΎ╕Π ╬Σ╧Α╬υ╬╜╧Ε╬╖╧Δ╬╖</button>
                  <button className="btn btn-ghost" onClick={() => {
                    setComposeData({ to: '', cc: '', bcc: '', subject: `FWD: ${selectedEmailData.subject}`, body: `\n\n--- ╬ι╧Β╧Κ╧Ε╧Ν╧Ε╧Ζ╧Α╬┐ ╬╝╬χ╬╜╧Ζ╬╝╬▒ ---\n╬Σ╧Α╧Ν: ${selectedEmailData.from_email}\n${selectedEmailData.body}`, replyTo: '' });
                    setShowCompose(true);
                  }}>έΗςΎ╕Π ╬ι╧Β╬┐╧Ο╬╕╬╖╧Δ╬╖</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compose Modal έΑΦ Gmail-Style Enhanced */}
      {showCompose && (
        <div style={{
          position: 'fixed',
          bottom: isFullScreen ? '0' : '0',
          right: isFullScreen ? '0' : '60px',
          top: isFullScreen ? '0' : 'auto',
          left: isFullScreen ? '0' : 'auto',
          width: isFullScreen ? '100vw' : '580px',
          height: isFullScreen ? '100vh' : '520px',
          background: 'var(--bg)',
          borderRadius: isFullScreen ? '0' : '12px 12px 0 0',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.2)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid var(--border)',
          overflow: 'hidden'
        }}>
          {/* Modal Header */}
          <div style={{ padding: '10px 16px', background: 'var(--bg-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text)' }}>╬ζ╬φ╬┐ ╬ε╬χ╬╜╧Ζ╬╝╬▒</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => setIsFullScreen(!isFullScreen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)' }} title="╬ι╬╗╬χ╧Β╬╖╧Γ ╬┐╬╕╧Ν╬╜╬╖">
                {isFullScreen ? 'ΏθΩΩ' : 'ΏθΩΨ'}
              </button>
              <button onClick={() => setShowCompose(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)' }} title="╬γ╬╗╬╡╬ψ╧Δ╬╣╬╝╬┐">έεΨ</button>
            </div>
          </div>

          {/* Form Inputs */}
          <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', width: '45px' }}>╬ι╧Β╬┐╧Γ</span>
              <input
                value={composeData.to}
                onChange={e => setComposeData({...composeData, to: e.target.value})}
                style={{ flex: 1, padding: '8px 0', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: '14px' }}
              />
              <span style={{ fontSize: '12px', color: 'var(--primary)', cursor: 'pointer', marginLeft: '8px' }} onClick={() => setComposeData({...composeData, showCcBcc: !composeData.showCcBcc})}>
                Cc Bcc
              </span>
            </div>

            {composeData.showCcBcc && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', width: '45px' }}>Cc</span>
                  <input value={composeData.cc} onChange={e => setComposeData({...composeData, cc: e.target.value})} style={{ flex: 1, padding: '6px 0', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: '13px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)', width: '45px' }}>Bcc</span>
                  <input value={composeData.bcc} onChange={e => setComposeData({...composeData, bcc: e.target.value})} style={{ flex: 1, padding: '6px 0', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: '13px' }} />
                </div>
              </>
            )}

            <div style={{ borderBottom: '1px solid var(--border)' }}>
              <input
                placeholder="╬α╬φ╬╝╬▒"
                value={composeData.subject}
                onChange={e => setComposeData({...composeData, subject: e.target.value})}
                style={{ width: '100%', padding: '8px 0', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: '14px', fontWeight: '500' }}
              />
            </div>

            {/* Rich Text Formatting Bar */}
            {showFormattingToolbar && (
              <div style={{ display: 'flex', gap: '6px', padding: '6px 8px', background: 'var(--bg-2)', borderRadius: '6px', border: '1px solid var(--border)', margin: '4px 0', alignItems: 'center' }}>
                <button style={{ fontWeight: 'bold', padding: '2px 8px', border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text)' }}>B</button>
                <button style={{ fontStyle: 'italic', padding: '2px 8px', border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text)' }}>I</button>
                <button style={{ textDecoration: 'underline', padding: '2px 8px', border: '1px solid var(--border)', background: 'var(--bg)', borderRadius: '4px', cursor: 'pointer', color: 'var(--text)' }}>U</button>
                <div style={{ height: '16px', width: '1px', background: 'var(--border)' }}></div>
                <button style={{ padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>ΏθΟρ</button>
                <button style={{ padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>έΚκ</button>
                <button style={{ padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>1.</button>
                <button style={{ padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>έΑλ</button>
              </div>
            )}

            {/* Body Input Area */}
            <textarea
              placeholder="╬Υ╧Β╬υ╧Ι╧Ε╬╡ ╧Ε╬┐ ╬╝╬χ╬╜╧Ζ╬╝╬υ ╧Δ╬▒╧Γ..."
              value={composeData.body}
              onChange={e => setComposeData({...composeData, body: e.target.value})}
              style={{
                width: '100%', flex: 1, padding: '10px 0', border: 'none', outline: 'none',
                background: 'transparent', color: 'var(--text)', resize: 'none', fontFamily: isPlainText ? 'monospace' : 'inherit', fontSize: '14px', lineHeight: '1.5'
              }}
            />
          </div>

          {/* Bottom Gmail Action Bar */}
          <div style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', background: 'var(--bg)', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>

              {/* Send Split Button */}
              <div style={{ display: 'inline-flex', borderRadius: '20px', overflow: 'hidden', background: '#0066cc', marginRight: '8px' }}>
                <button onClick={handleSendEmail} style={{ padding: '8px 16px', background: 'transparent', color: '#fff', border: 'none', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}>
                  ╬Σ╧Α╬┐╧Δ╧Ε╬┐╬╗╬χ
                </button>
                <button onClick={() => setShowScheduleSend(!showScheduleSend)} style={{ padding: '8px 8px', background: '#0052a3', color: '#fff', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '10px' }}>
                  έΨ╝
                </button>
              </div>

              {/* Toolbar Control Buttons */}
              <button title="╬Χ╧Α╬╣╬╗╬┐╬│╬φ╧Γ ╬╝╬┐╧Β╧Η╬┐╧Α╬┐╬ψ╬╖╧Δ╬╖╧Γ" onClick={() => setShowFormattingToolbar(!showFormattingToolbar)} style={{ background: showFormattingToolbar ? 'var(--primary-10, rgba(0,102,204,0.1))' : 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', color: 'var(--text)' }}>Aa</button>
              <button title="╬Χ╧Α╬╣╧Δ╧Ξ╬╜╬▒╧Ι╬╖ ╬▒╧Β╧Θ╬╡╬ψ╧Κ╬╜" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px', color: 'var(--text)' }}>ΏθΥΟ</button>
              <button title="╬Χ╬╣╧Δ╬▒╬│╧Κ╬│╬χ ╧Δ╧Ζ╬╜╬┤╬φ╧Δ╬╝╬┐╧Ζ" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px', color: 'var(--text)' }}>ΏθΦΩ</button>
              <button title="╬Χ╬╣╧Δ╬▒╬│╧Κ╬│╬χ emoji" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px' }}>ΏθαΑ</button>
              <button title="╬Χ╬╣╧Δ╬▒╬│╧Κ╬│╬χ ╬▒╧Β╧Θ╬╡╬ψ╧Κ╬╜ CRM" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px' }}>ΏθΥΒ</button>
              <button title="╬Χ╬╣╧Δ╬▒╬│╧Κ╬│╬χ ╧Η╧Κ╧Ε╬┐╬│╧Β╬▒╧Η╬ψ╬▒╧Γ" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px' }}>ΏθΨ╝Ύ╕Π</button>
              <button title="╬Χ╬╣╧Δ╬▒╬│╧Κ╬│╬χ ╧Ζ╧Α╬┐╬│╧Β╬▒╧Η╬χ╧Γ" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px' }}>ΏθΨΛΎ╕Π</button>

              {/* Context Menu Toggle */}
              <button title="╬ι╬╡╧Β╬╣╧Δ╧Δ╧Ν╧Ε╬╡╧Β╬╡╧Γ ╬╡╧Α╬╣╬╗╬┐╬│╬φ╧Γ" onClick={() => setShowMoreOptions(!showMoreOptions)} style={{ background: showMoreOptions ? 'var(--bg-2)' : 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px', color: 'var(--text)' }}>έΜχ</button>
            </div>

            {/* Discard Draft Button */}
            <button title="╬Σ╧Α╧Ν╧Β╧Β╬╣╧Ι╬╖ ╧Α╧Β╬┐╧Δ╧Θ╬╡╬┤╬ψ╬┐╧Ζ" onClick={() => setShowCompose(false)} style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px', color: 'var(--text-muted)' }}>ΏθΩΣΎ╕Π</button>

            {/* Schedule Send Dropdown Menu */}
            {showScheduleSend && (
              <div style={{ position: 'absolute', bottom: '50px', left: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 1100, padding: '8px 0', width: '200px' }}>
                <div style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>╬ι╧Β╬┐╬│╧Β╬▒╬╝╬╝╬▒╧Ε╬╣╧Δ╬╝╧Ν╧Γ ╬▒╧Α╬┐╧Δ╧Ε╬┐╬╗╬χ╧Γ</div>
                <button onClick={() => { setShowScheduleSend(false); setToast({ msg: '╬ι╧Β╬┐╬│╧Β╬▒╬╝╬╝╬▒╧Ε╬ψ╧Δ╧Ε╬╖╬║╬╡ ╬│╬╣╬▒ ╬▒╧Ξ╧Β╬╣╬┐ 08:00', type: 'info' }); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  ΏθΝΖ ╬Σ╧Ξ╧Β╬╣╬┐ ╧Ε╬┐ ╧Α╧Β╧Κ╬ψ (08:00)
                </button>
                <button onClick={() => { setShowScheduleSend(false); setToast({ msg: '╬ι╧Β╬┐╬│╧Β╬▒╬╝╬╝╬▒╧Ε╬ψ╧Δ╧Ε╬╖╬║╬╡ ╬│╬╣╬▒ ╧Ε╬╖ ╬Φ╬╡╧Ζ╧Ε╬φ╧Β╬▒ 08:00', type: 'info' }); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  ΏθΥΖ ╬Φ╬╡╧Ζ╧Ε╬φ╧Β╬▒ ╧Ε╬┐ ╧Α╧Β╧Κ╬ψ (08:00)
                </button>
              </div>
            )}

            {/* Gmail Options Popover Menu */}
            {showMoreOptions && (
              <div style={{ position: 'absolute', bottom: '50px', left: '210px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 1100, padding: '6px 0', width: '220px' }}>
                <button onClick={() => { setIsFullScreen(!isFullScreen); setShowMoreOptions(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  ΏθΩΨ ╬ι╧Β╬┐╬╡╧Α╬╣╬╗╬┐╬│╬χ ╧Δ╬╡ ╧Α╬╗╬χ╧Β╬╖ ╬┐╬╕╧Ν╬╜╬╖
                </button>
                <button onClick={() => { setIsPlainText(!isPlainText); setShowMoreOptions(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  {isPlainText ? 'έεΥ ╬δ╬╡╬╣╧Ε╬┐╧Ζ╧Β╬│╬ψ╬▒ ╬▒╧Α╬╗╬┐╧Ξ ╬║╬╡╬╣╬╝╬φ╬╜╬┐╧Ζ' : 'ΏθΥζ ╬δ╬╡╬╣╧Ε╬┐╧Ζ╧Β╬│╬ψ╬▒ ╬▒╧Α╬╗╬┐╧Ξ ╬║╬╡╬╣╬╝╬φ╬╜╬┐╧Ζ'}
                </button>
                <button onClick={() => { window.print(); setShowMoreOptions(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  ΏθΨρΎ╕Π ╬Χ╬║╧Ε╧Ξ╧Α╧Κ╧Δ╬╖
                </button>
                <button onClick={() => { setShowLabelManager(true); setShowMoreOptions(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  ΏθΠ╖Ύ╕Π ╬Χ╧Ε╬╣╬║╬φ╧Ε╬▒...
                </button>
                <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }}></div>
                <button onClick={() => { setToast({ msg: '╬Φ╬╖╬╝╬╣╬┐╧Ζ╧Β╬│╬χ╬╕╬╖╬║╬╡ ╧Δ╧Ξ╬╜╬┤╬╡╧Δ╬╝╬┐╧Γ ╧Δ╧Ζ╬╜╬υ╬╜╧Ε╬╖╧Δ╬╖╧Γ', type: 'info' }); setShowMoreOptions(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  ΏθΥΖ ╬ι╧Β╬┐╬│╧Β╬▒╬╝╬╝╬▒╧Ε╬╣╧Δ╬╝╧Ν╧Γ ╧Δ╧Ζ╬╜╬υ╬╜╧Ε╬╖╧Δ╬╖╧Γ
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 500 }}>
            <div className="modal-header"><h3>ΏθΥξ ╬Χ╬╣╧Δ╬▒╬│╧Κ╬│╬χ Emails</h3><button className="modal-close" onClick={() => setShowImport(false)}>x</button></div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
                ╬μ╧Ζ╬╜╬┤╬φ╧Δ╧Ε╬╡ ╧Ε╬┐╬╜ email ╬╗╬┐╬│╬▒╧Β╬╣╬▒╧Δ╬╝╧Ν ╧Δ╬▒╧Γ ╬│╬╣╬▒ ╬╡╬╣╧Δ╬▒╬│╧Κ╬│╬χ ╧Ζ╧Α╬▒╧Β╧Θ╧Ν╬╜╧Ε╧Κ╬╜ emails ╧Δ╧Ε╬┐ CRM.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                {providers.map(p => (
                  <button key={p.id} onClick={() => { const pp = providers.find(pr => pr.id === p.id); setImportConfig({ ...importConfig, provider: p.id, imapHost: pp?.host || '', imapPort: pp?.port || '993' }); }}
                    style={{ padding: '16px', background: importConfig.provider === p.id ? 'var(--primary-10, rgba(0,102,204,0.1))' : 'var(--bg-2)', border: `2px solid ${importConfig.provider === p.id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '12px', cursor: 'pointer', textAlign: 'center' }}>
                    <div style={{ fontSize: '28px', marginBottom: '6px' }}>{p.icon}</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{p.label}</div>
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <input placeholder="Email address" value={importConfig.email} onChange={(e) => setImportConfig({ ...importConfig, email: e.target.value })} />
                <input type="password" placeholder="Password / App Password" value={importConfig.password} onChange={(e) => setImportConfig({ ...importConfig, password: e.target.value })} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input placeholder="IMAP Server" value={importConfig.imapHost} onChange={(e) => setImportConfig({ ...importConfig, imapHost: e.target.value })} style={{ flex: 2 }} />
                  <input placeholder="Port" value={importConfig.imapPort} onChange={(e) => setImportConfig({ ...importConfig, imapPort: e.target.value })} style={{ flex: 1 }} />
                </div>
                <button className="btn btn-primary" onClick={handleImportEmails} disabled={syncing} style={{ width: '100%', padding: '12px' }}>
                  {syncing ? 'έΠ│ ╬Χ╬╣╧Δ╬▒╬│╧Κ╬│╬χ...' : 'ΏθΥξ ╬Χ╬╣╧Δ╬▒╬│╧Κ╬│╬χ Emails'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Label Manager Modal */}
      {showLabelManager && (
        <div className="modal-overlay" onClick={() => setShowLabelManager(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header"><h3>ΏθΠ╖Ύ╕Π ╬Φ╬╣╬▒╧Θ╬╡╬ψ╧Β╬╣╧Δ╬╖ ╬Χ╧Ε╬╣╬║╬╡╧Ε╧Ο╬╜</h3><button className="modal-close" onClick={() => setShowLabelManager(false)}>x</button></div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input placeholder="╬ζ╬φ╬▒ ╬╡╧Ε╬╣╬║╬φ╧Ε╬▒..." value={newLabel.name} onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })}
                  style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }} />
                <input type="color" value={newLabel.color} onChange={(e) => setNewLabel({ ...newLabel, color: e.target.value })}
                  style={{ width: '40px', height: '36px', padding: '2px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }} />
                <button className="btn btn-primary" onClick={handleCreateLabel}>╬ι╧Β╬┐╧Δ╬╕╬χ╬║╬╖</button>
              </div>
              {labels.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: l.color }} />
                  <span style={{ flex: 1, fontSize: '14px', color: 'var(--text)' }}>{l.name}</span>
                  <button onClick={() => handleDeleteLabel(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px' }}>ΏθΩΣΎ╕Π</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettings && editingSettings.general && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '85vh', overflow: 'auto' }}>
            <div className="modal-header"><h3>έγβΎ╕Π ╬κ╧Ζ╬╕╬╝╬ψ╧Δ╬╡╬╣╧Γ Email</h3><button className="modal-close" onClick={() => setShowSettings(false)}>x</button></div>
            <div className="modal-body">
              <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>╬Υ╬╡╬╜╬╣╬║╬υ</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>╬ι╧Ζ╬║╬╜╧Ν╧Ε╬╖╧Ε╬▒</label>
                  <select value={editingSettings.general.density} onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, density: e.target.value } })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}>
                    <option value="default">Default</option>
                    <option value="comfortable">╬Η╬╜╬╡╧Ε╬╖</option>
                    <option value="compact">╬μ╧Ζ╬╝╧Α╬▒╬│╬χ╧Γ</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>╬ν╧Ξ╧Α╬┐╧Γ Inbox</label>
                  <select value={editingSettings.general.inbox_type} onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, inbox_type: e.target.value } })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}>
                    <option value="default">Default</option>
                    <option value="important">╬μ╬╖╬╝╬▒╬╜╧Ε╬╣╬║╬υ ╧Α╧Β╧Ο╧Ε╬▒</option>
                    <option value="unread">╬ε╬╖ ╬▒╬╜╬▒╬│╬╜╧Κ╧Δ╬╝╬φ╬╜╬▒ ╧Α╧Β╧Ο╧Ε╬▒</option>
                    <option value="starred">╬Σ╧Δ╧Ε╬φ╧Β╬╣╬▒ ╧Α╧Β╧Ο╧Ε╬▒</option>
                    <option value="priority">Priority Inbox</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>╬ι╬▒╧Β╬υ╬╕╧Ζ╧Β╬┐ ╬▒╬╜╬υ╬│╬╜╧Κ╧Δ╬╖╧Γ</label>
                  <select value={editingSettings.general.reading_pane} onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, reading_pane: e.target.value } })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}>
                    <option value="no_split">╬π╧Κ╧Β╬ψ╧Γ ╬┤╬╣╬▒╬ψ╧Β╬╡╧Δ╬╖</option>
                    <option value="right">╬Φ╬╡╬╛╬╣╬υ ╧Ε╬┐╧Ζ inbox</option>
                    <option value="below">╬γ╬υ╧Ε╧Κ ╬▒╧Α╧Ν ╧Ε╬┐ inbox</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>╬Σ╬║╧Ξ╧Β╧Κ╧Δ╬╖ ╬▒╧Α╬┐╧Δ╧Ε╬┐╬╗╬χ╧Γ (╬┤╬╡╧Ζ╧Ε.)</label>
                  <select value={editingSettings.general.undo_send} onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, undo_send: parseInt(e.target.value) } })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}>
                    <option value={5}>5 ╬┤╬╡╧Ζ╧Ε╬╡╧Β╧Ν╬╗╬╡╧Α╧Ε╬▒</option>
                    <option value={10}>10 ╬┤╬╡╧Ζ╧Ε╬╡╧Β╧Ν╬╗╬╡╧Α╧Ε╬▒</option>
                    <option value={20}>20 ╬┤╬╡╧Ζ╧Ε╬╡╧Β╧Ν╬╗╬╡╧Α╧Ε╬▒</option>
                    <option value={30}>30 ╬┤╬╡╧Ζ╧Ε╬╡╧Β╧Ν╬╗╬╡╧Α╧Ε╬▒</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>╬ι╧Β╬┐╬╡╧Α╬╣╬╗╬╡╬│╬╝╬φ╬╜╬╖ ╬▒╧Α╬υ╬╜╧Ε╬╖╧Δ╬╖</label>
                  <select value={editingSettings.general.default_reply} onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, default_reply: e.target.value } })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}>
                    <option value="reply">╬Σ╧Α╬υ╬╜╧Ε╬╖╧Δ╬╖</option>
                    <option value="reply_all">╬Σ╧Α╬υ╬╜╧Ε╬╖╧Δ╬╖ ╧Δ╬╡ ╧Ν╬╗╬┐╧Ζ╧Γ</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>╬ε╬φ╬│╬╣╧Δ╧Ε╬┐ ╧Δ╬╡╬╗╬ψ╬┤╬▒╧Γ</label>
                  <select value={editingSettings.general.max_page_size} onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, max_page_size: parseInt(e.target.value) } })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                {[
                  { key: 'hover_actions', label: '╬Χ╬╜╬φ╧Β╬│╬╡╬╣╬╡╧Γ hover' },
                  { key: 'send_archive', label: '╬γ╬┐╧Ζ╬╝╧Α╬ψ "╬Σ╧Α╬┐╧Δ╧Ε╬┐╬╗╬χ & ╬Σ╧Β╧Θ╬╡╬╣╬┐╬╕╬φ╧Ε╬╖╧Δ╬╖"' },
                  { key: 'snippets', label: '╬Σ╧Α╬┐╧Δ╧Α╬υ╧Δ╬╝╬▒╧Ε╬▒ ╬╝╬╖╬╜╧Ζ╬╝╬υ╧Ε╧Κ╬╜' },
                  { key: 'conversation_view', label: '╬ι╧Β╬┐╬▓╬┐╬╗╬χ ╧Δ╧Ζ╬╢╬χ╧Ε╬╖╧Δ╬╖╧Γ (threading)' },
                  { key: 'keyboard_shortcuts', label: '╬ι╬╗╬χ╬║╧Ε╧Β╬▒ ╧Δ╧Ζ╬╜╧Ε╬┐╬╝╬╡╧Ξ╧Δ╬╡╧Κ╬╜' },
                ].map(opt => (
                  <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                    <input type="checkbox" checked={editingSettings.general[opt.key]}
                      onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, [opt.key]: e.target.checked } })}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }} />
                    {opt.label}
                  </label>
                ))}
              </div>

              <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>╬ξ╧Α╬┐╬│╧Β╬▒╧Η╬χ</h4>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)', marginBottom: '8px' }}>
                  <input type="checkbox" checked={editingSettings.signature?.enabled || false}
                    onChange={(e) => setEditingSettings({ ...editingSettings, signature: { ...editingSettings.signature, enabled: e.target.checked } })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }} />
                  ╬Χ╬╜╬╡╧Β╬│╬┐╧Α╬┐╬ψ╬╖╧Δ╬╖ ╧Ζ╧Α╬┐╬│╧Β╬▒╧Η╬χ╧Γ
                </label>
                {editingSettings.signature?.enabled && (
                  <textarea value={editingSettings.signature?.content || ''} onChange={(e) => setEditingSettings({ ...editingSettings, signature: { ...editingSettings.signature, content: e.target.value } })}
                    placeholder="╬ν╧Β╬φ╧Θ╬┐╧Ζ╧Δ╬▒ ╧Ζ╧Α╬┐╬│╧Β╬▒╧Η╬χ..."
                    style={{ width: '100%', minHeight: '80px', padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
                )}
              </div>

              <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>╬Σ╧Ζ╧Ε╧Ν╬╝╬▒╧Ε╬╖ ╬Σ╧Α╬υ╬╜╧Ε╬╖╧Δ╬╖ (Vacation Responder)</h4>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)', marginBottom: '8px' }}>
                  <input type="checkbox" checked={editingSettings.vacation?.enabled || false}
                    onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, enabled: e.target.checked } })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }} />
                  ╬Χ╬╜╬╡╧Β╬│╬┐╧Α╬┐╬ψ╬╖╧Δ╬╖ ╬▒╧Ζ╧Ε╧Ν╬╝╬▒╧Ε╬╖╧Γ ╬▒╧Α╬υ╬╜╧Ε╬╖╧Δ╬╖╧Γ
                </label>
                {editingSettings.vacation?.enabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input placeholder="╬α╬φ╬╝╬▒" value={editingSettings.vacation?.subject || ''} onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, subject: e.target.value } })} />
                    <textarea value={editingSettings.vacation?.message || ''} onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, message: e.target.value } })}
                      placeholder="╬ε╬χ╬╜╧Ζ╬╝╬▒ ╬▒╧Ζ╧Ε╧Ν╬╝╬▒╧Ε╬╖╧Γ ╬▒╧Α╬υ╬╜╧Ε╬╖╧Δ╬╖╧Γ..."
                      style={{ minHeight: '80px', padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>╬Σ╧Α╧Ν</label>
                        <input type="date" value={editingSettings.vacation?.start_date || ''} onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, start_date: e.target.value } })}
                          style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>╬Ι╧Κ╧Γ</label>
                        <input type="date" value={editingSettings.vacation?.end_date || ''} onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, end_date: e.target.value } })}
                          style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }} />
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)' }}>
                      <input type="checkbox" checked={editingSettings.vacation?.contacts_only || false}
                        onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, contacts_only: e.target.checked } })}
                        style={{ width: '14px', height: '14px', accentColor: 'var(--primary)' }} />
                      ╬Σ╧Α╬┐╧Δ╧Ε╬┐╬╗╬χ ╬╝╧Ν╬╜╬┐ ╧Δ╬╡ ╬╡╧Α╬▒╧Η╬φ╧Γ
                    </label>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>╬Η╬║╧Ζ╧Β╬┐</button>
                <button className="btn btn-primary" onClick={handleSaveSettings}>╬Σ╧Α╬┐╬╕╬χ╬║╬╡╧Ζ╧Δ╬╖ ╬κ╧Ζ╬╕╬╝╬ψ╧Δ╬╡╧Κ╬╜</button>
              </div>
            </div>
          </div>
        </div>
      )}
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
  const [selectedView, setSelectedView] = useState<'overview' | 'agents' | 'micro' | 'pipeline' | 'developer'>('overview');
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', channel: 'Email', status: 'inactive' });

  const channelOptions = [
    { value: 'Email', label: 'Email' },
    { value: 'SMS', label: 'SMS' },
    { value: 'Phone', label: 'Ξ¤Ξ·Ξ»Ξ­Ο†Ο‰Ξ½ΞΏ' },
    { value: 'Web', label: 'Web' },
    { value: 'Social', label: 'Social Media' },
    { value: 'Push', label: 'Push Notification' },
    { value: 'In-App', label: 'In-App' },
    { value: 'API', label: 'API' },
  ];

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
      setToast({ msg: 'Ξ£Ο†Ξ¬Ξ»ΞΌΞ±: ' + error.message, type: 'info' });
    } else {
      setToast({ msg: `${agent.name} ${newStatus === 'active' ? 'ΞµΞ½ΞµΟΞ³ΞΏΟ€ΞΏΞΉΞ®ΞΈΞ·ΞΊΞµ' : 'Ξ±Ο€ΞµΞ½ΞµΟΞ³ΞΏΟ€ΞΏΞΉΞ®ΞΈΞ·ΞΊΞµ'}`, type: 'success' });
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
      setToast({ msg: 'Ξ£Ο†Ξ¬Ξ»ΞΌΞ±: ' + error.message, type: 'info' });
    } else {
      setToast({ msg: 'Ξ¤ΞΏ agent Ξ΄Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ®ΞΈΞ·ΞΊΞµ!', type: 'success' });
      setShowNewAgent(false);
      setNewAgent({ name: '', channel: 'Email', status: 'inactive' });
      loadData();
    }
  };

  const deleteAgent = async (id: string) => {
    if (!confirm('Ξ•Ξ―ΟƒΞ±ΞΉ ΟƒΞ―Ξ³ΞΏΟ…ΟΞΏΟ‚ ΟΟ„ΞΉ ΞΈΞ­Ξ»ΞµΞΉΟ‚ Ξ½Ξ± Ξ΄ΞΉΞ±Ξ³ΟΞ¬ΟΞµΞΉΟ‚ Ξ±Ο…Ο„Ο Ο„ΞΏ agent;')) return;
    const { error } = await supabase.from('ai_agents').delete().eq('id', id);
    if (error) {
      setToast({ msg: 'Ξ£Ο†Ξ¬Ξ»ΞΌΞ±: ' + error.message, type: 'info' });
    } else {
      setToast({ msg: 'Ξ¤ΞΏ agent Ξ΄ΞΉΞ±Ξ³ΟΞ¬Ο†Ξ·ΞΊΞµ.', type: 'success' });
      loadData();
    }
  };

  return (
    <div className="dash-content orchestrator-tab">
      <div className="dash-content-header">
        <p>ΞΞ»ΞΏΞΊΞ»Ξ·ΟΟ‰ΞΌΞ­Ξ½Ξ· Ξ΄ΞΉΞ±Ο‡ΞµΞ―ΟΞΉΟƒΞ· ΟΞ»Ο‰Ξ½ Ο„Ο‰Ξ½ AI Agents ΞΊΞ±ΞΉ Micro Agents. Ξ Ξ±ΟΞ±ΞΊΞΏΞ»ΞΏΟΞΈΞ·ΟƒΞ· Ξ±Ο€ΟΞ΄ΞΏΟƒΞ·Ο‚, ΟΟΞΈΞΌΞΉΟƒΞ· Ο€Ξ±ΟΞ±ΞΌΞ­Ο„ΟΟ‰Ξ½, ΞΊΞ±ΞΉ ΞΏΟΞ³Ξ¬Ξ½Ο‰ΟƒΞ· Ο„ΞΏΟ… pipeline ΞµΟ€ΞΉΞΊΞΏΞΉΞ½Ο‰Ξ½Ξ―Ξ±Ο‚.</p>
      </div>

      <div className="orchestrator-nav">
        <button className={selectedView === 'overview' ? 'active' : ''} onClick={() => setSelectedView('overview')}>
          <LayoutDashboard size={16} /> Ξ•Ο€ΞΉΟƒΞΊΟΟ€Ξ·ΟƒΞ·
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
        <button className={selectedView === 'developer' ? 'active' : ''} onClick={() => setSelectedView('developer')}>
          <Database size={16} /> AI Developer
        </button>
      </div>

      {selectedView === 'overview' && (
        <div className="orchestrator-overview">
          <div className="dash-stats-grid">
            <div className="dash-stat-card">
              <div className="dash-stat-icon"><Bot size={20} /></div>
              <div>
                <strong>{agents.length}</strong>
                <span>Ξ£ΟΞ½ΞΏΞ»ΞΏ Agents</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(0,200,120,0.1)', color: '#00c878' }}><Activity size={20} /></div>
              <div>
                <strong>{activeAgents.length}</strong>
                <span>Ξ•Ξ½ΞµΟΞ³ΞΏΞ― Agents</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(0,102,204,0.1)', color: '#0066cc' }}><Users size={20} /></div>
              <div>
                <strong>{totalLeads}</strong>
                <span>Leads ΟƒΟ„ΞΏ Pipeline</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <div className="dash-stat-icon" style={{ background: 'rgba(255,165,0,0.1)', color: '#ffa500' }}><TrendingUp size={20} /></div>
              <div>
                <strong>{totalContacted}</strong>
                <span>Ξ•Ο€ΞΉΞΊΞΏΞΉΞ½Ο‰Ξ½Ξ―ΞµΟ‚</span>
              </div>
            </div>
          </div>

          <div className="orchestrator-performance">
            <h3>Ξ‘Ο€ΟΞ΄ΞΏΟƒΞ· Agents</h3>
            <div className="dash-table-wrap">
              <table className="dash-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Channel</th>
                    <th>Status</th>
                    <th>Ξ•Ο€ΞΉΞΊΞΏΞΉΞ½Ο‰Ξ½Ξ―ΞµΟ‚</th>
                    <th>Ξ‘Ο€Ξ±Ξ½Ο„Ξ®ΟƒΞµΞΉΟ‚</th>
                    <th>Ξ΅Ο…ΞΈΞΌΟΟ‚ Ξ‘Ο€Ξ¬Ξ½Ο„Ξ·ΟƒΞ·Ο‚</th>
                    <th>Ξ΅Ξ±Ξ½Ο„ΞµΞ²ΞΏΟ</th>
                    <th>Ξ΅Ο…ΞΈΞΌΟΟ‚ Ξ΅Ξ±Ξ½Ο„ΞµΞ²ΞΏΟ</th>
                    <th>Ξ•Ξ½Ξ­ΟΞ³ΞµΞΉΞµΟ‚</th>
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
                          {a.status === 'active' ? 'Ξ•Ξ½ΞµΟΞ³ΟΟ‚' : 'Ξ‘Ξ½ΞµΞ½ΞµΟΞ³ΟΟ‚'}
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
                          <button className="icon-btn" title="Ξ•Ξ½ΞµΟΞ³ΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ·/Ξ‘Ο€ΞµΞ½ΞµΟΞ³ΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ·" onClick={() => toggleAgentStatus(a)}>
                            {a.status === 'active' ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          <button className="icon-btn" title="Ξ΅ΟΞΈΞΌΞΉΟƒΞ·" onClick={() => setConfigAgent(a)}>
                            <Settings size={14} />
                          </button>
                          <button className="icon-btn delete" title="Ξ”ΞΉΞ±Ξ³ΟΞ±Ο†Ξ®" onClick={() => deleteAgent(a.id)}>
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
              <h4>ΞΞ±Ο„Ξ±Ξ½ΞΏΞΌΞ® Leads Ξ±Ξ½Ξ¬ Agent</h4>
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
              <h4>ΞΞ±Ο„Ξ¬ΟƒΟ„Ξ±ΟƒΞ· Pipeline</h4>
              <div className="pipeline-stats">
                <div className="pipeline-stat">
                  <span className="pipeline-label">ΞΞ­Ξ± Leads</span>
                  <span className="pipeline-value">{leads.filter(l => l.status === 'new' && !l.deleted_at).length}</span>
                </div>
                <div className="pipeline-stat">
                  <span className="pipeline-label">Ξ£Ξµ Ξ•ΞΎΞ­Ξ»ΞΉΞΎΞ·</span>
                  <span className="pipeline-value" style={{ color: '#ffa500' }}>{leads.filter(l => l.status === 'contacted' && !l.deleted_at).length}</span>
                </div>
                <div className="pipeline-stat">
                  <span className="pipeline-label">Ξ΅Ξ±Ξ½Ο„ΞµΞ²ΞΏΟ</span>
                  <span className="pipeline-value" style={{ color: '#00c878' }}>{leads.filter(l => l.status === 'meeting_booked' && !l.deleted_at).length}</span>
                </div>
                <div className="pipeline-stat">
                  <span className="pipeline-label">ΞΞ»ΞΏΞΊΞ»Ξ·ΟΟ‰ΞΌΞ­Ξ½Ξ±</span>
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
              <Plus size={16} /> ΞΞ­ΞΏ Agent
            </button>
          </div>

          {showNewAgent && (
            <div className="new-agent-form">
              <div className="form-row">
                <div className="form-group">
                  <label>ΞΞ½ΞΏΞΌΞ± Agent</label>
                  <input
                    value={newAgent.name}
                    onChange={(e) => setNewAgent({ ...newAgent, name: e.target.value })}
                    placeholder="Ο€.Ο‡. ΞΞ­ΞΏ Agent"
                  />
                </div>
                <div className="form-group">
                  <label>Channel</label>
                  <select value={newAgent.channel} onChange={(e) => setNewAgent({ ...newAgent, channel: e.target.value })}>
                    {channelOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>ΞΞ±Ο„Ξ¬ΟƒΟ„Ξ±ΟƒΞ·</label>
                  <select value={newAgent.status} onChange={(e) => setNewAgent({ ...newAgent, status: e.target.value })}>
                    <option value="active">Ξ•Ξ½ΞµΟΞ³ΟΟ‚</option>
                    <option value="inactive">Ξ‘Ξ½ΞµΞ½ΞµΟΞ³ΟΟ‚</option>
                  </select>
                </div>
              </div>
              <div className="form-actions">
                <button className="btn btn-ghost" onClick={() => setShowNewAgent(false)}>Ξ†ΞΊΟ…ΟΞΏ</button>
                <button className="btn btn-primary" onClick={createAgent}><CheckCircle2 size={16} /> Ξ”Ξ·ΞΌΞΉΞΏΟ…ΟΞ³Ξ―Ξ±</button>
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
                    {a.status === 'active' ? 'Ξ•Ξ½ΞµΟΞ³ΟΟ‚' : 'Ξ‘Ξ½ΞµΞ½ΞµΟΞ³ΟΟ‚'}
                  </span>
                </div>
                <div className="agent-card-stats">
                  <div className="agent-stat">
                    <span className="agent-stat-value">{a.leads_contacted || 0}</span>
                    <span className="agent-stat-label">Ξ•Ο€ΞΉΞΊΞΏΞΉΞ½Ο‰Ξ½Ξ―ΞµΟ‚</span>
                  </div>
                  <div className="agent-stat">
                    <span className="agent-stat-value">{a.replies || 0}</span>
                    <span className="agent-stat-label">Ξ‘Ο€Ξ±Ξ½Ο„Ξ®ΟƒΞµΞΉΟ‚</span>
                  </div>
                  <div className="agent-stat">
                    <span className="agent-stat-value">{a.meetings_booked || 0}</span>
                    <span className="agent-stat-label">Ξ΅Ξ±Ξ½Ο„ΞµΞ²ΞΏΟ</span>
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
                    {a.status === 'active' ? 'Ξ‘Ο€ΞµΞ½ΞµΟΞ³.' : 'Ξ•Ξ½ΞµΟΞ³.'}
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={() => setConfigAgent(a)}>
                    <Settings size={14} /> Ξ΅ΟΞΈΞΌΞΉΟƒΞ·
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
            <p className="text-muted">Micro Agents ΞµΞ―Ξ½Ξ±ΞΉ ΞΌΞΉΞΊΟΞΏΞ― ΞµΞΎΞµΞΉΞ΄ΞΉΞΊΞµΟ…ΞΌΞ­Ξ½ΞΏΞΉ agent Ο€ΞΏΟ… ΞµΞΊΟ„ΞµΞ»ΞΏΟΞ½ ΟƒΟ…Ξ³ΞΊΞµΞΊΟΞΉΞΌΞ­Ξ½ΞµΟ‚ ΞµΟΞ³Ξ±ΟƒΞ―ΞµΟ‚ (Ο€.Ο‡. ΞµΞΎΞ±Ξ³Ο‰Ξ³Ξ® Ξ΄ΞµΞ΄ΞΏΞΌΞ­Ξ½Ο‰Ξ½, Ξ±Ο…Ο„ΟΞΌΞ±Ο„Ξ· ΞΊΞ±Ο„Ξ·Ξ³ΞΏΟΞΉΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ·, Ο€Ξ±ΟΞ±ΞΊΞΏΞ»ΞΏΟΞΈΞ·ΟƒΞ· emails).</p>
          </div>
          
          <div className="micro-agents-grid">
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(0,200,120,0.1)', color: '#00c878' }}><Radar size={24} /></div>
              <h4>Lead Scraper</h4>
              <p>Ξ‘Ο…Ο„ΟΞΌΞ±Ο„Ξ· ΟƒΟ…Ξ»Ξ»ΞΏΞ³Ξ® leads Ξ±Ο€Ο Ξ΄Ξ·ΞΌΟΟƒΞΉΞΏΟ…Ο‚ ΞΊΞ±Ο„Ξ±Ξ»ΟΞ³ΞΏΟ…Ο‚</p>
              <span className="micro-agent-status active">Ξ•Ξ½ΞµΟΞ³ΟΟ‚</span>
              <div className="micro-agent-stats">
                <span>Leads ΟƒΟ…Ξ»Ξ»Ξ­Ο‡ΞΈΞ·ΞΊΞ±Ξ½: {leads.filter(l => !l.deleted_at).length}</span>
                <span>ΞΞ±Ο„Ξ·Ξ³ΞΏΟΞ―ΞµΟ‚: B2B, B2C</span>
              </div>
            </div>
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(255,165,0,0.1)', color: '#ffa500' }}><Mail size={24} /></div>
              <h4>Email Analyzer</h4>
              <p>Ξ‘Ξ½Ξ¬Ξ»Ο…ΟƒΞ· ΞΊΞ±ΞΉ ΞΊΞ±Ο„Ξ·Ξ³ΞΏΟΞΉΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ· ΞµΞΉΟƒΞµΟΟ‡ΟΞΌΞµΞ½Ο‰Ξ½ emails</p>
              <span className="micro-agent-status active">Ξ•Ξ½ΞµΟΞ³ΟΟ‚</span>
              <div className="micro-agent-stats">
                <span>Ξ•Ο€ΞΉΞΊΞΏΞΉΞ½Ο‰Ξ½Ξ―ΞµΟ‚: {totalContacted}</span>
                <span>Ξ‘Ο€Ξ±Ξ½Ο„Ξ®ΟƒΞµΞΉΟ‚: {totalReplies}</span>
              </div>
            </div>
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(0,102,204,0.1)', color: '#0066cc' }}><MessageSquare size={24} /></div>
              <h4>Sentiment Detector</h4>
              <p>Ξ‘Ξ½Ξ―Ο‡Ξ½ΞµΟ…ΟƒΞ· ΟƒΟ…Ξ½Ξ±ΞΉΟƒΞΈΞ®ΞΌΞ±Ο„ΞΏΟ‚ ΟƒΞµ ΞΌΞ·Ξ½ΟΞΌΞ±Ο„Ξ± Ο€ΞµΞ»Ξ±Ο„ΟΞ½</p>
              <span className="micro-agent-status active">Ξ•Ξ½ΞµΟΞ³ΟΟ‚</span>
              <div className="micro-agent-stats">
                <span>Ξ‘Ξ½Ξ±Ξ»ΟΟƒΞµΞΉΟ‚: {totalReplies}</span>
                <span>Ξ‘Ο…Ο„ΟΞΌΞ±Ο„Ξ· ΞΊΞ±Ο„Ξ·Ξ³ΞΏΟΞΉΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ·</span>
              </div>
            </div>
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(138,43,226,0.1)', color: '#8a2be2' }}><TrendingUp size={24} /></div>
              <h4>Lead Scorer</h4>
              <p>Ξ‘Ο…Ο„ΟΞΌΞ±Ο„Ξ· Ξ²Ξ±ΞΈΞΌΞΏΞ»ΟΞ³Ξ·ΟƒΞ· leads Ξ²Ξ¬ΟƒΞ· ΞµΞ½Ξ΄ΞΉΞ±Ο†Ξ­ΟΞΏΞ½Ο„ΞΏΟ‚</p>
              <span className="micro-agent-status active">Ξ•Ξ½ΞµΟΞ³ΟΟ‚</span>
              <div className="micro-agent-stats">
                <span>Ξ’Ξ±ΞΈΞΌΞΏΞ»ΞΏΞ³Ξ®ΞΈΞ·ΞΊΞ±Ξ½: {leads.filter(l => !l.deleted_at).length}</span>
                <span>Ξ΅Ξ±Ξ½Ο„ΞµΞ²ΞΏΟ: {totalMeetings}</span>
              </div>
            </div>
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(231,76,60,0.1)', color: '#e74c3c' }}><AlertCircle size={24} /></div>
              <h4>Notification Sender</h4>
              <p>Ξ‘Ο…Ο„ΟΞΌΞ±Ο„Ξ· Ξ±Ο€ΞΏΟƒΟ„ΞΏΞ»Ξ® ΞµΞΉΞ΄ΞΏΟ€ΞΏΞΉΞ®ΟƒΞµΟ‰Ξ½ ΟƒΟ„Ξ·Ξ½ ΞΏΞΌΞ¬Ξ΄Ξ±</p>
              <span className="micro-agent-status active">Ξ•Ξ½ΞµΟΞ³ΟΟ‚</span>
              <div className="micro-agent-stats">
                <span>Ξ•ΞΉΞ΄ΞΏΟ€ΞΏΞΉΞ®ΟƒΞµΞΉΟ‚: {totalMeetings}</span>
                <span>Ξ΅ΞΏΞ®: Ξ‘Ο…Ο„ΟΞΌΞ±Ο„Ξ·</span>
              </div>
            </div>
            <div className="micro-agent-card">
              <div className="micro-agent-icon" style={{ background: 'rgba(46,204,113,0.1)', color: '#2ecc71' }}><Database size={24} /></div>
              <h4>Data Enricher</h4>
              <p>Ξ•ΞΌΟ€Ξ»ΞΏΟ…Ο„ΞΉΟƒΞΌΟΟ‚ Ξ΄ΞµΞ΄ΞΏΞΌΞ­Ξ½Ο‰Ξ½ lead ΞΌΞµ Ξ΄Ξ·ΞΌΟΟƒΞΉΞ± Ο€Ξ»Ξ·ΟΞΏΟ†ΞΏΟΞ―ΞµΟ‚</p>
              <span className={`micro-agent-status ${crmUsers.length > 0 ? 'active' : 'inactive'}`}>
                {crmUsers.length > 0 ? 'Ξ•Ξ½ΞµΟΞ³ΟΟ‚' : 'Ξ‘Ξ½ΞµΞ½ΞµΟΞ³ΟΟ‚'}
              </span>
              <div className="micro-agent-stats">
                <span>Ξ§ΟΞ®ΟƒΟ„ΞµΟ‚ CRM: {crmUsers.length}</span>
                <span>ΞΞ±Ο„Ξ±Ξ½ΞΏΞΌΞ®: {crmUsers.filter(u => u.role === 'sales').length} Ο€Ο‰Ξ»Ξ·Ο„Ξ­Ο‚</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedView === 'pipeline' && (
        <div className="orchestrator-pipeline-view">
          <h3>Pipeline Flow</h3>
          <p className="text-muted">Ξ΅ΞΏΞ® ΞµΟΞ³Ξ±ΟƒΞΉΟΞ½ Ξ±Ο€Ο Ο„Ξ·Ξ½ ΟƒΟ…Ξ»Ξ»ΞΏΞ³Ξ® leads ΞΌΞ­Ο‡ΟΞΉ Ο„Ξ·Ξ½ ΞΌΞµΟ„Ξ±Ο„ΟΞΏΟ€Ξ® ΟƒΞµ Ο€ΞµΞ»Ξ¬Ο„Ξ·.</p>
          
          <div className="pipeline-flow">
            <div className="pipeline-stage">
              <div className="pipeline-stage-icon" style={{ background: 'rgba(0,102,204,0.1)', color: '#0066cc' }}>
                <Database size={24} />
              </div>
              <h4>1. Ξ£Ο…Ξ»Ξ»ΞΏΞ³Ξ®</h4>
              <p>B2B Scraper, Web Scraping, API Integrations</p>
              <div className="pipeline-stage-count">{leads.filter(l => l.status === 'new' && !l.deleted_at).length} leads</div>
            </div>
            <div className="pipeline-arrow">β†’</div>
            <div className="pipeline-stage">
              <div className="pipeline-stage-icon" style={{ background: 'rgba(255,165,0,0.1)', color: '#ffa500' }}>
                <Bot size={24} />
              </div>
              <h4>2. Ξ•Ο€ΞΉΞΊΞΏΞΉΞ½Ο‰Ξ½Ξ―Ξ±</h4>
              <p>AI Agents ΟƒΟ„Ξ­Ξ»Ξ½ΞΏΟ…Ξ½ Ξ±ΟΟ‡ΞΉΞΊΟ ΞΌΞ®Ξ½Ο…ΞΌΞ±</p>
              <div className="pipeline-stage-count">{leads.filter(l => l.status === 'contacted' && !l.deleted_at).length} leads</div>
            </div>
            <div className="pipeline-arrow">β†’</div>
            <div className="pipeline-stage">
              <div className="pipeline-stage-icon" style={{ background: 'rgba(0,200,120,0.1)', color: '#00c878' }}>
                <MessageSquare size={24} />
              </div>
              <h4>3. Ξ£Ο…Ξ¶Ξ®Ο„Ξ·ΟƒΞ·</h4>
              <p>AI Agents Ξ΄ΞΉΞµΞΎΞ¬Ξ³ΞΏΟ…Ξ½ ΟƒΟ…Ξ¶Ξ®Ο„Ξ·ΟƒΞ·</p>
              <div className="pipeline-stage-count">{leads.filter(l => l.status === 'meeting_booked' && !l.deleted_at).length} leads</div>
            </div>
            <div className="pipeline-arrow">β†’</div>
            <div className="pipeline-stage">
              <div className="pipeline-stage-icon" style={{ background: 'rgba(138,43,226,0.1)', color: '#8a2be2' }}>
                <Users size={24} />
              </div>
              <h4>4. Ξ΅Ξ±Ξ½Ο„ΞµΞ²ΞΏΟ</h4>
              <p>ΞΞ»ΞµΞ―ΟƒΞΉΞΌΞΏ ΟΞ±Ξ½Ο„ΞµΞ²ΞΏΟ ΞΌΞµ Ο€Ο‰Ξ»Ξ·Ο„Ξ®</p>
              <div className="pipeline-stage-count">{leads.filter(l => l.status === 'meeting_booked' && !l.deleted_at).length} leads</div>
            </div>
            <div className="pipeline-arrow">β†’</div>
            <div className="pipeline-stage">
              <div className="pipeline-stage-icon" style={{ background: 'rgba(46,204,113,0.1)', color: '#2ecc71' }}>
                <CheckCircle2 size={24} />
              </div>
              <h4>5. ΞΞµΟ„Ξ±Ο„ΟΞΏΟ€Ξ®</h4>
              <p>ΞΞ»ΞΏΞΊΞ»Ξ®ΟΟ‰ΟƒΞ· Ο€Ο‰Ξ»Ξ·ΟƒΞ·Ο‚</p>
              <div className="pipeline-stage-count">{leads.filter(l => l.status === 'converted' && !l.deleted_at).length} leads</div>
            </div>
          </div>

          <div className="pipeline-flow-details">
            <h4>Agent Workflow Rules</h4>
            <div className="workflow-rules">
              <div className="workflow-rule">
                <span className="rule-trigger">Trigger:</span> ΞΞ­ΞΏ lead ΞµΞΉΟƒΞ¬Ξ³ΞµΟ„Ξ±ΞΉ ΟƒΟ„Ξ· Ξ²Ξ¬ΟƒΞ·
              </div>
              <div className="workflow-rule">
                <span className="rule-action">Action:</span> Auto-assign ΟƒΞµ agent ΞΌΞµ Ξ»ΞΉΞ³ΟΟ„ΞµΟΞ± active leads
              </div>
              <div className="workflow-rule">
                <span className="rule-trigger">Trigger:</span> Agent ΟƒΟ„Ξ­Ξ»Ξ½ΞµΞΉ ΞΌΞ®Ξ½Ο…ΞΌΞ±
              </div>
              <div className="workflow-rule">
                <span className="rule-action">Action:</span> Ξ•Ξ½Ξ·ΞΌΞ­ΟΟ‰ΟƒΞ· pipeline_status ΟƒΞµ "contacted"
              </div>
              <div className="workflow-rule">
                <span className="rule-trigger">Trigger:</span> Lead Ξ±Ο€Ξ±Ξ½Ο„Ξ¬
              </div>
              <div className="workflow-rule">
                <span className="rule-action">Action:</span> Ξ‘ΟΞΎΞ·ΟƒΞ· replies count, ΞµΞ½Ξ·ΞΌΞ­ΟΟ‰ΟƒΞ· sentiment
              </div>
              <div className="workflow-rule">
                <span className="rule-trigger">Trigger:</span> Handoff condition ΟƒΟ…ΞΌΟ€Ξ»Ξ·ΟΟΞ½ΞµΟ„Ξ±ΞΉ
              </div>
              <div className="workflow-rule">
                <span className="rule-action">Action:</span> Ξ•ΞΉΞ΄ΞΏΟ€ΞΏΞ―Ξ·ΟƒΞ· Ο€Ο‰Ξ»Ξ·Ο„Ξ®, Ξ±Ξ»Ξ»Ξ±Ξ³Ξ® pipeline_status
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedView === 'developer' && (
        <DeveloperAgentChat />
      )}
    </div>
  );
}
