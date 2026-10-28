"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AGAIN_DRAWER_FIELD_SHEET_CLASS,
  AgainDrawerButton,
  AgainDrawerCloseButton,
  AgainDrawerControlBar,
  AgainDrawerLayout,
  AgainDrawerPanel,
  AgainDrawerScrollBody,
} from "@/components/again/again-drawer";
import { AGAIN_FORM_RECORD_TITLE_CLASS, AgainUnderlineInput } from "@/components/again/again-form-sheet";
import { CustomerRecordPaymentDrawer } from "@/components/customers/customer-ledger-drawers";
import { RecordPaymentDrawer } from "@/components/suppliers/record-payment-drawer";
import { fetchCustomerLedger } from "@/lib/api/customer-ledger";
import { searchTradingParties, type TradingParty } from "@/lib/api/party-search";
import { fetchSupplierLedger } from "@/lib/api/supplier-ledger";
import { cn } from "@/lib/utils";

/** OnerERP "Collection" (money in from a customer) or "Payment" (money out to a supplier). */
export type PartyPaymentKind = "collection" | "payment";

type Picked = TradingParty & { role: "customer" | "supplier"; outstanding: number; advance: number };

type Props = {
  kind: PartyPaymentKind | null;
  onClose: () => void;
  onRecorded: () => void;
};

/**
 * Finance entry point for a party receipt or payment: pick the customer or supplier here, then the same Record payment drawer the
 * party's Ledger tab uses opens (invoices oldest first, advance, write-off, cheque through the register). Nothing is booked twice.
 */
export function PartyPaymentLauncher({ kind, onClose, onRecorded }: Props) {
  const role = kind === "payment" ? "supplier" : "customer";
  const [query, setQuery] = React.useState("");
  const [parties, setParties] = React.useState<TradingParty[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [opening, setOpening] = React.useState<string | null>(null);
  const [picked, setPicked] = React.useState<Picked | null>(null);

  React.useEffect(() => {
    if (kind) setQuery("");
  }, [kind]);

  React.useEffect(() => {
    if (!kind) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchTradingParties(role, query)
        .then((rows) => {
          if (!cancelled) setParties(rows);
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : `Could not load ${role}s`))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [kind, role, query]);

  async function pick(party: TradingParty) {
    setOpening(party.id);
    try {
      const summary =
        role === "customer" ? (await fetchCustomerLedger(party.id)).summary : (await fetchSupplierLedger(party.id)).summary;
      setPicked({ ...party, role, outstanding: Number(summary.outstanding) || 0, advance: Number(summary.advance ?? 0) || 0 });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the ledger");
    } finally {
      setOpening(null);
    }
  }

  const title = kind === "payment" ? "New payment" : "New collection";
  const closePicked = (open: boolean) => {
    if (!open) setPicked(null);
  };

  return (
    <>
      <AgainDrawerPanel
        open={kind !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={title}
        resizable
        defaultWidth={480}
        minWidth={360}
        widthStorageKey="again-party-payment-launcher-width"
      >
        <AgainDrawerLayout>
          <AgainDrawerControlBar trailing={<AgainDrawerCloseButton onClick={onClose} />}>
            <AgainDrawerButton onClick={onClose}>Cancel</AgainDrawerButton>
          </AgainDrawerControlBar>
          <AgainDrawerScrollBody className={AGAIN_DRAWER_FIELD_SHEET_CLASS}>
            <div className="@container space-y-3">
              <h2 className={AGAIN_FORM_RECORD_TITLE_CLASS}>{title}</h2>
              <p className="text-xs text-muted-foreground">
                {kind === "payment"
                  ? "Choose the supplier you are paying. The payment settles their bills oldest first; anything over stays as an advance."
                  : "Choose the customer who is paying. The money settles their invoices oldest first; anything over stays as an advance."}
              </p>
              <AgainUnderlineInput
                value={query}
                onChange={setQuery}
                placeholder={`Search ${role} by name, code or phone…`}
                autoComplete="off"
              />
              <div className="border border-border">
                {loading && parties.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">Loading…</p>
                ) : parties.length === 0 ? (
                  <p className="px-3 py-4 text-xs text-muted-foreground">No {role} matches “{query}”.</p>
                ) : (
                  parties.map((party) => (
                    <button
                      key={party.id}
                      type="button"
                      disabled={opening !== null}
                      onClick={() => void pick(party)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-muted",
                        opening === party.id && "bg-muted",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">{party.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {[party.code, party.phone].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{opening === party.id ? "Opening…" : "Select"}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </AgainDrawerScrollBody>
        </AgainDrawerLayout>
      </AgainDrawerPanel>

      {picked?.role === "customer" ? (
        <CustomerRecordPaymentDrawer
          open
          onOpenChange={closePicked}
          customerId={picked.id}
          customerName={picked.name}
          outstanding={picked.outstanding}
          advance={picked.advance}
          onRecorded={onRecorded}
        />
      ) : null}
      {picked?.role === "supplier" ? (
        <RecordPaymentDrawer
          open
          onOpenChange={closePicked}
          supplierId={picked.id}
          supplierName={picked.name}
          outstanding={picked.outstanding}
          advance={picked.advance}
          onRecorded={onRecorded}
        />
      ) : null}
    </>
  );
}
