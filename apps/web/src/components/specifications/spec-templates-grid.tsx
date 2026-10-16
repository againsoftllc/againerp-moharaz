"use client";

import { useRouter } from "next/navigation";
import { Copy, Laptop, Monitor, Smartphone, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAttributeProfileStore } from "@/lib/store/attribute-profile-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpecificationsNav } from "@/components/specifications/specifications-nav";

const TEMPLATES = [
  {
    id: "tpl_business_laptop",
    name: "Business Laptop",
    base: "Laptop",
    description: "Security, warranty, and productivity fields on top of laptop base.",
    groups: 8,
    fields: 22,
    icon: Laptop,
  },
  {
    id: "tpl_gaming_laptop",
    name: "Gaming Laptop",
    base: "Laptop",
    description: "GPU, cooling, RGB, refresh rate — extends laptop profile.",
    groups: 10,
    fields: 28,
    icon: Laptop,
  },
  {
    id: "tpl_budget_laptop",
    name: "Budget Laptop",
    base: "Laptop",
    description: "Reduced field set for entry-level notebooks.",
    groups: 5,
    fields: 14,
    icon: Laptop,
  },
  {
    id: "tpl_flagship_mobile",
    name: "Flagship Mobile",
    base: "Mobile Phone",
    description: "Camera, display, 5G, battery — premium phone specs.",
    groups: 7,
    fields: 24,
    icon: Smartphone,
  },
  {
    id: "tpl_monitor_pro",
    name: "Pro Monitor",
    base: "Monitor",
    description: "Panel type, color gamut, ergonomics for professional displays.",
    groups: 6,
    fields: 18,
    icon: Monitor,
  },
  {
    id: "tpl_custom",
    name: "Blank profile",
    base: "—",
    description: "Start empty and build groups and fields from scratch.",
    groups: 0,
    fields: 0,
    icon: Sparkles,
  },
];

export function SpecTemplatesGrid() {
  const router = useRouter();
  const duplicateProfile = useAttributeProfileStore((s) => s.duplicateProfile);
  const profiles = useAttributeProfileStore((s) => s.profiles);

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    if (tpl.id === "tpl_custom") {
      toast.info("Use + Add Profile on Profiles tab");
      router.push("/website/specifications/profiles");
      return;
    }
    const base = profiles.find((p) => p.name.toLowerCase().includes(tpl.base.toLowerCase().split(" ")[0]!));
    if (base) {
      const newId = duplicateProfile(base.id);
      if (newId) {
        toast.success(`Created "${tpl.name}" from ${base.name}`);
        router.push(`/website/specifications/profiles/${newId}`);
      }
    } else {
      toast.success(`Template "${tpl.name}" applied (mock)`);
    }
  };

  return (
    <div className="space-y-4">
      <SpecificationsNav />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((tpl) => (
          <div
            key={tpl.id}
            className="flex flex-col rounded-lg border border-input bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <tpl.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{tpl.name}</p>
                <Badge variant="muted" className="mt-1 text-[10px]">
                  Based on {tpl.base}
                </Badge>
              </div>
            </div>
            <p className="mt-3 flex-1 text-xs text-muted-foreground">{tpl.description}</p>
            <p className="mt-2 text-[10px] text-muted-foreground">
              {tpl.groups} groups · {tpl.fields} fields
            </p>
            <Button size="sm" className="mt-3 w-full" onClick={() => applyTemplate(tpl)}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Use template
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
