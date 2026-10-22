"use client";

import { useSyncExternalStore } from "react";
import { BarChart3, ClipboardList, LayoutGrid, LogOut, ShieldCheck, Tags, Users } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { readBranch } from "@/lib/branches";
import { staffPhoneFromLoginEmail } from "@/lib/staff-login";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { usePos } from "./pos-provider";

const subscribeNoop = () => () => {};
const getBranchClient = () => readBranch() ?? "";
const getBranchServer = () => "";

export type View = "venta" | "ordenes" | "clientes" | "reportes" | "catalogo" | "admins";

const ITEMS = [
  { id: "venta", label: "Venta", icon: LayoutGrid, adminOnly: false },
  { id: "ordenes", label: "Órdenes", icon: ClipboardList, adminOnly: false },
  { id: "clientes", label: "Clientes", icon: Users, adminOnly: false },
  { id: "reportes", label: "Reportes", icon: BarChart3, adminOnly: true },
  { id: "catalogo", label: "Catálogo", icon: Tags, adminOnly: true },
  { id: "admins", label: "Administradores", icon: ShieldCheck, adminOnly: true },
] as const;

export function AppNav({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  const { orders } = usePos();
  const { isAdmin, email, fullName, signOut } = useAuth();
  const branch = useSyncExternalStore(subscribeNoop, getBranchClient, getBranchServer);
  const readyCount = orders.filter((o) => o.status === "listo" && o.branch === branch).length;

  return (
    <header className="sticky top-0 z-30 border-b bg-background md:bg-background/85 md:backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-4 px-4 lg:px-6">
        <BrandMark />
        <nav
          aria-label="Secciones"
          className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t bg-card p-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:static md:rounded-xl md:border md:pb-1"
        >
          {ITEMS.filter((i) => isAdmin || !i.adminOnly).map(({ id, label, icon: Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg px-1 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/30 md:h-8 md:flex-none md:px-3",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5 md:size-4" aria-hidden />
                <span className="hidden lg:inline">{label}</span>
                <span className="sr-only lg:hidden">{label}</span>
                {id === "ordenes" && readyCount > 0 && (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px]",
                      active ? "bg-background text-foreground" : "bg-primary text-primary-foreground",
                    )}
                  >
                    {readyCount}
                    <span className="sr-only"> órdenes listas</span>
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="flex items-center gap-4">
          <div className="hidden items-center gap-2 xl:flex">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-50" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            <span className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {branch ? `${branch} · Abierta` : "Caja · Abierta"}
            </span>
          </div>
          <button
            type="button"
            onClick={signOut}
            title={fullName ?? staffPhoneFromLoginEmail(email) ?? email ?? undefined}
            className="inline-flex h-11 items-center gap-2 rounded-lg px-3 text-sm md:h-8 md:px-2 text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden md:inline">Cerrar sesión</span>
            <span className="sr-only md:hidden">Cerrar sesión</span>
          </button>
        </div>
      </div>
    </header>
  );
}
