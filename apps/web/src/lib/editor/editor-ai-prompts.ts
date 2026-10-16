/** Editor AI pre-prompts — resolved from Settings → AI → Prompts (mock in prototype). */

export type EditorAiContextId =
  | "product.description"
  | "product.short_description"
  | "category.description"
  | "brand.description"
  | "generic";

export type EditorAiPrePrompt = {
  id: string;
  context: EditorAiContextId;
  /** Settings path shown in UI — maps to `ai_prompts` in production */
  settingsPath: string;
  label: string;
  systemPrompt: string;
  userPromptTemplate: string;
};

export const EDITOR_AI_PRE_PROMPTS: EditorAiPrePrompt[] = [
  {
    id: "product-description-v1",
    context: "product.description",
    settingsPath: "Settings → AI → Prompts → Product description",
    label: "Generate product description",
    systemPrompt:
      "You are an ecommerce copywriter. Write persuasive, SEO-friendly HTML product descriptions. Use h2, p, and ul only. No inline styles.",
    userPromptTemplate:
      "Write a full product description for {{product_name}}. Category: {{category}}. Brand: {{brand}}. Highlight key benefits, materials, and use cases.",
  },
  {
    id: "product-short-description-v1",
    context: "product.short_description",
    settingsPath: "Settings → AI → Prompts → Product short description",
    label: "Generate short description",
    systemPrompt:
      "You write concise listing summaries under 160 characters when possible. Output plain text or a single HTML paragraph.",
    userPromptTemplate:
      "Write a short listing summary for {{product_name}} ({{category}}, {{brand}}).",
  },
  {
    id: "category-description-v1",
    context: "category.description",
    settingsPath: "Settings → AI → Prompts → Category description",
    label: "Generate category description",
    systemPrompt:
      "You write category landing page copy. Use h2 and p tags. Friendly, helpful tone.",
    userPromptTemplate:
      "Write a category page description for {{category_name}}. Explain what shoppers will find and why it matters.",
  },
  {
    id: "brand-description-v1",
    context: "brand.description",
    settingsPath: "Settings → AI → Prompts → Brand description",
    label: "Generate brand description",
    systemPrompt:
      "You write brand story copy for ecommerce. Use h2 and p tags. Emphasize values and product quality.",
    userPromptTemplate:
      "Write a brand page description for {{brand_name}}. Include heritage, quality, and shopper promise.",
  },
  {
    id: "generic-content-v1",
    context: "generic",
    settingsPath: "Settings → AI → Prompts → Generic rich text",
    label: "Improve content",
    systemPrompt:
      "You improve rich text content. Keep valid HTML. Preserve meaning unless asked to rewrite.",
    userPromptTemplate:
      "Improve the following content for clarity and readability:\n\n{{current_content}}",
  },
];

export function mergePromptVariables(
  template: string,
  variables: Record<string, string | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = variables[key]?.trim();
    return value || `[${key}]`;
  });
}
