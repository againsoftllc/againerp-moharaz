import {
  type ApiBrandListResponse,
  type ApiBrandResponse,
  brandToApiCreatePayload,
} from "@/lib/api/catalog-brands";
import {
  type ApiCatalogCategory,
  type ApiCategoryListResponse,
  type ApiCategoryResponse,
  categoryToApiCreatePayload,
} from "@/lib/api/catalog-categories";
import { type ApiProductDetailResponse, productToApiPayload } from "@/lib/api/catalog-products";
import { parseCommerceAnswer, type ParsedCommerceAnswer } from "@/lib/commerce/commerce-answer-parser";
import {
  applyProductSpecificationValues,
  canonicalToAttributePlan,
  deriveAttributeProfileName,
  provisionProductSpecifications,
  specificationGroups,
} from "@/lib/commerce/commerce-attribute-provision";
import {
  listAttributeProfilesLite,
  pickBestAttributeProfile,
} from "@/lib/commerce/catalog-attribute-helpers";
import { consumerAuthorizedFetch } from "@/lib/commerce/catalog-consumer-server";
import type {
  CommerceWorkflowSession,
  PendingQuestion,
  WorkflowCheckpoint,
} from "@/lib/commerce/commerce-workflow-types";
import {
  createWorkflowSession,
  loadWorkflowSession,
  loadWorkflowSessionByCreateJobId,
  saveWorkflowSession,
} from "@/lib/commerce/commerce-workflow-store";

/** MVP audit hooks — no-ops in AgainERP Aladin slice (audit journal deferred). */
const createErpAuditBridge = (_mvpRunId: string) => ({
  info: (..._args: unknown[]) => undefined,
  action: (..._args: unknown[]) => undefined,
  decision: (..._args: unknown[]) => undefined,
  warning: (..._args: unknown[]) => undefined,
  error: (..._args: unknown[]) => undefined,
  success: (..._args: unknown[]) => undefined,
  flush: async () => undefined,
});
const markRunAwaitingUser = async (..._args: unknown[]) => undefined;
const markRunCompleted = async (..._args: unknown[]) => undefined;
const markRunFailed = async (..._args: unknown[]) => undefined;
const recordUserDecision = async (..._args: unknown[]) => undefined;

type CanonicalProduct = Record<string, unknown>;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function productName(canonical: CanonicalProduct): string {
  return (typeof canonical.name === "string" && canonical.name.trim()) || "Untitled product";
}

function brandNameFromCanonical(canonical: CanonicalProduct): string | undefined {
  return ((canonical.brand as { name?: string } | undefined)?.name as string | undefined)?.trim() || undefined;
}

function categoryPathFromCanonical(canonical: CanonicalProduct): string[] {
  return ((canonical.category as { path?: string[] } | undefined)?.path as string[] | undefined) ?? [];
}

function specsToCustomJson(canonical: CanonicalProduct): string {
  const rows = specificationGroups(canonical).flatMap((group) =>
    (group.items ?? []).map((item: { label?: string; value?: string }) => ({
      group: group.group ?? "Specifications",
      field: item.label ?? "Field",
      value: item.value ?? "",
    })),
  );
  if (rows.length) return JSON.stringify(rows);
  const attrs = (canonical.attributes as Array<{ group?: string; name?: string; value?: string }>) ?? [];
  if (attrs.length) {
    return JSON.stringify(
      attrs.map((row) => ({
        group: row.group ?? "Attributes",
        field: row.name ?? "Field",
        value: row.value ?? "",
      })),
    );
  }
  return "[]";
}

function imageUrlsFromCanonical(canonical: CanonicalProduct): string[] {
  const raw = [
    ...((canonical.images as Array<{ url?: string }>) ?? []),
    ...((canonical.gallery as Array<{ url?: string }>) ?? []),
  ];
  const urls = raw.map((item) => (typeof item === "string" ? item : item.url)).filter(Boolean) as string[];
  return [...new Set(urls)];
}

