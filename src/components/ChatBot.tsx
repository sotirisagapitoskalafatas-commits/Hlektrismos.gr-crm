import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';

type Message = {
  role: 'bot' | 'user';
  text: string;
};

type QuickReply = {
  label: string;
  keywords: string[];
  response: string;
};

const quickReplies: QuickReply[] = [
  {
    label: 'Είναι δωρεάν;',
    keywords: ['δωρεάν', 'δωρεαν', 'χρεωση', 'χρεώσεις', 'κοστος', 'κόστος', 'πληρωνω', 'πληρώνω', 'free'],
    response: 'Ναι, η υπηρεσία μας είναι εντελώς δωρεάν, χωρίς κρυφές χρεώσεις. Αποζημιωνόμαστε από τους παρόχους, όχι από εσάς.',
  },
  {
    label: 'Πώς γίνεται η αλλαγή;',
    keywords: ['αλλαγη', 'αλλαγή', 'αλλάζω', 'αλλαζω', 'διαδικασια', 'διαδικασία', 'πώς', 'πως'],
    response: 'Η διαδικασία είναι απλή: υπογράφεις Σύμβαση Προμήθειας με τον νέο πάροχο και καταθέτεις τα απαραίτητα δικαιολογητικά. Αναλαμβάνουμε εμείς όλη τη γραφειοκρατία.',
  },
  {
    label: 'Πόσος χρόνος;',
    keywords: ['χρονος', 'χρόνος', 'μερες', 'μέρες', 'ημερες', 'ημέρες', 'ποτε', 'πότε', 'γρηγορα', 'γρήγορα'],
    response: 'Από την ημέρα που θα υπογράψεις τη σύμβαση απαιτούνται 7 εργάσιμες ημέρες για να ολοκληρωθεί η αλλαγή μέσω του ΔΕΔΔΗΕ.',
  },
  {
    label: 'Μπορεί να διακοπεί το ρεύμα;',
    keywords: ['διακοπη', 'διακοπή', 'διακοπεί', 'διακοπει', 'ρευμα', 'ρεύμα', 'απεργεια', 'απεργία'],
    response: 'Όχι. Η αλλαγή παρόχου είναι καθαρά εμπορική/λογιστική μεταβολή. Η παροχή ρεύματος είναι εγγυημένη από τον ΔΕΔΔΗΕ.',
  },
  {
    label: 'Ποιες υπηρεσίες;',
    keywords: ['υπηρεσιες', 'υπηρεσίες', 'υπηρεσια', 'υπηρεσία', 'ρευμα', 'ρεύμα', 'αεριο', 'αέριο', 'φωτοβολταικα', 'φωτοβολταϊκά', 'ηλεκτροκινηση', 'ηλεκτροκίνηση', 'τι', 'τις'],
    response: 'Προσφέρουμε: Ρεύμα, Φυσικό Αέριο, Φωτοβολταϊκά και Ηλεκτροκίνηση. Συγκρίνουμε πάροχους και βρίσκουμε την καλύτερη λύση για τις ανάγκες σου.',
  },
  {
    label: 'Που λειτουργείτε;',
    keywords: ['που', 'πού', 'περιοχη', 'περιοχή', 'ελλαδα', 'ελλάδα', 'αθηνα', 'αθήνα', 'θεσσαλονικη', 'θεσσαλονίκη', 'νησια', 'νησιά', 'κρητη', 'κρήτη'],
    response: 'Εξυπηρετούμε όλη την Ελλάδα — από την Αθήνα και τη Θεσσαλονίκη μέχρι τα νησιά και την Κρήτη. Έχουμε προσωπικό σύμβουλο για κάθε περιοχή.',
  },
  {
    label: 'Θέλω να με καλέσετε',
    keywords: ['καλεστε', 'καλέστε', 'καλει', 'καλεί', 'επικοινωνια', 'επικοινωνία', 'τηλεφωνο', 'τηλέφωνο', 'επικοινωνησετε', 'επικοινωνήσετε'],
    response: 'Τέλεια! Συμπληρώσε τη φόρμα επικοινωνίας στο τέλος της σελίδας και ένας εξειδικευμένος σύμβουλος θα επικοινωνήσει μαζί σου άμεσα. Μπορείς επίσης να καλέσεις στο +30 210 22 55 000.',
  },
];

const defaultResponse = 'Δεν είμαι σίγουρος για αυτό. Μπορείς να μου κάνεις μια πιο συγκεκριμένη ερώτηση, ή να συμπληρώσεις τη φόρμα επικοινωνίας στο τέλος της σελίδας και ένας σύμβουλος θα σε καλέσει άμεσα!';

function findResponse(input: string): string {
  const lower = input.toLowerCase();
  let bestMatch: QuickReply | null = null;
  let bestScore = 0;
  for (const qr of quickReplies) {
    let score = 0;
    for (const kw of qr.keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = qr;
    }
  }
  return bestMatch ? bestMatch.response : defaultResponse;
}

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'bot', text: 'Γεια σου! Είμαι ο PowerFor Assistant. Πώς μπορώ να σε βοηθήσω με τις ενεργειακές σου ανάγκες;' },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing]);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;
    const newMessages = [...messages, { role: 'user' as const, text }];
    setMessages(newMessages);
    setInput('');
    setTyping(true);

    try {
      const { data, error } = await supabase.functions.invoke('chat', {
        body: { messages: newMessages.map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text })) },
      });

      setTyping(false);
      if (error) throw error;
      setMessages((prev) => [...prev, { role: 'bot', text: data.reply || 'Δεν μπόρεσα να απαντήσω αυτή τη στιγμή.' }]);
    } catch (err) {
      setTyping(false);
      setMessages((prev) => [...prev, { role: 'bot', text: 'Υπήρξε ένα σφάλμα στο δίκτυο. Προσπαθήστε ξανά ή χρησιμοποιήστε τη φόρμα επικοινωνίας.' }]);
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
                <strong>PowerFor Assistant</strong>
                <span className="chatbot-status"><span className="chatbot-status-dot" /> Online</span>
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

          {messages.length <= 2 && (
            <div className="chatbot-quick-replies">
              {quickReplies.slice(0, 4).map((qr) => (
                <button key={qr.label} className="chatbot-quick-btn" onClick={() => sendMessage(qr.label)}>{qr.label}</button>
              ))}
            </div>
          )}

          <form className="chatbot-input-bar" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Γράψε την ερώτησή σου..."
              autoFocus
            />
            <button type="submit" className="chatbot-send" aria-label="Αποστολή"><Send size={18} /></button>
          </form>
        </div>
      )}
    </>
  );
}

