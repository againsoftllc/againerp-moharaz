import { apiFetch } from "@/lib/api/client";
import { listHrmBranches } from "@/lib/api/hrm-branches";
import { listHrmDepartments } from "@/lib/api/hrm-departments";
import { listHrmEmployees } from "@/lib/api/hrm-employees";
import type {
  TrainingAssignStatus,
  EmployeeTraining,
  TrainingResult,
} from "@/lib/mock-data/hrm-employee-trainings";
import type {
  AssessmentType,
  TrainingAssessment,
} from "@/lib/mock-data/hrm-training-assessments";
import type {
  EnrollmentFlag,
  ProgramStatus,
  TrainingProgram,
} from "@/lib/mock-data/hrm-training-programs";
import type {
  SessionMode,
  SessionStatus,
  TrainingSession,
} from "@/lib/mock-data/hrm-training-sessions";
import type {
  TrainingType,
  TrainingTypeDepartment,
} from "@/lib/mock-data/hrm-training-types";
import { deptKey, parseDeptKey } from "@/lib/mock-data/hrm-training-types";

type ApiListResponse<T> = {
  data: T[];
  meta?: { count?: number };
  errors?: string[];
};

type ApiItemResponse<T> = {
  data: T;
  errors?: string[];
};

type ApiTrainingType = {
  id: string;
  name: string;
  description: string | null;
  branch_id: string | null;
  created_at: string;
};

type ApiTrainingProgram = {
  id: string;
  name: string;
  training_type_id: string | null;
  description: string | null;
  duration: number | null;
  cost: string | number | null;
  capacity: number | null;
  status: string;
  is_mandatory: boolean;
  is_self_enrollment: boolean;
};

type ApiTrainingSession = {
  id: string;
  training_program_id: string | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  location_type: string;
  status: string;
};

type ApiTrainingAssessment = {
  id: string;
  training_program_id: string | null;
  name: string;
  type: string | null;
  passing_score: string | number;
};

type ApiEmployeeTraining = {
  id: string;
  employee_id: string | null;
  training_program_id: string | null;
  status: string;
  assigned_date: string | null;
  completion_date: string | null;
  certification: string | null;
  score: string | number | null;
  is_passed: boolean | null;
};

type ApiSessionAttendance = {
  id: string;
  training_session_id: string | null;
  employee_id: string | null;
  is_present: boolean;
};

type ApiAssessmentResult = {
  id: string;
  employee_training_id: string | null;
  training_assessment_id: string | null;
};

export type TrainingEmployeeOption = {
  id: string;
  name: string;
  code: string;
  email: string;
};

export type TrainingProgramOption = {
  id: string;
  name: string;
  category: string;
};

export type TrainingTypeOption = {
  id: string;
  name: string;
};

export type TrainingDepartmentOption = TrainingTypeDepartment & {
  departmentId: string;
  branchId: string;
};

export type TrainingTypeWritePayload = Omit<TrainingType, "id" | "programs"> & {
  branchId: string;
};

export type TrainingProgramWritePayload = Omit<
  TrainingProgram,
  "id" | "category" | "sessions" | "employeesEnrolled"
> & {
  trainingTypeId: string;
};

export type TrainingSessionWritePayload = Omit<
  TrainingSession,
  "id" | "programName" | "trainers" | "attendance"
> & {
  programId: string;
};

export type TrainingAssessmentWritePayload = Omit<
  TrainingAssessment,
  "id" | "programName" | "results"
> & {
  programId: string;
};

export type EmployeeTrainingWritePayload = Omit<
  EmployeeTraining,
  | "id"
  | "employeeName"
  | "employeeCode"
  | "programName"
  | "programCategory"
  | "assessments"
  | "hasCertificate"
> & {
  programId: string;
};

function ymd(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function ymdHm(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 16).replace("T", " ");
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

function toApiDateTime(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes("T")) return trimmed;
  const normalized = trimmed.replace(" ", "T");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)) return `${normalized}:00`;
  return normalized;
}

