import { centerClientHeaders, resolveCenterBind } from "@/lib/center/center-bind-server";

export type CenterConversationRequest = {
  module?: string;
  prompt?: string;
  messages?: Array<{ role: string; content: string }>;
  promptStack?: Record<string, string>;
};

export type CenterConversationResult = {
  contractVersion?: string;
  explanation?: string;
  providerId?: string | null;
  modelId?: string | null;
  tokensUsed?: number | null;
  detail?: string;
};

export async function postCenterConversation(
  body: CenterConversationRequest,
): Promise<CenterConversationResult> {
  const bind = await resolveCenterBind();
  if (!bind) {
    throw new Error(
      "Center not configured. Connect Center (Workspace → Modules) or set AGAINERP_CENTER_URL, AGAINERP_CLIENT_ID, AGAINERP_CLIENT_API_KEY.",
    );
  }

  const res = await fetch(`${bind.centerUrl}/agent/v1/conversation`, {
    method: "POST",
    headers: centerClientHeaders(bind),
    body: JSON.stringify({
      contractVersion: "1.0.0",
      module: body.module || "admin_assistant",
      prompt: body.prompt || "",
      messages: body.messages || [],
      promptStack: body.promptStack || {},
    }),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as {
    explanation?: string;
    providerId?: string | null;
    modelId?: string | null;
    tokensUsed?: number | null;
    detail?: string | { msg?: string } | Array<{ msg?: string }>;
  };

  if (!res.ok) {
    let detail = res.statusText;
    if (typeof json.detail === "string") {
      detail = json.detail;
    } else if (Array.isArray(json.detail) && json.detail[0]?.msg) {
      detail = String(json.detail[0].msg);
    } else if (json.detail && typeof json.detail === "object" && "msg" in json.detail && json.detail.msg) {
      detail = String(json.detail.msg);
    }
    throw new Error(detail || `Center AI error (${res.status})`);
  }

  return {
    explanation: json.explanation,
    providerId: json.providerId,
    modelId: json.modelId,
    tokensUsed: json.tokensUsed,
  };
}
