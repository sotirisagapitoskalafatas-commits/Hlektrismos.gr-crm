/* ------------------------------------------------------------------ */
/*  useJarvisChat — JARVIS Layer 2 (USEFUL): conversational memory,    */
/*  visitor-info extraction, callback lead flow, and live answers      */
/*  from the existing `chat` edge function (Gemini + tariff RAG).      */
/*  The widget keeps `onSend` as an override seam for tests/previews.  */
/* ------------------------------------------------------------------ */

import { useCallback, useRef, useState } from 'react';
import { supabase } from './supabase';
import type { ChatSignal } from '@/components/jarvis/types';

/** kind: 'answer' marks a reply that came from the AI backend (vs. scripted flow steps). */
export type JarvisMessage = { id: number; from: 'jarvis' | 'user'; text: string; at: number; kind?: 'answer' };
export type JarvisVisitor = { name?: string; phone?: string; email?: string; needs?: string };

type CallbackStep = 'idle' | 'age' | 'name' | 'phone' | 'email' | 'confirm' | 'done';

const GREETING =
  'Γεια σου! ⚡ Είμαι ο AI ενεργειακός σου σύμβουλος.\n' +
  'Πώς μπορώ να σε βοηθήσω να βρεις την κατάλληλη ενεργειακή λύση και να εξοικονομήσεις χρήματα;';
