"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ChinaImportView,
  ElimPlatform,
  ElimProductListItem,
} from "./types";
import {
  CHINA_IMPORT_PLUGIN_NAME,
  isChinaImportPluginEnabled,
} from "./config";
import { PluginNav, PluginShell, StateBlock } from "./components";
import { useChinaImportSettings, useTestConnection } from "./hooks/use-settings";
import { DashboardPage } from "./pages/Dashboard";
import { SettingsPage } from "./pages/Settings";
import { SearchPage } from "./pages/Search";
import { ImageSearchPage } from "./pages/ImageSearch";
import { ProductDetailsPage } from "./pages/ProductDetails";
import { RawJsonPage } from "./pages/RawJson";
import { LogsPage } from "./pages/Logs";
import { ApiExplorerPage } from "./pages/ApiExplorer";
import { MappingPreviewPage } from "./pages/MappingPreview";
import { ImportQueuePage } from "./pages/ImportQueue";
import { ImportReviewPage } from "./pages/ImportReview";
import { MappingDashboardPage } from "./pages/MappingDashboard";
import { bootstrapProviderEngine, providerManager } from "./core";
import { toProviderConfig, connectionService } from "./services/connection.service";
import type { ProviderId, ProviderMeta } from "./core/types";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "settings", label: "Settings" },
  { id: "explorer", label: "API Explorer" },
  { id: "mapping", label: "Mapping Preview" },
  { id: "import-queue", label: "Import Queue" },
  { id: "entity-mapping", label: "Smart Mapping" },
  { id: "search", label: "Search" },
  { id: "image-search", label: "Image Search" },
  { id: "logs", label: "Logs" },
] as const;

export type ChinaImportAppProps = {
  /** Host can force-enable without env (tests). */
  forceEnabled?: boolean;
  /** Optional initial view. */
  initialView?: ChinaImportView;
};

export function ChinaImportApp({
  forceEnabled = false,
  initialView = "dashboard",
}: ChinaImportAppProps) {
  const enabled = forceEnabled || isChinaImportPluginEnabled();
  const { settings, dirty, updateLocal, save, reset, reload } = useChinaImportSettings();
  const { testing, result, test, setResult } = useTestConnection();
  const [view, setView] = useState<ChinaImportView>(initialView);
  const [productId, setProductId] = useState<string | null>(null);
  const [reviewItemId, setReviewItemId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<ElimPlatform>("taobao");
  const [rawPayload, setRawPayload] = useState<unknown>(null);
  const [providers, setProviders] = useState<ProviderMeta[]>([]);

  useEffect(() => {
    bootstrapProviderEngine();
    setProviders(providerManager.listProviders());
  }, []);

  const navActive = useMemo(() => {
    if (view === "product" || view === "raw") return "search";
    if (view === "import-review") return "import-queue";
    return view;
  }, [view]);

  if (!enabled) {
    return (
      <PluginShell title={CHINA_IMPORT_PLUGIN_NAME} subtitle="Feature flag disabled">
        <StateBlock
          title="China Import plugin is disabled"
          description="Set NEXT_PUBLIC_CHINA_IMPORT_PLUGIN=1 to enable this standalone POC. No ERP modules are loaded."
        />
      </PluginShell>
    );
  }

  function openProduct(product: ElimProductListItem, nextPlatform: ElimPlatform) {
    setProductId(String(product.id));
    setPlatform(nextPlatform);
    setView("product");
  }

  function setActiveProvider(id: ProviderId) {
    const next = connectionService.saveSettings({ ...settings, activeProviderId: id });
    reload();
    void providerManager.activate(id, toProviderConfig(next));
  }

  return (
    <PluginShell
      title={CHINA_IMPORT_PLUGIN_NAME}
      subtitle="Provider → Mapper → Staging → Review · not connected to Catalog or Inventory"
      nav={
        <PluginNav
          items={[...NAV_ITEMS]}
          active={navActive}
          onSelect={(id) => setView(id as ChinaImportView)}
        />
      }
    >
      {view === "dashboard" ? (
        <DashboardPage
          settings={settings}
          lastTest={result}
          testing={testing}
          providers={providers}
          onGoSettings={() => setView("settings")}
          onGoSearch={() => setView("search")}
          onGoImageSearch={() => setView("image-search")}
          onGoExplorer={() => setView("explorer")}
          onGoMapping={() => setView("mapping")}
          onGoImportQueue={() => setView("import-queue")}
          onGoEntityMapping={() => setView("entity-mapping")}
          onTest={() => void test(settings)}
        />
      ) : null}

      {view === "settings" ? (
        <SettingsPage
          settings={settings}
          dirty={dirty}
          providers={providers}
          onChange={updateLocal}
          onSave={() => {
            save();
          }}
          onReset={() => {
            reset();
            setResult(null);
          }}
          onTest={() => {
            const next = save();
            void test(next);
          }}
          testing={testing}
          testResult={result}
        />
      ) : null}

      {view === "explorer" ? (
        <ApiExplorerPage
          config={toProviderConfig(settings)}
          activeProviderId={settings.activeProviderId}
          providers={providers}
          debugMode={settings.debugMode}
          onProviderChange={(id) => {
            setActiveProvider(id);
          }}
        />
      ) : null}

      {view === "mapping" ? (
        <MappingPreviewPage onStaged={() => setView("import-queue")} />
      ) : null}

      {view === "import-queue" ? (
        <ImportQueuePage
          onOpenItem={(id) => {
            setReviewItemId(id);
            setView("import-review");
          }}
        />
      ) : null}

      {view === "import-review" && reviewItemId ? (
        <ImportReviewPage
          itemId={reviewItemId}
          onBack={() => setView("import-queue")}
        />
      ) : null}

      {view === "entity-mapping" ? <MappingDashboardPage /> : null}

      {view === "search" ? <SearchPage onOpenProduct={openProduct} /> : null}

      {view === "image-search" ? <ImageSearchPage onOpenProduct={openProduct} /> : null}

      {view === "product" && productId ? (
        <ProductDetailsPage
          productId={productId}
          platform={platform}
          onBack={() => setView("search")}
          onOpenRaw={(raw) => {
            setRawPayload(raw);
            setView("raw");
          }}
        />
      ) : null}

      {view === "raw" ? (
        <RawJsonPage
          value={rawPayload}
          onBack={() => setView(productId ? "product" : "search")}
        />
      ) : null}

      {view === "logs" ? <LogsPage /> : null}
    </PluginShell>
  );
}

export default ChinaImportApp;
