"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, Download, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { addFileToZip } from "@/lib/zip-add-file";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/** Where the packed extension is served from (scripts/pack_browser_extension.py writes it into public/downloads). */
export const EXTENSION_ZIP_URL = "/downloads/send-to-againerp-extension.zip";
const EXTENSION_FOLDER = "send-to-againerp-extension";

/**
 * The zip as THIS admin hands it out: the extension plus a config.json with this admin's address (the API is reached through the
 * admin's own /api/v1), so it is already connected - nobody types an address. The file holds addresses only: no password, no token.
 */
async function downloadConfiguredExtension(): Promise<void> {
  const res = await fetch(EXTENSION_ZIP_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("The extension file could not be loaded");
  const base = new Uint8Array(await res.arrayBuffer());
  const origin = window.location.origin;
  const config = new TextEncoder().encode(JSON.stringify({ apiBase: origin, webBase: origin }, null, 2));
  const zip = addFileToZip(base, `${EXTENSION_FOLDER}/config.json`, config);
  const url = URL.createObjectURL(new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${EXTENSION_FOLDER}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The version the extension's bridge.js put on this page, or null when the extension is not (yet) in this browser. */
function installedVersion(): string | null {
  if (typeof document === "undefined") return null;
  return document.documentElement.dataset.againerpExtension || null;
}

/**
 * "Send to AgainERP" browser extension: download + the steps to load it + whether this browser already has it.
 * Chrome does not let a web page install an extension silently, so the page gives the zip and the exact steps, and then
 * checks (the extension marks every AgainERP admin page it runs on) that it really is there.
 */
export function BrowserExtensionInstall({ compact = false }: { compact?: boolean }) {
  const [version, setVersion] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  const check = useCallback(() => {
    // ask the bridge to answer again (it also sets the marker), then read the marker
    window.postMessage({ source: "againerp-page", type: "ping" }, window.location.origin);
    window.setTimeout(() => {
      setVersion(installedVersion());
      setChecked(true);
    }, 400);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(check, 300);
    return () => window.clearTimeout(timer);
  }, [check]);

  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      await downloadConfiguredExtension();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied - paste it in a new browser tab");
    } catch {
      toast.error("Couldn't copy - type it in the address bar");
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {version ? (
          <Badge variant="secondary" className="gap-1 rounded-none text-[11px]">
            <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Installed in this browser · v{version}
          </Badge>
        ) : (
          <Badge variant="outline" className="rounded-none text-[11px]">
            {checked ? "Not installed in this browser" : "Checking…"}
          </Badge>
        )}
        <Button size="sm" variant="outline" className="h-7 rounded-none px-2 text-xs" onClick={check}>
          <RefreshCw className="mr-1 h-3 w-3" /> Check again
        </Button>
      </div>

      {!compact && (
        <p className="text-xs text-muted-foreground">
          Some shops (a Cloudflare check, for example) refuse the server&apos;s request. The extension reads the page in your own browser
          instead, and saves the price to Price Compare.
        </p>
      )}

      <ol className="list-decimal space-y-1.5 pl-5 text-xs">
        <li>
          <button
            type="button"
            onClick={() => void download()}
            disabled={downloading}
            className="inline-flex items-center gap-1 font-medium text-primary underline disabled:opacity-50"
          >
            <Download className="h-3 w-3" /> {downloading ? "Preparing…" : "Download the extension (.zip)"}
          </button>{" "}
          and unzip it - you get a <code className="rounded bg-muted px-1">{EXTENSION_FOLDER}</code> folder. Keep that folder; Chrome
          reads the extension from it. It is already set to <b>{typeof window !== "undefined" ? window.location.host : "this admin"}</b>.
        </li>
        <li>
          Open <code className="rounded bg-muted px-1">chrome://extensions</code> in a new tab{" "}
          <button type="button" onClick={() => void copy("chrome://extensions")} className="inline-flex items-center gap-0.5 text-primary underline">
            <Copy className="h-3 w-3" /> copy
          </button>{" "}
          (a web page cannot open it for you) and switch on <b>Developer mode</b> (top right).
        </li>
        <li>
          Click <b>Load unpacked</b> and pick the unzipped <code className="rounded bg-muted px-1">{EXTENSION_FOLDER}</code> folder.
        </li>
        <li>
          Click the puzzle-piece icon, pin <b>Send to AgainERP</b>, open it and sign in with <b>your own</b> AgainERP account (the addresses
          are already filled in and locked). Allow access when Chrome asks once. The extension never stores your password - only a
          sign-in session you can end with <i>Sign out</i>.
        </li>
        <li>
          Come back here, reload this page and press <b>Check again</b> - it should say <i>Installed</i>. After an update, use the
          <b> ↻ reload</b> on the extension&apos;s card in <code className="rounded bg-muted px-1">chrome://extensions</code> first.
        </li>
      </ol>
    </div>
  );
}