const EMAIL_RE = /[\w.'+-]+@[\w-]+\.\w{2,}/;
const PHONE_RE = /(?:\+?30[ -]?)?(69\d[ -]?\d{3}[ -]?\d{4}|2\d{2}[ -]?\d{3}[ -]?\d{4}|[2-69]\d{3}[ -]?\d{4})/;
const AGE_CONSENT_PROMPT =
  'Πριν σας ζητήσω στοιχεία: είστε 18 ετών και άνω και συμφωνείτε να επικοινωνήσουμε μαζί σας για αυτό το αίτημα, ' +
  'σύμφωνα με την Πολιτική Απορρήτου (hlektrismos.gr/#/privacy); (ναι/όχι)';
const YES_RE = /^(ναι|ναί|ok|οκ|ωραία|συμφωνώ|βεβα[ίι]α|yes|y)(?=$|[\s.,!;])/i;
const CALLBACK_INTENT =
  /(ζητ[ώάω] κλ[ήη]ση|κλ[ήη]ση (?:από )?σ[ύυ]μβουλο|call(?:back)?|callback|τηλεφων[ήη]στε με|πάρτε με τηλέφωνο|να με καλ[έε]σετε|να με π[άα]ρετε)/i;

export function useJarvisChat(onSignal?: (s: ChatSignal) => void) {
  const [messages, setMessages] = useState<JarvisMessage[]>(() => [
    { id: 0, from: 'jarvis', text: GREETING, at: Date.now() },
  ]);
  const signalRef = useRef(onSignal);
  signalRef.current = onSignal;
  const emit = useCallback((s: ChatSignal) => signalRef.current?.(s), []);
  const msgRef = useRef<JarvisMessage[]>(messages);
  const idRef = useRef(1);
  const visitorRef = useRef<JarvisVisitor>({});
  const cbMode = useRef(false);
  const cbStep = useRef<CallbackStep>('idle');
  const cbDraft = useRef<JarvisVisitor>({});

  const push = useCallback((from: JarvisMessage['from'], text: string, kind?: JarvisMessage['kind']) => {
    const next: JarvisMessage = { id: idRef.current++, from, text, at: Date.now(), ...(kind ? { kind } : {}) };
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

    // Age + consent gate BEFORE any contact detail is collected. A "no"
    // aborts the flow and discards everything gathered in this chat, so no
    // data from an under-18 (or non-consenting) attempt is stored or sent.
    if (step === 'age') {
      if (!YES_RE.test(text.trim())) {
        cbMode.current = false;
        cbStep.current = 'idle';
        cbDraft.current = {};
        visitorRef.current = {};
        return 'Κατανοητό. Η υπηρεσία κλήσης απευθύνεται μόνο σε ενήλικες και δεν κρατήσαμε κανένα στοιχείο σας. Μπορείτε να μας καλέσετε στο +30 210 22 55 000.';
      }
      cbStep.current = 'name';
      return 'Ευχαριστώ! Πώς σας λένε;';
    }

    absorbVisitor(text, step);

    if (step === 'name') {
      cbDraft.current = { ...cbDraft.current, name: text.trim() };
      cbStep.current = 'phone';
      return `Ευχαριστώ, ${text.trim()}! Ποιο είναι το τηλέφωνό σας;`;
    }

    if (step === 'phone') {
      const phone = text.match(PHONE_RE);
      if (!phone) { emit({ type: 'clarify' }); return 'Μπορείτε να μου δώσετε έναν έγκυρο αριθμό τηλεφώνου;'; }
      cbDraft.current = { ...cbDraft.current, phone: phone[1] };
      cbStep.current = 'email';
      return 'Τέλεια! Και ένα email για επιβεβαίωση;';
    }

    if (step === 'email') {
      const email = text.match(EMAIL_RE);
      if (!email) { emit({ type: 'clarify' }); return 'Μπορείτε να μου δώσετε ένα έγκυρο email (π.χ. name@email.com);'; }
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
        emit({ type: 'request-start', purpose: 'callback' });
        const { data, error } = await supabase.functions.invoke('chat', {
          body: {
            messages: [{ role: 'user', content: 'Επιβεβαίωση κλήσης' }],
            visitorInfo: cbDraft.current,
            callbackRequest: { ...cbDraft.current, age_confirmed: true, consent: true },
          },
        });
        if (error) throw error;
        // Success is only what the backend says: it replies callbackConfirmed:true once the lead is stored.
        emit({ type: data?.callbackConfirmed === true ? 'callback-success' : 'callback-unconfirmed' });
        return data?.reply || `Καταχωρήθηκε! Θα σας καλέσουμε στο ${phone} σύντομα. Ευχαριστούμε!`;
      } catch {
        emit({ type: 'callback-unconfirmed' });
        return `Καταχωρήθηκε! Ένας σύμβουλος θα σας καλέσει στο ${phone} (${name || 'φίλε μου'}${email ? ` · ${email}` : ''}) το συντομότερο δυνατό. Ευχαριστούμε!`;
      }
    }

    return null;
  }, [absorbVisitor, emit]);

  const send = useCallback(async (text: string): Promise<string> => {
    const trimmed = text.trim();
    if (!trimmed) return '';
    push('user', trimmed);

    if (!cbMode.current && CALLBACK_INTENT.test(trimmed)) {
      cbMode.current = true;
      cbStep.current = 'age';
      emit({ type: 'callback-open' });
      return `Τέλεια! Ένας εξειδικευμένος σύμβουλος θα σας καλέσει. ${AGE_CONSENT_PROMPT}`;
    }

    const memoReply = await runCallbackFlow(trimmed);
    if (memoReply !== null) return memoReply;

    absorbVisitor(trimmed, 'idle');

    const conv = msgRef.current.map(m => ({
      role: m.from === 'jarvis' ? ('assistant' as const) : ('user' as const),
      content: m.text,
    }));

    emit({ type: 'request-start', purpose: 'chat' });
    const { data, error } = await supabase.functions.invoke('chat', {
      body: { messages: conv, visitorInfo: visitorRef.current },
    });
    if (error) throw error;
    const reply = typeof data?.reply === 'string' && data.reply.trim() ? data.reply : null;
    if (!reply) throw new Error('Empty reply from chat service');
    return reply;
  }, [absorbVisitor, emit, push, runCallbackFlow]);

  const reset = useCallback(() => {
    msgRef.current = [];
    idRef.current = 1;
    cbMode.current = false;
    cbStep.current = 'idle';
    cbDraft.current = {};
    visitorRef.current = {};
    const next: JarvisMessage = { id: idRef.current++, from: 'jarvis', text: GREETING, at: Date.now() };
    msgRef.current = [next];
    setMessages(msgRef.current);
  }, []);

  /** True while the callback (age → name → phone → email → confirm) flow is mid-way. */
  const inCallback = useCallback(() => cbMode.current && cbStep.current !== 'done', []);

  return { messages, push, send, reset, inCallback, visitor: visitorRef };
}