function asNumber(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function mapProgramStatusFromApi(status: string): ProgramStatus {
  if (status === "active") return "active";
  if (status === "completed" || status === "cancelled") return "completed";
  return "draft";
}

function mapEnrollmentFromApi(row: ApiTrainingProgram): EnrollmentFlag {
  if (row.is_mandatory) return "mandatory";
  return "self_enrollment";
}

function mapEnrollmentToApi(flag: EnrollmentFlag): {
  is_mandatory: boolean;
  is_self_enrollment: boolean;
} {
  if (flag === "mandatory") return { is_mandatory: true, is_self_enrollment: false };
  return { is_mandatory: false, is_self_enrollment: true };
}

function mapSessionStatusFromApi(status: string): SessionStatus {
  if (status === "in_progress") return "in_progress";
  if (status === "completed" || status === "cancelled") return "completed";
  return "scheduled";
}

function mapSessionStatusToApi(status: SessionStatus): "scheduled" | "in_progress" | "completed" {
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  return "scheduled";
}

function mapSessionMode(value: string | null | undefined): SessionMode {
  return value === "virtual" ? "virtual" : "physical";
}

function mapAssessmentType(value: string | null | undefined): AssessmentType {
  const allowed: AssessmentType[] = ["quiz", "practical", "presentation"];
  if (value && (allowed as string[]).includes(value)) return value as AssessmentType;
  return "quiz";
}

function mapEmployeeTrainingStatusFromApi(status: string): TrainingAssignStatus {
  if (status === "in_progress") return "in_progress";
  if (status === "completed" || status === "failed") return "completed";
  return "assigned";
}

function mapEmployeeTrainingResult(row: ApiEmployeeTraining): TrainingResult {
  if (row.is_passed === true) return "passed";
  if (row.is_passed === false || row.status === "failed") return "failed";
  return null;
}

async function listApiTrainingTypes(): Promise<ApiTrainingType[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiTrainingType>>(
    `/api/v1/hrm/training-types?${qs}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiTrainingPrograms(): Promise<ApiTrainingProgram[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiTrainingProgram>>(
    `/api/v1/hrm/training-programs?${qs}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiTrainingSessions(): Promise<ApiTrainingSession[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiTrainingSession>>(
    `/api/v1/hrm/training-sessions?${qs}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiTrainingAssessments(): Promise<ApiTrainingAssessment[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiTrainingAssessment>>(
    `/api/v1/hrm/training-assessments?${qs}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiEmployeeTrainings(): Promise<ApiEmployeeTraining[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiEmployeeTraining>>(
    `/api/v1/hrm/employee-trainings?${qs}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiSessionAttendance(): Promise<ApiSessionAttendance[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiSessionAttendance>>(
    `/api/v1/hrm/training-session-attendance?${qs}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiAssessmentResults(): Promise<ApiAssessmentResult[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiAssessmentResult>>(
    `/api/v1/hrm/employee-assessment-results?${qs}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function listTrainingDepartmentOptions(): Promise<TrainingDepartmentOption[]> {
  const [branches, departments] = await Promise.all([listHrmBranches(), listHrmDepartments()]);
  const branchById = new Map(branches.map((row) => [row.id, String(row.name ?? "")]));
  return departments
    .map((row) => {
      const branchId = String(row.branch_id ?? "");
      if (!branchId) return null;
      return {
        departmentId: row.id,
        branchId,
        name: String(row.name ?? ""),
        branch: branchById.get(branchId) ?? "",
      };
    })
    .filter((row): row is TrainingDepartmentOption => Boolean(row?.name && row.branch));
}

export async function listTrainingEmployeeOptions(): Promise<TrainingEmployeeOption[]> {
  const { rows } = await listHrmEmployees({ per_page: 200 });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.employee_code ?? row.id,
    email: row.email ?? "",
  }));
}

export async function listTrainingProgramOptions(): Promise<TrainingProgramOption[]> {
  const [programs, types] = await Promise.all([
    listApiTrainingPrograms(),
    listApiTrainingTypes(),
  ]);
  const typeById = new Map(types.map((row) => [row.id, row.name]));
  return programs.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.training_type_id ? typeById.get(row.training_type_id) ?? "" : "",
  }));
}

export async function listTrainingTypeOptions(): Promise<TrainingTypeOption[]> {
  const rows = await listApiTrainingTypes();
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

function departmentsForBranch(
  branchId: string | null | undefined,
  deptOptions: TrainingDepartmentOption[],
): TrainingTypeDepartment[] {
  if (!branchId) return [];
  return deptOptions
    .filter((row) => row.branchId === branchId)
    .map((row) => ({ name: row.name, branch: row.branch }));
}

function branchIdFromDepartmentKeys(
  keys: string[],
  deptOptions: TrainingDepartmentOption[],
): string {
  if (keys.length === 0) return "";
  const parsed = parseDeptKey(keys[0]!);
  const hit = deptOptions.find((row) => row.name === parsed.name && row.branch === parsed.branch);
  return hit?.branchId ?? "";
}

// --- training types ---

export async function listTrainingTypesView(): Promise<(TrainingType & { branchId?: string })[]> {
  const [types, programs, deptOptions] = await Promise.all([
    listApiTrainingTypes(),
    listApiTrainingPrograms(),
    listTrainingDepartmentOptions(),
  ]);
  const programsByType = new Map<string, number>();
  for (const program of programs) {
    if (!program.training_type_id) continue;
    programsByType.set(
      program.training_type_id,
      (programsByType.get(program.training_type_id) ?? 0) + 1,
    );
  }
  return types.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    departments: departmentsForBranch(row.branch_id, deptOptions),
    programs: programsByType.get(row.id) ?? 0,
    branchId: row.branch_id ?? "",
  }));
}

export async function createTrainingTypeView(
  payload: TrainingTypeWritePayload,
): Promise<TrainingType> {
  const created = await apiFetch<ApiItemResponse<ApiTrainingType>>("/api/v1/hrm/training-types", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      name: payload.name,
      description: payload.description || undefined,
      branch_id: payload.branchId || undefined,
    }),
  });
  const rows = await listTrainingTypesView();
  const row = rows.find((r) => r.id === created.data.id);
  if (!row) throw new Error("Created training type could not be reloaded");
  return row;
}

export async function updateTrainingTypeView(
  id: string,
  payload: TrainingTypeWritePayload,
): Promise<TrainingType> {
  await apiFetch<ApiItemResponse<ApiTrainingType>>(
    `/api/v1/hrm/training-types/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: payload.name,
        description: payload.description || undefined,
        branch_id: payload.branchId || undefined,
      }),
    },
  );
  const rows = await listTrainingTypesView();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Updated training type could not be reloaded");
  return row;
}

export async function deleteTrainingTypeView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/training-types/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

export { deptKey, parseDeptKey, branchIdFromDepartmentKeys };

// --- training programs ---

export async function listTrainingProgramsView(): Promise<
  (TrainingProgram & { trainingTypeId?: string })[]
> {
  const [programs, types, sessions, employeeTrainings] = await Promise.all([
    listApiTrainingPrograms(),
    listApiTrainingTypes(),
    listApiTrainingSessions(),
    listApiEmployeeTrainings(),
  ]);
  const typeById = new Map(types.map((row) => [row.id, row.name]));
  const sessionsByProgram = new Map<string, number>();
  for (const session of sessions) {
    if (!session.training_program_id) continue;
    sessionsByProgram.set(
      session.training_program_id,
      (sessionsByProgram.get(session.training_program_id) ?? 0) + 1,
    );
  }
  const enrollmentsByProgram = new Map<string, number>();
  for (const row of employeeTrainings) {
    if (!row.training_program_id) continue;
    enrollmentsByProgram.set(
      row.training_program_id,
      (enrollmentsByProgram.get(row.training_program_id) ?? 0) + 1,
    );
  }
  return programs.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.training_type_id ? typeById.get(row.training_type_id) ?? "" : "",
    trainingTypeId: row.training_type_id ?? "",
    status: mapProgramStatusFromApi(row.status),
    durationHours: row.duration ?? 0,
    cost: asNumber(row.cost),
    capacity: row.capacity ?? 0,
    enrollmentType: mapEnrollmentFromApi(row),
    sessions: sessionsByProgram.get(row.id) ?? 0,
    employeesEnrolled: enrollmentsByProgram.get(row.id) ?? 0,
  }));
}

async function applyProgramStatus(id: string, status: ProgramStatus): Promise<void> {
  if (status === "active") {
    await apiFetch<ApiItemResponse<ApiTrainingProgram>>(
      `/api/v1/hrm/training-programs/${encodeURIComponent(id)}/activate?company_id=default`,
      { method: "POST" },
    );
    return;
  }
  if (status === "completed") {
    try {
      await apiFetch<ApiItemResponse<ApiTrainingProgram>>(
        `/api/v1/hrm/training-programs/${encodeURIComponent(id)}/activate?company_id=default`,
        { method: "POST" },
      );
    } catch {
      // already active
    }
    await apiFetch<ApiItemResponse<ApiTrainingProgram>>(
      `/api/v1/hrm/training-programs/${encodeURIComponent(id)}/complete?company_id=default`,
      { method: "POST" },
    );
  }
}

export async function createTrainingProgramView(
  payload: TrainingProgramWritePayload,
): Promise<TrainingProgram> {
  const enrollment = mapEnrollmentToApi(payload.enrollmentType);
  const created = await apiFetch<ApiItemResponse<ApiTrainingProgram>>(
    "/api/v1/hrm/training-programs",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        name: payload.name,
        training_type_id: payload.trainingTypeId || undefined,
        duration: payload.durationHours || undefined,
        cost: payload.cost || undefined,
        capacity: payload.capacity || undefined,
        is_mandatory: enrollment.is_mandatory,
        is_self_enrollment: enrollment.is_self_enrollment,
      }),
    },
  );

  if (payload.status !== "draft") {
    await applyProgramStatus(created.data.id, payload.status);
  }

  const rows = await listTrainingProgramsView();
  const row = rows.find((r) => r.id === created.data.id);
  if (!row) throw new Error("Created training program could not be reloaded");
  return row;
}

