"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { createOrderRequestByAdmin, createQuotationFromOrderRequest } from "@/lib/api/vendor-orders";
import { convertQuotationToOrder, transitionQuotation } from "@/lib/api/vendor-quotations";
import { fetchVendor, fetchVendors, searchItems, type ItemOption, type Vendor } from "@/lib/api/vendors";
import { formatMoney } from "@/lib/utils";

type DraftLine = {
  key: string;
  item_id: string;
  sku: string;
  name: string;
  unit_price: string;
  quantity: string;
  discount_amount: string;
  tax_amount: string;
};

export default function NewVendorOrderRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedVendorId = searchParams.get("vendorId");

  const [vendor, setVendor] = React.useState<Vendor | null>(null);
  const [vendorQuery, setVendorQuery] = React.useState("");
  const [vendorMatches, setVendorMatches] = React.useState<Vendor[]>([]);

  const [itemQuery, setItemQuery] = React.useState("");
  const [itemMatches, setItemMatches] = React.useState<ItemOption[]>([]);
  const [lines, setLines] = React.useState<DraftLine[]>([]);

  const [paymentTerms, setPaymentTerms] = React.useState("");
  const [deliveryDate, setDeliveryDate] = React.useState("");
  const [deliveryAddress, setDeliveryAddress] = React.useState("");
  const [vendorNote, setVendorNote] = React.useState("");
  const [internalNote, setInternalNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!preselectedVendorId) return;
    void fetchVendor(preselectedVendorId).then((v) => {
      setVendor(v);
      setPaymentTerms(v.payment_terms ?? "");
    });
  }, [preselectedVendorId]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (vendorQuery.trim().length >= 2) {
        void fetchVendors({ search: vendorQuery, limit: 10 }).then((res) => setVendorMatches(res.data));
      } else {
        setVendorMatches([]);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [vendorQuery]);

  React.useEffect(() => {
    const handle = setTimeout(() => {
      if (itemQuery.trim().length >= 2) void searchItems(itemQuery).then(setItemMatches);
      else setItemMatches([]);
    }, 250);
    return () => clearTimeout(handle);
  }, [itemQuery]);

  function pickVendor(v: Vendor) {
    setVendor(v);
    setPaymentTerms(v.payment_terms ?? "");
    setVendorQuery("");
    setVendorMatches([]);
  }

  function addLine(item: ItemOption) {
    if (lines.some((l) => l.item_id === item.id)) {
      toast.error(`${item.sku} is already in this order`);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        key: item.id,
        item_id: item.id,
        sku: item.sku,
        name: item.name,
        unit_price: "",
        quantity: "1",
        discount_amount: "0",
        tax_amount: "0",
      },
    ]);
    setItemQuery("");
    setItemMatches([]);
  }

  function updateLine(key: string, field: keyof DraftLine, value: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const grandTotal = lines.reduce((sum, l) => {
    const price = Number(l.unit_price) || 0;
    const qty = Number(l.quantity) || 0;
    const tax = Number(l.tax_amount) || 0;
    return sum + price * qty + tax;
  }, 0);

  function validate(): boolean {
    if (!vendor) {
      toast.error("Pick a vendor first");
      return false;
    }
    if (lines.length === 0) {
      toast.error("Add at least one item");
      return false;
    }
    for (const l of lines) {
      if (!l.unit_price || Number(l.unit_price) <= 0) {
        toast.error(`Enter a unit price for ${l.sku}`);
        return false;
      }
      if (!l.quantity || Number(l.quantity) <= 0) {
        toast.error(`Enter a quantity for ${l.sku}`);
        return false;
      }
    }
    return true;
  }

  async function createRequest() {
    if (!vendor) throw new Error("Pick a vendor first");
    return createOrderRequestByAdmin({
      vendor_id: vendor.id,
      payment_terms: paymentTerms || undefined,
      requested_delivery_date: deliveryDate || undefined,
      delivery_address: deliveryAddress || undefined,
      vendor_note: vendorNote || undefined,
      internal_note: internalNote || undefined,
      items: lines.map((l) => ({
        item_id: l.item_id,
        unit_price: Number(l.unit_price),
        quantity: Number(l.quantity),
        discount_amount: Number(l.discount_amount) || 0,
        tax_amount: Number(l.tax_amount) || 0,
      })),
    });
  }

  async function saveAsQuotation() {
    if (!validate()) return;
    setSaving(true);
    try {
      const request = await createRequest();
      const quotation = await createQuotationFromOrderRequest(request.id);
      toast.success(`Quotation ${quotation.quotation_number} created for ${vendor!.company_name}`);
      router.push("/vendors/quotations");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create quotation");
    } finally {
      setSaving(false);
    }
  }

  async function placeOrderDirectly() {
    if (!validate()) return;
    setSaving(true);
    try {
      const request = await createRequest();
      const quotation = await createQuotationFromOrderRequest(request.id);
      await transitionQuotation(quotation.id, "accepted");
      const order = await convertQuotationToOrder(quotation.id);
      toast.success(`Order ${order.order_number} placed for ${vendor!.company_name}`);
      router.push("/vendors/order-requests");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to place order");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/vendors/order-requests")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-base font-semibold">New Vendor Order</h1>
          <p className="text-xs text-muted-foreground">Place a quotation or order for a vendor from the admin side.</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl space-y-6 p-4">
        <div className="space-y-2">
          <Label>Vendor</Label>
          {vendor ? (
            <div className="flex items-center justify-between border border-input px-3 py-2">
              <div>
                <div className="text-sm font-medium">{vendor.company_name}</div>
                <div className="text-xs text-muted-foreground">{vendor.vendor_code}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setVendor(null)}>
                Change
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Input
                placeholder="Search vendor by name or code…"
                value={vendorQuery}
                onChange={(e) => setVendorQuery(e.target.value)}
              />
              {vendorMatches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full border border-input bg-popover shadow-md">
                  {vendorMatches.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => pickVendor(v)}
                    >
                      <div className="font-medium">{v.company_name}</div>
                      <div className="text-xs text-muted-foreground">{v.vendor_code}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label>Items</Label>
          <div className="relative">
            <Input
              placeholder="Search item by SKU or name…"
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
            />
            {itemMatches.length > 0 && (
              <div className="absolute z-10 mt-1 w-full border border-input bg-popover shadow-md">
                {itemMatches.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => addLine(item)}
                  >
                    <span className="font-medium">{item.sku}</span>{" "}
                    <span className="text-muted-foreground">{item.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-28">Unit price</TableHead>
                  <TableHead className="w-28">Discount</TableHead>
                  <TableHead className="w-28">Tax</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.key}>
                    <TableCell>
                      <div className="font-medium">{l.sku}</div>
                      <div className="text-xs text-muted-foreground">{l.name}</div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="1"
                        value={l.quantity}
                        onChange={(e) => updateLine(l.key, "quantity", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.unit_price}
                        onChange={(e) => updateLine(l.key, "unit_price", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.discount_amount}
                        onChange={(e) => updateLine(l.key, "discount_amount", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={l.tax_amount}
                        onChange={(e) => updateLine(l.key, "tax_amount", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => removeLine(l.key)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {lines.length > 0 && (
            <div className="flex justify-end border-t pt-2 text-sm font-medium">
              Grand total: {formatMoney(grandTotal)}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="payment_terms">Payment terms</Label>
            <Input id="payment_terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="delivery_date">Requested delivery date</Label>
            <Input
              id="delivery_date"
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="delivery_address">Delivery address</Label>
          <Textarea
            id="delivery_address"
            rows={2}
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
          />
        </div>

        <div>
          <Label htmlFor="vendor_note">Vendor-visible note</Label>
          <Textarea id="vendor_note" rows={2} value={vendorNote} onChange={(e) => setVendorNote(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="internal_note">Internal note (staff only)</Label>
          <Textarea
            id="internal_note"
            rows={2}
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button onClick={() => void placeOrderDirectly()} disabled={saving}>
            Place Order Directly
          </Button>
          <Button variant="outline" onClick={() => void saveAsQuotation()} disabled={saving}>
            Save as Quotation
          </Button>
        </div>
      </div>
    </div>
  );
}
