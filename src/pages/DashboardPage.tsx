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
import CustomersTab from '@/components/CustomersTab';
import LeadDetailSlideout from '@/components/LeadDetailSlideout';
import MarketRagFolders from '@/components/MarketRagFolders';
import CrmAiAssistantWidget from '@/components/CrmAiAssistantWidget';
import NotificationBell from '@/components/NotificationBell';
import CalendarView from '@/components/CalendarView';
import MarketRAGSearch from '@/components/MarketRAGSearch';
import LiveVoiceSupervisor from '@/components/LiveVoiceSupervisor';
import EntityDetailWindow from '@/components/EntityDetailWindow';
import { SERVICES_LIST, PROVIDER_LIST, LEAD_SOURCES } from '@/constants/energyData';
import SalesAgentsTab from '@/components/SalesAgentsTab';
import ProvidersCommissionsTab from '@/components/ProvidersCommissionsTab';

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
  current_provider?: string | null;
  program_name?: string | null;
  unit_rate_kwh?: number | null;
  converted_at?: string | null;
  last_contact_at?: string | null;
  ai_paused?: boolean | null;
  company_name?: string | null;
  monthly_kwh?: number | null;
  consumption_kwh?: number | null;
  service_type?: string | null;
  source?: string | null;
  government_id?: string | null;
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
  provider_name: string;
  program_name: string;
  customer_type: string;
  tariff_color: string;
  unit_rate_kwh: number;
  fixed_fee_monthly: number;
  validity_month: string;
  source_url: string;
  resource: string;
  created_at: string;
};

