import { createContext, useContext, useState, ReactNode } from 'react';
import type { PageKey } from './roles';

export type PageFilters = Record<string, string>;

export type AppView = { page: PageKey | 'case'; caseId: string | null; filters?: PageFilters | null };

type NavCtx = {
  view: AppView;
  go: (p: PageKey, filters?: PageFilters) => void;
  openCase: (id: string) => void;
};

const Ctx = createContext<NavCtx | undefined>(undefined);

export function NavProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<AppView>({ page: 'home', caseId: null });

  const go = (p: PageKey, filters?: PageFilters) => setView({ page: p, caseId: null, filters: filters ?? null });
  const openCase = (id: string) => setView({ page: 'case', caseId: id });

  return <Ctx.Provider value={{ view, go, openCase }}>{children}</Ctx.Provider>;
}

export function useNav() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}