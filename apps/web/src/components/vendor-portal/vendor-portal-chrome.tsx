"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ClipboardList, FileText, LogOut, Package, Receipt, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  clearVendorPortalSession,
  fetchVendorPortalNotifications,
  getVendorPortalSession,
  loadVendorPortalCompanyFormat,
  markAllVendorPortalNotificationsRead,
  markVendorPortalNotificationRead,
  vendorPortalLogout,
  type VendorPortalNotification,
  type VendorPortalUser,
} from "@/lib/api/vendor-portal";
import { cn, formatDateTime } from "@/lib/utils";

const NAV = [
  { href: "/vendor-portal/catalog", label: "Catalog", icon: Package },
  { href: "/vendor-portal/cart", label: "Cart", icon: ShoppingCart },
  { href: "/vendor-portal/order-requests", label: "Order Requests", icon: ClipboardList },
  { href: "/vendor-portal/quotations", label: "Quotations", icon: FileText },
  { href: "/vendor-portal/orders", label: "Orders", icon: Package },
  { href: "/vendor-portal/invoices", label: "Invoices", icon: Receipt },
];

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<VendorPortalNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchVendorPortalNotifications();
      setItems(res.data);
      setUnread(res.unread_count);
    } catch {
      /* silent — notifications are non-critical */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markOneRead(id: string) {
    try {
      await markVendorPortalNotificationRead(id);
      void load();
    } catch {
      /* ignore */
    }
  }

  async function markAllRead() {
    try {
      await markAllVendorPortalNotificationsRead();
      void load();
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative inline-flex h-7 w-7 items-center justify-center rounded-none text-white/80 hover:bg-white/10 hover:text-white"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[190]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-[200] w-[320px] border border-border bg-popover text-popover-foreground shadow-md">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-xs font-medium">Notifications</span>
              {unread > 0 && (
                <button type="button" className="text-[11px] text-primary hover:underline" onClick={() => void markAllRead()}>
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {loading ? (
                <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">Loading…</p>
              ) : items.length === 0 ? (
                <p className="px-3 py-6 text-center text-[11px] text-muted-foreground">No notifications</p>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => !n.is_read && void markOneRead(n.id)}
                    className={cn(
                      "block w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted",
                      !n.is_read && "bg-primary/5",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!n.is_read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium">{n.title}</p>
                        {n.message && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{n.message}</p>}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {formatDateTime(n.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Guards every vendor portal page and renders the vendor-facing header. */
export function VendorPortalChrome({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<VendorPortalUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const session = getVendorPortalSession();
    if (!session) {
      router.replace("/vendor-portal/login");
      return;
    }
    setUser(session.user);
    setChecked(true);
    void loadVendorPortalCompanyFormat().catch(() => undefined);
  }, [router]);

  if (!checked || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const signOut = async () => {
    try {
      await vendorPortalLogout();
    } catch {
      clearVendorPortalSession();
    } finally {
      toast.success("Signed out");
      router.replace("/vendor-portal/login");
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="shrink-0 border-b border-border bg-[#1f2937] text-white">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-3 px-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-none bg-[#7048E8] text-[11px] font-bold">
              A
            </span>
            <div className="leading-tight">
              <p className="text-[13px] font-semibold">Vendor Portal</p>
              <p className="text-[11px] text-white/60">{user.vendor_name ?? ""}</p>
            </div>
          </div>

          <nav className="ml-4 flex items-center gap-1 overflow-x-auto">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <button
                  key={item.href}
                  type="button"
                  onClick={() => router.push(item.href)}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-none px-2.5 text-[12px]",
                    active
                      ? "bg-white/15 text-white"
                      : "text-white/75 hover:bg-white/[0.08] hover:text-white",
                  )}
                >
                  <item.icon className="h-3.5 w-3.5" aria-hidden />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <span className="hidden text-[11px] text-white/60 sm:inline">{user.email}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 rounded-none text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => void signOut()}
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4">{children}</main>
    </div>
  );
}