function categoryLabel(row: ApiCatalogCategory, categories: ApiCatalogCategory[]): string {
  const names: string[] = [row.name];
  let parentId = row.parent_id;
  let guard = 0;
  while (parentId && guard < 8) {
    const parent = categories.find((item) => item.id === parentId);
    if (!parent) break;
    names.unshift(parent.name);
    parentId = parent.parent_id;
    guard += 1;
  }
  return names.join(" › ");
}

async function uniqueProductSlug(base: string, authorization: string): Promise<string> {
  const root = slugify(base) || "product";
  let candidate = root;
  let n = 2;
  while (true) {
    const check = await consumerAuthorizedFetch<{ available: boolean }>(
      `/api/v1/website/products/slug/check?slug=${encodeURIComponent(candidate)}`,
      authorization,
    );
    if (check.available) return candidate;
    candidate = `${root}-${n}`;
    n += 1;
  }
}

function generateSku(canonical: CanonicalProduct, slug: string): string {
  const fromCanonical = typeof canonical.sku === "string" ? canonical.sku.trim() : "";
  if (fromCanonical) return fromCanonical.slice(0, 64);
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${slug.slice(0, 24).toUpperCase().replace(/-/g, "")}-${suffix}`;
}

function pause(
  session: CommerceWorkflowSession,
  question: PendingQuestion,
  message: string,
  percent: number,
): CommerceWorkflowSession {
  session.status = "awaiting_user";
  session.pendingQuestion = question;
  session.progress = { message, percent };
  session._audit?.decision(`erp.${question.type}`, question.message, { questionId: question.id });
  void session._audit?.flush();
  if (session.mvpRunId) {
    void markRunAwaitingUser(session.mvpRunId, question.message);
  }
  return session;
}

function recordDecision(session: CommerceWorkflowSession, question: PendingQuestion, answer: ParsedCommerceAnswer) {
  session.checkpoint.decisions.push({
    questionId: question.id,
    answer: answer.raw,
    choiceId: answer.choiceId,
  });
}

async function createBrand(brandName: string, authorization: string) {
  const slug = slugify(brandName) || "brand";
  const created = await consumerAuthorizedFetch<ApiBrandResponse>("/api/v1/website/brands", authorization, {
    method: "POST",
    body: JSON.stringify(brandToApiCreatePayload({ name: brandName, slug, active: true })),
  });
  return created.data;
}

async function createCategory(segment: string, parentId: string | null, authorization: string, categories: ApiCatalogCategory[]) {
  const slugBase = slugify(segment) || "category";
  let slug = slugBase;
  let suffix = 2;
  while (categories.some((row) => row.slug === slug)) {
    slug = `${slugBase}-${suffix}`;
    suffix += 1;
  }
  const created = await consumerAuthorizedFetch<ApiCategoryResponse>("/api/v1/website/categories", authorization, {
    method: "POST",
    body: JSON.stringify(
      categoryToApiCreatePayload({
        name: segment,
        slug,
        parentId,
        active: true,
      }),
    ),
  });
  return created.data;
}

async function stepBrand(
  session: CommerceWorkflowSession,
  authorization: string,
  categories?: ApiCatalogCategory[],
): Promise<CommerceWorkflowSession | null> {
  void categories;
  const canonical = session.canonical;
  const checkpoint = session.checkpoint;
  const brandName = brandNameFromCanonical(canonical);

  if (!brandName) {
    checkpoint.step = "category";
    session.progress = { message: "No brand detected — moving on to category.", percent: 20 };
    session._audit?.info("erp.brand", "No brand detected — skipped");
    return null;
  }

  if (checkpoint.brandId) {
    checkpoint.step = "category";
    return null;
  }

  session.progress = { message: `Checking Brand... (${brandName})`, percent: 15 };
  const list = await consumerAuthorizedFetch<ApiBrandListResponse>("/api/v1/website/brands", authorization);
  const exact = list.data.find((row) => row.name.toLowerCase() === brandName.toLowerCase());
  if (exact) {
    checkpoint.brandId = exact.id;
    checkpoint.brandName = exact.name;
    checkpoint.step = "category";
    session._audit?.action("erp.brand", `Brand resolved: ${exact.name}`, {
      brandId: exact.id,
      brandName: exact.name,
      created: false,
    });
    return null;
  }

  return pause(
    session,
    {
      id: `q_brand_${Date.now()}`,
      type: "brand_create",
      message: `I couldn't find **${brandName}** in your brand list. Should I create it?`,
      options: [
        { id: "yes", label: "Yes, create it" },
        { id: "no", label: "No, skip brand" },
      ],
      context: { brandName },
    },
    `Waiting for your answer about brand "${brandName}"…`,
    18,
  );
}

