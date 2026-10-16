"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { enablePartyCommerceRole, type PartyCommerceRole } from "@/lib/api/party-commerce";
import { PartyRolePicker } from "@/components/shared/party-role-picker";
import {
  createVendor,
  updateVendor,
  type Vendor,
  type VendorGroup,
  type VendorType,
  type VendorWrite,
} from "@/lib/api/vendors";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendor?: Vendor | null;
  vendorTypes: VendorType[];
  vendorGroups: VendorGroup[];
  onSaved: (vendor: Vendor) => void;
};

const STATUS_OPTIONS = [
  "invited",
  "pending",
  "under_review",
  "approved",
  "active",
  "suspended",
  "blocked",
  "archived",
];

function emptyForm(): VendorWrite {
  return {
    company_name: "",
    contact_person: "",
    phone: "",
    email: "",
    status: "pending",
    country: "Bangladesh",
    portal_enabled: false,
  };
}

export function VendorFormSheet({ open, onOpenChange, vendor, vendorTypes, vendorGroups, onSaved }: Props) {
  const [form, setForm] = React.useState<VendorWrite>(emptyForm());
  const [saving, setSaving] = React.useState(false);
  const [roles, setRoles] = React.useState<PartyCommerceRole[]>(["vendor"]);

  React.useEffect(() => {
    if (!open) return;
    setRoles(["vendor"]);
    if (vendor) {
      setForm({
        company_name: vendor.company_name,
        legal_name: vendor.legal_name,
        display_name: vendor.display_name,
        contact_person: vendor.contact_person,
        payment_terms: vendor.payment_terms,
        payment_schedule: vendor.payment_schedule ?? undefined,
        phone: vendor.phone,
        email: vendor.email,
        website: vendor.website,
        vendor_type_id: vendor.vendor_type_id,
        vendor_group_id: vendor.vendor_group_id,
        status: vendor.status,
        city: vendor.city,
        state_division: vendor.state_division,
        country: vendor.country,
        postal_code: vendor.postal_code,
        credit_limit: Number(vendor.credit_limit),
        opening_balance: Number(vendor.opening_balance ?? 0),
        currency: vendor.currency,
        notes: vendor.notes,
        portal_enabled: vendor.portal_enabled,
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, vendor]);

  async function handleSave() {
    if (!form.company_name.trim()) {
      toast.error("Company name is required");
      return;
    }
    setSaving(true);
    try {
      const saved = vendor ? await updateVendor(vendor.id, form) : await createVendor(form);
      if (!vendor && saved.party_id) {
        for (const role of roles) {
          if (role !== "vendor") await enablePartyCommerceRole(saved.party_id, role);
        }
      }
      toast.success(vendor ? "Vendor updated" : "Vendor created");
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save vendor");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" title={vendor ? "Edit vendor" : "New vendor"} className="w-full max-w-md overflow-y-auto">
        <h2 className="pr-8 text-base font-semibold">{vendor ? "Edit Vendor" : "New Vendor"}</h2>
        <p className="mt-1 text-xs text-muted-foreground">B2B dealer / distributor / reseller profile.</p>

        {vendor ? null : (
          <PartyRolePicker currentRole="vendor" roles={roles} onChange={setRoles} className="mt-4 mb-0" />
        )}

        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="company_name">Company name</Label>
            <Input
              id="company_name"
              value={form.company_name}
              onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))}
              placeholder="ABC Computers"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="contact_person">Contact person</Label>
              <Input
                id="contact_person"
                value={form.contact_person ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, contact_person: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone ?? ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={form.email ?? ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="vendor_type">Vendor type</Label>
              <Select
                id="vendor_type"
                value={form.vendor_type_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, vendor_type_id: e.target.value || null }))}
              >
                <option value="">—</option>
                {vendorTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="vendor_group">Vendor group</Label>
              <Select
                id="vendor_group"
                value={form.vendor_group_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, vendor_group_id: e.target.value || null }))}
              >
                <option value="">—</option>
                {vendorGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select id="status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="credit_limit">Credit limit (BDT)</Label>
              <Input
                id="credit_limit"
                type="number"
                value={form.credit_limit ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, credit_limit: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="opening_balance">Opening balance (BDT)</Label>
              <Input
                id="opening_balance"
                type="number"
                value={form.opening_balance ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, opening_balance: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label htmlFor="payment_schedule">Payment schedule</Label>
              <Input
                id="payment_schedule"
                placeholder="e.g. Monthly"
                value={form.payment_schedule ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, payment_schedule: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="payment_terms">Payment terms</Label>
              <Input
                id="payment_terms"
                placeholder="e.g. Net 30"
                value={form.payment_terms ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, payment_terms: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://"
                value={form.website ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" value={form.city ?? ""} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="country">Country</Label>
              <Input id="country" value={form.country ?? ""} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
            </div>
          </div>

          <div className="flex items-center justify-between border border-input px-3 py-2">
            <div>
              <div className="text-sm font-medium">Portal access</div>
              <div className="text-xs text-muted-foreground">Lets invited vendor users sign in to the vendor portal.</div>
            </div>
            <Switch
              checked={form.portal_enabled ?? false}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, portal_enabled: checked }))}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {vendor ? "Save changes" : "Create vendor"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
