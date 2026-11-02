import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { takeAuthLink } from './auth-link';
import { NOTICE_EMAIL_CHANGED, pushAuthNotice } from './auth-notice';
import { Role, DEFAULT_ROLE, canonicalRole } from './roles';
import { fetchUserRoles } from './api';
import { previewAllowed, ROLE_PREVIEW_HARD_STOP, setPreviewActive } from './role-preview';

export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  phone: string | null;
  avatar_url: string | null;
};

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** True once the profile lookup for the current session has finished (found or not). Until then the role is unknown. */
  profileReady: boolean;
  role: Role;
  /* Canonical multi-role set from user_roles (Phase 1.1). Falls back to the
     single profile role when the foundation tables are not yet live. */
  roles: Role[];
  /** Presentation-only role preview (server-allowlisted, time-boxed, read-only). Never changes real permissions. */
  preview: { allowed: boolean; role: Role | null; expiresAt: number | null };
  startPreview: (r: Role) => Promise<boolean>;
  endPreview: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Per browser tab only (sessionStorage): a preview never outlives the tab, and is re-validated on load.
const PREVIEW_KEY = 'atlas.preview.role';
const LEGACY_ROLE_KEY = 'atlas.role.override';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [canonicalRoles, setCanonicalRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileFor, setProfileFor] = useState<string | null>(null); // user id whose profile lookup has finished
  const [previewRole, setPreviewRole] = useState<Role | null>(() => {
    try { localStorage.removeItem(LEGACY_ROLE_KEY); return (sessionStorage.getItem(PREVIEW_KEY) as Role) ?? null; } catch { return null; }
  });
  // Server answer: { allowed, expires_at, server_now }; offset = server clock − browser clock.
  const [previewGrant, setPreviewGrant] = useState<{ status: Record<string, unknown> | null; offset: number }>({ status: null, offset: 0 });
  const [tick, setTick] = useState(() => Date.now());

  const refreshProfile = useCallback(async () => {
    if (!supabase || !session?.user) return;
    const uid = session.user.id;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role, phone, avatar_url')
        .eq('id', uid)
        .maybeSingle();
      // No row (or a failed read) is stored as null, never as the previous user's profile: an account without a profile gets no access.
      setProfile(data ? { ...(data as Profile), role: canonicalRole((data as Profile).role) } : null);
      // Best-effort canonical multi-role read; empty if foundation not live.
      const canonical = await fetchUserRoles(uid);
      setCanonicalRoles(canonical);
    } finally {
      setProfileFor(uid);
    }
  }, [session?.user]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      // The e-mailed reset link signs the person in with a recovery session: send them to the choose-a-new-password page.
      if (event === 'PASSWORD_RECOVERY') window.location.hash = '/reset';
      // An invitation signs the person in with no password yet: the same page lets them choose one.
      else if (event === 'SIGNED_IN') {
        const type = takeAuthLink();
        if (sess?.user?.app_metadata?.must_change_password === true || type === 'invite') window.location.hash = '/reset';
        // The e-mail-change link signs the person in only after Supabase has accepted it: success is shown now, never earlier, and they land in the CRM.
        else if (type === 'email_change') { pushAuthNotice(NOTICE_EMAIL_CHANGED); window.location.hash = '/app'; }
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) refreshProfile();
  }, [session?.user, refreshProfile]);

  // No self-service sign-up: staff accounts are created by an admin, and
  // public sign-ups must stay disabled in Supabase Auth settings. Any future
  // public sign-up flow must add a server-validated age check first.
  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: 'Database not configured' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const profileReady = !session?.user || profileFor === session.user.id;
  const physicalRole: Role = profile?.role ?? DEFAULT_ROLE;

  // Ask the server whether this account may use the presentation preview (fails closed on any error).
  useEffect(() => {
    let alive = true;
    if (!supabase || !profile || profile.role !== 'admin' || Date.now() >= ROLE_PREVIEW_HARD_STOP) {
      setPreviewGrant({ status: null, offset: 0 });
      return;
    }
    const sent = Date.now();
    supabase.rpc('role_preview_status').then(({ data, error }) => {
      if (!alive) return;
      const st = !error && data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
      const serverNow = st ? Date.parse(String(st.server_now ?? '')) : NaN;
      setPreviewGrant({ status: st, offset: Number.isFinite(serverNow) ? serverNow - Math.round((sent + Date.now()) / 2) : 0 });
    }, () => alive && setPreviewGrant({ status: null, offset: 0 }));
    return () => { alive = false; };
  }, [profile]);

  // Re-check the expiry every 20 s so the preview ends by itself at 00:00 Athens.
  useEffect(() => { const t = window.setInterval(() => setTick(Date.now()), 20_000); return () => window.clearInterval(t); }, []);

  const allowed = physicalRole === 'admin' && previewAllowed(previewGrant.status as never, tick, previewGrant.offset);
  const activePreview: Role | null = allowed && previewRole && previewRole !== physicalRole ? previewRole : null;
  setPreviewActive(activePreview !== null); // keep the request guard in sync before children render
  const expiresAt = allowed ? Math.min(Date.parse(String(previewGrant.status?.expires_at)), ROLE_PREVIEW_HARD_STOP) : null;

  const clearPreviewState = () => {
    try { sessionStorage.removeItem(PREVIEW_KEY); } catch { /* ignore */ }
    setPreviewRole(null);
    setPreviewActive(false);
  };

  // Expired or no longer allowed → drop any stored preview.
  useEffect(() => { if (previewRole && !allowed && profile) clearPreviewState(); }, [allowed, previewRole, profile]);

  const startPreview = async (r: Role): Promise<boolean> => {
    if (!supabase || !allowed) return false;
    if (r === physicalRole) { await endPreview(); return true; }
    // The server re-checks the grant and records the start in the audit log; no answer → no preview.
    const { data, error } = await supabase.rpc('role_preview_event', { p_action: 'start', p_role: r });
    if (error || data !== true) return false;
    try { sessionStorage.setItem(PREVIEW_KEY, r); } catch { /* ignore */ }
    setPreviewRole(r);
    setPreviewActive(true);
    return true;
  };

  const endPreview = async () => {
    const was = previewRole;
    clearPreviewState();
    if (supabase && was) await supabase.rpc('role_preview_event', { p_action: 'end', p_role: was }).then(() => undefined, () => undefined);
  };

  const signOut = async () => {
    clearPreviewState();
    if (supabase) await supabase.auth.signOut();
  };

  // Effective role for rendering = the preview role while a valid preview runs, else the real profile role.
  // Data access is always enforced by the database/edge functions with the REAL session role.
  const role: Role = activePreview ?? physicalRole;

  // Canonical role set: prefer user_roles; fall back to the single profile role
  // so existing single-role installs behave identically.
  const roles: Role[] = canonicalRoles.length > 0
    ? canonicalRoles
    : (profile?.role ? [profile.role] : []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        profileReady,
        role,
        roles,
        preview: { allowed, role: activePreview, expiresAt },
        startPreview,
        endPreview,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}