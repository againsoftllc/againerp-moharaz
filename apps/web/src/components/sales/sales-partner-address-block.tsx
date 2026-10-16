"use client";

import { cn } from "@/lib/utils";
import type { PartnerAddress } from "@/lib/sales/sales-partner-address";

export function PartnerAddressBlock({
  address,
  phone,
  email,
  className,
}: {
  address: PartnerAddress | null;
  phone?: string;
  email?: string;
  className?: string;
}) {
  const hasAddress = !!(address?.street || address?.city);
  if (!hasAddress && !phone && !email) return null;
  return (
    <div className={cn("mt-1 space-y-0 text-[13px] leading-snug text-muted-foreground", className)}>
      {phone ? <p>{phone}</p> : null}
      {email ? <p>{email}</p> : null}
      {address?.street ? <p>{address.street}</p> : null}
      {address?.street2 ? <p>{address.street2}</p> : null}
      {address?.city ? <p>{address.city}</p> : null}
      {address?.state || address?.zip ? (
        <p>{[address.state, address.zip].filter(Boolean).join(" ")}</p>
      ) : null}
      {address?.country ? <p>{address.country}</p> : null}
    </div>
  );
}
