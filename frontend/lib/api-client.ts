export class ApiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiHttpError";
  }
}

// ponytail: sin esquema el navegador lo toma como ruta relativa y pega contra el frontend.
let apiBase = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
if (apiBase && !/^https?:\/\//i.test(apiBase)) apiBase = `https://${apiBase}`;

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return apiBase ? `${apiBase}${p}` : p;
}

export function backendHint(): string {
  if (process.env.NODE_ENV === "development" && !apiBase) {
    return " En desarrollo, en backend/ ejecuta: .venv\\Scripts\\python -m uvicorn server:app --reload --port 8000";
  }
  if (!apiBase) return " Define NEXT_PUBLIC_API_URL con la URL pública del API.";
  return " Revisa que NEXT_PUBLIC_API_URL sea correcta y que el API esté en línea.";
}

function parseDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => String((d as { msg?: unknown })?.msg ?? "").replace(/^Value error, /, ""))
      .filter(Boolean)
      .join("; ");
  }
  return "Error inesperado";
}

async function handleJsonError(res: Response): Promise<never> {
  const text = await res.text();
  let msg = res.statusText || "Error de red";
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    if (j?.detail !== undefined) msg = parseDetail(j.detail);
  } catch {
    if (text.trim()) msg = text.trim().slice(0, 280);
  }
  if ((res.status >= 502 && msg === res.statusText) || msg === "Internal Server Error") msg += "." + backendHint();
  throw new ApiHttpError(msg, res.status);
}

export async function apiFetch<T>(
  path: string,
  accessToken: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiHttpError("No se pudo conectar con el servidor." + backendHint(), 0);
  }
  if (!res.ok) await handleJsonError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
