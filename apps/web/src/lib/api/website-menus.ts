import { apiFetch } from "@/lib/api/client";
import type {
  MenuAutoType,
  MenuKind,
  MenuLinkType,
  MenuNavStyle,
  MenuSource,
  MenuSystemKey,
  WebsiteMenu,
  WebsiteMenuInput,
  WebsiteMenuItem,
  WebsiteMenuSlot,
  WebsiteMenuUpdateInput,
} from "@/lib/website/website-menus";

type ApiMenuItem = {
  id: string;
  label: string;
  link_type: MenuLinkType;
  link_ref_id?: string | null;
  href?: string;
  hidden?: boolean;
  children?: ApiMenuItem[];
};

type ApiMenu = {
  id: string;
  company_id: string;
  name: string;
  handle: string;
  kind: MenuKind;
  system_key?: MenuSystemKey | null;
  source: MenuSource;
  auto_type?: MenuAutoType;
  auto_show_new?: boolean;
  active: boolean;
  sort_order: number;
  items?: ApiMenuItem[];
  auto_preview?: ApiMenuItem[];
  created_at: string;
  updated_at: string;
};

type ApiMenuSlot = {
  slot_key: string;
  menu_id: string;
  menu_name?: string | null;
  title?: string;
  nav_style?: MenuNavStyle;
  updated_at: string;
};

function mapSlot(row: ApiMenuSlot): WebsiteMenuSlot {
  const navStyle = row.nav_style;
  return {
    slotKey: row.slot_key,
    menuId: row.menu_id,
    menuName: row.menu_name ?? null,
    title: row.title ?? "",
    navStyle: navStyle === "dropdown" ? "dropdown" : "megamenu",
    updatedAt: row.updated_at,
  };
}

function mapItem(row: ApiMenuItem): WebsiteMenuItem {
  return {
    id: row.id,
    label: row.label || "",
    linkType: row.link_type || "custom",
    linkRefId: row.link_ref_id ?? null,
    href: row.href ?? "",
    hidden: Boolean(row.hidden),
    children: (row.children ?? []).map(mapItem),
  };
}

function mapMenu(row: ApiMenu): WebsiteMenu {
  const autoType = row.auto_type;
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    handle: row.handle,
    kind: row.kind,
    systemKey: row.system_key ?? null,
    source: row.source,
    autoType:
      autoType === "brand" || autoType === "page" || autoType === "category"
        ? autoType
        : "category",
    autoShowNew: row.auto_show_new !== false,
    active: row.active,
    sortOrder: row.sort_order,
    items: (row.items ?? []).map(mapItem),
    autoPreview: (row.auto_preview ?? []).map(mapItem),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApiItem(item: WebsiteMenuItem): ApiMenuItem {
  return {
    id: item.id,
    label: item.label,
    link_type: item.linkType,
    link_ref_id: item.linkRefId,
    href: item.href,
    hidden: item.hidden,
    children: item.children.map(toApiItem),
  };
}

export async function fetchWebsiteMenus(): Promise<WebsiteMenu[]> {
  const res = await apiFetch<{ data: ApiMenu[] }>("/api/v1/website/menus");
  return (res.data ?? []).map(mapMenu);
}

export async function fetchWebsiteMenu(id: string): Promise<WebsiteMenu> {
  const res = await apiFetch<{ data: ApiMenu }>(`/api/v1/website/menus/${id}`);
  return mapMenu(res.data);
}

export async function createWebsiteMenu(input: WebsiteMenuInput): Promise<WebsiteMenu> {
  const res = await apiFetch<{ data: ApiMenu }>("/api/v1/website/menus", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      handle: input.handle,
      source: input.source ?? "custom",
      auto_type: input.autoType ?? "category",
      auto_show_new: input.autoShowNew ?? true,
      items: (input.items ?? []).map(toApiItem),
      active: input.active ?? true,
    }),
  });
  return mapMenu(res.data);
}

export async function updateWebsiteMenu(
  id: string,
  input: WebsiteMenuUpdateInput,
): Promise<WebsiteMenu> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.handle !== undefined) body.handle = input.handle;
  if (input.source !== undefined) body.source = input.source;
  if (input.autoType !== undefined) body.auto_type = input.autoType;
  if (input.autoShowNew !== undefined) body.auto_show_new = input.autoShowNew;
  if (input.items !== undefined) body.items = input.items.map(toApiItem);
  if (input.active !== undefined) body.active = input.active;
  if (input.sortOrder !== undefined) body.sort_order = input.sortOrder;
  const res = await apiFetch<{ data: ApiMenu }>(`/api/v1/website/menus/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return mapMenu(res.data);
}

export async function deleteWebsiteMenu(id: string): Promise<void> {
  await apiFetch(`/api/v1/website/menus/${id}`, { method: "DELETE" });
}

export async function fetchWebsiteMenuSlots(): Promise<WebsiteMenuSlot[]> {
  const res = await apiFetch<{ data: ApiMenuSlot[] }>("/api/v1/website/menu-slots");
  return (res.data ?? []).map(mapSlot);
}

export async function updateWebsiteMenuSlots(
  slots: {
    slotKey: string;
    menuId: string;
    title?: string;
    navStyle?: MenuNavStyle;
  }[],
): Promise<WebsiteMenuSlot[]> {
  const res = await apiFetch<{ data: ApiMenuSlot[] }>("/api/v1/website/menu-slots", {
    method: "PATCH",
    body: JSON.stringify({
      slots: slots.map((s) => ({
        slot_key: s.slotKey,
        menu_id: s.menuId,
        ...(s.title !== undefined ? { title: s.title } : {}),
        ...(s.navStyle !== undefined ? { nav_style: s.navStyle } : {}),
      })),
    }),
  });
  return (res.data ?? []).map(mapSlot);
}
