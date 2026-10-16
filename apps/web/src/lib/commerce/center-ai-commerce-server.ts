import {
  centerClientHeaders,
  resolveCenterBind,
  type CenterBind,
} from "@/lib/center/center-bind-server";

export type CommerceImportJob = {
  id: string;
  sourceUrl: string;
  adapterId: string;
  status: string;
  importMode?: string;
  progress: {
    step: string | null;
    percent: number;
    message: string | null;
    updatedAt?: string | null;
  };
  canonicalProduct?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  error?: { code: string; message: string } | null;
};

export type CommerceImportProgress = {
  id: string;
  status: string;
  importMode?: string;
  progress: CommerceImportJob["progress"];
  error?: CommerceImportJob["error"];
};

export type CommerceImportResult = {
  id: string;
  status: string;
  importMode?: string;
  result?: Record<string, unknown> | null;
  canonicalProduct?: Record<string, unknown> | null;
  error?: CommerceImportJob["error"];
};

/** True when bind file or env has Center client credentials. */
export async function centerClientCredentials(): Promise<CenterBind | null> {
  return resolveCenterBind();
}

async function centerCommerceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const bind = await resolveCenterBind();
  if (!bind) {
    throw new Error(
      "Center client credentials missing. Connect Center (Workspace → Modules) or set AGAINERP_CENTER_URL, AGAINERP_CLIENT_ID, AGAINERP_CLIENT_API_KEY.",
    );
  }

  const timeoutMs = 20_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${bind.centerUrl}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      headers: {
        ...centerClientHeaders(bind),
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    const cause = aborted
      ? `timed out after ${timeoutMs}ms`
      : err instanceof Error
        ? err.message
        : "network error";
    throw new Error(
      `Center API unreachable at ${bind.centerUrl} (${cause}). Start AgainERP Center or check AGAINERP_CENTER_URL.`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as {
        detail?: string | { message?: string; code?: string };
        message?: string;
      };
      if (typeof body.detail === "string") detail = body.detail;
      else if (body.detail && typeof body.detail === "object") {
        detail = body.detail.message || body.detail.code || detail;
      } else if (body.message) detail = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  return res.json() as Promise<T>;
}

export async function createCommercePreviewImport(url: string): Promise<CommerceImportJob> {
  const body = await centerCommerceFetch<{ job: CommerceImportJob }>(
    "/api/v1/client/ai-commerce/imports",
    {
      method: "POST",
      body: JSON.stringify({ url, mode: "preview" }),
    },
  );
  return body.job;
}

export async function fetchCommerceImportProgress(jobId: string): Promise<CommerceImportProgress> {
  return centerCommerceFetch<CommerceImportProgress>(
    `/api/v1/client/ai-commerce/imports/${jobId}/progress`,
  );
}

export async function fetchCommerceImportResult(jobId: string): Promise<CommerceImportResult> {
  return centerCommerceFetch<CommerceImportResult>(
    `/api/v1/client/ai-commerce/imports/${jobId}/result`,
  );
}

export async function approveCommerceImport(jobId: string): Promise<CommerceImportJob> {
  const body = await centerCommerceFetch<{ job: CommerceImportJob }>(
    `/api/v1/client/ai-commerce/imports/${jobId}/approve`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return body.job;
}

export async function completeCommerceErpImport(
  jobId: string,
  input: { productId: string; sku?: string; name?: string; summary?: Record<string, unknown> },
): Promise<CommerceImportJob> {
  const body = await centerCommerceFetch<{ job: CommerceImportJob }>(
    `/api/v1/client/ai-commerce/imports/${jobId}/erp-complete`,
    {
      method: "POST",
      body: JSON.stringify({
        product_id: input.productId,
        sku: input.sku ?? null,
        name: input.name ?? null,
        summary: input.summary ?? null,
      }),
    },
  );
  return body.job;
}

export async function failCommerceErpImport(jobId: string, message: string): Promise<CommerceImportJob> {
  const body = await centerCommerceFetch<{ job: CommerceImportJob }>(
    `/api/v1/client/ai-commerce/imports/${jobId}/erp-fail`,
    {
      method: "POST",
      body: JSON.stringify({ message }),
    },
  );
  return body.job;
}
