"use client";

import { useState } from "react";
import Link from "next/link";
import { FileText, Loader2, Receipt, ShoppingBag, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { ErpBuildInput } from "@/lib/configurator/erp/types";
import { ERP_FUNNEL_LABELS } from "@/lib/configurator/erp/types";
import {
  createInvoiceFromBuild,
  createLeadFromBuild,
  createQuotationFromBuild,
  createSalesOrderFromBuild,
  getFunnelStage,
  useConfiguratorErpStore,
} from "@/lib/configurator/erp/integration-service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Props = {
  input: ErpBuildInput;
  variant?: "storefront" | "admin";
  onOrderCreated?: (orderId: string) => void;
};

export function BuilderErpActions({ input, variant = "storefront", onOrderCreated }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const links = useConfiguratorErpStore((s) => s.getLinks(input.buildId));
  const funnelStage = getFunnelStage(input.buildId);

  const disabled = input.compatibilityStatus === "incompatible" || input.components.length === 0;

  const run = async (action: string, fn: () => { links: { orderNumber?: string; quotationNumber?: string; leadNumber?: string; invoiceNumber?: string; salesOrderId?: string } }) => {
    setLoading(action);
    try {
      const result = fn();
      if (action === "quotation" && result.links.quotationNumber) {
        toast.success(`Quotation ${result.links.quotationNumber} created`);
      } else if (action === "order" && result.links.orderNumber) {
        toast.success(`Sales order ${result.links.orderNumber} created`);
        if (result.links.salesOrderId) onOrderCreated?.(result.links.salesOrderId);
      } else if (action === "lead" && result.links.leadNumber) {
        toast.success(`CRM lead ${result.links.leadNumber} tracked`);
      } else if (action === "invoice" && result.links.invoiceNumber) {
        toast.success(`Invoice ${result.links.invoiceNumber} posted`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "ERP action failed");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-2">
      {links && funnelStage !== "saved" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">
            {ERP_FUNNEL_LABELS[funnelStage]}
          </Badge>
          {links.leadNumber && (
            <span className="text-[10px] text-muted-foreground">{links.leadNumber}</span>
          )}
          {links.quotationNumber && (
            <span className="text-[10px] text-muted-foreground">{links.quotationNumber}</span>
          )}
          {links.orderNumber && variant === "admin" && (
            <Link href="/sales" className="text-[10px] text-indigo-600 hover:underline">
              {links.orderNumber}
            </Link>
          )}
        </div>
      )}

      <Button
        variant={variant === "storefront" ? "outline" : "default"}
        size="sm"
        className="w-full"
        disabled={disabled || !!links?.quotationId || loading !== null}
        onClick={() => run("quotation", () => createQuotationFromBuild(input))}
      >
        {loading === "quotation" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1.5 h-3.5 w-3.5" />}
        One-click quotation
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="w-full"
        disabled={disabled || !!links?.salesOrderId || loading !== null}
        onClick={() => run("order", () => createSalesOrderFromBuild(input))}
      >
        {loading === "order" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />}
        One-click order
      </Button>

      {variant === "admin" && (
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !!links?.leadId || loading !== null}
            onClick={() => run("lead", () => createLeadFromBuild(input))}
          >
            {loading === "lead" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <UserPlus className="mr-1 h-3 w-3" />}
            Create lead
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || !!links?.invoiceId || loading !== null}
            onClick={() => run("invoice", () => createInvoiceFromBuild(input))}
          >
            {loading === "invoice" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Receipt className="mr-1 h-3 w-3" />}
            Invoice
          </Button>
        </div>
      )}
    </div>
  );
}
