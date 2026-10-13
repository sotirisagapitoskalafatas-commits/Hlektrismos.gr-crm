/* ------------------------------------------------------------------ */
/*  JarvisWidget — "Hlektrismos AI" floating energy assistant.         */
/*  Visual layer: 3D mascot launcher + glass chat panel (jarvis.css).  */
/*  Logic is unchanged and still goes through the existing seams:      */
/*   • useJarvisChat → `chat` edge function (Gemini + tariff RAG),     */
/*     visitor memory, age/consent-gated callback leads               */
/*   • detectNavIntent / field-sales tools for signed-in CRM users     */
/*   • `onSend` stays as an override seam for tests/previews           */
/*  The mascot's expression is driven only by real events: see        */
/*  `mascot.signal(...)` calls below and ChatSignal in the chat hook.  */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, Flame, Minus, PhoneCall, PiggyBank, SendHorizontal, Sun, X, Zap } from 'lucide-react';
import { JarvisMascot } from './JarvisMascot';
import { mascot } from './mascotController';
import type { Expression } from './mascotController';
import { detectDifficulty, detectTopic } from './emotion';
import type { ChatSignal } from './types';
import { useJarvisChat } from '@/lib/jarvis-chat';
import { detectNavIntent } from '@/lib/jarvis-actions';
import { detectFieldSalesIntent, resumeFieldSales, runFieldSalesIntent } from '@/lib/field-sales/jarvis-tools';
import type { FieldSalesCtx, FieldSalesFlow, FieldSalesResult } from '@/lib/field-sales/jarvis-tools';
import { useNav } from '@/lib/nav';
import { useRoute } from '@/lib/router';
import { useAuth } from '@/lib/auth';
import './jarvis.css';

const QUICK_ACTIONS = [
  { text: 'Θέλω φθηνότερο πρόγραμμα ρεύματος', Icon: Zap },
  { text: 'Με ενδιαφέρουν τα φωτοβολταϊκά', Icon: Sun },
  { text: 'Θέλω πληροφορίες για φυσικό αέριο', Icon: Flame },
  { text: 'Πώς μπορώ να μειώσω τον λογαριασμό μου;', Icon: PiggyBank },
] as const;

/** Canonical phrase that the chat hook's callback intent recognises (keeps the age/consent gate). */
const CALLBACK_PHRASE = 'Ζητώ κλήση';

interface Outcome {
  requested?: 'chat' | 'callback';
  clarify?: boolean;
  callbackOk?: boolean;
  callbackFail?: boolean;
}

function statusText(expr: Expression): string {
  switch (expr) {
    case 'thinking': return 'Σκέφτεται…';
    case 'answering': return 'Απαντά';
    case 'error': return 'Πρόβλημα σύνδεσης';
    case 'inactive': return 'Σε αναμονή';
    default: return 'Online';
  }
}