export async function updateTrainingProgramView(
  id: string,
  payload: TrainingProgramWritePayload,
): Promise<TrainingProgram> {
  const enrollment = mapEnrollmentToApi(payload.enrollmentType);
  await apiFetch<ApiItemResponse<ApiTrainingProgram>>(
    `/api/v1/hrm/training-programs/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: payload.name,
        training_type_id: payload.trainingTypeId || undefined,
        duration: payload.durationHours || undefined,
        cost: payload.cost || undefined,
        capacity: payload.capacity || undefined,
        is_mandatory: enrollment.is_mandatory,
        is_self_enrollment: enrollment.is_self_enrollment,
      }),
    },
  );

  try {
    await applyProgramStatus(id, payload.status);
  } catch {
    // status transition may be invalid for current state
  }

  const rows = await listTrainingProgramsView();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Updated training program could not be reloaded");
  return row;
}

export async function deleteTrainingProgramView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/training-programs/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

// --- training sessions ---

export async function listTrainingSessionsView(): Promise<
  (TrainingSession & { programId?: string })[]
> {
  const [sessions, programs, attendance] = await Promise.all([
    listApiTrainingSessions(),
    listApiTrainingPrograms(),
    listApiSessionAttendance(),
  ]);
  const programById = new Map(programs.map((row) => [row.id, row.name]));
  const attendanceBySession = new Map<string, number>();
  for (const row of attendance) {
    if (!row.training_session_id || !row.is_present) continue;
    attendanceBySession.set(
      row.training_session_id,
      (attendanceBySession.get(row.training_session_id) ?? 0) + 1,
    );
  }
  return sessions.map((row) => ({
    id: row.id,
    sessionName: row.name,
    programName: row.training_program_id ? programById.get(row.training_program_id) ?? "" : "",
    programId: row.training_program_id ?? "",
    startAt: ymdHm(row.start_date),
    endAt: ymdHm(row.end_date),
    location: row.location ?? "",
    mode: mapSessionMode(row.location_type),
    status: mapSessionStatusFromApi(row.status),
    trainers: [],
    attendance: attendanceBySession.get(row.id) ?? 0,
  }));
}

async function applySessionStatus(id: string, status: SessionStatus): Promise<void> {
  const apiStatus = mapSessionStatusToApi(status);
  if (apiStatus === "in_progress") {
    await apiFetch<ApiItemResponse<ApiTrainingSession>>(
      `/api/v1/hrm/training-sessions/${encodeURIComponent(id)}/start?company_id=default`,
      { method: "POST" },
    );
    return;
  }
  if (apiStatus === "completed") {
    try {
      await apiFetch<ApiItemResponse<ApiTrainingSession>>(
        `/api/v1/hrm/training-sessions/${encodeURIComponent(id)}/start?company_id=default`,
        { method: "POST" },
      );
    } catch {
      // already started
    }
    await apiFetch<ApiItemResponse<ApiTrainingSession>>(
      `/api/v1/hrm/training-sessions/${encodeURIComponent(id)}/complete?company_id=default`,
      { method: "POST" },
    );
  }
}

export async function createTrainingSessionView(
  payload: TrainingSessionWritePayload,
): Promise<TrainingSession> {
  const created = await apiFetch<ApiItemResponse<ApiTrainingSession>>(
    "/api/v1/hrm/training-sessions",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        training_program_id: payload.programId,
        name: payload.sessionName,
        start_date: toApiDateTime(payload.startAt),
        end_date: toApiDateTime(payload.endAt),
        location: payload.location || undefined,
        location_type: payload.mode,
      }),
    },
  );

  if (payload.status !== "scheduled") {
    await applySessionStatus(created.data.id, payload.status);
  }

  const rows = await listTrainingSessionsView();
  const row = rows.find((r) => r.id === created.data.id);
  if (!row) throw new Error("Created training session could not be reloaded");
  return row;
}

export async function updateTrainingSessionView(
  id: string,
  payload: TrainingSessionWritePayload,
): Promise<TrainingSession> {
  await apiFetch<ApiItemResponse<ApiTrainingSession>>(
    `/api/v1/hrm/training-sessions/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: payload.sessionName,
        start_date: toApiDateTime(payload.startAt),
        end_date: toApiDateTime(payload.endAt),
        location: payload.location || undefined,
        location_type: payload.mode,
      }),
    },
  );

  try {
    await applySessionStatus(id, payload.status);
  } catch {
    // status may already be applied
  }

  const rows = await listTrainingSessionsView();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Updated training session could not be reloaded");
  return row;
}

