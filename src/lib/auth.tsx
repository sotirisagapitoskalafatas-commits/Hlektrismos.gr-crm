import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Role, DEFAULT_ROLE } from './roles';
import { fetchUserRoles } from './api';

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
  role: Role;
  /* Canonical multi-role set from user_roles (Phase 1.1). Falls back to the
     single profile role when the foundation tables are not yet live. */
  roles: Role[];
  setRoleOverride: (r: Role) => void;
  clearRoleOverride: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const ROLE_KEY = 'atlas.role.override';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [canonicalRoles, setCanonicalRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleOverride, setRoleOverrideState] = useState<Role | null>(
    () => (localStorage.getItem(ROLE_KEY) as Role) ?? null,
  );

  const refreshProfile = useCallback(async () => {
    if (!supabase || !session?.user) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, phone, avatar_url')
      .eq('id', session.user.id)
      .maybeSingle();
    if (data) setProfile(data as Profile);
    // Best-effort canonical multi-role read; empty if foundation not live.
    const canonical = await fetchUserRoles(session.user.id);
    setCanonicalRoles(canonical);
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
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) refreshProfile();
  }, [session?.user, refreshProfile]);

  const signIn = async (email: string, password: string) => {
    if (!supabase) return { error: 'Database not configured' };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    if (!supabase) return { error: 'Database not configured' };
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    localStorage.removeItem(ROLE_KEY);
  };

  const setRoleOverride = (r: Role) => {
    localStorage.setItem(ROLE_KEY, r);
    setRoleOverrideState(r);
  };

  const clearRoleOverride = () => {
    localStorage.removeItem(ROLE_KEY);
    setRoleOverrideState(null);
  };

  // Effective role = simulator override (if any) else profile role.
  const role: Role = roleOverride ?? profile?.role ?? DEFAULT_ROLE;

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
        role,
        roles,
        setRoleOverride,
        clearRoleOverride,
        signIn,
        signUp,
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