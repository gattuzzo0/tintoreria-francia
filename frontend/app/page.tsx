import { RequirePosAccess } from "@/components/auth/require-pos-access";
import { ErrorBoundary } from "@/components/error-boundary";
import { PosApp } from "@/components/pos/pos-app";

export default function Page() {
  return (
    <RequirePosAccess>
      <ErrorBoundary title="Error en el punto de venta">
        <PosApp />
      </ErrorBoundary>
    </RequirePosAccess>
  );
}
