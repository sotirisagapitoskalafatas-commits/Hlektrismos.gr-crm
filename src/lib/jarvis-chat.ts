/* ------------------------------------------------------------------ */
/*  useJarvisChat — JARVIS Layer 2 (USEFUL): conversational memory,    */
/*  visitor-info extraction, callback lead flow, and live answers      */
/*  from the existing `chat` edge function (Gemini + tariff RAG).      */
/*  The widget keeps `onSend` as an override seam for tests/previews.  */
/* ------------------------------------------------------------------ */

import { useCallback, useRef, useState } from 'react';
import { supabase } from './supabase';

export type JarvisMessage = { id: number; from: 'jarvis' | 'user'; text: string };
export type JarvisVisitor = { name?: string; phone?: string; email?: string; needs?: string };

type CallbackStep = 'idle' | 'name' | 'phone' | 'email' | 'confirm' | 'done';

const GREETING = 'Γεια σας! Είμαι ο JARVIS. Πώς μπορώ να σας βοηθήσω σήμερα; ⚡';
const EMAIL_RE = /[\w.'+-]+@[\w-]+\.\w{2,}/;
const PHONE_RE = /(?:\+?30[ -]?)?(69\d[ -]?\d{3}[ -]?\d{4}|2\d{2}[ -]?\d{3}[ -]?\d{4}|[2-69]\d{3}[ -]?\d{4})/;
const CALLBACK_INTENT =
  /(ζητ[ώάω] κλ[ήη]ση|κλ[ήη]ση (?:από )?σ[ύυ]μβουλο|call(?:back)?|callback|τηλεφων[ήη]στε με|πάρτε με τηλέφωνο|να με καλ[έε]σετε|να με π[άα]ρετε)/i;

export function useJarvisChat() {
  const [messages, setMessages] = useState<JarvisMessage[]>([
    { id: 0, from: 'jarvis', text: GREETING },
  ]);
  const msgRef = useRef<JarvisMessage[]>(messages);
  const idRef = useRef(1);
  const visitorRef = useRef<JarvisVisitor>({});
  const cbMode = useRef(false);
  const cbStep = useRef<CallbackStep>('idle');
  const cbDraft = useRef<JarvisVisitor>({});

  const push = useCallback((from: JarvisMessage['from'], text: string) => {
    const next: JarvisMessage = { id: idRef.current++, from, text };
    msgRef.current = [...msgRef.current, next];
    setMessages(msgRef.current);
  }, []);

  const absorbVisitor = useCallback((text: string, step: CallbackStep) => {
    const v = visitorRef.current;
    const next: JarvisVisitor = {};
    const phone = text.match(PHONE_RE);
    if (phone) next.phone = phone[1];
    const email = text.match(EMAIL_RE);
    if (email) next.email = email[0];
    if (step === 'name' && text.trim().length > 1 && !next.phone && !next.email) {
      next.name = text.trim();
    }
    const need =
      /(φωτοβολταϊκ)/i.test(text) ? 'φωτοβολταϊκά'
      : /(αέριο|φυσικό αέριο)/i.test(text) ? 'αέριο'
      : /(ηλεκτροκίνηση|ηλεκτρικό αυτοκίνητο|φορτιστ)/i.test(text) ? 'ηλεκτροκίνηση'
      : /(ρεύμα|ρ[εέ]υμ(α|ατο)|πάροχος|τιμολόγιο|κ[ιί]λοβατό)/i.test(text) ? 'ρεύμα'
      : undefined;
    if (need) next.needs = need;
    if (Object.keys(next).length) visitorRef.current = { ...v, ...next };
  }, []);

  const runCallbackFlow = useCallback(async (text: string): Promise<string | null> => {
    if (!cbMode.current || cbStep.current === 'done') return null;

    const step = cbStep.current;
    absorbVisitor(text, step);

    if (step === 'name') {
      cbDraft.current = { ...cbDraft.current, name: text.trim() };
      cbStep.current = 'phone';
      return `Ευχαριστώ, ${text.trim()}! Ποιο είναι το τηλέφωνό σας;`;
    }

    if (step === 'phone') {
      const phone = text.match(PHONE_RE);
      if (!phone) return 'Μπορείτε να μου δώσετε έναν έγκυρο αριθμό τηλεφώνου;';
      cbDraft.current = { ...cbDraft.current, phone: phone[1] };
      cbStep.current = 'email';
      return 'Τέλεια! Και ένα email για επιβεβαίωση;';
    }

    if (step === 'email') {
      const email = text.match(EMAIL_RE);
      if (!email) return 'Μπορείτε να μου δώσετε ένα έγκυρο email (π.χ. name@email.com);';
      cbDraft.current = { ...cbDraft.current, email: email[0] };
      cbStep.current = 'confirm';
      return `Έτσι θα σας καλέσουμε:\n👤 ${cbDraft.current.name}\n📞 ${cbDraft.current.phone}\n📧 ${email[0]}\n\nΘέλετε να συνεχίσουμε;`;
    }

    if (step === 'confirm') {
      const ok = /(ναι|ok|ωραία|συμφωνώ|βεβα[ίι]α|yes)/i.test(text);
      if (!ok) {
        cbMode.current = false;
        cbStep.current = 'idle';
        return 'Εντάξει! Αν αλλάξετε γνώμη, πείτε απλώς «Ζητώ κλήση».';
      }
      cbStep.current = 'done';
      visitorRef.current = { ...visitorRef.current, ...cbDraft.current };
      const { name, phone, email } = cbDraft.current;
      try {
        const { data, error } = await supabase.functions.invoke('chat', {
          body: {
            messages: [{ role: 'user', content: 'Επιβεβαίωση κλήσης' }],
            visitorInfo: cbDraft.current,
            callbackRequest: cbDraft.current,
          },
        });
        if (error) throw error;
        return data?.reply || `Καταχωρήθηκε! Θα σας καλέσουμε στο ${phone} σύντομα. Ευχαριστούμε!`;
      } catch {
        return `Καταχωρήθηκε! Ένας σύμβουλος θα σας καλέσει στο ${phone} (${name || 'φίλε μου'}${email ? ` · ${email}` : ''}) το συντομότερο δυνατό. Ευχαριστούμε!`;
      }
    }

    return null;
  }, [absorbVisitor]);

  const send = useCallback(async (text: string): Promise<string> => {
    const trimmed = text.trim();
    if (!trimmed) return '';
    push('user', trimmed);

    if (!cbMode.current && CALLBACK_INTENT.test(trimmed)) {
      cbMode.current = true;
      cbStep.current = 'name';
      absorbVisitor(trimmed, 'name');
      return 'Τέλεια! Ένας εξειδικευμένος σύμβουλος θα σας καλέσει. Πώς σας λένε;';
    }

    const memoReply = await runCallbackFlow(trimmed);
    if (memoReply !== null) return memoReply;

    absorbVisitor(trimmed, 'idle');

    const conv = msgRef.current.map(m => ({
      role: m.from === 'jarvis' ? ('assistant' as const) : ('user' as const),
      content: m.text,
    }));

    const { data, error } = await supabase.functions.invoke('chat', {
      body: { messages: conv, visitorInfo: visitorRef.current },
    });
    if (error) throw error;
    const reply = typeof data?.reply === 'string' && data.reply.trim() ? data.reply : null;
    if (!reply) throw new Error('Empty reply from chat service');
    return reply;
  }, [absorbVisitor, push, runCallbackFlow]);

  const reset = useCallback(() => {
    msgRef.current = [];
    idRef.current = 1;
    cbMode.current = false;
    cbStep.current = 'idle';
    cbDraft.current = {};
    visitorRef.current = {};
    const next: JarvisMessage = { id: idRef.current++, from: 'jarvis', text: GREETING };
    msgRef.current = [next];
    setMessages(msgRef.current);
  }, []);

  return { messages, push, send, reset, visitor: visitorRef };
}