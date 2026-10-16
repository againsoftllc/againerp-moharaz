import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  Coins,
  ExternalLink,
  Fingerprint,
  HardDrive,
  Mail,
  Palette,
  Pencil,
  Plus,
  Save,
  Search,
  Settings2,
  Shield,
  Trash2,
  X,
  FileBadge,
  FileCheck,
  FileSignature,
} from "lucide-react";
import { toast } from "sonner";
import { ContentDataSkeleton } from "@/components/layout/content-data-skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/native-select";
import {
  createHrmIpRestriction,
  deleteHrmIpRestriction,
  listHrmIpRestrictions,
  updateHrmIpRestriction,
  type ApiIpRestriction,
} from "@/lib/api/hrm-ip-restrictions";
import { useAdminCanWrite } from "@/lib/hooks/use-admin-can-write";
import { cn } from "@/lib/utils";

const GREEN_BTN =
  "rounded-none bg-[#4caf50] text-white hover:bg-[#43a047] border-transparent";

const SETTINGS_STORAGE_KEY = "againerp.hrm.settings.draft.v1";

type FieldType = "text" | "password" | "number" | "textarea" | "select" | "toggle" | "days" | "color";

type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
  hint?: string;
};

type SectionDef = {
  id: string;
  title: string;
  description: string;
  icon: typeof Settings2;
  fields: FieldDef[];
};

const WEEKDAYS = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
] as const;

