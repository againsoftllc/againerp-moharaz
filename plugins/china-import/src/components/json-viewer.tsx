"use client";

import { useMemo, useState } from "react";
import { copyText, prettyJson } from "../utils";
import { buttonClassName, Card } from "./ui";

export function RawJsonViewer({
  value,
  title = "Raw JSON",
}: {
  value: unknown;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => prettyJson(value), [value]);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs font-medium text-foreground">{title}</p>
        <button
          type="button"
          className={buttonClassName("secondary")}
          onClick={async () => {
            const ok = await copyText(text);
            setCopied(ok);
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? "Copied" : "Copy JSON"}
        </button>
      </div>
      <pre className="max-h-[32rem] overflow-auto bg-muted/30 p-3 text-[11px] leading-relaxed text-foreground">
        {text}
      </pre>
    </Card>
  );
}

export function FieldTable({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([, v]) => v !== undefined && typeof v !== "object",
  );
  const nested = Object.entries(data).filter(
    ([, v]) => v !== null && typeof v === "object",
  );

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <table className="w-full text-left text-xs">
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key} className="border-b border-border last:border-0">
                <th className="w-40 bg-muted/40 px-3 py-2 align-top font-medium text-muted-foreground">
                  {key}
                </th>
                <td className="px-3 py-2 text-foreground break-all">{String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {nested.map(([key, value]) => (
        <RawJsonViewer key={key} title={key} value={value} />
      ))}
    </div>
  );
}
