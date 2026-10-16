"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Download, Filter, Plus, RefreshCw, Settings2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  SalesOrderGrid,
  type SalesOrderGridHandle,
} from "@/components/sales/sales-order-grid";
import {
  SalesOrderFormDrawer,
  type SalesOrderFormMode,
} from "@/components/sales/sales-order-form-drawer";
import {
  SalesModuleNavbar,
  SalesModuleBody,
  type SalesListFilter,
} from "@/components/sales/sales-module-chrome";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import type { Order, OrderStatus } from "@/lib/mock-data/orders";
import { useAdminCanWrite, useAdminIsAdmin } from "@/lib/hooks/use-admin-can-write";
import { useSalesOrders } from "@/lib/api/use-sales-orders";
import { useOpenFromUrl } from "@/lib/hooks/use-open-from-url";
import { useApiHealth } from "@/lib/api/use-api-health";
import { cn } from "@/lib/utils";

// Clean, query-free mounts for other modules' own Sales dropdowns — each pair
// is [Orders URL, Quotations URL]. The module's own layout.tsx already
// supplies a navbar there, so this page renders content only.
const CLEAN_SALES_MOUNTS = [
  ["/website/orders", "/website/quotations"],
  ["/inventory/orders", "/inventory/quotations"],
] as const;

function readFilterFromUrl(pathname: string): SalesListFilter {
  for (const [ordersPath, quotationsPath] of CLEAN_SALES_MOUNTS) {
    if (pathname === quotationsPath) return "quotations";
    if (pathname === ordersPath) return "all";
  }
  if (typeof window === "undefined") return "all";
  const f = new URLSearchParams(window.location.search).get("filter");
  if (f === "all" || f === "quotations" || f === "my_quotations") return f;
  return "all";
}

function cleanMountFor(pathname: string): readonly [string, string] | undefined {
  return CLEAN_SALES_MOUNTS.find(([o, q]) => pathname === o || pathname === q);
}

/** Orders and quotations are separate API lists; the facet picks which one is paged. */
function kindForFilter(filter: SalesListFilter): "order" | "quotation" {
  return filter === "all" ? "order" : "quotation";
}

