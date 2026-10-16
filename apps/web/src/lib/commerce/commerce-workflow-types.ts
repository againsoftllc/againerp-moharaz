export type WorkflowStepName = "brand" | "category" | "attributes" | "images" | "product" | "done";

export type QuestionType =
  | "brand_create"
  | "category_create"
  | "category_pick"
  | "attribute_profile_pick"
  | "attribute_strategy";

export type QuestionOption = {
  id: string;
  label: string;
  description?: string;
};

export type PendingQuestion = {
  id: string;
  type: QuestionType;
  message: string;
  options?: QuestionOption[];
  context: Record<string, unknown>;
};

export type WorkflowCheckpoint = {
  step: WorkflowStepName;
  categoryPathIndex: number;
  brandId: string | null;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  parentCategoryId: string | null;
  attributeStrategy: "create" | "custom" | null;
  profileId: string | null;
  profileName: string | null;
  customSpecsJson: string | null;
  unmatchedSpecCount: number;
  mediaIds: string[];
  slug: string | null;
  sku: string | null;
  productId: string | null;
  decisions: Array<{ questionId: string; answer: string; choiceId?: string }>;
};

export type CommerceWorkflowSession = {
  id: string;
  createJobId: string;
  previewJobId: string;
  canonical: Record<string, unknown>;
  status: "running" | "awaiting_user" | "completed" | "failed";
  progress: { message: string; percent: number };
  checkpoint: WorkflowCheckpoint;
  pendingQuestion: PendingQuestion | null;
  productId?: string;
  productName?: string;
  productSku?: string;
  productSlug?: string;
  mvpRunId?: string;
  error?: string;
  updatedAt: number;
  /** Transient audit bridge — not persisted to disk */
  _audit?: {
    info: (...args: unknown[]) => void;
    action: (...args: unknown[]) => void;
    decision: (...args: unknown[]) => void;
    warning: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    success: (...args: unknown[]) => void;
    flush: () => Promise<void>;
  };
};

export function emptyCheckpoint(): WorkflowCheckpoint {
  return {
    step: "brand",
    categoryPathIndex: 0,
    brandId: null,
    brandName: null,
    categoryId: null,
    categoryName: null,
    parentCategoryId: null,
    attributeStrategy: null,
    profileId: null,
    profileName: null,
    customSpecsJson: null,
    unmatchedSpecCount: 0,
    mediaIds: [],
    slug: null,
    sku: null,
    productId: null,
    decisions: [],
  };
}
