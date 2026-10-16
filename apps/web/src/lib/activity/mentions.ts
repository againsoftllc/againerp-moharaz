import type { AdminUser } from "@/lib/store/admin-auth-store";

/** Matches @username tokens in comment text. */
const MENTION_TOKEN = /@([a-zA-Z0-9_-]+)/g;

export type MentionableUser = Pick<AdminUser, "id" | "name" | "username" | "role">;

export function parseMentionUsernames(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(MENTION_TOKEN)) {
    const username = match[1]?.trim();
    if (username) found.add(username.toLowerCase());
  }
  return [...found];
}

export function resolveMentionedUserIds(body: string, users: MentionableUser[]): string[] {
  const tokens = parseMentionUsernames(body);
  const ids = new Set<string>();
  for (const token of tokens) {
    const user = users.find(
      (u) => u.username.toLowerCase() === token || u.name.toLowerCase().replace(/\s+/g, "") === token,
    );
    if (user) ids.add(user.id);
  }
  return [...ids];
}

export function getActiveMentionQuery(text: string, cursor: number): string | null {
  const before = text.slice(0, cursor);
  const match = before.match(/(?:^|\s)@([a-zA-Z0-9_-]*)$/);
  return match ? match[1] ?? "" : null;
}

export function insertMention(text: string, cursor: number, username: string): { text: string; cursor: number } {
  const before = text.slice(0, cursor);
  const after = text.slice(cursor);
  const match = before.match(/(?:^|\s)@([a-zA-Z0-9_-]*)$/);
  if (!match) return { text, cursor };

  const mentionStart = before.length - match[0].length + (match[0].startsWith(" ") ? 1 : 0);
  const prefix = text.slice(0, mentionStart);
  const mention = `@${username} `;
  const nextText = `${prefix}${mention}${after}`;
  return { text: nextText, cursor: prefix.length + mention.length };
}

export function filterMentionableUsers(users: MentionableUser[], query: string, excludeUserId?: string) {
  const q = query.trim().toLowerCase();
  return users
    .filter((u) => u.id !== excludeUserId && u.username)
    .filter((u) => {
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.name.toLowerCase().includes(q)
      );
    })
    .slice(0, 6);
}

export type CommentBodyPart =
  | { type: "text"; value: string }
  | { type: "mention"; value: string };

export function splitCommentBody(body: string): CommentBodyPart[] {
  const parts: CommentBodyPart[] = [];
  let lastIndex = 0;

  for (const match of body.matchAll(MENTION_TOKEN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: body.slice(lastIndex, index) });
    }
    parts.push({ type: "mention", value: match[1] ?? "" });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push({ type: "text", value: body.slice(lastIndex) });
  }

  return parts.length > 0 ? parts : [{ type: "text", value: body }];
}
