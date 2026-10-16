"use client";

import { useEffect, useState } from "react";

import {
  DROPSHIP_SHIPPING_METHODS,
  formatKg,
  type DropshipShippingMethod,
  type DropshipShippingResult,
} from "@/lib/sales/dropship-shipping-calc";
import { cn, formatCurrency } from "@/lib/utils";

type Props = {
  summary: DropshipShippingResult;
  shippingMethod: DropshipShippingMethod;
  onShippingMethodChange?: (method: DropshipShippingMethod) => void;
  readOnly?: boolean;
  className?: string;
};

export function SalesOrderPurchasePanel({
  summary,
  shippingMethod,
  onShippingMethodChange,
  readOnly,
  className,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ship = DROPSHIP_SHIPPING_METHODS[shippingMethod];
  const qtySafe = summary.totalPieces;

  const unitWeightLabel = formatKg(summary.unitWeightKg);
  const totalWeightLabel = formatKg(summary.totalWeightKg);
  const weightBadge =
    totalWeightLabel && unitWeightLabel
      ? qtySafe > 1
        ? `Approx. weight: ${totalWeightLabel} (${unitWeightLabel} × ${qtySafe})`
        : `Approximate weight: ${totalWeightLabel}`
      : null;

  useEffect(() => {
    if (!detailsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDetailsOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [detailsOpen]);

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-100 bg-white p-3 shadow-[0_6px_20px_rgba(0,0,0,0.04)] dark:border-border dark:bg-card",
        className,
      )}
    >
      <div className="mb-2.5 grid grid-cols-2 gap-1.5">
        {(Object.keys(DROPSHIP_SHIPPING_METHODS) as DropshipShippingMethod[]).map((key) => {
          const opt = DROPSHIP_SHIPPING_METHODS[key];
          const active = shippingMethod === key;
          return (
            <button
              key={key}
              type="button"
              disabled={readOnly}
              onClick={() => onShippingMethodChange?.(key)}
              className={cn(
                "rounded-lg border p-2 text-left transition-colors",
                readOnly ? "cursor-default" : "cursor-pointer",
                active
                  ? "border-[#d92128] bg-[#fdecea]"
                  : "border-gray-200 bg-white hover:border-gray-300 dark:border-border dark:bg-background",
              )}
            >
              <span
                className={cn(
                  "block text-[12px] font-bold",
                  active ? "text-[#d92128]" : "text-gray-800 dark:text-foreground",
                )}
              >
                {opt.label}
              </span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-tight text-gray-900 dark:text-foreground">
                {opt.rateLabel}
              </span>
              <span className="mt-0.5 block text-[10px] text-gray-500">{opt.eta}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-2.5 rounded-lg border border-[#f0f0f0] bg-[#fafafa] px-2.5 py-2 dark:border-border dark:bg-muted/30">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[12px] font-semibold text-gray-700 dark:text-foreground">
            Selected options
          </span>
          <span className="text-[12px] font-bold text-[#d92128]">{qtySafe} pcs</span>
        </div>
        {summary.orderLines.length > 0 ? (
          <ul className="m-0 max-h-[120px] list-none space-y-1 overflow-y-auto p-0">
            {summary.orderLines.map((line) => (
              <li
                key={`${line.label}-${line.qty}-${line.unitPrice}`}
                className="flex items-center justify-between gap-2 text-[11px] text-gray-600"
              >
                <span className="min-w-0 truncate font-semibold text-gray-800 dark:text-foreground">
                  {line.label} × {line.qty}
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatCurrency(line.unitPrice * line.qty)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[11px] text-gray-400">Add product lines on Order Lines tab</p>
        )}
      </div>

      <div className="mb-2.5 space-y-1 rounded-lg bg-[#fafafa] px-2.5 py-2 text-[12px] dark:bg-muted/30">
        <div className="flex justify-between gap-2">
          <span className="min-w-0 text-gray-500">
            Product
            <span className="mt-0.5 block truncate text-[10px] text-gray-400">
              {summary.optionCount} option(s) · {qtySafe} pcs
            </span>
          </span>
          <strong className="shrink-0 tabular-nums text-gray-900 dark:text-foreground">
            {formatCurrency(summary.productSubtotal)}
          </strong>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-500">Pay now {summary.payNowPercent}%</span>
          <strong className="tabular-nums text-gray-900 dark:text-foreground">
            {formatCurrency(summary.payNowAmount)}
          </strong>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-500">Pay later {100 - summary.payNowPercent}%</span>
          <strong className="tabular-nums text-gray-900 dark:text-foreground">
            {formatCurrency(summary.payLaterAmount)}
          </strong>
        </div>
        <div className="flex justify-between gap-2 border-t border-dashed border-gray-200 pt-1 dark:border-border">
          <span className="text-gray-500">Shipping</span>
          <strong className="tabular-nums text-gray-900 dark:text-foreground">
            {formatCurrency(summary.internationalShipping)}
          </strong>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-gray-500">China courier</span>
          <strong className="tabular-nums text-gray-900 dark:text-foreground">
            {formatCurrency(summary.chinaCourier)}
          </strong>
        </div>
        <div className="flex justify-between gap-2 border-t border-gray-200 pt-1 dark:border-border">
          <span className="font-bold text-gray-800 dark:text-foreground">Total</span>
          <strong className="text-[14px] tabular-nums text-[#d92128]">
            {formatCurrency(summary.grandTotal)}
          </strong>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-[#2f9fc7] px-2 py-1.5 space-y-1.5">
        {weightBadge ? (
          <span className="inline-flex w-fit items-center rounded-full border border-[#ffbb96] bg-[#fff2e8] px-2 py-0.5 text-[10px] font-semibold text-[#d4380d]">
            {weightBadge}
          </span>
        ) : null}
        <p className="m-0 text-[11px] leading-snug text-gray-700 dark:text-muted-foreground">
          শিপিং চার্জ {formatCurrency(ship.rateMin)}/ {formatCurrency(ship.rateMax)} Per Kg{" "}
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            className="cursor-pointer border-0 bg-transparent p-0 font-bold text-[#2f9fc7] hover:underline"
          >
            বিস্তারিত
          </button>
        </p>
      </div>
      <p className="mb-0 mt-1.5 text-[11px] leading-snug text-[#E4004B]">
        *** উল্লেখিত পণ্যের ওজন সম্পূর্ণ সঠিক নয়, আনুমানিক মাত্র। বাংলাদেশে আসার পর পণ্যটির প্রকৃত ওজন মেপে
        শিপিং চার্জ হিসাব করা হবে।
      </p>

      {detailsOpen ? (
        <div
          onClick={() => setDetailsOpen(false)}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="shipping-details-title"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-border">
              <h3 id="shipping-details-title" className="m-0 text-[15px] font-bold text-gray-900 dark:text-foreground">
                শিপিং চার্জ বিস্তারিত
              </h3>
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                aria-label="Close"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#f3f4f6] text-[#d32f2f] transition-colors hover:bg-[#d32f2f] hover:text-white"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 px-4 py-3">
              {weightBadge ? (
                <div className="inline-flex w-fit items-center rounded-full border border-[#ffbb96] bg-[#fff2e8] px-2 py-0.5 text-[10px] font-semibold text-[#d4380d]">
                  {weightBadge}
                </div>
              ) : null}

              <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-border">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[#fafafa] text-gray-600 dark:bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Method</th>
                      <th className="px-3 py-2 font-semibold">Rate / Kg</th>
                      <th className="px-3 py-2 font-semibold">ETA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(DROPSHIP_SHIPPING_METHODS) as DropshipShippingMethod[]).map(
                      (key) => {
                        const opt = DROPSHIP_SHIPPING_METHODS[key];
                        const active = shippingMethod === key;
                        return (
                          <tr
                            key={key}
                            className={active ? "bg-[#fdecea] text-[#d92128]" : "text-gray-800 dark:text-foreground"}
                          >
                            <td className="px-3 py-2 font-semibold">{opt.label}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatCurrency(opt.rateMin)} – {formatCurrency(opt.rateMax)}
                            </td>
                            <td className="px-3 py-2">{opt.eta}</td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>

              <p className="m-0 text-[12px] leading-relaxed text-gray-600 dark:text-muted-foreground">
                পণ্যের ওজন সেলারের তথ্য অনুযায়ী আনুমানিকভাবে দেখানো হয়। চূড়ান্ত শিপিং চার্জ বাংলাদেশে আসার পর
                প্রকৃত ওজন (অথবা volumetric weight) মেপে নির্বাচিত রেট অনুযায়ী হিসাব করা হবে।
              </p>
            </div>

            <div className="border-t border-gray-100 px-4 py-3 dark:border-border">
              <button
                type="button"
                onClick={() => setDetailsOpen(false)}
                className="h-9 w-full cursor-pointer rounded-full bg-[#D32F2F] text-[13px] font-bold text-white transition-colors hover:bg-[#b71c1c]"
              >
                বুঝেছি
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
