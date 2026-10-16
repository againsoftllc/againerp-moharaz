/**
 * Maps an in-app module link from an AI reply ("Open in Website" → /website/products?edit=<id>,
 * "Open in Sales" → /sales?open=<id>, …) to the matching `doc://<type>/<id>` link, so the chat
 * can open that record in its own drawer instead of leaving the conversation.
 *
 * Mirrors the `path` / `doc_link` pairs the AI tools return (apps/api/app/services/ai/tools/).
 * Kept free of the drawer components so markdown-lite can import it cheaply.
 */

const PATH_DOC_RULES: { path: string; param: string; type: (params: URLSearchParams) => string }[] = [
  { path: "/website/products", param: "edit", type: () => "product" },
  {
    path: "/sales",
    param: "open",
    type: (params) => (params.get("filter") === "quotations" ? "sales_quotation" : "sales_order"),
  },
  { path: "/purchase/orders", param: "open", type: () => "purchase_order" },
  { path: "/crm/tasks", param: "open", type: () => "task" },
  { path: "/crm/leads", param: "open", type: () => "lead" },
  { path: "/crm/deals", param: "open", type: () => "deal" },
];

/** `doc://<type>/<id>` for a known module deep link, else null. */
export function pathToDocLink(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href, "http://local");
  } catch {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, "") || "/";
  for (const rule of PATH_DOC_RULES) {
    if (path !== rule.path) continue;
    const id = url.searchParams.get(rule.param);
    if (!id) return null;
    return `doc://${rule.type(url.searchParams)}/${encodeURIComponent(id)}`;
  }
  return null;
}
