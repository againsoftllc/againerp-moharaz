"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Download, Filter, Plus, RefreshCw, Settings2, Upload } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CustomerGrid,
  type CustomerGridHandle,
} from "@/components/customers/customer-grid";
import { AgainPartnerDrawer } from "@/components/shared/again-partner-drawer";
import { resolvePartnerForDrawer } from "@/lib/mock-data/partner-drawer-seed";
import {
  CustomersModuleNavbar,
  CustomersModuleBody,
  type CustomerListFilter,
} from "@/components/customers/customers-module-chrome";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Customer, CustomerStatus } from "@/lib/mock-data/customers";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { getCommerceCustomer, type CustomerListSortKey } from "@/lib/api/commerce-customers";
import {
  updateCommerceCustomerStatus,
  useCommerceCustomers,
} from "@/lib/api/use-commerce-customers";
import { useCustomerStore } from "@/lib/store/customer-store";
import { useApiHealth } from "@/lib/api/use-api-health";
import { cn } from "@/lib/utils";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";

function readFilterFromUrl(): CustomerListFilter {
  if (typeof window === "undefined") return "all";
  const f = new URLSearchParams(window.location.search).get("status");
  if (f === "all" || f === "active" || f === "inactive" || f === "blocked" || f === "vip") {
    return f;
  }
  return "all";
}

