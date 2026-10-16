import type { ElimCategoryListResponse, ElimLang, ElimPlatform } from "../../types";
import type { ElimClient } from "./client";

/**
 * Category browse helpers.
 * Endpoint may vary by Elim account plan — failures are typed and reusable.
 */
export async function listCategories(
  client: ElimClient,
  opts?: { platform?: ElimPlatform; lang?: ElimLang; parentId?: string | number },
): Promise<ElimCategoryListResponse> {
  const settings = client.getSettings();
  const body: Record<string, unknown> = {
    platform: opts?.platform ?? settings.defaultPlatform,
    lang: opts?.lang ?? settings.defaultLang,
  };
  if (opts?.parentId != null) body.parent_id = opts.parentId;

  try {
    const { data } = await client.request<ElimCategoryListResponse>({
      method: "POST",
      path: "/v1/categories/list",
      body,
    });
    return data;
  } catch {
    const { data } = await client.request<ElimCategoryListResponse>({
      method: "GET",
      path: "/v1/categories",
      query: {
        platform: String(body.platform),
        lang: String(body.lang),
        parent_id: opts?.parentId != null ? String(opts.parentId) : undefined,
      },
    });
    return data;
  }
}
