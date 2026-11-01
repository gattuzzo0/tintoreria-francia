export type InvoiceFileKind = "pdf" | "xml";

export const INVOICE_FILE_MAX_BYTES = 4_000_000;

const XML_START = /^\uFEFF?\s*(<\?xml|<cfdi:|<comprobante)/i;

function startsWith(bytes: Uint8Array, text: string): boolean {
  const sample = new TextDecoder().decode(bytes.slice(0, text.length));
  return sample === text;
}

function looksLikeXml(bytes: Uint8Array): boolean {
  const sample = new TextDecoder().decode(bytes.slice(0, 80));
  return XML_START.test(sample);
}

export async function invoiceFileError(kind: InvoiceFileKind, file: File): Promise<string | null> {
  const name = file.name.toLowerCase();
  if (kind === "pdf" && !name.endsWith(".pdf")) return "Debe ser un PDF.";
  if (kind === "xml" && !name.endsWith(".xml")) return "Debe ser un XML.";
  if (file.size < 1) return "El archivo está vacío.";
  if (file.size > INVOICE_FILE_MAX_BYTES) return "El archivo pesa más de 4 MB.";
  const head = new Uint8Array(await file.slice(0, 80).arrayBuffer());
  if (kind === "pdf" && !startsWith(head, "%PDF")) return "No es un PDF válido.";
  if (kind === "xml" && !looksLikeXml(head)) return "No es un XML válido.";
  return null;
}
