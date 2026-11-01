// Learning progress for the signed-in account, kept in THIS browser only (see guide/progress.ts for who it belongs to and why).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { emptyProgress, load, save, scopeKey } from '@/guide/progress';
import type { Progress } from '@/guide/progress';

const EVENT = 'atlas:guide-progress';
const store = () => { try { return window.localStorage; } catch { return null; } };

export function useGuideProgress() {
  const { profile, role, user } = useAuth();
  const realRole = profile?.role ?? role;
  // The shared Admin login is keyed to the workstation; a Sales Agent to the account. A role preview never changes whose progress this is.
  const scope = useMemo(() => scopeKey(realRole, user?.id), [realRole, user?.id]);
  const [progress, setProgress] = useState<Progress>(() => emptyProgress());

  useEffect(() => {
    setProgress(load(store(), scope));
    const h = () => setProgress(load(store(), scope));
    window.addEventListener(EVENT, h);
    window.addEventListener('storage', h);
    return () => { window.removeEventListener(EVENT, h); window.removeEventListener('storage', h); };
  }, [scope]);

  const update = useCallback((fn: (p: Progress) => Progress) => {
    const next = fn(load(store(), scope));
    save(store(), scope, next);
    setProgress(next);
    window.dispatchEvent(new Event(EVENT));
  }, [scope]);

  const reset = useCallback(() => { update(() => emptyProgress()); }, [update]);
  return { progress, update, reset, scope, shared: scope === 'workstation' };
}

export const TOUR_EVENT = 'atlas:tour';
export const startTour = (action: 'start' | 'resume' = 'start') => window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: { action } }));
