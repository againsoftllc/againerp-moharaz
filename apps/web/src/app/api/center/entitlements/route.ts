import { NextResponse } from "next/server";
import type { CenterEntitlements } from "@/lib/center/entitlements";
import { resolveCenterBind, centerClientHeaders } from "@/lib/center/center-bind-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-side proxy: AgainERP admin → Center consumer entitlements.
 * Credentials never leave the server.
 */
export async function GET() {
  const bind = await resolveCenterBind();

  if (!bind) {
    return NextResponse.json(
      {
        bound: false,
        detail:
          "Center not configured. Use Workspace → Modules → Connect Center with a bootstrap token, or set AGAINERP_CENTER_URL, AGAINERP_CLIENT_ID, AGAINERP_CLIENT_API_KEY.",
      },
      { status: 200 },
    );
  }

  try {
    const res = await fetch(`${bind.centerUrl}/api/v1/client/entitlements`, {
      headers: centerClientHeaders(bind),
      cache: "no-store",
    });

    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = (await res.json()) as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        /* ignore */
      }
      return NextResponse.json(
        { bound: true, error: true, detail, status: res.status },
        { status: 200 },
      );
    }

    const data = (await res.json()) as CenterEntitlements;
    return NextResponse.json({ bound: true, error: false, data });
  } catch (err) {
    return NextResponse.json(
      {
        bound: true,
        error: true,
        detail: err instanceof Error ? err.message : "Center unreachable",
      },
      { status: 200 },
    );
  }
}
