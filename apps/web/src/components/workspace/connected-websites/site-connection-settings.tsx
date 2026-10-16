"use client";

import { useState } from "react";
import { ExternalLink, Link2, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/native-select";
import {
  normalizeStorefrontBaseUrl,
  useConnectedWebsitesStore,
  type WebsiteEnvironment,
} from "@/lib/store/connected-websites-store";

type Props = {
  siteId: string;
  siteName: string;
  siteDomain: string;
};

export function SiteConnectionSettings({ siteId, siteName, siteDomain }: Props) {
  const websites = useConnectedWebsitesStore((state) => state.websites);
  const add = useConnectedWebsitesStore((state) => state.add);
  const update = useConnectedWebsitesStore((state) => state.update);
  const remove = useConnectedWebsitesStore((state) => state.remove);
  const connection = websites.find((website) => website.siteId === siteId);

  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? siteDomain);
  const [environment, setEnvironment] = useState<WebsiteEnvironment>(
    connection?.environment ?? "live",
  );
  const [notes, setNotes] = useState(connection?.notes ?? "");

  const handleSave = () => {
    const normalized = normalizeStorefrontBaseUrl(baseUrl);
    if (!normalized) {
      toast.error("Enter a valid website URL");
      return;
    }

    if (connection) {
      update(connection.id, {
        siteId,
        name: siteName,
        baseUrl: normalized,
        environment,
        notes,
        status: "connected",
      });
      toast.success("Connection updated");
      return;
    }

    add({
      siteId,
      name: siteName,
      baseUrl: normalized,
      environment,
      notes,
      status: "connected",
    });
    toast.success("Website connected");
  };

  const handleDisconnect = () => {
    if (!connection) return;
    remove(connection.id);
    toast.success("Website disconnected");
  };

  return (
    <div className="max-w-2xl space-y-5">
      <div className="border border-border bg-muted/20 p-4">
        <div className="flex items-start gap-3">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-sm font-medium">{siteName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              This site has one website and one connection.
            </p>
          </div>
          <span className="ml-auto border border-border px-2 py-0.5 text-xs">
            {connection ? "Connected" : "Not connected"}
          </span>
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Website URL</span>
        <Input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://example.com"
          className="rounded-none font-mono text-xs"
        />
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Environment</span>
        <Select
          value={environment}
          onChange={(event) => setEnvironment(event.target.value as WebsiteEnvironment)}
          className="w-full rounded-none"
        >
          <option value="live">Live</option>
          <option value="local">Local</option>
        </Select>
      </label>

      <label className="block text-sm">
        <span className="mb-1 block font-medium">Notes</span>
        <Input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional connection notes"
          className="rounded-none"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button onClick={handleSave} className="rounded-none">
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
          {connection ? "Save connection" : "Connect website"}
        </Button>
        {connection && (
          <>
            <Button variant="outline" className="rounded-none" asChild>
              <a href={connection.baseUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                Open website
              </a>
            </Button>
            <Button variant="outline" className="rounded-none" onClick={handleDisconnect}>
              <Unplug className="mr-1.5 h-3.5 w-3.5" />
              Disconnect
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
