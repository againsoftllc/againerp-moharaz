"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Mail, MapPin, Phone } from "lucide-react";
import {
  CUSTOMER_STATUS_LABELS,
  type Customer,
  type CustomerStatus,
} from "@/lib/mock-data/customers";
import { KanbanColumn } from "@/components/shared/kanban/kanban-column";
import { cn } from "@/lib/utils";

const COLUMNS: CustomerStatus[] = ["active", "vip", "inactive", "blocked"];

type Props = {
  customers: Customer[];
  loading?: boolean;
  listFilter?: "all" | CustomerStatus;
  searchQuery?: string;
  canWrite?: boolean;
  onOpenCustomer?: (customer: Customer) => void;
  onStatusChange?: (id: string, status: CustomerStatus) => void | Promise<void>;
  className?: string;
};

function matchesFilter(customer: Customer, listFilter: Props["listFilter"], searchQuery?: string) {
  if (listFilter && listFilter !== "all" && customer.status !== listFilter) return false;
  if (!searchQuery?.trim()) return true;
  const q = searchQuery.trim().toLowerCase();
  return (
    customer.name.toLowerCase().includes(q) ||
    customer.phone.toLowerCase().includes(q) ||
    customer.email.toLowerCase().includes(q) ||
    customer.customerId.toLowerCase().includes(q) ||
    customer.city.toLowerCase().includes(q)
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function CustomerKanbanCard({
  customer,
  dragging,
  onOpen,
}: {
  customer: Customer;
  dragging?: boolean;
  onOpen?: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-colors",
        dragging ? "opacity-40" : "hover:border-[#714B67]/40 hover:bg-accent/30",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left"
      >
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#714B67]/10 text-[11px] font-bold text-[#714B67] dark:bg-[#714B67]/20 dark:text-[#c4a0bc]">
            {initials(customer.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{customer.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{customer.customerId}</p>
          </div>
        </div>
        <div className="mt-2 space-y-1">
          {customer.phone ? (
            <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <Phone className="h-3 w-3 shrink-0" />
              {customer.phone}
            </p>
          ) : null}
          {customer.email ? (
            <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <Mail className="h-3 w-3 shrink-0" />
              {customer.email}
            </p>
          ) : null}
          {customer.city ? (
            <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              {customer.city}
            </p>
          ) : null}
        </div>
        {customer.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {customer.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </button>
    </div>
  );
}

function DraggableCustomerCard({
  customer,
  canDrag,
  onOpen,
}: {
  customer: Customer;
  canDrag: boolean;
  onOpen?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: customer.id,
    data: { customer, status: customer.status },
    disabled: !canDrag,
  });

  return (
    <div ref={setNodeRef} {...(canDrag ? { ...listeners, ...attributes } : {})} className={cn(canDrag && "cursor-grab active:cursor-grabbing")}>
      <CustomerKanbanCard customer={customer} dragging={isDragging} onOpen={onOpen} />
    </div>
  );
}

export function CustomerKanban({
  customers,
  loading,
  listFilter = "all",
  searchQuery,
  canWrite = false,
  onOpenCustomer,
  onStatusChange,
  className,
}: Props) {
  const [activeCustomer, setActiveCustomer] = useState<Customer | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const filtered = useMemo(
    () => customers.filter((c) => matchesFilter(c, listFilter, searchQuery)),
    [customers, listFilter, searchQuery],
  );

  const byStatus = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map((s) => [s, [] as Customer[]])) as Record<
      CustomerStatus,
      Customer[]
    >;
    for (const customer of filtered) {
      map[customer.status]?.push(customer);
    }
    return map;
  }, [filtered]);

  const handleDragStart = (event: DragStartEvent) => {
    const customer = event.active.data.current?.customer as Customer | undefined;
    setActiveCustomer(customer ?? null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveCustomer(null);
    const customer = event.active.data.current?.customer as Customer | undefined;
    const overId = event.over?.id;
    if (!customer || !overId || !canWrite || !onStatusChange) return;

    const nextStatus = String(overId) as CustomerStatus;
    if (!COLUMNS.includes(nextStatus) || customer.status === nextStatus) return;

    await onStatusChange(customer.id, nextStatus);
  };

  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col bg-background px-3 py-3", className)}
      data-component="again_kanban_renderer"
    >
      {canWrite ? (
        <p className="mb-2 px-1 text-[11px] text-muted-foreground">
          Drag cards between columns to change contact status.
        </p>
      ) : null}

      {loading ? (
        <p className="px-2 py-8 text-center text-sm text-muted-foreground">Loading customers…</p>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={(e) => void handleDragEnd(e)}>
          <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
            {COLUMNS.map((status) => {
              const column = byStatus[status] ?? [];
              return (
                <KanbanColumn
                  key={status}
                  id={status}
                  title={CUSTOMER_STATUS_LABELS[status]}
                  subtitle={`${column.length} contact${column.length === 1 ? "" : "s"}`}
                >
                  {column.length === 0 ? (
                    <p className="px-2 py-6 text-center text-[11px] text-muted-foreground">
                      No contacts
                    </p>
                  ) : (
                    column.map((customer) => (
                      <DraggableCustomerCard
                        key={customer.id}
                        customer={customer}
                        canDrag={canWrite}
                        onOpen={() => onOpenCustomer?.(customer)}
                      />
                    ))
                  )}
                </KanbanColumn>
              );
            })}
          </div>

          <DragOverlay>
            {activeCustomer ? (
              <CustomerKanbanCard customer={activeCustomer} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
