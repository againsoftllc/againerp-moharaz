"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { JournalEntrySheet } from "@/components/finance/journal-entry-sheet";
import { FinanceGridSettingsMenu } from "@/components/finance/finance-grid-settings";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { ListGridOpenFallback } from "@/components/shared/list-grid-open-fallback";
import { useApiHealth } from "@/lib/api/use-api-health";
import {
  fetchFinanceJournal,
  fetchFinanceJournalEntry,
  fetchFinanceJournalSourceTypes,
  type ApiFinanceJournalEntry,
  type ApiFinanceSourceType,
} from "@/lib/api/finance";
import type { JournalGridHandle } from "@/components/finance/journal-grid";

const JournalGrid = dynamic(
  () => import("@/components/finance/journal-grid").then((module) => module.JournalGrid),
  {
    ssr: false,
    loading: () => <ListGridOpenFallback label="Opening journal…" />,
  },
);

export default function FinanceJournalPage() {
  return (
    <Suspense fallback={<ListGridOpenFallback label="Opening journal…" />}>
      <FinanceJournalBody />
    </Suspense>
  );
}

function FinanceJournalBody() {
  const search = useSearchParams();
  const apiHealth = useApiHealth();
  const gridRef = useRef<JournalGridHandle>(null);
  const [rows, setRows] = useState<ApiFinanceJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sourceTypes, setSourceTypes] = useState<ApiFinanceSourceType[]>([]);
  const [filterCount, setFilterCount] = useState(0);
  const [selected, setSelected] = useState<ApiFinanceJournalEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [linesLoading, setLinesLoading] = useState(false);
  const initialSourceType = search.get("source_type") || "all";

  useEffect(() => {
    void fetchFinanceJournalSourceTypes()
      .then((res) => setSourceTypes(res.data))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchFinanceJournal({ limit: 500 });
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load journal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "finance-journal-api" });
  }, [error]);

  async function openEntry(entry: ApiFinanceJournalEntry) {
    setSelected(entry);
    setDrawerOpen(true);
    setLinesLoading(true);
    try {
      const res = await fetchFinanceJournalEntry(entry.id);
      setSelected(res.data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load entry");
    } finally {
      setLinesLoading(false);
    }
  }

  const headerLeftActions = (
    <ListGridHeaderStart title="Journal">
      <FinanceGridSettingsMenu
        apiHealth={apiHealth}
        loading={loading}
        filterCount={filterCount}
        onRefresh={() => {
          void load();
          apiHealth.recheck();
        }}
        onFilters={() => gridRef.current?.openFilters()}
        onColumns={() => gridRef.current?.openColumns()}
        onExport={() => gridRef.current?.exportCsv()}
        onResetFilters={() => gridRef.current?.resetFilters()}
      />
    </ListGridHeaderStart>
  );

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <JournalGrid
        ref={gridRef}
        rows={rows}
        sourceTypes={sourceTypes}
        initialSourceType={initialSourceType}
        loading={loading && rows.length === 0}
        onFilterCountChange={setFilterCount}
        headerLeftActions={headerLeftActions}
        footerLeftActions={
          <span className="px-2 text-[10px] text-muted-foreground">
            {loading ? "Loading…" : `${rows.length} entries`}
          </span>
        }
        onOpenEntry={(entry) => void openEntry(entry)}
      />
      <JournalEntrySheet open={drawerOpen} onOpenChange={setDrawerOpen} entry={selected} loading={linesLoading} />
    </div>
  );
}
