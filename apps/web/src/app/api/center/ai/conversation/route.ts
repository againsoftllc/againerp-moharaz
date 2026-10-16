import { NextResponse } from "next/server";
import { postCenterConversation } from "@/lib/center/center-ai-conversation-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * AgainERP admin → Center `/agent/v1/conversation` (OpenAI via platform Settings key).
 * Credentials stay on the server.
 */
export async function POST(req: Request) {
  let body: {
    module?: string;
    prompt?: string;
    messages?: Array<{ role: string; content: string }>;
    promptStack?: Record<string, string>;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ detail: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = (body.prompt || "").trim();
  const messages = body.messages || [];
  if (!prompt && messages.length === 0) {
    return NextResponse.json({ detail: "prompt or messages required" }, { status: 400 });
  }

  try {
    const result = await postCenterConversation({
      module: body.module || "admin_assistant",
      prompt,
      messages,
      promptStack: body.promptStack,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Center AI request failed";
    const status =
      message.includes("AI access disabled") || message.includes("403")
        ? 403
        : message.includes("not configured")
          ? 503
          : 502;
    return NextResponse.json({ detail: message }, { status });
  }
}
