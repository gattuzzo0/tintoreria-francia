import { QRCodeSVG } from "qrcode.react";
import { fillingText } from "@/lib/fillings";
import { lengthText } from "@/lib/lengths";
import { garmentColor } from "@/lib/garment-colors";
import { getBranchInfo } from "@/lib/branches";
import { formatDeliveryLong } from "@/lib/delivery";
import { formatMoney, orderSurchargePct, PAYMENT_LABEL, type Customer, type Order } from "@/lib/pos-data";
import { ticketContentWidthMm, type TicketWidthMm } from "@/lib/ticket-width";
import { cn } from "@/lib/utils";

const STORE_INFO = {
  name: "Tintorería Francia",
  tagline: "Lavado en seco · Planchado · Cuidado textil",
  legalName: "Servicios Textiles del Valle S.A. de C.V.",
  rfc: "STV190312KQ4",
};

const Sep = ({ tight }: { tight?: boolean }) => (
  <hr className={cn("border-0 border-t border-dashed border-foreground/30", tight ? "my-1.5" : "my-2.5")} />
);

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-1">
      <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{label}</span>
      <span className={cn("max-w-[45%] shrink-0 break-all text-right", bold && "font-semibold")}>{value}</span>
    </div>
  );
}

export function PrintableTicket({
  order,
  customer,
  widthMm = 58,
}: {
  order: Order;
  customer?: Customer;
  widthMm?: TicketWidthMm;
}) {
  const items = order.lines.reduce((n, l) => n + l.qty, 0);
  const created = new Date(order.createdAt);
  const deliveryText = formatDeliveryLong(order.deliveryDate);
  const branchInfo = getBranchInfo(order.branch);
  const narrow = widthMm === 58;
  const contentMm = ticketContentWidthMm(widthMm);
  const qr = narrow ? 72 : 112;

  return (
    <article
      id="print-ticket"
      data-ticket-mm={widthMm}
      className={cn(
        "w-full break-words bg-card font-mono leading-tight [overflow-wrap:anywhere]",
        narrow ? "py-2 text-[9px]" : "px-1 py-4 text-[10px] leading-snug",
      )}
      style={{ maxWidth: `${contentMm}mm` }}
    >
      <header className="flex flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- plain img prints reliably */}
        <img src="/logo-francia.png" alt="" className={cn("mb-1", narrow ? "size-10" : "mb-1.5 size-14")} />
        <p className={cn("font-semibold", narrow ? "text-[10px]" : "text-xs")}>{STORE_INFO.name}</p>
        <p className="break-words [overflow-wrap:anywhere]">{STORE_INFO.tagline}</p>
        <p className="break-words [overflow-wrap:anywhere]">{STORE_INFO.legalName}</p>
        <p>RFC {STORE_INFO.rfc}</p>
        {branchInfo ? (
          <>
            <p className="break-words [overflow-wrap:anywhere]">{branchInfo.address}</p>
            <p className="break-words [overflow-wrap:anywhere]">{branchInfo.city}</p>
            <p>Tel. {branchInfo.phone}</p>
          </>
        ) : null}
      </header>

      <Sep tight={narrow} />
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
      <Sep tight={narrow} />
      <p className="uppercase">Cliente</p>
      <p className="break-words font-semibold [overflow-wrap:anywhere]">{customer?.name ?? "—"}</p>
      {customer && <p>Tel. {customer.phone}</p>}

      <Sep tight={narrow} />
      <div className="flex justify-between gap-1 uppercase">
        <span className="min-w-0">Cant · Servicio</span>
        <span className="shrink-0">Importe</span>
      </div>
      <ul className="mt-1 flex flex-col gap-1">
        {order.lines.map((l) => {
          const color = garmentColor(l.color);
          return (
            <li key={`${l.serviceId}:${l.color}:${l.fill}:${l.length}`}>
              <div className="flex items-start justify-between gap-1">
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  {l.qty} {l.unit} · {l.name}
                  {color ? ` · ${color.label}` : ""}
                  {l.fill ? ` · ${fillingText(l.fill)}` : ""}
                  {l.length ? ` · ${lengthText(l.length)}` : ""}
                </span>
                <span className="max-w-[40%] shrink-0 break-all text-right">
                  {formatMoney(l.unitPriceCents * l.qty)}
                </span>
              </div>
              <p className="text-muted-foreground">
                {l.qty} × {formatMoney(l.unitPriceCents)}
              </p>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5">
        {items} {items === 1 ? "artículo recibido" : "artículos recibidos"}
      </p>

      <Sep tight={narrow} />
      <Row label="Servicios" value={formatMoney(order.baseCents)} />
      {order.express && (
        <Row label={`Cargo exprés (${orderSurchargePct(order)}%)`} value={formatMoney(order.surchargeCents)} />
      )}
      <Row label="Subtotal" value={formatMoney(order.subtotalCents)} />
      <Row label="IVA 16%" value={formatMoney(order.taxCents)} />
      <div
        className={cn(
          "mt-1 flex items-start justify-between gap-1 border-t border-foreground pt-1 font-semibold",
          narrow ? "text-[10px]" : "text-xs",
        )}
      >
        <span>TOTAL</span>
        <span className="max-w-[45%] shrink-0 break-all text-right">{formatMoney(order.totalCents)}</span>
      </div>
      {order.wantsInvoice && <p className="mt-1 font-semibold">Facturar</p>}
      <Row label="Forma de pago" value={PAYMENT_LABEL[order.payment]} />
      <Row label={order.payment === "pendiente" ? "Saldo pendiente" : "Pagado"} value={formatMoney(order.totalCents)} />

      <Sep tight={narrow} />
      <p className="uppercase">Entrega {order.express ? "exprés" : "regular"}</p>
      <p className="break-words font-semibold [overflow-wrap:anywhere]">{deliveryText}</p>
      {order.notes && <p className="mt-1 break-words [overflow-wrap:anywhere]">Obs.: {order.notes}</p>}
      {(order.photoIds?.length ?? (order.photoId ? 1 : 0)) > 0 && (
        <p className="mt-1">{(order.photoIds?.length ?? 1) > 1 ? "Fotos adjuntas" : "Foto adjunta"}</p>
      )}

      <Sep tight={narrow} />
      <div className={cn("flex flex-col items-center text-center", narrow ? "gap-1" : "gap-1.5")}>
        <QRCodeSVG
          value={String(order.folio)}
          size={qr}
          level="M"
          marginSize={0}
          fgColor="currentColor"
          bgColor="transparent"
          title={`Código QR de la orden ${order.folio}`}
          className={narrow ? "size-[72px]" : "size-28"}
        />
        <p className="font-semibold tracking-wide">{order.folio}</p>
        {order.branch && <p className="break-words font-semibold [overflow-wrap:anywhere]">{order.branch}</p>}
        <p className="break-words [overflow-wrap:anywhere]">Presente este código para recoger su pedido</p>
      </div>

      <Sep tight={narrow} />
      <footer className="flex flex-col gap-0.5 text-center">
        <p className="break-words [overflow-wrap:anywhere]">Prendas no reclamadas en 30 días causan cargo por resguardo.</p>
        <p className="break-words [overflow-wrap:anywhere]">No nos hacemos responsables por objetos olvidados en las prendas.</p>
        {branchInfo?.hours ? <p className="break-words [overflow-wrap:anywhere]">{branchInfo.hours}</p> : null}
        <p className="mt-1 font-semibold">¡Gracias por su preferencia!</p>
      </footer>
    </article>
  );
}
