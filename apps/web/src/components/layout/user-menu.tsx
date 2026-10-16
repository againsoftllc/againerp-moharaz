"use client";

import { useRouter } from "next/navigation";
import { ThemeSwitch } from "@/components/theme/theme-switch";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { logoutAdmin } from "@/lib/api/auth";
import { userCompanyLabel, userInitials } from "@/lib/auth/user-display";
import {
  UserAccountMenuHeader,
  UserAccountMenuItems,
} from "@/components/layout/user-account-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const router = useRouter();
  const { user, clearSession } = useAdminAuth();

  const handleSignOut = async () => {
    try {
      await logoutAdmin();
    } catch {
      /* ignore */
    }
    clearSession();
    router.replace("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-1.5 rounded-none border border-input px-1.5 py-0.5 text-[11px]"
          aria-label="User menu"
          aria-haspopup="menu"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-none bg-primary text-[10px] font-medium text-primary-foreground">
            {userInitials(user)}
          </span>
          <span className="hidden max-w-[96px] truncate sm:inline">{userCompanyLabel(user)}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-none p-0">
        <UserAccountMenuHeader />
        <div className="px-1 pt-0.5">
          <ThemeSwitch variant="menu" />
        </div>
        <DropdownMenuSeparator />
        <UserAccountMenuItems onSignOut={() => void handleSignOut()} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
