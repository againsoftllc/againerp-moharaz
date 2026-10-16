import type { PendingQuestion } from "@/lib/commerce/commerce-workflow-types";

export type ParsedCommerceAnswer = {
  choiceId?: string;
  action: "yes" | "no" | "choice" | "text";
  raw: string;
};

export function parseCommerceAnswer(input: string, question: PendingQuestion): ParsedCommerceAnswer {
  const raw = input.trim();
  const lower = raw.toLowerCase();

  if (question.options?.length) {
    for (const option of question.options) {
      if (lower === option.id.toLowerCase() || lower === option.label.toLowerCase()) {
        return { choiceId: option.id, action: "choice", raw };
      }
    }

    const numbered = /^(\d+)[.)]?\s*$/.exec(lower);
    if (numbered) {
      const index = Number(numbered[1]) - 1;
      if (index >= 0 && index < question.options.length) {
        return { choiceId: question.options[index].id, action: "choice", raw };
      }
    }

    for (const option of question.options) {
      const label = option.label.toLowerCase();
      if (lower.includes(label) || label.includes(lower)) {
        return { choiceId: option.id, action: "choice", raw };
      }
    }
  }

  if (/^(yes|y|yeah|yep|sure|ok|okay|create|go ahead|do it|please|approve)$/i.test(lower)) {
    return { action: "yes", raw };
  }

  if (/^(no|n|nope|cancel|skip|don't|dont|stop)$/i.test(lower)) {
    return { action: "no", raw };
  }

  if (/create new|new (attribute )?profile|new attribute/i.test(lower)) {
    return { choiceId: "create_new", action: "choice", raw };
  }

  if (/custom spec|specs only|keep as custom|no profile|skip profile/i.test(lower)) {
    return { choiceId: "custom_specs", action: "choice", raw };
  }

  return { action: "text", raw };
}
