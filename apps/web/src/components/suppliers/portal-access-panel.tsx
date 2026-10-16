"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, RefreshCw, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type PortalUser = {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  has_password: boolean;
  invite_pending: boolean;
  invite_expires_at: string | null;
  invite_token: string | null;
  last_login_at: string | null;
  accepted_at: string | null;
};

function inviteUrl(token: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/portal/login?invite=${encodeURIComponent(token)}`;
}

export function PortalAccessPanel({ supplierId }: { supplierId: string }) {
  const canWrite = useAdminCanWrite();
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [freshLink, setFreshLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: PortalUser[] }>(
        `/api/v1/commerce/suppliers/${supplierId}/portal-users`,
      );
      setUsers(res.data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async () => {
    if (!email.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch<{ data: PortalUser }>(
        `/api/v1/commerce/suppliers/${supplierId}/portal-users`,
        { method: "POST", body: JSON.stringify({ email: email.trim(), name: name.trim() }) },
      );
      if (res.data.invite_token) setFreshLink(inviteUrl(res.data.invite_token));
      toast.success(`Invite created for ${res.data.email}`);
      setInviteOpen(false);
      setEmail("");
      setName("");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (user: PortalUser) => {
    try {
      await apiFetch(`/api/v1/commerce/suppliers/${supplierId}/portal-users/${user.id}`, {
        method: "DELETE",
      });
      toast.success(`${user.email} can no longer sign in`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    }
  };

  return (
    <section className="border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <h3 className="text-xs font-semibold">Portal access</h3>
        <span className="text-[11px] text-muted-foreground">
          {users.length} account{users.length === 1 ? "" : "s"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-none"
          aria-label="Refresh portal users"
          onClick={() => void load()}
        >
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
        </Button>
        {canWrite && (
          <Button
            size="sm"
            className="ml-auto h-6 rounded-none text-xs"
            onClick={() => setInviteOpen(true)}
          >
            <UserPlus className="mr-1 h-3 w-3" /> Invite
          </Button>
        )}
      </div>

      {freshLink && (
        <div className="flex items-center gap-2 border-b border-border bg-emerald-500/10 px-3 py-2">
          <KeyRound className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <p className="min-w-0 flex-1 truncate font-mono text-[11px]">{freshLink}</p>
          <Button
            variant="outline"
            size="sm"
            className="h-6 shrink-0 rounded-none text-[11px]"
            onClick={() => {
              void navigator.clipboard.writeText(freshLink);
              toast.success("Invite link copied");
            }}
          >
            <Copy className="mr-1 h-3 w-3" /> Copy
          </Button>
          <button
            type="button"
            className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => setFreshLink(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">Loading…</p>
      ) : users.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
          No portal access yet. Invite someone from this supplier so they can manage their own
          catalog and see their orders.
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead className="border-b border-border text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 font-medium">Email</th>
              <th className="px-3 py-1.5 font-medium">Name</th>
              <th className="px-3 py-1.5 font-medium">State</th>
              <th className="px-3 py-1.5 font-medium">Last sign-in</th>
              <th className="px-3 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-b-0">
                <td className="px-3 py-1.5">{u.email}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{u.name || "—"}</td>
                <td className="px-3 py-1.5">
                  {!u.is_active ? (
                    <Badge variant="outline" className="rounded-none text-[10px] text-muted-foreground">
                      Revoked
                    </Badge>
                  ) : u.invite_pending ? (
                    <Badge
                      variant="outline"
                      className="rounded-none border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
                    >
                      Invite pending
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="rounded-none border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-600 dark:text-emerald-400"
                    >
                      Active
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {u.last_login_at ? u.last_login_at.slice(0, 10) : "—"}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {canWrite && u.is_active && (
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                      onClick={() => void revoke(u)}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent side="right" className="flex w-[400px] max-w-[92vw] flex-col p-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Invite to portal</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              They set their own password from the invite link.
            </p>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@supplier.com"
                className="rounded-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                className="rounded-none"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              This deployment has no email sender yet, so the invite link is shown here for you to
              pass on. It expires in 7 days.
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="outline" size="sm" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!email.trim() || saving} onClick={() => void invite()}>
              {saving ? "Inviting…" : "Create invite"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}
