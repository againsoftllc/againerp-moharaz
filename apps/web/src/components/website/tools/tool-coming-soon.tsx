import { Sparkles } from "lucide-react";
import { WorkspaceEmptyState } from "@/components/workspace/states/empty-state";

/** Shared placeholder for Website > Tools entries that aren't built yet. */
export function ToolComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center p-6">
      <WorkspaceEmptyState
        icon={<Sparkles className="h-6 w-6" aria-hidden />}
        title={`${title} — Coming soon`}
        description="This tool isn't built yet. Check back soon."
        className="max-w-md"
      />
    </div>
  );
}
