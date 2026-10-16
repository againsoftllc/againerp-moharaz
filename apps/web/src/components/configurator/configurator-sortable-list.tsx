"use client";

import { useState } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function reorderByKey<T extends { id: string }>(items: T[], fromId: string, toId: string): T[] {
  const from = items.findIndex((i) => i.id === fromId);
  const to = items.findIndex((i) => i.id === toId);
  if (from < 0 || to < 0 || from === to) return items;
  const copy = [...items];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy.map((row, i) => ({ ...row, sortOrder: i }));
}

type SortableItem = {
  id: string;
  sortOrder: number;
};

type Props<T extends SortableItem> = {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T) => React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  emptyLabel?: string;
};

export function ConfiguratorSortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  onAdd,
  addLabel = "Add item",
  emptyLabel = "No items yet",
}: Props<T>) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const reordered = reorderByKey(items, dragId, targetId);
    onReorder(reordered.map((i) => i.id));
    setDragId(null);
    setOverId(null);
  };

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-input py-8 text-center">
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
        {onAdd && (
          <Button type="button" variant="outline" size="sm" className="mt-3 h-7 text-xs" onClick={onAdd}>
            <Plus className="mr-1 h-3 w-3" />
            {addLabel}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        <GripVertical className="mr-0.5 inline h-3 w-3" />
        Drag to reorder
      </p>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div
            key={item.id}
            draggable
            onDragStart={() => setDragId(item.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverId(item.id);
            }}
            onDragLeave={() => setOverId((id) => (id === item.id ? null : id))}
            onDrop={() => handleDrop(item.id)}
            className={cn(
              "flex items-center gap-2 rounded-md border border-input bg-background p-2 transition-shadow",
              dragId === item.id && "opacity-50",
              overId === item.id && dragId !== item.id && "border-primary ring-2 ring-primary/25",
            )}
          >
            <button
              type="button"
              className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
              aria-label="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">{renderItem(item)}</div>
          </div>
        ))}
      </div>
      {onAdd && (
        <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={onAdd}>
          <Plus className="mr-1 h-3 w-3" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}

type OptionRow = { id: string; label: string; value: string; sortOrder: number };

type OptionsEditorProps = {
  options: OptionRow[];
  onChange: (options: OptionRow[]) => void;
};

export function ConfiguratorOptionsEditor({ options, onChange }: OptionsEditorProps) {
  const addOption = () => {
    onChange([
      ...options,
      { id: `opt_${Date.now()}`, label: "", value: "", sortOrder: options.length },
    ]);
  };

  const update = (id: string, patch: Partial<OptionRow>) => {
    onChange(options.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  };

  const remove = (id: string) => {
    onChange(options.filter((o) => o.id !== id).map((o, i) => ({ ...o, sortOrder: i })));
  };

  return (
    <ConfiguratorSortableList
      items={options}
      onReorder={(ids) => {
        const map = new Map(ids.map((id, i) => [id, i]));
        onChange(
          [...options]
            .sort((a, b) => (map.get(a.id) ?? 0) - (map.get(b.id) ?? 0))
            .map((o, i) => ({ ...o, sortOrder: i })),
        );
      }}
      onAdd={addOption}
      addLabel="Add option"
      emptyLabel="Add dropdown / multi-select options"
      renderItem={(opt) => (
        <div className="flex flex-1 gap-2">
          <Input
            value={opt.label}
            onChange={(e) => update(opt.id, { label: e.target.value, value: opt.value || e.target.value.toLowerCase().replace(/\s+/g, "_") })}
            placeholder="Label"
            className="h-8 text-xs"
          />
          <Input
            value={opt.value}
            onChange={(e) => update(opt.id, { value: e.target.value })}
            placeholder="value"
            className="h-8 w-28 font-mono text-xs"
          />
          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => remove(opt.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    />
  );
}
