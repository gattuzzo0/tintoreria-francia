"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { ApiHttpError } from "@/lib/api-client";
import { isAccessTokenExpired, shouldFetchMeAfterAuthEvent } from "@/lib/auth-session";
import { fetchMe, type Me } from "@/lib/pos-api";
import { clearPersistedAuthSession, isSupabaseConfigured, supabase } from "@/lib/supabase";

type StaffRole = "admin" | "empleado";

type AuthContextValue = {
  session: Session | null;
  email: string | null;
  fullName: string | null;
  role: StaffRole | null;
  canAccessPos: boolean;
  isAdmin: boolean;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null; role: StaffRole | null }>;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);

  const clearAuthState = useCallback(() => {
    clearPersistedAuthSession();
    setSession(null);
    setMe(null);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let cancelled = false;

    const refreshProfile = async (s: Session | null, event: AuthChangeEvent) => {
      const token = s?.access_token;
      if (!token) {
        setMe(null);
        return;
      }
      if (!shouldFetchMeAfterAuthEvent(event) || isAccessTokenExpired(token)) return;
      try {
        const next = await fetchMe(token);
        if (!cancelled) setMe(next);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiHttpError && e.status === 401) {
          clearAuthState();
          return;
        }
        // Red/503 en TOKEN_REFRESHED: conservar el rol previo.
        if (event === "INITIAL_SESSION" || event === "SIGNED_IN") setMe(null);
      }
    };

    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (cancelled) return;
      setSession(s);
      void refreshProfile(s, event).finally(() => {
        if (!cancelled) setReady(true);
      });
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, [clearAuthState]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!isSupabaseConfigured) return { error: "Falta configurar Supabase.", role: null };
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        return { error: "Teléfono o contraseña incorrectos.", role: null };
      }
      try {
        const next = await fetchMe(data.session.access_token);
        setSession(data.session);
        setMe(next);
        return { error: null, role: next.role };
      } catch (e) {
        if (e instanceof ApiHttpError && e.status === 401) clearAuthState();
        return { error: e instanceof Error ? e.message : "No se pudo validar la sesión.", role: null };
      }
    },
    [clearAuthState],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      email: me?.email ?? session?.user.email ?? null,
      fullName: me?.fullName ?? null,
      role: me?.role ?? null,
      canAccessPos: Boolean(me?.canAccessPos),
      isAdmin: Boolean(me?.isAdmin),
      ready,
      signIn,
      signOut: clearAuthState,
    }),
    [session, me, ready, signIn, clearAuthState],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
