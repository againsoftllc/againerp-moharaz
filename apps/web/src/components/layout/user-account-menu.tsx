"use client";

import Link from "next/link";
import { Building2, Landmark, LogOut, Settings, UserRound } from "lucide-react";
import { userCompanyLabel, userInitials, userRoleLabel } from "@/lib/auth/user-display";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

/** Odoo/SAP-style identity block: signed-in person + tenant company. */
export function UserAccountMenuHeader() {
  const user = useAdminAuth((s) => s.user);
  return (
    <div className="flex items-start gap-2.5 border-b border-border px-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-none bg-blue-500 text-[12px] font-semibold text-white dark:bg-blue-600">
        {userInitials(user)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight">
          {user?.name?.trim() || user?.username || "User"}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{user?.email || "—"}</p>
        <p className="mt-1.5 truncate text-[11px] text-foreground">{userRoleLabel(user)}</p>
        <p className="truncate text-[11px] text-muted-foreground">{userCompanyLabel(user)}</p>
      </div>
    </div>
  );
}

export function UserAccountMenuItems({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="p-0.5">
      <DropdownMenuItem asChild>
        <Link href="/workspace/business" className="cursor-pointer">
          <UserRound className="mr-2 h-3.5 w-3.5" aria-hidden />
          Preferences
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/workspace/setup" className="cursor-pointer">
          <Landmark className="mr-2 h-3.5 w-3.5" aria-hidden />
          Company
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/workspace/branches" className="cursor-pointer">
          <Building2 className="mr-2 h-3.5 w-3.5" aria-hidden />
          Branches
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/workspace/modules" className="cursor-pointer">
          <Settings className="mr-2 h-3.5 w-3.5" aria-hidden />
          Workspace
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => onSignOut()}
        className="cursor-pointer text-destructive focus:text-destructive"
      >
        <LogOut className="mr-2 h-3.5 w-3.5" aria-hidden />
        Sign out
      </DropdownMenuItem>
    </div>
  );
}
