import { useEffect, useState } from 'react';

/* Opt-in consent store (GDPR Art. 7 / ePrivacy Art. 5(3), Greek law 3471/2006).
   Every optional category defaults to false until the visitor actively says
   yes. The choice is stored with a timestamp and policy version, and can be
   withdrawn at any time from the footer ("Ρυθμίσεις cookies") or #/cookies.

   Categories:
   - analytics: Vercel Speed Insights (page URL, Web Vitals timings, device
                and browser type, IP seen by Vercel). Loaded only when true.
   No session replay, heatmap, rage-click or keystroke recording SDK is
   installed. If one is ever added it MUST be off by default, only start when
   hasConsent('analytics') is true, mask every text input, and never record
   password, payment or email fields. */
export type ConsentCategory = 'analytics';
export type ConsentState = Record<ConsentCategory, boolean>;
type StoredConsent = { version: number; decidedAt: string; choices: ConsentState };

const KEY = 'atlas.consent';
export const CONSENT_VERSION = 1;
const DEFAULTS: ConsentState = { analytics: false };
const EVENT = 'atlas:consent-change';

export function readConsent(): StoredConsent | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    // A new policy version invalidates earlier choices: ask again.
    if (parsed.version !== CONSENT_VERSION) return null;
    return { ...parsed, choices: { ...DEFAULTS, ...parsed.choices } };
  } catch {
    return null;
  }
}

export function hasConsent(c: ConsentCategory): boolean {
  return readConsent()?.choices[c] === true;
}

export function saveConsent(choices: Partial<ConsentState>): void {
  const value: StoredConsent = {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    choices: { ...DEFAULTS, ...choices },
  };
  try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* storage blocked: nothing granted */ }
  window.dispatchEvent(new Event(EVENT));
}

export function resetConsent(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event(EVENT));
}

export function openConsentSettings(): void {
  window.dispatchEvent(new Event('atlas:consent-open'));
}

export function useConsent(): { decided: boolean; choices: ConsentState } {
  const [stored, setStored] = useState(readConsent);
  useEffect(() => {
    const update = () => setStored(readConsent());
    window.addEventListener(EVENT, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return { decided: stored !== null, choices: stored?.choices ?? DEFAULTS };
}
