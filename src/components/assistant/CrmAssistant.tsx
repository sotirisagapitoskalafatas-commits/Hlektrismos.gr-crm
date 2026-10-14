/* Atlas AI — the CRM's own staff assistant (separate from the public landing-page chatbot).
   Opened from the top bar. Answers come from lib/crm-assistant.ts using only data this employee has already loaded;
   no external AI call, no writes. The pre-existing field-sales tools (route, nearby, today, check-in, log note) are
   kept for staff because they already worked here; their writes happen only after an explicit confirmation step
   and through the same protected API as the rest of the CRM. */

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, SendHorizontal, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNav } from '@/lib/nav';
import { navForRole } from '@/lib/roles';
import type { PageKey } from '@/lib/roles';
import { fetchCustomers } from '@/lib/api';
import type { Customer } from '@/lib/api';
import { useWorkData } from '@/lib/useWorkData';
import { answer, suggestionsFor } from '@/lib/crm-assistant';
import type { AssistantAction, AssistantReply, AssistantRole } from '@/lib/crm-assistant';
import { detectFieldSalesIntent, resumeFieldSales, runFieldSalesIntent } from '@/lib/field-sales/jarvis-tools';
import type { FieldSalesFlow, FieldSalesResult } from '@/lib/field-sales/jarvis-tools';

type Msg = { id: number; from: 'user' | 'ai'; reply?: AssistantReply; text?: string };

