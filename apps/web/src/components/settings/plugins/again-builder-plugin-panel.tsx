"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Puzzle } from "lucide-react";
import { toast } from "sonner";
import {
  fetchAgainBuilderPlugin,
  updateAgainBuilderPlugin,
  type AgainBuilderPluginRecord,
} from "@/lib/api/again-builder-plugin";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const BUILDER_OPTIONS: { slug: string; label: string; href: string; soon?: boolean }[] = [
  { slug: "pc-builder", label: "PC Builder", href: "/builders/pc-builder" },
  { slug: "cctv-builder", label: "CCTV Builder", href: "/builders/cctv-builder", soon: true },
  { slug: "laptop-builder", label: "Laptop Builder", href: "/builders/laptop-builder", soon: true },
];

type Props = {
  activeSection?: string;
};

export function AgainBuilderPluginPanel({ activeSection = "builders" }: Props) {
  const canWrite = useAdminCanWrite();
  const [plugin, setPlugin] = useState<AgainBuilderPluginRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPlugin(await fetchAgainBuilderPlugin());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load Again Builder");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleBuilder = async (slug: string, on: boolean) => {
    if (!plugin || !canWrite) return;
    const next = on
      ? Array.from(new Set([...plugin.enabled_builders, slug]))
      : plugin.enabled_builders.filter((s) => s !== slug);
    setSaving(true);
    try {
      const updated = await updateAgainBuilderPlugin({ enabled_builders: next });
      setPlugin(updated);
      toast.success(on ? `${slug} enabled` : `${slug} disabled`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (activeSection !== "builders") return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Again Builder…
      </div>
    );
  }

  if (!plugin) {
    return <p className="py-6 text-sm text-muted-foreground">Plugin not available.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-none border border-border bg-muted/20 px-3 py-2">
        <Puzzle className="h-4 w-4 text-indigo-600" />
        <span className="text-sm font-medium">Again Builder</span>
        {plugin.installed && plugin.enabled ? (
          <Badge className="rounded-none" variant="success">
            Active
          </Badge>
        ) : (
          <Badge className="rounded-none" variant="muted">
            Inactive
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Right now we&apos;re setting up <span className="font-medium text-foreground">PC Builder</span>{" "}
        only. Other builders can be enabled later. Slot products come from Catalog categories whose{" "}
        <span className="font-mono">slug</span> matches the builder slot (e.g.{" "}
        <span className="font-mono">cpu</span>).
      </p>

      <div className="space-y-3 rounded-none border border-border p-3">
        <Label className="text-xs font-semibold">Enabled builders</Label>
        {BUILDER_OPTIONS.map((opt) => {
          const on = plugin.enabled_builders.includes(opt.slug);
          return (
            <div key={opt.slug} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {opt.label}
                  {opt.soon ? (
                    <span className="ml-2 text-[10px] font-normal text-muted-foreground">
                      (later)
                    </span>
                  ) : null}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {opt.slug} · storefront {opt.href}
                </p>
              </div>
              <Switch
                checked={on}
                disabled={!canWrite || saving || !plugin.installed}
                onCheckedChange={(checked) => void toggleBuilder(opt.slug, checked)}
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className="rounded-none">
          <Link href="/website/product-configurator">
            Open Builders admin
            <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link href="/website/product-configurator/profiles">Profiles</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="rounded-none">
          <Link href="/website/categories">Catalog categories</Link>
        </Button>
      </div>
    </div>
  );
}
