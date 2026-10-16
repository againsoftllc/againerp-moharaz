import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ path: string[] }> };

/** Storefront static assets (/images/...) for admin brand preview. */
function storefrontOrigin(): string {
  const explicit = process.env.STOREFRONT_PROXY_TARGET?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const pub = process.env.NEXT_PUBLIC_STOREFRONT_URL?.trim().replace(/\/$/, "") || "";
  // Browser-facing localhost is the host machine — from Docker web use host.docker.internal.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(pub)) {
    try {
      const u = new URL(pub);
      return `http://host.docker.internal${u.port ? `:${u.port}` : ""}`;
    } catch {
      return "http://host.docker.internal:3010";
    }
  }
  if (pub) return pub;
  return "http://host.docker.internal:3010";
}

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const upstreamPath = `/images/${path.map(encodeURIComponent).join("/")}`;
  const target = new URL(upstreamPath, `${storefrontOrigin()}/`);
  target.search = req.nextUrl.search;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: { Accept: req.headers.get("Accept") || "*/*" },
      cache: "no-store",
      redirect: "manual",
    });
    const out = new Headers();
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "transfer-encoding" || lower === "connection" || lower === "content-encoding") {
        return;
      }
      out.set(key, value);
    });
    out.set("Cache-Control", "public, max-age=300");
    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storefront unreachable";
    return NextResponse.json(
      { detail: `Cannot reach storefront images at ${storefrontOrigin()} (${message})` },
      { status: 502 },
    );
  }
}

export const GET = handle;
export const HEAD = handle;
