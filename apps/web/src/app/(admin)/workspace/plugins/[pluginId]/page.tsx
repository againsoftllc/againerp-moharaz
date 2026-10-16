"use client";

import { Suspense, use } from "react";
import { PluginConfigWorkspace } from "@/components/settings/plugins/plugin-config-workspace";

type Props = { params: Promise<{ pluginId: string }> };

function PluginConfigPageInner({ pluginId }: { pluginId: string }) {
  return (
    <div className="flex min-h-[calc(100vh-2.75rem-1.5rem)] flex-col lg:min-h-[calc(100vh-2.75rem-2rem)]">
      <PluginConfigWorkspace pluginId={pluginId} />
    </div>
  );
}

export default function PluginConfigPage({ params }: Props) {
  const { pluginId } = use(params);
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading plugin…</div>}>
      <PluginConfigPageInner pluginId={pluginId} />
    </Suspense>
  );
}
