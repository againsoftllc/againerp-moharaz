"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FileCode2, Globe, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api/client";
import { readXlsx } from "@/lib/list-io/spreadsheet";

type Preview = {
  host: string;
  total: number;
  notProduct: number;
  alreadyHave: number;
  newCount: number;
  sample: { url: string; title: string }[];
  urls: string[];
};

const BASE = "/api/v1/catalog/sitemap-import";
const BATCH = 100;

/**
 * Unlisted list -> "Import from sitemap": read a shop's sitemap.xml (its address, or the XML uploaded / pasted when the shop
 * blocks our server) and make one Unlisted product per new page address - the title is made from the address, the address is
 * the product's Source. Long lists are created 100 at a time with a progress bar and a Stop button.
 */
export function SitemapImportDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void }) {
  const [url, setUrl] = useState("");
  const [xml, setXml] = useState("");
  const [xmlName, setXmlName] = useState("");
  const [urlList, setUrlList] = useState<string[]>([]); // addresses read from an Excel / text file
  const [mode, setMode] = useState<"url" | "xml">("url");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [limit, setLimit] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, created: 0, skipped: 0, failed: 0 });
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPreview(null);
    setError("");
    setProgress({ done: 0, total: 0, created: 0, skipped: 0, failed: 0 });
  };

  const read = async () => {
    reset();
    setReading(true);
    try {
      const res = await apiFetch<{ data: Preview }>(`${BASE}/preview`, {
        method: "POST",
        body: JSON.stringify(mode === "url" ? { url: url.trim() } : urlList.length ? { urls: urlList } : { xml }),
      });
      setPreview(res.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not read the sitemap";
      setError(msg);
      if (mode === "url" && /upload|paste/i.test(msg)) setMode("xml");
    } finally {
      setReading(false);
    }
  };

  const run = async () => {
    if (!preview) return;
    const wanted = Math.max(0, Math.floor(Number(limit))) || preview.urls.length;
    const urls = preview.urls.slice(0, wanted);
    stopRef.current = false;
    setRunning(true);
    setProgress({ done: 0, total: urls.length, created: 0, skipped: 0, failed: 0 });
    let created = 0;
    let skipped = 0;
    let failed = 0;
    let done = 0;
    try {
      for (let i = 0; i < urls.length && !stopRef.current; i += BATCH) {
        const chunk = urls.slice(i, i + BATCH);
        const res = await apiFetch<{ data: { created: number; skipped: number; failed: number } }>(`${BASE}/run`, {
          method: "POST",
          body: JSON.stringify({ urls: chunk }),
        });
        created += res.data.created;
        skipped += res.data.skipped;
        failed += res.data.failed;
        done += chunk.length;
        setProgress({ done, total: urls.length, created, skipped, failed });
      }
      toast.success(`${created} unlisted product${created === 1 ? "" : "s"} added${stopRef.current ? " (stopped)" : ""}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setRunning(false);
      if (created) onDone();
    }
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const finished = !running && progress.total > 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (running) return;
        onOpenChange(o);
        if (!o) {
          reset();
          setLimit("");
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[min(580px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-input bg-background p-6 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
                <Globe className="h-4 w-4" /> Import from sitemap
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Every new page address in the sitemap becomes an Unlisted product. The title is made from the address and the address is saved as its Source.
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Close" disabled={running}>
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="mt-4 flex gap-1 rounded-md bg-muted p-1 text-xs">
            {(["url", "xml"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={running}
                onClick={() => {
                  setMode(m);
                  reset();
                }}
                className={`flex-1 rounded px-2 py-1.5 font-medium ${mode === m ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {m === "url" ? "Sitemap address" : "Upload file / paste XML"}
              </button>
            ))}
          </div>

          {mode === "url" ? (
            <div className="mt-3 flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && url.trim() && !reading && !running && void read()}
                placeholder="https://www.ryans.com/product-sitemap.xml"
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                disabled={running}
              />
              <Button disabled={!url.trim() || reading || running} onClick={() => void read()}>
                {reading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Read
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xml,.xlsx,.csv,.txt,text/xml,application/xml,text/csv,text/plain"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  reset();
                  setXmlName(f.name);
                  try {
                    const lower = f.name.toLowerCase();
                    if (lower.endsWith(".xlsx")) {
                      // an Excel sheet: every cell that is a web address
                      const cells = (await readXlsx(f)).flat();
                      setUrlList(cells.map((c) => c.trim()).filter((c) => /^https?:\/\//i.test(c)));
                      setXml("");
                    } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
                      setUrlList(((await f.text()).match(/https?:\/\/[^\s,;"'<>]+/gi) ?? []).map((u) => u.trim()));
                      setXml("");
                    } else {
                      setXml(await f.text());
                      setUrlList([]);
                    }
                  } catch {
                    setError("Could not read that file");
                  }
                }}
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={running} onClick={() => fileRef.current?.click()}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Choose file (.xml, .xlsx, .csv, .txt)
                </Button>
                {xmlName ? (
                  <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <FileCode2 className="h-3.5 w-3.5" /> {xmlName}
                    {urlList.length ? ` · ${urlList.length.toLocaleString()} addresses` : ""}
                  </span>
                ) : null}
              </div>
              <textarea
                value={xml}
                onChange={(e) => {
                  setXml(e.target.value);
                  setUrlList([]);
                  setXmlName("");
                  reset();
                }}
                placeholder="…or paste the sitemap XML here"
                rows={5}
                disabled={running}
                className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs"
              />
              <Button disabled={(!xml.trim() && urlList.length === 0) || reading || running} onClick={() => void read()}>
                {reading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Read
              </Button>
            </div>
          )}

          {error ? <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p> : null}

          {preview ? (
            <div className="mt-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["In sitemap", preview.total],
                  ["New products", preview.newCount],
                  ["Already have", preview.alreadyHave],
                  ["Not products", preview.notProduct],
                ].map(([label, n]) => (
                  <div key={label as string} className="rounded-md border border-input px-3 py-2">
                    <div className="text-lg font-semibold">{(n as number).toLocaleString()}</div>
                    <div className="text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>

              {preview.sample.length ? (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">Titles made from the first addresses</div>
                  <ul className="space-y-1 rounded-md border border-input p-2 text-xs">
                    {preview.sample.map((s) => (
                      <li key={s.url} className="truncate" title={s.url}>
                        <span className="font-medium">{s.title}</span> <span className="text-muted-foreground">← {s.url.replace(/^https?:\/\//, "")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {preview.newCount > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Add only the first
                    <input
                      value={limit}
                      onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))}
                      placeholder={`all ${preview.newCount.toLocaleString()}`}
                      disabled={running}
                      className="h-8 w-28 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    />
                  </label>
                  {running ? (
                    <Button variant="secondary" onClick={() => (stopRef.current = true)}>
                      Stop
                    </Button>
                  ) : (
                    <Button onClick={() => void run()} disabled={finished && progress.done >= progress.total && !stopRef.current}>
                      Add to Unlisted
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nothing new to add from this sitemap.</p>
              )}

              {progress.total > 0 ? (
                <div className="space-y-1">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {progress.done.toLocaleString()} / {progress.total.toLocaleString()} · {progress.created.toLocaleString()} added
                    {progress.skipped ? ` · ${progress.skipped} already there` : ""}
                    {progress.failed ? ` · ${progress.failed} failed` : ""}
                    {running ? " · keep this window open" : ""}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
