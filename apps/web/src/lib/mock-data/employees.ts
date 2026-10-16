export type EmployeeStatus = "active" | "on_leave" | "probation" | "terminated" | "inactive";
export type EmploymentType = "full_time" | "part_time" | "temporary" | "contract";
export type EmployeeGender = "male" | "female" | "other";
export type EmployeeMaritalStatus = "single" | "married" | "divorced" | "widowed";
export type EmployeeAccountRole = "employee" | "hr" | "admin";
export type EmployeeAccountStatus = "active" | "inactive";

export type EmployeeAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

export type EmployeeEmergencyContact = {
  name: string;
  relationship: string;
  phone: string;
};

export type EmployeeBank = {
  name: string;
  holder: string;
  accountNo: string;
  bic: string;
  branch: string;
  taxPayerId?: string;
};

export type EmployeeDocument = {
  /** Present when loaded from / persisted via API. */
  id?: string;
  documentTypeId?: string;
  /** Display name of document type. */
  type: string;
  /** Display label (original file name). */
  fileName: string;
  /** Media library / storage URL — maps to API `file_path`. */
  filePath?: string;
};

export type EmployeeAccount = {
  createLogin: boolean;
  role: EmployeeAccountRole;
  language: string;
  accountStatus: EmployeeAccountStatus;
  /** Mock only — never persisted as real secret in prototype. */
  passwordSet?: boolean;
};

/** Employee list + Workdo-style profile fields (mock / prototype). */
export type Employee = {
  id: string;
  /** Auto / internal employee ID (shown as EMP-####). */
  employeeCode: string;
  /** Biometric device mapping code (Workdo “Employee Code”). */
  biometricCode?: string;
  name: string;
  email: string;
  phone: string;
  /** Display labels kept for grid filters */
  department: string;
  designation: string;
  status: EmployeeStatus;
  joinDate: string;
  /** Display name of reporting manager (resolved from reportingToId). */
  manager: string;
  /** Manager employee id (API `reporting_to`). */
  reportingToId?: string;
  workLocation: string;
  employmentType: EmploymentType;
  // Workdo-style extended profile
  gender?: EmployeeGender;
  dateOfBirth?: string;
  maritalStatus?: EmployeeMaritalStatus;
  nationality?: string;
  bloodGroup?: string;
  branchId?: string;
  departmentId?: string;
  designationId?: string;
  shift?: string;
  probationEndDate?: string;
  confirmationDate?: string;
  lastWorkingDay?: string;
  address?: EmployeeAddress;
  emergencyContact?: EmployeeEmergencyContact;
  bank?: EmployeeBank;
  account?: EmployeeAccount;
  basicSalary?: number;
  hoursPerDay?: number;
  daysPerWeek?: number;
  ratePerHour?: number;
  documents?: EmployeeDocument[];
  /** Profile photo URL (mock / media library). */
  avatarUrl?: string;
};

/** Workdo-style avatar URLs from their demo media library (stable, no redirect). */
export function employeeAvatarUrl(employeeIdOrName: string, _gender?: EmployeeGender): string {
  let hash = 0;
  const s = employeeIdOrName.toLowerCase();
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  const n = (hash % 50) + 1;
  return `https://demo.workdo.io/hrm/storage/media/avatars/avatar-${n}.png`;
}

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Active",
  on_leave: "On leave",
  probation: "Probation",
  terminated: "Terminated",
  inactive: "Inactive",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: "Full time",
  part_time: "Part time",
  temporary: "Temporary",
  contract: "Contract",
};

export const EMPLOYEE_GENDER_LABELS: Record<EmployeeGender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

export const EMPLOYEE_MARITAL_LABELS: Record<EmployeeMaritalStatus, string> = {
  single: "Single",
  married: "Married",
  divorced: "Divorced",
  widowed: "Widowed",
};

export const EMPLOYEE_ACCOUNT_ROLE_LABELS: Record<EmployeeAccountRole, string> = {
  employee: "Employee",
  hr: "HR",
  admin: "Admin",
};

export const EMPLOYEE_BLOOD_GROUPS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;

export const EMPLOYEE_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "bn", label: "Bengali" },
  { value: "ar", label: "Arabic" },
] as const;

export const EMPLOYEE_DOCUMENT_TYPES = [
  "NID",
  "Passport",
  "Birth Certificate",
  "Educational Certificate",
  "Previous Employment",
  "Contract",
  "Other",
] as const;

