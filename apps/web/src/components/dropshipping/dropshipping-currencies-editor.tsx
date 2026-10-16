"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  DROPSHIPPING_CURRENCY_PRESETS,
  type DropshippingCurrencyRate,
} from "@/lib/mock-data/dropshipping-settings";
import { FieldHelpTip } from "@/components/sales/field-help-tip";

const again = {
  headerBg: "var(--muted)",
  headerText: "var(--foreground)",
  bodyBg: "var(--card)",
  title: "var(--foreground)",
  help: "var(--muted-foreground)",
  border: "var(--border)",
  checkboxBorder: "var(--input)",
  accent: "#00a09d",
} as const;

function nextId() {
  return `cur_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function DropshippingCurrenciesEditor({
  currencies,
  onChange,
}: {
  currencies: DropshippingCurrencyRate[];
  onChange: (next: DropshippingCurrencyRate[]) => void;
}) {
  const [customCode, setCustomCode] = useState("");
  const [addCode, setAddCode] = useState("");

  const usedCodes = useMemo(
    () => new Set(currencies.map((c) => c.code.toUpperCase())),
    [currencies],
  );

  const availablePresets = useMemo(
    () => DROPSHIPPING_CURRENCY_PRESETS.filter((p) => !usedCodes.has(p.code)),
    [usedCodes],
  );

  const patchRow = (id: string, patch: Partial<DropshippingCurrencyRate>) => {
    onChange(currencies.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const removeRow = (id: string) => {
    if (currencies.length <= 1) {
      toast.message("Keep at least one currency rate");
      return;
    }
    onChange(currencies.filter((row) => row.id !== id));
  };

  const addFromPreset = (code: string) => {
    const preset = DROPSHIPPING_CURRENCY_PRESETS.find((p) => p.code === code);
    if (!preset) return;
    if (usedCodes.has(preset.code)) {
      toast.message(`${preset.code} is already added`);
      return;
    }
    onChange([
      ...currencies,
      { id: nextId(), code: preset.code, name: preset.name, rateToBdt: preset.rateToBdt, active: true },
    ]);
    setAddCode("");
  };

  const addCustom = () => {
    const code = customCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      toast.message("Use a 3-letter currency code (e.g. EUR)");
      return;
    }
    if (code === "BDT") {
      toast.message("BDT is the base sell currency");
      return;
    }
    if (usedCodes.has(code)) {
      toast.message(`${code} is already added`);
      return;
    }
    onChange([
      ...currencies,
      { id: nextId(), code, name: code, rateToBdt: 1, active: true },
    ]);
    setCustomCode("");
  };

  return (
    <section
      id="currencies"
      className="overflow-hidden rounded-sm border"
      style={{ borderColor: again.border, backgroundColor: again.bodyBg }}
    >
      <div className="px-4 py-2" style={{ backgroundColor: again.headerBg }}>
        <h2 className="text-[13px] font-bold leading-none" style={{ color: again.headerText }}>
          Currencies
        </h2>
      </div>

      <div className="px-4 py-5 sm:px-5" style={{ backgroundColor: again.bodyBg }}>
        <div className="mb-4 flex items-start gap-1.5">
          <div>
            <p className="text-[13px] font-bold leading-tight" style={{ color: again.title }}>
              Exchange rates to BDT
            </p>
            <p className="mt-0.5 text-[13px] leading-[1.35]" style={{ color: again.help }}>
              Add source currencies used on import. Sell currency stays BDT. Rate = BDT per 1 unit.
            </p>
          </div>
          <FieldHelpTip label="Example: CNY rate 18 means ¥1 = ৳18. Used when converting supplier cost to sell price." />
        </div>

        {/* Base currency */}
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-[3px] border px-3 py-2.5"
          style={{ borderColor: again.border, backgroundColor: again.headerBg }}
        >
          <div>
            <p className="text-[13px] font-bold" style={{ color: again.title }}>
              BDT — Bangladeshi Taka
            </p>
            <p className="text-[12px]" style={{ color: again.help }}>
              Base sell currency (locked)
            </p>
          </div>
          <span
            className="rounded-[3px] px-2 py-0.5 text-[12px] font-bold"
            style={{ backgroundColor: again.accent, color: "#fff" }}
          >
            Base
          </span>
        </div>

        <div className="overflow-x-auto rounded-[3px] border" style={{ borderColor: again.border }}>
          <table className="w-full min-w-[32rem] border-collapse text-left text-[13px]">
            <thead style={{ backgroundColor: again.headerBg }}>
              <tr>
                <th className="px-3 py-2 font-bold" style={{ color: again.headerText }}>
                  Code
                </th>
                <th className="px-3 py-2 font-bold" style={{ color: again.headerText }}>
                  Name
                </th>
                <th className="px-3 py-2 font-bold" style={{ color: again.headerText }}>
                  Rate → BDT
                </th>
                <th className="px-3 py-2 font-bold" style={{ color: again.headerText }}>
                  Active
                </th>
                <th className="w-16 px-3 py-2 font-bold" style={{ color: again.headerText }} />
              </tr>
            </thead>
            <tbody>
              {currencies.map((row) => (
                <tr key={row.id} className="border-t" style={{ borderColor: again.border }}>
                  <td className="px-3 py-2">
                    <span className="font-bold tabular-nums" style={{ color: again.title }}>
                      {row.code}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => patchRow(row.id, { name: e.target.value })}
                      className="h-8 w-full max-w-[12rem] rounded-[3px] border bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/30"
                      style={{ borderColor: again.checkboxBorder, color: again.title }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={row.rateToBdt}
                        onChange={(e) =>
                          patchRow(row.id, { rateToBdt: Number(e.target.value) || 0 })
                        }
                        className="h-8 w-24 rounded-[3px] border bg-background px-2 text-[13px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/30"
                        style={{ borderColor: again.checkboxBorder, color: again.title }}
                      />
                      <span style={{ color: again.help }}>৳</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={row.active}
                      onChange={(e) => patchRow(row.id, { active: e.target.checked })}
                      className="h-4 w-4 cursor-pointer accent-[#00a09d]"
                      aria-label={`Active ${row.code}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-[13px] font-bold hover:underline"
                      style={{ color: "#c75050" }}
                      onClick={() => removeRow(row.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem]">
            <label className="mb-1 block text-[12px] font-bold" style={{ color: again.help }}>
              Add from list
            </label>
            <select
              value={addCode}
              onChange={(e) => {
                const code = e.target.value;
                setAddCode(code);
                if (code) addFromPreset(code);
              }}
              disabled={availablePresets.length === 0}
              className="h-8 w-full min-w-[11rem] rounded-[3px] border bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/30 disabled:opacity-50"
              style={{ borderColor: again.checkboxBorder, color: again.title }}
            >
              <option value="">
                {availablePresets.length ? "Select currency…" : "All presets added"}
              </option>
              {availablePresets.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[8rem]">
            <label className="mb-1 block text-[12px] font-bold" style={{ color: again.help }}>
              Custom code
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={3}
                placeholder="EUR"
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                className="h-8 w-20 rounded-[3px] border bg-background px-2 text-[13px] uppercase tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[#00a09d]/30"
                style={{ borderColor: again.checkboxBorder, color: again.title }}
              />
              <button
                type="button"
                className="h-8 rounded-[3px] px-3 text-[13px] font-bold text-white hover:opacity-90"
                style={{ backgroundColor: "#714B67" }}
                onClick={addCustom}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
