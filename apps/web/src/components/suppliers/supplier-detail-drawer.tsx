"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Customer } from "@/lib/mock-data/customers";
import type { Supplier } from "@/lib/mock-data/suppliers";
import { getCommerceCustomer } from "@/lib/api/commerce-customers";
import { fetchCommerceSupplier } from "@/lib/api/use-commerce-suppliers";
import { enablePartyCommerceRole, fetchPartyCommerceLinks } from "@/lib/api/party-commerce";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { supplierToPartnerCustomer } from "@/lib/mock-data/partner-drawer-seed";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";

async function resolvePartnerFromSupplier(
  supplierId: string,
  snapshot: Supplier | null | undefined,
  canWrite: boolean,
): Promise<Customer> {
  const detail = snapshot?.id === supplierId ? snapshot : await fetchCommerceSupplier(supplierId);
  let customerId = detail.linkedCustomerId?.trim() || "";
  const partyId = detail.partyId?.trim() || "";

  if (!customerId && partyId) {
    let links = await fetchPartyCommerceLinks(partyId);
    customerId = links.customer?.id?.trim() || "";
    if (!customerId && canWrite) {
      links = await enablePartyCommerceRole(partyId, "customer");
      customerId = links.customer?.id?.trim() || "";
    }
  }

  if (customerId) {
    try {
      const full = await getCommerceCustomer(customerId);
      return {
        ...full,
        partyId: full.partyId || partyId || full.partyId,
        linkedSupplierId: full.linkedSupplierId || detail.id,
        linkedSupplierName: full.linkedSupplierName || detail.name,
      };
    } catch {
      /* fall through to supplier snapshot */
    }
  }

  return supplierToPartnerCustomer(detail);
}

export function SupplierDetailDrawer({
  open,
  supplierId,
  supplier,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  supplierId: string | null;
  supplier?: Supplier | null;
  onOpenChange: (open: boolean) => void;
  onChanged?: () => void;
}) {
  const canWrite = useAdminCanWrite();
  const [customer, setCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    if (!open || !supplierId) {
      setCustomer(null);
      return;
    }

    let cancelled = false;
    void resolvePartnerFromSupplier(supplierId, supplier, canWrite)
      .then((row) => {
        if (!cancelled) setCustomer(row);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Could not open partner");
        if (!cancelled) onOpenChange(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, supplierId, supplier, canWrite, onOpenChange]);

  return (
    <AgainPartnerDrawer
      open={open && Boolean(customer)}
      customer={customer}
      mode="edit"
      originRole="supplier"
      onOpenChange={(next) => {
        if (!next) setCustomer(null);
        onOpenChange(next);
      }}
      onSaved={() => onChanged?.()}
    />
  );
}
