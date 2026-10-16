"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  type CatalogQa,
  type QaStatus,
} from "@/lib/mock-data/catalog-qa";
import {
  createCatalogQa,
  updateCatalogQa,
} from "@/lib/api/use-catalog-qa";
import { useCatalogProducts } from "@/lib/api/use-catalog-products";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { ProductCombobox } from "@/components/products/product-combobox";
import * as SwitchPrimitive from "@radix-ui/react-switch";

type Mode = "create" | "edit" | "view";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode;
  item?: CatalogQa | null;
  loading?: boolean;
  onSaved?: () => void;
  onEdit?: (item: CatalogQa) => void;
};

function isEnabledStatus(status: QaStatus) {
  return status === "answered";
}

function statusFromEnabled(enabled: boolean): QaStatus {
  return enabled ? "answered" : "archived";
}

type FormState = {
  productId: string;
  customerName: string;
  question: string;
  answer: string;
  status: QaStatus;
  isVerified: boolean;
};

function emptyForm(): FormState {
  return {
    productId: "",
    customerName: "",
    question: "",
    answer: "",
    status: "pending",
    isVerified: false,
  };
}

function fromQa(item: CatalogQa): FormState {
  return {
    productId: item.product.id,
    customerName: item.customer.name,
    question: item.question,
    answer: item.answer ?? "",
    status: item.status,
    isVerified: item.isVerified,
  };
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("block space-y-1", className)}>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function ReadValue({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <p className={cn("text-sm text-foreground", className)}>{children || "—"}</p>;
}

export function QaFormDialog({
  open,
  onOpenChange,
  mode,
  item,
  loading = false,
  onSaved,
  onEdit,
}: Props) {
  const canWrite = useAdminCanWrite();
  const { products } = useCatalogProducts({ channel: "catalog" });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const isView = mode === "view";
  const isCreate = mode === "create";
  const isEdit = mode === "edit";

  useEffect(() => {
    if (!open) return;
    if (item && (isEdit || isView)) {
      setForm(fromQa(item));
    } else if (isCreate) {
      setForm(emptyForm());
    }
  }, [open, item, isEdit, isView, isCreate]);

  const sheetTitle =
    mode === "create"
      ? "Add question"
      : mode === "edit"
        ? `Edit question${item?.questionId ? `: ${item.questionId}` : ""}`
        : `Question${item?.questionId ? `: ${item.questionId}` : ""}`;

  const set =
    <K extends keyof FormState>(key: K) =>
    (value: FormState[K]) =>
      setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!canWrite) return;
    if (!form.customerName.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!form.question.trim()) {
      toast.error("Question is required");
      return;
    }
    if (isCreate && !form.productId) {
      toast.error("Select a product");
      return;
    }

    const answerTrimmed = form.answer.trim();
    const answeredBy =
      form.status === "answered" && answerTrimmed ? "Admin" : undefined;

    setSaving(true);
    try {
      if (isCreate) {
        await createCatalogQa({
          productId: form.productId,
          customerName: form.customerName.trim(),
          question: form.question.trim(),
          answer: answerTrimmed || undefined,
          answeredBy,
          status: form.status,
          isVerified: form.isVerified,
        });
        toast.success("Question created");
      } else if (item) {
        await updateCatalogQa(item.id, {
          customerName: form.customerName.trim(),
          question: form.question.trim(),
          answer: answerTrimmed || null,
          answeredBy: answeredBy ?? null,
          status: form.status,
          isVerified: form.isVerified,
        });
        toast.success("Question updated");
      }
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        title={sheetTitle}
        resizable
        resizeMaxWidth={720}
        closeButton="chevron"
        className="w-full max-w-[100vw] gap-0 overflow-hidden rounded-none border-l border-input bg-background p-0 sm:w-[min(100%,32rem)] sm:min-w-[320px] sm:max-w-[720px]"
        aria-describedby={undefined}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3 pr-10 sm:px-4">
            {loading && !item && !isCreate ? (
              <ContentDataSkeleton label="Loading question…" showFilters={false} rows={6} />
            ) : (
              <div className="space-y-4">
                {!isCreate && item && (
                  <div className="flex min-w-0 items-center gap-3 rounded-none border border-input bg-muted/20 p-3">
                    {item.product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.product.imageUrl}
                        alt=""
                        className="h-12 w-12 shrink-0 object-cover"
                      />
                    ) : (
                      <div className="h-12 w-12 shrink-0 bg-muted" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.product.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {item.questionId}
                        {item.product.sku ? ` · ${item.product.sku}` : ""}
                      </p>
                    </div>
                  </div>
                )}

                {isCreate && (
                  <Field label="Product">
                    <ProductCombobox
                      products={products}
                      value={form.productId}
                      onChange={set("productId")}
                      placeholder="Select product…"
                    />
                  </Field>
                )}

                <Field label="Customer">
                  {isView ? (
                    <ReadValue>{form.customerName}</ReadValue>
                  ) : (
                    <Input
                      className="h-8 rounded-none"
                      value={form.customerName}
                      onChange={(e) => set("customerName")(e.target.value)}
                      placeholder="Customer name"
                    />
                  )}
                </Field>

                <Field label="Question">
                  {isView ? (
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {form.question || "—"}
                    </p>
                  ) : (
                    <textarea
                      className="min-h-[100px] w-full rounded-none border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={form.question}
                      onChange={(e) => set("question")(e.target.value)}
                      placeholder="Customer question"
                    />
                  )}
                </Field>

                <Field label="Answer">
                  {isView ? (
                    <p className="whitespace-pre-wrap text-sm text-foreground">
                      {form.answer || "—"}
                    </p>
                  ) : (
                    <textarea
                      className="min-h-[120px] w-full rounded-none border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={form.answer}
                      onChange={(e) => set("answer")(e.target.value)}
                      placeholder="Answer (optional)"
                    />
                  )}
                </Field>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Status">
                    {isView ? (
                      <ReadValue>
                        {isEnabledStatus(form.status) ? "Enable" : "Disable"}
                      </ReadValue>
                    ) : (
                      <label className="flex h-8 items-center gap-2 text-sm">
                        <SwitchPrimitive.Root
                          checked={isEnabledStatus(form.status)}
                          onCheckedChange={(next) => set("status")(statusFromEnabled(next))}
                          className={cn(
                            "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
                          )}
                        >
                          <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
                        </SwitchPrimitive.Root>
                        <span>
                          {isEnabledStatus(form.status) ? "Enable" : "Disable"}
                        </span>
                      </label>
                    )}
                  </Field>

                  <Field label="Verified">
                    {isView ? (
                      <ReadValue>{form.isVerified ? "Yes" : "No"}</ReadValue>
                    ) : (
                      <label className="flex h-8 items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.isVerified}
                          onChange={(e) => set("isVerified")(e.target.checked)}
                          className="h-3.5 w-3.5 rounded-none border border-input"
                        />
                        Verified
                      </label>
                    )}
                  </Field>
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
            {isView && canWrite && item && onEdit ? (
              <Button
                size="sm"
                className="rounded-none"
                onClick={() => onEdit(item)}
              >
                Edit
              </Button>
            ) : null}
            {!isView && canWrite ? (
              <Button
                size="sm"
                className="rounded-none"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                {isCreate ? "Create" : "Save"}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="rounded-none"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
