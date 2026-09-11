import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/* ------------------------------------------------------------------ */
/*  Device / experience classification — one shared context for the    */
/*  entire CRM OS.  Drives which shell renders, which behaviours are  */
/*  enabled, and which CSS safe-area vars are applied.                 */
/* ------------------------------------------------------------------ */

export type DeviceClass = 'PHONE' | 'TABLET' | 'DESKTOP';
export type AppContext  = 'BROWSER' | 'PWA' | 'CAPACITOR';
export type Orientation = 'PORTRAIT' | 'LANDSCAPE';

interface DeviceContextValue {
  /** Screen-class: PHONE < 768, TABLET 768–1023, DESKTOP ≥ 1024 */
  device: DeviceClass;
  /** Runtime context: browser tab / installed PWA / native Capacitor */
  appContext: AppContext;
  /** Current orientation (drives split-view vs stacked on tablet) */
  orientation: Orientation;
  /** Touch device (true when ontouchstart or maxTouchPoints > 0) */
  isTouch: boolean;
  /** Hover-capable (false on most phones, true on desktop + some tablets) */
  hasHover: boolean;
  /** Parsed safe-area-inset CSS env values (px) */
  safeAreaInsets: { top: number; bottom: number; left: number; right: number };
  /** Reduced-motion preference (respects OS setting) */
  prefersReducedMotion: boolean;
  /** Shortcut: appContext !== 'BROWSER' */
  isStandalone: boolean;
}

const Ctx = createContext<DeviceContextValue | undefined>(undefined);

/* ---------- helpers ---------- */

function getDeviceClass(w: number): DeviceClass {
  if (w < 768)  return 'PHONE';
  if (w < 1024) return 'TABLET';
  return 'DESKTOP';
}

function getAppContext(): AppContext {
  if (typeof window === 'undefined') return 'BROWSER';
  // Capacitor native
  interface CapacitorLike { isNativePlatform?: () => boolean }
  try {
    const cap = (window as unknown as { Capacitor?: CapacitorLike }).Capacitor;
    if (cap?.isNativePlatform?.()) return 'CAPACITOR';
  } catch { /* ignore */ }
  // PWA standalone
  if (window.matchMedia('(display-mode: standalone)').matches) return 'PWA';
  const nav = navigator as unknown as { standalone?: boolean };
  if (nav.standalone === true) return 'PWA';
  return 'BROWSER';
}

function readSafeAreaInsets() {
  if (typeof document === 'undefined') return { top: 0, bottom: 0, left: 0, right: 0 };
  const cs = getComputedStyle(document.documentElement);
  const p = (v: string) => parseInt(v, 10) || 0;
  return {
    top:    p(cs.getPropertyValue('--sat')),
    bottom: p(cs.getPropertyValue('--sab')),
    left:   p(cs.getPropertyValue('--sal')),
    right:  p(cs.getPropertyValue('--sar')),
  };
}

/* ---------- provider ---------- */

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [device, setDevice] = useState<DeviceClass>(() => getDeviceClass(window.innerWidth));
  const [orientation, setOrientation] = useState<Orientation>(
    () => (window.innerHeight > window.innerWidth ? 'PORTRAIT' : 'LANDSCAPE'),
  );
  const [appContext] = useState<AppContext>(getAppContext);
  const [safeAreaInsets, setSafeAreaInsets] = useState(readSafeAreaInsets);

  useEffect(() => {
    const onResize = () => {
      setDevice(getDeviceClass(window.innerWidth));
      setOrientation(window.innerHeight > window.innerWidth ? 'PORTRAIT' : 'LANDSCAPE');
      setSafeAreaInsets(readSafeAreaInsets());
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const isTouch = typeof window !== 'undefined'
    && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  const hasHover = typeof window !== 'undefined'
    && window.matchMedia('(hover: hover)').matches;

  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const isStandalone = appContext !== 'BROWSER';

  return (
    <Ctx.Provider value={{
      device, appContext, orientation,
      isTouch, hasHover, safeAreaInsets,
      prefersReducedMotion, isStandalone,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useDeviceContext(): DeviceContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDeviceContext must be used within DeviceProvider');
  return ctx;
}
