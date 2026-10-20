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

{
  const url = whatsappSendUrl("4441234567", "hola");
  if (url !== "whatsapp://send?phone=524441234567&text=hola") throw new Error("whatsappSendUrl");
  const msg = readyMessage("Ana", 12, { branch: "Centro", hours: "Lun–Sáb 8:00–20:00" }, "$10");
  if (!msg.startsWith("Hola Ana, te escribimos de Tintorería Francia, sucursal Centro.")) throw new Error("readyMessage");
  if (!msg.includes("Lun–Sáb 8:00–20:00") || !msg.endsWith("El monto a saldar es $10.")) throw new Error("readyMessage total");
  if (readyMessage("Ana", 12, {}).includes("saldar")) throw new Error("readyMessage plain");
}
