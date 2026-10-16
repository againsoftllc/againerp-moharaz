"use client";

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  /** idle = restless waiting; busy = working; calm = listening */
  mood?: "idle" | "busy" | "calm";
  showGlow?: boolean;
};

/**
 * Human-like AI face. Outer wrapper never translates — only eyes/brows/mouth animate,
 * so the FAB screen position stays fixed.
 */
export function AiRobotAvatar({ className, mood = "idle", showGlow = true }: Props) {
  return (
    <span
      className={cn(
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-visible",
        mood === "idle" && "ai-bot-idle",
        mood === "busy" && "ai-bot-busy",
        className,
      )}
      aria-hidden
    >
      {showGlow && mood === "idle" ? (
        <span className="ai-bot-glow pointer-events-none absolute inset-0 rounded-full bg-violet-500/20" />
      ) : null}
      <svg viewBox="0 0 40 40" className="relative h-full w-full" fill="none">
        {/* soft human head */}
        <circle cx="20" cy="20" r="15.5" className="fill-background stroke-violet-500" strokeWidth="1.6" />
        <circle cx="20" cy="20" r="15.5" className="fill-violet-500/10" />
        {/* hair / crown */}
        <path
          d="M8.5 18c1-7 6.2-11 11.5-11S30.5 11 31.5 18c-2.2-3.2-5.6-4.6-11.5-4.6S10.7 14.8 8.5 18Z"
          className="fill-violet-500/55"
        />
        {/* brows — impatient lift when idle */}
        <g className="ai-bot-brow">
          <path d="M12 15.2h5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-violet-600 dark:text-violet-300" />
          <path d="M22.8 15.2h5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-violet-600 dark:text-violet-300" />
        </g>
        {/* eyes */}
        <g className="ai-bot-eye-lid">
          <ellipse cx="14.6" cy="18.6" rx="2.6" ry="3" className="fill-violet-100 dark:fill-violet-950" />
          <ellipse cx="25.4" cy="18.6" rx="2.6" ry="3" className="fill-violet-100 dark:fill-violet-950" />
        </g>
        <g className="ai-bot-pupils">
          <circle cx="14.6" cy="18.8" r="1.35" className="fill-violet-700 dark:fill-violet-300" />
          <circle cx="25.4" cy="18.8" r="1.35" className="fill-violet-700 dark:fill-violet-300" />
        </g>
        {/* nose hint */}
        <path d="M20 20.2v2.4" stroke="currentColor" strokeWidth="1" strokeLinecap="round" className="text-violet-400/70" />
        {/* mouth */}
        <g className="ai-bot-mouth">
          <path
            d="M16.2 25.2c1.4 1.6 6.2 1.6 7.6 0"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
            className="text-violet-500"
          />
        </g>
        {/* busy think dots */}
        {mood === "busy" ? (
          <g>
            <circle className="ai-bot-think-dot fill-violet-500" cx="28.5" cy="9.5" r="1.1" />
            <circle className="ai-bot-think-dot fill-violet-500" cx="31.2" cy="7.2" r="1.3" />
            <circle className="ai-bot-think-dot fill-violet-500" cx="33.5" cy="4.8" r="1.5" />
          </g>
        ) : null}
      </svg>
    </span>
  );
}
