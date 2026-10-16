import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function apiOrigin(): string {
  return (
    process.env.API_PROXY_TARGET?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") ||
    "http://127.0.0.1:8010"
  );
}

/** `fetch failed` on its own hides the real problem (DNS, refused, timeout, reset). */
function describeFetchError(err: unknown): string {
  const message = err instanceof Error ? err.message : "API unreachable";
  const cause = err instanceof Error && err.cause ? (err.cause as Error) : null;
  const detail = cause ? (cause.message ?? String(cause)) : "";
  return detail ? `${message}: ${detail}` : message;
}

/** Runtime reverse-proxy to FastAPI — works with Docker service DNS and Vercel env at request time. */
export async function proxyToApi(
  req: NextRequest,
  upstreamPath: string,
): Promise<NextResponse> {
  const target = new URL(upstreamPath, `${apiOrigin()}/`);
  target.search = req.nextUrl.search;

  const headers = new Headers(req.headers);
  // Hop-by-hop headers must not be forwarded; `expect` is outright rejected by fetch.
  for (const name of [
    "host",
    "connection",
    "content-length",
    "expect",
    "keep-alive",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]) {
    headers.delete(name);
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  // Buffered so the request can be replayed if the upstream socket was stale.
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const send = () =>
    fetch(target, {
      method,
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
    });

  // fetch never retries POST/PUT itself, so a socket the API had already closed
  // surfaced to the user as a hard failure. A few replays cover that race.
  let upstream: Response | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      upstream = await send();
      lastError = undefined;
      break;
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  }
  if (!upstream) {
    const reason = describeFetchError(lastError);
    console.error(`[api-proxy] ${method} ${target.pathname} failed — ${reason}`);
    return NextResponse.json(
      {
        detail: `Cannot reach API at ${apiOrigin()} (${reason}). Set API_PROXY_TARGET to the FastAPI base URL.`,
      },
      { status: 502 },
    );
  }

  const out = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "transfer-encoding" || lower === "connection" || lower === "content-encoding") {
      return;
    }
    out.set(key, value);
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  });
}
