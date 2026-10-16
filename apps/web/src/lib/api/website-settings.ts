import type { WebsiteSettings, WebsiteSettingsInput } from "@/lib/website/website-settings";
import { apiFetch } from "@/lib/api/client";

export type ApiWebsiteSettings = {
  id: string;
  company_id: string;
  site_name: string;
  tagline: string;
  logo_url: string;
  logo_mobile_url: string;
  favicon_url: string;
  address: string;
  contact_phone: string;
  contact_email: string;
  whatsapp_number: string;
  copyright_text: string;
  created_at: string;
  updated_at: string;
};

export type ApiWebsiteSettingsResponse = {
  data: ApiWebsiteSettings;
  errors: string[];
};

export function apiWebsiteSettingsToSettings(row: ApiWebsiteSettings): WebsiteSettings {
  return {
    id: row.id,
    siteName: row.site_name,
    tagline: row.tagline,
    logoUrl: row.logo_url,
    logoMobileUrl: row.logo_mobile_url,
    faviconUrl: row.favicon_url,
    address: row.address,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    whatsappNumber: row.whatsapp_number,
    copyrightText: row.copyright_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toApiPayload(input: WebsiteSettingsInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (input.siteName !== undefined) payload.site_name = input.siteName;
  if (input.tagline !== undefined) payload.tagline = input.tagline;
  if (input.logoUrl !== undefined) payload.logo_url = input.logoUrl;
  if (input.logoMobileUrl !== undefined) payload.logo_mobile_url = input.logoMobileUrl;
  if (input.faviconUrl !== undefined) payload.favicon_url = input.faviconUrl;
  if (input.address !== undefined) payload.address = input.address;
  if (input.contactPhone !== undefined) payload.contact_phone = input.contactPhone;
  if (input.contactEmail !== undefined) payload.contact_email = input.contactEmail;
  if (input.whatsappNumber !== undefined) payload.whatsapp_number = input.whatsappNumber;
  if (input.copyrightText !== undefined) payload.copyright_text = input.copyrightText;
  return payload;
}

export async function fetchWebsiteSettings(): Promise<WebsiteSettings> {
  const res = await apiFetch<ApiWebsiteSettingsResponse>("/api/v1/website/settings");
  return apiWebsiteSettingsToSettings(res.data);
}

export async function updateWebsiteSettings(input: WebsiteSettingsInput): Promise<WebsiteSettings> {
  const res = await apiFetch<ApiWebsiteSettingsResponse>("/api/v1/website/settings", {
    method: "PATCH",
    body: JSON.stringify(toApiPayload(input)),
  });
  return apiWebsiteSettingsToSettings(res.data);
}
