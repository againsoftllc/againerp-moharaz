"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, ExternalLink, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate, formatDateTime, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { VendorFormSheet } from "@/components/vendors/vendor-form-sheet";
import { PartyExpenseTab } from "@/components/shared/party-expense-tab";
import {
  fetchVendor,
  fetchVendorAuditLog,
  fetchVendorGroups,
  fetchVendorPortalUsers,
  fetchVendorTypes,
  inviteVendorPortalUser,
  revokeVendorPortalUser,
  type Vendor,
  type VendorAuditLogEntry,
  type VendorGroup,
  type VendorPortalUser,
  type VendorType,
} from "@/lib/api/vendors";
import { fetchVendorCredit, type VendorCreditSummary } from "@/lib/api/vendor-orders";
import { fetchOrderRequests, type VendorOrderRequestAdmin } from "@/lib/api/vendor-orders";
import { fetchQuotations, type VendorQuotation } from "@/lib/api/vendor-quotations";

/** Same core order as Customer/Supplier (Overview, Profile, Terms, Orders, Payment, Expense); the rest are vendor-specific. */
const VENDOR_DETAIL_TABS = [
  "overview",
  "general",
  "terms",
  "order-requests",
  "credit",
  "expense",
  "quotations",
  "portal",
  "activity",
] as const;
type VendorDetailTab = (typeof VENDOR_DETAIL_TABS)[number];

const VENDOR_DETAIL_TAB_LABELS: Record<VendorDetailTab, string> = {
  overview: "Overview",
  general: "Profile",
  terms: "Terms",
  credit: "Payment",
  expense: "Expense",
  "order-requests": "Orders",
  quotations: "Quotations",
  portal: "Portal",
  activity: "Activity",
};

const STATUS_TONE: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  inactive: "border-muted-foreground/30 bg-muted text-muted-foreground",
  blocked: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const ROLE_OPTIONS = ["owner", "purchase_manager", "accounts_manager", "staff"];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-border px-3 py-2 last:border-r-0">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | number | React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-border py-1.5 last:border-b-0">
      <span className="w-[150px] shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 break-words text-xs">{value || "—"}</span>
    </div>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <h3 className="text-xs font-semibold">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      <div className="px-3 py-2">{children}</div>
    </section>
  );
}

