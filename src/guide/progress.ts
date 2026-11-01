/* Learning progress: where it lives and who it belongs to. PURE (the storage is injected), tested without a browser.
   • Everything stays in THIS browser (localStorage). No table, no server, no analytics: nothing about learning is ever sent anywhere.
   • The Admin / Back Office login is ONE account used by the whole office, so its progress is keyed to the WORKSTATION (scope "workstation"), never to a person:
     the CRM can not know which employee sat at the keyboard, and this module never pretends to.
   • A Sales Agent account is individual, so its progress is keyed to that account (scope "user:<id>") on this browser.
   • Training progress is not a permission and not a performance score: nothing in the CRM reads it to allow or refuse anything. */
import type { GuideRole } from './markdown';

export const TOUR_VERSION = 1; // raise it when the interface changes enough to need a new tour: the offer then appears once more

export type TourStatus = 'idle' | 'offered' | 'in_progress' | 'paused' | 'completed' | 'skipped';
export interface Progress {
  v: 1;
  tour: { version: number; status: TourStatus; step: number; at: string | null };
  viewed: Record<string, string>;
  recent: string[];
  topics: Record<string, string>;
  introSeen: Record<string, string>;
  dismissedNews: string[];
  ratings: Record<string, 'up' | 'down'>;
}
export interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }

export const emptyProgress = (): Progress => ({ v: 1, tour: { version: TOUR_VERSION, status: 'idle', step: 0, at: null }, viewed: {}, recent: [], topics: {}, introSeen: {}, dismissedNews: [], ratings: {} });

/** `workstation` for the shared Admin login, `user:<id>` for an individual Sales Agent. */
export function scopeKey(role: GuideRole | null | undefined, userId: string | null | undefined): string {
  if (role === 'sales_agent' && userId) return `user:${userId}`;
  return 'workstation';
}
export const storageKey = (scope: string) => `atlas.guide.v1.${scope}`;
export const SCOPE_NOTE: Record<'workstation' | 'user', string> = {
  workstation: 'Ο λογαριασμός Admin / Back Office είναι κοινός για το γραφείο. Η πρόοδος αποθηκεύεται σε αυτόν τον υπολογιστή και δεν δείχνει ποιος υπάλληλος τη συμπλήρωσε.',
  user: 'Η πρόοδος αφορά τον δικό σας λογαριασμό σε αυτόν τον browser. Δεν στέλνεται πουθενά και δεν επηρεάζει τα δικαιώματά σας.',
};

const str = (x: unknown): x is string => typeof x === 'string';
const rec = (x: unknown): Record<string, string> => (x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as object).filter(([k, v]) => str(v) && k.length < 80)) : {});

/** Whatever is stored is validated field by field: a damaged or hand-edited value can only lose progress, never break the page. */
export function load(store: KV | null, scope: string): Progress {
  try {
    const raw = store?.getItem(storageKey(scope)); if (!raw) return emptyProgress();
    const j = JSON.parse(raw) as Partial<Progress>; const base = emptyProgress();
    const t = j.tour as Partial<Progress['tour']> | undefined;
    const status = (['idle', 'offered', 'in_progress', 'paused', 'completed', 'skipped'] as const).find((s) => s === t?.status) ?? 'idle';
    return {
      v: 1,
      tour: { version: typeof t?.version === 'number' ? t.version : 0, status, step: Number.isInteger(t?.step) && (t!.step as number) >= 0 && (t!.step as number) < 200 ? (t!.step as number) : 0, at: str(t?.at) ? t!.at as string : null },
      viewed: rec(j.viewed), recent: Array.isArray(j.recent) ? j.recent.filter(str).slice(0, 8) : base.recent, topics: rec(j.topics), introSeen: rec(j.introSeen),
      dismissedNews: Array.isArray(j.dismissedNews) ? j.dismissedNews.filter(str).slice(0, 50) : [],
      ratings: Object.fromEntries(Object.entries(rec(j.ratings)).filter(([, v]) => v === 'up' || v === 'down')) as Progress['ratings'],
    };
  } catch { return emptyProgress(); }
}
export function save(store: KV | null, scope: string, p: Progress): void {
  try { store?.setItem(storageKey(scope), JSON.stringify(p)); } catch { /* storage blocked: the page still works for this visit */ }
}

/* Pure transitions: each returns a NEW Progress. */
const now = (d?: Date) => (d ?? new Date()).toISOString();
export const markViewed = (p: Progress, id: string, d?: Date): Progress => ({ ...p, viewed: { ...p.viewed, [id]: now(d) }, recent: [id, ...p.recent.filter((x) => x !== id)].slice(0, 8) });
export const markTopic = (p: Progress, topic: string, d?: Date): Progress => (p.topics[topic] ? p : { ...p, topics: { ...p.topics, [topic]: now(d) } });
export const unmarkTopic = (p: Progress, topic: string): Progress => ({ ...p, topics: Object.fromEntries(Object.entries(p.topics).filter(([k]) => k !== topic)) });
export const markIntro = (p: Progress, page: string, d?: Date): Progress => ({ ...p, introSeen: { ...p.introSeen, [page]: now(d) } });
export const dismissNews = (p: Progress, id: string): Progress => (p.dismissedNews.includes(id) ? p : { ...p, dismissedNews: [...p.dismissedNews, id] });
export const rate = (p: Progress, id: string, v: 'up' | 'down' | null): Progress => { const r = { ...p.ratings }; if (v) r[id] = v; else delete r[id]; return { ...p, ratings: r }; };

export const tourOffered = (p: Progress, d?: Date): Progress => ({ ...p, tour: { version: TOUR_VERSION, status: 'offered', step: 0, at: now(d) } });
export const tourStart = (p: Progress, d?: Date): Progress => ({ ...p, tour: { version: TOUR_VERSION, status: 'in_progress', step: 0, at: now(d) } });
export const tourStep = (p: Progress, step: number, d?: Date): Progress => ({ ...p, tour: { ...p.tour, status: 'in_progress', step, at: now(d) } });
export const tourPause = (p: Progress, step: number, d?: Date): Progress => ({ ...p, tour: { ...p.tour, status: 'paused', step, at: now(d) } });
export const tourSkip = (p: Progress, d?: Date): Progress => ({ ...p, tour: { version: TOUR_VERSION, status: 'skipped', step: 0, at: now(d) } });
export const tourComplete = (p: Progress, d?: Date): Progress => ({ ...p, tour: { version: TOUR_VERSION, status: 'completed', step: 0, at: now(d) } });

/** Should the welcome offer appear now? Once per tour version, never forced, never repeated on every sign-in. */
export const shouldOfferTour = (p: Progress): boolean => p.tour.version < TOUR_VERSION || p.tour.status === 'idle';
/** Can the person continue where they stopped? */
export const canResumeTour = (p: Progress): boolean => p.tour.version === TOUR_VERSION && (p.tour.status === 'paused' || p.tour.status === 'in_progress') && p.tour.step > 0;
