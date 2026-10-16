"use client";

import { ChinaImportApp } from "@againerp-plugin/china-import/app";

const CHINA_IMPORT_ENABLED =
  process.env.NEXT_PUBLIC_CHINA_IMPORT_PLUGIN === "1" ||
  process.env.NEXT_PUBLIC_CHINA_IMPORT_PLUGIN === "true" ||
  process.env.NEXT_PUBLIC_CHINA_IMPORT_PLUGIN === "on" ||
  process.env.NEXT_PUBLIC_CHINA_IMPORT_PLUGIN === "enabled";

/**
 * Feature-flagged host mount for China Import POC.
 * Host passes forceEnabled — Next inlines NEXT_PUBLIC_* here, not inside the plugin package.
 */
export default function ChinaImportPluginPage() {
  return <ChinaImportApp forceEnabled={CHINA_IMPORT_ENABLED} />;
}
