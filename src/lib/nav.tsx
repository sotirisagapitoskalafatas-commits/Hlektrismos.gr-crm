import { createContext, useContext, useMemo, useSyncExternalStore, ReactNode } from 'react';
import type { PageKey } from './roles';
import { createNavStore, HOME, type AppView, type PageFilters } from './nav-url';

export type { AppView, PageFilters };

type NavCtx = {
  view: AppView;
  go: (p: PageKey, filters?: PageFilters) => void;
  openCase: (id: string) => void;
};

const Ctx = createContext<NavCtx | undefined>(undefined);

// The URL hash is the source of truth (see nav-url.ts): a refresh, a new tab and Back/Forward keep the section. The page-access guard in
// AppShell is unchanged and still decides what the signed-in role may open.
export function NavProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => createNavStore(window), []);
  const view = useSyncExternalStore(store.subscribe, store.get, () => HOME);
  const value = useMemo<NavCtx>(() => ({ view, go: store.go, openCase: store.openCase }), [view, store]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNav() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNav must be used within NavProvider');
  return ctx;
}
