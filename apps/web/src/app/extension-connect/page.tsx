"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { useAdminAuth } from "@/lib/store/admin-auth-store";

type Phase = "checking" | "working" | "done" | "no-extension" | "error";

/**
 * Where the "Send to AgainERP" extension's Log in button lands. Not signed in -> the normal admin login, then back here. Signed in
 * -> the admin asks the API for a session for the extension and hands it over through the extension's bridge. Nothing is typed into
 * the extension and the admin's own session token never leaves the admin.
 */
export default function ExtensionConnectPage() {
  const router = useRouter();
  const { token, user } = useAdminAuth();
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState("");
  const started = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    if (!token) {
      router.replace("/login?next=/extension-connect");
      return;
    }
    if (started.current) return;
    started.current = true;
    setPhase("working");

    const run = async () => {
      try {
        // the extension marks the page it runs on; give it a moment to do so
        for (let i = 0; i < 20 && !document.documentElement.dataset.againerpExtension; i += 1) {
          await new Promise((r) => setTimeout(r, 150));
        }
        if (!document.documentElement.dataset.againerpExtension) {
          setPhase("no-extension");
          return;
        }
        const session = await apiFetch<{ token: string; expires_at: string; user: { name: string; email: string } }>(
          "/api/v1/auth/extension-session",
          { method: "POST" },
        );
        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const reply = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
          const timer = window.setTimeout(() => {
            window.removeEventListener("message", onMessage);
            resolve({ ok: false, error: "The extension did not answer" });
          }, 8000);
          function onMessage(event: MessageEvent) {
            if (event.source !== window || event.origin !== window.location.origin) return;
            const data = event.data;
            if (!data || data.source !== "againerp-extension" || data.type !== "connect-result" || data.requestId !== requestId) return;
            window.clearTimeout(timer);
            window.removeEventListener("message", onMessage);
            resolve({ ok: Boolean(data.ok), error: data.error });
          }
          window.addEventListener("message", onMessage);
          window.postMessage(
            { source: "againerp-page", type: "connect", requestId, item: { token: session.token, expires_at: session.expires_at, name: session.user.name } },
            window.location.origin,
          );
        });
        if (reply.ok) setPhase("done");
        else {
          setMessage(reply.error || "The extension could not be connected");
          setPhase("error");
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Could not connect the extension");
        setPhase("error");
      }
    };
    void run();
  }, [mounted, token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md border bg-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Send to AgainERP</h1>
        <div className="mt-5 space-y-3 text-sm">
          {(phase === "checking" || phase === "working") && (
            <p className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Connecting the extension…
            </p>
          )}
          {phase === "done" && (
            <>
              <p className="flex items-center justify-center gap-2 font-medium text-emerald-600">
                <CheckCircle2 className="h-5 w-5" /> Connected{user?.name ? ` as ${user.name}` : ""}
              </p>
              <p className="text-muted-foreground">You can close this tab. Open the extension on a competitor&apos;s product page to save its price.</p>
            </>
          )}
          {phase === "no-extension" && (
            <p className="flex items-start justify-center gap-2 text-left text-amber-600">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              The extension is not active on this page. Open the extension and press <b>Log in</b> again (it asks once for access to this site), or
              install it from Settings → Plugins → Price Compare.
            </p>
          )}
          {phase === "error" && (
            <p className="flex items-start justify-center gap-2 text-left text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
