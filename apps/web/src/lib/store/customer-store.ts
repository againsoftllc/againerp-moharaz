import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type Customer,
  type CustomerStatus,
  type CustomerComment,
  type CustomerTimelineEvent,
  type QuickAddCustomerInput,
  buildCustomerFromQuickAdd,
  customersSeed,
} from "@/lib/mock-data/customers";

type CustomerStore = {
  customers: Customer[];
  getById: (id: string) => Customer | undefined;
  addCustomer: (input: QuickAddCustomerInput) => Customer;
  patchCustomer: (id: string, patch: Partial<Customer>) => void;
  updateStatus: (id: string, status: CustomerStatus) => void;
  addTimelineEntry: (id: string, entry: Omit<CustomerTimelineEvent, "id">) => void;
  addComment: (id: string, comment: Omit<CustomerComment, "id">) => void;
};

export const useCustomerStore = create<CustomerStore>()(
  persist(
    (set, get) => ({
      customers: customersSeed,

      getById: (id) => get().customers.find((c) => c.id === id),

      addCustomer: (input) => {
        const customer = buildCustomerFromQuickAdd(input);
        set((s) => ({ customers: [customer, ...s.customers] }));
        return customer;
      },

      patchCustomer: (id, patch) =>
        set((s) => ({
          customers: s.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      updateStatus: (id, status) => {
        const c = get().getById(id);
        if (!c) return;
        set((s) => ({
          customers: s.customers.map((cu) =>
            cu.id === id ? { ...cu, status } : cu,
          ),
        }));
        get().addTimelineEntry(id, {
          type: "status_change",
          title: `Status changed to ${status}`,
          actor: "Admin",
          actorInitials: "AD",
          at: new Date().toISOString(),
        });
      },

      addTimelineEntry: (id, entry) =>
        set((s) => ({
          customers: s.customers.map((c) =>
            c.id === id
              ? {
                  ...c,
                  timeline: [
                    { id: `tl_${Date.now()}`, ...entry },
                    ...c.timeline,
                  ],
                }
              : c,
          ),
        })),

      addComment: (id, comment) =>
        set((s) => ({
          customers: s.customers.map((c) =>
            c.id === id
              ? {
                  ...c,
                  comments: [
                    { id: `cm_${Date.now()}`, ...comment },
                    ...c.comments,
                  ],
                }
              : c,
          ),
        })),
    }),
    { name: "againerp-customers" },
  ),
);
