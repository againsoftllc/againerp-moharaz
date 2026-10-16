import { NextRequest, NextResponse } from "next/server";

import {
  completeCommerceErpImport,
  failCommerceErpImport,
} from "@/lib/commerce/center-ai-commerce-server";
import { authHeaderFromRequest } from "@/lib/commerce/catalog-attribute-helpers";
import { syncCreateJobFromWorkflow } from "@/lib/commerce/commerce-create-jobs";
import { loadWorkflowSessionByCreateJobId } from "@/lib/commerce/commerce-workflow-store";
import {
  resumeInteractiveWorkflow,
  workflowSessionToCreateJob,
} from "@/lib/commerce/erp-interactive-workflow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

type ResumeBody = {
  create_job_id?: string;
  session_id?: string;
  answer?: string;
};

const completedErp = new Set<string>();

export async function POST(request: NextRequest) {
  const authorization = authHeaderFromRequest(request);
  if (!authorization) {
    return NextResponse.json({ detail: "Authorization required" }, { status: 401 });
  }

  const body = (await request.json()) as ResumeBody;
  const answer = body.answer?.trim() ?? "";
  if (!answer) {
    return NextResponse.json({ detail: "answer is required" }, { status: 400 });
  }

  let sessionId = body.session_id?.trim() ?? "";
  const createJobId = body.create_job_id?.trim() ?? "";

  if (!sessionId && createJobId) {
    const existing = await loadWorkflowSessionByCreateJobId(createJobId);
    sessionId = existing?.id ?? "";
  }

  if (!sessionId) {
    return NextResponse.json({ detail: "session_id or create_job_id is required" }, { status: 400 });
  }

  try {
    const session = await resumeInteractiveWorkflow({
      sessionId,
      authorization,
      answerText: answer,
    });

    const jobView = workflowSessionToCreateJob(session);
    if (createJobId) {
      await syncCreateJobFromWorkflow(createJobId, { ...jobView, previewJobId: session.previewJobId });
    }

    if (session.status === "completed" && session.productId && !completedErp.has(session.previewJobId)) {
      completedErp.add(session.previewJobId);
      try {
        await completeCommerceErpImport(session.previewJobId, {
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
        /* best-effort Center bookkeeping — the product is already created */
      }
    }

    return NextResponse.json({
      ...jobView,
      id: session.createJobId,
      sessionId: session.id,
      createJobId: session.createJobId,
      productPageUrl: session.productId
        ? `/catalog/products?edit=${session.productId}`
        : jobView.productPageUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not resume workflow";
    if (createJobId) {
      const existing = await loadWorkflowSessionByCreateJobId(createJobId);
      if (existing) {
        try {
          await failCommerceErpImport(existing.previewJobId, message);
        } catch {
          /* best-effort */
        }
      }
      await syncCreateJobFromWorkflow(createJobId, {
        sessionId,
        status: "failed",
        progress: { message, percent: 100 },
        error: message,
      });
    }
    return NextResponse.json({ detail: message }, { status: 409 });
  }
}
