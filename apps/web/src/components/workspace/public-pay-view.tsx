"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BILL_TYPE_LABEL, fetchPublicBill, startPublicPayment, type PublicBill } from "@/lib/api/erp-billing";
import { cn } from "@/lib/utils";

function formatDay(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function amountText(bill: PublicBill) {
  const n = Number(bill.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return bill.currency === "BDT" ? `৳${n}` : `${bill.currency} ${n}`;
}

/** The page a customer opens from a bill's pay link — no sign-in. */
export function PublicPayView({
  token,
  returnStatus,
  returnMessage,
}: {
  token: string;
  returnStatus?: string;
  returnMessage?: string;
}) {
  const [bill, setBill] = useState<PublicBill | null | undefined>(undefined);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchPublicBill(token)
      .then((b) => !cancelled && setBill(b))
      .catch(() => !cancelled && setBill(null));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const pay = async () => {
    setPaying(true);
    setError(null);
    try {
      window.location.href = await startPublicPayment(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment");
      setPaying(false);
    }
  };

  if (bill === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading your bill…
      </div>
    );
  }

  if (bill === null) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md border border-border bg-card p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">This payment link is not valid</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            It may have been replaced by a newer link. Please ask for the latest one.
          </p>
        </div>
      </div>
    );
  }

  const paid = bill.status === "paid";
  const cancelled = bill.status === "cancelled";
  const justPaid = returnStatus === "success";
  const failed = returnStatus === "failed" || returnStatus === "cancelled";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="border border-border bg-card shadow-sm">
          <div className="border-b border-border px-6 py-4">
            <p className="text-xs text-muted-foreground">Bill for</p>
            <p className="text-base font-semibold">{bill.company_name || "Your company"}</p>
          </div>

          {paid || justPaid ? (
            <div className="flex items-start gap-3 border-b border-emerald-500/30 bg-emerald-500/10 px-6 py-3 text-sm text-emerald-800 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">Payment received — thank you!</p>
                {bill.paid_at ? <p className="text-xs">Paid on {formatDay(bill.paid_at)}</p> : null}
              </div>
            </div>
          ) : null}
          {failed && !paid ? (
            <div className="flex items-start gap-3 border-b border-destructive/30 bg-destructive/10 px-6 py-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <div>
                <p className="font-semibold">
                  {returnStatus === "cancelled" ? "Payment cancelled" : "Payment did not go through"}
                </p>
                <p className="text-xs">{returnMessage || "You have not been charged. You can try again below."}</p>
              </div>
            </div>
          ) : null}
          {cancelled ? (
            <div className="border-b border-border bg-muted/50 px-6 py-3 text-sm text-muted-foreground">
              This bill was cancelled — nothing to pay.
            </div>
          ) : null}

          <div className="space-y-4 px-6 py-5">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="border border-border px-1.5 py-0.5">{BILL_TYPE_LABEL[bill.bill_type]}</span>
                <span>{bill.bill_number}</span>
                {bill.period_label ? <span>· {bill.period_label}</span> : null}
              </div>
              <h1 className="mt-1.5 text-lg font-semibold leading-snug">{bill.title}</h1>
              {bill.description ? <p className="mt-1 text-sm text-muted-foreground">{bill.description}</p> : null}
            </div>

            <div className="flex items-end justify-between border-y border-border py-4">
              <div>
                <p className="text-xs text-muted-foreground">{paid ? "Amount paid" : "Amount due"}</p>
                <p className="text-3xl font-semibold tabular-nums">{amountText(bill)}</p>
              </div>
              {!paid && !cancelled ? (
                <div className="text-right text-xs">
                  <p className="text-muted-foreground">Due date</p>
                  <p className={cn("font-medium", bill.is_overdue && "text-destructive")}>
                    {formatDay(bill.due_date)}
                    {bill.is_overdue ? " (overdue)" : ""}
                  </p>
                </div>
              ) : null}
            </div>

            {!paid && !cancelled ? (
              <>
                {!bill.gateway_ready ? (
                  <p className="border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                    Online payment is not available for this bill yet. Please contact support to pay another way.
                  </p>
                ) : null}
                {error ? <p className="text-xs text-destructive">{error}</p> : null}
                <Button
                  className="h-11 w-full rounded-none text-sm"
                  disabled={paying || !bill.gateway_ready}
                  onClick={() => void pay()}
                >
                  {paying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                  Pay {amountText(bill)}
                </Button>
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                  Secure checkout by SSLCommerz — cards, mobile banking and net banking
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
