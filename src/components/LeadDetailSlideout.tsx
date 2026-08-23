import { useState, useEffect, useRef } from 'react';
import {
  X,
  FileText,
  ImageIcon,
  ExternalLink,
  Download,
  AlertCircle,
  FolderOpen,
  MessageSquare,
  Send,
  Sparkles,
  Loader2,
  Clock,
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  Tag,
  Zap,
  Calendar,
  UserCheck,
  Upload,
  CheckCircle2,
  Star,
  AlertTriangle,
  RefreshCw,
  TrendingDown,
  Eye,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { uploadDocument, updateLeadBillFiles, UploadedFile } from '@/lib/storage';
import { useAuth } from '@/hooks/useAuth';
import OfferModal from './OfferModal';

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
  property_type?: string | null;
  comments?: string | null;
  bill_file_path?: string | null;
  bill_file_name?: string | null;
  bill_files?: Array<{ path: string; name: string; type: string; size: number }> | null;
  assigned_to?: string | null;
  assigned_at?: string | null;
  ai_paused?: boolean | null;
  current_provider?: string | null;
  program_name?: string | null;
  unit_rate_kwh?: number | null;
  converted_at?: string | null;
  last_contact_at?: string | null;
  company_name?: string | null;
  monthly_kwh?: number | null;
  consumption_kwh?: number | null;
};

type CrmUser = {
  id: string;
  full_name: string;
  role: string;
};

type LeadNote = {
  id: string;
  lead_id: string;
  content: string;
  author: string;
  note_type: string;
  created_at: string;
};

type BillFile = {
  url: string;
  name: string;
  type: string;
  size: number;
};

interface LeadDetailSlideoutProps {
  lead: Lead;
  onClose: () => void;
  crmUsers: CrmUser[];
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual Note',
  status_change: 'Status Change',
  email_sent: 'Email Sent',
  ai_summary: 'AI Summary',
  system: 'System',
};

