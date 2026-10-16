import { planPcBuild } from "@/lib/builder/ai/build-planner";
import type { AiPcBuildResult } from "@/lib/builder/ai/types";
import { answersToPrompt } from "@/lib/builder/wizard/question-engine";
import type { WizardAnswers } from "@/lib/builder/wizard/types";

/** AI recommendation from wizard answers with compatibility + alternatives */
export async function recommendFromWizardAnswers(answers: WizardAnswers): Promise<AiPcBuildResult> {
  const prompt = answersToPrompt(answers);
  const includeMonitor = answers.accessories.includes("monitor") && !answers.accessories.includes("none");

  let result = planPcBuild(prompt);

  if (!includeMonitor) {
    result = {
      ...result,
      selections: result.selections.filter((s) => s.stepId !== "monitor"),
      totalPrice: result.selections
        .filter((s) => s.stepId !== "monitor")
        .reduce((sum, s) => sum + s.price, 0),
    };
  }

  return result;
}
