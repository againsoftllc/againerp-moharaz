"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import { FilterSelect } from "@/components/shared/filter-select";
import { ListGridHeaderStart } from "@/components/shared/list-grid-header-start";
import { TicketDrawer, type TicketInput } from "@/components/crm/ticket-drawer";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { createCrmTicket, fetchCrmTickets, transitionCrmTicketStatus, updateCrmTicket, type ApiCrmTicket } from "@/lib/api/crm";
import { cn } from "@/lib/utils";

const STATUS_OPTIONS = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"];

function priorityVariant(priority: string) {
  if (priority === "urgent" || priority === "high") return "warning" as const;
  if (priority === "low") return "muted" as const;
  return "outline" as const;
}

function statusVariant(status: string) {
  if (status === "resolved" || status === "closed") return "success" as const;
  if (status === "waiting_on_customer") return "warning" as const;
  return "outline" as const;
}

type DrawerState = { mode: "closed" } | { mode: "create" } | { mode: "edit"; ticket: ApiCrmTicket };

export default function CrmTicketsPage() {
  const canWrite = useAdminCanWrite();
  const [rows, setRows] = useState<ApiCrmTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [drawer, setDrawer] = useState<DrawerState>({ mode: "closed" });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCrmTickets({ status, priority, search: search || undefined });
      setRows(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  }, [status, priority, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (error) toast.error(`API: ${error}`, { id: "crm-tickets-api" });
  }, [error]);

  async function handleStatusChange(ticket: ApiCrmTicket, next: string) {
    if (next === ticket.status) return;
    setBusyId(ticket.id);
    try {
      const res = await transitionCrmTicketStatus(ticket.id, next);
      setRows((prev) => prev.map((r) => (r.id === ticket.id ? res.data : r)));
      toast.success(`${ticket.ticket_number} moved to ${next.replace("_", " ")}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update ticket");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 border-b border-border py-1 pl-2 pr-2">
        <ListGridHeaderStart title="Tickets">
          {canWrite && (
            <Button size="sm" onClick={() => setDrawer({ mode: "create" })}>
              New
            </Button>
          )}
        </ListGridHeaderStart>
        <Input placeholder="Search subject, #, contact…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px] shrink-0 rounded-none" />
        <FilterSelect
          value={status}
          onChange={setStatus}
          width="w-[160px]"
          ariaLabel="Status filter"
          options={[
            { value: "all", label: "All statuses" },
            { value: "open", label: "Open" },
            { value: "in_progress", label: "In progress" },
            { value: "waiting_on_customer", label: "Waiting on customer" },
            { value: "resolved", label: "Resolved" },
            { value: "closed", label: "Closed" },
          ]}
        />
        <FilterSelect
          value={priority}
          onChange={setPriority}
          width="w-[120px]"
          ariaLabel="Priority filter"
          options={[
            { value: "all", label: "All priorities" },
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
            { value: "urgent", label: "Urgent" },
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-3">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none border border-border bg-background">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="sticky top-0 z-[1] border-b border-border bg-muted/50 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Ticket #</th>
                  <th className="px-3 py-2 font-medium">Subject</th>
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Priority</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">Loading…</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">No tickets.</td>
                  </tr>
                ) : (
                  rows.map((ticket) => (
                    <tr
                      key={ticket.id}
                      className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-muted/30"
                      onClick={() => setDrawer({ mode: "edit", ticket })}
                    >
                      <td className="px-3 py-2 font-medium">{ticket.ticket_number}</td>
                      <td className="px-3 py-2">{ticket.subject}</td>
                      <td className="px-3 py-2 text-muted-foreground">{ticket.contact_name ?? ticket.customer_name ?? "—"}</td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">{ticket.category}</td>
                      <td className="px-3 py-2">
                        <Badge variant={priorityVariant(ticket.priority)} className="capitalize">
                          {ticket.priority}
                        </Badge>
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {canWrite ? (
                          <Select
                            value={ticket.status}
                            onChange={(e) => void handleStatusChange(ticket, e.target.value)}
                            disabled={busyId === ticket.id}
                            className="h-6 w-[170px] rounded-none text-xs capitalize"
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s} className="capitalize">
                                {s.replace(/_/g, " ")}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Badge variant={statusVariant(ticket.status)} className="capitalize">
                            {ticket.status.replace(/_/g, " ")}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="flex h-[34px] shrink-0 items-center gap-2 border-t border-border bg-background px-2.5">
        <span className="text-sm font-medium">Support Tickets</span>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} aria-label="Refresh tickets">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">{loading ? "…" : `${rows.length} shown`}</span>
      </div>

      <TicketDrawer
        open={drawer.mode !== "closed"}
        onOpenChange={(open) => {
          if (!open) setDrawer({ mode: "closed" });
        }}
        ticket={drawer.mode === "edit" ? drawer.ticket : null}
        onCreate={async (input: TicketInput) => {
          const created = await createCrmTicket(input);
          setRows((prev) => [created.data, ...prev]);
        }}
        onSave={async (id, input: TicketInput) => {
          const updated = await updateCrmTicket(id, input);
          setRows((prev) => prev.map((r) => (r.id === id ? updated.data : r)));
        }}
      />
    </div>
  );
}
