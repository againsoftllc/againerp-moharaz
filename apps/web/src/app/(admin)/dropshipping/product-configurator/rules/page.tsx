"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfiguratorAdminPage } from "@/components/configurator/admin/configurator-admin-page";
import { CompatibilityRulesList } from "@/components/configurator/compatibility-rules-list";
import { useCompatibilityRuleStore } from "@/lib/store/compatibility-rule-store";

export default function ConfiguratorRulesPage() {
  const [addTrigger, setAddTrigger] = useState(0);
  const count = useCompatibilityRuleStore((s) => s.rules.length);

  return (
    <ConfiguratorAdminPage
      section="Rules"
      title="Compatibility Rules"
      count={count}
      description="IF / THEN / ELSE rule engine — compare component attributes and return compatible, warning, or incompatible."
      createLabel="Create rule"
      onCreate={() => setAddTrigger((n) => n + 1)}
    >
      <CompatibilityRulesList addTrigger={addTrigger} />
      <Button size="sm" className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full p-0 shadow-lg sm:hidden" onClick={() => setAddTrigger((n) => n + 1)} aria-label="Create rule">
        <Plus className="h-5 w-5" />
      </Button>
    </ConfiguratorAdminPage>
  );
}
