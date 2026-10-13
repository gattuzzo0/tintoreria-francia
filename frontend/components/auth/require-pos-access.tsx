"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase";
import { useAuth } from "./auth-provider";

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">{children}</div>;
}

export function RequirePosAccess({ children }: { children: React.ReactNode }) {
  const { session, canAccessPos, ready, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const needsLogin = isSupabaseConfigured && ready && !session;

  useEffect(() => {
    if (needsLogin) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [needsLogin, pathname, router]);

  if (!isSupabaseConfigured) {
    return (
      <Centered>
        <ShieldAlert className="size-8 text-destructive" aria-hidden />
        <p className="max-w-sm text-sm text-muted-foreground">
          Falta configurar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en frontend/.env.local.
        </p>
      </Centered>
    );
  }

  if (!ready || needsLogin) {
    return (
      <Centered>
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando sesión" />
      </Centered>
    );
  }

  if (!canAccessPos) {
    return (
      <Centered>
        <ShieldAlert className="size-8 text-muted-foreground" aria-hidden />
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Sin acceso al punto de venta</h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Tu usuario no tiene rol de administrador o empleado. Pide a un administrador que te dé acceso.
          </p>
        </div>
        <Button variant="outline" onClick={signOut}>
          Cerrar sesión
        </Button>
      </Centered>
    );
  }

  return children;
}
