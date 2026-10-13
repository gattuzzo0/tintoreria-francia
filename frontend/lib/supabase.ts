import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export const isSupabaseConfigured = Boolean(url && anonKey);

// Solo auth (signIn, refresh); los datos de negocio van por la API.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : createClient(
      "https://placeholder-not-configured.supabase.co",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.placeholder-not-configured",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

export function clearPersistedAuthSession(): void {
  if (!isSupabaseConfigured) return;
  const projectRef = new URL(url).hostname.split(".")[0];
  localStorage.removeItem(`sb-${projectRef}-auth-token`);
}