export function JarvisWidget({ onSend }: { onSend?: (text: string) => Promise<string> }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const outcome = useRef<Outcome>({});
  const fieldFlowRef = useRef<FieldSalesFlow | null>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  const { go, openCase } = useNav();
  const [route, navigate] = useRoute();
  const { session, role } = useAuth();
  const expr = useSyncExternalStore(mascot.subscribe, mascot.getExpression, () => 'idle' as Expression);

  const onSignal = useCallback((s: ChatSignal) => {
    switch (s.type) {
      case 'request-start':
        outcome.current.requested = s.purpose;
        mascot.signal({ type: 'request-start' });
        break;
      case 'callback-open': mascot.signal({ type: 'callback', active: true }); break;
      case 'clarify': outcome.current.clarify = true; break;
      case 'callback-success':
        outcome.current.callbackOk = true;
        mascot.signal({ type: 'callback', active: false });
        break;
      case 'callback-unconfirmed':
        outcome.current.callbackFail = true;
        mascot.signal({ type: 'callback', active: false });
        break;
    }
  }, []);
  const chat = useJarvisChat(onSignal);

  /* ---------- open / minimize / close ---------- */

  const openPanel = () => {
    setMounted(true);
    setOpen(true);
    mascot.signal({ type: 'panel', open: true });
  };

  /** keepChat=true → minimize. false → end the chat (unless a callback is mid-way). */
  const closePanel = (keepChat: boolean) => {
    setOpen(false);
    mascot.signal({ type: 'panel', open: false });
    if (!keepChat && !chat.inCallback() && !busyRef.current) {
      chat.reset();
      fieldFlowRef.current = null;
      setInput('');
    }
    window.setTimeout(() => launcherRef.current?.focus({ preventScroll: true }), 0);
  };

  useEffect(() => {
    if (!open) return;
    // Don't pop the on-screen keyboard on touch devices; desktop gets the caret straight away.
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  /* Keep the sheet above the on-screen keyboard (visualViewport shrinks when it opens). */
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const el = panelRef.current;
    if (!vv || !el) return;
    const update = () => {
      el.style.setProperty('--jv-vh', `${Math.round(vv.height)}px`);
      el.style.setProperty('--jv-kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      el.style.removeProperty('--jv-vh');
      el.style.removeProperty('--jv-kb');
    };
  }, [open]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    body.scrollTo({ top: body.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
  }, [chat.messages.length, busy, open]);

  /* ---------- sending ---------- */

  const applyFieldResult = (res: FieldSalesResult) => {
    fieldFlowRef.current = res.type === 'flow' ? res.flow : null;
    if (res.nav) {
      if ((res.nav.page as string) === 'case' && res.nav.caseId) openCase(res.nav.caseId);
      else go(res.nav.page, res.nav.filters);
    }
    chat.push('jarvis', res.text);
    // 'done' = the tool really ran; 'flow' = it is waiting for more details from the visitor.
    if (res.type === 'done') mascot.signal({ type: 'action-success' });
    else mascot.signal({ type: 'reply', clarify: true });
  };

  const run = async (trimmed: string) => {
    if (!onSend && (session || route === 'app')) {
      const ctx: FieldSalesCtx = { role: role ?? null };
      if (fieldFlowRef.current) {
        chat.push('user', trimmed);
        mascot.signal({ type: 'request-start' });
        applyFieldResult(await resumeFieldSales(trimmed, fieldFlowRef.current, ctx));
        return;
      }
    }

    if (!onSend) {
      const nav = detectNavIntent(trimmed);
      if (nav) {
        chat.push('user', trimmed);
        if (route === 'app' || session) {
          if (route !== 'app') navigate('app');
          go(nav.page);
          chat.push('jarvis', nav.reply);
          mascot.signal({ type: 'action-success' }); // navigation really happened
        } else {
          navigate('login');
          chat.push('jarvis', nav.noAuthReply);
          mascot.signal({ type: 'reply' });
        }
        return;
      }
    }

    if (!onSend && session) {
      const ctx: FieldSalesCtx = { role: role ?? null };
      const fi = detectFieldSalesIntent(trimmed);
      if (fi) {
        chat.push('user', trimmed);
        mascot.signal({ type: 'request-start' });
        applyFieldResult(await runFieldSalesIntent(fi, ctx));
        return;
      }
    }

    try {
      let reply: string;
      if (onSend) {
        chat.push('user', trimmed);
        mascot.signal({ type: 'request-start' });
        outcome.current.requested = 'chat';
        reply = await onSend(trimmed);
      } else {
        reply = await chat.send(trimmed);
      }
      const o = outcome.current;
      chat.push('jarvis', reply, o.requested === 'chat' && !o.clarify ? 'answer' : undefined);
      if (o.callbackOk) mascot.signal({ type: 'action-success' });
      else if (o.callbackFail) mascot.signal({ type: 'failure' });
      else mascot.signal({ type: 'reply', clarify: o.clarify });
    } catch {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        chat.push('jarvis', 'Φαίνεται πως είστε εκτός σύνδεσης. Θα απαντήσω μόλις επανέλθει το δίκτυο. 📡');
      } else {
        chat.push('jarvis', 'Συγγνώμη, παρουσιάστηκε μια διακοπή. Δοκιμάστε ξανά σε λίγο. 🔄');
      }
      mascot.signal({ type: 'failure' });
    }
  };

  const submit = async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setInput('');
    outcome.current = {};
    mascot.signal({ type: 'submit', difficulty: detectDifficulty(trimmed), topic: detectTopic(trimmed) });
    try {
      await run(trimmed);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const showSolutions = () => {
    navigate('services');
    closePanel(true);
  };

  /* ---------- render ---------- */

  const msgs = chat.messages;
  const lastIdx = msgs.length - 1;
  const showQuick = msgs.length <= 1 && !busy;
  const fmt = (t: number) => new Date(t).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="jv-root" data-route={route} data-expr={expr}>
      <button
        ref={launcherRef}
        type="button"
        className="jv-launcher"
        aria-label="Άνοιγμα AI ενεργειακού συμβούλου"
        aria-expanded={open}
        aria-controls={mounted ? panelId : undefined}
        data-open={open}
        tabIndex={open ? -1 : 0}
        onClick={openPanel}
        onPointerDown={() => mascot.signal({ type: 'press' })}
        onPointerEnter={e => { if (e.pointerType !== 'touch') mascot.signal({ type: 'hover', on: true }); }}
        onPointerLeave={() => mascot.signal({ type: 'hover', on: false })}
        onFocus={e => { if (e.currentTarget.matches(':focus-visible')) mascot.signal({ type: 'hover', on: true }); }}
        onBlur={() => mascot.signal({ type: 'hover', on: false })}
      >
        <JarvisMascot role="launcher" />
        <span className="jv-tip" aria-hidden="true">Ρώτησε τον AI Σύμβουλο</span>
      </button>

      {mounted && (
        <div
          ref={panelRef}
          id={panelId}
          className="jv-panel"
          role="dialog"
          aria-label="Hlektrismos AI — ενεργειακός σύμβουλος"
          aria-hidden={!open}
          data-open={open}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(true); } }}
        >
          <header className="jv-head">
            <div className="jv-avatar"><JarvisMascot role="avatar" /></div>
            <div className="jv-title">
              <div className="jv-brand">
                Hlektrismos AI
                <span className="jv-status" data-expr={expr} title={statusText(expr)} />
                <span className="jv-sr" role="status">{statusText(expr)}</span>
              </div>
              <div className="jv-sub">Ο ενεργειακός σου σύμβουλος</div>
            </div>
            <button type="button" className="jv-hbtn" onClick={() => closePanel(true)} aria-label="Ελαχιστοποίηση" title="Ελαχιστοποίηση">
              <Minus size={16} aria-hidden="true" />
            </button>
            <button type="button" className="jv-hbtn" onClick={() => closePanel(false)} aria-label="Κλείσιμο συνομιλίας" title="Κλείσιμο και νέα συνομιλία">
              <X size={16} aria-hidden="true" />
            </button>
          </header>

          <div className="jv-scroll" ref={bodyRef} role="log" aria-live="polite" aria-relevant="additions" data-lenis-prevent>
            {msgs.map((m, i) => (
              <div key={m.id} className={`jv-row jv-row-${m.from === 'user' ? 'user' : 'bot'}`}>
                <div className={`jv-msg ${m.from === 'user' ? 'jv-msg-user' : 'jv-msg-bot'}`}>{m.text}</div>
                <time className="jv-time" dateTime={new Date(m.at).toISOString()}>{fmt(m.at)}</time>
                {m.kind === 'answer' && i === lastIdx && !busy && !chat.inCallback() && (
                  <div className="jv-next">
                    <button type="button" className="jv-next-btn" onClick={() => submit(CALLBACK_PHRASE)}>
                      <PhoneCall size={14} aria-hidden="true" /> Ζήτησε να σε καλέσουμε
                    </button>
                    <button type="button" className="jv-next-btn" onClick={showSolutions}>
                      Δες τις λύσεις μας <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="jv-row jv-row-bot" aria-label="Ο σύμβουλος γράφει">
                <div className="jv-msg jv-msg-bot jv-typing" aria-hidden="true"><i /><i /><i /></div>
              </div>
            )}
            {showQuick && (
              <div className="jv-quick">
                {QUICK_ACTIONS.map(({ text, Icon }) => (
                  <button key={text} type="button" className="jv-quick-btn" onClick={() => submit(text)}>
                    <span className="jv-quick-ico"><Icon size={16} aria-hidden="true" /></span>
                    <span>{text}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="jv-form" onSubmit={e => { e.preventDefault(); submit(input); }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => { setInput(e.target.value); mascot.signal({ type: 'typing' }); }}
              onFocus={() => mascot.signal({ type: 'input-focus', on: true })}
              onBlur={() => mascot.signal({ type: 'input-focus', on: false })}
              placeholder="Γράψε την ερώτησή σου…"
              aria-label="Μήνυμα προς τον AI σύμβουλο"
              autoComplete="off"
              enterKeyHint="send"
            />
            <button type="submit" className="jv-send" aria-label="Αποστολή" disabled={!input.trim() || busy}>
              <SendHorizontal size={18} aria-hidden="true" />
            </button>
          </form>
          <p className="jv-note">Ενδεικτικές πληροφορίες· τιμές και εξοικονόμηση επιβεβαιώνονται από σύμβουλο.</p>
        </div>
      )}
    </div>
  );
}
