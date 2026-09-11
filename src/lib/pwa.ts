/* ------------------------------------------------------------------ */
/*  PWA install-prompt support.                                        */
/*  Exposes a hook that captures the beforeinstallprompt event so the  */
/*  UI can show an "Εγκατάσταση" button when the browser supports it. */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setCanInstall(true);
    };
    // Re-check on app-installed so the button disappears.
    const onInstalled = () => { setCanInstall(false); setDeferred(null); };
    // Late arrival: already installed / unsupported → no op.
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async (): Promise<boolean> => {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    const accepted = choice.outcome === 'accepted';
    if (accepted) setCanInstall(false);
    setDeferred(null);
    return accepted;
  }, [deferred]);

  return { canInstall, install };
}

/** True when running as a standalone PWA / native app. */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** Broadcast a "save offline" intent (SW handles app-shell caching). */
export async function cacheAppShell(): Promise<boolean> {
  if (!('caches' in window)) return false;
  try {
    const cache = await caches.open('atlas-crm-shell-v1');
    await cache.addAll(['/', '/manifest.webmanifest', '/app-icon.svg']);
    return true;
  } catch {
    return false;
  }
}