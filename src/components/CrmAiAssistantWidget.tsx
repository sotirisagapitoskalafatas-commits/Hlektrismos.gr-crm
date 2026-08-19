import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, Send, X, Minimize2, Maximize2, Settings, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Message = { role: 'user' | 'assistant'; text: string; ts: number };

type WidgetConfig = {
  enabled: boolean;
  personaName: string;
  accentColor: string;
  greeting: string;
};

const DEFAULT_CONFIG: WidgetConfig = {
  enabled: true,
  personaName: 'Αλέξης',
  accentColor: '#0066cc',
  greeting: 'Γεια σου! Είμαι ο βοηθός CRM της Hlektrismos.gr. Ρώτα με για leads, τιμολόγια, ή οτιδήποτε χρειάζεσαι.',
};

const QUICK_PROMPTS = [
  'Πόσα leads έχω σήμερα;',
  'Σύνοψη pipeline',
  'Τρέχοντα τιμολόγια',
  'Βρες lead: Αθήνα',
];

export default function CrmAiAssistantWidget({ leads = [], tariffs = [] }: { leads?: any[]; tariffs?: any[] }) {
  const storageKey = 'crm_ai_widget_config';
  const saved = (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } })();
  const config: WidgetConfig = { ...DEFAULT_CONFIG, ...saved };

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [cfg, setCfg] = useState<WidgetConfig>(config);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cfg));
  }, [cfg]);

  const greeting: Message = { role: 'assistant', text: cfg.greeting, ts: Date.now() };

  useEffect(() => {
    if (open && messages.length === 0) setMessages([greeting]);
  }, [open]);

  if (!cfg.enabled) return null;

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: 'user', text: msg, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const apiKey = localStorage.getItem('hlektrismos_gemini_api_key') || '';
      const model = localStorage.getItem('hlektrismos_gemini_model') || 'gemini-3.6-flash';
      const contextId = localStorage.getItem('crm_ai_widget_session') || crypto.randomUUID();
      localStorage.setItem('crm_ai_widget_session', contextId);

      const res = await fetch('https://bkzkefiqpoqbihdcxixj.supabase.co/functions/v1/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({
          message: msg,
          mode: 'chat',
          context_id: contextId,
          api_key: apiKey,
          model,
        }),
      });

      const data = await res.json();
      const reply = data.reply || data.error || 'Σφάλμα κλήσης AI.';
      setMessages(prev => [...prev, { role: 'assistant', text: reply, ts: Date.now() }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', text: `❌ Σφάλμα: ${err.message}`, ts: Date.now() }]);
    }
    setLoading(false);
  };

  const clearChat = () => {
    setMessages([{ ...greeting, ts: Date.now() }]);
    localStorage.removeItem('crm_ai_widget_session');
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });

  // Floating button
  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 60, height: 60, borderRadius: 30,
          background: `linear-gradient(135deg, ${cfg.accentColor}, ${cfg.accentColor}dd)`,
          boxShadow: `0 4px 20px ${cfg.accentColor}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'transform 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <Bot size={28} color="#fff" />
      </div>
    );
  }

  // Chat window
  return (
    <div
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        width: minimized ? 320 : 420,
        height: minimized ? 48 : 560,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 16,
        boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          background: `linear-gradient(135deg, ${cfg.accentColor}, ${cfg.accentColor}ee)`,
          color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Bot size={20} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{cfg.personaName}</div>
            <div style={{ fontSize: 10, opacity: 0.85 }}>AI CRM Assistant • Online</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setShowSettings(!showSettings)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: 4, cursor: 'pointer', color: '#fff' }}>
            <Settings size={14} />
          </button>
          <button onClick={() => setMinimized(!minimized)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: 4, cursor: 'pointer', color: '#fff' }}>
            {minimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button onClick={() => setOpen(false)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 6, padding: 4, cursor: 'pointer', color: '#fff' }}>
            <X size={14} />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          {/* Settings panel */}
          {showSettings && (
            <div style={{ padding: 12, borderBottom: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 12 }}>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Όνομα Persona</label>
                <input
                  value={cfg.personaName}
                  onChange={e => setCfg({ ...cfg, personaName: e.target.value })}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}
                />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Χρώμα Widget</label>
                <input
                  type="color"
                  value={cfg.accentColor}
                  onChange={e => setCfg({ ...cfg, accentColor: e.target.value })}
                  style={{ width: '100%', height: 32, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}
                />
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 4 }}>Χαιρετισμός</label>
                <textarea
                  value={cfg.greeting}
                  onChange={e => setCfg({ ...cfg, greeting: e.target.value })}
                  rows={2}
                  style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, resize: 'vertical' }}
                />
              </div>
              <button onClick={() => setShowSettings(false)} style={{ width: '100%', padding: '6px 0', background: cfg.accentColor, color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', fontSize: 12 }}>
                Αποθήκευση
              </button>
            </div>
          )}

          {/* Messages */}
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 14px',
                  borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  background: m.role === 'user' ? cfg.accentColor : '#f3f4f6',
                  color: m.role === 'user' ? '#fff' : '#1f2937',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.role === 'assistant' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, fontSize: 10, color: '#6b7280' }}>
                      <Sparkles size={10} /> {cfg.personaName}
                    </div>
                  )}
                  {m.text}
                  <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4, textAlign: 'right' }}>{formatTime(m.ts)}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#6b7280', fontSize: 12 }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                {cfg.personaName} σκέπτεται...
              </div>
            )}
          </div>

          {/* Quick prompts */}
          {messages.length <= 1 && (
            <div style={{ padding: '0 16px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {QUICK_PROMPTS.map((p, i) => (
                <button
                  key={i}
                  onClick={() => send(p)}
                  style={{
                    padding: '4px 10px', borderRadius: 12,
                    border: `1px solid ${cfg.accentColor}33`,
                    background: `${cfg.accentColor}08`,
                    color: cfg.accentColor,
                    fontSize: 11, cursor: 'pointer', fontWeight: 500,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '8px 12px', borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8, alignItems: 'center', background: '#fff', flexShrink: 0 }}>
            <button onClick={clearChat} title="Καθαρισμός" style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 4 }}>
              <Trash2 size={16} />
            </button>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
              placeholder="Ρώτα τον AI βοηθό..."
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 10, fontSize: 13, outline: 'none', background: '#f9fafb' }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              style={{
                width: 36, height: 36, borderRadius: 18,
                background: input.trim() ? cfg.accentColor : '#d1d5db',
                border: 'none', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: input.trim() ? 'pointer' : 'not-allowed',
              }}
            >
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
