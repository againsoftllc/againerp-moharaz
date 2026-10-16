import type { CloudflarePlugin } from "@/lib/api/cloudflare-plugin";

export function isCloudflarePluginActive(plugin: CloudflarePlugin | null | undefined): boolean {
  return Boolean(plugin?.installed && plugin.enabled);
}

export function isCloudflareAccountVerified(plugin: CloudflarePlugin | null | undefined): boolean {
  return Boolean(plugin?.installed && plugin.accountStatus === "connected");
}

/** R2 is connected and ready to be selected as upload destination. */
export function isCloudflareR2Configured(plugin: CloudflarePlugin | null | undefined): boolean {
  return Boolean(
    isCloudflarePluginActive(plugin) &&
      isCloudflareAccountVerified(plugin) &&
      plugin?.r2Status === "connected" &&
      Boolean(plugin.r2Bucket?.trim()),
  );
}

/** Active upload destination is R2 (configured + preference set). */
export function canUseCloudflareR2Storage(plugin: CloudflarePlugin | null | undefined): boolean {
  return Boolean(isCloudflareR2Configured(plugin) && plugin?.mediaStorage === "r2");
}

export function cloudflareStorageLabel(plugin: CloudflarePlugin | null | undefined): string {
  if (canUseCloudflareR2Storage(plugin)) return "Cloudflare R2";
  return "Local storage";
}
