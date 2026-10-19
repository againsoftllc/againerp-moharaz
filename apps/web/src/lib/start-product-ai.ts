import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { isPriceExtensionAvailable, readPageHtmlViaExtension } from "@/lib/browser-extension";
import { useAiChatStore } from "@/lib/store/ai-chat-store";
import type { Product } from "@/lib/mock-data/products";

/**
 * Starts the AI "fill this draft from its source link" task. Shops that refuse the server (Ryans, Cloudflare-protected
 * ones) open fine in a browser, so when the Send to AgainERP extension is installed it reads the source page first and
 * hands the HTML to the server — the AI then works from that copy instead of fetching the shop itself. If the browser
 * can't read it either, the AI starts anyway and the server tries on its own.
 */
export async function startProductAiFill(product: Product, onDone: () => void): Promise<void> {
  const url = product.sourceUrl?.trim();
  if (url && /^https?:\/\//i.test(url) && isPriceExtensionAvailable()) {
    const toastId = toast.loading("Reading the source page through your browser…");
    const read = await readPageHtmlViaExtension(url);
    if (read.ok) {
      try {
        await apiFetch("/api/v1/catalog/ai/source-page", {
          method: "POST",
          body: JSON.stringify({ url, html: read.html }),
        });
        toast.success("Source page read — starting the AI fill", { id: toastId });
      } catch (err) {
        toast.warning(
          `Your browser read the page, but it couldn't be passed on (${err instanceof Error ? err.message : "error"}) — the server will try itself`,
          { id: toastId },
        );
      }
    } else {
      toast.warning(`Your browser couldn't read the source page (${read.error}) — the server will try itself`, { id: toastId });
    }
  }
  useAiChatStore.getState().startProductTask({ id: product.id, name: product.name }, onDone);
}
