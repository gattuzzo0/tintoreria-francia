import type { AuthChangeEvent } from "@supabase/supabase-js";

export function isAccessTokenExpired(token: string, leewaySec = 30): boolean {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    return !payload.exp || payload.exp * 1000 <= Date.now() + leewaySec * 1000;
  } catch {
    return true;
  }
}

export function shouldFetchMeAfterAuthEvent(event: AuthChangeEvent): boolean {
  return event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED";
}
