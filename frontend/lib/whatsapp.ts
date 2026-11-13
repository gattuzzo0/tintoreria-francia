/** whatsapp:// abre la app. 10 dígitos → 52. Sin +. ponytail: números ya internacionales se dejan como vienen. */
export function whatsappSendUrl(phone: string, text: string): string {
  const digits = phone.replace(/\D/g, "");
  const full = digits.length === 10 ? `52${digits}` : digits;
  return `whatsapp://send?phone=${full}&text=${encodeURIComponent(text)}`;
}

export function readyMessage(
  name: string,
  folio: number,
  place: { branch?: string | null; hours?: string | null },
  total?: string,
): string {
  const where = place.branch ? `, sucursal ${place.branch}` : "";
  const when = place.hours ? ` Puedes pasar a recogerla en este horario: ${place.hours}.` : "";
  const due = total ? ` El monto a saldar es ${total}.` : "";
  return `Hola ${name}, te escribimos de Tintorería Francia${where}. Tu orden #${folio} ya está lista.${when}${due}`;
}

export function noteMessage(name: string, folio: number, note: string): string {
  const body = note.trim().replace(/[.!?]+$/, "");
  return `Hola ${name}, te escribimos de Tintorería Francia. Orden #${folio} Encontramos el siguiente detalle al recibir sus prendas: ${body}. Favor de contestar si está de acuerdo en que continuemos con el proceso de limpieza aceptando esta condición como ya existente`;
}

{
  const url = whatsappSendUrl("4441234567", "hola");
  if (url !== "whatsapp://send?phone=524441234567&text=hola") throw new Error("whatsappSendUrl");
  const msg = readyMessage("Ana", 12, { branch: "Centro", hours: "Lun–Sáb 8:00–20:00" }, "$10");
  if (!msg.startsWith("Hola Ana, te escribimos de Tintorería Francia, sucursal Centro.")) throw new Error("readyMessage");
  if (!msg.includes("Lun–Sáb 8:00–20:00") || !msg.endsWith("El monto a saldar es $10.")) throw new Error("readyMessage total");
  if (readyMessage("Ana", 12, {}).includes("saldar")) throw new Error("readyMessage plain");
  const note = noteMessage("Ana", 12, "  Tiene un pelo.  ");
  if (
    note !==
    "Hola Ana, te escribimos de Tintorería Francia. Orden #12 Encontramos el siguiente detalle al recibir sus prendas: Tiene un pelo. Favor de contestar si está de acuerdo en que continuemos con el proceso de limpieza aceptando esta condición como ya existente"
  ) {
    throw new Error("noteMessage");
  }
  const many = noteMessage("Genaro", 1117, "llego roto del cierre; tambien esta manchada");
  if (!many.includes("llego roto del cierre; tambien esta manchada")) throw new Error("noteMessage many");
}
