import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastTone = 'ok' | 'warn' | 'bad' | 'info';

type ToastItem = { id: number; msg: string; tone: ToastTone };

type ToastCtx = { toast: (msg: string, tone?: ToastTone) => void };

const Ctx = createContext<ToastCtx | undefined>(undefined);

let nextId = 1;

const TONE_CLS: Record<ToastTone, string> = {
  ok: 'bg-ok-100 text-ok-600',
  warn: 'bg-warn-100 text-warn-600',
  bad: 'bg-bad-100 text-bad-600',
  info: 'bg-white border-line text-ink',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(t => window.clearTimeout(t)), []);

  const dismiss = useCallback((id: number) => {
    setItems(list => list.filter(x => x.id !== id));
  }, []);

  const toast = useCallback((msg: string, tone: ToastTone = 'info') => {
    const id = nextId++;
    setItems(list => [...list.slice(-2), { id, msg, tone }]);
    const t = window.setTimeout(() => dismiss(id), 3800);
    timers.current.push(t);
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed top-16 right-3 left-3 sm:left-auto sm:w-80 z-[70] flex flex-col gap-2 pointer-events-none">
        {items.map(item => (
          <button key={item.id} onClick={() => dismiss(item.id)}
            className={`pointer-events-auto w-full sm:w-auto text-left text-[13px] font-medium px-3.5 py-2.5 rounded-xl border shadow-cardlg backdrop-blur-sm animate-fadein ${TONE_CLS[item.tone]}`}>
            {item.msg}
          </button>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}