function OrderRequestsPanel({ vendorId, router }: { vendorId: string; router: ReturnType<typeof useRouter> }) {
  const [rows, setRows] = React.useState<VendorOrderRequestAdmin[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchOrderRequests({ vendor_id: vendorId }));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <h3 className="text-xs font-semibold">Order requests</h3>
        <span className="text-[11px] text-muted-foreground">{rows.length}</span>
        <Button
          size="sm"
          className="ml-auto h-6 rounded-none text-xs"
          onClick={() => router.push(`/vendors/order-requests/new?vendorId=${vendorId}`)}
        >
          <Plus className="mr-1 h-3 w-3" /> New
        </Button>
      </div>
      {loading ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">No order requests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="border-b border-border text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Request</th>
                <th className="px-3 py-1.5 font-medium">Status</th>
                <th className="px-3 py-1.5 text-right font-medium">Total</th>
                <th className="px-3 py-1.5 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/40"
                  onClick={() => router.push(`/vendors/order-requests`)}
                >
                  <td className="px-3 py-1.5 font-mono text-[11px]">{r.order_request_number}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant="outline" className="rounded-none text-[10px]">
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(r.grand_total)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{formatDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function QuotationsPanel({ vendorId, router }: { vendorId: string; router: ReturnType<typeof useRouter> }) {
  const [rows, setRows] = React.useState<VendorQuotation[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchQuotations({ vendor_id: vendorId }));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <h3 className="text-xs font-semibold">Quotations</h3>
        <span className="text-[11px] text-muted-foreground">{rows.length}</span>
      </div>
      {loading ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">No quotations yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-xs">
            <thead className="border-b border-border text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 font-medium">Quotation</th>
                <th className="px-3 py-1.5 font-medium">Rev</th>
                <th className="px-3 py-1.5 font-medium">Status</th>
                <th className="px-3 py-1.5 text-right font-medium">Total</th>
                <th className="px-3 py-1.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr
                  key={q.id}
                  className="cursor-pointer border-b border-border last:border-b-0 hover:bg-muted/40"
                  onClick={() => router.push(`/vendors/quotations`)}
                >
                  <td className="px-3 py-1.5 font-mono text-[11px]">{q.quotation_number}</td>
                  <td className="px-3 py-1.5">v{q.revision_number}</td>
                  <td className="px-3 py-1.5">
                    <Badge variant="outline" className="rounded-none text-[10px]">
                      {q.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatMoney(q.grand_total)}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{formatDate(q.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function VendorWorkspace({
  vendorId,
  embedded = false,
  onClose,
  onChanged,
}: {
  vendorId: string;
  /** Rendered inside the list drawer: no back arrow, an "open full page" link instead. */
  embedded?: boolean;
  onClose?: () => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const canWrite = useAdminCanWrite();

  const [vendor, setVendor] = React.useState<Vendor | null>(null);
  const [vendorTypes, setVendorTypes] = React.useState<VendorType[]>([]);
  const [vendorGroups, setVendorGroups] = React.useState<VendorGroup[]>([]);
  const [users, setUsers] = React.useState<VendorPortalUser[]>([]);
  const [credit, setCredit] = React.useState<VendorCreditSummary | null>(null);
  const [auditLog, setAuditLog] = React.useState<VendorAuditLogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<VendorDetailTab>("overview");

  const [editOpen, setEditOpen] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteName, setInviteName] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("staff");
  const [inviting, setInviting] = React.useState(false);
  const [lastInviteToken, setLastInviteToken] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [v, types, groups, portalUsers, creditSummary, audit] = await Promise.all([
        fetchVendor(vendorId),
        fetchVendorTypes(),
        fetchVendorGroups(),
        fetchVendorPortalUsers(vendorId),
        fetchVendorCredit(vendorId),
        fetchVendorAuditLog(vendorId),
      ]);
      setVendor(v);
      setVendorTypes(types);
      setVendorGroups(groups);
      setUsers(portalUsers);
      setCredit(creditSummary);
      setAuditLog(audit);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load vendor");
    } finally {
      setLoading(false);
    }
  }, [vendorId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function handleInvite() {
    if (!inviteEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    setInviting(true);
    try {
      const user = await inviteVendorPortalUser(vendorId, {
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        role: inviteRole,
      });
      setLastInviteToken(user.invite_token);
      toast.success(`Invited ${inviteEmail}`);
      setInviteEmail("");
      setInviteName("");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to invite portal user");
    } finally {
      setInviting(false);
    }
  }

  async function handleRevoke(u: VendorPortalUser) {
    if (!window.confirm(`Revoke portal access for ${u.email}?`)) return;
    try {
      await revokeVendorPortalUser(vendorId, u.id);
      toast.success("Access revoked");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke access");
    }
  }

  function copyInviteLink(token: string) {
    const link = `${window.location.origin}/vendor-portal/accept-invite?token=${token}`;
    navigator.clipboard.writeText(link).then(() => toast.success("Invite link copied"));
  }

  if (loading && !vendor) {
    return <div className="p-4 text-sm text-muted-foreground">Loading vendor…</div>;
  }
  if (!vendor) {
    return (
      <div className="p-4">
        <p className="text-sm font-medium">Vendor not found</p>
        <Button size="sm" className="mt-3" onClick={() => (embedded ? onClose?.() : router.push("/vendors"))}>
          {embedded ? "Close" : "Back to directory"}
        </Button>
      </div>
    );
  }

  const typeName = vendorTypes.find((t) => t.id === vendor.vendor_type_id)?.name ?? "—";
  const groupName = vendorGroups.find((g) => g.id === vendor.vendor_group_id)?.name ?? "—";
  const activePortalUsers = users.filter((u) => u.is_active && !u.invite_pending).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          {embedded ? null : (
            <Button variant="ghost" size="sm" className="h-7 rounded-none px-1.5" onClick={() => router.push("/vendors")}>
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{vendor.company_name}</h1>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{vendor.vendor_code}</p>
          </div>
          <Badge variant="outline" className={cn("rounded-none text-[10px]", STATUS_TONE[vendor.status])}>
            {vendor.status.replace(/_/g, " ")}
          </Badge>
          <div className="ml-auto flex items-center gap-2">
            {embedded ? (
              <Button
                variant="outline"
                size="icon"
                className="h-[26px] w-[26px] rounded-none"
                aria-label="Open full page"
                title="Open full page"
                onClick={() => router.push(`/vendors/${vendorId}`)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="icon"
              className="h-[26px] w-[26px] rounded-none"
              aria-label="Refresh"
              onClick={() => void load()}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <Button
              size="sm"
              className="rounded-none"
              onClick={() => router.push(`/vendors/order-requests/new?vendorId=${vendorId}`)}
            >
              Place Order / Quotation
            </Button>
            {canWrite && (
              <Button size="sm" variant="outline" className="rounded-none" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-1.5 h-3 w-3" /> Edit
              </Button>
            )}
          </div>
        </div>

        <div className="flex gap-0.5 overflow-x-auto border-t border-border px-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {VENDOR_DETAIL_TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "shrink-0 border-b-2 px-2.5 py-1.5 text-xs",
                tab === t ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {VENDOR_DETAIL_TAB_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "overview" && (
          <div className="grid grid-cols-2 gap-0 border border-border sm:grid-cols-5">
            <Stat label="Credit limit" value={formatCurrency(Number(vendor.credit_limit), vendor.currency)} />
            <Stat label="Outstanding" value={credit ? formatCurrency(Number(credit.outstanding), vendor.currency) : "—"} />
            <Stat label="Available" value={credit ? formatCurrency(Number(credit.available_credit), vendor.currency) : "—"} />
            <Stat label="Portal users" value={String(activePortalUsers)} />
            <Stat label="Portal access" value={vendor.portal_enabled ? "Enabled" : "Disabled"} />
          </div>
        )}

        {tab === "general" && (
          <div className="space-y-3">
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Identity">
              <Row label="Vendor code" value={vendor.vendor_code} />
              <Row label="Legal name" value={vendor.legal_name || vendor.company_name} />
              <Row label="Display name" value={vendor.display_name} />
              <Row label="Type" value={typeName} />
              <Row label="Group" value={groupName} />
              <Row label="Website" value={vendor.website} />
            </Panel>
            <Panel title="Reach">
              <Row label="Contact person" value={vendor.contact_person} />
              <Row label="Phone" value={vendor.phone} />
              <Row label="Email" value={vendor.email} />
              <Row label="City" value={vendor.city} />
              <Row label="Country" value={vendor.country} />
            </Panel>
          </div>
          </div>
        )}

        {tab === "terms" && (
          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Commercial terms">
              <Row label="Opening balance" value={formatCurrency(Number(vendor.opening_balance ?? 0), vendor.currency)} />
              <Row label="Credit limit" value={formatCurrency(Number(vendor.credit_limit), vendor.currency)} />
              <Row label="Payment terms" value={vendor.payment_terms} />
              <Row label="Payment schedule" value={vendor.payment_schedule ?? undefined} />
              <Row label="Preferred payment" value={vendor.preferred_payment_method} />
              <Row label="Currency" value={vendor.currency} />
            </Panel>
            <Panel title="Registration">
              <Row label="Trade license" value={vendor.trade_license} />
              <Row label="VAT / Tax ID" value={vendor.vat_tax_id} />
              <Row label="BIN / TIN" value={vendor.bin_tin} />
              <Row label="Business reg. no." value={vendor.business_registration_number} />
            </Panel>
            {vendor.addresses.length > 0 && (
              <Panel title="Addresses">
                {vendor.addresses.map((a, i) => (
                  <div key={i} className="border-b border-border py-2 last:border-b-0">
                    <p className="text-xs font-medium">{a.label || `Address ${i + 1}`}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {[a.line1, a.city, a.country].filter(Boolean).join(", ")}
                    </p>
                  </div>
                ))}
              </Panel>
            )}
          </div>
        )}

        {tab === "credit" && (
          <Panel
            title="Credit summary"
            action={credit?.exceeded && (
              <Badge variant="outline" className="rounded-none border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400">
                Over limit
              </Badge>
            )}
          >
            {!credit ? (
              <p className="py-3 text-xs text-muted-foreground">No credit data.</p>
            ) : (
              <>
                <Row label="Credit limit" value={formatCurrency(Number(credit.credit_limit), vendor.currency)} />
                <Row label="Outstanding" value={formatCurrency(Number(credit.outstanding), vendor.currency)} />
                <Row label="Overdue" value={formatCurrency(Number(credit.overdue), vendor.currency)} />
                <Row label="Available credit" value={formatCurrency(Number(credit.available_credit), vendor.currency)} />
                <Row label="Utilization" value={`${Number(credit.utilization_percent).toFixed(1)}%`} />
              </>
            )}
          </Panel>
        )}

        {tab === "expense" && (
          <PartyExpenseTab partyId={vendor.party_id} partyName={vendor.company_name} />
        )}

        {tab === "order-requests" && <OrderRequestsPanel vendorId={vendorId} router={router} />}

        {tab === "quotations" && <QuotationsPanel vendorId={vendorId} router={router} />}

        {tab === "portal" && (
          <section className="border border-border">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
              <h3 className="text-xs font-semibold">Portal users</h3>
              <span className="text-[11px] text-muted-foreground">{users.length}</span>
              {canWrite && (
                <Button
                  size="sm"
                  className="ml-auto h-6 rounded-none text-xs"
                  onClick={() => setInviteOpen(true)}
                  disabled={!vendor.portal_enabled}
                >
                  <Plus className="mr-1 h-3 w-3" /> Invite user
                </Button>
              )}
            </div>
            {!vendor.portal_enabled && (
              <p className="px-3 py-2 text-[11px] text-muted-foreground">
                Enable portal access on this vendor before inviting users.
              </p>
            )}
            {users.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">No portal users yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="border-b border-border text-left text-[11px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">User</th>
                      <th className="px-3 py-1.5 font-medium">Role</th>
                      <th className="px-3 py-1.5 font-medium">Status</th>
                      <th className="px-3 py-1.5 font-medium">Last login</th>
                      <th className="px-3 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b border-border last:border-b-0">
                        <td className="px-3 py-1.5">
                          <div className="font-medium">{u.name || u.email}</div>
                          <div className="text-[11px] text-muted-foreground">{u.email}</div>
                        </td>
                        <td className="px-3 py-1.5 capitalize">{u.role.replace(/_/g, " ")}</td>
                        <td className="px-3 py-1.5">
                          {u.invite_pending ? (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="rounded-none border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400">
                                Invite pending
                              </Badge>
                              {u.invite_token && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 rounded-none"
                                  onClick={() => copyInviteLink(u.invite_token!)}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          ) : (
                            <Badge
                              variant="outline"
                              className={cn("rounded-none text-[10px]", u.is_active ? STATUS_TONE.active : "border-muted-foreground/30 bg-muted text-muted-foreground")}
                            >
                              {u.is_active ? "Active" : "Revoked"}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {u.last_login_at ? formatDateTime(u.last_login_at) : "Never"}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {canWrite && u.is_active && (
                            <button
                              type="button"
                              aria-label="Revoke"
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => void handleRevoke(u)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === "activity" && (
          <Panel title="Activity">
            {auditLog.length === 0 ? (
              <p className="py-3 text-xs text-muted-foreground">No activity recorded.</p>
            ) : (
              auditLog.map((a) => {
                let changes: Record<string, { old: unknown; new: unknown }> = {};
                try {
                  changes = a.details_json ? (JSON.parse(a.details_json) as typeof changes) : {};
                } catch {
                  changes = {};
                }
                const fmt = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
                return (
                  <div key={a.id} className="border-b border-border py-2 last:border-b-0">
                    <p className="text-xs capitalize">{a.action.replace(/_/g, " ")}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDateTime(a.created_at)}
                      {a.performed_by ? ` · ${a.performed_by}` : ""}
                    </p>
                    {Object.keys(changes).length ? (
                      <ul className="mt-1 space-y-0.5">
                        {Object.entries(changes).map(([field, change]) => (
                          <li key={field} className="text-[11px]">
                            <span className="text-muted-foreground">{field.replace(/_/g, " ")}:</span>{" "}
                            <span className="line-through opacity-60">{fmt(change.old)}</span> → <span className="font-medium">{fmt(change.new)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })
            )}
          </Panel>
        )}
      </div>

      <VendorFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        vendor={vendor}
        vendorTypes={vendorTypes}
        vendorGroups={vendorGroups}
        onSaved={(saved) => {
          setVendor(saved);
          onChanged?.();
        }}
      />

      <Sheet
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) setLastInviteToken(null);
        }}
      >
        <SheetContent side="right" title="Invite portal user" className="w-full max-w-sm overflow-y-auto">
          <h2 className="pr-8 text-base font-semibold">Invite Portal User</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            There is no email sender configured yet — copy the invite link and send it yourself.
          </p>

          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="invite_email">Email</Label>
              <Input id="invite_email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="invite_name">Name</Label>
              <Input id="invite_name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="invite_role">Role</Label>
              <Select id="invite_role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {lastInviteToken && (
            <div className="mt-3 flex items-center gap-2 border border-input p-2 text-xs">
              <span className="truncate">Invite link ready</span>
              <Button variant="outline" size="sm" onClick={() => copyInviteLink(lastInviteToken)}>
                <Copy className="mr-1 h-3 w-3" /> Copy link
              </Button>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Close
            </Button>
            <Button onClick={() => void handleInvite()} disabled={inviting}>
              Send invite
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