export const EMPLOYEE_DEPARTMENTS = [
  "Operations",
  "Sales",
  "Finance",
  "Human Resources",
  "Technology",
  "Warehouse & Fulfillment",
  "Customer Support",
  "Marketing",
] as const;

function profileExtras(partial: {
  gender: EmployeeGender;
  dateOfBirth: string;
  branchId: string;
  departmentId: string;
  designationId: string;
  shift?: string;
  basicSalary: number;
  maritalStatus?: EmployeeMaritalStatus;
}): Pick<
  Employee,
  | "gender"
  | "dateOfBirth"
  | "maritalStatus"
  | "nationality"
  | "bloodGroup"
  | "biometricCode"
  | "branchId"
  | "departmentId"
  | "designationId"
  | "shift"
  | "probationEndDate"
  | "confirmationDate"
  | "address"
  | "emergencyContact"
  | "bank"
  | "account"
  | "basicSalary"
  | "hoursPerDay"
  | "daysPerWeek"
  | "ratePerHour"
  | "documents"
  | "avatarUrl"
> {
  return {
    gender: partial.gender,
    dateOfBirth: partial.dateOfBirth,
    maritalStatus: partial.maritalStatus ?? "single",
    nationality: "Bangladeshi",
    bloodGroup: partial.gender === "female" ? "B+" : "O+",
    biometricCode: undefined,
    branchId: partial.branchId,
    departmentId: partial.departmentId,
    designationId: partial.designationId,
    shift: partial.shift ?? "General",
    probationEndDate: undefined,
    confirmationDate: undefined,
    address: {
      line1: "House 12, Road 4",
      city: "Dhaka",
      state: "Dhaka",
      country: "Bangladesh",
      postalCode: "1205",
    },
    emergencyContact: {
      name: "Family Contact",
      relationship: "Spouse",
      phone: "+8801711990000",
    },
    bank: {
      name: "Dutch-Bangla Bank",
      holder: "Account Holder",
      accountNo: "1234567890123",
      bic: "DBBLBDDH",
      branch: "Gulshan",
      taxPayerId: "TIN-000000",
    },
    account: {
      createLogin: true,
      role: "employee",
      language: "en",
      accountStatus: "active",
      passwordSet: true,
    },
    basicSalary: partial.basicSalary,
    hoursPerDay: 8,
    daysPerWeek: 5,
    ratePerHour: Math.round(partial.basicSalary / 176),
    documents: [{ type: "NID", fileName: "nid-copy.pdf" }],
    avatarUrl: undefined,
  };
}

