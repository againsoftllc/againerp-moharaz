"use client";

import { create } from "zustand";

export type SubscriptionInactiveStatus =
  | "suspended"
  | "cancelled"
  | "trial_expired"
  | "subscription_expired";

type SubscriptionStatusState = {
  inactiveStatus: SubscriptionInactiveStatus | null;
  setInactiveStatus: (status: SubscriptionInactiveStatus | null) => void;
};

export const useSubscriptionStatus = create<SubscriptionStatusState>()((set) => ({
  inactiveStatus: null,
  setInactiveStatus: (status) => set({ inactiveStatus: status }),
}));
