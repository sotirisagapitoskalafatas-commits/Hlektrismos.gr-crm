import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Sparkles, User, Database, MessageSquare, Plus, Zap, ChevronDown, ChevronUp, ExternalLink, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type TariffSource = {
  id: string;
  provider_name: string;
  program_name: string;
  tariff_color: string;
  unit_rate_kwh: number;
  fixed_fee_monthly?: number;
  validity_month?: string;
  similarity?: number;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  sources?: TariffSource[];
};

type Thread = {
  id: string;
  title: string;
  updated_at: string;
};

const COLOR_BADGES: Record<string, { bg: string; fg: string; label: string }> = {
  green: { bg: '#dcfce7', fg: '#166534', label: 'Πράσινο' },
  blue: { bg: '#dbeafe', fg: '#1e40af', label: 'Μπλε' },
  yellow: { bg: '#fef9c3', fg: '#854d0e', label: 'Κίτρινο' },
  orange: { bg: '#ffedd5', fg: '#9a3412', label: 'Πορτοκαλί' },
};

export default function MarketRAGSearch() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchThreads();
  }, []);

  useEffect(() => {
    if (activeThreadId) fetchMessages(activeThreadId);
    else setMessages([]);
  }, [activeThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const fetchThreads = async () => {
    const { data } = await supabase
      .from('chat_threads')
      .select('*')
      .order('updated_at', { ascending: false });
    if (data) {
      setThreads(data);
      if (data.length > 0 && !activeThreadId) setActiveThreadId(data[0].id);
    }
  };

  const fetchMessages = async (threadId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (data) setMessages(data.map(m => ({ role: m.role, content: m.content, sources: m.sources })));
  };

  const createNewThread = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const { data, error: err } = await supabase
      .from('chat_threads')
      .insert([{ title: 'Νέα Ερώτηση Αγοράς', user_id: userData.user?.id }])
      .select()
      .single();
    if (data && !err) {
      setThreads([data, ...threads]);
      setActiveThreadId(data.id);
      setMessages([]);
    }
  };

  const deleteThread = async (id: string) => {
    await supabase.from('chat_threads').delete().eq('id', id);
    setThreads(prev => prev.filter(t => t.id !== id));
    if (activeThreadId === id) {
      setActiveThreadId(threads.find(t => t.id !== id)?.id || null);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    let currentThreadId = activeThreadId;
    if (!currentThreadId) {
      const { data: userData } = await supabase.auth.getUser();
      const { data } = await supabase
        .from('chat_threads')
        .insert([{ title: input.slice(0, 30) + '...', user_id: userData.user?.id }])
        .select()
        .single();
      if (data) {
        currentThreadId = data.id;
        setActiveThreadId(data.id);
        setThreads([data, ...threads]);
      } else return;
    }

    const userMsg: Message = { role: 'user', content: input };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setIsTyping(true);
    setError(null);

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ask-market-rag', {
        body: {
          thread_id: currentThreadId,
          messages: updated.map(({ role, content }) => ({ role, content })),
        },
      });

      if (invokeError) throw invokeError;
      if (data.error) throw new Error(data.error);

      setMessages(prev => [...prev, { role: 'assistant', content: data.answer, sources: data.sources || [] }]);
      fetchThreads();
    } catch (err: any) {
      setError(err.message || 'Σφάλμα κλήσης AI.');
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ ${err.message}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      {/* Sidebar */}
      <div style={{ width: 260, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#f9fafb' }}>
        <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb' }}>
          <button onClick={createNewThread} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', background: '#0066cc', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <Plus size={14} /> Νέα Συζήτηση
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
          {threads.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
              <button
                onClick={() => setActiveThreadId(t.id)}
                style={{
                  flex: 1, textAlign: 'left', padding: '8px 10px', borderRadius: 8, fontSize: 12,
                  background: activeThreadId === t.id ? '#e0edff' : 'transparent',
                  color: activeThreadId === t.id ? '#0066cc' : '#374151',
                  fontWeight: activeThreadId === t.id ? 600 : 400,
                  border: 'none', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                <MessageSquare size={12} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              </button>
              <button onClick={() => deleteThread(t.id)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#e0edff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={16} color="#0066cc" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>AI Market Tariff Advisor</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>RAEYE-compliant • 10 providers • Real-time pricing</div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', color: '#9ca3af', marginTop: 80, fontSize: 13 }}>
              <Sparkles size={32} color="#d1d5db" style={{ margin: '0 auto 12px' }} />
              Ρώτα για τρέχοντα τιμολόγια, σύγκριση παρόχων, ή συγκεκριμένες τιμές ρεύματος.
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 10, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              {msg.role === 'assistant' && (
                <div style={{ width: 28, height: 28, borderRadius: 14, background: '#e0edff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <Sparkles size={12} color="#0066cc" />
                </div>
              )}
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: msg.role === 'user' ? '#0066cc' : '#f3f4f6',
                color: msg.role === 'user' ? '#fff' : '#1f2937', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
                {msg.sources && msg.sources.length > 0 && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.2)' : '#e5e7eb'}` }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: msg.role === 'user' ? 'rgba(255,255,255,0.7)' : '#6b7280', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Database size={10} /> Data Sources ({msg.sources.length})
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {msg.sources.map((src, i) => {
                        const badge = COLOR_BADGES[src.tariff_color] || { bg: '#f3f4f6', fg: '#374151', label: src.tariff_color || 'B2B' };
                        return (
                          <span key={i} style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: msg.role === 'user' ? 'rgba(255,255,255,0.15)' : badge.bg,
                            color: msg.role === 'user' ? '#fff' : badge.fg,
                            fontWeight: 600,
                          }}>
                            {src.provider_name} • €{src.unit_rate_kwh}/kWh • {badge.label}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div style={{ width: 28, height: 28, borderRadius: 14, background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <User size={12} color="#6b7280" />
                </div>
              )}
            </div>
          ))}

          {isTyping && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#6b7280', fontSize: 12 }}>
              <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: '#0066cc' }} />
              Ανάλυση δεδομένων αγοράς...
            </div>
          )}

          {error && (
            <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #e5e7eb', background: '#fff' }}>
          <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ρώτα για τιμές, σύγκριση παρόχων..."
              disabled={isTyping}
              style={{
                flex: 1, padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 10,
                fontSize: 13, outline: 'none', background: '#f9fafb',
              }}
            />
            <button
              type="submit"
              disabled={isTyping || !input.trim()}
              style={{
                padding: '10px 16px', borderRadius: 10, border: 'none',
                background: input.trim() && !isTyping ? '#0066cc' : '#d1d5db',
                color: '#fff', fontWeight: 600, fontSize: 13, cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {isTyping ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />}
              {isTyping ? 'Ανάλυση...' : 'Αναζήτηση'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
