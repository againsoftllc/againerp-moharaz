"use client";

import { useState } from "react";
import { MessageSquare, FileText, Bell, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import type { CustomerTimelineEvent, CustomerComment, CustomerActivity } from "@/lib/mock-data/customers";

// ─── Timeline icon ────────────────────────────────────────────────────────────
function timelineIcon(type: CustomerTimelineEvent["type"]) {
  const base = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px]";
  switch (type) {
    case "registered": return <span className={`${base} bg-emerald-100 dark:bg-emerald-900/30`}>🎉</span>;
    case "order": return <span className={`${base} bg-blue-100 dark:bg-blue-900/30`}>🛒</span>;
    case "return": return <span className={`${base} bg-orange-100 dark:bg-orange-900/30`}>↩️</span>;
    case "wallet": return <span className={`${base} bg-cyan-100 dark:bg-cyan-900/30`}>💳</span>;
    case "reward": return <span className={`${base} bg-yellow-100 dark:bg-yellow-900/30`}>⭐</span>;
    case "support": return <span className={`${base} bg-red-100 dark:bg-red-900/30`}>🎧</span>;
    case "marketing": return <span className={`${base} bg-violet-100 dark:bg-violet-900/30`}>📣</span>;
    case "activity": return <span className={`${base} bg-indigo-100 dark:bg-indigo-900/30`}>📋</span>;
    case "status_change": return <span className={`${base} bg-slate-100 dark:bg-slate-900/30`}>🔄</span>;
    case "ai": return <span className={`${base} bg-purple-100 dark:bg-purple-900/30`}>🤖</span>;
    default: return <span className={`${base} bg-muted`}>📌</span>;
  }
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return formatDate(iso);
}

// ─── Component ────────────────────────────────────────────────────────────────
type Props = {
  timeline: CustomerTimelineEvent[];
  comments: CustomerComment[];
  activities: CustomerActivity[];
  onAddComment: (body: string, isInternal: boolean) => void;
};

type TabId = "all" | "messages" | "activities";

export function CustomerChatter({ timeline, comments, activities, onAddComment }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [compose, setCompose] = useState<"message" | "note" | null>(null);
  const [body, setBody] = useState("");

  const TABS = [
    { id: "all" as const, label: "All" },
    { id: "messages" as const, label: "Messages" },
    { id: "activities" as const, label: "Activities" },
  ];

  const handleSend = () => {
    if (!body.trim()) return;
    onAddComment(body.trim(), compose === "note");
    setBody("");
    setCompose(null);
  };

  return (
    <div className="rounded-xl border border-input bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-input px-4 py-3">
        <h3 className="text-sm font-semibold">Timeline</h3>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={compose === "message" ? "default" : "outline"}
            className="h-7 gap-1 text-[11px]"
            onClick={() => setCompose(compose === "message" ? null : "message")}
          >
            <Send className="h-3 w-3" /> Message
          </Button>
          <Button
            size="sm"
            variant={compose === "note" ? "default" : "outline"}
            className="h-7 gap-1 text-[11px]"
            onClick={() => setCompose(compose === "note" ? null : "note")}
          >
            <FileText className="h-3 w-3" /> Note
          </Button>
        </div>
      </div>

      {/* Compose box */}
      {compose && (
        <div className="border-b border-input bg-muted/20 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            {compose === "note" && (
              <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                Internal note
              </span>
            )}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={compose === "message" ? "Type a message…" : "Type an internal note…"}
            rows={3}
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setCompose(null); setBody(""); }}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSend}>
              {compose === "message" ? "Send" : "Add note"}
            </Button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-input bg-muted/20 px-2 py-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
              activeTab === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Timeline feed */}
      <div className="max-h-[520px] overflow-y-auto p-4">
        {activeTab !== "activities" && (
          <div className="relative space-y-4">
            {/* Comments */}
            {(activeTab === "all" || activeTab === "messages") &&
              comments.map((c) => (
                <div key={c.id} className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                    {c.authorInitials}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{c.author}</span>
                      {c.isInternal && (
                        <span className="rounded bg-yellow-100 px-1 py-0.5 text-[9px] font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                          Internal
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{timeAgo(c.at)}</span>
                    </div>
                    <p className="mt-1 rounded-lg border border-input bg-muted/30 px-3 py-2 text-xs text-foreground">
                      {c.body}
                    </p>
                  </div>
                </div>
              ))}

            {/* Timeline events */}
            {(activeTab === "all") &&
              timeline.map((e) => (
                <div key={e.id} className="flex items-start gap-3">
                  {timelineIcon(e.type)}
                  <div className="min-w-0 flex-1 pt-0.5">
                    <p className="text-xs font-medium">{e.title}</p>
                    {e.description && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{e.description}</p>
                    )}
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {e.actor} · {timeAgo(e.at)}
                    </p>
                  </div>
                </div>
              ))}

            {activeTab === "all" && timeline.length === 0 && comments.length === 0 && (
              <p className="text-center text-xs text-muted-foreground">No timeline events yet.</p>
            )}
          </div>
        )}

        {/* Activities */}
        {(activeTab === "activities") && (
          <div className="space-y-2">
            {activities.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground">No activities yet.</p>
            ) : (
              activities.map((a) => (
                <div
                  key={a.id}
                  className="flex items-start gap-3 rounded-lg border border-input p-3"
                >
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium">{a.title}</p>
                      <span
                        className={cn(
                          "rounded px-1 py-0.5 text-[9px] font-medium",
                          a.status === "done"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                        )}
                      >
                        {a.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {a.assignee ? `Assigned to ${a.assignee}` : "Unassigned"}
                      {a.dueDate ? ` · Due ${formatDate(a.dueDate)}` : ""}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