async function stepCategory(
  session: CommerceWorkflowSession,
  authorization: string,
): Promise<{ session: CommerceWorkflowSession | null; categories: ApiCatalogCategory[] }> {
  const path = categoryPathFromCanonical(session.canonical);
  const checkpoint = session.checkpoint;

  if (!path.length) {
    checkpoint.step = "attributes";
    session.progress = { message: "No category detected — moving on to attributes.", percent: 30 };
    return { session: null, categories: [] };
  }

  const list = await consumerAuthorizedFetch<ApiCategoryListResponse>("/api/v1/website/categories", authorization);
  const categories = [...list.data];

  while (checkpoint.categoryPathIndex < path.length) {
    const segment = path[checkpoint.categoryPathIndex];
    session.progress = {
      message: `Checking Category... (${path.slice(0, checkpoint.categoryPathIndex + 1).join(" › ")})`,
      percent: 25 + checkpoint.categoryPathIndex * 5,
    };

    const exact = categories.find(
      (row) => row.name.toLowerCase() === segment.toLowerCase() && row.parent_id === checkpoint.parentCategoryId,
    );
    if (exact) {
      checkpoint.parentCategoryId = exact.id;
      checkpoint.categoryId = exact.id;
      checkpoint.categoryName = exact.name;
      checkpoint.categoryPathIndex += 1;
      session._audit?.action("erp.category", `Category resolved: ${exact.name}`, {
        categoryId: exact.id,
        created: false,
      });
      continue;
    }

    const sameName = categories.filter((row) => row.name.toLowerCase() === segment.toLowerCase());
    if (sameName.length > 1) {
      const pending = session.pendingQuestion;
      if (pending?.type === "category_pick" && pending.context.segment === segment) {
        return { session, categories };
      }
      return {
        session: pause(
          session,
          {
            id: `q_cat_pick_${Date.now()}`,
            type: "category_pick",
            message: `I found multiple categories matching **${segment}**. Which one should I use?`,
            options: sameName.map((row) => ({
              id: row.id,
              label: categoryLabel(row, categories),
            })),
            context: { segment, parentCategoryId: checkpoint.parentCategoryId, pathIndex: checkpoint.categoryPathIndex },
          },
          `Waiting for your category choice for "${segment}"…`,
          32,
        ),
        categories,
      };
    }

    if (sameName.length === 1 && sameName[0].parent_id !== checkpoint.parentCategoryId) {
      const row = sameName[0];
      const pending = session.pendingQuestion;
      if (pending?.type === "category_pick" && pending.context.segment === segment) {
        return { session, categories };
      }
      return {
        session: pause(
          session,
          {
            id: `q_cat_pick_single_${Date.now()}`,
            type: "category_pick",
            message: `**${segment}** exists elsewhere in your catalog. Should I use **${categoryLabel(row, categories)}**?`,
            options: [
              { id: row.id, label: `Use ${categoryLabel(row, categories)}` },
              { id: "create_new", label: `Create new under ${path.slice(0, checkpoint.categoryPathIndex).join(" › ") || "root"}` },
            ],
            context: { segment, parentCategoryId: checkpoint.parentCategoryId, pathIndex: checkpoint.categoryPathIndex },
          },
          `Waiting for your category choice for "${segment}"…`,
          32,
        ),
        categories,
      };
    }

    const pending = session.pendingQuestion;
    if (pending?.type === "category_create" && pending.context.segment === segment) {
      return { session, categories };
    }

    return {
      session: pause(
        session,
        {
          id: `q_cat_create_${Date.now()}`,
          type: "category_create",
          message: `Category **${segment}** wasn't found${checkpoint.parentCategoryId ? " in the current branch" : ""}. Should I create it?`,
          options: [
            { id: "yes", label: "Yes, create it" },
            { id: "no", label: "No, skip this level" },
          ],
          context: {
            segment,
            parentCategoryId: checkpoint.parentCategoryId,
            pathIndex: checkpoint.categoryPathIndex,
          },
        },
        `Waiting for your answer about category "${segment}"…`,
        30,
      ),
      categories,
    };
  }

  checkpoint.step = "attributes";
  return { session: null, categories };
}

