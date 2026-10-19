"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BadgeCheck, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DuplicateInfo } from "@/components/products/use-duplicate-check";

/** the dot colour of a scan: blue once a person verified it, otherwise by the level the scan found */
export function duplicateDotClass(d: DuplicateInfo): string {
  if (d.verified) return "bg-blue-500";
  return d.level === "confirmed" ? "bg-red-500" : d.level === "possible" ? "bg-amber-400" : "bg-emerald-500";
}

export function duplicateHeadline(d: DuplicateInfo): string {
  if (d.verified) return "Verified";
  return d.level === "confirmed" ? "Duplicate" : d.level === "possible" ? "Maybe a duplicate" : "Unique - no matching product";
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  info: DuplicateInfo | undefined;
  onOpenProduct: (id: string) => void;
  onVerify: (verified: boolean) => Promise<unknown>;
  onRescan: () => Promise<unknown>;
};

/** Click on a Duplicate dot: the saved scan (which products match and why), open any match, verify the result, scan again. */
export function DuplicateMatchesDialog({ open, onOpenChange, productName, info, onOpenProduct, onVerify, onRescan }: Props) {
  const [busy, setBusy] = useState<"verify" | "rescan" | null>(null);

  const run = async (kind: "verify" | "rescan", fn: () => Promise<unknown>, done: string) => {
    setBusy(kind);
    try {
      await fn();
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-input bg-background p-5 shadow-xl">
          <div className="flex items-start gap-3">
            <span className={cn("mt-1 h-3.5 w-3.5 shrink-0 rounded-full", info ? duplicateDotClass(info) : "bg-muted-foreground/30")} />
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold">{info ? duplicateHeadline(info) : "Checking…"}</Dialog.Title>
              <Dialog.Description className="truncate text-xs text-muted-foreground">{productName}</Dialog.Description>
            </div>
            <Dialog.Close className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {info ? (
            <>
              {info.verified ? (
                <p className="mt-3 rounded-md bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                  Verified{info.verifiedBy ? ` by ${info.verifiedBy}` : ""}
                  {info.verifiedAt ? ` on ${new Date(info.verifiedAt).toLocaleString()}` : ""}. Scan result was: {info.level === "unique" ? "unique" : `${info.level} duplicate`}.
                </p>
              ) : null}

              {info.matches.length ? (
                <ul className="mt-3 space-y-2">
                  {info.matches.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 rounded-md border border-input p-2">
                      {m.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.thumbnail} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                      ) : (
                        <div className="h-12 w-12 shrink-0 rounded bg-muted" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{m.name}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {m.sku} · {m.status}
                        </div>
                        <span
                          className={cn(
                            "mt-0.5 inline-block rounded px-1.5 py-0.5 text-[11px]",
                            m.level === "confirmed" ? "bg-red-500/10 text-red-700 dark:text-red-300" : "bg-amber-400/15 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          {m.reason}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          onOpenChange(false);
                          onOpenProduct(m.id);
                        }}
                      >
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                        Open
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No other product matches this one.</p>
              )}

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {info.checkedAt ? `Scanned ${new Date(info.checkedAt).toLocaleString()}` : ""}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void run("rescan", onRescan, "Scanned again")}>
                    {busy === "rescan" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                    Scan again
                  </Button>
                  {info.verified ? (
                    <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void run("verify", () => onVerify(false), "Verification removed")}>
                      {busy === "verify" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Remove verification
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busy !== null} onClick={() => void run("verify", () => onVerify(true), "Marked as verified")}>
                      {busy === "verify" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />}
                      Verify
                    </Button>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
