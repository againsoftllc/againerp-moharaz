"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmartPcBuilderRules } from "@/components/configurator/admin/smart-pc-builder-rules";
import { SmartPcBuilderStorefrontPreview } from "@/components/configurator/admin/smart-pc-builder-storefront";
import { SmartPcBuilderTestBuild } from "@/components/configurator/admin/smart-pc-builder-test-build";
import { SmartPcBuilderOverviewContent } from "@/app/(admin)/dropshipping/product-configurator/health/page";
import { SmartPcBuilderTabsSlots } from "@/components/configurator/admin/smart-pc-builder-tabs-slots";
import { SmartPcBuilderGeneral } from "@/components/configurator/admin/smart-pc-builder-general";
import { SmartPcBuilderLookups } from "@/components/configurator/admin/smart-pc-builder-lookups";
import { SmartPcBuilderOverrides } from "@/components/configurator/admin/smart-pc-builder-overrides";
import { ReadyBuildsContent } from "@/app/(admin)/dropshipping/product-configurator/ready-builds/page";
import { getStorefrontBaseUrl } from "@/lib/website/live-edit";
import { usePcBuilderLanguage } from "@/lib/i18n/pcbuilder-language";
import { useDomTranslator } from "@/lib/i18n/pcbuilder-translate";

type Props = {
  activeSection?: string;
};

function RulesTab() {
  return <SmartPcBuilderRules />;
}

function TabsSlotsTab() {
  return <SmartPcBuilderTabsSlots />;
}

function LookupAliasTab() {
  return <SmartPcBuilderLookups />;
}

function OverridesTab() {
  return <SmartPcBuilderOverrides />;
}

function TestBuildTab() {
  return <SmartPcBuilderTestBuild />;
}

/** opens the storefront's /pc-builder (its address depends on this browser's admin host) */
export function openStorefront(e: React.MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  window.open(`${getStorefrontBaseUrl()}/pc-builder`, "_blank", "noreferrer");
}

function StorefrontTab() {
  return (
    <div className="flex flex-col gap-4">
      <SmartPcBuilderStorefrontPreview />
      <div className="flex items-center justify-between rounded-none border border-border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium">Website → PC Builder</p>
          <p className="text-[11px] text-muted-foreground">The same workspace, under the Website module</p>
        </div>
        <Button size="sm" variant="outline" asChild>
          <Link href="/website/pc-builder">Open</Link>
        </Button>
      </div>
      <div className="flex items-center justify-between rounded-none border border-border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium">Live page</p>
          <p className="text-[11px] text-muted-foreground">What customers see at /pc-builder — its slots and rules come from this workspace</p>
        </div>
        <Button size="sm" variant="outline" asChild>
          {/* the storefront's address depends on this browser's admin host, so it's worked out on click */}
          <a href="/pc-builder" target="_blank" rel="noreferrer" onClick={openStorefront}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Open storefront page
          </a>
        </Button>
      </div>
    </div>
  );
}

function SmartPcBuilderPluginPanelContent({ activeSection = "overview" }: Props) {
  if (activeSection === "overview") return <SmartPcBuilderOverviewContent />;
  if (activeSection === "tabs-slots") return <TabsSlotsTab />;
  if (activeSection === "rules") return <RulesTab />;
  if (activeSection === "lookup-alias") return <LookupAliasTab />;
  if (activeSection === "overrides") return <OverridesTab />;
  if (activeSection === "test-build") return <TestBuildTab />;
  if (activeSection === "ready-builds") return <ReadyBuildsContent />;
  if (activeSection === "storefront") return <StorefrontTab />;
  if (activeSection === "general") return <SmartPcBuilderGeneral />;
  return null;
}

/** The panel's texts are written in Bangla. English (the default) swaps them at display time; switching language
 * re-creates the panel, which is what brings the original Bangla back. */
export function SmartPcBuilderPluginPanel(props: Props) {
  const language = usePcBuilderLanguage();
  useDomTranslator(language === "en");
  return (
    <div key={language} className="contents">
      <SmartPcBuilderPluginPanelContent {...props} />
    </div>
  );
}
