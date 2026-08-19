import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

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
  const hubApiKey = localStorage.getItem('hub_api_key') || '';
  const hubModel = localStorage.getItem('hub_model') || 'gemini-3.6-flash';
  const [billUrls, setBillUrls] = useState<BillFile[]>([]);
  const [billLoading, setBillLoading] = useState(false);
  const [billError, setBillError] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Load bill file signed URLs
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

          {/* Bill Files Section */}
          <section>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              <FileText size={14} /> Bill Files
            </h3>
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
                {billUrls.map((file, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    background: 'var(--surface-2, #f5f7fa)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                  }}>
                    {file.type === 'application/pdf' ? (
                      <FileText size={22} style={{ color: '#e74c3c', flexShrink: 0 }} />
                    ) : (
                      <ImageIcon size={22} style={{ color: '#00c878', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        {file.type === 'application/pdf' ? 'PDF' : file.type === 'image/jpeg' ? 'JPEG' : 'PNG'}
                        {file.size > 0 ? ` · ${(file.size / 1024 / 1024).toFixed(1)}MB` : ''}
                      </div>
                    </div>
                    <a href={file.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--text)', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <ExternalLink size={12} /> View
                    </a>
                    <a href={file.url} download={file.name} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--text)', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <Download size={12} /> Download
                    </a>
                  </div>
                ))}
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
