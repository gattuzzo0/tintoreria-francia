import { QRCodeSVG } from "qrcode.react";
import { getBranchInfo } from "@/lib/branches";
import { formatDeliveryLong } from "@/lib/delivery";
import { formatMoney, PAYMENT_LABEL, type Customer, type Order } from "@/lib/pos-data";

const STORE_INFO = {
  name: "Tintorería Francia",
  tagline: "Lavado en seco · Planchado · Cuidado textil",
  legalName: "Servicios Textiles del Valle S.A. de C.V.",
  rfc: "STV190312KQ4",
  hours: "Lun–Sáb 8:00–20:00 · Dom 9:00–14:00",
};

const Sep = () => <hr className="my-3 border-0 border-t border-dashed border-foreground/30" />;

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className={bold ? "font-semibold" : undefined}>{value}</span>
    </div>
  );
}

export function PrintableTicket({ order, customer }: { order: Order; customer?: Customer }) {
  const items = order.lines.reduce((n, l) => n + l.qty, 0);
  const created = new Date(order.createdAt);
  const deliveryText = formatDeliveryLong(order.deliveryDate);
  const branchInfo = getBranchInfo(order.branch);

  return (
    <article id="print-ticket" className="w-full max-w-[80mm] bg-card px-5 py-6 font-mono text-[11px] leading-relaxed">
      <header className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- plain img prints reliably */}
        <img src="/logo-francia.png" alt="" className="mb-2 size-16" />
        <p className="font-sans text-base font-semibold">{STORE_INFO.name}</p>
        <p>{STORE_INFO.tagline}</p>
        <p>{STORE_INFO.legalName}</p>
        <p>RFC {STORE_INFO.rfc}</p>
        {branchInfo ? (
          <>
            <p>{branchInfo.address}</p>
            <p>{branchInfo.city}</p>
            <p>Tel. {branchInfo.phone}</p>
          </>
        ) : null}
      </header>

      <Sep />
      <Row label="Folio" value={`#${order.folio}`} bold />
      <Row
        label="Fecha"
        value={created.toLocaleString("es-MX", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      />
      <Row label="Sucursal" value={order.branch ?? "—"} />
      <Sep />
      <p className="uppercase tracking-[0.14em]">Cliente</p>
      <p className="font-semibold">{customer?.name ?? "—"}</p>
      {customer && <p>Tel. {customer.phone}</p>}

      <Sep />
      <div className="flex justify-between uppercase tracking-[0.14em]">
        <span>Cant · Servicio</span>
        <span>Importe</span>
      </div>
      <ul className="mt-1 flex flex-col gap-1.5">
        {order.lines.map((l) => (
          <li key={l.serviceId}>
            <div className="flex justify-between gap-3">
              <span>
                {l.qty} {l.unit} · {l.name}
              </span>
              <span>{formatMoney(l.unitPriceCents * l.qty)}</span>
            </div>
            <p className="text-muted-foreground">
              {l.qty} × {formatMoney(l.unitPriceCents)}
            </p>
          </li>
        ))}
      </ul>
      <p className="mt-2">{items} artículos recibidos</p>

      <Sep />
      <Row label="Servicios" value={formatMoney(order.baseCents)} />
      {order.express && <Row label="Cargo exprés (30%)" value={formatMoney(order.surchargeCents)} />}
      <Row label="Subtotal" value={formatMoney(order.subtotalCents)} />
      <Row label="IVA 16%" value={formatMoney(order.taxCents)} />
      <div className="mt-1 flex justify-between border-t border-foreground pt-1 text-sm font-semibold">
        <span>TOTAL</span>
        <span>{formatMoney(order.totalCents)}</span>
      </div>
      <Row label="Forma de pago" value={PAYMENT_LABEL[order.payment]} />
      <Row label={order.payment === "pendiente" ? "Saldo pendiente" : "Pagado"} value={formatMoney(order.totalCents)} />

      <Sep />
      <p className="uppercase tracking-[0.14em]">Entrega {order.express ? "exprés" : "regular"}</p>
      <p className="font-semibold">{deliveryText}</p>
      {order.notes && <p className="mt-1">Obs.: {order.notes}</p>}

      <Sep />
      <div className="flex flex-col items-center gap-2 text-center">
        <QRCodeSVG
          value={`ORD-${order.folio}`}
          size={128}
          level="M"
          marginSize={0}
          fgColor="currentColor"
          bgColor="transparent"
          title={`Código QR de la orden ${order.folio}`}
          className="size-32"
        />
        <p className="font-semibold tracking-[0.2em]">ORD-{order.folio}</p>
        {order.branch && <p className="font-semibold">{order.branch}</p>}
        <p>Presente este código para recoger su pedido</p>
      </div>

      <Sep />
      <footer className="flex flex-col gap-1 text-center">
        <p>Prendas no reclamadas en 30 días causan cargo por resguardo.</p>
        <p>No nos hacemos responsables por objetos olvidados en las prendas.</p>
        <p>{STORE_INFO.hours}</p>
        <p className="mt-1 font-semibold">¡Gracias por su preferencia!</p>
      </footer>
    </article>
  );
}