export async function deleteTrainingSessionView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/training-sessions/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

// --- training assessments ---

export async function listTrainingAssessmentsView(): Promise<
  (TrainingAssessment & { programId?: string })[]
> {
  const [assessments, programs, results] = await Promise.all([
    listApiTrainingAssessments(),
    listApiTrainingPrograms(),
    listApiAssessmentResults(),
  ]);
  const programById = new Map(programs.map((row) => [row.id, row.name]));
  const resultsByAssessment = new Map<string, number>();
  for (const row of results) {
    if (!row.training_assessment_id) continue;
    resultsByAssessment.set(
      row.training_assessment_id,
      (resultsByAssessment.get(row.training_assessment_id) ?? 0) + 1,
    );
  }
  return assessments.map((row) => ({
    id: row.id,
    name: row.name,
    programName: row.training_program_id ? programById.get(row.training_program_id) ?? "" : "",
    programId: row.training_program_id ?? "",
    assessmentType: mapAssessmentType(row.type),
    passingScore: asNumber(row.passing_score),
    results: resultsByAssessment.get(row.id) ?? 0,
  }));
}

export async function createTrainingAssessmentView(
  payload: TrainingAssessmentWritePayload,
): Promise<TrainingAssessment> {
  const created = await apiFetch<ApiItemResponse<ApiTrainingAssessment>>(
    "/api/v1/hrm/training-assessments",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        training_program_id: payload.programId,
        name: payload.name,
        type: payload.assessmentType,
        passing_score: payload.passingScore,
      }),
    },
  );
  const rows = await listTrainingAssessmentsView();
  const row = rows.find((r) => r.id === created.data.id);
  if (!row) throw new Error("Created assessment could not be reloaded");
  return row;
}

