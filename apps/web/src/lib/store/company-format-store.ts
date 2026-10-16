import { create } from "zustand";
import {
  DEFAULT_COMPANY_FORMAT,
  normalizeCompanyFormat,
  type CompanyFormatSettings,
} from "@/lib/localisation/company-format";

type CompanyFormatStore = {
  format: CompanyFormatSettings;
  setFormat: (next: Partial<CompanyFormatSettings> | unknown) => void;
};

export const useCompanyFormatStore = create<CompanyFormatStore>((set) => ({
  format: DEFAULT_COMPANY_FORMAT,
  setFormat: (next) =>
    set((state) => ({
      format: normalizeCompanyFormat({ ...state.format, ...(next as object) }),
    })),
}));

export function hydrateCompanyFormat(row: unknown) {
  useCompanyFormatStore.setState({ format: normalizeCompanyFormat(row) });
}

export function getCompanyFormat(): CompanyFormatSettings {
  return useCompanyFormatStore.getState().format;
}
