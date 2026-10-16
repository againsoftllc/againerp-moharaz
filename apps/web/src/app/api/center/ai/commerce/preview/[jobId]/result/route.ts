import { NextRequest, NextResponse } from "next/server";

import { getLocalPreviewJob } from "@/lib/commerce/local-ai-commerce-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;
  if (!jobId) {
    return NextResponse.json({ detail: "jobId is required" }, { status: 400 });
  }

  const job = await getLocalPreviewJob(jobId);
  if (!job) {
    return NextResponse.json({ detail: "Preview job not found" }, { status: 404 });
  }

  if (job.status === "failed") {
    return NextResponse.json(
      { detail: job.error?.message ?? "Extraction failed", error: job.error ?? null },
      { status: 502 },
    );
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    canonicalProduct: job.canonicalProduct ?? null,
  });
}