/** Seed list for HRM employees grid (local prototype data). */
export const EMPLOYEES_SEED: Employee[] = [
  {
    id: "emp_001",
    employeeCode: "EMP-1001",
    name: "Karim Ahmed",
    email: "karim.ahmed@againerp.local",
    phone: "+8801711001001",
    department: "Operations",
    designation: "Operations Manager",
    status: "active",
    joinDate: "2022-03-15",
    manager: "Admin",
    workLocation: "Dhaka HQ",
    employmentType: "full_time",
    ...profileExtras({
      gender: "male",
      dateOfBirth: "1988-04-12",
      branchId: "br_dhaka",
      departmentId: "dept_ops",
      designationId: "des_ops_mgr",
      basicSalary: 85000,
    }),
  },
  {
    id: "emp_002",
    employeeCode: "EMP-1002",
    name: "Sadia Rahman",
    email: "sadia.rahman@againerp.local",
    phone: "+8801711001002",
    department: "Sales",
    designation: "Sales Executive",
    status: "active",
    joinDate: "2023-01-10",
    manager: "Karim Ahmed",
    workLocation: "Dhaka HQ",
    employmentType: "full_time",
    ...profileExtras({
      gender: "female",
      dateOfBirth: "1994-08-22",
      branchId: "br_dhaka",
      departmentId: "dept_sales",
      designationId: "des_sales_exec",
      basicSalary: 45000,
    }),
  },
  {
    id: "emp_003",
    employeeCode: "EMP-1003",
    name: "Nusrat Jahan",
    email: "nusrat.jahan@againerp.local",
    phone: "+8801711001003",
    department: "Human Resources",
    designation: "HR Officer",
    status: "active",
    joinDate: "2021-08-01",
    manager: "Admin",
    workLocation: "Dhaka HQ",
    employmentType: "full_time",
    ...profileExtras({
      gender: "female",
      dateOfBirth: "1991-02-03",
      branchId: "br_dhaka",
      departmentId: "dept_hr",
      designationId: "des_hr_off",
      basicSalary: 52000,
    }),
  },
  {
    id: "emp_004",
    employeeCode: "EMP-1004",
    name: "Rafiq Ahmed",
    email: "rafiq.ahmed@againerp.local",
    phone: "+8801711001004",
    department: "Warehouse & Fulfillment",
    designation: "Warehouse Supervisor",
    status: "active",
    joinDate: "2020-11-20",
    manager: "Karim Ahmed",
    workLocation: "Gazipur DC",
    employmentType: "full_time",
    ...profileExtras({
      gender: "male",
      dateOfBirth: "1985-11-30",
      branchId: "br_gazipur",
      departmentId: "dept_wh",
      designationId: "des_wh_sup",
      shift: "Morning",
      basicSalary: 48000,
    }),
  },
  {
    id: "emp_005",
    employeeCode: "EMP-1005",
    name: "Sumaiya Akter",
    email: "sumaiya.akter@againerp.local",
    phone: "+8801711001005",
    department: "Finance",
    designation: "Accountant",
    status: "on_leave",
    joinDate: "2022-06-12",
    manager: "Admin",
    workLocation: "Dhaka HQ",
    employmentType: "full_time",
    ...profileExtras({
      gender: "female",
      dateOfBirth: "1993-06-18",
      branchId: "br_dhaka",
      departmentId: "dept_finance",
      designationId: "des_acct",
      basicSalary: 50000,
    }),
  },
  {
    id: "emp_006",
    employeeCode: "EMP-1006",
    name: "Tanvir Hasan",
    email: "tanvir.hasan@againerp.local",
    phone: "+8801711001006",
    department: "Technology",
    designation: "Software Engineer",
    status: "probation",
    joinDate: "2026-05-01",
    manager: "Admin",
    workLocation: "Remote",
    employmentType: "full_time",
    ...profileExtras({
      gender: "male",
      dateOfBirth: "1997-01-09",
      branchId: "br_dhaka",
      departmentId: "dept_tech",
      designationId: "des_eng",
      basicSalary: 70000,
    }),
  },
  {
    id: "emp_007",
    employeeCode: "EMP-1007",
    name: "Farzana Islam",
    email: "farzana.islam@againerp.local",
    phone: "+8801711001007",
    department: "Sales",
    designation: "Key Account Manager",
    status: "active",
    joinDate: "2019-04-18",
    manager: "Karim Ahmed",
    workLocation: "Chittagong",
    employmentType: "full_time",
    ...profileExtras({
      gender: "female",
      dateOfBirth: "1990-09-25",
      branchId: "br_ctg",
      departmentId: "dept_sales_ctg",
      designationId: "des_sales_ctg",
      basicSalary: 62000,
    }),
  },
  {
    id: "emp_008",
    employeeCode: "EMP-1008",
    name: "Imran Hossain",
    email: "imran.hossain@againerp.local",
    phone: "+8801711001008",
    department: "Warehouse & Fulfillment",
    designation: "Picker",
    status: "active",
    joinDate: "2024-02-01",
    manager: "Rafiq Ahmed",
    workLocation: "Gazipur DC",
    employmentType: "contract",
    ...profileExtras({
      gender: "male",
      dateOfBirth: "1999-03-14",
      branchId: "br_gazipur",
      departmentId: "dept_wh",
      designationId: "des_picker",
      shift: "Evening",
      basicSalary: 28000,
    }),
  },
  {
    id: "emp_009",
    employeeCode: "EMP-1009",
    name: "Mehnaz Chowdhury",
    email: "mehnaz.chowdhury@againerp.local",
    phone: "+8801711001009",
    department: "Human Resources",
    designation: "Recruitment Specialist",
    status: "active",
    joinDate: "2023-09-05",
    manager: "Nusrat Jahan",
    workLocation: "Dhaka HQ",
    employmentType: "full_time",
    ...profileExtras({
      gender: "female",
      dateOfBirth: "1995-12-01",
      branchId: "br_dhaka",
      departmentId: "dept_hr",
      designationId: "des_recruit",
      basicSalary: 42000,
    }),
  },
  {
    id: "emp_010",
    employeeCode: "EMP-1010",
    name: "Ashik Rahman",
    email: "ashik.rahman@againerp.local",
    phone: "+8801711001010",
    department: "Technology",
    designation: "QA Analyst",
    status: "active",
    joinDate: "2024-07-22",
    manager: "Tanvir Hasan",
    workLocation: "Dhaka HQ",
    employmentType: "full_time",
    ...profileExtras({
      gender: "male",
      dateOfBirth: "1996-07-07",
      branchId: "br_dhaka",
      departmentId: "dept_tech",
      designationId: "des_qa",
      basicSalary: 48000,
    }),
  },
  {
    id: "emp_011",
    employeeCode: "EMP-1011",
    name: "Lamia Sultana",
    email: "lamia.sultana@againerp.local",
    phone: "+8801711001011",
    department: "Finance",
    designation: "Payroll Officer",
    status: "active",
    joinDate: "2021-12-01",
    manager: "Sumaiya Akter",
    workLocation: "Dhaka HQ",
    employmentType: "full_time",
    ...profileExtras({
      gender: "female",
      dateOfBirth: "1992-05-20",
      branchId: "br_dhaka",
      departmentId: "dept_finance",
      designationId: "des_payroll",
      basicSalary: 46000,
    }),
  },
  {
    id: "emp_012",
    employeeCode: "EMP-1012",
    name: "Jahidul Islam",
    email: "jahidul.islam@againerp.local",
    phone: "+8801711001012",
    department: "Operations",
    designation: "Operations Coordinator",
    status: "terminated",
    joinDate: "2018-01-15",
    manager: "Karim Ahmed",
    workLocation: "Dhaka HQ",
    employmentType: "full_time",
    ...profileExtras({
      gender: "male",
      dateOfBirth: "1987-10-11",
      branchId: "br_dhaka",
      departmentId: "dept_ops",
      designationId: "des_coord",
      basicSalary: 40000,
    }),
  },
  {
    id: "emp_013",
    employeeCode: "EMP-1013",
    name: "Priya Das",
    email: "priya.das@againerp.local",
    phone: "+8801711001013",
    department: "Sales",
    designation: "Inside Sales Representative",
    status: "probation",
    joinDate: "2026-06-01",
    manager: "Sadia Rahman",
    workLocation: "Dhaka HQ",
    employmentType: "part_time",
    ...profileExtras({
      gender: "female",
      dateOfBirth: "2000-02-28",
      branchId: "br_dhaka",
      departmentId: "dept_sales",
      designationId: "des_inside",
      basicSalary: 22000,
    }),
  },
  {
    id: "emp_014",
    employeeCode: "EMP-1014",
    name: "Mahbub Alam",
    email: "mahbub.alam@againerp.local",
    phone: "+8801711001014",
    department: "Warehouse & Fulfillment",
    designation: "Packer",
    status: "active",
    joinDate: "2025-03-10",
    manager: "Rafiq Ahmed",
    workLocation: "Gazipur DC",
    employmentType: "contract",
    ...profileExtras({
      gender: "male",
      dateOfBirth: "1998-08-08",
      branchId: "br_gazipur",
      departmentId: "dept_wh",
      designationId: "des_packer",
      shift: "Morning",
      basicSalary: 26000,
    }),
  },
  {
    id: "emp_015",
    employeeCode: "EMP-1015",
    name: "Ruma Begum",
    email: "ruma.begum@againerp.local",
    phone: "+8801711001015",
    department: "Operations",
    designation: "Admin Assistant",
    status: "on_leave",
    joinDate: "2023-05-20",
    manager: "Karim Ahmed",
    workLocation: "Dhaka HQ",
    employmentType: "full_time",
    ...profileExtras({
      gender: "female",
      dateOfBirth: "1994-11-16",
      branchId: "br_dhaka",
      departmentId: "dept_ops",
      designationId: "des_admin",
      basicSalary: 32000,
    }),
  },
];

export function nextEmployeeCode(existing: Employee[]): string {
  const nums = existing.map((e) => {
    const m = e.employeeCode.match(/(\d+)$/);
    return m ? Number(m[1]) : 1000;
  });
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return `EMP-${next}`;
}

export function nextBiometricCode(existing: Employee[]): string {
  const nums = existing.map((e) => {
    const m = (e.biometricCode ?? "").match(/(\d+)$/);
    return m ? Number(m[1]) : 0;
  });
  const next = (nums.length ? Math.max(...nums) : 5000) + 1;
  return `BIO-${next}`;
}

for (const e of EMPLOYEES_SEED) {
  if (!e.biometricCode) e.biometricCode = `BIO-${e.employeeCode.replace(/\D/g, "")}`;
  if (!e.avatarUrl) e.avatarUrl = employeeAvatarUrl(e.id, e.gender);
}
