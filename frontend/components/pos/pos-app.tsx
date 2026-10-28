"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { AccountingView } from "./accounting-view";
import { AdminsView } from "./admins-view";
import { AppNav, type View } from "./app-nav";
import { BranchGate } from "./branch-gate";
import { CatalogAdmin } from "./catalog-admin";
import { CustomersView } from "./customers-view";
import { LoginIntro } from "./login-intro";
import { OrdersBoard } from "./orders-board";
import { PosProvider, usePos } from "./pos-provider";
import { ReportsView } from "./reports-view";
import { ServiceCatalog } from "./service-catalog";
import { TicketPanel } from "./ticket-panel";

export function PosApp() {
  return (
    <PosProvider>
      <BranchGate>
        <PosShell />
      </BranchGate>
    </PosProvider>
  );
}

function PosShell() {
  const { isAdmin } = useAuth();
  const { status, loadError, reload, refreshSummary } = usePos();
  const [view, setView] = useState<View>("venta");
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [lookupKey, setLookupKey] = useState(0);

  const navigate = (v: View) => {
    setPendingPhone(null);
    setView(v);
  };

  useEffect(() => {
    if (status !== "ready") return;
    void refreshSummary().catch(() => undefined);
  }, [status, refreshSummary]);

  const registerFromSale = (phone: string) => {
    setPendingPhone(phone);
    setView("clientes");
  };

  return (
    <div className="min-h-dvh">
      <LoginIntro />
      <AppNav view={view} onNavigate={navigate} />
      <main className="mx-auto w-full max-w-[1600px] px-4 pt-6 pb-24 md:pb-6 lg:px-6 lg:py-8">
        {status === "loading" ? (
          <div className="flex justify-center py-24">
            <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Cargando datos" />
          </div>
        ) : status === "error" ? (
          <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
            <p className="text-sm text-muted-foreground">{loadError}</p>
            <Button variant="outline" onClick={() => void reload()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            {view === "venta" && (
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <ServiceCatalog onRegisterPhone={registerFromSale} lookupKey={lookupKey} />
                <TicketPanel
                  onRegisterPhone={registerFromSale}
                  lookupKey={lookupKey}
                  onSaleComplete={() => setLookupKey((k) => k + 1)}
                />
              </div>
            )}
            {view === "ordenes" && <OrdersBoard />}
            {view === "contabilidad" && <AccountingView />}
            {view === "clientes" && (
              <CustomersView
                key={pendingPhone ?? "directorio"}
                prefillPhone={pendingPhone}
                onReturnToSale={() => navigate("venta")}
              />
            )}
            {view === "reportes" && isAdmin && <ReportsView />}
            {view === "catalogo" && isAdmin && <CatalogAdmin />}
            {view === "admins" && isAdmin && <AdminsView />}
          </>
        )}
      </main>
    </div>
  );
}
