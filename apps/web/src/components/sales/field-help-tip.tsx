"use client";

import * as Tooltip from "@radix-ui/react-tooltip";

/** Light-blue `?` + black tooltip (Again field help). */
export function FieldHelpTip({ label }: { label: string }) {
  return (
    <Tooltip.Provider delayDuration={120}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            className="inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center text-[12px] font-bold leading-none text-[#5bc0de] outline-none"
            aria-label={label}
          >
            ?
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="bottom"
            align="center"
            sideOffset={6}
            className="z-[300] max-w-[280px] rounded-md bg-black px-2.5 py-1.5 text-left text-[12px] font-normal leading-snug text-white shadow-md"
          >
            {label}
            <Tooltip.Arrow className="fill-black" width={11} height={6} />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
