/** Workdo demo: split Add form + searchable component list. */

export type ComponentType = "earning" | "deduction";
export type CalculationType = "fixed" | "percentage";
export type ComponentStatus = "active" | "inactive";

export type SalaryComponent = {
  id: string;
  name: string;
  description: string;
  componentType: ComponentType;
  calculationType: CalculationType;
  /** Fixed amount or percentage value depending on calculationType */
  value: number;
  status: ComponentStatus;
  locked: boolean;
  isTaxable?: boolean;
  isMandatory?: boolean;
};

export const COMPONENT_TYPE_LABEL: Record<ComponentType, string> = {
  earning: "Earning",
  deduction: "Deduction",
};

export const CALCULATION_TYPE_LABEL: Record<CalculationType, string> = {
  fixed: "Fixed Amount",
  percentage: "Percentage of Basic",
};

export const COMPONENT_STATUS_LABEL: Record<ComponentStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

export const COMPONENT_TYPE_OPTIONS = (
  Object.keys(COMPONENT_TYPE_LABEL) as ComponentType[]
).map((k) => ({ value: k, label: COMPONENT_TYPE_LABEL[k] }));

export const CALCULATION_TYPE_OPTIONS = (
  Object.keys(CALCULATION_TYPE_LABEL) as CalculationType[]
).map((k) => ({ value: k, label: CALCULATION_TYPE_LABEL[k] }));

export const COMPONENT_STATUS_OPTIONS = (
  Object.keys(COMPONENT_STATUS_LABEL) as ComponentStatus[]
).map((k) => ({ value: k, label: COMPONENT_STATUS_LABEL[k] }));

export function formatComponentAmount(row: SalaryComponent): string {
  if (row.calculationType === "percentage") {
    return `${row.value.toFixed(2)}%`;
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(row.value);
}

export function calculationHint(type: CalculationType): string {
  return type === "fixed" ? "Fixed amount" : "Of basic salary";
}
