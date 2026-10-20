import { toast } from "sonner";
import { apiFetch } from "@/lib/api/client";
import { isPriceExtensionAvailable, readImagesViaExtension, readPageHtmlViaExtension } from "@/lib/browser-extension";
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
        const page = await apiFetch<{ data: { image_urls?: string[]; category_urls?: string[] } }>("/api/v1/catalog/ai/source-page", {
          method: "POST",
          body: JSON.stringify({ url, html: read.html }),
        });
        // the shop's photos are behind the same bot check: fetch them in this browser too, so the import has the pictures
        const imageUrls = page.data.image_urls ?? [];
        if (imageUrls.length) {
          toast.loading("Reading the product photos through your browser…", { id: toastId });
          const photos = await readImagesViaExtension(imageUrls, read.pageUrl || url);
          for (let i = 0; i < photos.images.length; i += 4) {
            await apiFetch("/api/v1/catalog/ai/source-images", {
              method: "POST",
              body: JSON.stringify({ images: photos.images.slice(i, i + 4) }),
            }).catch(() => undefined);
          }
        }
        // the shop's category pages: their filters are how the product's specification profile is set up, and they are behind
        // the same bot check (and built by scripts), so the browser reads them as drawn
        for (const categoryUrl of page.data.category_urls ?? []) {
          toast.loading("Reading the shop's filters through your browser…", { id: toastId });
          const category = await readPageHtmlViaExtension(categoryUrl, { rendered: true });
          if (!category.ok) continue;
          await apiFetch("/api/v1/catalog/ai/source-page", {
            method: "POST",
            body: JSON.stringify({ url: categoryUrl, html: category.html }),
          }).catch(() => undefined);
        }
        toast.success("Source page read — starting the AI fill", { id: toastId });
      } catch (err) {
        toast.warning(
          `Your browser read the page, but it couldn't be passed on (${err instanceof Error ? err.message : "error"}) — the server will try itself`,
          { id: toastId },
        );
      }
    } else if (/needs your OK/i.test(read.error)) {
      // Chrome has to be told once that the extension may read this shop: the extension opened its Allow tab. Wait for
      // that instead of starting an AI run that is bound to fail on a protected shop.
      toast.warning(read.error, { id: toastId, duration: 20000 });
      return;
    } else {
      toast.warning(`Your browser couldn't read the source page (${read.error}) — the server will try itself`, { id: toastId });
    }
  }
  useAiChatStore.getState().startProductTask({ id: product.id, name: product.name }, onDone);
}