export default function LeadDetailSlideout({
  lead,
  onClose,
  crmUsers,
}: LeadDetailSlideoutProps) {
  const { user } = useAuth();
  const hubApiKey = localStorage.getItem('hub_api_key') || '';
  const hubModel = localStorage.getItem('hub_model') || 'gemini-3.6-flash';
  const [billUrls, setBillUrls] = useState<BillFile[]>([]);
  const [previewFile, setPreviewFile] = useState<BillFile | null>(null);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [omnichannel, setOmnichannel] = useState<{ recommended_channel: string; reasoning: string; draft_message: string; next_steps: string[] } | null>(null);
  const [omniLoading, setOmniLoading] = useState(false);
  const [omniError, setOmniError] = useState<string | null>(null);

  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Energy contract fields
  const [currentProvider, setCurrentProvider] = useState(lead.current_provider || '');
  const [programName, setProgramName] = useState(lead.program_name || '');
  const [unitRate, setUnitRate] = useState(lead.unit_rate_kwh?.toString() || '');
  const [monthlyKwh, setMonthlyKwh] = useState(lead.monthly_kwh?.toString() || lead.consumption_kwh?.toString() || '');
  const [savingEnergy, setSavingEnergy] = useState(false);

  // Recommendation engine
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [showRecs, setShowRecs] = useState(false);
  const [sendingOffer, setSendingOffer] = useState<string | null>(null);
  const [offerModal, setOfferModal] = useState<{ tariff: any } | null>(null);

  // Bill upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  // Status conversion
  const [convertingStatus, setConvertingStatus] = useState(false);

  // Load bill file signed URLs — tries hlektrismos_docs first, falls back to energy-bills
  useEffect(() => {
    let cancelled = false;
    setBillLoading(true);
    setBillError(null);
    setBillUrls([]);

    const filesToLoad =
      lead.bill_files && lead.bill_files.length > 0
        ? lead.bill_files
        : lead.bill_file_path
          ? [{ path: lead.bill_file_path, name: lead.bill_file_name || 'Bill', type: 'application/pdf', size: 0 }]
          : [];

    if (filesToLoad.length === 0) {
      setBillLoading(false);
      return;
    }

    (async () => {
      const results: BillFile[] = [];
      for (const file of filesToLoad) {
        // Try new bucket first, then legacy bucket
        let signedUrl = '';
        for (const bucket of ['hlektrismos_docs', 'energy-bills']) {
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(file.path, 60 * 10);
          if (!error && data?.signedUrl) {
            signedUrl = data.signedUrl;
            break;
          }
        }
        if (cancelled) return;
        if (signedUrl) {
          results.push({ url: signedUrl, name: file.name, type: file.type, size: file.size });
        }
      }
      if (!cancelled) {
        setBillUrls(results);
        setBillLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [lead.id, lead.bill_files, lead.bill_file_path, lead.bill_file_name]);

  // Load notes
  useEffect(() => {
    let cancelled = false;
    setNotesLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });
      if (!cancelled && !error && data) {
        setNotes(data);
      }
      if (!cancelled) setNotesLoading(false);
    })();
    return () => { cancelled = true; };
  }, [lead.id]);

  // Generate AI summary
  const generateAiSummary = async () => {
    setAiLoading(true);
    setAiError(null);
    setAiSummary(null);
    try {
      const prompt = `You are an expert energy market analyst. Generate a concise, actionable summary for this lead. Include: recommended approach, potential value, key talking points, and any risks.\n\nLead Data:\n- Name: ${lead.first_name} ${lead.last_name}\n- Email: ${lead.email || 'N/A'}\n- Phone: ${lead.phone || 'N/A'}\n- Region: ${lead.region || 'N/A'}\n- Customer Type: ${lead.customer_type || 'N/A'}\n- Category: ${lead.customer_category || 'N/A'}\n- Provider: ${lead.provider || 'N/A'}\n- Status: ${lead.status}\n- Property: ${lead.property_type || 'N/A'}\n- Comments: ${lead.comments || 'N/A'}\n- Created: ${new Date(lead.created_at).toLocaleDateString('el-GR')}\n\nRespond in Greek. Be concise (3-5 bullet points).`;

      const { data, error } = await supabase.functions.invoke('orchestrator', {
        body: {
          message: prompt,
          mode: 'chat',
          api_key: hubApiKey || undefined,
          model: hubModel || undefined,
        },
      });

      if (error) throw error;
      setAiSummary(data.reply);

      // Save as a note
      await supabase.from('lead_notes').insert({
        lead_id: lead.id,
        content: data.reply,
        author: 'AI Agent',
        note_type: 'ai_summary',
      });
      // Refresh notes
      const { data: refreshedNotes } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });
      if (refreshedNotes) setNotes(refreshedNotes);
    } catch (e: any) {
      setAiError(e.message || 'Failed to generate summary');
    }
    setAiLoading(false);
  };

  // AI Omnichannel Strategy
  const generateOmnichannel = async () => {
    setOmniLoading(true);
    setOmniError(null);
    setOmnichannel(null);
    try {
      const prompt = `You are an expert omnichannel outreach strategist for an energy company. Analyze this lead and recommend the BEST channel for initial contact. Respond ONLY with valid JSON (no markdown, no code fences).

Lead Data:
- Name: ${lead.first_name} ${lead.last_name}
- Email: ${lead.email || 'N/A'}
- Phone: ${lead.phone || 'N/A'}
- Region: ${lead.region || 'N/A'}
- Customer Type: ${lead.customer_type || 'N/A'}
- Category: ${lead.customer_category || 'N/A'}
- Property: ${lead.property_type || 'N/A'}
- Provider: ${lead.provider || 'N/A'}
- Comments: ${lead.comments || 'N/A'}

Available channels: email, phone_call, sms, viber, in_person

Return JSON with this exact structure:
{
  "recommended_channel": "email|phone_call|sms|viber|in_person",
  "reasoning": "Brief explanation in Greek (2-3 sentences)",
  "draft_message": "A professional draft message in Greek for the recommended channel",
  "next_steps": ["step 1", "step 2", "step 3"]
}`;

      const { data, error } = await supabase.functions.invoke('orchestrator', {
        body: {
          message: prompt,
          mode: 'chat',
          api_key: hubApiKey || undefined,
          model: hubModel || undefined,
        },
      });

      if (error) throw error;
      
      // Parse JSON from response
      let parsed;
      try {
        // Try to extract JSON from the response (might be wrapped in markdown)
        const jsonMatch = data.reply.match(/\{[\s\S]*\}/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(data.reply);
      } catch {
        throw new Error('Failed to parse AI response. Raw: ' + data.reply.substring(0, 200));
      }

      setOmnichannel(parsed);

      // Save as a note
      await supabase.from('lead_notes').insert({
        lead_id: lead.id,
        content: `AI Omnichannel Strategy:\nChannel: ${parsed.recommended_channel}\nReasoning: ${parsed.reasoning}\n\nDraft:\n${parsed.draft_message}\n\nNext Steps:\n${parsed.next_steps?.map((s: string) => `• ${s}`).join('\n') || ''}`,
        author: 'AI Agent',
        note_type: 'ai_summary',
      });
      const { data: refreshedNotes } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });
      if (refreshedNotes) setNotes(refreshedNotes);
    } catch (e: any) {
      setOmniError(e.message || 'Failed to generate strategy');
    }
    setOmniLoading(false);
  };

  // Send email via Edge Function
  const sendEmail = async (to: string, subject: string, html: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: { to, subject, html, from_name: 'Hlektrismos.gr' },
      });
      if (error) throw error;
      alert(`Email sent to ${to}!`);
    } catch (e: any) {
      alert(`Failed to send email: ${e.message}`);
    }
  };

  // Add manual note
  const addNote = async () => {
    if (!newNote.trim()) return;
    setAddingNote(true);
    try {
      await supabase.from('lead_notes').insert({
        lead_id: lead.id,
        content: newNote.trim(),
        author: 'CRM User',
        note_type: 'manual',
      });
      setNewNote('');
      const { data } = await supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false });
      if (data) setNotes(data);
    } catch (e: any) {
      console.error('Failed to add note:', e);
    }
    setAddingNote(false);
  };

  // Save energy contract fields
  const saveEnergyFields = async () => {
    setSavingEnergy(true);
    try {
      const updates: any = {};
      if (currentProvider !== (lead.current_provider || '')) updates.current_provider = currentProvider || null;
      if (programName !== (lead.program_name || '')) updates.program_name = programName || null;
      if (unitRate !== (lead.unit_rate_kwh?.toString() || '')) updates.unit_rate_kwh = unitRate ? parseFloat(unitRate) : null;
      if (monthlyKwh !== (lead.monthly_kwh?.toString() || lead.consumption_kwh?.toString() || '')) updates.monthly_kwh = monthlyKwh ? parseFloat(monthlyKwh) : null;
      if (Object.keys(updates).length > 0) {
        await supabase.from('hlektrismos_leads').update(updates).eq('id', lead.id);
        // Log as note
        const changes = Object.entries(updates).map(([k, v]) => `${k}: ${v}`).join(', ');
        await supabase.from('lead_notes').insert({
          lead_id: lead.id,
          content: `Ενημερώθηκε συμβόλαιο ενέργειας — ${changes}`,
          author: 'CRM User',
          note_type: 'status_change',
        });
      }
    } catch (e: any) {
      console.error('Failed to save energy fields:', e);
    }
    setSavingEnergy(false);
  };

  // Fetch tariff recommendations based on monthly_kwh and customer_type
  const fetchRecommendations = async () => {
    const kwh = parseFloat(monthlyKwh);
    if (!kwh || kwh <= 0) {
      alert('Εισάγετε κατανάλωση kWh/μήνα για να λάβετε προτάσεις.');
      return;
    }
    setLoadingRecs(true);
    setShowRecs(true);
    try {
      const customerType = lead.customer_type === 'business' ? 'B2B' : 'B2C';
      const { data, error } = await supabase.rpc('recommend_tariffs', {
        p_customer_type: customerType,
        p_monthly_kwh: kwh,
      });
      if (error) throw error;
      // Calculate savings vs current cost
      const currentCost = lead.unit_rate_kwh ? (kwh * lead.unit_rate_kwh) : null;
      const enriched = (data || []).map((r: any) => ({
        ...r,
        savings_vs_current: currentCost ? Math.max(0, currentCost - r.estimated_monthly_cost) : 0,
      }));
      setRecommendations(enriched);
    } catch (e: any) {
      console.error('Failed to fetch recommendations:', e);
      setRecommendations([]);
    }
    setLoadingRecs(false);
  };

  // Send offer via send-offer Edge Function
  const sendOffer = async (rec: any) => {
    setSendingOffer(rec.tariff_id);
    try {
      const { data, error } = await supabase.functions.invoke('send-offer', {
        body: {
          lead_id: lead.id,
          tariff_id: rec.tariff_id,
          provider_name: rec.provider_name,
          program_name: rec.program_name,
          estimated_cost: rec.estimated_monthly_cost,
          savings: rec.savings_vs_current,
          customer_name: `${lead.first_name} ${lead.last_name}`,
          customer_phone: lead.phone,
          customer_email: lead.email,
        },
      });
      if (error) throw error;
      alert(`✅ Προσφορά στάλθηκε στον/στην ${lead.first_name} ${lead.last_name}!`);
      // Log as note
      await supabase.from('lead_notes').insert({
        lead_id: lead.id,
        content: `📧 Προσφορά στάλθηκε: ${rec.provider_name} - ${rec.program_name} (€${rec.estimated_monthly_cost}/μήνα, εξοικονόμηση €${rec.savings_vs_current?.toFixed(2) || '0'}/μήνα)`,
        author: 'CRM User',
        note_type: 'offer_sent',
      });
    } catch (e: any) {
      console.error('Failed to send offer:', e);
      alert('Αποτυχία αποστολής προσφοράς: ' + e.message);
    }
    setSendingOffer(null);
  };

  // Upload bill file
  const handleBillUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(`Μεταφόρτωση ${files.length} αρχείων...`);
    try {
      const uploaded: UploadedFile[] = [];
      for (let i = 0; i < files.length; i++) {
        setUploadProgress(`Μεταφόρτωση ${i + 1}/${files.length}: ${files[i].name}`);
        const { data, error } = await uploadDocument(files[i], lead.id);
        if (error) throw new Error(error);
        if (data) uploaded.push(data);
      }
      // Merge with existing bill_files
      const existing = lead.bill_files || [];
      const merged = [...existing, ...uploaded];
      await updateLeadBillFiles(lead.id, merged);
      // Log as note
      await supabase.from('lead_notes').insert({
        lead_id: lead.id,
        content: `Μεταφορτώθηκαν ${uploaded.length} νέα αρχεία λογαριασμού: ${uploaded.map(u => u.name).join(', ')}`,
        author: 'CRM User',
        note_type: 'system',
      });
      setUploadProgress(`✅ ${uploaded.length} αρχεία μεταφορτώθηκαν!`);
      setTimeout(() => { setUploading(false); setUploadProgress(''); }, 2000);
      // Refresh bill URLs
      const results: BillFile[] = [];
      for (const file of merged) {
        let signedUrl = '';
        for (const bucket of ['hlektrismos_docs', 'energy-bills']) {
          const { data: urlData, error: urlErr } = await supabase.storage.from(bucket).createSignedUrl(file.path, 60 * 10);
          if (!urlErr && urlData?.signedUrl) { signedUrl = urlData.signedUrl; break; }
        }
        if (signedUrl) results.push({ url: signedUrl, name: file.name, type: file.type, size: file.size });
      }
      setBillUrls(results);
    } catch (e: any) {
      setUploadProgress(`❌ Σφάλμα: ${e.message}`);
      setTimeout(() => { setUploading(false); setUploadProgress(''); }, 3000);
    }
  };

  // Convert lead status
  const convertStatus = async (newStatus: string) => {
    setConvertingStatus(true);
    try {
      const updates: any = { status: newStatus, pipeline_status: newStatus };
      if (newStatus === 'customer') {
        updates.converted_at = new Date().toISOString();
        if (currentProvider) updates.current_provider = currentProvider;
        if (programName) updates.program_name = programName;
        if (unitRate) updates.unit_rate_kwh = parseFloat(unitRate);
      }
      await supabase.from('hlektrismos_leads').update(updates).eq('id', lead.id);
      await supabase.from('lead_notes').insert({
        lead_id: lead.id,
        content: `Κατάσταση αλλάξτηκε σε: ${newStatus}${newStatus === 'customer' ? ' — Μετατροπή σε πελάτη!' : ''}`,
        author: 'CRM User',
        note_type: 'status_change',
      });
      onClose();
    } catch (e: any) {
      console.error('Failed to convert status:', e);
    }
    setConvertingStatus(false);
  };

  const assignedUser = crmUsers.find((u) => u.id === lead.assigned_to);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Slide-out panel */}
      <div
        style={{
          position: 'relative',
          width: 'min(560px, 95vw)',
          height: '100vh',
          background: '#fff',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-12px 0 48px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'slide-in-right 0.3s ease',
          zIndex: 1,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.95), rgba(245,247,250,0.95))',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#00c878', marginBottom: 2 }}>
              Lead Detail
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
              {lead.first_name} {lead.last_name}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className={`dash-status-pill ${lead.status}`} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>
              {lead.status}
            </span>
            {/* Kill Switch: Pause AI */}
            <button
              onClick={async () => {
                const newVal = !lead.ai_paused;
                if (newVal && !confirm(`Παύση AI για ${lead.first_name} ${lead.last_name}; Το AI δεν θα στείλει emails/κλήσεις/SMS.`)) return;
                if (!newVal && !confirm(`Επαναφορά AI για ${lead.first_name} ${lead.last_name};`)) return;
                await supabase.from('hlektrismos_leads').update({ ai_paused: newVal }).eq('id', lead.id);
                await supabase.from('lead_notes').insert({ lead_id: lead.id, content: newVal ? '🛑 AI PAUSED by user' : '✅ AI RESUMED by user', author: user?.email || 'CRM User', note_type: 'system' });
                onClose();
              }}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: lead.ai_paused ? '#fef2f2' : '#f0fdf4',
                color: lead.ai_paused ? '#dc2626' : '#16a34a',
                border: `1px solid ${lead.ai_paused ? '#fecaca' : '#bbf7d0'}`,
                display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
              }}
            >
              {lead.ai_paused ? '🛑 AI Παυμένο' : '▶ AI Ενεργό'}
            </button>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 8,
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>

          {/* Contact Info Section */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              <User size={14} /> Contact Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px 18px' }}>
              <FieldItem icon={<Mail size={14} />} label="Email" value={lead.email} />
              <FieldItem icon={<Phone size={14} />} label="Phone" value={lead.phone} />
              <FieldItem icon={<MapPin size={14} />} label="Region" value={lead.region} />
              <FieldItem icon={<Building2 size={14} />} label="Customer Type" value={lead.customer_type} />
              <FieldItem icon={<Tag size={14} />} label="Category" value={lead.customer_category} />
              <FieldItem icon={<Zap size={14} />} label="Provider" value={lead.provider} />
              <FieldItem icon={<Calendar size={14} />} label="Created" value={new Date(lead.created_at).toLocaleDateString('el-GR')} />
              {assignedUser && <FieldItem icon={<UserCheck size={14} />} label="Assigned To" value={assignedUser.full_name} />}
              {lead.property_type && <FieldItem icon={<Building2 size={14} />} label="Property" value={lead.property_type} />}
              {lead.lawful_basis && <FieldItem icon={<Tag size={14} />} label="Lawful Basis" value={lead.lawful_basis} />}
            </div>
            {lead.comments && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Comments</div>
                <p style={{ margin: 0, background: 'var(--surface-2, #f5f7fa)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', fontSize: 14, lineHeight: 1.55, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                  {lead.comments}
                </p>
              </div>
            )}
          </section>

          {/* Energy Contract Section */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              <Zap size={14} /> Συμβόλαιο Ενέργειας
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Πάροχος</label>
                <select
                  value={currentProvider}
                  onChange={e => setCurrentProvider(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff', color: 'var(--text)' }}
                >
                  <option value="">Επιλέξτε...</option>
                  {['ΔΕΗ', 'Protergia', 'ΗΡΩΝ', 'ZeniΘ', 'nrg', 'Φυσικό Αέριο', 'Volton', 'Ελίν', 'Enerwave', 'Eunice Power'].map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Πρόγραμμα</label>
                <input
                  type="text"
                  value={programName}
                  onChange={e => setProgramName(e.target.value)}
                  placeholder="π.χ. Flex Home, Business Plus"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff', color: 'var(--text)' }}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Τιμή / kWh (€)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={unitRate}
                  onChange={e => setUnitRate(e.target.value)}
                  placeholder="0.1234"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff', color: 'var(--text)' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 4 }}>Κατανάλωση kWh/μήνα</label>
                <input
                  type="number"
                  step="1"
                  value={monthlyKwh}
                  onChange={e => setMonthlyKwh(e.target.value)}
                  placeholder="π.χ. 300"
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: '#fff', color: 'var(--text)' }}
                />
              </div>
            </div>
            <button
              onClick={saveEnergyFields}
              disabled={savingEnergy}
              style={{
                marginTop: 10, padding: '7px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: savingEnergy ? 'not-allowed' : 'pointer',
                background: savingEnergy ? 'var(--surface-2, #f5f7fa)' : '#00c878', color: savingEnergy ? 'var(--text-muted)' : '#fff',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
              }}
            >
              {savingEnergy ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CheckCircle2 size={13} />}
              {savingEnergy ? 'Αποθήκευση...' : 'Αποθήκευση Στοιχείων'}
            </button>
            <button
              onClick={async () => {
                if (!confirm('Αυτό θα ενημερώσει τις τιμές από τις επίσημες σελίδες των παρόχων. Συνέχεια;')) return;
                setSavingEnergy(true);
                try {
                  const { data, error } = await supabase.functions.invoke('scrape-program-details');
                  if (error) throw error;
                  alert(`✅ Ενημερώθηκαν ${data?.updated || 0} τιμολόγια (${data?.failed || 0} αποτυχίες)`);
                } catch (e: any) {
                  alert('Αποτυχία: ' + e.message);
                }
                setSavingEnergy(false);
              }}
              disabled={savingEnergy}
              style={{
                marginTop: 6, padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, fontWeight: 600,
                cursor: savingEnergy ? 'not-allowed' : 'pointer',
                background: 'var(--surface)', color: 'var(--text)',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
              }}
            >
              <RefreshCw size={13} /> Ενημέρωση Τιμών από Παρόχους
            </button>
          </section>

          {/* Smart Recommendations Engine */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              <Star size={14} /> Έξυπνες Προτάσεις
            </h3>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                onClick={fetchRecommendations}
                disabled={loadingRecs || !monthlyKwh}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                  cursor: loadingRecs || !monthlyKwh ? 'not-allowed' : 'pointer',
                  background: loadingRecs ? 'var(--surface-2)' : '#0ea5e9', color: loadingRecs ? 'var(--text-muted)' : '#fff',
                  display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
                }}
              >
                {loadingRecs ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <TrendingDown size={13} />}
                {loadingRecs ? 'Αναζήτηση...' : 'Εύρεση Καλύτερης Τιμής'}
              </button>
              {!showRecs && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', alignSelf: 'center' }}>
                  Εισάγετε κατανάλωση kWh και πατήστε
                </span>
              )}
            </div>

            {showRecs && !loadingRecs && recommendations.length === 0 && (
              <div style={{ padding: '12px 16px', background: '#fff7ed', borderRadius: 8, border: '1px solid #fed7aa', fontSize: 12, color: '#9a3412' }}>
                Δεν βρέθηκαν προτάσεις για αυτή την κατανάλωση.
              </div>
            )}

            {recommendations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recommendations.map((rec, idx) => (
                  <div
                    key={rec.tariff_id}
                    style={{
                      padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)',
                      background: idx === 0 ? 'linear-gradient(135deg, #ecfdf5, #f0fdf4)' : 'var(--surface)',
                      position: 'relative',
                    }}
                  >
                    {idx === 0 && (
                      <span style={{
                        position: 'absolute', top: -8, right: 12, background: '#10b981', color: '#fff',
                        fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        ⭐ ΚΑΛΥΤΕΡΗ ΤΙΜΗ
                      </span>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
                          {rec.provider_name} — {rec.program_name}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 3 }}>
                          <span style={{
                            display: 'inline-block', width: 10, height: 10, borderRadius: '50%',
                            background: rec.tariff_color === 'green' ? '#10b981' : rec.tariff_color === 'blue' ? '#3b82f6' : rec.tariff_color === 'yellow' ? '#f59e0b' : rec.tariff_color === 'orange' ? '#f97316' : '#9ca3af',
                          }} />
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {rec.tariff_color} · {rec.verification_status === 'verified' ? '✅ Επιβεβαιωμένο' : '⚠️ Χρειάζεται Επιβεβαίωση'}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#10b981' }}>
                          €{rec.estimated_monthly_cost}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>€/μήνα</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                      <span>€{rec.base_price_day}/kWh</span>
                      {rec.base_price_night && <span>Νύχτα: €{rec.base_price_night}/kWh</span>}
                      {rec.fixed_fee_monthly > 0 && <span>Σταθερό: €{rec.fixed_fee_monthly}/μήνα</span>}
                      {rec.discounted_price_day && <span style={{ color: '#10b981' }}>Έκπτωση: €{rec.discounted_price_day}/kWh</span>}
                    </div>
                    {rec.savings_vs_current > 0 && (
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: '#10b981', marginBottom: 8,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <TrendingDown size={12} /> Εξοικονόμηση: €{rec.savings_vs_current.toFixed(2)}/μήνα (€{(rec.savings_vs_current * 12).toFixed(2)}/χρόνο)
                      </div>
                    )}
                    {rec.discount_conditions && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontStyle: 'italic' }}>
                        📋 {rec.discount_conditions}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => sendOffer(rec)}
                        disabled={sendingOffer === rec.tariff_id}
                        style={{
                          padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 11, fontWeight: 600,
                          cursor: sendingOffer === rec.tariff_id ? 'not-allowed' : 'pointer',
                          background: '#00c878', color: '#fff',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        {sendingOffer === rec.tariff_id ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={11} />}
                        {sendingOffer === rec.tariff_id ? 'Αποστολή...' : 'Αποστολή Προσφοράς'}
                      </button>
                      <button
                        onClick={() => setOfferModal({ tariff: rec })}
                        style={{
                          padding: '6px 14px', borderRadius: 8, border: '1px solid #0ea5e9', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', background: '#f0f9ff', color: '#0ea5e9',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}
                      >
                        <FileText size={11} /> Παραγωγή PDF
                      </button>
                      {rec.official_url && (
                        <a
                          href={rec.official_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 11, fontWeight: 600,
                            background: 'var(--surface)', color: 'var(--text)',
                            display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none',
                          }}
                        >
                          <ExternalLink size={11} /> Επίσημη Σελίδα
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Status Conversion */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              <UserCheck size={14} /> Μετατροπή Κατάστασης
            </h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[
                { status: 'follow_up', label: '📞 Follow-Up', color: '#f59e0b', bg: '#fffbeb' },
                { status: 'customer', label: '✅ Πελάτης', color: '#10b981', bg: '#ecfdf5' },
                { status: 'lost', label: '❌ Χαμένο', color: '#ef4444', bg: '#fef2f2' },
              ].map(s => (
                <button
                  key={s.status}
                  onClick={() => convertStatus(s.status)}
                  disabled={convertingStatus || lead.status === s.status}
                  style={{
                    padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: convertingStatus ? 'not-allowed' : 'pointer',
                    border: `1px solid ${lead.status === s.status ? s.color : 'var(--border)'}`,
                    background: lead.status === s.status ? s.bg : 'var(--surface)',
                    color: lead.status === s.status ? s.color : 'var(--text)',
                    opacity: convertingStatus ? 0.6 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {lead.converted_at && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                ✅ Μετατράπηκε σε πελάτη: {new Date(lead.converted_at).toLocaleDateString('el-GR')}
              </div>
            )}
          </section>

          {/* AI Summary Section */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
                <Sparkles size={14} /> AI Summary
              </h3>
              <button
                onClick={generateAiSummary}
                disabled={aiLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: aiLoading ? 'var(--surface-2, #f5f7fa)' : 'var(--surface, #f0f2f5)',
                  color: aiLoading ? 'var(--text-muted)' : '#00c878',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: aiLoading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {aiLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={14} />}
                {aiLoading ? 'Generating...' : aiSummary ? 'Regenerate' : 'Generate Summary'}
              </button>
            </div>
            {aiError && (
              <div style={{ padding: 12, background: 'rgba(231,76,60,0.08)', borderRadius: 10, color: '#e74c3c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={14} /> {aiError}
              </div>
            )}
            {aiSummary && (
              <div style={{ background: 'var(--surface-2, #f5f7fa)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, fontSize: 14, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                {aiSummary}
              </div>
            )}
            {!aiLoading && !aiSummary && !aiError && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                Click "Generate Summary" to get an AI-powered analysis of this lead.
              </div>
            )}
          </section>

          {/* AI Omnichannel Strategy Section */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
                <Zap size={14} /> AI Omnichannel Strategy
              </h3>
              <button
                onClick={generateOmnichannel}
                disabled={omniLoading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                  border: '1px solid rgba(0,102,204,0.3)', background: omniLoading ? 'var(--surface-2, #f5f7fa)' : 'rgba(0,102,204,0.06)',
                  color: omniLoading ? 'var(--text-muted)' : '#0066cc', fontSize: 12, fontWeight: 600,
                  cursor: omniLoading ? 'not-allowed' : 'pointer', transition: 'all 0.15s',
                }}
              >
                {omniLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={14} />}
                {omniLoading ? 'Analyzing...' : omnichannel ? '🔄 Re-analyze' : '🤖 Start AI Outreach'}
              </button>
            </div>
            {omniError && (
              <div style={{ padding: 12, background: 'rgba(231,76,60,0.08)', borderRadius: 10, color: '#e74c3c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={14} /> {omniError}
              </div>
            )}
            {omnichannel && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Recommended Channel */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'rgba(0,102,204,0.04)', border: '1px solid rgba(0,102,204,0.2)', borderRadius: 10 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(0,102,204,0.1)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    {omnichannel.recommended_channel === 'email' && <Mail size={18} style={{ color: '#0066cc' }} />}
                    {omnichannel.recommended_channel === 'phone_call' && <Phone size={18} style={{ color: '#0066cc' }} />}
                    {omnichannel.recommended_channel === 'sms' && <MessageSquare size={18} style={{ color: '#0066cc' }} />}
                    {omnichannel.recommended_channel === 'viber' && <MessageSquare size={18} style={{ color: '#7b51d5' }} />}
                    {omnichannel.recommended_channel === 'in_person' && <User size={18} style={{ color: '#0066cc' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Recommended Channel</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#0066cc', textTransform: 'capitalize' }}>
                      {omnichannel.recommended_channel === 'phone_call' ? '📞 Phone Call' :
                       omnichannel.recommended_channel === 'email' ? '📧 Email' :
                       omnichannel.recommended_channel === 'sms' ? '💬 SMS' :
                       omnichannel.recommended_channel === 'viber' ? '💜 Viber' :
                       '🤝 In Person'}
                    </div>
                  </div>
                </div>

                {/* Reasoning */}
                <div style={{ padding: '12px 14px', background: 'var(--surface-2, #f5f7fa)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Reasoning</div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text)' }}>{omnichannel.reasoning}</p>
                </div>

                {/* Draft Message */}
                <div style={{ padding: '12px 14px', background: 'var(--surface-2, #f5f7fa)', border: '1px solid var(--border)', borderRadius: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Draft Message</div>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{omnichannel.draft_message}</p>
                </div>

                {/* Next Steps */}
                {omnichannel.next_steps && omnichannel.next_steps.length > 0 && (
                  <div style={{ padding: '12px 14px', background: 'rgba(0,200,120,0.04)', border: '1px solid rgba(0,200,120,0.2)', borderRadius: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Next Steps</div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>
                      {omnichannel.next_steps.map((step: string, i: number) => <li key={i}>{step}</li>)}
                    </ul>
                  </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {omnichannel.recommended_channel === 'email' && lead.email && (
                    <button
                      onClick={() => {
                        const subject = `Ενημέρωση - ${lead.first_name} ${lead.last_name}`;
                        sendEmail(lead.email, subject, omnichannel.draft_message.replace(/\n/g, '<br>'));
                      }}
                      style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#0066cc', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      <Send size={14} /> Send Email
                    </button>
                  )}
                  {omnichannel.recommended_channel === 'phone_call' && lead.phone && (
                    <a href={`tel:${lead.phone}`} style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#00c878', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', textAlign: 'center' }}>
                      <Phone size={14} /> Call Now
                    </a>
                  )}
                  {omnichannel.recommended_channel === 'sms' && lead.phone && (
                    <a href={`sms:${lead.phone}`} style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: '#f59e0b', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none', textAlign: 'center' }}>
                      <MessageSquare size={14} /> Send SMS
                    </a>
                  )}
                </div>
              </div>
            )}
            {!omniLoading && !omnichannel && !omniError && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                Click "Start AI Outreach" to get an AI-powered channel recommendation and draft message.
              </div>
            )}
          </section>

          {/* AI Voice Call Section */}
          {lead.phone && (
            <section>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                <Phone size={14} /> AI Voice Call
              </h3>
              <button
                onClick={async () => {
                  if (!confirm(`Κλήση στο ${lead.phone} με AI Agent;`)) return;
                  try {
                    const { data, error } = await supabase.functions.invoke('make-voice-call', {
                      body: {
                        lead_id: lead.id,
                        phone: lead.phone,
                        first_name: lead.first_name,
                        last_name: lead.last_name,
                        region: lead.region,
                        company_name: lead.company_name,
                        current_provider: lead.current_provider || lead.provider,
                      },
                    });
                    if (error) throw error;
                    alert(`✅ AI Call initiated! Call ID: ${data.call_id}`);
                  } catch (e: any) {
                    alert(`❌ Error: ${e.message}`);
                  }
                }}
                style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #7c3aed, #a855f7)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                <Phone size={16} /> Κλήση με AI Agent (Αλέξης)
              </button>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'center' }}>Ελληνική AI φωνή • Vapi.ai • ~€0.15/κλήση</p>
            </section>
          )}

          {/* Bill Files Section */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
                <FileText size={14} /> Bill Files
              </h3>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
                  border: '1px solid #00c878', background: uploading ? '#f0fdf4' : 'rgba(0,200,120,0.06)',
                  color: '#00c878', fontSize: 12, fontWeight: 600, cursor: uploading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {uploading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />}
                {uploading ? 'Μεταφόρτωση...' : '📤 Μεταφόρτωση'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv"
                onChange={e => handleBillUpload(e.target.files)}
                style={{ display: 'none' }}
              />
            </div>
            {uploadProgress && (
              <div style={{
                padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 500, marginBottom: 10,
                background: uploadProgress.startsWith('❌') ? 'rgba(231,76,60,0.08)' : uploadProgress.startsWith('✅') ? 'rgba(0,200,120,0.08)' : 'rgba(0,102,204,0.06)',
                color: uploadProgress.startsWith('❌') ? '#e74c3c' : uploadProgress.startsWith('✅') ? '#00c878' : '#0066cc',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {uploadProgress.startsWith('❌') ? <AlertCircle size={13} /> : uploadProgress.startsWith('✅') ? <CheckCircle2 size={13} /> : <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                {uploadProgress}
              </div>
            )}
            {billLoading && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} /> Loading files...
              </div>
            )}
            {billError && (
              <div style={{ padding: 12, background: 'rgba(231,76,60,0.08)', borderRadius: 10, color: '#e74c3c', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertCircle size={14} /> {billError}
              </div>
            )}
            {!billLoading && !billError && billUrls.length === 0 && (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                <FolderOpen size={28} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
                No uploaded files
              </div>
            )}
            {billUrls.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {billUrls.map((file, i) => {
                  const isImage = file.type.startsWith('image/');
                  const isPdf = file.type === 'application/pdf';
                  const isPreviewed = previewFile === file;
                  return (
                    <div key={i}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 14px',
                        background: 'var(--surface-2, #f5f7fa)',
                        border: `1px solid ${isPreviewed ? '#0066cc' : 'var(--border)'}`,
                        borderRadius: 10,
                      }}>
                        {isImage ? (
                          <img
                            src={file.url}
                            alt={file.name}
                            onClick={() => setPreviewFile(isPreviewed ? null : file)}
                            style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)', cursor: 'zoom-in', flexShrink: 0 }}
                          />
                        ) : isPdf ? (
                          <FileText size={22} style={{ color: '#e74c3c', flexShrink: 0 }} />
                        ) : (
                          <ImageIcon size={22} style={{ color: '#00c878', flexShrink: 0 }} />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {isPdf ? 'PDF' : isImage ? (file.type === 'image/jpeg' ? 'JPEG' : file.type === 'image/png' ? 'PNG' : 'WEBP') : 'CSV/XLS'}
                            {file.size > 0 ? ` · ${(file.size / 1024 / 1024).toFixed(1)}MB` : ''}
                          </div>
                        </div>
                        {(isImage || isPdf) && (
                          <button
                            onClick={() => setPreviewFile(isPreviewed ? null : file)}
                            title="Inline προεπισκόπηση"
                            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: `1px solid ${isPreviewed ? '#0066cc' : 'var(--border)'}`, background: isPreviewed ? 'rgba(0,102,204,0.08)' : '#fff', color: isPreviewed ? '#0066cc' : 'var(--text)', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                          >
                            <Eye size={12} /> {isPreviewed ? 'Απόκρυψη' : 'Προεπισκόπηση'}
                          </button>
                        )}
                        <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--text)', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <ExternalLink size={12} /> View
                        </a>
                        <a href={file.url} download={file.name} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--text)', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <Download size={12} /> Download
                        </a>
                        <button
                          onClick={async () => {
                            try {
                              const { data, error } = await supabase.functions.invoke('billing-ocr', {
                                body: { lead_id: lead.id, file_url: file.url, file_type: file.type },
                              });
                              if (error) throw error;
                              alert(`📄 OCR Extracted:\nProvider: ${data.data?.provider || 'N/A'}\nRate: €${data.data?.unit_rate_kwh || 'N/A'}/kWh\nMonthly: €${data.data?.monthly_cost_total || 'N/A'}\nConsumption: ${data.data?.consumption_kwh || 'N/A'} kWh`);
                            } catch (e: any) {
                              alert(`❌ OCR Error: ${e.message}`);
                            }
                          }}
                          style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid #7c3aed', background: '#faf5ff', color: '#7c3aed', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                        >
                          <Zap size={12} /> Extract Bill Data
                        </button>
                      </div>
                      {isPreviewed && (
                        <div style={{ marginTop: -6, margin: '0 12px', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden', background: '#fff' }}>
                          {isImage ? (
                            <img src={file.url} alt={file.name} style={{ width: '100%', maxHeight: 420, objectFit: 'contain', display: 'block' }} />
                          ) : (
                            <iframe src={`${file.url}#toolbar=0`} title={file.name} style={{ width: '100%', height: 420, border: 'none' }} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Notes Timeline Section */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              <MessageSquare size={14} /> Notes & Activity
            </h3>

            {/* Add note input */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addNote(); } }}
                placeholder="Add a note..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  background: '#fff',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  fontSize: 13,
                  color: 'var(--text)',
                  outline: 'none',
                }}
              />
              <button
                onClick={addNote}
                disabled={addingNote || !newNote.trim()}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: newNote.trim() ? '#00c878' : 'var(--surface-2, #f5f7fa)',
                  color: newNote.trim() ? '#fff' : 'var(--text-muted)',
                  cursor: addingNote || !newNote.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  transition: 'all 0.15s',
                }}
              >
                {addingNote ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
              </button>
            </div>

            {/* Notes list */}
            {notesLoading && (
              <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} /> Loading notes...
              </div>
            )}
            {!notesLoading && notes.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
                No notes yet. Add one above.
              </div>
            )}
            {notes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {notes.map((note) => (
                  <div key={note.id} style={{
                    padding: '12px 14px',
                    background: note.note_type === 'ai_summary' ? 'rgba(0,200,120,0.04)' : 'var(--surface-2, #f5f7fa)',
                    border: note.note_type === 'ai_summary' ? '1px solid rgba(0,200,120,0.2)' : '1px solid var(--border)',
                    borderRadius: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {note.note_type === 'ai_summary' ? <Sparkles size={12} style={{ color: '#00c878' }} /> : <User size={12} style={{ color: 'var(--text-muted)' }} />}
                        <span style={{ fontSize: 12, fontWeight: 600, color: note.note_type === 'ai_summary' ? '#00c878' : 'var(--text)' }}>
                          {note.author}
                        </span>
                        <span style={{
                          fontSize: 10,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: note.note_type === 'ai_summary' ? 'rgba(0,200,120,0.1)' : 'var(--surface, #f0f2f5)',
                          color: 'var(--text-muted)',
                          fontWeight: 500,
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                        }}>
                          {NOTE_TYPE_LABELS[note.note_type] || note.note_type}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} />
                        {new Date(note.created_at).toLocaleDateString('el-GR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{note.content}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      {offerModal && (
        <OfferModal
          lead={lead}
          tariff={offerModal.tariff}
          onClose={() => setOfferModal(null)}
        />
      )}
    </div>
  );
}

function FieldItem({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 14, color: 'var(--text)', wordBreak: 'break-word' }}>
        {value || <span style={{ color: 'var(--text-muted)' }}>—</span>}
      </div>
    </div>
  );
}