export async function updateTrainingAssessmentView(
  id: string,
  payload: TrainingAssessmentWritePayload,
): Promise<TrainingAssessment> {
  await apiFetch<ApiItemResponse<ApiTrainingAssessment>>(
    `/api/v1/hrm/training-assessments/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: payload.name,
        type: payload.assessmentType,
        passing_score: payload.passingScore,
      }),
    },
  );
  const rows = await listTrainingAssessmentsView();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Updated assessment could not be reloaded");
  return row;
}

export async function deleteTrainingAssessmentView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/training-assessments/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}

// --- employee trainings ---

export async function listEmployeeTrainingsView(): Promise<
  (EmployeeTraining & { programId?: string })[]
> {
  const [rows, employees, programs, types, results] = await Promise.all([
    listApiEmployeeTrainings(),
    listTrainingEmployeeOptions(),
    listApiTrainingPrograms(),
    listApiTrainingTypes(),
    listApiAssessmentResults(),
  ]);
  const employeeById = new Map(employees.map((row) => [row.id, row]));
  const typeById = new Map(types.map((row) => [row.id, row.name]));
  const programById = new Map(
    programs.map((row) => [
      row.id,
      {
        name: row.name,
        category: row.training_type_id ? typeById.get(row.training_type_id) ?? "" : "",
      },
    ]),
  );
  const assessmentsByTraining = new Map<string, number>();
  for (const result of results) {
    if (!result.employee_training_id) continue;
    assessmentsByTraining.set(
      result.employee_training_id,
      (assessmentsByTraining.get(result.employee_training_id) ?? 0) + 1,
    );
  }
  return rows.map((row) => {
    const employee = row.employee_id ? employeeById.get(row.employee_id) : undefined;
    const program = row.training_program_id ? programById.get(row.training_program_id) : undefined;
    const result = mapEmployeeTrainingResult(row);
    return {
      id: row.id,
      employeeId: row.employee_id ?? "",
      employeeName: employee?.name ?? "Unknown Employee",
      employeeCode: employee?.code ?? "",
      programName: program?.name ?? "",
      programCategory: program?.category ?? "",
      programId: row.training_program_id ?? "",
      status: mapEmployeeTrainingStatusFromApi(row.status),
      assignedDate: ymd(row.assigned_date),
      completionDate: row.completion_date ? ymd(row.completion_date) : null,
      score: row.score != null ? asNumber(row.score) : null,
      result,
      assessments: assessmentsByTraining.get(row.id) ?? 0,
      hasCertificate: Boolean(row.certification?.trim()),
    };
  });
}

async function applyEmployeeTrainingStatus(
  id: string,
  status: TrainingAssignStatus,
  result: TrainingResult,
): Promise<void> {
  if (status === "in_progress") {
    await apiFetch<ApiItemResponse<ApiEmployeeTraining>>(
      `/api/v1/hrm/employee-trainings/${encodeURIComponent(id)}/start?company_id=default`,
      { method: "POST" },
    );
    return;
  }
  if (status === "completed") {
    if (result === "failed") {
      await apiFetch<ApiItemResponse<ApiEmployeeTraining>>(
        `/api/v1/hrm/employee-trainings/${encodeURIComponent(id)}/fail?company_id=default`,
        { method: "POST" },
      );
      return;
    }
    try {
      await apiFetch<ApiItemResponse<ApiEmployeeTraining>>(
        `/api/v1/hrm/employee-trainings/${encodeURIComponent(id)}/start?company_id=default`,
        { method: "POST" },
      );
    } catch {
      // already in progress
    }
    await apiFetch<ApiItemResponse<ApiEmployeeTraining>>(
      `/api/v1/hrm/employee-trainings/${encodeURIComponent(id)}/complete?company_id=default`,
      { method: "POST" },
    );
  }
}

export async function createEmployeeTrainingView(
  payload: EmployeeTrainingWritePayload,
): Promise<EmployeeTraining> {
  const created = await apiFetch<ApiItemResponse<ApiEmployeeTraining>>(
    "/api/v1/hrm/employee-trainings",
    {
      method: "POST",
      body: JSON.stringify({
        company_id: "default",
        employee_id: payload.employeeId,
        training_program_id: payload.programId,
        assigned_date: payload.assignedDate || undefined,
      }),
    },
  );

  if (payload.score != null || payload.result || payload.completionDate) {
    await apiFetch<ApiItemResponse<ApiEmployeeTraining>>(
      `/api/v1/hrm/employee-trainings/${encodeURIComponent(created.data.id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({
          score: payload.score ?? undefined,
          is_passed: payload.result === "passed" ? true : payload.result === "failed" ? false : undefined,
          completion_date: payload.completionDate || undefined,
          certification:
            payload.status === "completed" && payload.result === "passed" ? "issued" : undefined,
        }),
      },
    );
  }

  if (payload.status !== "assigned") {
    await applyEmployeeTrainingStatus(created.data.id, payload.status, payload.result);
  }

  const rows = await listEmployeeTrainingsView();
  const row = rows.find((r) => r.id === created.data.id);
  if (!row) throw new Error("Created employee training could not be reloaded");
  return row;
}

export async function updateEmployeeTrainingView(
  id: string,
  payload: EmployeeTrainingWritePayload,
): Promise<EmployeeTraining> {
  await apiFetch<ApiItemResponse<ApiEmployeeTraining>>(
    `/api/v1/hrm/employee-trainings/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        score: payload.score ?? undefined,
        is_passed: payload.result === "passed" ? true : payload.result === "failed" ? false : undefined,
        completion_date: payload.completionDate || undefined,
        certification:
          payload.status === "completed" && payload.result === "passed" ? "issued" : undefined,
      }),
    },
  );

  try {
    await applyEmployeeTrainingStatus(id, payload.status, payload.result);
  } catch {
    // status transition may be invalid
  }

  const rows = await listEmployeeTrainingsView();
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("Updated employee training could not be reloaded");
  return row;
}

export async function deleteEmployeeTrainingView(id: string): Promise<void> {
  await apiFetch<void>(
    `/api/v1/hrm/employee-trainings/${encodeURIComponent(id)}?company_id=default`,
    { method: "DELETE" },
  );
}
