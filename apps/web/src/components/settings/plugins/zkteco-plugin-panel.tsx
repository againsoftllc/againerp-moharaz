"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  fetchZktecoPlugin,
  fetchZktecoPunches,
  updateZktecoPlugin,
  type ZktecoPluginRecord,
  type ZktecoPunchItem,
  type ZktecoPunchesResult,
} from "@/lib/api/zkteco-plugin";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateRangePresetPicker } from "@/components/shared/date-range-preset-picker";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/utils";

type SectionId = "connection" | "list";

type Props = {
  activeSection: SectionId;
};

function statusBadge(status: string) {
  if (status === "connected") return <Badge variant="success">Connected</Badge>;
  if (status === "error") return <Badge variant="warning">Error</Badge>;
  return <Badge variant="muted">Waiting</Badge>;
}

function inoutLabel(mode: number | null) {
  if (mode === 0) return "In";
  if (mode === 1) return "Out";
  return mode == null ? "—" : String(mode);
}

export function ZktecoPluginPanel({ activeSection }: Props) {
  const canWrite = useAdminCanWrite();
  const [plugin, setPlugin] = useState<ZktecoPluginRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [receiverEnabled, setReceiverEnabled] = useState(true);
  const [allowedSerials, setAllowedSerials] = useState("");
  const [rawTrafficEnabled, setRawTrafficEnabled] = useState(false);
  const [deviceName, setDeviceName] = useState("F22");
  const [deviceSerial, setDeviceSerial] = useState("JJA1254800682");
  const [firmwareVersion, setFirmwareVersion] = useState("6.60");
  const [pushVersion, setPushVersion] = useState("3.1.2");
  const [serverAddress, setServerAddress] = useState("192.168.10.46");
  const [serverPort, setServerPort] = useState("7074");
  const [httpsEnabled, setHttpsEnabled] = useState(false);

  const [punches, setPunches] = useState<ZktecoPunchesResult | null>(null);
  const [punchesLoading, setPunchesLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [snFilter, setSnFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchZktecoPlugin();
      setPlugin(row);
      setReceiverEnabled(row.receiver_enabled);
      setAllowedSerials(row.allowed_serials || "");
      setRawTrafficEnabled(row.raw_traffic_enabled);
      setDeviceName(row.device_name || "F22");
      setDeviceSerial(row.device_serial_number || "JJA1254800682");
      setFirmwareVersion(row.firmware_version || "6.60");
      setPushVersion(row.push_version || "3.1.2");
      setServerAddress(row.server_address || "192.168.10.46");
      setServerPort(String(row.server_port || 7074));
      setHttpsEnabled(row.https_enabled);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ZKTeco plugin");
      setPlugin(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadPunches = useCallback(async () => {
    setPunchesLoading(true);
    try {
      const data = await fetchZktecoPunches({
        page,
        pageSize: 50,
        employeeCode: employeeFilter.trim() || undefined,
        sn: snFilter.trim() || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setPunches(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load punches");
      setPunches(null);
    } finally {
      setPunchesLoading(false);
    }
  }, [page, employeeFilter, snFilter, fromDate, toDate]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refetch(), 0);
    return () => window.clearTimeout(timer);
  }, [refetch]);

  useEffect(() => {
    if (activeSection !== "list") return;
    const timer = window.setTimeout(() => void loadPunches(), 0);
    return () => window.clearTimeout(timer);
  }, [activeSection, loadPunches]);

  const handleSave = async (verify: boolean) => {
    if (!canWrite) return;
    setSaving(true);
    try {
      await updateZktecoPlugin({
        receiver_enabled: receiverEnabled,
        allowed_serials: allowedSerials,
        raw_traffic_enabled: rawTrafficEnabled,
        device_name: deviceName,
        device_serial_number: deviceSerial,
        firmware_version: firmwareVersion,
        push_version: pushVersion,
        server_address: serverAddress,
        server_port: Number(serverPort) || 7074,
        https_enabled: httpsEnabled,
        verify_connection: verify,
      });
      await refetch();
      toast.success(verify ? "Connection status refreshed" : "Configuration saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading ZKTeco settings…</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">API: {error}</p>;
  }
  if (!plugin) return null;

  if (activeSection === "list") {
    const items: ZktecoPunchItem[] = punches?.items ?? [];
    const summary = punches?.summary;
    const totalPages = punches ? Math.max(1, Math.ceil(punches.total / punches.page_size)) : 1;

    return (
      <div className="overflow-hidden rounded-none border border-input bg-card shadow-sm">
        <div className="border-b border-input bg-muted/30 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Attendance List</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Real punches pushed from ZKTeco devices via ADMS.
              </p>
            </div>
            {summary ? (
              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                <span className="border border-border px-2 py-0.5">
                  Total {summary.total_punches}
                </span>
                <span className="border border-border px-2 py-0.5">
                  Today {summary.today_punches}
                </span>
                <span className="border border-border px-2 py-0.5">
                  Devices {summary.device_count}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 border-b border-input p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <Label htmlFor="zk-emp">Employee code</Label>
            <Input
              id="zk-emp"
              value={employeeFilter}
              onChange={(e) => setEmployeeFilter(e.target.value)}
              placeholder="PIN"
              className="rounded-none"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="zk-sn">Serial (SN)</Label>
            <Input
              id="zk-sn"
              value={snFilter}
              onChange={(e) => setSnFilter(e.target.value)}
              placeholder="Device SN"
              className="rounded-none"
            />
          </div>
          <div className="space-y-1">
            <Label>Date range</Label>
            <DateRangePresetPicker
              value={{ dateFrom: fromDate, dateTo: toDate }}
              onChange={(next) => {
                setFromDate(next.dateFrom);
                setToDate(next.dateTo);
              }}
            />
          </div>
          <div className="flex items-end gap-2">
            <Button
              size="sm"
              className="rounded-none"
              onClick={() => {
                setPage(1);
                void loadPunches();
              }}
            >
              Filter
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-none"
              disabled={punchesLoading}
              onClick={() => void loadPunches()}
            >
              {punchesLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-input bg-muted/20">
              <tr>
                <th className="px-3 py-2 font-semibold">Time</th>
                <th className="px-3 py-2 font-semibold">Employee</th>
                <th className="px-3 py-2 font-semibold">In/Out</th>
                <th className="px-3 py-2 font-semibold">Verify</th>
                <th className="px-3 py-2 font-semibold">SN</th>
                <th className="px-3 py-2 font-semibold">Source</th>
              </tr>
            </thead>
            <tbody>
              {punchesLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No punches yet. Point the device ADMS to this API and punch once.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-b border-input/80">
                    <td className="px-3 py-2 tabular-nums">{row.punch_time}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">
                        {row.employee_name || row.employee_code}
                      </div>
                      {row.employee_name ? (
                        <div className="text-[10px] text-muted-foreground">
                          PIN {row.employee_code}
                          {row.matched === false ? " · unmatched" : ""}
                        </div>
                      ) : (
                        <div className="text-[10px] text-amber-700 dark:text-amber-300">
                          Unmatched — set biometric code on employee
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">{inoutLabel(row.inout_mode)}</td>
                    <td className="px-3 py-2">{row.verify_mode ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[11px]">{row.serial_number}</td>
                    <td className="px-3 py-2">{row.source_table || "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-input px-4 py-3">
          <p className="text-[11px] text-muted-foreground">
            Page {punches?.page ?? page} of {totalPages} · {punches?.total ?? 0} rows
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-none"
              disabled={page <= 1 || punchesLoading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-none"
              disabled={page >= totalPages || punchesLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-none border border-input bg-card shadow-sm">
      <div className="border-b border-input bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Device Connection (ADMS)</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Same PUSH protocol as the ZKTeco test project. Device dials out to{" "}
              <code className="text-[10px]">/iclock</code> on this API.
            </p>
          </div>
          {statusBadge(plugin.connection_status)}
        </div>
        {plugin.connection_message ? (
          <p className="mt-1 text-[11px] text-muted-foreground">{plugin.connection_message}</p>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-none border border-border bg-muted/20 px-3 py-2 text-[11px]">
          <p className="font-semibold">Device ADMS settings</p>
          <p className="mt-1 text-muted-foreground">
            Configure these same values on the physical device. Path root serves{" "}
            <code>/iclock/cdata</code>
          </p>
          <p className="mt-1 font-mono text-[10px] break-all">
            {httpsEnabled ? "https" : "http"}://{serverAddress}:{serverPort}/iclock
          </p>
          {plugin.last_device_seen_at ? (
            <p className="mt-1 text-muted-foreground">
              Last device: <span className="font-medium text-foreground">{plugin.last_device_sn || "—"}</span>{" "}
              at {formatDateTime(plugin.last_device_seen_at)}
            </p>
          ) : (
            <p className="mt-1 text-muted-foreground">No device contact yet.</p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="zk-device-name">Device model</Label>
            <Input
              id="zk-device-name"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              disabled={!canWrite}
              className="rounded-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zk-device-sn">Device serial number</Label>
            <Input
              id="zk-device-sn"
              value={deviceSerial}
              onChange={(e) => setDeviceSerial(e.target.value)}
              disabled={!canWrite}
              className="rounded-none font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zk-firmware">Firmware version</Label>
            <Input
              id="zk-firmware"
              value={firmwareVersion}
              onChange={(e) => setFirmwareVersion(e.target.value)}
              disabled={!canWrite}
              className="rounded-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zk-push-version">Push protocol version</Label>
            <Input
              id="zk-push-version"
              value={pushVersion}
              onChange={(e) => setPushVersion(e.target.value)}
              disabled={!canWrite}
              className="rounded-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zk-server-address">ADMS server address</Label>
            <Input
              id="zk-server-address"
              value={serverAddress}
              onChange={(e) => setServerAddress(e.target.value)}
              disabled={!canWrite}
              className="rounded-none font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="zk-server-port">ADMS server port</Label>
            <Input
              id="zk-server-port"
              type="number"
              min="1"
              max="65535"
              value={serverPort}
              onChange={(e) => setServerPort(e.target.value)}
              disabled={!canWrite}
              className="rounded-none"
            />
          </div>
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">HTTPS on device</span>
            <span className="block text-[11px] text-muted-foreground">
              Keep off for the current F22 LAN setup.
            </span>
          </span>
          <input
            type="checkbox"
            checked={httpsEnabled}
            disabled={!canWrite}
            onChange={(e) => setHttpsEnabled(e.target.checked)}
            className="h-4 w-4 rounded-none border-input"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">ADMS receiver enabled</span>
            <span className="block text-[11px] text-muted-foreground">
              When off, handshake still returns OK but punches are not stored.
            </span>
          </span>
          <input
            type="checkbox"
            checked={receiverEnabled}
            disabled={!canWrite}
            onChange={(e) => setReceiverEnabled(e.target.checked)}
            className="h-4 w-4 rounded-none border-input"
          />
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="zk-allowed">Allowed serial numbers (optional)</Label>
          <Input
            id="zk-allowed"
            value={allowedSerials}
            onChange={(e) => setAllowedSerials(e.target.value)}
            placeholder="Leave empty to accept all SN — or comma-separated list"
            disabled={!canWrite}
            className="rounded-none"
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span>
            <span className="block text-sm font-medium">Raw traffic log</span>
            <span className="block text-[11px] text-muted-foreground">
              Append device HTTP dumps under API uploads/zkteco_push_received.txt
            </span>
          </span>
          <input
            type="checkbox"
            checked={rawTrafficEnabled}
            disabled={!canWrite}
            onChange={(e) => setRawTrafficEnabled(e.target.checked)}
            className="h-4 w-4 rounded-none border-input"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-input px-4 py-3">
        <Button
          size="sm"
          variant="outline"
          className="rounded-none"
          disabled={!canWrite || saving}
          onClick={() => void handleSave(false)}
        >
          Save
        </Button>
        <Button
          size="sm"
          className="rounded-none"
          disabled={!canWrite || saving}
          onClick={() => void handleSave(true)}
        >
          {saving ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
          )}
          Refresh Status
        </Button>
      </div>
    </div>
  );
}
