import { employeeAvatarUrl } from "@/lib/mock-data/employees";

export type Award = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  designation: string;
  /** FK to award type (API). */
  awardTypeId?: string;
  awardType: string;
  date: string;
  gift: string;
  description: string;
  certificate: string;
};

export const AWARD_TYPES = [
  "Employee of the Month",
  "Innovation Award",
  "Long Service",
  "Team Player",
  "Outstanding Performance",
  "Customer Hero",
] as const;

export const AWARD_EMPLOYEES = [
  { id: "emp_01", name: "Karim Ahmed", department: "Sales", designation: "Sales Executive" },
  { id: "emp_02", name: "Sadia Rahman", department: "Finance", designation: "Finance Analyst" },
  { id: "emp_03", name: "Tanvir Hasan", department: "Technology", designation: "Software Engineer" },
  { id: "emp_04", name: "Nusrat Jahan", department: "Technology", designation: "Senior Software Engineer" },
  { id: "emp_05", name: "Farzana Islam", department: "Human Resources", designation: "HR Executive" },
  { id: "emp_06", name: "Imran Hossain", department: "Customer Support", designation: "Support Agent" },
] as const;

export function awardAvatar(employeeId: string) {
  return employeeAvatarUrl(employeeId);
}

export function createAwardId(existing: Award[]) {
  let max = 0;
  for (const r of existing) {
    const n = Number(r.id.replace(/\D/g, ""));
    if (n > max) max = n;
  }
  return `awd_${String(max + 1).padStart(2, "0")}`;
}

/** Workdo-style awards — Employee, Award Type, Date, Gift, Description. */
export const AWARDS_SEED: Award[] = [
  {
    id: "awd_01",
    employeeId: "emp_01",
    employeeName: "Karim Ahmed",
    department: "Sales",
    designation: "Sales Executive",
    awardType: "Employee of the Month",
    date: "2026-01-31",
    gift: "Trophy + Certificate",
    description: "Exceeded sales targets and mentored junior teammates throughout January.",
    certificate: "karim-eom-jan2026.pdf",
  },
  {
    id: "awd_02",
    employeeId: "emp_02",
    employeeName: "Sadia Rahman",
    department: "Finance",
    designation: "Finance Analyst",
    awardType: "Innovation Award",
    date: "2025-12-15",
    gift: "Gift voucher $200",
    description: "Led payroll reconciliation automation that cut month-end close by two days.",
    certificate: "sadia-innovation.pdf",
  },
  {
    id: "awd_03",
    employeeId: "emp_03",
    employeeName: "Tanvir Hasan",
    department: "Technology",
    designation: "Software Engineer",
    awardType: "Long Service",
    date: "2026-01-10",
    gift: "Appreciation plaque",
    description: "Five years of continuous service and reliable delivery.",
    certificate: "tanvir-5yr.pdf",
  },
  {
    id: "awd_04",
    employeeId: "emp_04",
    employeeName: "Nusrat Jahan",
    department: "Technology",
    designation: "Senior Software Engineer",
    awardType: "Outstanding Performance",
    date: "2026-01-20",
    gift: "Certificate",
    description: "Delivered critical ERP modules ahead of release schedule.",
    certificate: "nusrat-outstanding.pdf",
  },
  {
    id: "awd_05",
    employeeId: "emp_06",
    employeeName: "Imran Hossain",
    department: "Customer Support",
    designation: "Support Agent",
    awardType: "Customer Hero",
    date: "2025-11-28",
    gift: "Team lunch voucher",
    description: "Highest CSAT score in Q4 with exemplary ticket handling.",
    certificate: "",
  },
];