async function stepAttributes(session: CommerceWorkflowSession, authorization: string): Promise<CommerceWorkflowSession | null> {
  const checkpoint = session.checkpoint;

  if (checkpoint.customSpecsJson) {
    checkpoint.step = "images";
    return null;
  }

  if (checkpoint.attributeStrategy === "custom") {
    checkpoint.customSpecsJson = specsToCustomJson(session.canonical);
    checkpoint.step = "images";
    session.progress = { message: "Storing specifications as custom fields (no profile).", percent: 48 };
    return null;
  }

  const groups = specificationGroups(session.canonical);
  if (!groups.length) {
    checkpoint.customSpecsJson = "[]";
    checkpoint.attributeStrategy = "custom";
    checkpoint.step = "images";
    session.progress = { message: "No specification table on source page — skipping attributes.", percent: 48 };
    return null;
  }

  if (session.pendingQuestion?.type === "attribute_profile_pick") {
    return session;
  }

  if (!checkpoint.attributeStrategy) {
    const plan = canonicalToAttributePlan(session.canonical);
    const groupCount = plan.length;
    const fieldCount = plan.reduce((total, group) => total + group.attributes.length, 0);
    const profiles = await listAttributeProfilesLite(authorization);
    const suggested = pickBestAttributeProfile(profiles, {
      name: productName(session.canonical),
      brand: brandNameFromCanonical(session.canonical),
      text: plan.map((g) => `${g.name} ${g.attributes.map((a) => a.name).join(" ")}`).join(" "),
    });
    const newProfileName = deriveAttributeProfileName(session.canonical, checkpoint.categoryName);

    const options: Array<{ id: string; label: string; description?: string }> = [];

    if (suggested) {
      options.push({
        id: suggested.id,
        label: `Use existing profile: ${suggested.name} (recommended)`,
        description: `Add ${fieldCount} fields across ${groupCount} groups`,
      });
    }

    for (const profile of profiles.filter((row) => row.id !== suggested?.id).slice(0, 4)) {
      options.push({
        id: profile.id,
        label: `Use existing profile: ${profile.name}`,
      });
    }

    options.push({
      id: "create_new",
      label: `Create new profile: ${newProfileName}`,
      description: `${groupCount} groups, ${fieldCount} fields`,
    });
    options.push({
      id: "custom_specs",
      label: "Custom specs only (no attribute profile)",
    });

    return pause(
      session,
      {
        id: `q_attr_profile_${Date.now()}`,
        type: "attribute_profile_pick",
        message: `Found **${groupCount} specification group${groupCount === 1 ? "" : "s"}** with **${fieldCount} field${fieldCount === 1 ? "" : "s"}** from the source page. Which attribute profile should I add them to?`,
        options,
        context: {
          suggestedProfileId: suggested?.id ?? null,
          newProfileName,
          groupCount,
          fieldCount,
        },
      },
      "Waiting for your attribute profile choice…",
      44,
    );
  }

  session.progress = { message: "Creating attribute profile, groups, and fields…", percent: 45 };

  try {
    const result = await provisionProductSpecifications(authorization, session.canonical, {
      profileId: checkpoint.profileId,
      profileName: checkpoint.profileName,
      categoryName: checkpoint.categoryName,
    });

    checkpoint.profileId = result.profileId;
    checkpoint.profileName = result.profileName;
    checkpoint.customSpecsJson = result.customSpecsJson;
    checkpoint.attributeStrategy = "create";
    checkpoint.unmatchedSpecCount = 0;
    checkpoint.step = "images";

    session._audit?.action("erp.attributes", `Attribute profile ready: ${result.profileName}`, {
      profileId: result.profileId,
      groupsCreated: result.groupsCreated,
      attributesCreated: result.attributesCreated,
      fieldCount: result.fieldCount,
      created: result.attributesCreated > 0 || result.groupsCreated > 0,
    });

    session.progress = {
      message:
        result.groupsCreated || result.attributesCreated
          ? `Created attribute structure (${result.groupsCreated} groups, ${result.attributesCreated} fields) and mapped ${result.fieldCount} values.`
          : `Mapped ${result.fieldCount} specification values to profile ${result.profileName}.`,
      percent: 52,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Attribute provisioning failed";
    session._audit?.error("erp.attributes", message);
    checkpoint.customSpecsJson = specsToCustomJson(session.canonical);
    checkpoint.attributeStrategy = "custom";
    checkpoint.step = "images";
    session.progress = {
      message: `Could not build attribute profile — stored specs as custom fields. (${message})`,
      percent: 50,
    };
  }

  return null;
}

async function resolveAttributeStorage(
  session: CommerceWorkflowSession,
  _authorization: string,
): Promise<string> {
  return session.checkpoint.customSpecsJson ?? specsToCustomJson(session.canonical);
}

async function stepImages(session: CommerceWorkflowSession, authorization: string): Promise<CommerceWorkflowSession | null> {
  const checkpoint = session.checkpoint;
  if (checkpoint.mediaIds.length) {
    checkpoint.step = "product";
    return null;
  }

  const urls = imageUrlsFromCanonical(session.canonical);
  session.progress = { message: `Upload Images... (${urls.length} images)`, percent: 62 };
  if (!urls.length) {
    checkpoint.step = "product";
    return null;
  }

  try {
    const imported = await consumerAuthorizedFetch<{ items: Array<{ id: string }> }>(
      "/api/v1/catalog/ai/import-images",
      authorization,
      {
        method: "POST",
        body: JSON.stringify({ urls, alt_prefix: productName(session.canonical) }),
      },
    );
    checkpoint.mediaIds = imported.items.map((item) => item.id);
    session._audit?.action("erp.images", `Uploaded ${checkpoint.mediaIds.length} images`, {
      imageCount: checkpoint.mediaIds.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "image import failed";
    const status =
      typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : 0;
    if (status === 404 || /not found/i.test(message)) {
      checkpoint.mediaIds = [];
      session.progress = {
        message: "Upload Images... skipped (import-images API not available yet)",
        percent: 65,
      };
      session._audit?.warning("erp.images", "import-images endpoint missing — continuing without media");
    } else {
      throw err;
    }
  }
  checkpoint.step = "product";
  return null;
}

async function stepProduct(session: CommerceWorkflowSession, authorization: string): Promise<CommerceWorkflowSession | null> {
  const checkpoint = session.checkpoint;
  if (checkpoint.productId) {
    checkpoint.step = "done";
    return null;
  }

  const canonical = session.canonical;
  const name = productName(canonical);
  checkpoint.slug = checkpoint.slug ?? (await uniqueProductSlug((typeof canonical.slug === "string" && canonical.slug) || name, authorization));
  checkpoint.sku = checkpoint.sku ?? generateSku(canonical, checkpoint.slug);
  checkpoint.customSpecsJson = checkpoint.customSpecsJson ?? (await resolveAttributeStorage(session, authorization));

  const priceAmount = Number((canonical.price as { amount?: number } | undefined)?.amount ?? 0);
  const compareAt = (canonical.metadata as { extensions?: { compareAtPrice?: { amount?: number } } } | undefined)
    ?.extensions?.compareAtPrice?.amount;

  session.progress = { message: "Creating Product...", percent: 85 };
  const created = await consumerAuthorizedFetch<ApiProductDetailResponse>("/api/v1/website/products", authorization, {
    method: "POST",
    body: JSON.stringify(
      productToApiPayload({
        name,
        slug: checkpoint.slug,
        sku: checkpoint.sku,
        price: Number.isFinite(priceAmount) ? priceAmount : 0,
        compare_at_price: compareAt,
        status: "draft",
        visibility: "private",
        brand: checkpoint.brandName ?? brandNameFromCanonical(canonical),
        brand_id: checkpoint.brandId,
        category: checkpoint.categoryName ?? undefined,
        category_id: checkpoint.categoryId,
        attribute_profile_id: checkpoint.profileId,
        description: (canonical.description as string | undefined) ?? "",
        short_description: (canonical.shortDescription as string | undefined) ?? "",
        seo_title: ((canonical.seo as { title?: string } | undefined)?.title as string | undefined) ?? undefined,
        seo_description:
          ((canonical.seo as { description?: string } | undefined)?.description as string | undefined) ?? undefined,
        warranty: ((canonical.warranty as { duration?: string } | undefined)?.duration as string | undefined) ?? null,
        custom_specs_json: checkpoint.customSpecsJson,
      }),
    ),
  });

  checkpoint.productId = created.data.id;
  if (checkpoint.mediaIds.length) {
    await consumerAuthorizedFetch(`/api/v1/website/products/${created.data.id}/media`, authorization, {
      method: "PUT",
      body: JSON.stringify({ media_ids: checkpoint.mediaIds }),
    });
  }

  if (checkpoint.profileId && checkpoint.customSpecsJson) {
    session.progress = { message: "Saving specification values on product…", percent: 92 };
    try {
      const valuesApplied = await applyProductSpecificationValues(
        authorization,
        created.data.id,
        checkpoint.profileId,
        checkpoint.customSpecsJson,
      );
      session._audit?.action("erp.attributes", `Applied ${valuesApplied} specification values on product`, {
        productId: created.data.id,
        profileId: checkpoint.profileId,
        valuesApplied,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save product specification values";
      session._audit?.warning("erp.attributes", message, { productId: created.data.id });
    }
  }

  session.productId = created.data.id;
  session.productName = created.data.name;
  session.productSku = created.data.sku;
  session.productSlug = created.data.slug;
  checkpoint.step = "done";
  session.progress = { message: `Product created successfully. ID: ${created.data.id}`, percent: 100 };
  session.status = "completed";
  session._audit?.success("erp.product", `Product created: ${created.data.name}`, {
    productId: created.data.id,
    sku: created.data.sku,
    slug: created.data.slug,
  });
  await session._audit?.flush();
  if (session.mvpRunId) {
    await markRunCompleted(session.mvpRunId, {
      productId: created.data.id,
      productSlug: created.data.slug,
      productName: created.data.name,
      productSku: created.data.sku,
    });
  }
  return null;
}

async function applyPendingAnswer(
  session: CommerceWorkflowSession,
  authorization: string,
  answer: ParsedCommerceAnswer,
): Promise<void> {
  const question = session.pendingQuestion;
  if (!question) return;

  recordDecision(session, question, answer);
  if (session.mvpRunId) {
    void recordUserDecision(session.mvpRunId, {
      answer: answer.raw,
      choiceId: answer.choiceId,
      questionType: question.type,
    });
  }
  const checkpoint = session.checkpoint;

  if (question.type === "brand_create") {
    const brandName = question.context.brandName as string;
    if (answer.action === "yes" || answer.choiceId === "yes") {
      const created = await createBrand(brandName, authorization);
      checkpoint.brandId = created.id;
      checkpoint.brandName = created.name;
      session.progress = { message: `Created brand ${created.name}.`, percent: 22 };
      session._audit?.action("erp.brand", `Brand created: ${created.name}`, {
        brandId: created.id,
        brandName: created.name,
        created: true,
      });
    } else {
      session.progress = { message: "Skipping brand assignment.", percent: 22 };
      session._audit?.decision("erp.brand", "User skipped brand assignment");
    }
    checkpoint.step = "category";
    session.pendingQuestion = null;
    return;
  }

  if (question.type === "category_pick") {
    const segment = question.context.segment as string;
    const pathIndex = question.context.pathIndex as number;
    if (answer.choiceId === "create_new") {
      session.pendingQuestion = {
        id: `q_cat_create_${Date.now()}`,
        type: "category_create",
        message: `Should I create **${segment}** under the current branch?`,
        options: [
          { id: "yes", label: "Yes, create it" },
          { id: "no", label: "No, skip this level" },
        ],
        context: question.context,
      };
      session.status = "awaiting_user";
      return;
    }

    const list = await consumerAuthorizedFetch<ApiCategoryListResponse>("/api/v1/website/categories", authorization);
    const selected =
      list.data.find((row) => row.id === answer.choiceId) ??
      list.data.find((row) => categoryLabel(row, list.data).toLowerCase() === answer.raw.toLowerCase()) ??
      list.data.find((row) => row.name.toLowerCase() === answer.raw.toLowerCase());

    if (!selected) {
      throw new Error(`I couldn't match "${answer.raw}" to a category. Please pick one of the listed options.`);
    }

    checkpoint.parentCategoryId = selected.id;
    checkpoint.categoryId = selected.id;
    checkpoint.categoryName = selected.name;
    checkpoint.categoryPathIndex = pathIndex + 1;
    session.pendingQuestion = null;
    return;
  }

  if (question.type === "category_create") {
    const segment = question.context.segment as string;
    const pathIndex = question.context.pathIndex as number;
    if (answer.action === "yes" || answer.choiceId === "yes") {
      const list = await consumerAuthorizedFetch<ApiCategoryListResponse>("/api/v1/website/categories", authorization);
      const categories = [...list.data];
      const created = await createCategory(segment, checkpoint.parentCategoryId, authorization, categories);
      checkpoint.parentCategoryId = created.id;
      checkpoint.categoryId = created.id;
      checkpoint.categoryName = created.name;
      session.progress = { message: `Created category ${created.name}.`, percent: 35 };
      session._audit?.action("erp.category", `Category created: ${created.name}`, {
        categoryId: created.id,
        created: true,
      });
    } else {
      session.progress = { message: `Skipped category level "${segment}".`, percent: 35 };
      session._audit?.decision("erp.category", `User skipped category level: ${segment}`);
    }
    checkpoint.categoryPathIndex = pathIndex + 1;
    session.pendingQuestion = null;
    return;
  }

  if (question.type === "attribute_profile_pick") {
    if (answer.choiceId === "custom_specs") {
      checkpoint.attributeStrategy = "custom";
      session.progress = { message: "Using custom specs only — no attribute profile.", percent: 46 };
      session._audit?.decision("erp.attributes", "User chose custom specs only (no profile)");
    } else if (answer.choiceId === "create_new") {
      checkpoint.attributeStrategy = "create";
      checkpoint.profileId = null;
      checkpoint.profileName = (question.context.newProfileName as string) ?? null;
      session.progress = {
        message: `Creating new profile: ${checkpoint.profileName ?? "Specifications"}…`,
        percent: 46,
      };
      session._audit?.decision("erp.attributes", `User chose to create profile: ${checkpoint.profileName}`, {
        createNew: true,
      });
    } else if (answer.choiceId) {
      const profiles = await listAttributeProfilesLite(authorization);
      const picked = profiles.find((row) => row.id === answer.choiceId);
      checkpoint.attributeStrategy = "create";
      checkpoint.profileId = answer.choiceId;
      checkpoint.profileName = picked?.name ?? null;
      session.progress = {
        message: `Using profile: ${checkpoint.profileName ?? answer.choiceId}…`,
        percent: 46,
      };
      session._audit?.decision("erp.attributes", `User confirmed profile: ${checkpoint.profileName}`, {
        profileId: checkpoint.profileId,
      });
    }
    session.pendingQuestion = null;
    return;
  }

  if (question.type === "attribute_strategy") {
    checkpoint.attributeStrategy = "custom";
    checkpoint.customSpecsJson = specsToCustomJson(session.canonical);
    checkpoint.step = "images";
    session.pendingQuestion = null;
  }
}

async function runUntilPauseOrComplete(
  session: CommerceWorkflowSession,
  authorization: string,
): Promise<CommerceWorkflowSession> {
  session.status = "running";
  let guard = 0;

  const persist = async () => {
    await saveWorkflowSession(session);
  };

  try {
    while (session.status === "running" && guard < 24) {
      guard += 1;
      const step = session.checkpoint.step;
      session.progress = {
        message: session.progress?.message || `Running ${step}…`,
        percent: Math.max(session.progress?.percent ?? 10, 10 + guard),
      };
      await persist();

      if (step === "brand") {
        const paused = await stepBrand(session, authorization);
        await persist();
        if (paused) break;
        continue;
      }

      if (step === "category") {
        const result = await stepCategory(session, authorization);
        await persist();
        if (result.session) break;
        continue;
      }

      if (step === "attributes") {
        const paused = await stepAttributes(session, authorization);
        await persist();
        if (paused) break;
        continue;
      }

      if (step === "images") {
        await stepImages(session, authorization);
        await persist();
        continue;
      }

      if (step === "product") {
        await stepProduct(session, authorization);
        await persist();
        break;
      }

      if (step === "done") {
        session.status = "completed";
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERP workflow failed";
    session.status = "failed";
    session.error = message;
    session._audit?.error("erp.workflow", message);
    await session._audit?.flush();
    if (session.mvpRunId) {
      await markRunFailed(session.mvpRunId, {
        phase: "erp",
        step: session.checkpoint.step,
        message,
      });
    }
    await saveWorkflowSession(session);
    throw err;
  }

  await saveWorkflowSession(session);
  return session;
}

export async function startInteractiveWorkflow(input: {
  createJobId: string;
  previewJobId: string;
  canonical: Record<string, unknown>;
  authorization: string;
  mvpRunId?: string;
}): Promise<CommerceWorkflowSession> {
  const session = createWorkflowSession({
    createJobId: input.createJobId,
    previewJobId: input.previewJobId,
    canonical: input.canonical,
  });
  if (input.mvpRunId) {
    session.mvpRunId = input.mvpRunId;
    session._audit = createErpAuditBridge(input.mvpRunId);
    session._audit.info("erp.start", "Interactive ERP workflow started");
  }
  await saveWorkflowSession(session);
  return runUntilPauseOrComplete(session, input.authorization);
}

export async function resumeInteractiveWorkflow(input: {
  sessionId: string;
  authorization: string;
  answerText: string;
}): Promise<CommerceWorkflowSession> {
  const session = await loadWorkflowSession(input.sessionId);
  if (!session) throw new Error("Workflow session not found");
  if (session.status !== "awaiting_user" || !session.pendingQuestion) {
    throw new Error("This workflow is not waiting for a reply");
  }

  const parsed = parseCommerceAnswer(input.answerText, session.pendingQuestion);
  await applyPendingAnswer(session, input.authorization, parsed);

  if (session.status === "awaiting_user" && session.pendingQuestion) {
    await saveWorkflowSession(session);
    return session;
  }

  if (!session._audit && session.mvpRunId) {
    session._audit = createErpAuditBridge(session.mvpRunId);
  }

  session.status = "running";
  return runUntilPauseOrComplete(session, input.authorization);
}

export async function getInteractiveWorkflowByCreateJobId(createJobId: string) {
  return loadWorkflowSessionByCreateJobId(createJobId);
}

export function workflowSessionToCreateJob(session: CommerceWorkflowSession) {
  return {
    id: session.createJobId,
    previewJobId: session.previewJobId,
    sessionId: session.id,
    mvpRunId: session.mvpRunId,
    status:
      session.status === "awaiting_user"
        ? ("awaiting_user" as const)
        : session.status === "completed"
          ? ("completed" as const)
          : session.status === "failed"
            ? ("failed" as const)
            : ("running" as const),
    progress: session.progress,
    pendingQuestion: session.pendingQuestion,
    productId: session.productId,
    productName: session.productName,
    productSku: session.productSku,
    productSlug: session.productSlug,
    productPageUrl: session.productId ? `/website/products?edit=${session.productId}` : undefined,
    error: session.error,
    updatedAt: session.updatedAt,
  };
}
