import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Edge Agent optional notify — admin clients should re-fetch /api/center/entitlements.
 * This endpoint exists so agents can poke local ERP without auth in Phase 2 (dev only).
 */
export async function POST() {
  return NextResponse.json({ ok: true, action: "reload_entitlements" });
}
