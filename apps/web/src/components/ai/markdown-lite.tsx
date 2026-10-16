"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { pathToDocLink } from "@/components/ai/ai-doc-links";

/**
 * Tiny markdown renderer for chat replies — headings, paragraphs, bullet / numbered lists,
 * tables, fenced and inline code, bold, italic, links. Builds React elements (no innerHTML),
 * so model output can never inject markup.
 *
 * Links:
 *  - `doc://<type>/<id>` — an ERP document; rendered as a chip that calls `onOpenDocument`
 *    so the record opens in a drawer right where the user is (the AI page).
 *  - `/path` — in-app navigation (Next Link), e.g. "Open in Sales" → /sales?open=<id>. When
 *    the path is a record deep link (see ai-doc-links.ts) and `onOpenDocument` is given, a
 *    plain click opens that record's drawer in place instead; ctrl/cmd/middle-click still
 *    opens the module page in a new tab.
 *  - `https://…` — external, new tab.
 *  - `![alt](url)` — an image (e.g. one Aladin just generated) rendered inline, clickable
 *    to open full size in a new tab.
 */

export type MarkdownLiteProps = {
  text: string;
  onOpenDocument?: (href: string, label: string) => void;
};

type OpenDocument = MarkdownLiteProps["onOpenDocument"];

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative my-2">
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/60 p-3 font-mono text-[12.5px] leading-relaxed">
        {lang ? <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">{lang}</span> : null}
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        aria-label={copied ? "Copied" : "Copy code"}
        title={copied ? "Copied" : "Copy code"}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function inline(text: string, keyPrefix: string, openDocument?: OpenDocument): ReactNode[] {
  const out: ReactNode[] = [];
  // order matters: code spans first so their contents are never re-parsed
  const re =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(!\[[^\]]*\]\(((?:https?:\/\/|\/)[^\s)]+)\))|(\[[^\]]+\]\(((?:https?:\/\/|doc:\/\/|\/)[^\s)]+)\))|(https?:\/\/[^\s<]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("`")) {
      out.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[12.5px]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    } else if (tok.startsWith("![")) {
      const alt = tok.slice(2, tok.indexOf("]")) || "image";
      const href = m[5];
      out.push(
        <a key={key} href={href} target="_blank" rel="noreferrer" className="my-1 block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={href}
            alt={alt}
            className="max-h-72 max-w-full rounded-lg border border-border object-contain"
            loading="lazy"
          />
        </a>,
      );
    } else if (tok.startsWith("[")) {
      const label = tok.slice(1, tok.indexOf("]"));
      const href = m[7];
      if (href.startsWith("doc://")) {
        const open = openDocument;
        out.push(
          <button
            key={key}
            type="button"
            onClick={() => open?.(href, label)}
            title="Open here"
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0 font-semibold text-primary hover:bg-primary/20"
          >
            {label}
          </button>,
        );
      } else if (href.startsWith("/")) {
        const docHref = openDocument ? pathToDocLink(href) : null;
        const open = openDocument;
        out.push(
          <Link
            key={key}
            href={href}
            className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
            title={docHref ? "Open here" : undefined}
            onClick={
              docHref
                ? (e) => {
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    open?.(docHref, label);
                  }
                : undefined
            }
          >
            {label}
          </Link>,
        );
      } else {
        out.push(
          <a key={key} href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-primary">
            {label}
          </a>,
        );
      }
    } else {
      out.push(
        <a key={key} href={tok} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-primary">
          {tok}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MarkdownLite({ text, onOpenDocument }: MarkdownLiteProps) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(<CodeBlock key={key++} lang={lang} code={code.join("\n")} />);
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const cls = level === 1 ? "text-lg font-semibold" : level === 2 ? "text-base font-semibold" : "text-sm font-semibold";
      blocks.push(
        <p key={key++} className={`mt-3 mb-1 ${cls}`}>
          {inline(heading[2], `h${key}`, onOpenDocument)}
        </p>,
      );
      i += 1;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      // GitHub-style table: header row, optional |---| separator, body rows
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const cells = lines[i].trim().slice(1, -1).split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i += 1;
      }
      const [head, ...body] = rows;
      const colCount = head ? head.length : (body[0]?.length ?? 0);
      // Auto layout (not table-fixed) — it never lets cell content overlap
      // its neighbors, only wraps or (with enough min-width) grows the
      // table past its container, which the overflow-x-auto wrapper below
      // turns into a horizontal scroll instead of cramming everything in.
      blocks.push(
        <div key={key++} className="my-2 overflow-x-auto">
          <table
            className="w-full border-collapse text-[13px]"
            style={{ minWidth: Math.max(360, colCount * 130) }}
          >
            {head ? (
              <thead>
                <tr>
                  {head.map((c, ci) => (
                    <th
                      key={ci}
                      className={`border-b border-border px-2 py-1 text-left font-semibold ${ci === 0 ? "whitespace-normal break-words" : "whitespace-nowrap"}`}
                    >
                      {inline(c, `th${key}-${ci}`, onOpenDocument)}
                    </th>
                  ))}
                </tr>
              </thead>
            ) : null}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-b border-border/60">
                  {r.map((c, ci) => (
                    <td
                      key={ci}
                      className={`px-2 py-1 align-top ${ci === 0 ? "whitespace-normal break-words" : "whitespace-nowrap"} ${/^[\s\d,.\-%()BDT]+$/.test(c) && c.trim() ? "text-right tabular-nums" : ""}`}
                    >
                      {inline(c, `td${key}-${ri}-${ci}`, onOpenDocument)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*•])\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: string[] = [];
      while (i < lines.length && (/^\s*([-*•])\s+/.test(lines[i]) || /^\s*\d+[.)]\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag key={key++} className={`my-1.5 space-y-0.5 pl-5 ${ordered ? "list-decimal" : "list-disc"}`}>
          {items.map((it, idx) => (
            <li key={idx}>{inline(it, `li${key}-${idx}`, onOpenDocument)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    // paragraph: consume until blank line / block start
    const para: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("```") && !/^(#{1,4})\s+/.test(lines[i]) && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="my-1.5 leading-relaxed">
        {para.map((p, idx) => (
          <Fragment key={idx}>
            {idx > 0 ? <br /> : null}
            {inline(p, `p${key}-${idx}`, onOpenDocument)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="text-[14px]">{blocks}</div>;
}