/** Workdo HRM Settings — company configuration sections. */
const SECTIONS: SectionDef[] = [
  {
    id: "system",
    title: "System Settings",
    description: "Language, date, time, and timezone.",
    icon: Settings2,
    fields: [
      {
        key: "defaultLanguage",
        label: "Default Language",
        type: "select",
        options: [
          { value: "en", label: "English" },
          { value: "bn", label: "Bangla" },
          { value: "ar", label: "Arabic" },
        ],
      },
      {
        key: "dateFormat",
        label: "Date Format",
        type: "select",
        options: [
          { value: "Y-m-d", label: "YYYY-MM-DD" },
          { value: "d/m/Y", label: "DD/MM/YYYY" },
          { value: "m/d/Y", label: "MM/DD/YYYY" },
        ],
      },
      {
        key: "timeFormat",
        label: "Time Format",
        type: "select",
        options: [
          { value: "24", label: "24 hour" },
          { value: "12", label: "12 hour" },
        ],
      },
      {
        key: "timezone",
        label: "Default Timezone",
        type: "select",
        options: [
          { value: "Asia/Dhaka", label: "Asia/Dhaka" },
          { value: "UTC", label: "UTC" },
          { value: "Asia/Kolkata", label: "Asia/Kolkata" },
          { value: "America/New_York", label: "America/New_York" },
        ],
      },
    ],
  },
  {
    id: "brand",
    title: "Brand Settings",
    description: "Company branding and appearance.",
    icon: Palette,
    fields: [
      { key: "logoDark", label: "Logo Dark (URL)", type: "text", placeholder: "/brand/logo-dark.svg" },
      { key: "logoLight", label: "Logo Light (URL)", type: "text", placeholder: "/brand/logo-light.svg" },
      { key: "favicon", label: "Favicon (URL)", type: "text", placeholder: "/favicon.ico" },
      { key: "titleText", label: "Title Text", type: "text", placeholder: "AgainERP HRM" },
      { key: "footerText", label: "Footer Text", type: "textarea", placeholder: "© AgainERP" },
      { key: "themeColor", label: "Theme Color", type: "color" },
      { key: "customColor", label: "Custom Color", type: "color" },
      {
        key: "sidebarVariant",
        label: "Sidebar Variant",
        type: "select",
        options: [
          { value: "inset", label: "Inset" },
          { value: "floating", label: "Floating" },
          { value: "sidebar", label: "Sidebar" },
        ],
      },
      {
        key: "layoutDirection",
        label: "Layout Direction",
        type: "select",
        options: [
          { value: "ltr", label: "LTR" },
          { value: "rtl", label: "RTL" },
        ],
      },
      {
        key: "themeMode",
        label: "Theme Mode",
        type: "select",
        options: [
          { value: "system", label: "System" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ],
      },
    ],
  },
  {
    id: "company",
    title: "Company Settings",
    description: "Organization name, address, and registration details.",
    icon: Building2,
    fields: [
      { key: "companyName", label: "Company Name", type: "text", placeholder: "AgainERP Ltd." },
      { key: "companyEmail", label: "Company Email", type: "text", placeholder: "hr@againerp.local" },
      { key: "companyPhone", label: "Telephone", type: "text", placeholder: "+8801XXXXXXXXX" },
      { key: "companyAddress", label: "Address", type: "textarea", placeholder: "Street, area" },
      { key: "companyCity", label: "City", type: "text", placeholder: "Dhaka" },
      { key: "companyState", label: "State / Division", type: "text", placeholder: "Dhaka" },
      { key: "companyCountry", label: "Country", type: "text", placeholder: "Bangladesh" },
      { key: "companyZip", label: "Zip Code", type: "text", placeholder: "1200" },
      { key: "taxNumber", label: "Tax Number", type: "text" },
      { key: "registrationNumber", label: "Registration Number", type: "text" },
    ],
  },
  {
    id: "currency",
    title: "Currency Settings",
    description: "Currency and number formatting.",
    icon: Coins,
    fields: [
      {
        key: "defaultCurrency",
        label: "Default Currency",
        type: "select",
        options: [
          { value: "BDT", label: "BDT — Bangladeshi Taka" },
          { value: "USD", label: "USD — US Dollar" },
          { value: "EUR", label: "EUR — Euro" },
          { value: "INR", label: "INR — Indian Rupee" },
        ],
      },
      { key: "currencySymbol", label: "Currency Symbol", type: "text", placeholder: "৳" },
      {
        key: "currencyPosition",
        label: "Currency Position",
        type: "select",
        options: [
          { value: "before", label: "Before amount" },
          { value: "after", label: "After amount" },
        ],
      },
      { key: "thousandSeparator", label: "Thousand Separator", type: "text", placeholder: "," },
      { key: "decimalSeparator", label: "Decimal Separator", type: "text", placeholder: "." },
      { key: "numberOfDecimals", label: "Number of Decimals", type: "number", placeholder: "2" },
    ],
  },
  {
    id: "email",
    title: "Email Settings",
    description: "SMTP for notifications and payslips.",
    icon: Mail,
    fields: [
      {
        key: "mailDriver",
        label: "Mail Driver",
        type: "select",
        options: [
          { value: "smtp", label: "SMTP" },
          { value: "mailgun", label: "Mailgun" },
          { value: "ses", label: "Amazon SES" },
        ],
      },
      { key: "mailHost", label: "Mail Host", type: "text", placeholder: "smtp.example.com" },
      { key: "mailPort", label: "Mail Port", type: "number", placeholder: "587" },
      { key: "mailUsername", label: "Mail Username", type: "text" },
      { key: "mailPassword", label: "Mail Password", type: "password" },
      {
        key: "mailEncryption",
        label: "Mail Encryption",
        type: "select",
        options: [
          { value: "tls", label: "TLS" },
          { value: "ssl", label: "SSL" },
          { value: "none", label: "None" },
        ],
      },
      { key: "fromAddress", label: "From Address", type: "text", placeholder: "hr@againerp.local" },
      { key: "fromName", label: "From Name", type: "text", placeholder: "AgainERP HRM" },
    ],
  },
  {
    id: "working-days",
    title: "Working Days Settings",
    description: "Days counted in attendance and leave.",
    icon: CalendarDays,
    fields: [
      {
        key: "workingDays",
        label: "Working Days",
        type: "days",
        hint: "Enabled days count as working days; disabled days are non-working.",
      },
    ],
  },
  {
    id: "ip-restriction",
    title: "IP Restriction Settings",
    description: "Limit clock-in/out to allowed IPs.",
    icon: Shield,
    fields: [
      { key: "ipRestrictionEnabled", label: "Enable IP Restriction", type: "toggle" },
    ],
  },
  {
    id: "zkteco",
    title: "ZKTeco Settings",
    description: "Biometric attendance — managed by the Workspace plugin.",
    icon: Fingerprint,
    fields: [],
  },
  {
    id: "noc",
    title: "NOC Settings",
    description: "No Objection Certificate letter template.",
    icon: FileBadge,
    fields: [
      { key: "nocEnabled", label: "Enable NOC Letters", type: "toggle" },
      { key: "nocTitle", label: "Letter Title", type: "text", placeholder: "No Objection Certificate" },
      { key: "nocPrefix", label: "Document Prefix", type: "text", placeholder: "NOC-" },
      { key: "nocHeader", label: "Header Content", type: "textarea" },
      {
        key: "nocBody",
        label: "Body Template",
        type: "textarea",
        placeholder: "Use {{employee_name}}, {{designation}}, {{department}}",
      },
      { key: "nocFooter", label: "Footer / Signatory", type: "textarea" },
    ],
  },
  {
    id: "experience-certificate",
    title: "Experience Certificate Settings",
    description: "Experience certificate letter template.",
    icon: FileCheck,
    fields: [
      { key: "expEnabled", label: "Enable Experience Certificates", type: "toggle" },
      { key: "expTitle", label: "Letter Title", type: "text", placeholder: "Experience Certificate" },
      { key: "expPrefix", label: "Document Prefix", type: "text", placeholder: "EXP-" },
      { key: "expHeader", label: "Header Content", type: "textarea" },
      {
        key: "expBody",
        label: "Body Template",
        type: "textarea",
        placeholder: "Use {{employee_name}}, {{join_date}}, {{relieving_date}}",
      },
      { key: "expFooter", label: "Footer / Signatory", type: "textarea" },
    ],
  },
  {
    id: "joining-letter",
    title: "Joining Letter Settings",
    description: "Employee joining letter template.",
    icon: FileSignature,
    fields: [
      { key: "joinEnabled", label: "Enable Joining Letters", type: "toggle" },
      { key: "joinTitle", label: "Letter Title", type: "text", placeholder: "Joining Letter" },
      { key: "joinPrefix", label: "Document Prefix", type: "text", placeholder: "JL-" },
      { key: "joinHeader", label: "Header Content", type: "textarea" },
      {
        key: "joinBody",
        label: "Body Template",
        type: "textarea",
        placeholder: "Use {{employee_name}}, {{designation}}, {{joining_date}}, {{salary}}",
      },
      { key: "joinFooter", label: "Footer / Signatory", type: "textarea" },
    ],
  },
  {
    id: "storage",
    title: "Storage Settings",
    description: "File storage for uploads and documents.",
    icon: HardDrive,
    fields: [
      {
        key: "storageDriver",
        label: "Storage Driver",
        type: "select",
        options: [
          { value: "local", label: "Local" },
          { value: "s3", label: "AWS S3" },
          { value: "wasabi", label: "Wasabi" },
          { value: "do_spaces", label: "DigitalOcean Spaces" },
        ],
      },
      { key: "storageAccessKey", label: "Access Key", type: "text" },
      { key: "storageSecretKey", label: "Secret Key", type: "password" },
      { key: "storageBucket", label: "Bucket", type: "text" },
      { key: "storageRegion", label: "Region", type: "text", placeholder: "ap-southeast-1" },
      { key: "maxFileSizeMb", label: "Max File Size (MB)", type: "number", placeholder: "10" },
      {
        key: "allowedFileTypes",
        label: "Allowed File Types",
        type: "text",
        placeholder: "jpg,png,pdf,doc,docx",
      },
    ],
  },
];

function defaultValues(): Record<string, string> {
  return {
    defaultLanguage: "en",
    dateFormat: "Y-m-d",
    timeFormat: "24",
    timezone: "Asia/Dhaka",
    logoDark: "",
    logoLight: "",
    favicon: "",
    titleText: "AgainERP HRM",
    footerText: "© AgainERP",
    themeColor: "#4caf50",
    customColor: "#243b3b",
    sidebarVariant: "inset",
    layoutDirection: "ltr",
    themeMode: "system",
    companyName: "AgainERP Ltd.",
    companyEmail: "hr@againerp.local",
    companyPhone: "+8801711000000",
    companyAddress: "Gulshan, Dhaka",
    companyCity: "Dhaka",
    companyState: "Dhaka",
    companyCountry: "Bangladesh",
    companyZip: "1212",
    taxNumber: "",
    registrationNumber: "",
    defaultCurrency: "BDT",
    currencySymbol: "৳",
    currencyPosition: "before",
    thousandSeparator: ",",
    decimalSeparator: ".",
    numberOfDecimals: "2",
    mailDriver: "smtp",
    mailHost: "",
    mailPort: "587",
    mailUsername: "",
    mailPassword: "",
    mailEncryption: "tls",
    fromAddress: "hr@againerp.local",
    fromName: "AgainERP HRM",
    workingDays: "monday,tuesday,wednesday,thursday,friday",
    ipRestrictionEnabled: "no",
    allowedIps: "",
    zktecoEnabled: "no",
    zktecoApiUrl: "",
    zktecoUsername: "",
    zktecoPassword: "",
    zktecoAuthToken: "",
    nocEnabled: "yes",
    nocTitle: "No Objection Certificate",
    nocPrefix: "NOC-",
    nocHeader: "",
    nocBody: "This is to certify that {{employee_name}}, {{designation}}, {{department}}…",
    nocFooter: "Authorized Signatory",
    expEnabled: "yes",
    expTitle: "Experience Certificate",
    expPrefix: "EXP-",
    expHeader: "",
    expBody: "This is to certify that {{employee_name}} worked from {{join_date}} to {{relieving_date}}…",
    expFooter: "Authorized Signatory",
    joinEnabled: "yes",
    joinTitle: "Joining Letter",
    joinPrefix: "JL-",
    joinHeader: "",
    joinBody: "Dear {{employee_name}}, we are pleased to offer you the position of {{designation}}…",
    joinFooter: "HR Department",
    storageDriver: "local",
    storageAccessKey: "",
    storageSecretKey: "",
    storageBucket: "",
    storageRegion: "",
    maxFileSizeMb: "10",
    allowedFileTypes: "jpg,png,pdf,doc,docx",
  };
}

function FieldControl({
  field,
  value,
  onChange,
  disabled,
}: {
  field: FieldDef;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  if (field.type === "toggle") {
    const on = value === "yes";
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={disabled}
        onClick={() => onChange(on ? "no" : "yes")}
        className={cn(
          "inline-flex h-8 items-center rounded-none border px-3 text-xs font-medium",
          on
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
            : "border-border bg-muted/40 text-muted-foreground",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        {on ? "Enabled" : "Disabled"}
      </button>
    );
  }

  if (field.type === "days") {
    const selected = new Set(value.split(",").filter(Boolean));
    return (
      <div className="flex flex-wrap gap-1.5">
        {WEEKDAYS.map((d) => {
          const active = selected.has(d.value);
          return (
            <button
              key={d.value}
              type="button"
              disabled={disabled}
              onClick={() => {
                const next = new Set(selected);
                if (active) next.delete(d.value);
                else next.add(d.value);
                onChange([...next].join(","));
              }}
              className={cn(
                "rounded-none border px-2.5 py-1 text-xs font-medium",
                active
                  ? "border-emerald-500/40 bg-emerald-500/15 text-foreground"
                  : "border-border bg-background text-muted-foreground",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    );
  }

  if (field.type === "color") {
    const hex = value || "#4caf50";
    return (
      <div className="flex max-w-md items-center gap-2">
        <input
          type="color"
          value={hex}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 cursor-pointer rounded-none border border-border bg-background p-1"
        />
        <Input
          value={hex}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 flex-1 rounded-none font-mono text-xs"
        />
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <Select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full max-w-md rounded-none"
      >
        {(field.options ?? []).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        disabled={disabled}
        className="min-h-[88px] w-full max-w-2xl rounded-none border border-input bg-background px-3 py-2 text-sm disabled:opacity-60"
        value={value}
        placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return (
    <Input
      type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
      value={value}
      placeholder={field.placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 max-w-md rounded-none"
    />
  );
}

function IpRestrictionsPanel({ canWrite }: { canWrite: boolean }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ApiIpRestriction[]>([]);
  const [search, setSearch] = useState("");
  const [newIp, setNewIp] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editIp, setEditIp] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listHrmIpRestrictions();
      setRows(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load IP restrictions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.ip_address ?? "").toLowerCase().includes(q));
  }, [rows, search]);

  const addIp = async () => {
    if (!canWrite) {
      toast.error("Read-only access");
      return;
    }
    const ip = newIp.trim();
    if (!ip) {
      toast.error("Enter an IP address");
      return;
    }
    setSaving(true);
    try {
      await createHrmIpRestriction({ ipAddress: ip });
      setNewIp("");
      toast.success("IP address added");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add IP");
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editId || !canWrite) return;
    const ip = editIp.trim();
    if (!ip) {
      toast.error("Enter an IP address");
      return;
    }
    setSaving(true);
    try {
      await updateHrmIpRestriction(editId, { ipAddress: ip });
      setEditId(null);
      setEditIp("");
      toast.success("IP address updated");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const removeIp = async (row: ApiIpRestriction) => {
    if (!canWrite) {
      toast.error("Read-only access");
      return;
    }
    if (!window.confirm(`Remove ${row.ip_address}?`)) return;
    try {
      await deleteHrmIpRestriction(row.id);
      toast.success("IP address removed");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  if (loading) {
    return <ContentDataSkeleton label="Loading allowed IPs…" />;
  }

  return (
    <div className="space-y-3 border-b border-border/60 pb-4">
      <div>
        <Label className="text-xs text-muted-foreground">Allowed IP Addresses</Label>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Clock-in/out is limited to these IPs when restriction is enabled.
        </p>
      </div>

      {canWrite ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={newIp}
            onChange={(e) => setNewIp(e.target.value)}
            placeholder="103.xx.xx.xx or 192.168.1.0/24"
            className="h-9 max-w-md flex-1 rounded-none font-mono text-xs"
            disabled={saving}
          />
          <Button
            type="button"
            size="sm"
            className={cn("h-9", GREEN_BTN)}
            disabled={saving}
            onClick={() => void addIp()}
          >
            <Plus className="size-3.5" />
            Add IP
          </Button>
        </div>
      ) : null}

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search IPs..."
          className="h-9 rounded-none pl-8 font-mono text-xs"
        />
      </div>

      <div className="max-w-2xl rounded-none border border-border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/60">
            <tr className="border-b border-border text-left">
              <th className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                IP Address
              </th>
              <th className="w-[1%] px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No allowed IPs configured.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.id} className="border-b border-border/60 last:border-b-0">
                  <td className="px-3 py-2 font-mono text-xs">
                    {editId === row.id ? (
                      <Input
                        value={editIp}
                        onChange={(e) => setEditIp(e.target.value)}
                        className="h-8 rounded-none font-mono text-xs"
                        disabled={saving}
                      />
                    ) : (
                      row.ip_address ?? "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {canWrite ? (
                      <div className="flex items-center gap-0.5">
                        {editId === row.id ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none text-emerald-600"
                              disabled={saving}
                              onClick={() => void saveEdit()}
                            >
                              <Save className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none"
                              onClick={() => {
                                setEditId(null);
                                setEditIp("");
                              }}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none"
                              onClick={() => {
                                setEditId(row.id);
                                setEditIp(row.ip_address ?? "");
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-none text-red-600"
                              onClick={() => void removeIp(row)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Workdo-style HRM Settings — IP Restriction API-backed; ZKTeco links to plugin; other tabs localStorage draft. */
export function HrmConfigurationPage() {
  const canWrite = useAdminCanWrite();
  const [values, setValues] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return defaultValues();
    try {
      const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return defaultValues();
      return { ...defaultValues(), ...(JSON.parse(raw) as Record<string, string>) };
    } catch {
      return defaultValues();
    }
  });
  const [activeId, setActiveId] = useState(SECTIONS[0]!.id);

  const sections = useMemo(() => SECTIONS, []);
  const active = sections.find((s) => s.id === activeId) ?? sections[0]!;
  const isLivePanel = active.id === "ip-restriction" || active.id === "zkteco";

  const setField = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const saveSection = () => {
    if (!canWrite) {
      toast.error("Read-only access");
      return;
    }
    if (isLivePanel) {
      toast.message(
        active.id === "zkteco"
          ? "Use the ZKTeco plugin page to change device settings"
          : "IP list saves automatically when you add or edit rows",
      );
      return;
    }
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(values));
      toast.success(`${active.title} saved on this browser`);
    } catch {
      toast.error("Could not save settings locally");
    }
  };

  const ActiveIcon = active.icon;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          IP Restriction and ZKTeco are live. Other sections save as a browser draft (Workdo-style
          chrome).
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[240px_1fr]">
        <nav className="h-fit rounded-none border border-border bg-card lg:sticky lg:top-0">
          <div className="border-b border-border px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Categories
          </div>
          <ul className="max-h-[min(70vh,560px)] overflow-auto p-1.5">
            {sections.map((section) => {
              const Icon = section.icon;
              const selected = section.id === active.id;
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(section.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-none px-2.5 py-2 text-left text-sm transition-colors",
                      selected
                        ? "bg-[#4caf50]/15 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{section.title.replace(/ Settings$/, "")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex min-h-0 flex-col rounded-none border border-border bg-card">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-none border border-border bg-muted/40 text-muted-foreground">
                <ActiveIcon className="size-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{active.title}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{active.description}</p>
              </div>
            </div>
            {canWrite && !isLivePanel ? (
              <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)} onClick={saveSection}>
                <Save className="size-3.5" />
                Save Changes
              </Button>
            ) : null}
          </div>

          <div className="flex-1 space-y-4 overflow-auto p-4">
            {active.id === "ip-restriction" ? <IpRestrictionsPanel canWrite={canWrite} /> : null}
            {active.id === "zkteco" ? <ZktecoLinksPanel /> : null}
            {active.fields.map((field) => (
              <div
                key={field.key}
                className="grid gap-1.5 border-b border-border/60 pb-4 last:border-b-0 sm:grid-cols-[200px_1fr] sm:items-start"
              >
                <Label className="pt-2 text-xs text-muted-foreground">{field.label}</Label>
                <div>
                  <FieldControl
                    field={field}
                    value={values[field.key] ?? ""}
                    onChange={(v) => setField(field.key, v)}
                    disabled={!canWrite}
                  />
                  {field.hint ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">{field.hint}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {canWrite && !isLivePanel ? (
            <div className="flex justify-end border-t border-border p-4">
              <Button type="button" size="sm" className={cn("h-9", GREEN_BTN)} onClick={saveSection}>
                <Save className="size-3.5" />
                Save {active.title.replace(/ Settings$/, "")}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ZktecoLinksPanel() {
  return (
    <div className="space-y-3 rounded-none border border-border bg-muted/20 p-4 text-sm">
      <p className="text-muted-foreground">
        Device ADMS, serial allow-list, and live punches are configured in the Workspace ZKTeco
        plugin. HRM biometric attendance matches device PIN to employee biometric code.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" className={cn("h-9 rounded-none", GREEN_BTN)}>
          <Link href="/workspace/plugins/zkteco">
            Open ZKTeco plugin
            <ExternalLink className="ml-1.5 size-3.5" />
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-9 rounded-none">
          <Link href="/hrm/attendance/biometric">Biometric attendance</Link>
        </Button>
        <Button asChild size="sm" variant="outline" className="h-9 rounded-none">
          <Link href="/hrm/employees">Employee biometric codes</Link>
        </Button>
      </div>
    </div>
  );
}
