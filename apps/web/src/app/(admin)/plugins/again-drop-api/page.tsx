"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AgainDropApiPanel } from "@/components/settings/plugins/again-drop-api-panel";
import { findPlugin } from "@/lib/settings/plugins/registry";
import { AGAIN_DROP_API_PLUGIN_ID } from "@/lib/plugins/again-drop-api/settings";
import { Button } from "@/components/ui/button";

/**
 * AgainDropAPI (Dropshipping) — AgainDrop API connection plugin shell.
 * Full field editing lives in Workspace → Plugins → AgainDropAPI.
 */
export default function AgainDropApiPluginPage() {
  const plugin = findPlugin(AGAIN_DROP_API_PLUGIN_ID);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 lg:p-6">
      <div>
        <Link
          href="/workspace/plugins"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Plugins
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">
          {plugin?.name ?? "AgainDropAPI (Dropshipping)"}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {plugin?.longDescription ??
            "Connect AgainDrop API credentials for China dropshipping product imports."}
        </p>
      </div>

      <AgainDropApiPanel />

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href={`/workspace/plugins/${AGAIN_DROP_API_PLUGIN_ID}`}>
            Edit AgainDrop API config
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/plugins/china-import">Open China Import app</Link>
        </Button>
      </div>
    </div>
  );
}