type Tab = 'overview' | 'agents' | 'leads' | 'sources' | 'market' | 'hub' | 'reports' | 'users' | 'scraper' | 'orchestrator' | 'settings' | 'email' | 'documents' | 'calendar' | 'market-search' | 'campaigns' | 'followup' | 'voice-supervisor' | 'providers-commissions' | 'sales-agents';

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
  const [userRole, setUserRole] = useState<string>('admin');
  const [loading, setLoading] = useState(true);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', channel: 'email' });
  const [newSource, setNewSource] = useState({ name: '', type: 'opt-in', lawful_basis: 'consent' });
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filterServiceType, setFilterServiceType] = useState('all');
  const [filterProvider, setFilterProvider] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
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
  const [openLeadFolder, setOpenLeadFolder] = useState<string | null>(null);
  const [showAddLead, setShowAddLead] = useState(false);
  const [newLead, setNewLead] = useState<Record<string, string>>({ first_name: '', last_name: '', email: '', phone: '', region: '', customer_type: 'B2C' });
  const [billUrls, setBillUrls] = useState<Array<{ url: string; name: string; type: string; size: number }>>([]);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);

  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>('general');

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
  const [leadNotes, setLeadNotes] = useState<any[]>([]);
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

  // Real-time theming: inject CSS variables from crm_settings
  useEffect(() => {
    const loadTheme = async () => {
      const { data } = await supabase.from('crm_settings').select('setting_value').eq('setting_key', 'appearance_config').single();
      if (!data?.setting_value) return;
      const s = data.setting_value;
      const root = document.documentElement;
      if (s.primary_color) root.style.setProperty('--crm-primary', s.primary_color);
      if (s.secondary_color) root.style.setProperty('--crm-secondary', s.secondary_color);
      if (s.bg_color) root.style.setProperty('--crm-bg', s.bg_color);
      if (s.surface_color) root.style.setProperty('--crm-surface', s.surface_color);
      if (s.border_radius) root.style.setProperty('--crm-radius', s.border_radius);
      if (s.logo_url) {
        const logoEl = document.querySelector('.dash-brand-logo') as HTMLImageElement | SVGElement;
        if (logoEl && logoEl.tagName === 'IMG') (logoEl as HTMLImageElement).src = s.logo_url;
      }
    };
    loadTheme();
  }, []);

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
        ? [{ path: openLead.bill_file_path, name: openLead.bill_file_name || 'Λογαριασμός', type: 'application/pdf', size: 0 }]
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

    // RBAC: Fetch user role first to determine lead filtering
    let currentRole = 'admin';
    if (user?.id) {
      const { data: myProfile } = await supabase.from('crm_users').select('role').eq('id', user.id).single();
      if (myProfile?.role) { currentRole = myProfile.role; setUserRole(myProfile.role); }
    }

    // RBAC: Sales users only see their own assigned leads
    let leadsQuery = supabase.from('hlektrismos_leads').select('*').order('created_at', { ascending: false });
    if (currentRole === 'sales' && user?.id) {
      leadsQuery = leadsQuery.eq('assigned_to', user.id);
    }

    const [leadsRes, agentsRes, sourcesRes, tariffsRes, usersRes, notesRes] = await Promise.all([
      leadsQuery,
      supabase.from('ai_agents').select('*').order('created_at', { ascending: false }),
      supabase.from('lead_sources').select('*').order('created_at', { ascending: false }),
      supabase.rpc('get_active_tariff_prices'),
      supabase.from('crm_users').select('*').order('created_at', { ascending: false }),
      supabase.from('lead_notes').select('*').order('created_at', { ascending: false }),
    ]);
    if (leadsRes.data) setLeads(leadsRes.data as Lead[]);
    if (agentsRes.data) setAgents(agentsRes.data as Agent[]);
    if (sourcesRes.data) setSources(sourcesRes.data as Source[]);
    if (tariffsRes.data) setTariffs(tariffsRes.data as Tariff[]);
    if (usersRes.data) setCrmUsers(usersRes.data as CrmUser[]);
    if (notesRes.data) setLeadNotes(notesRes.data);
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

  const bulkSoftDeleteLeads = async () => {
    if (selectedLeads.size === 0) return;
    const ids = Array.from(selectedLeads);
    await supabase.from('hlektrismos_leads').update({ deleted_at: new Date().toISOString() }).in('id', ids);
    setSelectedLeads(new Set());
    setToast({ msg: `${ids.length} leads μεταφέρθηκαν στα διεγραμμένα.`, type: 'success' });
    loadData();
  };

  const handleAddLead = async () => {
    if (!newLead.first_name && !newLead.last_name) return;
    const { error } = await supabase.from('hlektrismos_leads').insert({
      first_name: newLead.first_name,
      last_name: newLead.last_name,
      email: newLead.email || null,
      phone: newLead.phone || null,
      region: newLead.region || null,
      customer_type: newLead.customer_type,
      status: 'new',
      source: 'manual_entry',
    });
    if (!error) {
      setShowAddLead(false);
      setNewLead({ first_name: '', last_name: '', email: '', phone: '', region: '', customer_type: 'B2C' });
      setToast({ msg: 'Lead δημιουργήθηκε!', type: 'success' });
      loadData();
    }
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
    try {
      const { error } = await supabase.functions.invoke('sync-market-tariffs');
      if (error) throw error;
      setToast({ msg: 'Η βάση γνώσης ενημερώθηκε.', type: 'success' });
      loadData();
    } catch (e: any) {
      setToast({ msg: `Σφάλμα: ${e.message}`, type: 'info' });
    }
    setSyncing(false);
  };

  const updateTariffPrice = async (t: Tariff) => {
    const newPrice = prompt(`Εισάγετε νέα τιμή/kWh για ${t.provider_name} - ${t.program_name}:`, t.unit_rate_kwh.toString());
    if (newPrice !== null && !isNaN(parseFloat(newPrice))) {
      // Find the latest price record for this tariff
      const { data: priceRecord } = await supabase
        .from('energy_tariff_prices')
        .select('id')
        .eq('tariff_id', t.tariff_id || t.id)
        .order('validity_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (priceRecord) {
        await supabase.from('energy_tariff_prices').update({ unit_rate_kwh: parseFloat(newPrice), base_price_day: parseFloat(newPrice) }).eq('id', priceRecord.id);
      } else {
        // Create a new price record
        await supabase.from('energy_tariff_prices').insert({
          tariff_id: t.tariff_id || t.id,
          unit_rate_kwh: parseFloat(newPrice),
          base_price_day: parseFloat(newPrice),
          validity_from: new Date().toISOString().split('T')[0],
        });
      }
      loadData();
      setToast({ msg: 'Η τιμή ενημερώθηκε.', type: 'success' });
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

    // Service type filter
    const matchesServiceType = filterServiceType === 'all' || l.service_type === filterServiceType;
    // Provider filter
    const matchesProvider = filterProvider === 'all' || l.current_provider === filterProvider;
    // Source filter
    const matchesSource = filterSource === 'all' || l.source === filterSource;

    return matchesSearch && matchesDate && matchesServiceType && matchesProvider && matchesSource;
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
    const tariffLines = tariffs.map((t) => `  - ${t.provider_name}: ${t.program_name} @ ${t.unit_rate_kwh} €/kWh (${t.fixed_fee_monthly} €/μήνα, ${t.tariff_color}, ${t.customer_type})`).join('\n');
    return `Είσαι ο ${activeAgent.name}, ένας αυτόνομος ${activeAgent.channel} agent της Hlektrismos.gr.\n\nΒΑΣΙΚΟ PROMPT:\n${activeAgent.base_prompt || '(Δεν έχει οριστεί base prompt)'}\n\nΣΤΟΧΟΣ: ${activeAgent.target_region || 'Όλη η Ελλάδα'}\n\nΠΑΡΑΔΟΣΗ ΣΕ ΑΝΘΡΩΠΟ: ${activeAgent.handoff_condition || 'Interest Confirmed'}\n\nΖΩΝΤΑΝΑ ΤΑΡΙΦΑ (RAG Knowledge Base):\n${tariffLines}\n\nΟδηγίες: Επικοινώνησε με leads στην περιοχή στόχου, πρότεινε τα παραπάνω τιμολόγια, και παράδωσε σε άνθρωπο όταν: ${activeAgent.handoff_condition || 'Interest Confirmed'}.`;
  };

  const tabLabels: Record<Tab, string> = {
    overview: 'Επισκόπηση',
    agents: 'AI Agents',
    leads: 'Leads',
    sources: 'Πηγές Leads',
    market: 'Φάκελοι Παρόχων',
    hub: 'Agent Hub',
    orchestrator: 'Orchestrator Director',
    settings: 'Ρυθμίσεις & Integrations',
    email: '📧 Email',
    reports: 'Reports',
    calendar: '📅 Ημερολόγιο',
    'market-search': '🔍 AI Σύμβουλος Αγοράς',
    campaigns: '📣 Campaigns',
    users: 'Χρήστες',
    scraper: 'B2B Scraper',
    documents: 'Έγγραφα',
    followup: '👥 Πελάτες & Follow-Up',
    'providers-commissions': '📊 Πάροχοι & Προμήθειες',
    'sales-agents': '🏆 Πωλητές',
  };

  const toggleCategory = (cat: string) => {
    // If sidebar is collapsed, expand it first
    if (!isSidebarOpen) setIsSidebarOpen(true);
    // Exclusive: close if already open, otherwise open this one
    setActiveCategory(prev => prev === cat ? null : cat);
  };

  const navCategories = [
    { key: 'general', label: '📊 Γενικά', items: [
      { tab: 'overview' as Tab, icon: '🏠', label: 'Επισκόπηση' },
      { tab: 'calendar' as Tab, icon: '📅', label: 'Ημερολόγιο' },
    ]},
    { key: 'sales', label: '💼 Πωλήσεις', items: [
      { tab: 'leads' as Tab, icon: '🎯', label: 'Leads' },
      { tab: 'followup' as Tab, icon: '👥', label: 'Πελάτες & Follow-Up' },
      { tab: 'sales-agents' as Tab, icon: '🏆', label: 'Πωλητές' },
      { tab: 'providers-commissions' as Tab, icon: '📊', label: 'Πάροχοι & Προμήθειες' },
      { tab: 'scraper' as Tab, icon: '🏢', label: 'B2B Scraper' },
      { tab: 'sources' as Tab, icon: '📥', label: 'Πηγές Leads' },
    ]},
    { key: 'market', label: '⚡ Αγορά & RAG', items: [
      { tab: 'market' as Tab, icon: '📂', label: 'Φάκελοι Παρόχων' },
      { tab: 'market-search' as Tab, icon: '🔍', label: 'AI Σύμβουλος' },
    ]},
    { key: 'ai', label: '🤖 AI Σύστημα', items: [
      { tab: 'hub' as Tab, icon: '🧠', label: 'Agent Hub' },
      { tab: 'agents' as Tab, icon: '🤖', label: 'AI Agents' },
      { tab: 'orchestrator' as Tab, icon: '⚙️', label: 'Orchestrator Director' },
      { tab: 'voice-supervisor' as Tab, icon: '📞', label: 'Voice Supervisor' },
    ]},
    { key: 'workspace', label: '✉️ Workspace', items: [
      { tab: 'email' as Tab, icon: '📧', label: 'Email' },
      { tab: 'campaigns' as Tab, icon: '📣', label: 'Campaigns' },
      { tab: 'documents' as Tab, icon: '📄', label: 'Έγγραφα' },
    ]},
    { key: 'admin', label: '⚙️ Διαχείριση', items: [
      { tab: 'reports' as Tab, icon: '📈', label: 'Reports' },
      { tab: 'users' as Tab, icon: '👥', label: 'Χρήστες' },
      { tab: 'settings' as Tab, icon: '🛠️', label: 'Ρυθμίσεις' },
    ]},
  ];

  // RBAC: Filter nav categories based on user role
  const allowedTabsByRole: Record<string, Tab[]> = {
    admin: ['overview', 'leads', 'followup', 'agents', 'sources', 'market', 'hub', 'orchestrator', 'email', 'campaigns', 'documents', 'reports', 'users', 'settings', 'scraper', 'market-search', 'calendar', 'voice-supervisor', 'providers-commissions', 'sales-agents'],
    management: ['overview', 'leads', 'followup', 'agents', 'sources', 'market', 'hub', 'orchestrator', 'email', 'campaigns', 'documents', 'reports', 'scraper', 'market-search', 'calendar', 'voice-supervisor', 'providers-commissions', 'sales-agents'],
    sales: ['overview', 'leads', 'followup', 'market', 'hub', 'email', 'campaigns', 'documents', 'market-search', 'calendar', 'providers-commissions', 'sales-agents'],
    secretary: ['overview', 'leads', 'followup', 'email', 'calendar'],
    it: ['overview', 'settings', 'hub', 'orchestrator'],
  };
  const allowedTabs = allowedTabsByRole[userRole] || allowedTabsByRole.admin;

  const visibleNavCategories = navCategories
    .map(cat => ({ ...cat, items: cat.items.filter(item => allowedTabs.includes(item.tab)) }))
    .filter(cat => cat.items.length > 0);

  // RBAC: Redirect to overview if user lands on a restricted tab
  useEffect(() => {
    if (!loading && !allowedTabs.includes(tab)) {
      setTab('overview');
    }
  }, [tab, loading, allowedTabs]);

  const canManage = ['admin', 'management'].includes(userRole);
  const canEditSettings = userRole === 'admin';

  const handleNavClick = (t: Tab) => {
    if (!allowedTabs.includes(t)) {
      setToast({ msg: 'Δεν έχετε δικαίωμα πρόσβασης σε αυτή τη σελίδα.', type: 'info' });
      return;
    }
    setTab(t);
    setIsMobileMenuOpen(false);
  };

  const sidebarContent = (
    <>
      <div className="dash-brand" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ cursor: 'pointer' }} title="Toggle Sidebar">
        <svg viewBox="0 0 100 100" className="dash-brand-logo" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="brandGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0EA5E9" />
              <stop offset="100%" stopColor="#0B2545" />
            </linearGradient>
            <filter id="subtleShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#0B2545" floodOpacity="0.25"/>
            </filter>
          </defs>
          <circle cx="50" cy="50" r="43" fill="none" stroke="url(#brandGradient)" strokeWidth="4.5" filter="url(#subtleShadow)" />
          <circle cx="50" cy="50" r="35" fill="none" stroke="url(#brandGradient)" strokeWidth="1.5" opacity="0.5" />
          <path d="M 54 15 L 28 50 L 48 50 L 36 85 L 75 42 L 53 42 Z" fill="url(#brandGradient)" stroke="white" strokeWidth="1.5" strokeLinejoin="round" filter="url(#subtleShadow)" />
        </svg>
        <span className="dash-brand-text">Hlektrismos.gr</span>
      </div>

      <nav className="dash-nav">
        {visibleNavCategories.map((cat) => {
          const isOpen = activeCategory === cat.key;
          return (
            <div key={cat.key} className="accordion-group">
              {/* Collapsed: show only category icon */}
              {isSidebarOpen === false ? (
                <div
                  className="collapsed-cat-icon"
                  onClick={() => { setIsSidebarOpen(true); setActiveCategory(cat.key); }}
                  title={cat.label}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 40, borderRadius: 10, cursor: 'pointer', fontSize: 18, margin: '2px auto', transition: 'background 0.15s', background: isOpen ? 'rgba(0,102,204,0.08)' : 'transparent' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isOpen ? 'rgba(0,102,204,0.08)' : 'transparent'; }}
                >
                  {cat.label.split(' ')[0]}
                </div>
              ) : (
                <>
                  <div className="accordion-header" onClick={() => toggleCategory(cat.key)}>
                    <span className="accordion-label">{cat.label}</span>
                    <span className={`chevron ${isOpen ? 'open' : ''}`}>▶</span>
                  </div>
                  <div className={`accordion-items ${isOpen ? '' : 'collapsed'}`} style={{ maxHeight: isOpen ? `${cat.items.length * 44}px` : '0' }}>
                    {cat.items.map((item) => (
                      <button
                        key={item.tab}
                        className={tab === item.tab ? 'active' : ''}
                        onClick={() => handleNavClick(item.tab)}
                        title={item.label}
                      >
                        <span>{item.icon}</span>
                        <span className="accordion-item">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </nav>

      <div className="dash-sidebar-footer">
        <div className="dash-user">
          <div className="dash-user-avatar">{user?.email?.[0]?.toUpperCase()}</div>
          <span>{user?.email}</span>
        </div>
        <button className="dash-logout" onClick={signOut}><LogOut size={16} /> <span>Αποσύνδεση</span></button>
      </div>
    </>
  );

  return (
    <div className="dashboard-shell">
      {/* Mobile backdrop */}
      <div className={`mobile-backdrop ${isMobileMenuOpen ? 'visible' : ''}`} onClick={() => setIsMobileMenuOpen(false)} />

      {/* Desktop sidebar */}
      <aside className={`dash-sidebar ${isSidebarOpen ? '' : 'collapsed'}`}>
        {sidebarContent}
      </aside>

      {/* Mobile sidebar */}
      <aside className={`dash-sidebar mobile-only-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`} style={{ position: 'fixed', left: isMobileMenuOpen ? 0 : -280, top: 0, bottom: 0, zIndex: 60, transition: 'left 0.25s ease' }}>
        {sidebarContent}
      </aside>

      <div className="dash-main">
        <header className="dash-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="mobile-hamburger" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>☰</button>
            <h1>{tabLabels[tab]}</h1>
          </div>
          <div className="dash-header-right">
            <NotificationBell />
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
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(0,200,120,0.08), rgba(0,102,204,0.05))', border: '1px solid rgba(0,200,120,0.15)', cursor: 'pointer' }} onClick={() => setTab('leads')}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(0,200,120,0.15)', color: '#00c878' }}><Users size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{leads.filter(l => !l.deleted_at).length}</strong><span>Σύνολο Leads</span></div>
                  </div>
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(0,102,204,0.08), rgba(0,200,120,0.05))', border: '1px solid rgba(0,102,204,0.15)', cursor: 'pointer' }} onClick={() => setTab('agents')}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(0,102,204,0.15)', color: '#0066cc' }}><Bot size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{agents.filter(a => !a.deleted_at && a.status === 'active').length}</strong><span>Ενεργά AI Agents</span></div>
                  </div>
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(147,51,234,0.08), rgba(0,102,204,0.05))', border: '1px solid rgba(147,51,234,0.15)', cursor: 'pointer' }} onClick={() => setTab('email')}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(147,51,234,0.15)', color: '#9333ea' }}><Mail size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{totalLeadsContacted}</strong><span>Επικοινωνίες</span></div>
                  </div>
                  <div className="dash-stat-card" style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(0,200,120,0.05))', border: '1px solid rgba(245,158,11,0.15)', cursor: 'pointer' }} onClick={() => setTab('reports')}>
                    <div className="dash-stat-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}><TrendingUp size={24} /></div>
                    <div><strong style={{ fontSize: 32 }}>{conversionRate}%</strong><span>Conversion Rate</span></div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '24px' }}>
                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>📋 Πρόσφατα Leads</h3>
                      <button onClick={() => setTab('leads')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>Προβολή όλων →</button>
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
                    {leads.filter(l => !l.deleted_at).length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Δεν υπάρχουν leads.</p>}
                  </div>

                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text)' }}>🤖 AI Agents Status</h3>
                      <button onClick={() => setTab('agents')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '12px', cursor: 'pointer', fontWeight: 600 }}>Διαχείριση →</button>
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
                          {a.status === 'active' ? 'Ενεργός' : 'Ανενεργός'}
                        </span>
                      </div>
                    ))}
                    {agents.filter(a => !a.deleted_at).length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Δεν υπάρχουν agents.</p>}
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginTop: '24px' }}>
                  {[
                    { icon: '🤖', label: 'Agent Hub', tab: 'hub', desc: 'AI συνομιλία' },
                    { icon: '🔍', label: 'B2B Scraper', tab: 'scraper', desc: 'Αναζήτηση leads' },
                    { icon: '📊', label: 'Orchestrator', tab: 'orchestrator', desc: 'Director view' },
                    { icon: '📈', label: 'Email', tab: 'email', desc: 'Διαχείριση email' },
                    { icon: '📂', label: 'Φάκελοι Παρόχων', tab: 'market', desc: 'Τιμολόγια 10 παρόχων', color: '#0B2545' },
                    { icon: '🔍', label: 'AI Σύμβουλος', tab: 'market-search', desc: 'RAEYE AI αναζήτηση', color: '#0EA5E9' },
                  ].map((action) => (
                    <button
                      key={action.tab}
                      onClick={() => setTab(action.tab as Tab)}
                      style={{
                        background: action.color ? `${action.color}08` : 'var(--surface)',
                        border: `1px solid ${action.color ? `${action.color}25` : 'var(--border)'}`,
                        borderRadius: '12px',
                        padding: '16px', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = action.color || 'var(--primary)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = action.color ? `${action.color}25` : 'var(--border)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                    >
                      <div style={{ fontSize: '24px', marginBottom: '6px' }}>{action.icon}</div>
                      <div style={{ fontWeight: 600, fontSize: '13px', color: action.color || 'var(--text)' }}>{action.label}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{action.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'agents' && (
              <div className="dash-content">
                <div className="dash-content-header">
                  <p>Διαχείριση AI Agents — παρακολούθηση απόδοσης, ρύθμιση παραμέτρων, ενεργοποίηση/απενεργοποίηση.</p>
                  {canManage && <button className="btn btn-primary" onClick={() => setConfigAgent(null)}><Plus size={16} /> Νέο Agent</button>}
                </div>
                <div className="dash-table-wrap">
                  <table className="dash-table">
                    <thead>
                      <tr>
                        <th>Agent</th><th>Channel</th><th>Status</th><th>Περιοχή</th><th>Επικοινωνίες</th><th>Απαντήσεις</th><th>Ραντεβού</th><th>Ενέργεια</th>
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
                              {a.status === 'active' ? 'Ενεργός' : a.status === 'paused' ? 'Παυμένος' : a.status}
                            </span>
                          </td>
                          <td>{a.target_region || '—'}</td>
                          <td><strong>{a.leads_contacted || 0}</strong></td>
                          <td><strong>{a.replies || 0}</strong></td>
                          <td><strong>{a.meetings_booked || 0}</strong></td>
                          <td>
                            {canManage ? (
                            <div className="dash-lead-actions">
                              <button className="icon-btn" title="Ενεργοποίηση/Απενεργοποίηση" onClick={async () => {
                                const newStatus = a.status === 'active' ? 'paused' : 'active';
                                await supabase.from('ai_agents').update({ status: newStatus }).eq('id', a.id);
                                loadData();
                              }}>
                                {a.status === 'active' ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                              <button className="icon-btn" title="Ρυθμίσεις" onClick={() => setConfigAgent(a)}>
                                <Settings size={14} />
                              </button>
                              <button className="icon-btn" title="Διαγραφή" onClick={async () => {
                                await supabase.from('ai_agents').update({ deleted_at: new Date().toISOString() }).eq('id', a.id);
                                loadData();
                              }}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                            ) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>👁️ Μόνο ανάγνωση</span>}
                          </td>
                        </tr>
                      ))}
                      {agents.filter(a => !a.deleted_at).length === 0 && (
                        <tr><td colSpan={8} className="dash-empty">Δεν υπάρχουν agents. Πατήστε "Νέο Agent" για να δημιουργήσετε.</td></tr>
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
                    <p style={{ margin: 0 }}>Διαχείριση Leads — αναζήτηση, φίλτρα, ανάθεση σε AI agents.</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => setShowAddLead(!showAddLead)} style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Plus size={14} /> Νέο Lead
                      </button>
                    </div>
                    {selectedLeads.size > 0 ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => setTab('campaigns')}
                          style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                            background: '#0066cc', color: '#fff', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.15s',
                          }}
                        >
                          <Mail size={14} /> 📣 Καμπάνια ({selectedLeads.size})
                        </button>
                        <button
                          onClick={bulkSoftDeleteLeads}
                          style={{
                            padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                            background: '#e74c3c', color: '#fff', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px', transition: 'background 0.15s',
                          }}
                        >
                          <Trash2 size={14} /> Διαγραφή ({selectedLeads.size})
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-primary" onClick={() => { setSearch(''); setStatusFilter('all'); setDateFrom(''); setDateTo(''); setLeadsSubTab('all'); }}>
                        <RefreshCw size={14} /> Επαναφορά Φίλτρων
                      </button>
                    )}
                  </div>

                  {/* Add Lead Form */}
                  {showAddLead && (
                    <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 10, border: '1px solid #bbf7d0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'end' }}>
                      <div><label style={{ fontSize: 10, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 2 }}>Όνομα *</label><input value={newLead.first_name} onChange={e => setNewLead(c => ({ ...c, first_name: e.target.value }))} placeholder="Γιώργος" style={{ width: '100%', padding: '6px 8px', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, background: '#fff', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: 10, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 2 }}>Επώνυμο</label><input value={newLead.last_name} onChange={e => setNewLead(c => ({ ...c, last_name: e.target.value }))} placeholder="Παπαδόπουλος" style={{ width: '100%', padding: '6px 8px', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, background: '#fff', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: 10, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 2 }}>Email</label><input value={newLead.email} onChange={e => setNewLead(c => ({ ...c, email: e.target.value }))} placeholder="email@gr" style={{ width: '100%', padding: '6px 8px', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, background: '#fff', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: 10, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 2 }}>Τηλέφωνο</label><input value={newLead.phone} onChange={e => setNewLead(c => ({ ...c, phone: e.target.value }))} placeholder="69..." style={{ width: '100%', padding: '6px 8px', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, background: '#fff', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: 10, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 2 }}>Περιοχή</label><input value={newLead.region} onChange={e => setNewLead(c => ({ ...c, region: e.target.value }))} placeholder="Αθήνα" style={{ width: '100%', padding: '6px 8px', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, background: '#fff', outline: 'none' }} /></div>
                      <div><label style={{ fontSize: 10, fontWeight: 600, color: '#166534', display: 'block', marginBottom: 2 }}>Τύπος</label><select value={newLead.customer_type} onChange={e => setNewLead(c => ({ ...c, customer_type: e.target.value }))} style={{ width: '100%', padding: '6px 8px', border: '1px solid #86efac', borderRadius: 6, fontSize: 11, background: '#fff', outline: 'none' }}><option value="B2C">B2C</option><option value="B2B">B2B</option></select></div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={handleAddLead} disabled={!newLead.first_name} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: newLead.first_name ? '#10b981' : '#94a3b8', color: '#fff', fontSize: 11, fontWeight: 600, cursor: newLead.first_name ? 'pointer' : 'not-allowed' }}>Αποθήκευση</button>
                        <button onClick={() => setShowAddLead(false)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#64748b' }}>X</button>
                      </div>
                    </div>
                  )}

                  {/* Sub-tabs (folders) */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {[
                      { key: 'all', label: 'Όλα', icon: '📁' },
                      { key: 'new', label: 'Νέα', icon: '🆕' },
                      { key: 'contacted', label: 'Επικοινωνήθηκε', icon: '📞' },
                      { key: 'qualified', label: 'Qualified', icon: '✅' },
                      { key: 'converted', label: 'Μετατράπηκε', icon: '🎉' },
                      { key: 'lost', label: 'Χαμένα', icon: '❌' },
                      { key: 'deleted', label: 'Διεγραμμένα', icon: '🗑️' },
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
                        placeholder="Αναζήτηση με όνομα, email, τηλέφωνο ή περιοχή..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '13px', background: 'var(--surface)', color: 'var(--text)' }}
                      />
                      {search && (
                        <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}>✕</button>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        title="Από"
                        style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', background: 'var(--surface)', color: 'var(--text)' }}
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        title="Έως"
                        style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px', background: 'var(--surface)', color: 'var(--text)' }}
                      />
                    </div>
                    {(search || dateFrom || dateTo) && (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {filteredLeads.length} αποτελέσματα
                      </span>
                    )}
                  </div>

                  {/* Service/Provider/Source Filters */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={filterServiceType} onChange={e => setFilterServiceType(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                      <option value="all">Υπηρεσία: Όλες</option>
                      {SERVICES_LIST.map(s => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
                    </select>
                    <select value={filterProvider} onChange={e => setFilterProvider(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                      <option value="all">Πάροχος: Όλοι</option>
                      {PROVIDER_LIST.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
                      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer' }}>
                      <option value="all">Πηγή: Όλες</option>
                      {LEAD_SOURCES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    {(filterServiceType !== 'all' || filterProvider !== 'all' || filterSource !== 'all') && (
                      <button onClick={() => { setFilterServiceType('all'); setFilterProvider('all'); setFilterSource('all'); }}
                        style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                        Καθαρισμός Φίλτρων
                      </button>
                    )}
                    {(filterServiceType !== 'all' || filterProvider !== 'all' || filterSource !== 'all') && (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {filteredLeads.length} αποτελέσματα
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
                          <th>Όνομα</th><th>Email</th><th>Τηλέφωνο</th><th>Περιοχή</th><th>Τύπος</th><th>Υπηρεσία</th><th>Πάροχος</th><th>Πηγή</th><th>Status</th><th>Ενέργεια</th>
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
                                  <option value="" disabled>—</option>
                                  <option value="B2C_Household">B2C</option>
                                  <option value="B2B_Corporate">B2B</option>
                                </select>
                              </td>
                              <td>
                                {l.service_type ? (
                                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e', whiteSpace: 'nowrap' }}>
                                    {SERVICES_LIST.find(s => s.key === l.service_type)?.icon} {l.service_type}
                                  </span>
                                ) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                              </td>
                              <td>
                                {l.current_provider ? (
                                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: '#dbeafe', color: '#1e40af', whiteSpace: 'nowrap' }}>
                                    {l.current_provider}
                                  </span>
                                ) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
                              </td>
                              <td>
                                {l.source ? (
                                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                    {LEAD_SOURCES.find(s => s.key === l.source)?.label || l.source}
                                  </span>
                                ) : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>}
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
                                <div className="dash-lead-actions" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    onClick={() => setOpenLeadFolder(l.id)}
                                    title="Άνοιγμα Φακέλου"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                                      padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(99,102,241,0.3)',
                                      background: 'rgba(99,102,241,0.06)', color: '#6366f1', cursor: 'pointer',
                                      fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = '#6366f1'; e.currentTarget.style.color = '#fff'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(99,102,241,0.06)'; e.currentTarget.style.color = '#6366f1'; }}
                                  >
                                    <FolderOpen size={13} /> Φάκελος
                                  </button>
                                  <button
                                    onClick={() => softDeleteLead(l.id)}
                                    title="Μεταφορά στα Διεγραμμένα"
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                                      padding: '5px 10px', borderRadius: '6px', border: '1px solid rgba(231,76,60,0.3)',
                                      background: 'rgba(231,76,60,0.06)', color: '#e74c3c', cursor: 'pointer',
                                      fontSize: '12px', fontWeight: 500, whiteSpace: 'nowrap', transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = '#e74c3c'; e.currentTarget.style.color = '#fff'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(231,76,60,0.06)'; e.currentTarget.style.color = '#e74c3c'; }}
                                  >
                                    <Trash2 size={13} /> Διαγραφή
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {filteredLeads.length === 0 && <p className="dash-empty">Δεν βρέθηκαν leads σε αυτόν τον φάκελο.</p>}
                  </div>
                )}

                {/* Deleted leads table */}
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

                {/* Real-time Aggregate Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                  <div className="dash-stat-card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Σύνολο Leads</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{leads.length}</div>
                  </div>
                  <div className="dash-stat-card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Αυτόν τον Μήνα</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#0066cc' }}>
                      {leads.filter(l => { const d = new Date(l.created_at); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length}
                    </div>
                  </div>
                  <div className="dash-stat-card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Ενεργοί</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>
                      {leads.filter(l => l.status === 'new' || l.status === 'contacted' || l.status === 'qualified').length}
                    </div>
                  </div>
                  <div className="dash-stat-card" style={{ padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Πηγές</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{sources.length}</div>
                  </div>
                </div>

                {/* B2B Scraper Source (always shown) */}
                <div style={{ marginBottom: 16, padding: '12px 16px', background: 'rgba(0,102,204,0.04)', border: '1px solid rgba(0,102,204,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(0,102,204,0.1)', display: 'grid', placeItems: 'center' }}><Database size={16} style={{ color: '#0066cc' }} /></div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>SerpApi Google Maps Engine</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>B2B Scraper — Νόμιμη Συλλογή Δεδομένων</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(0,200,120,0.1)', color: '#00c878', fontWeight: 600 }}>Legitimate Interest (GDPR Art.6(1)(f))</span>
                    <span className="dash-status-pill active" style={{ fontSize: 11 }}>active</span>
                  </div>
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
              <MarketRagFolders />
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
                leadNotes={leadNotes}
                leads={leads}
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
                tariffs={tariffs}
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
            {tab === 'calendar' && (
              <CalendarView leads={leads.filter(l => !l.deleted_at)} />
            )}
            {tab === 'market-search' && (
              <div style={{ padding: 20, height: 'calc(100vh - 120px)' }}>
                <MarketRAGSearch />
              </div>
            )}
            {tab === 'campaigns' && (
              <CampaignsTab leads={leads} preSelectedLeadIds={selectedLeads} toast={toast} setToast={setToast} onClearSelection={() => setSelectedLeads(new Set())} />
            )}
            {tab === 'documents' && (
              <DocumentGenerator toast={toast} setToast={setToast} />
            )}
            {tab === 'followup' && (
              <>
                <CustomersTab />
                <FollowUpFolder leads={leads} crmUsers={crmUsers} toast={toast} setToast={setToast} loadData={loadData} />
              </>
            )}
            {tab === 'voice-supervisor' && (
              <LiveVoiceSupervisor />
            )}
            {tab === 'providers-commissions' && (
              <ProvidersCommissionsTab />
            )}
            {tab === 'sales-agents' && (
              <SalesAgentsTab />
            )}
          </>
        )}
      </div>

      {configAgent && (
        <AgentConfigDrawer agent={configAgent} onClose={() => setConfigAgent(null)} onSave={saveAgentConfig} />
      )}

      {openLead && (
        <LeadDetailSlideout
          lead={openLead}
          onClose={() => setOpenLead(null)}
          crmUsers={crmUsers}
        />
      )}

      {openLeadFolder && (
        <EntityDetailWindow
          entityId={openLeadFolder}
          entityType="lead"
          onClose={() => setOpenLeadFolder(null)}
          onSaved={loadData}
        />
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

/* ═══════════════════════════════════════════════════════════════
   AGENT HUB — Chat Input Toolbar (Claude-style + menu, mic, voice)
   ═══════════════════════════════════════════════════════════════ */

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
            <span>📎 Προσθήκη αρχείων ή φωτογραφιών</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-2)', padding: '2px 6px', borderRadius: '4px' }}>Ctrl+U</span>
          </button>
          <button onClick={() => onOpenSettings('skills')} style={menuItemStyle}>
            <span>📁 Προσθήκη σε project</span><span>›</span>
          </button>
          <button onClick={() => onOpenSettings('connectors')} style={menuItemStyle}>
            <span>🐙 Προσθήκη από GitHub</span>
          </button>
          <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
          <button onClick={() => onOpenSettings('skills')} style={menuItemStyle}>
            <span>🛠️ Skills (Δεξιότητες)</span><span>›</span>
          </button>
          <button onClick={() => onOpenSettings('connectors')} style={menuItemStyle}>
            <span>🔌 Connectors (Συνδέσεις)</span><span>›</span>
          </button>
          <button onClick={() => onOpenSettings('plugins')} style={menuItemStyle}>
            <span>🧩 Plugins (Πρόσθετα)</span><span>›</span>
          </button>
          <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
          <button onClick={() => setWebSearchEnabled(!webSearchEnabled)} style={{ ...menuItemStyle, justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>🌐 Αναζήτηση στο Web</span>
            {webSearchEnabled && <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓</span>}
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
        }} title="Προσθήκη υλικού & εργαλείων">+</button>

        <textarea
          value={message} onChange={(e) => setMessage(e.target.value)} onKeyDown={handleKeyDown}
          placeholder="Στείλτε μήνυμα στον Agent Hub..." rows={1}
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '14px', resize: 'none', fontFamily: 'inherit' }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={() => setIsRecording(!isRecording)} style={{
            background: isRecording ? 'rgba(239,68,68,0.15)' : 'transparent',
            border: 'none', borderRadius: '50%', width: '32px', height: '32px',
            color: isRecording ? '#ef4444' : 'var(--text-muted)', cursor: 'pointer', fontSize: '16px'
          }} title="Φωνητική υπαγόρευση">🎙️</button>
          <button style={{
            background: 'transparent', border: 'none', borderRadius: '50%', width: '32px', height: '32px',
            color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px'
          }} title="Live Voice Assistant Stream">📊</button>
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
            title="Αποστολή μηνύματος"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   AGENT HUB — Settings Modal (Claude-inspired, 6 tabs)
   ═══════════════════════════════════════════════════════════════ */

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
          <div style={{ fontSize: '15px', fontWeight: 'bold', padding: '0 8px', color: 'var(--text)' }}>Ρυθμίσεις Agent</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={navSectionHeader}>ΓΕΝΙΚΑ</div>
            <button onClick={() => setActiveCategory('general')} style={navItemStyle(activeCategory === 'general')}>⚙️ General</button>
            <button onClick={() => setActiveCategory('visuals')} style={navItemStyle(activeCategory === 'visuals')}>🎨 Appearance & Visuals</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={navSectionHeader}>CAPABILITIES</div>
            <button onClick={() => setActiveCategory('code')} style={navItemStyle(activeCategory === 'code')}>💻 Code & Execution</button>
            <button onClick={() => setActiveCategory('connectors')} style={navItemStyle(activeCategory === 'connectors')}>🔌 Connectors</button>
            <button onClick={() => setActiveCategory('security')} style={navItemStyle(activeCategory === 'security')}>🔒 Security & Tokens</button>
          </div>
          <button onClick={onClose} style={{ marginTop: 'auto', padding: '10px', background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: '8px', color: 'var(--text-muted)', cursor: 'pointer' }}>✖ Κλείσιμο</button>
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
                <ToggleRow label="Allow network egress ⚠️" description="Allow the Agent to access common package managers to install packages and libraries." checked={networkEgress} onChange={setNetworkEgress} />
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
              <p style={subTextStyle}>Συνδέστε εξωτερικές πλατφόρμες για αυτόματη ανάκτηση δεδομένων.</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '20px' }}>
                {[
                  { name: 'GitHub Integration', status: 'Connected', icon: '🐙', type: 'Web' },
                  { name: 'Supabase Database', status: 'Connected', icon: '⚡', type: 'Database' },
                  { name: 'Vercel Deployments', status: 'Connected', icon: '▲', type: 'Web' },
                  { name: 'Gmail Workspace', status: 'Disconnected', icon: '📧', type: 'Email' },
                  { name: 'Google Drive', status: 'Disconnected', icon: '📁', type: 'Storage' },
                  { name: 'Railway App', status: 'Connected', icon: '🚂', type: 'Web' },
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
                    <div><div style={{ fontWeight: 'bold', fontSize: '14px' }}>Agent Hub Web Session</div><div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Created: 18 Aug 2026 • Last used: Just now</div></div>
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

/* ═══════════════════════════════════════════════════════════════
   AGENT HUB TAB — Full Layout (Sidebar + Header + Chat + Input)
   ═══════════════════════════════════════════════════════════════ */

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
    { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (Latest)', desc: 'Το πιο πρόσφατο & ταχύ' },
    { value: 'gemini-3.6-pro', label: 'Gemini 3.6 Pro', desc: 'Το πιο πρόσφατο & έξυπνο' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Ταχύ, stable' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Έξυπνο, αργότερο' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', desc: 'Γρήγορο, παλαιότερο' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', desc: 'Ελαφρύ, budget-friendly' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', desc: 'Κλασικό pro μοντέλο' },
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
            messages: [...c.messages, { role: 'assistant', text: 'Σφάλμα: ' + (e.message || 'Άγνωστο σφάλμα') }],
          };
        }
        return c;
      }));
    }
    setHubLoading(false);
  };

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', background: 'var(--bg)', color: 'var(--text)' }}>

      {/* ═══ INNER SIDEBAR: ΙΣΤΟΡΙΚΟ ΣΥΝΟΜΙΛΙΩΝ ═══ */}
      <div style={{ width: '260px', borderRight: '1px solid var(--border)', background: 'var(--bg-2)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
          <button onClick={createNewConversation} style={{ width: '100%', padding: '10px', background: 'var(--text)', color: 'var(--bg)', borderRadius: '8px', fontWeight: '600', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '13px' }}>
            <Plus size={14} /> Νέα Συνομιλία
          </button>
        </div>

        <div style={{ padding: '12px', flex: 1, overflowY: 'auto' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', fontWeight: 600 }}>Ιστορικό Συνομιλιών</div>
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
                  💬 {conv.title}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{conv.messages.length} μηνύματα · {conv.updatedAt.toLocaleDateString('el-GR')}</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', fontSize: '12px', opacity: 0.6 }}>🗑️</button>
            </div>
          ))}
          {conversations.length === 0 && (
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px', padding: '20px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }}>
              Δεν υπάρχουν συνομιλίες.<br/>Ξεκίνα μια νέα!
            </div>
          )}
        </div>

        {/* Settings Trigger */}
        <div style={{ padding: '12px', borderTop: '1px solid var(--border)' }}>
          <button onClick={() => setShowHubSettings(!showHubSettings)} style={{ width: '100%', textAlign: 'left', padding: '10px', background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚙️ Ρυθμίσεις Agent
          </button>
        </div>
      </div>

      {/* ═══ KENTRIKO PARATHYRO CHAT ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* HEADER: ΕΠΙΛΟΓΗ ΜΟΝΤΕΛΟΥ */}
        <div style={{ padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '18px', fontWeight: 'bold' }}>Agent Hub</span>
            <span style={{ fontSize: '11px', background: 'rgba(16,185,129,0.12)', color: '#10b981', padding: '3px 10px', borderRadius: '12px' }}>
              {hubLoading ? '⏳ Processing...' : '● Online'}
            </span>
            {hubApiKey && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {GEMINI_MODELS.find(m => m.value === hubModel)?.label || hubModel}
              </span>
            )}
            {!hubApiKey && (
              <span style={{ fontSize: '11px', color: '#f59e0b' }}>
                ⚠️ Χωρίς API Key
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
            <button onClick={() => setShowHubSettings(!showHubSettings)} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px', color: 'var(--text)' }} title="Ρυθμίσεις">⚙️</button>
          </div>
        </div>

        {/* API Key Settings Panel (toggled) */}
        {showHubSettings && (
          <div style={{ padding: '16px 24px', background: 'var(--bg-2)', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>⚙️ Ρυθμίσεις API & Μοντέλου</div>
            <div className="drawer-field">
              <label style={{ fontWeight: 500, fontSize: '12px' }}>Google Gemini API Key</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="password" value={hubApiKey} onChange={(e) => { setHubApiKey(e.target.value); localStorage.setItem('hub_api_key', e.target.value); }} placeholder="AIzaSy..." style={{ flex: 1, fontFamily: 'monospace', fontSize: '12px', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)' }} />
                {hubApiKey && <button onClick={() => { setHubApiKey(''); localStorage.removeItem('hub_api_key'); }} style={{ padding: '6px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)' }}>Καθαρισμός</button>}
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                Λήψη από: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>Google AI Studio</a> · Το κλειδί αποθηκεύεται μόνο στον browser σου
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'rgba(0,102,204,0.08)', padding: '8px 12px', borderRadius: '8px' }}>
              💡 <strong>Πώς δουλεύει:</strong> Το API key σου χρησιμοποιείται απευθείας στη κλήση προς Google. Δεν αποθηκεύεται στον server.
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
                  {m.role === 'assistant' ? '🤖' : '👤'}
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
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>🤖</div>
                <div style={{ padding: '12px 16px', background: 'var(--bg-2)', borderRadius: '12px', color: 'var(--text-muted)', fontSize: '14px' }}>
                  Σκέφτομαι<span className="dot-anim">...</span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        ) : (
          /* EMPTY STATE */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '40px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px' }}>🤖</div>
            <h3 style={{ fontSize: '20px', fontWeight: 'bold', color: 'var(--text)', margin: 0 }}>Γεια σου! Είμαι ο AI Agent</h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '400px', margin: 0 }}>
              Πώς μπορώ να σας βοηθήσω σήμερα; Δοκιμάστε μία από τις παρακάτω ενέργειες:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
              {[
                '📊 Ανάλυση των Leads μου',
                '📋 Δημιουργία Report για Market RAG',
                '🔍 Βρες νέα B2B leads στην Αττική',
                '💰 Τιμές ρεύματος σήμερα',
                '📧 Στείλε email σε lead',
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
            Ο Agent Hub μπορεί να κάνει λάθη. Παρακαλώ ελέγχετε τις πληροφορίες.
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <AgentSettingsModal isOpen={showHubSettings} onClose={() => setShowHubSettings(false)} />
    </div>
  );
}

function ReportsTab({ agents, reports, setReports, loading, setLoading, selectedReport, setSelectedReport, generating, setGenerating, toast, setToast, leadNotes, leads }: {
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
  leadNotes: any[];
  leads: Lead[];
}) {
  const [reportNotes, setReportNotes] = useState('');
  const [reportPriority, setReportPriority] = useState('normal');

  // Real metrics from database
  const totalLeads = leads.length;
  const thisMonthLeads = leads.filter(l => { const d = new Date(l.created_at); const now = new Date(); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).length;
  const totalEmailsSent = leadNotes.filter(n => n.note_type === 'email_sent').length;
  const totalAiSummaries = leadNotes.filter(n => n.note_type === 'ai_summary').length;
  const totalManualNotes = leadNotes.filter(n => n.note_type === 'manual').length;
  const totalStatusChanges = leadNotes.filter(n => n.note_type === 'status_change').length;
  const leadsByStatus = leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {} as Record<string, number>);
  const agentsActive = agents.filter(a => a.status === 'active').length;
  const agentsPaused = agents.filter(a => a.status === 'paused').length;

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

      {/* Real Database Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <div className="dash-stat-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Σύνολο Leads</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{totalLeads}</div>
        </div>
        <div className="dash-stat-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Emails Εστάλησαν</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#0066cc' }}>{totalEmailsSent}</div>
        </div>
        <div className="dash-stat-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>AI Summaries</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#00c878' }}>{totalAiSummaries}</div>
        </div>
        <div className="dash-stat-card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Agents Active</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{agentsActive} / {agents.length}</div>
        </div>
      </div>

      {/* Lead Pipeline Breakdown */}
      <div style={{ marginBottom: 20, padding: '14px 18px', background: 'var(--surface-2, #f5f7fa)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Lead Pipeline Breakdown</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {Object.entries(leadsByStatus).map(([status, count]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={`dash-status-pill ${status}`} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 12 }}>{status}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{count}</span>
            </div>
          ))}
          {Object.keys(leadsByStatus).length === 0 && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No leads yet</span>}
        </div>
      </div>

      {/* Activity Summary */}
      <div style={{ marginBottom: 20, padding: '14px 18px', background: 'var(--surface-2, #f5f7fa)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>Activity Summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#0066cc' }}>{totalEmailsSent}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Emails Sent</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: '#00c878' }}>{totalAiSummaries}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>AI Summaries</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{totalManualNotes}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Manual Notes</div></div>
          <div style={{ textAlign: 'center' }}><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{totalStatusChanges}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Status Changes</div></div>
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
  const [newUser, setNewUser] = useState({ full_name: '', role: 'sales', phone: '', email: '', password: '' });
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
          <input placeholder="Email" type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
          <input placeholder="Κωδικός" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
          <button className="btn btn-primary" onClick={async () => {
            if (!newUser.full_name || !newUser.email || !newUser.password) return;
            const { error } = await supabase.rpc('create_crm_user', {
              p_full_name: newUser.full_name,
              p_role: newUser.role,
              p_phone: newUser.phone,
              p_email: newUser.email,
              p_password: newUser.password,
            });
            if (error) { setToast({ msg: 'Σφάλμα: ' + error.message, type: 'info' }); return; }
            setNewUser({ full_name: '', role: 'sales', phone: '', email: '', password: '' });
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
    category: 'energy',
    region: 'Αττική',
    maxResults: 20,
    importToDb: false,
  });
  const [scraping, setScraping] = useState(false);
  const [scrapeResults, setScrapeResults] = useState<any[]>([]);
  const [scrapeSourceInfo, setScrapeSourceInfo] = useState<any>(null);
  const [scrapeHistory, setScrapeHistory] = useState<any[]>([]);
  const [selectedForImport, setSelectedForImport] = useState<Set<number>>(new Set());

  const categories = [
    { value: 'energy', label: 'Εταιρείες Ενέργειας' },
    { value: 'solar', label: 'Φωτοβολταϊκά & Solar' },
    { value: 'ev_charging', label: 'Σταθμοί Φόρτισης EV' },
    { value: 'real_estate', label: 'Ακίνητα & Μεσιτικά' },
    { value: 'construction', label: 'Κατασκευαστικές & Εργοληπτικές' },
    { value: 'restaurant', label: 'Εστιατόρια & Ταβέρνες' },
    { value: 'hotel', label: 'Ξενοδοχεία & Ενοικιαζόμενα' },
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

  const greekRegions = [
    'Αττική', 'Θεσσαλονίκη', 'Κεντρική Ελλάδα', 'Πελοπόννησος',
    'Κρήτη', 'Ιόνια Νησιά', 'Θεσσαλία', 'Ήπειρος',
    'Δυτική Ελλάδα', 'Στερεά Ελλάδα', 'Νησιά Αιγαίου', 'Δυτική Μακεδονία',
    'Ανατολική Μακεδονία & Θράκη', 'Βόρειο Αιγαίο',
  ];

  const startScrape = async () => {
    setScraping(true);
    setToast({ msg: 'Εκκίνηση B2B scraping via SerpApi Google Maps...', type: 'info' });

    try {
      const { data, error } = await supabase.functions.invoke('scrape-b2b', {
        body: {
          category: scrapeConfig.category,
          region: scrapeConfig.region,
          maxResults: scrapeConfig.maxResults,
          importToDb: false,
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
          source: data.source_info?.api || 'SerpApi',
          count: data.businesses.length,
        }]);
        setToast({ msg: `Βρέθηκαν ${data.businesses.length} B2B leads (SerpApi Google Maps)!`, type: 'success' });
      } else if (data?.error) {
        setToast({ msg: data.error, type: 'info' });
      }
    } catch (err: any) {
      setToast({ msg: `Σφάλμα scraping: ${err.message}`, type: 'info' });
    } finally {
      setScraping(false);
    }
  };

  const exportToCsv = () => {
    if (scrapeResults.length === 0) return;
    const headers = ['Εταιρεία', 'Κατηγορία', 'Περιοχή', 'Τηλέφωνο', 'Ιστοσελίδα', 'Διεύθυνση', 'Πηγή', 'Αξιολόγηση', 'Reviews'];
    const rows = scrapeResults.map(r => [
      r.company, r.category, r.region, r.phone, r.website, r.address, r.source, r.rating || '', r.totalReviews || ''
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
          importToDb: true,
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

  return (
    <div className="dash-content">
      <div className="dash-content-header">
        <p>Αυτοματοποιημένη συλλογή B2B leads από Google Maps μέσω SerpApi. Real δεδομένα εταιρειών με GDPR-compliant lawful basis.</p>
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
              {greekRegions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="drawer-field">
            <label>Μέγιστο Αποτελέσματα</label>
            <input type="number" min="5" max="60" value={scrapeConfig.maxResults} onChange={(e) => setScrapeConfig({ ...scrapeConfig, maxResults: parseInt(e.target.value) || 20 })} />
          </div>
          <div className="drawer-field">
            <label>Πηγή</label>
            <div style={{ padding: '10px 14px', background: 'var(--surface-2, #f5f7fa)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Globe size={14} style={{ color: '#00c878' }} /> SerpApi Google Maps Engine
            </div>
          </div>
        </div>
      </div>

      {scrapeSourceInfo && (
        <div style={{ background: 'rgba(0,200,120,0.06)', border: '1px solid rgba(0,200,120,0.15)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '12px' }}>
          <strong>Engine:</strong> {scrapeSourceInfo.api} | <strong>Query:</strong> {scrapeSourceInfo.query} | <strong>Region:</strong> {scrapeSourceInfo.region} ({scrapeSourceInfo.ll})
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
                  <th>Εταιρεία</th><th>Κατηγορία</th><th>Περιοχή</th><th>Τηλέφωνο</th><th>Ιστοσελίδα</th><th>Διεύθυνση</th><th>Rating</th>
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
                    <td>{r.website ? <a href={r.website.startsWith('http') ? r.website : `https://${r.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)' }}>{r.website.replace(/^https?:\/\//, '').slice(0, 30)}</a> : '—'}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.address || '—'}</td>
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
        <p>Αυτό το εργαλείο χρησιμοποιεί <strong>SerpApi Google Maps Engine</strong> για real-time scraping επιχειρήσεων από Google Maps. Το API key αποθηκεύεται ασφαλώς στη βάση δεδομένων.</p>
        <ul>
          <li><strong>SerpApi</strong> — Google Maps engine (engine=google_maps) με real δεδομένα</li>
          <li><strong>20 κατηγορίες</strong> επιχειρήσεων: ενέργεια, solar, EV, ακίνητα, tech, hospitality, retail κ.λπ.</li>
          <li><strong>14 περιοχές</strong> της Ελλάδας με ακριβείς συντεταγμένες Google Maps</li>
          <li>Αυτόματο <strong>φιλτράρισμα</strong> — μόνο αποτελέσματα με τηλέφωνο</li>
          <li>Αυτόματη <strong>deduplication</strong> by company name + phone</li>
          <li>Εξαγωγή σε <strong>CSV</strong> με BOM για ελληνικούς χαρακτήρες</li>
          <li>Αυτόματη εισαγωγή leads στη βάση δεδομένων με status "Νέο Lead"</li>
          <li><strong>GDPR</strong> — Legitimate Interest lawful basis</li>
        </ul>
      </div>
    </div>
  );
}

function CampaignsTab({ leads, preSelectedLeadIds, toast, setToast, onClearSelection }: { leads: Lead[]; preSelectedLeadIds?: Set<string>; toast: any; setToast: (v: any) => void; onClearSelection?: () => void }) {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<Set<string>>(new Set());
  const [newCampaign, setNewCampaign] = useState({
    name: '', channel: 'email' as const, subject: '', body: '',
    audience_filter: {} as any,
    require_approval: true,
  });

  useEffect(() => {
    loadCampaigns();
    if (preSelectedLeadIds && preSelectedLeadIds.size > 0) {
      setSelectedFilter(new Set(preSelectedLeadIds));
      setShowCreate(true);
    }
  }, []);

  const loadCampaigns = async () => {
    setLoading(true);
    const { data } = await supabase.from('campaigns').select('*').order('created_at', { ascending: false });
    if (data) setCampaigns(data);
    setLoading(false);
  };

  const createAndSend = async () => {
    if (!newCampaign.name || !newCampaign.body) { setToast({ msg: 'Πληρώστε όνομα και μήνυμα', type: 'info' }); return; }
    setSending(true);
    try {
      // Use pre-selected leads if available, otherwise all leads
      let targetLeads = selectedFilter.size > 0
        ? leads.filter(l => selectedFilter.has(l.id) && !l.deleted_at)
        : leads.filter(l => !l.deleted_at);
      if (newCampaign.channel === 'email') targetLeads = targetLeads.filter(l => l.email);
      else targetLeads = targetLeads.filter(l => l.phone);

      if (targetLeads.length === 0) { setToast({ msg: 'Δεν υπάρχουν leads με το απαραίτητο κανάλι (email/τηλέφωνο)', type: 'info' }); setSending(false); return; }

      const approvalStatus = newCampaign.require_approval ? 'draft' : 'auto';

      // Create campaign record
      const { data: campaign } = await supabase.from('campaigns').insert({
        name: newCampaign.name,
        channel: newCampaign.channel,
        subject: newCampaign.subject,
        body: newCampaign.body,
        status: newCampaign.require_approval ? 'draft' : 'running',
        approval_status: approvalStatus,
        total_sends: targetLeads.length,
      }).select().single();

      // Call appropriate Edge Function only if no approval required
      let result: any = { sent: 0, failed: 0 };
      if (!newCampaign.require_approval && campaign?.id) {
        if (newCampaign.channel === 'email') {
          const res = await supabase.functions.invoke('send-campaign-email', {
            body: { campaign_id: campaign.id, leads: targetLeads, subject: newCampaign.subject, html_body: newCampaign.body, from_name: 'Αλέξης - Hlektrismos.gr' },
          });
          result = res.data;
        } else if (newCampaign.channel === 'voice') {
          let sent = 0, failed = 0;
          for (const lead of targetLeads) {
            try {
              const res = await supabase.functions.invoke('make-voice-call', {
                body: { lead_id: lead.id, phone: lead.phone, first_name: lead.first_name, last_name: lead.last_name, region: lead.region, current_provider: lead.provider },
              });
              if (res.error) failed++; else sent++;
            } catch { failed++; }
          }
          result = { sent, failed };
        } else {
          const res = await supabase.functions.invoke('send-sms', {
            body: { campaign_id: campaign.id, leads: targetLeads, message: newCampaign.body, channel: newCampaign.channel },
          });
          result = res.data;
        }
      }

      if (campaign?.id && !newCampaign.require_approval) {
        await supabase.from('campaigns').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          total_sent: result?.sent || 0,
          total_failed: result?.failed || 0,
        }).eq('id', campaign.id);
      }

      const msg = newCampaign.require_approval
        ? 'Καμπάνια αποθηκεύτηκε ως DRAFT — χρειάζεται έγκριση από admin'
        : `Καμπάνια ολοκληρώθηκε: ${result?.sent || 0} απεσταλμένα, ${result?.failed || 0} αποτυχίες`;
      setToast({ msg, type: newCampaign.require_approval ? 'info' : 'success' });
      setShowCreate(false);
      setNewCampaign({ name: '', channel: 'email', subject: '', body: '', audience_filter: {} });
      loadCampaigns();
    } catch (e: any) {
      setToast({ msg: `Σφάλμα: ${e.message}`, type: 'info' });
    }
    setSending(false);
  };

  const channelIcons: Record<string, string> = { email: '📧', sms: '📱', viber: '💬', whatsapp: '💬', voice: '📞' };
  const statusColors: Record<string, string> = { draft: '#94a3b8', scheduled: '#f59e0b', running: '#3b82f6', completed: '#22c55e', paused: '#ef4444' };
  const approvalColors: Record<string, string> = { draft: '#f59e0b', auto: '#0066cc', approved: '#22c55e', rejected: '#ef4444' };
  const approvalLabels: Record<string, string> = { draft: '⏳ DRAFT', auto: '⚡ Auto', approved: '✅ Approved', rejected: '❌ Rejected' };

  const approveCampaign = async (c: any) => {
    await supabase.from('campaigns').update({ approval_status: 'approved', status: 'running', approved_by: 'CRM User', approved_at: new Date().toISOString() }).eq('id', c.id);
    let targetLeads = leads.filter(l => !l.deleted_at);
    if (c.channel === 'email') targetLeads = targetLeads.filter(l => l.email);
    else targetLeads = targetLeads.filter(l => l.phone);
    try {
      if (c.channel === 'email') {
        await supabase.functions.invoke('send-campaign-email', { body: { campaign_id: c.id, leads: targetLeads, subject: c.subject, html_body: c.body, from_name: 'Αλέξης - Hlektrismos.gr' } });
      } else if (c.channel === 'voice') {
        for (const lead of targetLeads) { try { await supabase.functions.invoke('make-voice-call', { body: { lead_id: lead.id, phone: lead.phone, first_name: lead.first_name, last_name: lead.last_name, region: lead.region, current_provider: lead.provider } }); } catch {} }
      } else {
        await supabase.functions.invoke('send-sms', { body: { campaign_id: c.id, leads: targetLeads, message: c.body, channel: c.channel } });
      }
      await supabase.from('campaigns').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', c.id);
    } catch (e) { console.error('Campaign send error:', e); }
    setToast({ msg: `Καμπάνια "${c.name}" εγκρίθηκε και απεστάλη!`, type: 'success' });
    loadCampaigns();
  };

  const rejectCampaign = async (c: any) => {
    if (!confirm(`Απόρριψη καμπάνιας "${c.name}";`)) return;
    await supabase.from('campaigns').update({ approval_status: 'rejected', status: 'paused', approved_by: 'CRM User', approved_at: new Date().toISOString() }).eq('id', c.id);
    setToast({ msg: `Καμπάνια "${c.name}" απορρίφθηκε`, type: 'info' });
    loadCampaigns();
  };

  return (
    <div className="dash-content">
      <div className="dash-content-header">
        <p>Μαζικές καμπάνιες Email, SMS, Viber & AI Voice Calls — αυτόματη επικοινωνία με leads.</p>
        <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}>
          <Mail size={16} /> {showCreate ? 'Ακύρωση' : '📣 Νέα Καμπάνια'}
        </button>
      </div>

      {showCreate && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>Δημιουργία Καμπάνιας</h4>
            {selectedFilter.size > 0 && (
              <button
                onClick={() => { setSelectedFilter(new Set()); onClearSelection?.(); }}
                style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', color: 'var(--text)', fontSize: 12, cursor: 'pointer' }}
              >
                ✕ Καθαρισμός επιλογής ({selectedFilter.size})
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ fontWeight: 600, fontSize: 12 }}>Όνομα Καμπάνιας</label>
              <input value={newCampaign.name} onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, marginTop: 4 }} placeholder="π.χ. August B2C Promo" />
            </div>
            <div>
              <label style={{ fontWeight: 600, fontSize: 12 }}>Κανάλι</label>
              <select value={newCampaign.channel} onChange={(e) => setNewCampaign({ ...newCampaign, channel: e.target.value as any })} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, marginTop: 4 }}>
                <option value="email">📧 Email (Resend)</option>
                <option value="sms">📱 SMS (Infobip)</option>
                <option value="viber">💬 Viber (Infobip)</option>
                <option value="whatsapp">💬 WhatsApp (Infobip)</option>
                <option value="voice">📞 AI Voice Call (Vapi.ai)</option>
              </select>
            </div>
          </div>
          {newCampaign.channel === 'email' && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontWeight: 600, fontSize: 12 }}>Θέμα Email</label>
              <input value={newCampaign.subject} onChange={(e) => setNewCampaign({ ...newCampaign, subject: e.target.value })} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, marginTop: 4 }} placeholder="Εξοικονομήστε στο ρεύμα σας!" />
            </div>
          )}
          <div style={{ marginTop: 12 }}>
            <label style={{ fontWeight: 600, fontSize: 12 }}>Μήνυμα {newCampaign.channel === 'email' ? '(HTML)' : ''}</label>
            <textarea value={newCampaign.body} onChange={(e) => setNewCampaign({ ...newCampaign, body: e.target.value })} rows={6} style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, marginTop: 4, fontFamily: 'monospace', fontSize: 12 }} placeholder={newCampaign.channel === 'email' ? '<h2>Εξοικονομήστε!</h2><p>Γεια σου {{first_name}}, η Hlektrismos.gr μπορεί να μειώσει τον λογαριασμό σου...</p>' : 'Γεια σου {{first_name}}, η Hlektrismos.gr μπορεί να μειώσει τον λογαριασμό σου ρεύματος!'} />
          </div>
          <div style={{ marginTop: 12, padding: 12, background: '#f0fdf4', borderRadius: 8, fontSize: 12 }}>
            📊 <strong>{(() => {
              const base = selectedFilter.size > 0
                ? leads.filter(l => selectedFilter.has(l.id) && !l.deleted_at)
                : leads.filter(l => !l.deleted_at);
              return base.filter(l => newCampaign.channel === 'email' ? l.email : l.phone).length;
            })()}</strong> leads θα λάβουν αυτή την καμπάνια
            {selectedFilter.size > 0 && <span style={{ color: '#0066cc', marginLeft: 8 }}>(επιλεγμένοι: {selectedFilter.size})</span>}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={newCampaign.require_approval}
                onChange={(e) => setNewCampaign({ ...newCampaign, require_approval: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: '#0066cc' }}
              />
              Απαιτείται έγκριση από admin πριν την αποστολή (Draft Mode)
            </label>
          </div>
          <button onClick={createAndSend} disabled={sending} style={{ marginTop: 16, padding: '10px 24px', background: sending ? '#94a3b8' : '#0066cc', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer' }}>
            {sending ? '⏳ Αποστολή...' : `📤 Αποστολή σε ${(() => {
              const base = selectedFilter.size > 0
                ? leads.filter(l => selectedFilter.has(l.id) && !l.deleted_at)
                : leads.filter(l => !l.deleted_at);
              return base.filter(l => newCampaign.channel === 'email' ? l.email : l.phone).length;
            })()} Leads`}
          </button>
        </div>
      )}

      {loading ? <p>Φόρτωση...</p> : campaigns.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          <Mail size={48} style={{ opacity: 0.3 }} />
          <p>Δεν υπάρχουν καμπάνιες ακόμα.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {campaigns.map(c => (
            <div key={c.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ fontSize: 24 }}>{channelIcons[c.channel] || '📧'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.subject || c.body?.slice(0, 60)}</div>
              </div>
              <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: `${statusColors[c.status] || '#94a3b8'}22`, color: statusColors[c.status] || '#94a3b8' }}>{c.status}</span>
              {c.approval_status && c.approval_status !== 'auto' && (
                <span style={{ padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: `${approvalColors[c.approval_status]}18`, color: approvalColors[c.approval_status] }}>{approvalLabels[c.approval_status]}</span>
              )}
              {c.approval_status === 'draft' && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => approveCampaign(c)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #22c55e', background: '#f0fdf4', color: '#16a34a', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>✅ Έγκριση</button>
                  <button onClick={() => rejectCampaign(c)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ef4444', background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>❌ Απόρριψη</button>
                </div>
              )}
              <div style={{ textAlign: 'right', fontSize: 12 }}>
                <div>📤 {c.total_sends || 0}</div>
                <div style={{ color: '#22c55e' }}>✅ {c.total_sent || 0}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FOLLOW-UP & CUSTOMERS FOLDER
   Pipeline view with customer conversion tracking
   ═══════════════════════════════════════════════════════════════ */
function FollowUpFolder({ leads, crmUsers, toast, setToast, loadData }: {
  leads: Lead[];
  crmUsers: CrmUser[];
  toast: any;
  setToast: (v: any) => void;
  loadData: () => void;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'follow_up' | 'customer' | 'lost'>('all');
  const [openLead, setOpenLead] = useState<Lead | null>(null);

  // Filter: exclude deleted, focus on follow_up/customer/lost + new/contacted/qualified (pipeline)
  const followUpLeads = leads.filter(l => {
    if (l.deleted_at) return false;
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    return true;
  }).filter(l => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.first_name?.toLowerCase().includes(q) ||
      l.last_name?.toLowerCase().includes(q) ||
      l.email?.toLowerCase().includes(q) ||
      l.phone?.includes(q) ||
      l.current_provider?.toLowerCase().includes(q) ||
      l.program_name?.toLowerCase().includes(q) ||
      l.region?.toLowerCase().includes(q)
    );
  });

  // Pipeline stats
  const stats = {
    total: leads.filter(l => !l.deleted_at).length,
    follow_up: leads.filter(l => !l.deleted_at && l.status === 'follow_up').length,
    customer: leads.filter(l => !l.deleted_at && l.status === 'customer').length,
    lost: leads.filter(l => !l.deleted_at && l.status === 'lost').length,
    withProvider: leads.filter(l => !l.deleted_at && l.current_provider).length,
    conversionRate: leads.filter(l => !l.deleted_at).length > 0
      ? Math.round((leads.filter(l => !l.deleted_at && l.status === 'customer').length / leads.filter(l => !l.deleted_at).length) * 100)
      : 0,
  };

  const PROVIDER_COLORS: Record<string, string> = {
    'ΔΕΗ': '#1e40af', 'Protergia': '#dc2626', 'ΗΡΩΝ': '#059669', 'ZeniΘ': '#d97706',
    'Eunice Power': '#7c3aed', 'nrg': '#0891b2', 'Φυσικό Αέριο': '#be185d', 'Volton': '#4f46e5',
    'Enerwave': '#0ea5e9', 'Ελίν': '#b91c1c',
  };

  return (
    <div className="dash-content">
      <div className="dash-content-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0 }}>Follow-Up Pipeline & Πελάτες — παρακολούθηση επαφών, μετατροπή σε πελάτη, τρέχον πρόγραμμα.</p>
        </div>

        {/* Stats Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
          {[
            { label: 'Σύνολο', value: stats.total, color: '#64748b', icon: '📊' },
            { label: 'Follow-Up', value: stats.follow_up, color: '#f59e0b', icon: '📞' },
            { label: 'Πελάτες', value: stats.customer, color: '#10b981', icon: '✅' },
            { label: 'Χαμένα', value: stats.lost, color: '#ef4444', icon: '❌' },
            { label: 'Με Πάροχο', value: stats.withProvider, color: '#6366f1', icon: '⚡' },
            { label: 'Μετατροπή', value: `${stats.conversionRate}%`, color: '#0ea5e9', icon: '📈' },
          ].map((s, i) => (
            <div key={i} className="dash-stat-card" style={{ padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                {s.icon} {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Status Filter Tabs */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {([
            { key: 'all', label: 'Όλα', icon: '📁', count: stats.total },
            { key: 'follow_up', label: 'Follow-Up', icon: '📞', count: stats.follow_up },
            { key: 'customer', label: 'Πελάτες', icon: '✅', count: stats.customer },
            { key: 'lost', label: 'Χαμένα', icon: '❌', count: stats.lost },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: '1px solid', cursor: 'pointer', transition: 'all 0.2s',
                background: statusFilter === f.key ? 'var(--text)' : 'var(--surface)',
                color: statusFilter === f.key ? 'var(--bg)' : 'var(--text)',
                borderColor: statusFilter === f.key ? 'var(--text)' : 'var(--border)',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
              <span style={{ background: statusFilter === f.key ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>{f.count}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', maxWidth: 400 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Αναζήτηση με όνομα, email, πάροχο, πρόγραμμα..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px 8px 32px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text)' }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="dash-table-wrap">
        <table className="dash-table">
          <thead>
            <tr>
              <th>Όνομα</th>
              <th>Email</th>
              <th>Τηλέφωνο</th>
              <th>Περιοχή</th>
              <th>Status</th>
              <th>Πάροχος</th>
              <th>Πρόγραμμα</th>
              <th>Τιμή/kWh</th>
              <th>Τελ. Επαφή</th>
              <th>Ενέργεια</th>
            </tr>
          </thead>
          <tbody>
            {followUpLeads.map(l => (
              <tr key={l.id} className="dash-row-clickable" onClick={() => setOpenLead(l)}>
                <td>
                  <button className="dash-lead-name-btn" onClick={e => { e.stopPropagation(); setOpenLead(l); }}>
                    {l.first_name} {l.last_name}
                  </button>
                </td>
                <td style={{ fontSize: 12 }}>{l.email}</td>
                <td style={{ fontSize: 12 }}>{l.phone}</td>
                <td style={{ fontSize: 12 }}>{l.region}</td>
                <td>
                  <span className={`dash-status-pill ${l.status}`} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12 }}>
                    {l.status === 'follow_up' ? '📞 Follow-Up' : l.status === 'customer' ? '✅ Πελάτης' : l.status === 'lost' ? '❌ Χαμένο' : l.status}
                  </span>
                </td>
                <td>
                  {l.current_provider ? (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 6,
                      background: `${PROVIDER_COLORS[l.current_provider] || '#64748b'}15`,
                      color: PROVIDER_COLORS[l.current_provider] || '#64748b',
                    }}>
                      ⚡ {l.current_provider}
                    </span>
                  ) : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td style={{ fontSize: 12, fontWeight: 500 }}>{l.program_name || '—'}</td>
                <td style={{ fontSize: 12 }}>{l.unit_rate_kwh != null ? `€${l.unit_rate_kwh.toFixed(4)}` : '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {l.last_contact_at ? new Date(l.last_contact_at).toLocaleDateString('el-GR', { day: '2-digit', month: 'short' }) : '—'}
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setOpenLead(l)}
                    style={{
                      padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    👁️ Προβολή
                  </button>
                </td>
              </tr>
            ))}
            {followUpLeads.length === 0 && (
              <tr><td colSpan={10} className="dash-empty">Δεν βρέθηκαν leads σε αυτόν τον φάκελο.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Lead Detail Slideout */}
      {openLead && (
        <LeadDetailSlideout
          lead={openLead}
          onClose={() => { setOpenLead(null); loadData(); }}
          crmUsers={crmUsers}
        />
      )}
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
        content: data?.message || 'Σφάλμα απόκρισης.',
        timestamp: new Date(),
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Σφάλμα: ${err.message}. Βεβαιωθείτε ότι το AI Developer Edge Function είναι deployed.`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    'Ποιοι πίνακες υπάρχουν στη βάση δεδομένων;',
    'Βελτίωσε το RLS policy στον πίνακα hlektrismos_leads',
    'Δημιούργησε ένα νέο migration για προσθήκη στήλης',
    'Τι κάνει το agent-worker edge function;',
    'Πώς μπορώ να προσθέσω webhook στο CRM;',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '70vh', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Database size={20} style={{ color: '#0066cc' }} />
        <div>
          <div style={{ fontWeight: 600, color: 'var(--text)' }}>AI Developer Agent</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Senior software engineer με εξειδίκευση σε React, Supabase, TypeScript, DevOps</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <Database size={48} style={{ color: 'var(--text-muted)', marginBottom: '16px' }} />
            <h3 style={{ color: 'var(--text)', margin: '0 0 8px' }}>AI Developer Agent</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: '0 0 24px' }}>
              Ρωτήστε τον AI developer οτιδήποτε σχετικά με τον κώδικα, bugs, features, database, ή DevOps.
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
              <span className="typing-dots">Σκέφτομαι<span>.</span><span>.</span><span>.</span></span>
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
          placeholder="Ρωτήστε τον AI Developer..."
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
    { id: 'inbox', label: 'Εισερχόμενα', icon: '📥' },
    { id: 'starred', label: 'Αστέρια', icon: '⭐' },
    { id: 'sent', label: 'Απεσταλμένα', icon: '📤' },
    { id: 'drafts', label: 'Πρόχειρα', icon: '📝' },
    { id: 'important', label: 'Σημαντικά', icon: '⚡' },
    { id: 'archive', label: 'Αρχείο', icon: '🗂️' },
    { id: 'spam', label: 'Ανεπιθύμητα', icon: '🚫' },
    { id: 'trash', label: 'Απορρίμματα', icon: '🗑️' },
  ];

  const providers = [
    { id: 'gmail', label: 'Gmail', icon: '📧', host: 'imap.gmail.com', port: '993' },
    { id: 'outlook', label: 'Outlook / Microsoft 365', icon: '📨', host: 'outlook.office365.com', port: '993' },
    { id: 'yahoo', label: 'Yahoo Mail', icon: '📬', host: 'imap.mail.yahoo.com', port: '993' },
    { id: 'custom', label: 'Προσαρμοσμένο IMAP', icon: '📩', host: '', port: '993' },
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
    setToast({ msg: `${ids.length} emails σημάνθηκαν ως αναγνωσμένα.`, type: 'success' });
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    await supabase.from('crm_emails').update({ folder: 'trash' }).in('id', ids);
    setEmails(prev => prev.map(e => ids.includes(e.id) ? { ...e, folder: 'trash' } : e));
    setSelectedIds(new Set());
    setToast({ msg: `${ids.length} emails μεταφέρθηκαν στα απορρίμματα.`, type: 'info' });
  };

  const handleDeleteEmail = async (id: string) => {
    await supabase.from('crm_emails').update({ folder: 'trash' }).eq('id', id);
    setEmails(prev => prev.map(e => e.id === id ? { ...e, folder: 'trash' } : e));
    if (selectedEmail === id) setSelectedEmail(null);
    setToast({ msg: 'Το email μεταφέρθηκε στα απορρίμματα.', type: 'info' });
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
    setToast({ msg: 'Η ετικέτα δημιουργήθηκε!', type: 'success' });
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
    setToast({ msg: 'Το email στάλθηκε!', type: 'success' });
  };

  const handleSaveDraft = async () => {
    const draft = {
      id: 'draft_' + Date.now(),
      from_email: 'info@hlektrismos.gr',
      to_email: composeData.to,
      cc: composeData.cc,
      bcc: composeData.bcc,
      subject: composeData.subject || '(Χωρίς θέμα)',
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
    setToast({ msg: 'Το πρόχειρο αποθηκεύτηκε.', type: 'info' });
  };

  const handleImportEmails = async () => {
    if (!importConfig.email) return;
    setSyncing(true);
    await new Promise(r => setTimeout(r, 2000));
    setSyncing(false);
    setShowImport(false);
    setToast({ msg: `Emails από ${importConfig.provider} εισήχθησαν επιτυχώς!`, type: 'success' });
  };

  const handleSync = async () => {
    setSyncing(true);
    await new Promise(r => setTimeout(r, 2000));
    setSyncing(false);
    setToast({ msg: 'Τα emails συγχρονίστηκαν επιτυχώς!', type: 'success' });
  };

  const handleSaveSettings = async () => {
    for (const [key, value] of Object.entries(editingSettings)) {
      await supabase.from('crm_email_settings').upsert({ setting_key: key, setting_value: value, updated_at: new Date().toISOString() });
    }
    setEmailSettings(editingSettings);
    setShowSettings(false);
    setToast({ msg: 'Οι ρυθμίσεις αποθηκεύτηκαν!', type: 'success' });
  };

  const handleLinkToLead = async (emailId: string, leadId: string) => {
    await supabase.from('crm_emails').update({ lead_id: leadId }).eq('id', emailId);
    setEmails(prev => prev.map(e => e.id === emailId ? { ...e, lead_id: leadId } : e));
    setToast({ msg: 'Το email συνδέθηκε με το lead!', type: 'success' });
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
              ✉️ Σύνταξη
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
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Ετικέτες</span>
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
                <span>📥</span> Εισαγωγή Email
              </button>
              <button onClick={() => { setShowSettings(true); setEditingSettings({ ...emailSettings }); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '8px 12px', background: 'transparent', color: 'var(--text)', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '13px', textAlign: 'left' }}>
                <span>⚙️</span> Ρυθμίσεις
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
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{selectedIds.size} επιλεγμένα</span>
                <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 10px' }} onClick={handleBulkMarkRead}>✅ Αναγνωσμένο</button>
                <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '4px 10px', color: '#ef4444' }} onClick={handleBulkDelete}>🗑️ Διαγραφή</button>
              </div>
            ) : (
              <input type="text" placeholder="🔍 Αναζήτηση emails..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, padding: '8px 14px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '20px', color: 'var(--text)', fontSize: '13px', outline: 'none' }} />
            )}
            <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
              <button className="btn btn-ghost" onClick={handleSync} disabled={syncing} style={{ fontSize: '13px', padding: '6px 12px' }}>
                {syncing ? '⏳' : '🔄'} Συγχρόνιση
              </button>
            </div>
          </div>

          {/* Email list + reading pane */}
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Email list */}
            <div style={{ width: selectedEmail ? '380px' : '100%', borderRight: selectedEmail ? '1px solid var(--border)' : 'none', overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Φόρτωση...</div>
              ) : filteredEmails.length === 0 ? (
                <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
                  <p style={{ fontSize: '16px', margin: 0 }}>Δεν υπάρχουν emails</p>
                  <p style={{ fontSize: '13px', margin: '4px 0 0' }}>
                    {activeFolder === 'inbox' ? 'Το inbox σας είναι άδειο.' : 'Δεν βρέθηκαν emails σε αυτόν τον φάκελο.'}
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
                    {email.starred ? '⭐' : '☆'}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontWeight: email.is_read ? 400 : 700, fontSize: '13px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {email.from_email}
                      </span>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'center' }}>
                        {email.important && <span style={{ fontSize: '12px' }}>🏷️</span>}
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
                      {email.lead_id && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0,200,120,0.1)', color: '#00c878' }}>🔗 Lead</span>}
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
                      <span><strong>Από:</strong> {selectedEmailData.from_email}</span>
                      <span><strong>Προς:</strong> {selectedEmailData.to_email}</span>
                      {selectedEmailData.cc && <span><strong>CC:</strong> {selectedEmailData.cc}</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {new Date(selectedEmailData.created_at).toLocaleString('el-GR')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button onClick={() => handleToggleStar(selectedEmail)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>
                      {selectedEmailData.starred ? '⭐' : '☆'}
                    </button>
                    <button onClick={() => handleToggleImportant(selectedEmail)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px' }}>
                      {selectedEmailData.important ? '🏷️' : '🏷️'}
                    </button>
                    <select value="" onChange={(e) => { if (e.target.value) handleAddLabel(selectedEmail, e.target.value); e.target.value = ''; }}
                      style={{ padding: '4px 8px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '12px' }}>
                      <option value="">🏷️ +Ετικέτα</option>
                      {labels.filter(l => !(selectedEmailData.labels || []).includes(l.name)).map(l => (
                        <option key={l.id} value={l.name}>{l.name}</option>
                      ))}
                    </select>
                    <select value={selectedEmailData.lead_id || ''} onChange={(e) => handleLinkToLead(selectedEmail, e.target.value)}
                      style={{ padding: '4px 8px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', fontSize: '12px' }}>
                      <option value="">🔗 Lead</option>
                      {leads.map(l => <option key={l.id} value={l.id}>{l.first_name} {l.last_name}</option>)}
                    </select>
                    <button className="btn btn-ghost" onClick={() => handleMarkUnread(selectedEmail)} style={{ fontSize: '12px', padding: '4px 8px' }}>👁️</button>
                    <button className="btn btn-ghost" onClick={() => handleDeleteEmail(selectedEmail)} style={{ color: '#ef4444', fontSize: '12px', padding: '4px 8px' }}>🗑️</button>
                  </div>
                </div>
                {(selectedEmailData.labels || []).length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    {(selectedEmailData.labels || []).map(l => {
                      const lbl = labels.find(ll => ll.name === l);
                      return (
                        <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '3px 8px', borderRadius: '12px', background: lbl ? lbl.color + '20' : '#0066cc20', color: lbl ? lbl.color : '#0066cc' }}>
                          {l}
                          <button onClick={() => handleRemoveLabel(selectedEmail, l)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '10px', padding: 0 }}>✕</button>
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
                  }}>↩️ Απάντηση</button>
                  <button className="btn btn-ghost" onClick={() => {
                    setComposeData({ to: '', cc: '', bcc: '', subject: `FWD: ${selectedEmailData.subject}`, body: `\n\n--- Πρωτότυπο μήνυμα ---\nΑπό: ${selectedEmailData.from_email}\n${selectedEmailData.body}`, replyTo: '' });
                    setShowCompose(true);
                  }}>↪️ Προώθηση</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Compose Modal ✉️ Gmail-Style Enhanced */}
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
            <span style={{ fontWeight: '600', fontSize: '14px', color: 'var(--text)' }}>Νέο Μήνυμα</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => setIsFullScreen(!isFullScreen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)' }} title="Πλήρης οθόνη">
                {isFullScreen ? '🖨️' : '🖥️'}
              </button>
              <button onClick={() => setShowCompose(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: 'var(--text-muted)' }} title="Κλείσιμο">✕</button>
            </div>
          </div>

          {/* Form Inputs */}
          <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)', width: '45px' }}>Προς</span>
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
                placeholder="Θέμα"
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
                <button style={{ padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>•</button>
                <button style={{ padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>—</button>
                <button style={{ padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>1.</button>
                <button style={{ padding: '2px 6px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)' }}>🔗</button>
              </div>
            )}

            {/* Body Input Area */}
            <textarea
              placeholder="Γράψτε το μήνυμά σας..."
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
                  Αποστολή
                </button>
                <button onClick={() => setShowScheduleSend(!showScheduleSend)} style={{ padding: '8px 8px', background: '#0052a3', color: '#fff', border: 'none', borderLeft: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: '10px' }}>
                  ✖
                </button>
              </div>

              {/* Toolbar Control Buttons */}
              <button title="Επιλογές μορφοποίησης" onClick={() => setShowFormattingToolbar(!showFormattingToolbar)} style={{ background: showFormattingToolbar ? 'var(--primary-10, rgba(0,102,204,0.1))' : 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', color: 'var(--text)' }}>Aa</button>
              <button title="Επισύναψη αρχείων" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px', color: 'var(--text)' }}>📎</button>
              <button title="Εισαγωγή συνδέσμου" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px', color: 'var(--text)' }}>🔗</button>
              <button title="Εισαγωγή emoji" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px' }}>😊</button>
              <button title="Εισαγωγή αρχείων CRM" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px' }}>📁</button>
              <button title="Εισαγωγή φωτογραφίας" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px' }}>🖼️</button>
              <button title="Εισαγωγή υπογραφής" style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px' }}>📎</button>

              {/* Context Menu Toggle */}
              <button title="Περισσότερες επιλογές" onClick={() => setShowMoreOptions(!showMoreOptions)} style={{ background: showMoreOptions ? 'var(--bg-2)' : 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px', color: 'var(--text)' }}>έΜχ</button>
            </div>

            {/* Discard Draft Button */}
            <button title="Απόρριψη προσχεδίου" onClick={() => setShowCompose(false)} style={{ background: 'transparent', border: 'none', padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '15px', color: 'var(--text-muted)' }}>🗑️</button>

            {/* Schedule Send Dropdown Menu */}
            {showScheduleSend && (
              <div style={{ position: 'absolute', bottom: '50px', left: '16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 1100, padding: '8px 0', width: '200px' }}>
                <div style={{ padding: '6px 16px', fontSize: '12px', fontWeight: 'bold', color: 'var(--text-muted)' }}>Προγραμματισμός αποστολής</div>
                <button onClick={() => { setShowScheduleSend(false); setToast({ msg: 'Προγραμματίστηκε για αύριο 08:00', type: 'info' }); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  📅 Αύριο το πρωί (08:00)
                </button>
                <button onClick={() => { setShowScheduleSend(false); setToast({ msg: 'Προγραμματίστηκε για τη Δευτέρα 08:00', type: 'info' }); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  📅 Δευτέρα το πρωί (08:00)
                </button>
              </div>
            )}

            {/* Gmail Options Popover Menu */}
            {showMoreOptions && (
              <div style={{ position: 'absolute', bottom: '50px', left: '210px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 1100, padding: '6px 0', width: '220px' }}>
                <button onClick={() => { setIsFullScreen(!isFullScreen); setShowMoreOptions(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  🖥️ Προεπιλογή σε πλήρη οθόνη
                </button>
                <button onClick={() => { setIsPlainText(!isPlainText); setShowMoreOptions(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  {isPlainText ? '📝 Λειτουργία απλού κειμένου' : '📝 Λειτουργία απλού κειμένου'}
                </button>
                <button onClick={() => { window.print(); setShowMoreOptions(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  🖨️ Εκτύπωση
                </button>
                <button onClick={() => { setShowLabelManager(true); setShowMoreOptions(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  🏷️ Ετικέτα...
                </button>
                <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }}></div>
                <button onClick={() => { setToast({ msg: 'Δημιουργήθηκε σύνδεσμος συνάντησης', type: 'info' }); setShowMoreOptions(false); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                  📅 Προγραμματισμός συνάντησης
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
            <div className="modal-header"><h3>📥 Εισαγωγή Emails</h3><button className="modal-close" onClick={() => setShowImport(false)}>x</button></div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
                Συνδέστε τον email λογαριασμό σας για εισαγωγή υπαρχόντων emails στο CRM.
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
                  {syncing ? '⏳ Εισαγωγή...' : '📥 Εισαγωγή Emails'}
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
            <div className="modal-header"><h3>🏷️ Διαχείριση Ετικετών</h3><button className="modal-close" onClick={() => setShowLabelManager(false)}>x</button></div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input placeholder="Νέα ετικέτα..." value={newLabel.name} onChange={(e) => setNewLabel({ ...newLabel, name: e.target.value })}
                  style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }} />
                <input type="color" value={newLabel.color} onChange={(e) => setNewLabel({ ...newLabel, color: e.target.value })}
                  style={{ width: '40px', height: '36px', padding: '2px', border: '1px solid var(--border)', borderRadius: '8px', cursor: 'pointer' }} />
                <button className="btn btn-primary" onClick={handleCreateLabel}>Προσθήκη</button>
              </div>
              {labels.map(l => (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: l.color }} />
                  <span style={{ flex: 1, fontSize: '14px', color: 'var(--text)' }}>{l.name}</span>
                  <button onClick={() => handleDeleteLabel(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '14px' }}>🗑️</button>
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
            <div className="modal-header"><h3>⚙️ Ρυθμίσεις Email</h3><button className="modal-close" onClick={() => setShowSettings(false)}>x</button></div>
            <div className="modal-body">
              <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Γενικά</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Πυκνότητα</label>
                  <select value={editingSettings.general.density} onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, density: e.target.value } })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}>
                    <option value="default">Default</option>
                    <option value="comfortable">Άνετη</option>
                    <option value="compact">Συμπαγής</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Τύπος Inbox</label>
                  <select value={editingSettings.general.inbox_type} onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, inbox_type: e.target.value } })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}>
                    <option value="default">Default</option>
                    <option value="important">Σημαντικά πρώτα</option>
                    <option value="unread">Μη αναγνωσμένα πρώτα</option>
                    <option value="starred">Αστέρια πρώτα</option>
                    <option value="priority">Priority Inbox</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Παράθυρο ανάγνωσης</label>
                  <select value={editingSettings.general.reading_pane} onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, reading_pane: e.target.value } })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}>
                    <option value="no_split">Χωρίς διαίρεση</option>
                    <option value="right">Δεξιά του inbox</option>
                    <option value="below">Κάτω από το inbox</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Ακύρωση αποστολής (δευτ.)</label>
                  <select value={editingSettings.general.undo_send} onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, undo_send: parseInt(e.target.value) } })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}>
                    <option value={5}>5 δευτερόλεπτα</option>
                    <option value={10}>10 δευτερόλεπτα</option>
                    <option value={20}>20 δευτερόλεπτα</option>
                    <option value={30}>30 δευτερόλεπτα</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Προεπιλεγμένη απάντηση</label>
                  <select value={editingSettings.general.default_reply} onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, default_reply: e.target.value } })}
                    style={{ width: '100%', padding: '8px 12px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }}>
                    <option value="reply">Απάντηση</option>
                    <option value="reply_all">Απάντηση σε όλους</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Μέγιστο σελίδας</label>
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
                  { key: 'hover_actions', label: 'Ενέργειες hover' },
                  { key: 'send_archive', label: 'Κουμπί "Αποστολή & Αρχειοθέτηση"' },
                  { key: 'snippets', label: 'Αποσπάσματα μηνυμάτων' },
                  { key: 'conversation_view', label: 'Προβολή συζήτησης (threading)' },
                  { key: 'keyboard_shortcuts', label: 'Πλήκτρα συντομεύσεων' },
                ].map(opt => (
                  <label key={opt.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)' }}>
                    <input type="checkbox" checked={editingSettings.general[opt.key]}
                      onChange={(e) => setEditingSettings({ ...editingSettings, general: { ...editingSettings.general, [opt.key]: e.target.checked } })}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }} />
                    {opt.label}
                  </label>
                ))}
              </div>

              <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Υπογραφή</h4>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)', marginBottom: '8px' }}>
                  <input type="checkbox" checked={editingSettings.signature?.enabled || false}
                    onChange={(e) => setEditingSettings({ ...editingSettings, signature: { ...editingSettings.signature, enabled: e.target.checked } })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }} />
                  Ενεργοποίηση υπογραφής
                </label>
                {editingSettings.signature?.enabled && (
                  <textarea value={editingSettings.signature?.content || ''} onChange={(e) => setEditingSettings({ ...editingSettings, signature: { ...editingSettings.signature, content: e.target.value } })}
                    placeholder="Τρέχουσα υπογραφή..."
                    style={{ width: '100%', minHeight: '80px', padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
                )}
              </div>

              <h4 style={{ margin: '0 0 12px', color: 'var(--text)' }}>Αυτόματη Απάντηση (Vacation Responder)</h4>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '13px', color: 'var(--text)', marginBottom: '8px' }}>
                  <input type="checkbox" checked={editingSettings.vacation?.enabled || false}
                    onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, enabled: e.target.checked } })}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }} />
                  Ενεργοποίηση αυτόματης απάντησης
                </label>
                {editingSettings.vacation?.enabled && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input placeholder="Θέμα" value={editingSettings.vacation?.subject || ''} onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, subject: e.target.value } })} />
                    <textarea value={editingSettings.vacation?.message || ''} onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, message: e.target.value } })}
                      placeholder="Μήνυμα αυτόματης απάντησης..."
                      style={{ minHeight: '80px', padding: '10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Από</label>
                        <input type="date" value={editingSettings.vacation?.start_date || ''} onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, start_date: e.target.value } })}
                          style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Έως</label>
                        <input type="date" value={editingSettings.vacation?.end_date || ''} onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, end_date: e.target.value } })}
                          style={{ width: '100%', padding: '6px 10px', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '13px' }} />
                      </div>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--text)' }}>
                      <input type="checkbox" checked={editingSettings.vacation?.contacts_only || false}
                        onChange={(e) => setEditingSettings({ ...editingSettings, vacation: { ...editingSettings.vacation, contacts_only: e.target.checked } })}
                        style={{ width: '14px', height: '14px', accentColor: 'var(--primary)' }} />
                      Αποστολή μόνο σε επαφές
                    </label>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <button className="btn btn-ghost" onClick={() => setShowSettings(false)}>Άκυρο</button>
                <button className="btn btn-primary" onClick={handleSaveSettings}>Αποθήκευση Ρυθμίσεων</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function OrchestratorDirectorTab({ agents, leads, tariffs, crmUsers, toast, setToast, setConfigAgent, loadData }: {
  agents: Agent[];
  leads: Lead[];
  tariffs: Tariff[];
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
    { value: 'Phone', label: 'Τηλέφωνο' },
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

      {selectedView === 'developer' && (
        <DeveloperAgentChat />
      )}

      {/* Floating AI Assistant Widget */}
      <CrmAiAssistantWidget leads={leads} tariffs={tariffs} />
    </div>
  );
}