export default function CrmAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role } = useAuth();
  const { go, openCase } = useNav();
  const work = useWorkData();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const flowRef = useRef<FieldSalesFlow | null>(null);
  const idRef = useRef(1);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allowedPages = useMemo(() => navForRole(role).flatMap(s => s.children.map(c => c.page as string)), [role]);

  useEffect(() => {
    if (!open) return;
    if (customers.length === 0) void fetchCustomers().then(setCustomers);
    if (msgs.length === 0) {
      setMsgs([{ id: idRef.current++, from: 'ai', reply: { text: 'Γεια σας! Είμαι ο βοηθός του CRM. Ρωτήστε με για την εργασία σας ή αναζητήστε πελάτη, lead ή case.', suggestions: suggestionsFor(role as AssistantRole) } }]);
    }
    window.setTimeout(() => inputRef.current?.focus(), 50);
  }, [open, customers.length, msgs.length, role]);

  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }); }, [msgs.length]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const push = (m: Omit<Msg, 'id'>) => setMsgs(list => [...list, { ...m, id: idRef.current++ }]);

  const act = (a: AssistantAction) => {
    if (a.type === 'case') openCase(a.id);
    else if (a.type === 'lead') go('leads', { lead: a.id });
    else if (a.type === 'customer') go('customers');
    else go(a.page as PageKey, a.filters);
    onClose();
  };

  const applyField = (res: FieldSalesResult) => {
    flowRef.current = res.type === 'flow' ? res.flow : null;
    if (res.nav) {
      if ((res.nav.page as string) === 'case' && res.nav.caseId) openCase(res.nav.caseId);
      else go(res.nav.page, res.nav.filters);
    }
    push({ from: 'ai', reply: { text: res.text } });
  };

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput('');
    push({ from: 'user', text });
    setBusy(true);
    try {
      if (flowRef.current) { applyField(await resumeFieldSales(text, flowRef.current, { role })); return; }
      const fi = detectFieldSalesIntent(text);
      // Field staff: their day is visits, so the field tools answer first. Everyone else: the work assistant answers
      // first and the field tools are only a fallback for requests it does not understand.
      if (fi && role === 'field_sales') { applyField(await runFieldSalesIntent(fi, { role })); return; }
      const reply = answer(text, {
        role: role as AssistantRole, uid: work.uid ?? '', now: work.now, allowedPages,
        items: work.items, summary: work.summary, cases: work.cases, leads: work.leads, customers,
      });
      if (reply.understood === false && fi) { applyField(await runFieldSalesIntent(fi, { role })); return; }
      push({ from: 'ai', reply });
    } catch {
      push({ from: 'ai', reply: { text: 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.' } });
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  const last = [...msgs].reverse().find(m => m.from === 'ai')?.reply?.suggestions ?? [];

  return createPortal(
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Atlas AI βοηθός CRM">
      <div className="absolute inset-0 bg-[#0b1f3a]/20" onClick={onClose} />
      <aside className="absolute right-0 top-0 bottom-0 w-full sm:w-[420px] bg-white shadow-2xl flex flex-col"
        style={{ fontFamily: "'Inter', 'IBM Plex Sans', system-ui, sans-serif", color: '#14233b' }}>
        <header className="flex items-center gap-3 px-5 h-[60px] border-b border-[rgba(20,35,59,0.09)] shrink-0">
          <span className="w-8 h-8 rounded-lg bg-[#1677ff] text-white grid place-items-center"><Sparkles size={16} aria-hidden="true" /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold">Atlas AI</div>
            <div className="text-[12px] text-[#64748b]">Βοηθός CRM · μόνο με τα δεδομένα που βλέπετε</div>
          </div>
          <button onClick={onClose} aria-label="Κλείσιμο" className="p-2 rounded-lg hover:bg-[rgba(20,35,59,0.06)]"><X size={18} /></button>
        </header>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3" aria-live="polite">
          {msgs.map(m => m.from === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-[#1677ff] text-white px-3.5 py-2 text-[14px]">{m.text}</div>
            </div>
          ) : (
            <div key={m.id} className="max-w-[92%]">
              <div className="rounded-2xl rounded-bl-md bg-[#f5f7fa] px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap">{m.reply?.text}</div>
              {m.reply?.results && m.reply.results.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {m.reply.results.map((r, i) => (
                    <li key={i}>
                      <button onClick={() => act(r.action)}
                        className="w-full text-left flex items-center gap-2 rounded-xl border border-[rgba(20,35,59,0.09)] px-3 py-2 hover:bg-[#f5f7fa]">
                        <span className="flex-1 min-w-0">
                          <span className="block text-[14px] font-medium truncate">{r.label}</span>
                          {r.sub && <span className="block text-[12px] text-[#64748b] truncate">{r.sub}</span>}
                        </span>
                        <ArrowUpRight size={15} className="text-[#1677ff] shrink-0" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {busy && <div className="text-[13px] text-[#64748b]">Σκέφτομαι…</div>}
        </div>

        {last.length > 0 && (
          <div className="px-5 pb-2 flex flex-wrap gap-1.5">
            {last.map(s => (
              <button key={s} onClick={() => s.endsWith('…') ? (setInput(s.replace('…', '')), inputRef.current?.focus()) : void send(s)}
                className="h-8 px-3 rounded-full border border-[rgba(20,35,59,0.12)] text-[13px] text-[#14233b] hover:bg-[#f5f7fa]">{s}</button>
            ))}
          </div>
        )}

        <form className="flex gap-2 px-5 py-3 border-t border-[rgba(20,35,59,0.09)]" onSubmit={e => { e.preventDefault(); void send(input); }}>
          <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder="Ρωτήστε ή αναζητήστε…"
            aria-label="Ερώτηση προς τον βοηθό" autoComplete="off"
            className="flex-1 h-10 px-3.5 rounded-xl border border-[rgba(20,35,59,0.14)] text-[14px] outline-none focus:border-[#1677ff] focus:ring-2 focus:ring-[rgba(22,119,255,0.18)]" />
          <button type="submit" disabled={!input.trim() || busy} aria-label="Αποστολή"
            className="w-10 h-10 rounded-xl bg-[#1677ff] text-white grid place-items-center disabled:opacity-40"><SendHorizontal size={17} /></button>
        </form>
        <p className="px-5 pb-3 text-[11.5px] text-[#64748b]">Δεν αλλάζει δεδομένα χωρίς δική σας επιβεβαίωση και δεν στέλνει στοιχεία πελατών σε εξωτερική υπηρεσία.</p>
      </aside>
    </div>,
    document.body,
  );
}
