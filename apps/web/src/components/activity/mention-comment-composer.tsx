"use client";

import { useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { ActivityAvatar } from "@/components/activity/activity-avatar";
import { Button } from "@/components/ui/button";
import {
  filterMentionableUsers,
  getActiveMentionQuery,
  insertMention,
  type MentionableUser,
} from "@/lib/activity/mentions";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  placeholder: string;
  submitLabel?: string;
  userName?: string;
  userInitials?: string;
  users: MentionableUser[];
  currentUserId?: string;
};

export function MentionCommentComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  placeholder,
  submitLabel = "Send",
  userName = "You",
  userInitials = "YO",
  users,
  currentUserId,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursor, setCursor] = useState(0);
  const [highlightIndex, setHighlightIndex] = useState(0);

  const mentionQuery = getActiveMentionQuery(value, cursor);
  const showSuggestions = mentionQuery !== null;

  const suggestions = useMemo(
    () => filterMentionableUsers(users, mentionQuery ?? "", currentUserId),
    [users, mentionQuery, currentUserId],
  );

  const pickUser = (user: MentionableUser) => {
    const next = insertMention(value, cursor, user.username);
    onChange(next.text);
    setCursor(next.cursor);
    setHighlightIndex(0);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.cursor, next.cursor);
    });
  };

  const handleSubmit = () => {
    if (!value.trim()) return;
    onSubmit();
  };

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-2">
      <div className="relative flex items-end gap-2">
        <ActivityAvatar initials={userInitials} name={userName} size="sm" />
        <div className="relative min-w-0 flex-1">
          {showSuggestions && suggestions.length > 0 ? (
            <div className="absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
              {suggestions.map((user, index) => (
                <button
                  key={user.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] transition-colors",
                    index === highlightIndex ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/70",
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickUser(user);
                  }}
                >
                  <span className="font-medium">@{user.username}</span>
                  <span className="truncate text-muted-foreground">{user.name}</span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="rounded-md border border-border bg-background">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                setCursor(e.target.selectionStart ?? e.target.value.length);
              }}
              onClick={(e) => setCursor(e.currentTarget.selectionStart ?? value.length)}
              onKeyUp={(e) => setCursor(e.currentTarget.selectionStart ?? value.length)}
              rows={2}
              placeholder={placeholder}
              className="min-h-[2.25rem] w-full resize-none rounded-md bg-transparent px-2 py-1.5 text-[11px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
              onKeyDown={(e) => {
                if (showSuggestions && suggestions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setHighlightIndex((i) => (i + 1) % suggestions.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHighlightIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    pickUser(suggestions[highlightIndex] ?? suggestions[0]);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setHighlightIndex(0);
                    return;
                  }
                }

                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>
          <p className="mt-1 text-[9px] text-muted-foreground">Type @ to mention a user</p>
        </div>
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 shrink-0 rounded-md"
          onClick={handleSubmit}
          disabled={!value.trim()}
          aria-label={submitLabel}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
      {onCancel ? (
        <div className="mt-1.5 flex justify-end">
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
