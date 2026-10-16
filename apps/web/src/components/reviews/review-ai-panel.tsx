"use client";

import { useState } from "react";
import { Brain, CheckCircle2, MessageSquare, Shield, Star, Tag, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewAiAnalysis } from "@/lib/mock-data/reviews";

type TabId = "analysis" | "tags" | "response" | "insights";

type Props = { analysis: ReviewAiAnalysis };

export function ReviewAiPanel({ analysis }: Props) {
  const [tab, setTab] = useState<TabId>("analysis");

  const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "analysis", label: "Analysis", icon: Brain },
    { id: "tags", label: "Tags", icon: Tag },
    { id: "response", label: "Response", icon: MessageSquare },
    { id: "insights", label: "Insights", icon: Zap },
  ];

  const sentimentColor = {
    positive: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
    negative: "bg-destructive/10 text-destructive border-destructive/20",
    neutral: "bg-muted text-muted-foreground border-input",
    mixed: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-800",
  }[analysis.sentiment];

  const scoreBar = (score: number, color: string) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="w-8 text-right text-xs font-semibold" style={{ color }}>{score}</span>
    </div>
  );

  return (
    <div className="rounded-xl border border-input bg-card">
      <div className="flex items-center gap-2 border-b border-input px-4 py-3">
        <Zap className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-semibold">AI Analysis</h3>
        <span className={cn("ml-auto rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", sentimentColor)}>
          {analysis.sentiment}
        </span>
        {analysis.isSpam && <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">SPAM</span>}
        {analysis.isDuplicate && <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-700">DUPLICATE</span>}
      </div>

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-input bg-muted/30 px-2 py-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)}
            className={cn("flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
              tab === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-background/60"
            )}>
            <Icon className="h-3 w-3" />{label}
          </button>
        ))}
      </div>

      <div className="p-4 text-xs space-y-3">
        {tab === "analysis" && (
          <>
            {/* Scores */}
            <div className="space-y-2">
              <div><div className="mb-1 flex justify-between"><span className="text-muted-foreground">Sentiment Score</span><span className="font-medium">{analysis.sentimentScore}%</span></div>{scoreBar(analysis.sentimentScore, analysis.sentiment === "positive" ? "#22c55e" : analysis.sentiment === "negative" ? "#ef4444" : "#94a3b8")}</div>
              <div><div className="mb-1 flex justify-between"><span className="text-muted-foreground">Trust Score</span></div>{scoreBar(analysis.trustScore, "#6366f1")}</div>
              <div><div className="mb-1 flex justify-between"><span className="text-muted-foreground">Quality Score</span></div>{scoreBar(analysis.qualityScore, "#f59e0b")}</div>
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="mb-1 font-medium flex items-center gap-1.5"><Brain className="h-3.5 w-3.5" />AI Summary</p>
              <p className="text-muted-foreground leading-relaxed">{analysis.summary}</p>
            </div>

            {/* Pros / Cons */}
            {analysis.prosSummary.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1.5 font-medium text-emerald-600 dark:text-emerald-400">Pros</p>
                  <ul className="space-y-1">
                    {analysis.prosSummary.map((p, i) => <li key={i} className="flex items-start gap-1 text-muted-foreground"><span className="text-emerald-500">+</span>{p}</li>)}
                  </ul>
                </div>
                {analysis.consSummary.length > 0 && (
                  <div>
                    <p className="mb-1.5 font-medium text-destructive">Cons</p>
                    <ul className="space-y-1">
                      {analysis.consSummary.map((c, i) => <li key={i} className="flex items-start gap-1 text-muted-foreground"><span className="text-destructive">−</span>{c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Complaints */}
            {analysis.complaints.length > 0 && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                <p className="mb-1.5 font-semibold text-destructive">Complaints Detected</p>
                <ul className="space-y-1">
                  {analysis.complaints.map((c, i) => <li key={i} className="flex items-start gap-1.5 text-muted-foreground"><span className="text-destructive">⚠</span>{c}</li>)}
                </ul>
              </div>
            )}
          </>
        )}

        {tab === "tags" && (
          <>
            <div>
              <p className="mb-2 font-medium">AI Auto-Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {analysis.autoTags.map((tag) => (
                  <span key={tag} className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary capitalize">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
            {analysis.mostLovedFeatures.length > 0 && (
              <div>
                <p className="mb-2 font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5" /> Most Loved Features
                </p>
                <div className="space-y-1.5">
                  {analysis.mostLovedFeatures.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 dark:bg-emerald-950/20">
                      <span className="text-emerald-500">★</span>
                      <span className="text-muted-foreground">{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-lg border border-input p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" />Spam & Quality</p>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {analysis.isSpam ? <span className="text-destructive">⚠</span> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  <span className="text-muted-foreground">Spam: {analysis.isSpam ? "Detected" : "Not detected"}</span>
                </div>
                <div className="flex items-center gap-2">
                  {analysis.isDuplicate ? <span className="text-yellow-500">⚠</span> : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                  <span className="text-muted-foreground">Duplicate: {analysis.isDuplicate ? "Detected" : "Not detected"}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === "response" && (
          <>
            {analysis.suggestedAdminReply ? (
              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-950/20">
                <p className="mb-2 font-medium text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />AI Suggested Reply
                </p>
                <p className="text-muted-foreground leading-relaxed">{analysis.suggestedAdminReply}</p>
                <button
                  type="button"
                  onClick={() => navigator?.clipboard?.writeText(analysis.suggestedAdminReply)}
                  className="mt-2 text-[10px] text-violet-600 hover:underline dark:text-violet-400"
                >
                  Copy to clipboard
                </button>
              </div>
            ) : (
              <p className="text-muted-foreground">No response suggestion for rejected/spam reviews.</p>
            )}
          </>
        )}

        {tab === "insights" && (
          <div className="space-y-2">
            <p className="font-medium">Product Intelligence</p>
            {analysis.productInsights.length > 0 ? (
              analysis.productInsights.map((insight, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-input p-2.5">
                  <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
                  <p className="text-muted-foreground">{insight}</p>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No product insights available.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
