"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Filter, Plus, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { ChequeBookDetailDrawer } from "@/components/finance/cheque-book-detail-drawer";
import { ChequeBookDrawer } from "@/components/finance/cheque-book-drawer";
import type { ChequeBookGridHandle } from "@/components/finance/cheque-book-grid";
import { fetchChequeBooks, type ApiChequeBook } from "@/lib/api/finance";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";

const ChequeBookGrid = dynamic(
  () => import("@/components/finance/cheque-book-grid").then((module) => module.ChequeBookGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening cheque books…" />,
  },
);

/** Finance → Payments → Cheque books: the books of cheques the company holds, one row per book (common datatable). */
export default function FinanceChequeBooksPage() {
  const canWrite = useAdminCanWrite();
  const gridRef = useRef<ChequeBookGridHandle>(null);
  const [books, setBooks] = useState<ApiChequeBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCount, setFilterCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // the row that is open: the drawer paints from it at once and loads the cheques behind it
  const [openBook, setOpenBook] = useState<ApiChequeBook | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBooks((await fetchChequeBooks()).data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load cheque books");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const headerLeftActions = (
    <ListGridHeaderStart title="Cheque books">
      {canWrite ? (
        <Button size="sm" className="rounded-none" onClick={() => setDrawerOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          New
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="icon" className="relative h-[26px] w-[26px] shrink-0 rounded-none" aria-label="Settings">
            <Settings2 className="h-3.5 w-3.5" />
            {filterCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-none bg-primary px-1 text-[9px] leading-3 text-primary-foreground">
                {filterCount}
              </span>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[11rem]">
          <DropdownMenuItem onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3 w-3", loading && "animate-spin")} />
            Refresh
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openFilters()}>
            <Filter className="mr-1.5 h-3 w-3" />
            Filters
            {filterCount > 0 ? <span className="ml-auto text-[10px] text-muted-foreground">{filterCount}</span> : null}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.openColumns()}>
            <SlidersHorizontal className="mr-1.5 h-3 w-3" />
            Columns
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => gridRef.current?.exportCsv()}>
            <Download className="mr-1.5 h-3 w-3" />
            Export
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => gridRef.current?.resetFilters()}>Reset filters</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <ChequeBookGrid
        ref={gridRef}
        rows={books}
        loading={loading && books.length === 0}
        headerLeftActions={headerLeftActions}
        onOpen={setOpenBook}
        onFilterCountChange={setFilterCount}
        footerLeftActions={(visible) => (
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${visible.length} shown`}
          </span>
        )}
        className="min-h-0 flex-1"
      />
      <ChequeBookDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCreated={(book) => {
          void load();
          setOpenBook(book);
        }}
      />
      <ChequeBookDetailDrawer
        bookId={openBook?.id ?? null}
        summary={openBook}
        canWrite={canWrite}
        onOpenChange={(open) => !open && setOpenBook(null)}
        onChanged={() => void load()}
      />
    </div>
  );
}
