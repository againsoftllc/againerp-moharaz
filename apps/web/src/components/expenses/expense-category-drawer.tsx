"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ApiExpenseCategory } from "@/lib/api/expenses";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ApiExpenseCategory[];
  onCreate: (name: string) => Promise<void>;
  onDeactivate: (id: string) => Promise<void>;
};

export function ExpenseCategoryDrawer({ open, onOpenChange, categories, onCreate, onDeactivate }: Props) {
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onCreate(trimmed);
      setName("");
      toast.success(`${trimmed} added`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(category: ApiExpenseCategory) {
    if (!window.confirm(`Deactivate "${category.name}"? It stays on past expenses but won't be selectable for new ones.`)) return;
    setRemovingId(category.id);
    try {
      await onDeactivate(category.id);
      toast.success(`${category.name} deactivated`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to deactivate category");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title="Expense categories" className="w-full max-w-sm overflow-y-auto">
        <h2 className="pr-8 text-base font-semibold">Expense categories</h2>
        <p className="mt-1 text-xs text-muted-foreground">Group expenses for reporting — rent, utilities, salaries, and so on.</p>

        <div className="mt-4 flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New category name"
            disabled={saving}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAdd();
            }}
          />
          <Button size="sm" onClick={() => void handleAdd()} disabled={saving || !name.trim()}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-4 space-y-1">
          {categories.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">No categories yet.</p>
          )}
          {categories.map((c) => (
            <div key={c.id} className="flex items-center justify-between border border-input px-3 py-2">
              <span className="text-sm">{c.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => void handleRemove(c)}
                disabled={removingId === c.id}
                aria-label={`Deactivate ${c.name}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
