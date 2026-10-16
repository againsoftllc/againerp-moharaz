import { NextRequest, NextResponse } from "next/server";

import { authHeaderFromRequest } from "@/lib/commerce/catalog-attribute-helpers";
import { createLocalPreviewImport } from "@/lib/commerce/local-ai-commerce-server";
import { extractSupportedProductUrl } from "@/lib/commerce/detect-product-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type PreviewBody = {
  message?: string;
  url?: string;
};

export async function POST(request: NextRequest) {
  const authorization = authHeaderFromRequest(request);
  if (!authorization) {
    return NextResponse.json({ detail: "Sign in so Aladin can scrape on your behalf." }, { status: 401 });
  }

  const body = (await request.json()) as PreviewBody;
  const url = (body.url?.trim() || extractSupportedProductUrl(body.message ?? "") || "").trim();

  if (!url) {
    return NextResponse.json(
      { detail: "No product URL found. Paste a product page link." },
      { status: 400 },
    );
  }

  try {
    const job = await createLocalPreviewImport(url, authorization);
    return NextResponse.json({ job, sourceUrl: url }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not start import preview";
    return NextResponse.json({ detail: message }, { status: 502 });
  }
}
