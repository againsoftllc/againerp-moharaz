"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { saveAttributeProfileBulk } from "@/lib/api/use-catalog-attribute-profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCatalogModuleBasePath } from "@/lib/catalog/catalog-module-base-path";

export function AttributeProfileCreateForm() {
  const moduleBase = useCatalogModuleBasePath();

  const router = useRouter();
  const [profileName, setProfileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!profileName.trim()) {
      setError("Profile name is required.");
      toast.error("Enter a profile name first.");
      return;
    }

    setSaving(true);
    try {
      const profile = await saveAttributeProfileBulk({
        profileName: profileName.trim(),
        groups: [],
      });
      toast.success("Attribute profile created — now add groups and attributes");
      router.push(`${moduleBase}/attributes/${profile.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href={`${moduleBase}/attributes`}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <p className="page-subtitle">AgainERP › Catalog › Attributes</p>
            <h1 className="page-title">Add Attribute Profile</h1>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
        <p className="font-medium">Step 1 of 2 — Create profile</p>
        <p className="mt-1 text-xs text-muted-foreground">
          First create the attribute profile (e.g. Laptop, Monitor). After saving, you can add
          attribute groups and attributes under each group.
        </p>
      </div>

      <div className="rounded-xl border border-input bg-card p-4 sm:p-5">
        <label htmlFor="profile-name" className="text-sm font-medium">
          Profile name <span className="text-destructive">*</span>
        </label>
        <Input
          id="profile-name"
          value={profileName}
          onChange={(e) => {
            setProfileName(e.target.value);
            setError("");
          }}
          placeholder="e.g. Laptop, Monitor, Mobile Phone"
          className="mt-1.5 max-w-xl"
          autoFocus
        />
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
        <p className="mt-2 text-xs text-muted-foreground">
          This is the top-level template name. Groups and attributes are added in the next step.
        </p>

        <div className="mt-5 flex gap-2">
          <Button size="sm" onClick={() => void handleCreate()} disabled={saving}>
            <Save className="mr-1.5 h-3.5 w-3.5" />
            {saving ? "Creating…" : "Create profile"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`${moduleBase}/attributes`}>Cancel</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
