"use client";

import { PluginsHome } from "@/components/settings/plugins/plugins-home";

/** Plugins — product-page style: filter toolbar + edge-to-edge body + footer bar. */
export default function PluginsPage() {
  return (
    <div className="-m-3 flex min-h-0 w-[calc(100%+1.5rem)] max-w-none flex-1 flex-col overflow-hidden lg:-m-4 lg:w-[calc(100%+2rem)]">
      <PluginsHome />
    </div>
  );
}
