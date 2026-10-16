"use client";

import { useState } from "react";
import { Cloud, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  installCloudflarePlugin,
  startCloudflareOAuth,
} from "@/lib/api/use-cloudflare-plugin";
import { usePluginsStore } from "@/lib/store/plugins-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  ensureInstalled?: boolean;
  connected?: boolean;
  oauthAvailable?: boolean;
  className?: string;
  size?: "sm" | "default";
};

export function CloudflareConnectButton({
  disabled,
  ensureInstalled = true,
  connected = false,
  oauthAvailable = true,
  className,
  size = "sm",
}: Props) {
  const installPlugin = usePluginsStore((s) => s.installPlugin);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (disabled || connected) return;
    setConnecting(true);
    try {
      if (ensureInstalled) {
        const state = usePluginsStore.getState().plugins.cloudflare;
        if (!state?.installed) {
          installPlugin("cloudflare");
        }
        await installCloudflarePlugin();
      }
      const url = await startCloudflareOAuth();
      window.location.href = url;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not start Cloudflare OAuth";
      if (!oauthAvailable || message.toLowerCase().includes("not configured")) {
        toast.error(
          "Cloudflare OAuth এখনো API-তে setup হয়নি। apps/api/.env-এ CLOUDFLARE_OAUTH_CLIENT_ID ও CLOUDFLARE_OAUTH_CLIENT_SECRET যোগ করুন, তারপর API restart করুন।",
          { duration: 8000 },
        );
      } else {
        toast.error(message);
      }
      setConnecting(false);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Button
        className="rounded-none bg-primary text-primary-foreground hover:bg-primary/90"
        size={size}
        disabled={disabled || connecting || connected}
        onClick={() => void handleConnect()}
      >
        {connecting ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Cloud className="mr-1.5 h-3.5 w-3.5" />
        )}
        Connect with Cloudflare
      </Button>
      {!oauthAvailable && !connected && (
        <p className="text-[11px] text-muted-foreground">
          OAuth credentials API .env-এ না থাকলে বাটন কাজ করবে না — manual token নিচে ব্যবহার করুন।
        </p>
      )}
    </div>
  );
}
