"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterSelect } from "@/components/shared/filter-select";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { SettlePaymentDrawer, type SettleTarget } from "@/components/finance/settle-payment-drawer";
import { ServiceInvoiceDrawer } from "@/components/service/service-invoice-drawer";
import {
  fetchFinanceReceivables,
  fetchPaymentAccounts,
  settleReceivable,
  type ApiFinancePaymentAccount,
  type ApiFinanceReceivable,
} from "@/lib/api/finance";
import { fetchServiceJobs, type ServiceJob } from "@/lib/api/service-jobs";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn, formatCurrency } from "@/lib/utils";

export default function ServiceInvoicesPage() {
  const canWrite = useAdminCanWrite();
  const router = useRouter();
  const [receivables, setReceivables] = useState<ApiFinanceReceivable[]>([]);
  const [jobs, setJobs] = useState<ServiceJob[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<ApiFinancePaymentAccount[]>([]);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const jobList = await fetchServiceJobs();
      setJobs(jobList.data);
      try {
        const recv = await fetchFinanceReceivables();
        setReceivables(recv.data.filter((row) => row.source_type === "service_job"));
      } catch {
        setReceivables(
          jobList.data
            .filter((job) => job.invoice_number)
            .map((job) => ({
              id: job.receivable_id || job.id,
              company_id: job.company_id,
              customer_id: job.customer_id || "",
              customer_name: job.customer_name,
              source_type: "service_job",
              source_id: job.id,
              invoice_number: job.invoice_number || job.job_number,
              amount: job.total,
              amount_paid: "0",
              balance: job.total,
              tax_amount: "0",
              due_date: null,
              status: job.bill_status === "billed" ? "open" : job.bill_status,
              created_at: job.created_at,
            })),
        );
      }
      try {
        const accounts = await fetchPaymentAccounts();
        setPaymentAccounts(accounts.data);
      } catch {
        setPaymentAccounts([]);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load service invoices");
      setReceivables([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    return receivables.filter((row) => (status === "all" ? true : row.status === status));
  }, [receivables, status]);

  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div
        data-component="product-grid-filters"
        className="product-grid-filters flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ListGridHeaderStart title="Service invoices">
            {canWrite ? (
              <Button size="sm" className="rounded-none" onClick={() => setCreateOpen(true)}>
                New
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-[26px] w-[26px] shrink-0 rounded-none"
                  aria-label="Settings"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[11rem]">
                <DropdownMenuItem onClick={() => void load()} disabled={loading}>
                  <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
                  Refresh
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </ListGridHeaderStart>
          <FilterSelect
            value={status}
            onChange={setStatus}
            ariaLabel="Payment status"
            options={[
              { value: "all", label: "All" },
              { value: "open", label: "Unpaid" },
              { value: "partial", label: "Partial" },
              { value: "paid", label: "Paid" },
            ]}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 border-b border-border bg-muted/30 text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Invoice</th>
              <th className="px-3 py-1.5 font-medium">Customer</th>
              <th className="px-3 py-1.5 font-medium">Job card</th>
              <th className="px-3 py-1.5 text-right font-medium">Amount</th>
              <th className="px-3 py-1.5 text-right font-medium">Balance</th>
              <th className="px-3 py-1.5 font-medium">Status</th>
              {canWrite ? <th className="px-3 py-1.5 font-medium">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 7 : 6} className="px-3 py-10 text-center text-muted-foreground">
                  No service invoices yet. Direct service sales and billed job cards appear here.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const job = jobById.get(row.source_id);
                return (
                  <tr key={row.id} className="border-b border-border">
                    <td className="px-3 py-1.5 font-mono">{row.invoice_number}</td>
                    <td className="px-3 py-1.5">{row.customer_name || "—"}</td>
                    <td className="px-3 py-1.5">
                      {job ? (
                        <button
                          type="button"
                          className="font-mono text-primary hover:underline"
                          onClick={() => router.push(`/service/jobs?job=${job.id}`)}
                        >
                          {job.job_number}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(Number(row.amount))}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(Number(row.balance))}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant="outline" className="rounded-none text-[10px]">
                        {row.status}
                      </Badge>
                    </td>
                    {canWrite ? (
                      <td className="px-3 py-1.5">
                        {row.status !== "paid" && Number(row.balance) > 0 ? (
                          <button
                            type="button"
                            className="text-[11px] text-primary hover:underline"
                            onClick={() =>
                              setSettleTarget({
                                id: row.id,
                                label: row.invoice_number,
                                counterpartyName: row.customer_name || "",
                                balance: row.balance,
                              })
                            }
                          >
                            Record payment
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <ServiceInvoiceDrawer open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void load()} />
      <SettlePaymentDrawer
        open={Boolean(settleTarget)}
        onOpenChange={(open) => {
          if (!open) setSettleTarget(null);
        }}
        target={settleTarget}
        paymentAccounts={paymentAccounts}
        onSettle={async (id, input) => {
          await settleReceivable(id, input);
          toast.success("Payment recorded");
          setSettleTarget(null);
          void load();
        }}
      />
    </div>
  );
}
