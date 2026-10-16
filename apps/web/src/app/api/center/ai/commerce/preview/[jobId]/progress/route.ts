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

  // Extraction already ran to completion in the POST handler — this is
  // just reporting the stored result, not a live async job.
  return NextResponse.json({
    id: job.id,
    status: job.status,
    progress: {
      step: job.status,
      percent: job.status === "preview_ready" ? 100 : 100,
      message: job.status === "failed" ? job.error?.message ?? "Extraction failed" : "Extraction complete",
    },
    error: job.error ?? null,
  });
}
