// ─── Global Activity & Chatter — platform types ───────────────────────────────

export type ActivityEntityType =
  | "product"
  | "order"
  | "customer"
  | "review"
  | "category"
  | "brand"
  | "attribute_profile"
  | "inventory"
  | "supplier"
  | "business_partner"
  | "purchase_order"
  | "purchase_rfq"
  | "purchase_receipt"
  | "purchase_bill"
  | "purchase_return"
  | "manufacturing_work_order"
  | "manufacturing_bom"
  | "manufacturing_work_center"
  | "manufacturing_routing"
  | "invoice"
  | "payment"
  | "shipment"
  | "campaign"
  | "user"
  | "role"
  | "workflow"
  | "settings"
  | "configurator_profile"
  | "configurator_category"
  | "configurator_rule"
  | "configurator_template"
  | "configurator_build";

export type ActivityActionType =
  | "create"
  | "update"
  | "delete"
  | "restore"
  | "status_change"
  | "assignment"
  | "comment"
  | "note"
  | "attachment"
  | "approval"
  | "rejection"
  | "ai_action"
  | "import"
  | "export"
  | "workflow"
  | "system"
  | "login"
  | "logout"
  | "api";

export type ActivityFieldChange = {
  field: string;
  oldValue: string;
  newValue: string;
  reason?: string;
};

export type ActivityEntry = {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  actionType: ActivityActionType;
  title: string;
  description?: string;
  fieldChanges?: ActivityFieldChange[];
  actor: string;
  actorId?: string;
  actorInitials: string;
  at: string;
};

export type ActivityComment = {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  author: string;
  authorId?: string;
  authorInitials: string;
  body: string;
  parentId?: string;
  mentions?: string[];
  at: string;
};

export type ActivityNote = {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  author: string;
  authorInitials: string;
  body: string;
  at: string;
};

export type ActivityAttachment = {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  name: string;
  fileType: "image" | "pdf" | "document" | "spreadsheet" | "video";
  size: string;
  uploadedBy: string;
  at: string;
};

export type ActivityFollower = {
  entityType: ActivityEntityType;
  entityId: string;
  userId: string;
  name: string;
  initials: string;
};

export type ActivityAiAction = {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  action: string;
  summary: string;
  at: string;
};

export type ActivityApproval = {
  id: string;
  entityType: ActivityEntityType;
  entityId: string;
  status: "requested" | "approved" | "rejected";
  requestedBy: string;
  actedBy?: string;
  reason?: string;
  at: string;
};

export type ActivityEntityRef = {
  type: ActivityEntityType;
  id: string;
  label: string;
  subtitle?: string;
};

export type EntityActivityBundle = {
  entries: ActivityEntry[];
  comments: ActivityComment[];
  notes: ActivityNote[];
  attachments: ActivityAttachment[];
  followers: ActivityFollower[];
  aiActions: ActivityAiAction[];
  approvals: ActivityApproval[];
};

export const ACTIVITY_ACTION_LABELS: Record<ActivityActionType, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  restore: "Restored",
  status_change: "Status Changed",
  assignment: "Assigned",
  comment: "Comment",
  note: "Note",
  attachment: "Attachment",
  approval: "Approved",
  rejection: "Rejected",
  ai_action: "AI Action",
  import: "Import",
  export: "Export",
  workflow: "Workflow",
  system: "System",
  login: "Login",
  logout: "Logout",
  api: "API Action",
};

export function entityKey(type: ActivityEntityType, id: string) {
  return `${type}:${id}`;
}
