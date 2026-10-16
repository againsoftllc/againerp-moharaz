"use client";

import { useState } from "react";
import {
  Zap,
  TrendingDown,
  ShoppingBag,
  Megaphone,
  Brain,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CustomerAiInsights, RiskLevel } from "@/lib/mock-data/customers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(level: RiskLevel) {
  if (level === "high") return "text-destructive";
  if (level === "medium") return "text-yellow-600 dark:text-yellow-400";
  return "text-emerald-600 dark:text-emerald-400";
}

function riskBg(level: RiskLevel) {
  if (level === "high") return "bg-destructive/10 border-destructive/20";
  if (level === "medium") return "bg-yellow-500/10 border-yellow-500/20";
  return "bg-emerald-500/10 border-emerald-500/20";
}

function riskBar(level: RiskLevel) {
  if (level === "high") return "bg-destructive";
  if (level === "medium") return "bg-yellow-500";
  return "bg-emerald-500";
}

// ─── Retention Ring (SVG) ─────────────────────────────────────────────────────

function RetentionRing({ pct }: { pct: number }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 70 ? "#10b981" : pct >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
      <circle cx="36" cy="36" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
      />
      <text x="36" y="40" textAnchor="middle" fontSize="13" fontWeight="700" fill={color}>
        {pct}%
      </text>
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

type TabId = "summary" | "churn" | "products" | "marketing";

type Props = { insights: CustomerAiInsights };

export function CustomerAiInsightsPanel({ insights }: Props) {
  const [tab, setTab] = useState<TabId>("summary");

  const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "summary", label: "Summary", icon: Brain },
    { id: "churn", label: "Churn", icon: TrendingDown },
    { id: "products", label: "Products", icon: ShoppingBag },
    { id: "marketing", label: "Campaign", icon: Megaphone },
  ];

  return (
    <div className="rounded-xl border border-input bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-input px-4 py-3">
        <Zap className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-semibold">AI Intelligence</h3>
        <span
          className={cn(
            "ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
            riskBg(insights.churnRisk),
            riskColor(insights.churnRisk),
          )}
        >
          {insights.churnRisk} churn risk
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-input bg-muted/30 px-2 py-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      <div className="p-4 text-xs">
        {/* ── Summary tab ── */}
        {tab === "summary" && (
          <div className="space-y-3">
            {/* Retention ring + summary */}
            <div className="flex items-start gap-3">
              <RetentionRing pct={insights.retentionProbability} />
              <div className="flex-1">
                <p className="text-[10px] font-semibold text-muted-foreground">Retention Probability</p>
                <p className="mt-1 text-muted-foreground leading-relaxed text-[11px]">
                  {insights.summary}
                </p>
              </div>
            </div>

            {/* Purchase summary */}
            <div className="rounded-lg bg-muted/40 p-3">
              <div className="mb-1 flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="font-medium">Purchase Intelligence</p>
              </div>
              <p className="text-muted-foreground leading-relaxed">{insights.purchaseSummary}</p>
            </div>

            {/* KPI mini grid */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-input p-2.5 text-center">
                <p className="text-[10px] text-muted-foreground">Predicted LTV</p>
                <p className="text-base font-bold text-violet-600 dark:text-violet-400">
                  ৳{(insights.predictedLtv / 1000).toFixed(0)}K
                </p>
              </div>
              <div className="rounded-lg border border-input p-2.5 text-center">
                <p className="text-[10px] text-muted-foreground">Retention</p>
                <p className={cn("text-base font-bold", riskColor(insights.churnRisk === "low" ? "low" : insights.churnRisk))}>
                  {insights.retentionProbability}%
                </p>
              </div>
            </div>

            {/* Favorite categories */}
            {insights.favoriteCategories.length > 0 && (
              <div>
                <p className="mb-1.5 font-medium">Favorite Categories</p>
                <div className="flex flex-wrap gap-1">
                  {insights.favoriteCategories.map((cat) => (
                    <span
                      key={cat}
                      className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Favorite brands */}
            {insights.favoriteBrands.length > 0 && (
              <div>
                <p className="mb-1.5 font-medium">Favorite Brands</p>
                <div className="flex flex-wrap gap-1">
                  {insights.favoriteBrands.map((b) => (
                    <span key={b} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Churn tab ── */}
        {tab === "churn" && (
          <div className="space-y-3">
            {/* Score card */}
            <div className={cn("rounded-lg border p-3", riskBg(insights.churnRisk))}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">Churn Risk Score</p>
                <p className={cn("text-3xl font-black", riskColor(insights.churnRisk))}>
                  {insights.churnScore}%
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", riskBar(insights.churnRisk))}
                  style={{ width: `${insights.churnScore}%` }}
                />
              </div>
              <p className={cn("mt-1.5 text-[10px] font-semibold uppercase tracking-wide", riskColor(insights.churnRisk))}>
                {insights.churnRisk === "low"
                  ? "This customer is stable and loyal."
                  : insights.churnRisk === "medium"
                  ? "Monitor closely — moderate risk detected."
                  : "Immediate action required — high churn risk!"}
              </p>
            </div>

            {/* Retention ring */}
            <div className="flex items-center gap-3 rounded-lg border border-input p-3">
              <RetentionRing pct={insights.retentionProbability} />
              <div>
                <p className="font-medium">Retention Probability</p>
                <p className="text-muted-foreground">
                  {insights.retentionProbability >= 70
                    ? "High likelihood of staying active."
                    : insights.retentionProbability >= 40
                    ? "Moderate — needs engagement."
                    : "Low — immediate win-back needed."}
                </p>
              </div>
            </div>

            {/* Risk factors */}
            {insights.churnReasons.length > 0 ? (
              <div>
                <p className="mb-2 font-medium">Risk Factors</p>
                <div className="space-y-1.5">
                  {insights.churnReasons.map((reason, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-lg bg-destructive/5 px-2.5 py-2 text-muted-foreground"
                    >
                      <span className="mt-0.5 shrink-0 text-destructive">⚠</span>
                      {reason}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-lg bg-emerald-50 px-3 py-2.5 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
                ✓ No churn risk factors detected. Customer is in good standing.
              </div>
            )}
          </div>
        )}

        {/* ── Products tab ── */}
        {tab === "products" && (
          <div className="space-y-3">
            <p className="font-medium text-muted-foreground">AI Recommended Products</p>
            {insights.recommendedProducts.map((p, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-lg border border-input p-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-100 text-sm dark:bg-yellow-900/30">
                  ⭐
                </div>
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-muted-foreground">{p.reason}</p>
                </div>
              </div>
            ))}

            {insights.favoriteCategories.length > 0 && (
              <div className="mt-1 rounded-lg border border-input p-3">
                <p className="mb-2 font-medium">Top Categories for Cross-Sell</p>
                <div className="space-y-1.5">
                  {insights.favoriteCategories.map((cat, i) => (
                    <div key={cat} className="flex items-center gap-2">
                      <span className="w-4 text-center text-[10px] font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="mb-0.5 flex items-center justify-between">
                          <span>{cat}</span>
                          <span className="text-muted-foreground">{90 - i * 12}%</span>
                        </div>
                        <div className="h-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${90 - i * 12}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Marketing / Campaign tab ── */}
        {tab === "marketing" && (
          <div className="space-y-3">
            <p className="font-medium text-muted-foreground">AI Marketing Suggestions</p>
            {insights.marketingSuggestions.map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/20"
              >
                <Megaphone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                <p className="text-muted-foreground">{s}</p>
              </div>
            ))}

            <div className="rounded-lg border border-input p-3">
              <p className="mb-2 font-medium">Best Channels for This Customer</p>
              {[
                { channel: "SMS Campaign", score: 85, icon: "📱" },
                { channel: "Email Newsletter", score: 72, icon: "✉️" },
                { channel: "Push Notification", score: 60, icon: "🔔" },
                { channel: "WhatsApp", score: 45, icon: "💬" },
              ].map((ch) => (
                <div key={ch.channel} className="mb-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>{ch.icon}</span>
                      {ch.channel}
                    </span>
                    <span className="text-muted-foreground">{ch.score}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${ch.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
