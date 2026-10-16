"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ApiUserCreate } from "@/lib/api/auth-users";

const ROLES = [
  { value: "admin", label: "Admin", desc: "Full access" },
  { value: "staff", label: "Staff", desc: "Day-to-day ops" },
  { value: "viewer", label: "Viewer", desc: "Read-only" },
] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: ApiUserCreate) => Promise<void>;
};

export function CreateUserDialog({ open, onOpenChange, onSubmit }: Props) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "staff" | "viewer">("staff");
  const [password, setPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  function reset() {
    setName("");
    setEmail("");
    setUsername("");
    setRole("staff");
    setPassword("");
    setSaving(false);
  }

  function deriveUsername(nameVal: string) {
    return nameVal.toLowerCase().replace(/\s+/g, ".").replace(/[^a-z0-9._-]/g, "").slice(0, 32);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), email: email.trim().toLowerCase(), username: username.trim().toLowerCase(), role, password });
      toast.success(`${name} added successfully`);
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-input bg-card p-6 shadow-lg focus:outline-none">
          <div className="mb-5 flex items-center justify-between">
            <DialogPrimitive.Title className="text-base font-semibold">
              Add team member
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="rounded p-1 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cu-name">Full name</Label>
              <Input
                id="cu-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!username || username === deriveUsername(name)) {
                    setUsername(deriveUsername(e.target.value));
                  }
                }}
                placeholder="Jane Smith"
                required
                minLength={1}
                maxLength={255}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cu-username">Username</Label>
              <Input
                id="cu-username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
                placeholder="jane.smith"
                required
                minLength={3}
                maxLength={64}
              />
              <p className="text-[11px] text-muted-foreground">Login with username or email. Letters, numbers, . _ - only.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cu-email">Email</Label>
              <Input
                id="cu-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Role</Label>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRole(r.value)}
                    className={cn(
                      "flex flex-col rounded-lg border px-3 py-2.5 text-left transition-colors",
                      role === r.value
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-input text-muted-foreground hover:border-muted-foreground/40"
                    )}
                  >
                    <span className="text-xs font-medium">{r.label}</span>
                    <span className="mt-0.5 text-[10px] opacity-70">{r.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cu-pw">Temporary password</Label>
              <Input
                id="cu-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                required
                minLength={6}
                maxLength={128}
              />
              <p className="text-[11px] text-muted-foreground">
                User can change this after first login.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="outline" size="sm">Cancel</Button>
              </DialogPrimitive.Close>
              <Button type="submit" size="sm" disabled={saving}>
                {saving ? "Adding…" : "Add member"}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