export function CustomersListScreen({
  openCustomerId,
  chrome = true,
}: {
  openCustomerId?: string;
  /** false when an outer module (e.g. Party) already supplies its own navbar. */
  chrome?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const canWrite = useAdminCanWrite();
  const apiHealth = useApiHealth();
  const gridRef = useRef<CustomerGridHandle>(null);
  const [listFilter, setListFilter] = useState<CustomerListFilter>(readFilterFromUrl);
  const [activeNav, setActiveNav] = useState("contacts");
  const [activeSub, setActiveSub] = useState("customers");
  const [advancedFilterCount, setAdvancedFilterCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string | undefined>();
  const [hasDue, setHasDue] = useState(false);
  const [sortState, setSortState] = useState<{ sort: CustomerListSortKey; order: "asc" | "desc" }>({
    sort: "name",
    order: "asc",
  });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Back to the first page when the search, filters, sort or page size change — while rendering, so the
  // list never fetches the old page number for the new filters.
  const filtersKey = JSON.stringify([debouncedSearch, listFilter, groupFilter, hasDue, sortState, pageSize]);
  const [pageFiltersKey, setPageFiltersKey] = useState(filtersKey);
  if (pageFiltersKey !== filtersKey) {
    setPageFiltersKey(filtersKey);
    setPage(0);
  }

  const listParams = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: listFilter === "all" ? undefined : listFilter,
      group: groupFilter,
      hasDue: hasDue || undefined,
      sort: sortState.sort,
      order: sortState.order,
      limit: pageSize,
      offset: page * pageSize,
    }),
    [debouncedSearch, listFilter, groupFilter, hasDue, sortState, page, pageSize],
  );
  const { customers, loading, error, refetch, total, totalDue } = useCommerceCustomers(listParams);
  const patchCustomer = useCustomerStore((s) => s.patchCustomer);
  const customersRef = useRef(customers);
  useLayoutEffect(() => {
    customersRef.current = customers;
  }, [customers]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);
  const openedIdRef = useRef<string | null>(null);

  const openCreate = useCallback(() => {
    setActiveCustomer(null);
    setDrawerOpen(true);
  }, []);

  const openCustomer = useCallback((customer: Customer, opts?: { hydrate?: boolean }) => {
    const resolved = resolvePartnerForDrawer(customer.id, customersRef.current) ?? customer;
    setActiveCustomer(resolved);
    setDrawerOpen(true);
    if (opts?.hydrate === false) return;
    const id = resolved.id;
    void getCommerceCustomer(id)
      .then((full) => {
        setActiveCustomer((current) => (current?.id === id ? full : current));
      })
      .catch(() => {
        /* keep the list row until a full profile is available */
      });
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    setActiveCustomer(null);
    openedIdRef.current = openCustomerId ?? null;
    if (openCustomerId || (pathname && pathname !== "/customers" && pathname.startsWith("/customers/"))) {
      router.replace("/customers");
      return;
    }
    const url = new URL(window.location.href);
    if (!url.searchParams.has("id") && url.searchParams.get("create") !== "1") return;
    url.searchParams.delete("id");
    url.searchParams.delete("create");
    const qs = url.searchParams.toString();
    window.history.replaceState({}, "", `${url.pathname}${qs ? `?${qs}` : ""}`);
  }, [openCustomerId, pathname, router]);

  // A ?create=1 link opens the new-customer drawer once, on arrival (opened while rendering, not from an effect).
  const createRequested = useSyncExternalStore(noSubscribe, readCreateParam, () => false);
  const [createOpened, setCreateOpened] = useState(false);
  if (createRequested && !openCustomerId && !createOpened) {
    setCreateOpened(true);
    setActiveCustomer(null);
    setDrawerOpen(true);
  }

  useEffect(() => {
    const id =
      openCustomerId ||
      (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("id"));
    if (!id) {
      openedIdRef.current = null;
      return;
    }
    if (openedIdRef.current === id) return;
    openedIdRef.current = id;

    const fromList = customersRef.current.find((row) => row.id === id);
    if (fromList) {
      openCustomer(fromList);
      return;
    }

    let cancelled = false;
    void getCommerceCustomer(id)
      .then((customer) => {
        if (cancelled) return;
        openCustomer(customer, { hydrate: false });
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Customer not found");
        setDrawerOpen(false);
        setActiveCustomer(null);
      });
    return () => {
      cancelled = true;
    };
    // Open once per customer id. Drawer close navigates away instead of re-running this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openCustomerId]);

  useEffect(() => {
    if (customers.length) {
      useCustomerStore.setState({ customers });
    }
  }, [customers]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const applyListFilter = useCallback((filter: CustomerListFilter) => {
    setListFilter(filter);
    const url = new URL(window.location.href);
    if (filter === "all") url.searchParams.delete("status");
    else url.searchParams.set("status", filter);
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  const handleStatusChange = useCallback(
    async (id: string, status: CustomerStatus) => {
      try {
        const updated = await updateCommerceCustomerStatus(id, status);
        patchCustomer(id, updated);
        await refetch(listParams, { fresh: true });
        toast.success(`Customer updated to ${status}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Status update failed");
      }
    },
    [patchCustomer, refetch, listParams],
  );

  const handleSaved = useCallback(
    (saved: Customer) => {
      patchCustomer(saved.id, saved);
      setActiveCustomer(saved);
      void refetch(listParams, { fresh: true });
    },
    [patchCustomer, refetch, listParams],
  );

  const handleNav = useCallback((menuId: string, subId: string) => {
    setActiveNav(menuId);
    setActiveSub(subId);
    if (menuId === "contacts" && subId === "customers") return;
    if (menuId === "configuration" && subId === "settings") {
      router.push("/customers/settings");
      return;
    }
    toast.info(`${menuId} › ${subId.replace(/_/g, " ")} — mock`);
  }, [router]);

  const refetchCustomers = () => {
    void refetch(listParams, { fresh: true }).then(() => {
      toast.success("Customers refreshed");
    });
    apiHealth.recheck();
  };

  const healthTitle =
    apiHealth.status === "connected"
      ? "API and database connected"
      : apiHealth.status === "partial"
        ? "API connected, database not connected"
        : apiHealth.status === "disconnected"
          ? "API/database not connected"
          : "Checking connection…";

  const headerLeftActions = (
    <ListGridHeaderStart title="Customers">
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
              refetchCustomers();
            }}
            disabled={loading}
          >
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
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

  const content = (
    <>
      <CustomerGrid
        ref={gridRef}
        chromeMode
        customers={customers}
        loading={loading && customers.length === 0}
        listFilter={listFilter}
        onListFilterChange={applyListFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onStatusChange={handleStatusChange}
        onAdvancedFilterCountChange={setAdvancedFilterCount}
        headerLeftActions={headerLeftActions}
        onOpenCustomer={openCustomer}
        onCustomersChanged={() => {
          void refetch(listParams, { fresh: true });
        }}
        serverTotal={total}
        serverTotalDue={totalDue}
        serverPage={page}
        serverPageSize={pageSize}
        onServerPageChange={setPage}
        onServerPageSizeChange={setPageSize}
        onGroupQueryChange={setGroupFilter}
        hasDue={hasDue}
        onHasDueChange={setHasDue}
        onSortChange={(next) =>
          setSortState((prev) =>
            prev.sort === next.sort && prev.order === next.order ? prev : next,
          )
        }
        className="min-h-0 flex-1"
      />

      {canWrite && (
        <Button
          size="sm"
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-none p-0 shadow-lg md:hidden"
          onClick={openCreate}
          aria-label="Add customer"
        >
          <Plus className="h-5 w-5" />
        </Button>
      )}

      <AgainPartnerDrawer
        open={drawerOpen}
        customer={activeCustomer}
        mode={activeCustomer ? "edit" : "create"}
        onOpenChange={(open) => {
          if (open) {
            setDrawerOpen(true);
            return;
          }
          closeDrawer();
        }}
        onSaved={handleSaved}
        moduleLabel="Contacts"
      />
    </>
  );

  if (!chrome) {
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        {content}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <CustomersModuleNavbar
        activeNav={activeNav}
        activeSub={activeSub}
        onNavigate={handleNav}
      />
      <CustomersModuleBody className="min-h-0 w-full min-w-0 flex-1 overflow-hidden">
        {content}
      </CustomersModuleBody>
    </div>
  );
}

function noSubscribe() {
  return () => {};
}

function readCreateParam() {
  return new URLSearchParams(window.location.search).get("create") === "1";
}
