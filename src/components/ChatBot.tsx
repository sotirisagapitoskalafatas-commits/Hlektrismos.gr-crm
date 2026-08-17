import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, Phone, Send, Sparkles, X, CheckCircle, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Message = {
  role: 'bot' | 'user';
  text: string;
};

type VisitorInfo = {
  name?: string;
  phone?: string;
  email?: string;
  billAmount?: string;
  currentProvider?: string;
  needs?: string;
};

const initialMessages: Message[] = [
  { role: 'bot', text: 'Γεια σου! Είμαι ο Αλέξης, σύμβουλος ενέργειας της Hlektrismos.gr. Πώς μπορώ να σε βοηθήσω σήμερα;' },
];

const quickStarters = [
  { label: 'Ρεύμα', icon: '⚡' },
  { label: 'Αέριο', icon: '🔥' },
  { label: 'Φωτοβολταϊκά', icon: '☀️' },
  { label: 'Ζητώ κλήση', icon: '📞' },
];

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [visitorInfo, setVisitorInfo] = useState<VisitorInfo>({});
  const [callbackMode, setCallbackMode] = useState(false);
  const [callbackStep, setCallbackStep] = useState<'idle' | 'name' | 'phone' | 'email' | 'confirm' | 'done'>('idle');
  const [callbackDraft, setCallbackDraft] = useState<VisitorInfo>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing, callbackMode, callbackStep]);

  const sendToAI = async (text: string) => {
    setTyping(true);
    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { 
          messages: [...messages, { role: 'user', text }].map(m => ({ 
            role: m.role === 'bot' ? 'assistant' : 'user', 
            content: m.text 
          })),
          visitorInfo,
        },
      });

      setTyping(false);
      if (error) throw error;
      setMessages((prev) => [...prev, { role: 'bot', text: data.reply || 'Δεν μπόρεσα να απαντήσω αυτή τη στιγμή.' }]);
    } catch {
      setTyping(false);
      setMessages((prev) => [...prev, { role: 'bot', text: 'Υπήρξε σφάλμα. Προσπάθησε ξανά ή κάλεσε στο +30 210 22 55 000.' }]);
    }
  };

  const handleCallbackFlow = async (text: string) => {
    switch (callbackStep) {
      case 'name':
        setCallbackDraft(prev => ({ ...prev, name: text }));
        setCallbackStep('phone');
        setMessages(prev => [...prev, 
          { role: 'user', text },
          { role: 'bot', text: `Ευχαριστώ, ${text}! Ποιος είναι ο αριθμός τηλεφώνου σου;` }
        ]);
        break;
      case 'phone':
        setCallbackDraft(prev => ({ ...prev, phone: text }));
        setCallbackStep('email');
        setMessages(prev => [...prev, 
          { role: 'user', text },
          { role: 'bot', text: 'Τέλεια. Ένα email για επικοινωνία;' }
        ]);
        break;
      case 'email':
        setCallbackDraft(prev => ({ ...prev, email: text }));
        setCallbackStep('confirm');
        setMessages(prev => [...prev, 
          { role: 'user', text },
          { role: 'bot', text: 'Έτσι θα σε καλέσουμε:\n📞 ' + callbackDraft.phone + '\n👤 ' + callbackDraft.name + '\n📧 ' + text + '\n\n Θέλεις να συνεχίσουμε;' }
        ]);
        break;
      case 'confirm':
        if (text.toLowerCase().includes('ναι') || text.toLowerCase().includes('ok') || text.toLowerCase().includes('συμφωνώ')) {
          setCallbackStep('done');
          try {
            const { data, error } = await supabase.functions.invoke('chat', {
              body: { 
                messages: [{ role: 'user', content: 'Ηλεκτρονικό μήνυμα' }],
                visitorInfo: callbackDraft,
                callbackRequest: callbackDraft,
              },
            });
            setTyping(false);
            const reply = data?.reply || 'Τέλεια! Θα σε καλέσουμε σύντομα.';
            setMessages(prev => [...prev, 
              { role: 'user', text: 'Ναι, συμφωνώ' },
              { role: 'bot', text: reply }
            ]);
          } catch {
            setMessages(prev => [...prev, 
              { role: 'user', text: 'Ναι, συμφωνώ' },
              { role: 'bot', text: 'Τέλεια! Ένας σύμβουλός μας θα σε καλέσει στο ' + callbackDraft.phone + ' το συντομότερο. Ευχαριστούμε!' }
            ]);
          }
          setCallbackMode(false);
          setVisitorInfo(prev => ({ ...prev, ...callbackDraft }));
        } else {
          setCallbackStep('idle');
          setCallbackMode(false);
          setMessages(prev => [...prev, 
            { role: 'user', text },
            { role: 'bot', text: 'Εντάξει, αν αλλάξεις γνώμη, απλά πες "Ζητώ κλήση" και θα σε βοηθήσω.' }
          ]);
        }
        break;
    }
  };

  const handleQuickReply = async (label: string) => {
    if (label === 'Ζητώ κλήση') {
      setCallbackMode(true);
      setCallbackStep('name');
      setMessages(prev => [...prev, 
        { role: 'user', text: 'Ζητώ κλήση' },
        { role: 'bot', text: 'Τέλεια! Ένας εξειδικευμένος σύμβουλος θα σε καλέσει. Πώς σε λένε;' }
      ]);
      return;
    }
    const fullText = `Ζητώ πληροφορίες για: ${label}`;
    setMessages(prev => [...prev, { role: 'user', text: fullText }]);
    await sendToAI(fullText);
  };

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    
    // Auto-detect visitor info from messages
    const phoneMatch = text.match(/(\d{10})/);
    const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
    if (phoneMatch) setVisitorInfo(prev => ({ ...prev, phone: phoneMatch[1] }));
    if (emailMatch) setVisitorInfo(prev => ({ ...prev, email: emailMatch[0] }));

    setMessages(prev => [...prev, { role: 'user', text }]);
    setInput('');

    if (callbackMode && callbackStep !== 'idle' && callbackStep !== 'done') {
      await handleCallbackFlow(text);
    } else {
      await sendToAI(text);
    }
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {!open && (
        <button className="chatbot-fab" onClick={() => setOpen(true)} aria-label="Άνοιγμα συνομιλίας">
          <Bot size={26} />
          <span className="chatbot-fab-pulse" />
        </button>
      )}

      {open && (
        <div className="chatbot-window">
          <div className="chatbot-header">
            <div className="chatbot-header-info">
              <div className="chatbot-avatar"><Sparkles size={18} /></div>
              <div>
                <strong>Αλέξης — Hlektrismos.gr</strong>
                <span className="chatbot-status"><span className="chatbot-status-dot" /> Online · Ζωντανός Υπάλληλος</span>
              </div>
            </div>
            <button className="chatbot-close" onClick={() => setOpen(false)} aria-label="Κλείσιμο"><X size={20} /></button>
          </div>

          <div className="chatbot-messages" ref={scrollRef}>
            {messages.map((msg, i) => (
              <div key={i} className={msg.role === 'bot' ? 'chatbot-msg bot' : 'chatbot-msg user'}>
                {msg.role === 'bot' && <div className="chatbot-msg-avatar"><Bot size={14} /></div>}
                <div className="chatbot-msg-bubble">{msg.text}</div>
              </div>
            ))}
            {typing && (
              <div className="chatbot-msg bot">
                <div className="chatbot-msg-avatar"><Bot size={14} /></div>
                <div className="chatbot-typing"><span /><span /><span /></div>
              </div>
            )}
          </div>

          {messages.length <= 2 && !callbackMode && (
            <div className="chatbot-quick-replies">
              {quickStarters.map((qr) => (
                <button key={qr.label} className="chatbot-quick-btn" onClick={() => handleQuickReply(qr.label)}>
                  <span>{qr.icon}</span> {qr.label}
                </button>
              ))}
            </div>
          )}

          {callbackMode && callbackStep === 'idle' && (
            <div className="chatbot-quick-replies">
              <button className="chatbot-quick-btn callback-btn" onClick={() => { setCallbackStep('name'); setMessages(prev => [...prev, { role: 'bot', text: 'Πώς σε λένε;' }]); }}>
                <Phone size={14} /> Ξεκινήστε
              </button>
            </div>
          )}

          {callbackStep === 'done' && (
            <div className="chatbot-callback-done">
              <CheckCircle size={24} />
              <span>Κλήση Ζητήθηκε!</span>
            </div>
          )}

          <form className="chatbot-input-bar" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                callbackMode 
                  ? callbackStep === 'name' ? 'Το όνομά σου...' 
                  : callbackStep === 'phone' ? 'Το τηλέφωνό σου...' 
                  : callbackStep === 'email' ? 'Το email σου...'
                  : 'Πληκτρολογήστε...'
                : 'Γράψε την ερώτησή σου...'
              }
              autoFocus
            />
            <button type="submit" className="chatbot-send" aria-label="Αποστολή"><Send size={18} /></button>
          </form>
        </div>
      )}
    </>
  );
}
