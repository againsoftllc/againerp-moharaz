"use client";

import * as React from "react";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoney } from "@/lib/utils";
import {
  createVendorGroup,
  fetchVendorGroups,
  fetchVendorPriceLists,
  updateVendorGroup,
  type VendorGroup,
  type VendorGroupWrite,
  type VendorPriceList,
} from "@/lib/api/vendors";

const STOCK_MODES = ["exact", "availability", "threshold", "hidden"];

function emptyForm(): VendorGroupWrite {
  return {
    code: "",
    name: "",
    default_discount_percent: 0,
    default_credit_limit: 0,
    stock_visibility_mode: "availability",
    requires_order_approval: true,
    is_active: true,
  };
}

export default function VendorGroupsPage() {
  const [groups, setGroups] = React.useState<VendorGroup[]>([]);
  const [priceLists, setPriceLists] = React.useState<VendorPriceList[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<VendorGroup | null>(null);
  const [form, setForm] = React.useState<VendorGroupWrite>(emptyForm());
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [g, pl] = await Promise.all([fetchVendorGroups(), fetchVendorPriceLists()]);
      setGroups(g);
      setPriceLists(pl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load vendor groups");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setSheetOpen(true);
  }

  function openEdit(group: VendorGroup) {
    setEditing(group);
    setForm({
      code: group.code,
      name: group.name,
      description: group.description,
      price_list_id: group.price_list_id,
      default_discount_percent: Number(group.default_discount_percent),
      default_credit_limit: Number(group.default_credit_limit),
      default_payment_terms: group.default_payment_terms,
      min_order_quantity: group.min_order_quantity,
      requires_order_approval: group.requires_order_approval,
      stock_visibility_mode: group.stock_visibility_mode,
      negotiation_enabled: group.negotiation_enabled,
      is_active: group.is_active,
    });
    setSheetOpen(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error("Code and name are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateVendorGroup(editing.id, form);
        toast.success("Group updated");
      } else {
        await createVendorGroup(form);
        toast.success("Group created");
      }
      setSheetOpen(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save group");
    } finally {
      setSaving(false);
    }
  }

  const priceListName = (id: string | null) => priceLists.find((p) => p.id === id)?.name ?? "—";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">Vendor Groups</h1>
          <p className="text-xs text-muted-foreground">Segments controlling default pricing, credit, and stock visibility.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" /> New Group
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Group</TableHead>
              <TableHead>Price list</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead>Credit limit</TableHead>
              <TableHead>Stock visibility</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No vendor groups yet.
                </TableCell>
              </TableRow>
            )}
            {groups.map((g) => (
              <TableRow key={g.id} className="cursor-pointer" onClick={() => openEdit(g)}>
                <TableCell>
                  <div className="font-medium">{g.name}</div>
                  <div className="text-muted-foreground">{g.code}</div>
                </TableCell>
                <TableCell>{priceListName(g.price_list_id)}</TableCell>
                <TableCell>{Number(g.default_discount_percent)}%</TableCell>
                <TableCell>{formatMoney(g.default_credit_limit)}</TableCell>
                <TableCell className="capitalize">{g.stock_visibility_mode}</TableCell>
                <TableCell>{g.requires_order_approval ? "Required" : "Auto"}</TableCell>
                <TableCell>
                  <Badge variant={g.is_active ? "success" : "muted"}>{g.is_active ? "Active" : "Inactive"}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" title={editing ? "Edit vendor group" : "New vendor group"} className="w-full max-w-md overflow-y-auto">
          <h2 className="pr-8 text-base font-semibold">{editing ? "Edit Vendor Group" : "New Vendor Group"}</h2>

          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="code">Code</Label>
                <Input id="code" value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} disabled={!!editing} />
              </div>
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label htmlFor="price_list">Price list</Label>
              <Select
                id="price_list"
                value={form.price_list_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, price_list_id: e.target.value || null }))}
              >
                <option value="">— use product default price —</option>
                {priceLists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="discount">Default discount %</Label>
                <Input
                  id="discount"
                  type="number"
                  value={form.default_discount_percent ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, default_discount_percent: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label htmlFor="credit">Default credit limit</Label>
                <Input
                  id="credit"
                  type="number"
                  value={form.default_credit_limit ?? 0}
                  onChange={(e) => setForm((f) => ({ ...f, default_credit_limit: Number(e.target.value) }))}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="stock_mode">Stock visibility</Label>
              <Select
                id="stock_mode"
                value={form.stock_visibility_mode}
                onChange={(e) => setForm((f) => ({ ...f, stock_visibility_mode: e.target.value }))}
              >
                {STOCK_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="moq">Minimum order quantity</Label>
              <Input
                id="moq"
                type="number"
                value={form.min_order_quantity ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, min_order_quantity: e.target.value ? Number(e.target.value) : null }))}
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {editing ? "Save changes" : "Create group"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
