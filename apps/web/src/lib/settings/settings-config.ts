import {
  Bell,
  CreditCard,
  Globe,
  Megaphone,
  Package,
  ShoppingCart,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type BusinessCategoryTheme = {
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  ring: string;
};

export const BUSINESS_CATEGORY_GROUPS = [
  {
    id: "core",
    title: "Store & Operations",
    description: "Identity, catalog, customers, and order flow",
    categoryIds: ["store", "catalog", "customers", "orders"],
  },
  {
    id: "commerce",
    title: "Checkout & Fulfillment",
    description: "Payments, checkout rules, and delivery",
    categoryIds: ["checkout", "payments", "shipping"],
  },
  {
    id: "growth",
    title: "Marketing & Visibility",
    description: "Promotions, SEO, and notifications",
    categoryIds: ["marketing", "seo", "notifications"],
  },
] as const;

export const BUSINESS_CATEGORY_THEME: Record<string, BusinessCategoryTheme> = {
  store: {
    icon: Store,
    accent: "text-indigo-600 dark:text-indigo-400",
    iconBg: "bg-indigo-50 dark:bg-indigo-950/50",
    ring: "group-hover:ring-indigo-200 dark:group-hover:ring-indigo-800",
  },
  catalog: {
    icon: Package,
    accent: "text-violet-600 dark:text-violet-400",
    iconBg: "bg-violet-50 dark:bg-violet-950/50",
    ring: "group-hover:ring-violet-200 dark:group-hover:ring-violet-800",
  },
  customers: {
    icon: Users,
    accent: "text-sky-600 dark:text-sky-400",
    iconBg: "bg-sky-50 dark:bg-sky-950/50",
    ring: "group-hover:ring-sky-200 dark:group-hover:ring-sky-800",
  },
  orders: {
    icon: ShoppingCart,
    accent: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-50 dark:bg-emerald-950/50",
    ring: "group-hover:ring-emerald-200 dark:group-hover:ring-emerald-800",
  },
  checkout: {
    icon: CreditCard,
    accent: "text-rose-600 dark:text-rose-400",
    iconBg: "bg-rose-50 dark:bg-rose-950/50",
    ring: "group-hover:ring-rose-200 dark:group-hover:ring-rose-800",
  },
  payments: {
    icon: CreditCard,
    accent: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-50 dark:bg-amber-950/50",
    ring: "group-hover:ring-amber-200 dark:group-hover:ring-amber-800",
  },
  shipping: {
    icon: Truck,
    accent: "text-cyan-600 dark:text-cyan-400",
    iconBg: "bg-cyan-50 dark:bg-cyan-950/50",
    ring: "group-hover:ring-cyan-200 dark:group-hover:ring-cyan-800",
  },
  marketing: {
    icon: Megaphone,
    accent: "text-pink-600 dark:text-pink-400",
    iconBg: "bg-pink-50 dark:bg-pink-950/50",
    ring: "group-hover:ring-pink-200 dark:group-hover:ring-pink-800",
  },
  seo: {
    icon: Globe,
    accent: "text-teal-600 dark:text-teal-400",
    iconBg: "bg-teal-50 dark:bg-teal-950/50",
    ring: "group-hover:ring-teal-200 dark:group-hover:ring-teal-800",
  },
  notifications: {
    icon: Bell,
    accent: "text-orange-600 dark:text-orange-400",
    iconBg: "bg-orange-50 dark:bg-orange-950/50",
    ring: "group-hover:ring-orange-200 dark:group-hover:ring-orange-800",
  },
};
