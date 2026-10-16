"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  CUSTOMER_GROUP_LABELS,
  type Customer,
  type CustomerGroup,
  type QuickAddCustomerInput,
} from "@/lib/mock-data/customers";
import { useCustomerStore } from "@/lib/store/customer-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (customer: Customer) => void;
  initialValues?: Partial<QuickAddCustomerInput>;
};

const GROUPS = Object.keys(CUSTOMER_GROUP_LABELS) as CustomerGroup[];

export function AddCustomerDialog({ open, onOpenChange, onCreated, initialValues }: Props) {
  const addCustomer = useCustomerStore((s) => s.addCustomer);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [group, setGroup] = useState<CustomerGroup>("retail");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Dhaka");
  const [region, setRegion] = useState("Dhaka Division");

  useEffect(() => {
    if (!open) return;
    setName(initialValues?.name ?? "");
    setPhone(initialValues?.phone ?? "");
    setEmail(initialValues?.email ?? "");
    setGroup(initialValues?.group ?? "retail");
    setAddress(initialValues?.address ?? "");
    setCity(initialValues?.city ?? "Dhaka");
    setRegion(initialValues?.region ?? "Dhaka Division");
  }, [open, initialValues]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Customer name is required");
      return;
    }
    if (!phone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    const customer = addCustomer({
      name,
      phone,
      email,
      group,
      address,
      city,
      region,
      country: "Bangladesh",
    });

    toast.success(`${customer.name} added`);
    onCreated?.(customer);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-md gap-0 overflow-hidden p-0 sm:max-w-md [&>button.absolute]:hidden"
        aria-describedby={undefined}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="shrink-0 border-b border-input bg-muted/20 px-5 py-4">
            <p className="text-[11px] text-muted-foreground">AgainERP › Customers</p>
            <h2 className="text-base font-semibold">Add Customer</h2>
          </div>

          {/* Form body */}
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">

              {/* Basic info */}
              <div className="overflow-hidden rounded-xl border border-input/70 bg-card shadow-sm">
                <div className="border-b border-input/60 bg-muted/20 px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basic Info</p>
                </div>
                <div className="space-y-3 p-4">
                  <Field label="Full name *">
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer full name" autoFocus />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Phone *">
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" />
                    </Field>
                    <Field label="Email">
                      <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
                    </Field>
                  </div>
                  <Field label="Customer group">
                    <Select value={group} onChange={(e) => setGroup(e.target.value as CustomerGroup)}>
                      {GROUPS.map((g) => (
                        <option key={g} value={g}>
                          {CUSTOMER_GROUP_LABELS[g]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>

              {/* Address */}
              <div className="overflow-hidden rounded-xl border border-input/70 bg-card shadow-sm">
                <div className="border-b border-input/60 bg-muted/20 px-4 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Address</p>
                </div>
                <div className="space-y-3 p-4">
                  <Field label="Street address">
                    <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, house no." />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="City">
                      <Input value={city} onChange={(e) => setCity(e.target.value)} />
                    </Field>
                    <Field label="Region">
                      <Input value={region} onChange={(e) => setRegion(e.target.value)} />
                    </Field>
                  </div>
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-input bg-background px-5 py-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit">
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Add customer
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