export default function SalesPage() {
  const pathname = usePathname() || "/sales";
  const mount = cleanMountFor(pathname);
  const isWebsiteOrdersMount = !!mount;
  // Mounted under one of CLEAN_SALES_MOUNTS — that module's own layout.tsx
  // already provides a navbar there, so don't render our own.
  const chrome = !isWebsiteOrdersMount;
  const canWrite = useAdminCanWrite();
  const isAdmin = useAdminIsAdmin();
  const apiHealth = useApiHealth();
  const gridRef = useRef<SalesOrderGridHandle>(null);
  const {
    orders,
    total,
    query,
    setQuery,
    loading,
    fetching,
    error,
    refetch,
    saveOrder,
    updateStatus,
    bulkDelete,
    bulkStatus,
  } = useSalesOrders({ kind: kindForFilter(readFilterFromUrl(pathname)) });
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);
  const [listFilter, setListFilter] = useState<SalesListFilter>("all");
  const [activeNav, setActiveNav] = useState("order");
  const [activeSub, setActiveSub] = useState("order");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const f = readFilterFromUrl(pathname);
    setListFilter(f);
    setActiveNav(f === "all" ? "order" : "quotation");
    setActiveSub(f === "all" ? "order" : "quotation");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  useEffect(() => {
    const onPopState = () => {
      const f = readFilterFromUrl(window.location.pathname);
      setListFilter(f);
      setActiveNav(f === "all" ? "order" : "quotation");
      setActiveSub(f === "all" ? "order" : "quotation");
      setQuery({ kind: kindForFilter(f), page: 0 });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [setQuery]);

  // Search is server-side; debounce so a keystroke burst is one request, and
  // go back to page 1 because the result set changed.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery((q) => (q.search === searchQuery ? q : { ...q, search: searchQuery, page: 0 }));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchQuery, setQuery]);

  const router = useRouter();

  const applyListFilter = useCallback(
    (filter: SalesListFilter) => {
      setListFilter(filter);
      setActiveNav(filter === "all" ? "order" : "quotation");
      setActiveSub(filter === "all" ? "order" : "quotation");
      setQuery({ kind: kindForFilter(filter), page: 0 });
      if (mount) {
        // Clean URLs here — switch to the other page instead of a query string.
        const [ordersPath, quotationsPath] = mount;
        router.push(filter === "all" ? ordersPath : quotationsPath);
        return;
      }
      const url = new URL(window.location.href);
      url.searchParams.set("filter", filter);
      window.history.replaceState({}, "", url.pathname + url.search);
    },
    [mount, router, setQuery],
  );

  const handleNav = useCallback(
    (menuId: string, subId: string, filter?: SalesListFilter) => {
      if (menuId === "return" || menuId === "customer") return;
      setActiveNav(menuId);
      setActiveSub(subId);
      if (filter) {
        applyListFilter(filter);
        return;
      }
      toast.info(`${menuId} › ${subId.replace(/_/g, " ")} — mock`);
    },
    [applyListFilter],
  );

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<SalesOrderFormMode>("edit");
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);

  const openCreate = useCallback(() => {
    setActiveOrder(null);
    setDrawerMode("create");
    setDrawerOpen(true);
  }, []);

  const openOrder = useCallback((order: Order) => {
    setActiveOrder(order);
    setDrawerMode("edit");
    setDrawerOpen(true);
  }, []);

  // Deep link: /sales?open=<id>[&filter=quotations] (e.g. from an Aladin "created QUO-… — open it" link)
  useOpenFromUrl(orders, (o) => o.id, openOrder);

  const handleSaveAction = useCallback(
    async (
      order: Order,
      action: "save" | "confirm" | "cancel" | "duplicate" | "delete",
    ): Promise<Order> => {
      const saved = await saveOrder(order, action);
      setActiveOrder(saved);
      setDrawerMode("edit");
      return saved;
    },
    [saveOrder],
  );

  // Every drawer save (and edit-request approve/reject) lands here, so the
  // list refetch lives in one place.
  const handleSaved = useCallback(
    (saved: Order) => {
      setActiveOrder(saved);
      setDrawerMode("edit");
      void refetch({ fresh: true });
    },
    [refetch],
  );

  const refetchOrders = () => {
    void refetch({ fresh: true }).then((ok) => {
      if (ok) toast.success("Sales records refreshed");
    });
    apiHealth.recheck();
  };

  const handleStatusChange = (id: string, status: OrderStatus) => {
    void updateStatus(id, status).catch((err) => {
      toast.error(err instanceof Error ? err.message : "Status update failed");
    });
  };

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const gridTitle =
    listFilter === "all" ? "All Sales" : listFilter === "quotations" ? "Quotations" : "My Quotations";

  const headerLeftActions = (
    <ListGridHeaderStart title={gridTitle}>
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={openCreate}>
          New
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "relative h-[26px] w-[26px] shrink-0 rounded-none",
              apiHealth.status === "connected" &&
                "border-emerald-500/50 text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
              apiHealth.status === "partial" &&
                "border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400",
              apiHealth.status === "disconnected" &&
                "border-red-500/50 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
              apiHealth.status === "checking" && "text-muted-foreground",
            )}
            aria-label={`Settings (${healthTitle})`}
            title={healthTitle}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {advancedFilterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {advancedFilterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem] rounded-none">
          <DropdownMenuItem
            onClick={() => {
              refetchOrders();
            }}
            disabled={fetching}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", fetching && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {advancedFilterCount > 0 ? (
              <span className="ml-auto text-[10px] text-muted-foreground">{advancedFilterCount}</span>
            ) : null}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => toast.info("Import — prototype")}>
            <Upload className="mr-1.5 h-3 w-3" />
            Import
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => toast.success("Export started (mock CSV)")}>
            <Download className="mr-1.5 h-3 w-3" />
            Export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {chrome && (
        <SalesModuleNavbar
          activeNav={activeNav}
          activeSub={activeSub}
          onNavigate={handleNav}
        />
      )}
      <SalesModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
          <SalesOrderGrid
            ref={gridRef}
            orders={orders}
            loading={loading}
            serverPaging={{
              total,
              page: query.page,
              pageSize: query.pageSize,
              onPageChange: (page) => setQuery({ page }),
              onPageSizeChange: (pageSize) => setQuery({ pageSize, page: 0 }),
            }}
            sort={query.sort}
            onSortChange={(sort) => setQuery({ sort, page: 0 })}
            listFilter={listFilter}
            onListFilterChange={applyListFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onOpen={openOrder}
            onStatusChange={handleStatusChange}
            onBulkDelete={
              canWrite && isAdmin
                ? (ids) => {
                    void bulkDelete(ids)
                      .then((deleted) => {
                        // The API only deletes draft/cancelled rows — report what it did.
                        if (deleted === 0) {
                          toast.error("Nothing deleted — only draft or cancelled orders can be deleted");
                        } else if (deleted < ids.length) {
                          toast.warning(
                            `${deleted} of ${ids.length} record(s) deleted — the rest are not draft/cancelled`,
                          );
                        } else {
                          toast.success(`${deleted} record(s) deleted`);
                        }
                      })
                      .catch((err) =>
                        toast.error(err instanceof Error ? err.message : "Bulk delete failed"),
                      );
                  }
                : undefined
            }
            onBulkStatusChange={
              canWrite
                ? (ids, status) => {
                    void bulkStatus(ids, status)
                      .then((updated) => {
                        if (updated === 0) toast.error("No records updated — check each order's status");
                        else if (updated < ids.length)
                          toast.warning(`${updated} of ${ids.length} record(s) updated`);
                        else toast.success(`${updated} record(s) updated`);
                      })
                      .catch((err) =>
                        toast.error(err instanceof Error ? err.message : "Bulk update failed"),
                      );
                  }
                : undefined
            }
            onAdvancedFilterCountChange={setAdvancedFilterCount}
            headerLeftActions={headerLeftActions}
            className="min-h-0 flex-1"
          />
        </div>

        {canWrite && (
          <Button
            size="sm"
            className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-none p-0 shadow-lg md:hidden"
            onClick={openCreate}
            aria-label="Add order"
          >
            <Plus className="h-5 w-5" />
          </Button>
        )}

        <SalesOrderFormDrawer
          open={drawerOpen}
          mode={drawerMode}
          order={activeOrder}
          orders={orders}
          onOpenChange={setDrawerOpen}
          onSave={() => {}}
          onSaveAction={handleSaveAction}
          onSaved={handleSaved}
          initialKind={listFilter === "all" ? "order" : "quotation"}
        />
      </SalesModuleBody>
    </div>
  );
}
