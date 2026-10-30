// Which kind of e-mailed link opened the app (invite, password recovery, e-mail change …).
// supabase-js reads the tokens from the URL hash and removes them, so the TYPE is noted first — never the tokens.
const KEY = 'atlas.auth.link';
const TYPES = ['invite', 'recovery', 'email_change', 'signup', 'magiclink'] as const;
export type AuthLinkType = (typeof TYPES)[number];

interface KV { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
const session = (): KV | null => { try { return typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; } };

/** `#access_token=…&type=invite` → 'invite'. Anything else (including app routes like `#/app`) → null. */
export function parseAuthLinkType(hash: string): AuthLinkType | null {
  const h = hash.replace(/^#/, '');
  if (!h || h.startsWith('/')) return null;
  const params = new URLSearchParams(h);
  if (!params.has('access_token')) return null; // an error redirect or a stray fragment is not a usable link
  const type = params.get('type');
  return type && (TYPES as readonly string[]).includes(type) ? (type as AuthLinkType) : null;
}

export function captureAuthLink(hash: string = typeof window !== 'undefined' ? window.location.hash : '', storage: KV | null = session()): AuthLinkType | null {
  const type = parseAuthLinkType(hash);
  try { if (type) storage?.setItem(KEY, type); } catch { /* storage blocked: the link still signs the person in */ }
  return type;
}

/** Read once and forget. */
export function takeAuthLink(storage: KV | null = session()): AuthLinkType | null {
  try {
    const v = storage?.getItem(KEY) ?? null;
    storage?.removeItem(KEY);
    return v && (TYPES as readonly string[]).includes(v) ? (v as AuthLinkType) : null;
  } catch { return null; }
}
