import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { findCurrency } from "@/lib/localisation/currency-options";
import {
  formatCompanyDate,
  formatCompanyDateTime,
  formatCompanyTime,
  formatGroupedNumber,
  formatGroupedQuantity,
} from "@/lib/localisation/company-format";
import { getCompanyFormat } from "@/lib/store/company-format-store";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency?: string) {
  const n = Number.isFinite(amount) ? amount : 0;
  const settings = getCompanyFormat();
  const code = (currency || settings.currencyCode || "BDT").toUpperCase();
  const formatted = formatGroupedNumber(Math.abs(n), settings);
  const row = findCurrency(code);
  const symbol = row ? (row.symbol || row.code).trim() : code === "BDT" ? "৳" : code;
  const withSymbol =
    row && (row.position ?? "before") === "after"
      ? `${formatted} ${symbol}`
      : code === "BDT" && !row
        ? `৳${formatted}`
        : `${symbol}${formatted}`;
  return n < 0 ? `−${withSymbol}` : withSymbol;
}

export function formatDate(value?: unknown) {
  return formatCompanyDate(value, getCompanyFormat());
}

export function formatDateTime(value?: unknown) {
  return formatCompanyDateTime(value, getCompanyFormat());
}

export function formatTime(value?: unknown) {
  return formatCompanyTime(value, getCompanyFormat());
}

export function formatMoney(value: unknown, fallback = "—") {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return formatCurrency(n);
}

export function formatQuantity(value: unknown, fallback = "—") {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return formatGroupedQuantity(n, getCompanyFormat());
}

export function formatNumber(amount: number) {
  return formatGroupedNumber(amount, getCompanyFormat());
}

export function formatTimeAgo(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.floor(days / 30);
  if (days < 365) return `${months} month${months === 1 ? "" : "s"} ago`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}
