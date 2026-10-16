/**
 * Next.js proxy for Elim API — avoids browser CORS.
 * Path: /api/plugins/china-import/<elim-path>
 *
 * Forwards:
 * - x-api-key from the client
 * - optional x-elim-base-url (defaults to https://openapi.elim.asia)
 *
 * Standalone plugin glue only — does not touch Inventory/Catalog/Sales.
 */

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_UPSTREAM = "https://openapi.elim.asia";

function upstreamBase(req: NextRequest): string {
  const header = req.headers.get("x-elim-base-url")?.trim();
  const base = (header || DEFAULT_UPSTREAM).replace(/\/+$/, "");
  try {
    const url = new URL(base);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Invalid protocol");
    }
    return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  } catch {
    return DEFAULT_UPSTREAM;
  }
}

async function proxy(req: NextRequest, pathParts: string[]): Promise<NextResponse> {
  const elimPath = `/${pathParts.map(decodeURIComponent).join("/")}`;
  const target = new URL(`${upstreamBase(req)}${elimPath}`);
  req.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });

  const apiKey = req.headers.get("x-api-key") || "";
  const headers: HeadersInit = {
    Accept: "application/json",
  };
  if (apiKey) {
    (headers as Record<string, string>)["x-api-key"] = apiKey;
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    const contentType = req.headers.get("content-type");
    if (contentType) {
      (headers as Record<string, string>)["Content-Type"] = contentType;
    }
    init.body = Buffer.from(await req.arrayBuffer());
  }

  const started = Date.now();
  try {
    const upstream = await fetch(target.toString(), init);
    const buffer = await upstream.arrayBuffer();
    const responseHeaders = new Headers();
    const passThrough = [
      "content-type",
      "x-api-version",
      "x-ratelimit-remaining",
      "x-ratelimit-limit",
      "x-ratelimit-reset",
      "x-quota-remaining",
      "x-quota-limit",
    ];
    for (const key of passThrough) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    responseHeaders.set("x-china-import-proxy-latency", String(Date.now() - started));

    return new NextResponse(buffer, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Proxy failed";
    return NextResponse.json(
      { success: false, code: 502, message: `China Import proxy error: ${message}` },
      { status: 502 },
    );
  }
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path = [] } = await ctx.params;
  return proxy(req, path);
}
