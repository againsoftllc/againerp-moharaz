import type {
  FooterStyle,
  HeaderStyle,
  LayoutStatus,
  SidebarPosition,
  WebsiteLayout,
} from "@/lib/mock-data/website-layouts";
import { apiFetch } from "@/lib/api/client";

export type ApiWebsiteLayout = {
  id: string;
  company_id: string;
  name: string;
  description: string;
  header_style: HeaderStyle;
  footer_style: FooterStyle;
  sidebar_position: SidebarPosition;
  status: LayoutStatus;
  is_default: boolean;
  pages_count: number;
  thumbnail: string;
  created_at: string;
  updated_at: string;
};

export type ApiWebsiteLayoutListResponse = {
  data: ApiWebsiteLayout[];
  meta: { count: number };
  errors: string[];
};

export type ApiWebsiteLayoutResponse = {
  data: ApiWebsiteLayout;
  errors: string[];
};

export type CreateWebsiteLayoutInput = {
  name: string;
  description?: string;
  headerStyle?: HeaderStyle;
  footerStyle?: FooterStyle;
  sidebarPosition?: SidebarPosition;
  status?: LayoutStatus;
};

export type UpdateWebsiteLayoutInput = Partial<{
  name: string;
  description: string;
  headerStyle: HeaderStyle;
  footerStyle: FooterStyle;
  sidebarPosition: SidebarPosition;
  status: LayoutStatus;
  isDefault: boolean;
}>;

export function apiLayoutToWebsiteLayout(row: ApiWebsiteLayout): WebsiteLayout {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    headerStyle: row.header_style,
    footerStyle: row.footer_style,
    sidebarPosition: row.sidebar_position,
    status: row.status,
    isDefault: row.is_default,
    pagesCount: row.pages_count,
    thumbnail: row.thumbnail,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createToApiPayload(input: CreateWebsiteLayoutInput): Record<string, unknown> {
  return {
    name: input.name,
    description: input.description ?? "",
    header_style: input.headerStyle ?? "standard",
    footer_style: input.footerStyle ?? "standard",
    sidebar_position: input.sidebarPosition ?? "none",
    status: input.status ?? "draft",
  };
}

function updateToApiPayload(input: UpdateWebsiteLayoutInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.name !== undefined) payload.name = input.name;
  if (input.description !== undefined) payload.description = input.description;
  if (input.headerStyle !== undefined) payload.header_style = input.headerStyle;
  if (input.footerStyle !== undefined) payload.footer_style = input.footerStyle;
  if (input.sidebarPosition !== undefined) payload.sidebar_position = input.sidebarPosition;
  if (input.status !== undefined) payload.status = input.status;
  if (input.isDefault !== undefined) payload.is_default = input.isDefault;
  return payload;
}

export async function fetchWebsiteLayouts(): Promise<WebsiteLayout[]> {
  const res = await apiFetch<ApiWebsiteLayoutListResponse>("/api/v1/website/layouts");
  return res.data.map(apiLayoutToWebsiteLayout);
}

export async function createWebsiteLayout(input: CreateWebsiteLayoutInput): Promise<WebsiteLayout> {
  const res = await apiFetch<ApiWebsiteLayoutResponse>("/api/v1/website/layouts", {
    method: "POST",
    body: JSON.stringify(createToApiPayload(input)),
  });
  return apiLayoutToWebsiteLayout(res.data);
}

export async function updateWebsiteLayout(
  id: string,
  input: UpdateWebsiteLayoutInput,
): Promise<WebsiteLayout> {
  const res = await apiFetch<ApiWebsiteLayoutResponse>(`/api/v1/website/layouts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updateToApiPayload(input)),
  });
  return apiLayoutToWebsiteLayout(res.data);
}

export async function deleteWebsiteLayout(id: string): Promise<void> {
  await apiFetch(`/api/v1/website/layouts/${id}`, { method: "DELETE" });
}
