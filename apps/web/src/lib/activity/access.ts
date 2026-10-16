import type { ActivityComment, ActivityEntry } from "@/lib/activity/types";
import type { AdminUser } from "@/lib/store/admin-auth-store";

export type ActivityScope = "all" | "mine";

/** Only admins can browse every user's activity on a record. */
export function canViewAllActivities(role: string | undefined): boolean {
  return role === "admin";
}

function initialsFor(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function isOwnActivity(entry: ActivityEntry, user: AdminUser | null): boolean {
  if (!user) return false;
  if (entry.actorId && entry.actorId === user.id) return true;
  if (entry.actor === user.name || entry.actor === "You") return true;
  if (user.role === "admin" && entry.actor === "Admin") return true;
  return false;
}

export function isOwnComment(comment: ActivityComment, user: AdminUser | null): boolean {
  if (!user) return false;
  if (comment.authorId && comment.authorId === user.id) return true;
  if (comment.author === user.name || comment.author === "You") return true;
  if (user.role === "admin" && comment.author === "Admin") return true;
  return false;
}

export function filterActivities(
  entries: ActivityEntry[],
  user: AdminUser | null,
  scope: ActivityScope,
): ActivityEntry[] {
  if (canViewAllActivities(user?.role) && scope === "all") {
    return entries;
  }
  return entries.filter((entry) => isOwnActivity(entry, user));
}

export function filterComments(
  comments: ActivityComment[],
  user: AdminUser | null,
  scope: ActivityScope,
): ActivityComment[] {
  if (canViewAllActivities(user?.role) && scope === "all") {
    return comments;
  }
  return comments.filter((comment) => isOwnComment(comment, user));
}

export function currentActivityActor(user: AdminUser | null): {
  actor: string;
  actorId?: string;
  actorInitials: string;
} {
  if (!user) {
    return { actor: "You", actorInitials: "YO" };
  }
  return {
    actor: user.name,
    actorId: user.id,
    actorInitials: initialsFor(user.name),
  };
}
