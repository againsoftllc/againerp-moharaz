"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PartyCommerceRole } from "@/lib/api/party-commerce";

const ROLE_ORDER: PartyCommerceRole[] = ["customer", "supplier", "vendor"];

const ROLE_LABELS: Record<PartyCommerceRole, string> = {
  customer: "Customer",
  supplier: "Supplier",
  vendor: "Vendor",
};

/**
 * One company can be a Customer, a Supplier, and a B2B Vendor at once.
 * `currentRole` is whichever form this is (always on, locked); the other
 * two chips are optional and multi-selectable — checking one registers
 * that role too as soon as the record is saved.
 */
export function PartyRolePicker({
  currentRole,
  roles,
  onChange,
  className,
  lockedRoles,
  readOnly,
}: {
  currentRole: PartyCommerceRole;
  /** Full set of active roles, including `currentRole`. */
  roles: PartyCommerceRole[];
  onChange: (roles: PartyCommerceRole[]) => void;
  className?: string;
  /** Roles already saved — there's no "disable role" API (only additive
   * `enablePartyCommerceRole`), so these can't be unchecked once active. */
  lockedRoles?: PartyCommerceRole[];
  readOnly?: boolean;
}) {
  const toggle = (role: PartyCommerceRole) => {
    if (readOnly || role === currentRole || lockedRoles?.includes(role)) return;
    onChange(roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role]);
  };

  return (
    <div className={cn("mb-3 flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Also register as
      </span>
      {ROLE_ORDER.map((role) => {
        const isCurrent = role === currentRole;
        const isLocked = isCurrent || Boolean(lockedRoles?.includes(role));
        const disabled = readOnly || isLocked;
        const active = isCurrent || roles.includes(role);
        return (
          <button
            key={role}
            type="button"
            disabled={disabled}
            onClick={() => toggle(role)}
            title={
              isCurrent
                ? `This record is a ${ROLE_LABELS[role]}`
                : isLocked
                  ? `Already registered as ${ROLE_LABELS[role]} — roles can't be removed here`
                  : undefined
            }
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors",
              active
                ? "border-[#00a09d] bg-[#00a09d]/10 text-[#00a09d]"
                : "border-border text-muted-foreground hover:border-[#00a09d]/50 hover:text-foreground",
              disabled && "cursor-default",
              readOnly && !active && "opacity-50",
            )}
          >
            {active ? <Check className="h-3 w-3 shrink-0" /> : null}
            {ROLE_LABELS[role]}
          </button>
        );
      })}
    </div>
  );
}
