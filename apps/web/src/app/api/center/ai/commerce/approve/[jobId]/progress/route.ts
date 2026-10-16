import { NextRequest, NextResponse } from "next/server";

import { getCommerceCreateJob } from "@/lib/commerce/commerce-create-jobs";
import { loadWorkflowSessionByCreateJobId } from "@/lib/commerce/commerce-workflow-store";
import { workflowSessionToCreateJob } from "@/lib/commerce/erp-interactive-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const { jobId } = await context.params;

  const persisted = await loadWorkflowSessionByCreateJobId(jobId);
  if (persisted) {
    const view = workflowSessionToCreateJob(persisted);
    return NextResponse.json({
      ...view,
      id: jobId,
      previewJobId: persisted.previewJobId,
      productPageUrl: persisted.productId
        ? `/catalog/products?edit=${persisted.productId}`
        : view.productPageUrl,
    });
  }

  const job = await getCommerceCreateJob(jobId);
  if (!job) {
    return NextResponse.json({ detail: "Create job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: job.id,
    previewJobId: job.previewJobId,
    sessionId: job.sessionId ?? null,
    status: job.status,
    progress: job.progress,
    pendingQuestion: job.pendingQuestion ?? null,
    productId: job.productId ?? null,
    productName: job.productName ?? null,
    productSku: job.productSku ?? null,
    productPageUrl: job.productId ? `/catalog/products?edit=${job.productId}` : null,
    error: job.error ?? null,
  });
}
