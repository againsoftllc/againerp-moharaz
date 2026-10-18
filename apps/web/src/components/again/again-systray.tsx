"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Bell, Moon, Sparkles, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminAuth } from "@/lib/store/admin-auth-store";
import { useAiChatStore } from "@/lib/store/ai-chat-store";
import { logoutAdmin } from "@/lib/api/auth";
import { userCompanyLabel, userInitials } from "@/lib/auth/user-display";
import { useThemeOptional } from "@/components/theme/theme-provider";
import {
  UserAccountMenuHeader,
  UserAccountMenuItems,
} from "@/components/layout/user-account-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function SystrayIconButton({
  label,
  onClick,
  children,
  badge,
}: {
  label: string;
  onClick?: () => void;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="relative inline-flex h-[34px] w-8 shrink-0 items-center justify-center text-muted-foreground outline-none hover:bg-muted hover:text-foreground"
    >
      {children}
      {badge ? (
        <span className="absolute right-1 top-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-none bg-destructive px-0.5 text-[9px] font-bold leading-none text-destructive-foreground">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function AgainSystray() {
  const router = useRouter();
  const pathname = usePathname();
  const toggleAiDrawer = useAiChatStore((s) => s.toggleDrawer);
  const { user, clearSession } = useAdminAuth();
  const theme = useThemeOptional();
  const ThemeIcon = theme?.isDark ? Moon : Sun;
  const initial = userInitials(user);
  const companyLabel = userCompanyLabel(user);

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
    <div
      className="flex h-[34px] shrink-0 items-center"
      data-component="again_menu_systray"
      aria-label="Systray"
    >
      {/* Aladin from any page - the same chat as the AI module (not on /ai itself, where the chat already is). */}
      {!pathname.startsWith("/ai") ? (
        <SystrayIconButton label="Aladin AI" onClick={toggleAiDrawer}>
          <Sparkles className="h-3.5 w-3.5 text-violet-400" strokeWidth={1.75} />
        </SystrayIconButton>
      ) : null}

      <SystrayIconButton label="Notifications" onClick={() => router.push("/notifications")}>
        <Bell
          className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
          strokeWidth={1.75}
        />
      </SystrayIconButton>

      <SystrayIconButton label="Theme" onClick={() => theme?.toggle()}>
        <ThemeIcon
          className={cn("h-3.5 w-3.5", theme?.isDark ? "text-indigo-400" : "text-amber-500")}
          strokeWidth={1.75}
        />
      </SystrayIconButton>

      <span
        className="ml-3 mr-2 hidden max-w-[180px] truncate text-[12px] text-white/90 sm:inline"
        title={companyLabel}
      >
        {companyLabel}
      </span>

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="relative mx-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-none bg-blue-500 text-[11px] font-semibold text-white outline-none hover:opacity-90 dark:bg-blue-600"
            aria-label="User menu"
            title={user?.name ?? "Account"}
          >
            {initial}
            <span className="absolute -bottom-0.5 -right-0.5 flex h-2 w-2 items-center justify-center rounded-none border-2 border-background">
              <span className="h-full w-full rounded-none bg-emerald-500" />
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={4}
          className="z-[200] w-64 rounded-none border-border bg-popover p-0 text-popover-foreground shadow-md"
        >
          <UserAccountMenuHeader />
          <UserAccountMenuItems onSignOut={() => void handleSignOut()} />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
