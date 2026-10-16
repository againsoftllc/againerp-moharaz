"use client";

import { useMemo, useState } from "react";
import {
  deleteStagingImage,
  patchStagingImage,
  type StagingError,
} from "../../api/staging";
import { ExplorerJsonViewer } from "../../components/explorer/json-viewer";
import { Card, Field, StateBlock, buttonClassName, inputClassName } from "../../components";
import {
  approveStagingItem,
  rejectStagingItem,
  saveStagingDraft,
  useStagingItem,
} from "../../hooks/use-staging";
import { scanItemMapping } from "../../hooks/use-mapping";
import { cn, prettyJson } from "../../utils";

function IssueList({ errors, tone }: { errors: StagingError[]; tone: "warning" | "error" }) {
  const filtered = errors.filter((e) => e.severity === tone);
  if (filtered.length === 0) return null;
  return (
    <ul className={cn("space-y-1 text-xs", tone === "warning" ? "text-amber-700 dark:text-amber-300" : "text-destructive")}>
      {filtered.map((e) => (
        <li key={e.id} className="rounded border border-border bg-muted/20 px-2 py-1">
          <span className="font-medium capitalize">{e.kind.replace(/_/g, " ")}</span>
          {e.field ? <span className="text-muted-foreground"> · {e.field}</span> : null}
          <span> — {e.message}</span>
        </li>
      ))}
    </ul>
  );
}

export type ImportReviewPageProps = {
  itemId: string;
  onBack: () => void;
};

export function ImportReviewPage({ itemId, onBack }: ImportReviewPageProps) {
  const { item, loading, error, refetch } = useStagingItem(itemId);
  const [notes, setNotes] = useState("");
  const [draftJson, setDraftJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mappingBusy, setMappingBusy] = useState(false);

  const universal = useMemo(() => {
    if (!item) return null;
    return (item.draft_json ?? item.universal_json) as Record<string, unknown> | null;
  }, [item]);

  const displayJson = useMemo(() => {
    if (draftJson) return draftJson;
    return universal ? prettyJson(universal) : "";
  }, [draftJson, universal]);

  async function onScanMapping() {
    setMappingBusy(true);
    setMsg(null);
    try {
      const res = await scanItemMapping(itemId);
      setMsg(`Smart mapping: ${res.data.length} entity mapping(s) detected`);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Mapping scan failed");
    } finally {
      setMappingBusy(false);
    }
  }

  async function onApprove() {
    setBusy(true);
    setMsg(null);
    try {
      await approveStagingItem(itemId, notes || undefined);
      setMsg("Approved (staging only — no ERP product created)");
      await refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  async function onReject() {
    setBusy(true);
    setMsg(null);
    try {
      await rejectStagingItem(itemId, notes || undefined);
      setMsg("Rejected");
      await refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Reject failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveDraft() {
    setBusy(true);
    setMsg(null);
    try {
      const parsed = JSON.parse(draftJson || displayJson);
      await saveStagingDraft(itemId, parsed);
      setMsg("Draft saved");
      await refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Invalid draft JSON");
    } finally {
      setBusy(false);
    }
  }

  async function setPrimary(imageId: string) {
    try {
      await patchStagingImage(imageId, { is_primary: true });
      await refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Image update failed");
    }
  }

  async function removeImage(imageId: string) {
    try {
      await deleteStagingImage(imageId);
      await refetch();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Delete image failed");
    }
  }

  if (loading) return <StateBlock title="Loading review…" />;
  if (error) return <StateBlock tone="error" title="Review error" description={error} />;
  if (!item) return <StateBlock title="Item not found" />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClassName("secondary")} onClick={onBack}>
          ← Back to queue
        </button>
        <button type="button" disabled={mappingBusy} className={buttonClassName("secondary")} onClick={() => void onScanMapping()}>
          {mappingBusy ? "Scanning…" : "Run smart mapping"}
        </button>
        <span className={cn("rounded px-2 py-0.5 text-xs font-medium capitalize", item.status)}>
          {item.status}
        </span>
        {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">{item.title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.provider} · {item.provider_product_id}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Brand</p>
              <p className="text-sm">{item.brand_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Category</p>
              <p className="text-sm">{item.category_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Supplier</p>
              <p className="text-sm">{item.supplier_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">Price</p>
              <p className="text-sm">
                {item.sale_price ?? item.base_price ?? "—"} {item.currency}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold text-foreground">Provider images</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.images.length === 0 ? (
                <p className="text-xs text-muted-foreground">No images</p>
              ) : (
                item.images.map((img) => (
                  <div key={img.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt=""
                      className={cn(
                        "h-24 w-24 rounded border object-cover",
                        img.is_primary ? "border-emerald-500 ring-2 ring-emerald-500/30" : "border-border",
                      )}
                    />
                    <div className="mt-1 flex gap-1">
                      {!img.is_primary ? (
                        <button
                          type="button"
                          className="text-[10px] text-foreground underline"
                          onClick={() => void setPrimary(img.id)}
                        >
                          Primary
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-600">Primary</span>
                      )}
                      <button
                        type="button"
                        className="text-[10px] text-destructive underline"
                        onClick={() => void removeImage(img.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold text-foreground">Variants</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-2">SKU</th>
                    <th className="py-1 pr-2">Price</th>
                    <th className="py-1 pr-2">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {item.variants.map((v) => (
                    <tr key={v.id} className="border-t border-border">
                      <td className="py-1 pr-2 font-mono">{v.sku}</td>
                      <td className="py-1 pr-2">{v.price ?? "—"}</td>
                      <td className="py-1 pr-2">{v.stock ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {universal ? (
            <div className="mt-4">
              <p className="text-xs font-semibold text-foreground">Universal product</p>
              <div className="mt-2 max-h-64 overflow-auto rounded border border-border">
                <ExplorerJsonViewer value={universal} title="Universal JSON" />
              </div>
            </div>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="text-xs font-semibold text-foreground">Validation</h3>
            <div className="mt-2 space-y-2">
              <IssueList errors={item.errors} tone="error" />
              <IssueList errors={item.errors} tone="warning" />
              {item.errors.length === 0 ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">No issues recorded</p>
              ) : null}
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-xs font-semibold text-foreground">Review actions</h3>
            <Field label="Notes">
              <textarea
                className={inputClassName("min-h-[4rem]")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional review notes"
              />
            </Field>
            <div className="mt-3 flex flex-col gap-2">
              <button type="button" disabled={busy} className={buttonClassName("primary")} onClick={() => void onApprove()}>
                Approve product
              </button>
              <button type="button" disabled={busy} className={buttonClassName("secondary")} onClick={() => void onReject()}>
                Reject product
              </button>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-xs font-semibold text-foreground">Edit before import</h3>
            <textarea
              className={inputClassName("mt-2 min-h-[12rem] font-mono text-[11px]")}
              value={displayJson}
              onChange={(e) => setDraftJson(e.target.value)}
              spellCheck={false}
            />
            <button
              type="button"
              disabled={busy}
              className={cn(buttonClassName("secondary"), "mt-2 w-full")}
              onClick={() => void onSaveDraft()}
            >
              Save draft
            </button>
          </Card>
        </div>
      </div>
    </div>
  );
}
