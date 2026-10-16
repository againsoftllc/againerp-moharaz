import type { BuildComponentContext } from "@/lib/compatibility/types";
import { evaluateCompatibilityRules } from "@/lib/compatibility/rule-evaluator";
import type { CompatibilityRule } from "@/lib/compatibility/types";
import type { PcBuilderProduct, PcBuilderSelection } from "@/lib/builder/types";
import { PC_BUILDER_STEPS, stepAllowsMultiple } from "@/lib/builder/types";
import { selectionsToBuildContext } from "@/lib/mock-data/pc-builder-products";

/** Attribute-based pre-filter before full rule evaluation */
export function attributePrefilter(
  product: PcBuilderProduct,
  selections: PcBuilderSelection[],
): boolean {
  const cpu = selections.find((s) => s.stepId === "cpu");
  const mobo = selections.find((s) => s.stepId === "motherboard");

  if (product.stepId === "motherboard" && cpu) {
    const cpuSocket = cpu.attributes.socket;
    if (cpuSocket && product.attributes.socket !== cpuSocket) return false;
  }

  if (product.stepId === "ram" && mobo) {
    const ramType = mobo.attributes.ram_type;
    if (ramType && product.attributes.type !== ramType) return false;
  }

  return true;
}

export function filterCompatibleProducts(
  products: PcBuilderProduct[],
  selections: PcBuilderSelection[],
  rules: CompatibilityRule[],
): { compatible: PcBuilderProduct[]; hidden: number } {
  const prefiltered = products.filter((p) => attributePrefilter(p, selections));
  const hidden = products.length - prefiltered.length;

  if (selections.length === 0) {
    return { compatible: prefiltered, hidden };
  }

  const baseContext = selectionsToBuildContext(selections);

  const compatible = prefiltered.filter((product) => {
    const multi = stepAllowsMultiple(product.stepId);
    const trialContext: BuildComponentContext[] = multi
      ? [
          ...baseContext,
          {
            componentProfileId: product.attributeProfileId,
            componentName: product.name,
            productId: product.id,
            attributes: product.attributes,
          },
        ]
      : [
          ...baseContext.filter((c) => c.componentProfileId !== product.attributeProfileId),
          {
            componentProfileId: product.attributeProfileId,
            componentName: product.name,
            productId: product.id,
            attributes: product.attributes,
          },
        ];

    const result = evaluateCompatibilityRules(rules, trialContext, "cfg_pc");
    return result.status !== "incompatible";
  });

  return { compatible, hidden };
}

export function evaluateBuildCompatibility(
  selections: PcBuilderSelection[],
  rules: CompatibilityRule[],
) {
  return evaluateCompatibilityRules(rules, selectionsToBuildContext(selections), "cfg_pc");
}
