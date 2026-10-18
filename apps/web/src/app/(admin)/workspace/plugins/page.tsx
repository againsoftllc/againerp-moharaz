import { redirect } from "next/navigation";

/** Plugins now live under Apps. Individual plugin settings stay at /workspace/plugins/[pluginId]. */
export default function PluginsPage() {
  redirect("/workspace/apps");
}
