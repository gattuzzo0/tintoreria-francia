export const BRANCHES = ["Nereo Rdz.", "Himno Nal.", "Centro"] as const;

export type Branch = (typeof BRANCHES)[number];

export type BranchInfo = {
  address: string;
  city: string;
  phone: string;
};

/** Dirección y teléfono por sucursal (ticket / datos de tienda). */
export const BRANCH_INFO: Record<Branch, BranchInfo> = {
  "Nereo Rdz.": {
    address: "Av Nereo Rodríguez Barragán 905, Col del Valle 1ra Secc",
    city: "78200 San Luis Potosí, S.L.P.",
    phone: "4448133056",
  },
  "Himno Nal.": {
    address: "Av Himno Nacional 415, Jardín, Avenida",
    city: "78270 San Luis Potosí, S.L.P.",
    phone: "444813 2991",
  },
  Centro: {
    address: "José María Morelos y Pavón 1467, Barrio de San Sebastian",
    city: "78340 San Luis Potosí, S.L.P.",
    phone: "4448143242",
  },
};

export function getBranchInfo(branch: string | null | undefined): BranchInfo | null {
  if (branch && isBranch(branch)) return BRANCH_INFO[branch];
  return null;
}

const STORAGE_KEY = "tf-branch";

export function isBranch(value: string): value is Branch {
  return (BRANCHES as readonly string[]).includes(value);
}

export function saveBranch(branch: Branch): void {
  try {
    localStorage.setItem(STORAGE_KEY, branch);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode / blocked storage
  }
}

export function readBranch(): Branch | null {
  try {
    const fromLocal = localStorage.getItem(STORAGE_KEY);
    if (fromLocal && isBranch(fromLocal)) return fromLocal;
    // migración: sesiones que guardaron en sessionStorage
    const fromSession = sessionStorage.getItem(STORAGE_KEY);
    if (fromSession && isBranch(fromSession)) {
      saveBranch(fromSession);
      return fromSession;
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearBranch(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
