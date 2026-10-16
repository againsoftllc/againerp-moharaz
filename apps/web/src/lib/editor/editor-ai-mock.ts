import type { EditorAiContextId } from "@/lib/editor/editor-ai-prompts";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(html: string) {
  if (typeof DOMParser !== "undefined") {
    return (new DOMParser().parseFromString(html, "text/html").body.textContent ?? "").trim();
  }
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function mockProductDescription(vars: Record<string, string | undefined>) {
  const name = vars.product_name?.trim() || "this product";
  const category = vars.category?.trim() || "our catalog";
  const brand = vars.brand?.trim() || "the brand";

  return `<h2>${name}</h2>
<p>Discover ${name} from ${brand} — crafted for shoppers browsing ${category}. Built for everyday use with dependable quality and a clean, modern finish.</p>
<ul>
<li>Premium materials selected for durability</li>
<li>Designed for comfort and long-term value</li>
<li>Backed by ${brand} quality standards</li>
</ul>
<p>Order today and enjoy fast delivery with easy returns.</p>`;
}

function mockShortDescription(vars: Record<string, string | undefined>) {
  const name = vars.product_name?.trim() || "Premium product";
  return `<p>${name} — reliable quality, everyday comfort, and great value for your cart.</p>`;
}

function mockCategoryDescription(vars: Record<string, string | undefined>) {
  const name = vars.category_name?.trim() || "this category";
  return `<h2>Shop ${name}</h2>
<p>Explore our ${name} collection — curated picks, trusted brands, and new arrivals updated regularly.</p>
<p>Filter by price, brand, and rating to find the right match faster.</p>`;
}

function mockBrandDescription(vars: Record<string, string | undefined>) {
  const name = vars.brand_name?.trim() || "Our brand";
  return `<h2>About ${name}</h2>
<p>${name} creates products that balance quality, design, and value. Every item is made to earn repeat customers and long-term trust.</p>
<p>Browse the full range and find your next favorite today.</p>`;
}

function mockFromCustomPrompt(prompt: string, context: EditorAiContextId, currentContent: string) {
  const plain = stripHtml(currentContent);
  if (/translate|bengali|bangla/i.test(prompt)) {
    return `<p>এটি একটি প্রোটোটাইপ AI অনুবাদ। ${plain ? `মূল বিষয়: ${plain.slice(0, 120)}…` : "আপনার কন্টেন্ট অনুবাদ করা হবে।"}</p>`;
  }
  if (/shorten|concise/i.test(prompt)) {
    return `<p>${plain ? plain.slice(0, 140) : "Your content will be shortened here."}</p>`;
  }
  if (/expand|longer|detail/i.test(prompt)) {
    return `<h2>Expanded draft</h2><p>${plain || "Your content"}</p><p>Additional detail generated from your prompt: ${prompt}</p>`;
  }
  if (context.startsWith("product.")) {
    return mockProductDescription({});
  }
  return `<p>Mock AI response for: <em>${prompt}</em></p>${plain ? `<p>${plain}</p>` : ""}`;
}

function resolveMockHtml({
  prompt,
  context,
  variables,
  currentContent = "",
}: {
  prompt: string;
  context: EditorAiContextId;
  variables: Record<string, string | undefined>;
  currentContent?: string;
}) {
  if (context === "product.description") return mockProductDescription(variables);
  if (context === "product.short_description") return mockShortDescription(variables);
  if (context === "category.description") return mockCategoryDescription(variables);
  if (context === "brand.description") return mockBrandDescription(variables);
  return mockFromCustomPrompt(prompt, context, currentContent);
}

export async function runEditorAiMock({
  prompt,
  context,
  variables,
  currentContent = "",
}: {
  prompt: string;
  context: EditorAiContextId;
  variables: Record<string, string | undefined>;
  currentContent?: string;
}): Promise<string> {
  await delay(700);
  return resolveMockHtml({ prompt, context, variables, currentContent });
}

/** Stream preset output into editor — plain text typing, then final HTML. */
export async function streamEditorAiIntoEditor({
  prompt,
  context,
  variables,
  currentContent = "",
  onStream,
}: {
  prompt: string;
  context: EditorAiContextId;
  variables: Record<string, string | undefined>;
  currentContent?: string;
  onStream: (partial: string, done: boolean) => void;
}): Promise<string> {
  await delay(400);
  const fullHtml = resolveMockHtml({ prompt, context, variables, currentContent });
  const plain = stripHtml(fullHtml);
  const chunkSize = 4;

  for (let i = 0; i < plain.length; i += chunkSize) {
    await delay(28);
    const slice = plain.slice(0, Math.min(plain.length, i + chunkSize));
    onStream(slice, false);
  }

  onStream(fullHtml, true);
  return fullHtml;
}
