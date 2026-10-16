import { NextRequest, NextResponse } from "next/server";

import {
  approveCommerceImport,
  completeCommerceErpImport,
  failCommerceErpImport,
} from "@/lib/commerce/center-ai-commerce-server";
import { getLocalPreviewJob } from "@/lib/commerce/local-ai-commerce-server";
import { authHeaderFromRequest } from "@/lib/commerce/catalog-attribute-helpers";
import {
  createCommerceCreateJob,
  getCommerceCreateJob,
  syncCreateJobFromWorkflow,
} from "@/lib/commerce/commerce-create-jobs";
import {
  startInteractiveWorkflow,
  workflowSessionToCreateJob,
} from "@/lib/commerce/erp-interactive-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type ApproveBody = {
  preview_job_id?: string;
  canonical?: Record<string, unknown>;
};

async function runApprovedCreateJob(
  createJobId: string,
  previewJobId: string,
  canonical: Record<string, unknown>,
  authorization: string,
) {
  await syncCreateJobFromWorkflow(createJobId, {
    sessionId: "",
    status: "running",
    progress: { message: "Notifying Center of approval…", percent: 4 },
    previewJobId,
  });

  try {
    try {
      await approveCommerceImport(previewJobId);
    } catch (err) {
      // Center approve is bookkeeping only — do not block ERP create on hang/409.
      const message = err instanceof Error ? err.message : "Center approve failed";
      await syncCreateJobFromWorkflow(createJobId, {
        sessionId: "",
        status: "running",
        progress: {
          message: `Center approve skipped (${message.slice(0, 120)}). Starting ERP create…`,
          percent: 6,
        },
        previewJobId,
      });
    }

    await syncCreateJobFromWorkflow(createJobId, {
      sessionId: "",
      status: "running",
      progress: { message: "Matching brand, category, and specs…", percent: 10 },
      previewJobId,
    });

    const session = await startInteractiveWorkflow({
      createJobId,
      previewJobId,
      canonical,
      authorization,
    });

    const jobView = workflowSessionToCreateJob(session);
    await syncCreateJobFromWorkflow(createJobId, { ...jobView, previewJobId });

    if (session.status === "completed" && session.productId) {
      try {
        await completeCommerceErpImport(previewJobId, {
          productId: session.productId,
          sku: session.productSku,
          name: session.productName,
          summary: {
            productId: session.productId,
            productPageUrl: `/catalog/products?edit=${session.productId}`,
            name: session.productName,
            sku: session.productSku,
            interactive: true,
            decisions: session.checkpoint.decisions,
          },
        });
      } catch {
        /* best-effort Center bookkeeping */
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERP product create failed";
    try {
      await failCommerceErpImport(previewJobId, message);
    } catch {
      /* best-effort */
    }
    await syncCreateJobFromWorkflow(createJobId, {
      sessionId: "",
      status: "failed",
      progress: { message, percent: 100 },
      error: message,
      previewJobId,
    });
  }
}

export async function POST(request: NextRequest) {
  const authorization = authHeaderFromRequest(request);
  if (!authorization) {
    return NextResponse.json({ detail: "Authorization required" }, { status: 401 });
  }

  const body = (await request.json()) as ApproveBody;
  const previewJobId = body.preview_job_id?.trim() ?? "";
  if (!previewJobId) {
    return NextResponse.json({ detail: "preview_job_id is required" }, { status: 400 });
  }

  let canonical = body.canonical;
  if (!canonical) {
    const preview = await getLocalPreviewJob(previewJobId);
    canonical = preview?.canonicalProduct ?? undefined;
  }

  if (!canonical) {
    return NextResponse.json({ detail: "Preview job has no canonical product data" }, { status: 422 });
  }

  const createJob = await createCommerceCreateJob(previewJobId);

  // Run until first pause/complete in-request. Vercel `after()` was dying mid-flight
  // (stuck on Center approve) so progress never advanced past the starter message.
  await runApprovedCreateJob(createJob.id, previewJobId, canonical, authorization);

  const job = await getCommerceCreateJob(createJob.id);
  if (!job) {
    return NextResponse.json(
      { createJobId: createJob.id, previewJobId, status: "failed", detail: "Create job missing after run" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    createJobId: createJob.id,
    previewJobId,
    id: createJob.id,
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
