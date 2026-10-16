import type { ApiHealthStatus } from "@/lib/api/use-api-health";

/** Merge /health status with whether pickings list loaded from API. */
export function pickingsApiHealth(
  status: ApiHealthStatus,
  fromApi: boolean,
  loading: boolean,
): ApiHealthStatus {
  if (loading || status === "checking") return "checking";
  if (status === "connected" && fromApi) return "connected";
  if (status === "connected" && !fromApi) return "partial";
  return status;
}
