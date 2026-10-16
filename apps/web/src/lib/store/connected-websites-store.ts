import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WebsiteEnvironment = "local" | "live";
export type WebsiteConnectionStatus = "connected" | "disconnected";

export type ConnectedWebsite = {
  id: string;
  siteId?: string;
  name: string;
  baseUrl: string;
  environment: WebsiteEnvironment;
  isPrimary: boolean;
  status: WebsiteConnectionStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type ConnectedWebsiteInput = {
  siteId?: string;
  name: string;
  baseUrl: string;
  environment: WebsiteEnvironment;
  isPrimary?: boolean;
  status?: WebsiteConnectionStatus;
  notes?: string;
};

type ConnectedWebsitesState = {
  websites: ConnectedWebsite[];
  add: (input: ConnectedWebsiteInput) => ConnectedWebsite;
  update: (id: string, patch: Partial<ConnectedWebsiteInput>) => void;
  remove: (id: string) => void;
  setPrimary: (id: string) => void;
  setStatus: (id: string, status: WebsiteConnectionStatus) => void;
};

const STORAGE_KEY = "againerp-connected-websites";

/** Normalize storefront origin: trim, strip trailing slash, require http(s). */
export function normalizeStorefrontBaseUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    // Storefront connection is an origin (host + port), not a deep path.
    return url.origin;
  } catch {
    return null;
  }
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function withSinglePrimary(
  websites: ConnectedWebsite[],
  primaryId: string | null,
): ConnectedWebsite[] {
  return websites.map((w) => ({
    ...w,
    isPrimary: primaryId !== null && w.id === primaryId,
  }));
}

export const useConnectedWebsitesStore = create<ConnectedWebsitesState>()(
  persist(
    (set, get) => ({
      websites: [],

      add: (input) => {
        const baseUrl = normalizeStorefrontBaseUrl(input.baseUrl);
        if (!baseUrl) {
          throw new Error("Enter a valid http:// or https:// URL");
        }
        const now = new Date().toISOString();
        const id = newId();
        const makePrimary = input.isPrimary === true || get().websites.length === 0;
        const row: ConnectedWebsite = {
          id,
          siteId: input.siteId,
          name: input.name.trim() || "Untitled",
          baseUrl,
          environment: input.environment,
          isPrimary: makePrimary,
          status: input.status ?? "connected",
          notes: input.notes?.trim() || undefined,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const withoutExistingSite = input.siteId
            ? state.websites.filter((website) => website.siteId !== input.siteId)
            : state.websites;
          const next = makePrimary
            ? withSinglePrimary([...withoutExistingSite, row], id)
            : [...withoutExistingSite, { ...row, isPrimary: false }];
          return { websites: next };
        });
        return get().websites.find((w) => w.id === id)!;
      },

      update: (id, patch) => {
        const existing = get().websites.find((w) => w.id === id);
        if (!existing) return;

        let baseUrl = existing.baseUrl;
        if (patch.baseUrl !== undefined) {
          const normalized = normalizeStorefrontBaseUrl(patch.baseUrl);
          if (!normalized) {
            throw new Error("Enter a valid http:// or https:// URL");
          }
          baseUrl = normalized;
        }

        const now = new Date().toISOString();
        set((state) => {
          let next = state.websites.map((w) =>
            w.id === id
              ? {
                  ...w,
                  siteId: patch.siteId ?? w.siteId,
                  name: patch.name !== undefined ? patch.name.trim() || w.name : w.name,
                  baseUrl,
                  environment: patch.environment ?? w.environment,
                  status: patch.status ?? w.status,
                  notes:
                    patch.notes !== undefined
                      ? patch.notes.trim() || undefined
                      : w.notes,
                  updatedAt: now,
                }
              : w,
          );

          if (patch.isPrimary === true) {
            next = withSinglePrimary(next, id);
          } else if (patch.isPrimary === false && existing.isPrimary) {
            const other = next.find((w) => w.id !== id);
            next = withSinglePrimary(next, other?.id ?? null);
          }

          return { websites: next };
        });
      },

      remove: (id) => {
        set((state) => {
          const wasPrimary = state.websites.some((w) => w.id === id && w.isPrimary);
          const remaining = state.websites.filter((w) => w.id !== id);
          if (!wasPrimary || remaining.length === 0) {
            return { websites: remaining };
          }
          return { websites: withSinglePrimary(remaining, remaining[0].id) };
        });
      },

      setPrimary: (id) => {
        set((state) => {
          if (!state.websites.some((w) => w.id === id)) return state;
          return { websites: withSinglePrimary(state.websites, id) };
        });
      },

      setStatus: (id, status) => {
        set((state) => ({
          websites: state.websites.map((w) =>
            w.id === id ? { ...w, status, updatedAt: new Date().toISOString() } : w,
          ),
        }));
      },
    }),
    { name: STORAGE_KEY },
  ),
);

/** Read primary base URL from the persisted store (client) or localStorage snapshot. */
export function getPrimaryConnectedBaseUrl(): string {
  const fromStore = useConnectedWebsitesStore
    .getState()
    .websites.find((w) => w.isPrimary)?.baseUrl;
  if (fromStore) return fromStore.replace(/\/$/, "");

  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as {
      state?: { websites?: ConnectedWebsite[] };
    };
    const primary = parsed.state?.websites?.find((w) => w.isPrimary);
    return primary?.baseUrl?.replace(/\/$/, "") ?? "";
  } catch {
    return "";
  }
}

export function usePrimaryStorefrontUrl(): string {
  return useConnectedWebsitesStore(
    (s) => s.websites.find((w) => w.isPrimary)?.baseUrl?.replace(/\/$/, "") ?? "",
  );
}
