"use client";

import { cn } from "@/lib/utils";

const AVATAR_TONES = [
  "bg-emerald-600",
  "bg-blue-600",
  "bg-violet-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-indigo-600",
  "bg-orange-600",
] as const;

function avatarTone(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export function ActivityAvatar({
  initials,
  name,
  size = "md",
}: {
  initials: string;
  name: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        size === "sm" ? "h-6 w-6 text-[9px]" : "h-7 w-7 text-[10px]",
        avatarTone(name),
      )}
    >
      {initials}
    </div>
  );
}
