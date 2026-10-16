"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocationDrawer } from "@/components/inventory/location-drawer";
import { useInventoryWarehouses } from "@/lib/api/use-inventory";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import {
  createLocation,
  deleteLocation,
  fetchLocations,
  updateLocation,
  type ApiLocation,
} from "@/lib/api/inventory";
import { cn } from "@/lib/utils";

export default function InventoryLocationsPage() {
  const canWrite = useAdminCanWrite();
  const { warehouses } = useInventoryWarehouses();
  const [locations, setLocations] = useState<ApiLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ApiLocation | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchLocations();
      setLocations(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load locations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "inventory-locations-api" });
  }, [error]);

  const warehouseName = (id: string) => {
    const w = warehouses.find((w) => w.id === id);
    return w ? `${w.code} — ${w.name}` : id;
  };

  async function handleDelete(location: ApiLocation) {
    if (!confirm(`Delete location "${location.name}"?`)) return;
    setBusyId(location.id);
    try {
      await deleteLocation(location.id);
      toast.success(`${location.name} deleted`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2">
        {canWrite && (
          <Button
            size="sm"
            onClick={() => {
              setEditTarget(null);
              setDrawerOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New location
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Bins and zones within a warehouse — optional finer-grained placement.
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-background">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Code</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Warehouse</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  {canWrite && <th className="px-3 py-2 font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : locations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                      No locations yet. Warehouses work fine without them — add locations only if
                      you need bin-level placement.
                    </td>
                  </tr>
                ) : (
                  locations.map((loc) => (
                    <tr key={loc.id} className="border-b border-border/60 last:border-b-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono text-[11px]">{loc.code}</td>
                      <td className="px-3 py-2 font-medium">{loc.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{warehouseName(loc.warehouse_id)}</td>
                      <td className="px-3 py-2">
                        {loc.is_active ? (
                          <Badge
                            variant="outline"
                            className="rounded-none border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                          >
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="rounded-none text-[10px] text-muted-foreground">
                            Inactive
                          </Badge>
                        )}
                      </td>
                      {canWrite && (
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => {
                                setEditTarget(loc);
                                setDrawerOpen(true);
                              }}
                            >
                              <Pencil className="mr-1 h-3 w-3" /> Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => void handleDelete(loc)}
                              disabled={busyId === loc.id}
                            >
                              <Trash2 className="mr-1 h-3 w-3" /> Delete
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex h-[34px] shrink-0 items-center gap-2 border-t border-border bg-background px-2.5">
        <span className="text-sm font-medium">Locations</span>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh locations">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{loading ? "…" : `${locations.length} locations`}</span>
      </div>

      <LocationDrawer
        key={`${editTarget?.id ?? "new"}:${drawerOpen}`}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        location={editTarget}
        warehouses={warehouses}
        onCreate={async (input) => {
          await createLocation(input);
          await load();
        }}
        onSave={async (id, input) => {
          await updateLocation(id, input);
          await load();
        }}
      />
    </div>
  );
}
