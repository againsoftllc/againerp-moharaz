import { apiFetch } from "@/lib/api/client";
import { fetchAuthUsers } from "@/lib/api/auth-users";
import type { MeetingType } from "@/lib/mock-data/hrm-meeting-types";
import type { MeetingRoom } from "@/lib/mock-data/hrm-meeting-rooms";
import type { AttendeeAttendance, AttendeeRsvp, AttendeeRole, AttendanceType, MeetingAttendee } from "@/lib/mock-data/hrm-meeting-attendees";
import type { HrmMeeting, MeetingStatus } from "@/lib/mock-data/hrm-meetings";
import type { MeetingMinute, MinuteType } from "@/lib/mock-data/hrm-meeting-minutes";
import type { ActionPriority, ActionStatus, MeetingActionItem } from "@/lib/mock-data/hrm-action-items";

type ApiListResponse<T> = {
  data: T[];
  meta: { count: number };
  errors: string[];
};

type ApiItemResponse<T> = {
  data: T;
  errors: string[];
};

type ApiMeetingType = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  color: string;
  default_duration: number;
  status: "active" | "inactive";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiMeetingRoom = {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  type: "physical" | "virtual";
  location: string | null;
  capacity: number;
  equipment: string[] | null;
  booking_url: string | null;
  status: "active" | "inactive";
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ApiMeeting = {
  id: string;
  company_id: string;
  title: string | null;
  description: string | null;
  type_id: string | null;
  room_id: string | null;
  meeting_date: string | null;
  start_time: string | null;
  end_time: string | null;
  duration: number;
  agenda: string | null;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  recurrence: "none" | "daily" | "weekly" | "monthly";
  recurrence_end_date: string | null;
  organizer_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

function mapMeetingStatus(status: ApiMeeting["status"]): MeetingStatus {
  return status === "in_progress" ? "scheduled" : status;
}

async function listApiMeetingTypes(): Promise<ApiMeetingType[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiMeetingType>>(
    `/api/v1/hrm/meeting-types?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiMeetingRooms(): Promise<ApiMeetingRoom[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiMeetingRoom>>(
    `/api/v1/hrm/meeting-rooms?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiMeetings(): Promise<ApiMeeting[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiMeeting>>(`/api/v1/hrm/meetings?${qs.toString()}`, {
    cache: "no-store",
  });
  return res.data ?? [];
}

export async function listMeetingTypesView(): Promise<MeetingType[]> {
  const [types, meetings] = await Promise.all([listApiMeetingTypes(), listApiMeetings()]);
  const countByTypeId = new Map<string, number>();
  for (const row of meetings) {
    if (!row.type_id) continue;
    countByTypeId.set(row.type_id, (countByTypeId.get(row.type_id) ?? 0) + 1);
  }
  return types.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    color: row.color,
    defaultDuration: row.default_duration,
    meetingsCount: countByTypeId.get(row.id) ?? 0,
    status: row.status,
    locked: row.status === "inactive",
  }));
}

export async function createMeetingTypeView(
  payload: Omit<MeetingType, "id" | "locked" | "meetingsCount">,
): Promise<MeetingType> {
  const res = await apiFetch<ApiItemResponse<ApiMeetingType>>("/api/v1/hrm/meeting-types", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      name: payload.name.trim(),
      description: payload.description.trim() || undefined,
      color: payload.color || "#000000",
      default_duration: payload.defaultDuration,
      status: payload.status,
    }),
  });
  return {
    id: res.data.id,
    name: res.data.name,
    description: res.data.description ?? "",
    color: res.data.color,
    defaultDuration: res.data.default_duration,
    meetingsCount: 0,
    status: res.data.status,
    locked: res.data.status === "inactive",
  };
}

export async function updateMeetingTypeView(
  id: string,
  payload: Omit<MeetingType, "id" | "locked" | "meetingsCount">,
): Promise<MeetingType> {
  const res = await apiFetch<ApiItemResponse<ApiMeetingType>>(
    `/api/v1/hrm/meeting-types/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: payload.name.trim(),
        description: payload.description.trim() || undefined,
        color: payload.color || "#000000",
        default_duration: payload.defaultDuration,
        status: payload.status,
      }),
    },
  );
  return {
    id: res.data.id,
    name: res.data.name,
    description: res.data.description ?? "",
    color: res.data.color,
    defaultDuration: res.data.default_duration,
    meetingsCount: 0,
    status: res.data.status,
    locked: res.data.status === "inactive",
  };
}

export async function deleteMeetingTypeView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/meeting-types/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

export async function listMeetingRoomsView(): Promise<MeetingRoom[]> {
  const [rooms, meetings] = await Promise.all([listApiMeetingRooms(), listApiMeetings()]);
  const countByRoomId = new Map<string, number>();
  for (const row of meetings) {
    if (!row.room_id) continue;
    countByRoomId.set(row.room_id, (countByRoomId.get(row.room_id) ?? 0) + 1);
  }
  return rooms.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.type,
    location: row.location ?? "",
    joinLink: row.booking_url ?? "",
    capacity: row.capacity,
    equipment: row.equipment ?? [],
    meetingsCount: countByRoomId.get(row.id) ?? 0,
    status: row.status,
    description: row.description ?? "",
  }));
}

export async function createMeetingRoomView(
  payload: Omit<MeetingRoom, "id" | "meetingsCount">,
): Promise<MeetingRoom> {
  const res = await apiFetch<ApiItemResponse<ApiMeetingRoom>>("/api/v1/hrm/meeting-rooms", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      name: payload.name.trim(),
      description: payload.description.trim() || undefined,
      type: payload.kind,
      location: payload.kind === "physical" ? payload.location.trim() || undefined : undefined,
      capacity: payload.capacity,
      equipment: payload.equipment,
      booking_url: payload.kind === "virtual" ? payload.joinLink.trim() || undefined : undefined,
      status: payload.status,
    }),
  });
  return {
    id: res.data.id,
    name: res.data.name,
    kind: res.data.type,
    location: res.data.location ?? "",
    joinLink: res.data.booking_url ?? "",
    capacity: res.data.capacity,
    equipment: res.data.equipment ?? [],
    meetingsCount: 0,
    status: res.data.status,
    description: res.data.description ?? "",
  };
}

export async function updateMeetingRoomView(
  id: string,
  payload: Omit<MeetingRoom, "id" | "meetingsCount">,
): Promise<MeetingRoom> {
  const res = await apiFetch<ApiItemResponse<ApiMeetingRoom>>(
    `/api/v1/hrm/meeting-rooms/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        name: payload.name.trim(),
        description: payload.description.trim() || undefined,
        type: payload.kind,
        location: payload.kind === "physical" ? payload.location.trim() || undefined : "",
        capacity: payload.capacity,
        equipment: payload.equipment,
        booking_url: payload.kind === "virtual" ? payload.joinLink.trim() || undefined : "",
        status: payload.status,
      }),
    },
  );
  return {
    id: res.data.id,
    name: res.data.name,
    kind: res.data.type,
    location: res.data.location ?? "",
    joinLink: res.data.booking_url ?? "",
    capacity: res.data.capacity,
    equipment: res.data.equipment ?? [],
    meetingsCount: 0,
    status: res.data.status,
    description: res.data.description ?? "",
  };
}

export async function deleteMeetingRoomView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/meeting-rooms/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

export async function listMeetingsView(): Promise<HrmMeeting[]> {
  const [meetings, types, rooms, users] = await Promise.all([
    listApiMeetings(),
    listApiMeetingTypes(),
    listApiMeetingRooms(),
    fetchAuthUsers(),
  ]);
  const typeById = new Map(types.map((row) => [row.id, row]));
  const roomById = new Map(rooms.map((row) => [row.id, row]));
  const userById = new Map(users.map((row) => [row.id, row.name]));
  return meetings.map((row) => {
    const type = row.type_id ? typeById.get(row.type_id) : undefined;
    const room = row.room_id ? roomById.get(row.room_id) : undefined;
    return {
      id: row.id,
      title: row.title ?? "",
      meetingType: type?.name ?? "Uncategorized",
      typeColor: type?.color ?? "#64748b",
      meetingDate: row.meeting_date ?? "",
      startTime: row.start_time ?? "",
      endTime: row.end_time ?? "",
      organizer: row.organizer_id ? userById.get(row.organizer_id) ?? row.organizer_id : "",
      room: room?.name ?? "",
      recurrence: row.recurrence,
      status: mapMeetingStatus(row.status),
      description: row.description ?? row.agenda ?? "",
      videoLink: room?.booking_url ?? "",
    };
  });
}

export type MeetingFormOptions = {
  meetingTypes: { name: string; color: string }[];
  meetingRooms: string[];
  organizers: string[];
};

async function applyMeetingStatus(
  id: string,
  currentStatus: ApiMeeting["status"],
  targetStatus: MeetingStatus,
): Promise<void> {
  if (targetStatus === "scheduled" || currentStatus === targetStatus) return;
  const action =
    targetStatus === "completed"
      ? "complete"
      : targetStatus === "cancelled"
        ? "cancel"
        : null;
  if (!action) return;
  await apiFetch(`/api/v1/hrm/meetings/${encodeURIComponent(id)}/${action}?company_id=default`, {
    method: "POST",
  });
}

async function resolveMeetingLookups() {
  const [types, rooms, users] = await Promise.all([
    listApiMeetingTypes(),
    listApiMeetingRooms(),
    fetchAuthUsers(),
  ]);
  return { types, rooms, users };
}

export async function listMeetingFormOptions(): Promise<MeetingFormOptions> {
  const { types, rooms, users } = await resolveMeetingLookups();
  return {
    meetingTypes: types.map((row) => ({ name: row.name, color: row.color })),
    meetingRooms: rooms.map((row) => row.name),
    organizers: users.map((row) => row.name),
  };
}

type ApiMeetingAttendee = {
  id: string;
  company_id: string;
  meeting_id: string | null;
  user_id: string | null;
  type: "required" | "optional";
  rsvp_status: string;
  attendance_status: string;
  rsvp_date: string | null;
  decline_reason: string | null;
};

type ApiMeetingMinute = {
  id: string;
  company_id: string;
  meeting_id: string | null;
  topic: string | null;
  content: string | null;
  type: "discussion" | "decision" | "action_item" | "note";
  recorded_by: string | null;
  recorded_at: string | null;
};

type ApiActionItem = {
  id: string;
  company_id: string;
  meeting_id: string | null;
  title: string | null;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status: string;
  progress_percentage: number;
  notes: string | null;
  completed_date: string | null;
};

function rsvpStatusToUi(status: string): AttendeeRsvp {
  if (status === "pending") return "invited";
  return status as AttendeeRsvp;
}

function uiRsvpToApi(status: AttendeeRsvp): "accepted" | "declined" | "tentative" | "pending" {
  if (status === "invited") return "pending";
  return status as "accepted" | "declined" | "tentative";
}

function attendanceToUi(status: string): AttendeeAttendance {
  if (status === "pending") return "pending";
  if (status === "not_attended") return "not_attended";
  if (status === "present" || status === "late" || status === "left_early") return "attended";
  // fallback for unexpected values
  return "pending";
}

function uiAttendanceToApi(attendance: AttendeeAttendance): "not_attended" | "present" {
  return attendance === "attended" ? "present" : "not_attended";
}

function roleFromOrganizer(meetingOrganizerId: string | null, userId: string | null): AttendeeRole {
  if (meetingOrganizerId && userId && meetingOrganizerId === userId) return "organizer";
  return "attendee";
}

function actionStatusToUi(status: string): ActionStatus {
  if (status === "not_started") return "open";
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "overdue") return "overdue";
  return "open";
}

async function listApiAttendees(): Promise<ApiMeetingAttendee[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiMeetingAttendee>>(
    `/api/v1/hrm/meeting-attendees?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiMinutes(): Promise<ApiMeetingMinute[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiMeetingMinute>>(
    `/api/v1/hrm/meeting-minutes?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

async function listApiActionItems(): Promise<ApiActionItem[]> {
  const qs = new URLSearchParams({ company_id: "default" });
  const res = await apiFetch<ApiListResponse<ApiActionItem>>(
    `/api/v1/hrm/action-items?${qs.toString()}`,
    { cache: "no-store" },
  );
  return res.data ?? [];
}

export async function listMeetingAttendeeFormOptions(): Promise<{
  attendees: { id: string; name: string }[];
  meetings: { title: string; date: string }[];
}> {
  const [meetings, users] = await Promise.all([listApiMeetings(), fetchAuthUsers()]);
  return {
    attendees: users.map((u) => ({ id: u.id, name: u.name })),
    meetings: meetings.map((m) => ({ title: m.title ?? "", date: m.meeting_date ?? "" })).filter((m) => m.title),
  };
}

export async function listMeetingAttendeesView(): Promise<MeetingAttendee[]> {
  const [attendees, meetings, users] = await Promise.all([
    listApiAttendees(),
    listApiMeetings(),
    fetchAuthUsers(),
  ]);

  const meetingById = new Map(meetings.map((m) => [m.id, m]));
  const userById = new Map(users.map((u) => [u.id, u.name]));

  return attendees.map((row) => {
    const meeting = row.meeting_id ? meetingById.get(row.meeting_id) : undefined;
    return {
      id: row.id,
      employeeId: row.user_id ?? "",
      employeeName: row.user_id ? userById.get(row.user_id) ?? row.user_id : "",
      meetingTitle: meeting?.title ?? "",
      meetingDate: meeting?.meeting_date ?? "",
      role: roleFromOrganizer(meeting?.organizer_id ?? null, row.user_id),
      attendanceType: row.type,
      rsvp: rsvpStatusToUi(row.rsvp_status),
      attendance: attendanceToUi(row.attendance_status),
      rsvpDate: row.rsvp_date ? String(row.rsvp_date).slice(0, 10) : null,
      declineReason: row.decline_reason,
    };
  });
}

export async function createMeetingAttendeeView(input: Omit<MeetingAttendee, "id">): Promise<MeetingAttendee> {
  const { meetings, attendees } = await listMeetingAttendeeFormOptions();
  const meeting = meetings.find((m) => m.title === input.meetingTitle && m.date === input.meetingDate);
  const attendee = attendees.find((a) => a.id === input.employeeId || a.name === input.employeeName);
  if (!meeting) throw new Error("Select a meeting");
  if (!attendee) throw new Error("Select an attendee");

  // Resolve IDs (use raw API for ids)
  const [meetingsApi, usersApi] = await Promise.all([listApiMeetings(), fetchAuthUsers()]);
  const meetingApi = meetingsApi.find((m) => m.title === meeting.title && m.meeting_date === meeting.date);
  if (!meetingApi) throw new Error("Meeting not found");
  const userId = attendee.id;

  const created = await apiFetch<ApiItemResponse<ApiMeetingAttendee>>("/api/v1/hrm/meeting-attendees", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      meeting_id: meetingApi.id,
      user_id: userId,
      type: input.attendanceType,
    }),
  });

  const createdId = created.data.id;

  const targetRsvp = uiRsvpToApi(input.rsvp);
  if (targetRsvp !== "pending") {
    await apiFetch<ApiItemResponse<ApiMeetingAttendee>>(
      `/api/v1/hrm/meeting-attendees/${encodeURIComponent(createdId)}/rsvp?company_id=default`,
      {
        method: "POST",
        body: JSON.stringify({
          rsvp_status: targetRsvp,
          decline_reason: input.declineReason ?? undefined,
        }),
      },
    );
  }

  const targetAttendance = uiAttendanceToApi(input.attendance);
  if (targetAttendance !== "not_attended") {
    await apiFetch<ApiItemResponse<ApiMeetingAttendee>>(
      `/api/v1/hrm/meeting-attendees/${encodeURIComponent(createdId)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({
          attendance_status: targetAttendance,
          type: input.attendanceType,
          decline_reason: input.rsvp === "declined" ? input.declineReason ?? undefined : undefined,
        }),
      },
    );
  }

  const rows = await listMeetingAttendeesView();
  const createdRow = rows.find((r) => r.id === createdId);
  if (!createdRow) throw new Error("Created attendee could not be reloaded");
  return createdRow;
}

export async function updateMeetingAttendeeView(
  id: string,
  input: Omit<MeetingAttendee, "id">,
): Promise<MeetingAttendee> {
  const nextAttendance = uiAttendanceToApi(input.attendance);
  const nextType = input.attendanceType;

  await apiFetch<ApiItemResponse<ApiMeetingAttendee>>(
    `/api/v1/hrm/meeting-attendees/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        type: nextType,
        attendance_status: nextAttendance,
        decline_reason: input.rsvp === "declined" ? input.declineReason ?? undefined : undefined,
      }),
    },
  );

  const nextRsvp = uiRsvpToApi(input.rsvp);
  if (nextRsvp !== "pending") {
    await apiFetch<ApiItemResponse<ApiMeetingAttendee>>(
      `/api/v1/hrm/meeting-attendees/${encodeURIComponent(id)}/rsvp?company_id=default`,
      {
        method: "POST",
        body: JSON.stringify({
          rsvp_status: nextRsvp,
          decline_reason: input.declineReason ?? undefined,
        }),
      },
    );
  }

  const rows = await listMeetingAttendeesView();
  const updated = rows.find((r) => r.id === id);
  if (!updated) throw new Error("Updated attendee could not be reloaded");
  return updated;
}

export async function deleteMeetingAttendeeView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/meeting-attendees/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

export async function listMeetingMinuteFormOptions(): Promise<{
  meetings: { title: string; date: string }[];
  recorders: { id: string; name: string }[];
}> {
  const [meetings, users] = await Promise.all([listApiMeetings(), fetchAuthUsers()]);
  return {
    meetings: meetings.map((m) => ({ title: m.title ?? "", date: m.meeting_date ?? "" })).filter((m) => m.title),
    recorders: users.map((u) => ({ id: u.id, name: u.name })),
  };
}

export async function listMeetingMinutesView(): Promise<MeetingMinute[]> {
  const [minutes, meetings, users] = await Promise.all([
    listApiMinutes(),
    listApiMeetings(),
    fetchAuthUsers(),
  ]);
  const meetingById = new Map(meetings.map((m) => [m.id, m]));
  const userById = new Map(users.map((u) => [u.id, u.name]));

  return minutes.map((row) => {
    const meeting = row.meeting_id ? meetingById.get(row.meeting_id) : undefined;
    return {
      id: row.id,
      meetingTitle: meeting?.title ?? "",
      meetingDate: meeting?.meeting_date ?? "",
      topic: row.topic ?? "",
      minuteType: row.type as MinuteType,
      content: row.content ?? "",
      recordedById: row.recorded_by ?? "",
      recordedByName: row.recorded_by ? userById.get(row.recorded_by) ?? row.recorded_by : "",
      recordedAt: row.recorded_at ? String(row.recorded_at).slice(0, 10) : "",
    };
  });
}

export async function createMeetingMinuteView(input: Omit<MeetingMinute, "id">): Promise<MeetingMinute> {
  const [meetings, users] = await Promise.all([listApiMeetings(), fetchAuthUsers()]);
  const meeting = meetings.find((m) => m.title === input.meetingTitle && m.meeting_date === input.meetingDate);
  if (!meeting) throw new Error("Meeting not found");

  const created = await apiFetch<ApiItemResponse<ApiMeetingMinute>>("/api/v1/hrm/meeting-minutes", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      meeting_id: meeting.id,
      topic: input.topic || undefined,
      content: input.content || undefined,
      type: input.minuteType,
    }),
  });

  const rows = await listMeetingMinutesView();
  const createdRow = rows.find((r) => r.id === created.data.id);
  if (!createdRow) throw new Error("Created minute could not be reloaded");
  return createdRow;
}

export async function updateMeetingMinuteView(
  id: string,
  input: Omit<MockMeetingMinute, "id">,
): Promise<MeetingMinute> {
  await apiFetch<ApiItemResponse<ApiMeetingMinute>>(
    `/api/v1/hrm/meeting-minutes/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        topic: input.topic || undefined,
        content: input.content || undefined,
        type: input.minuteType,
      }),
    },
  );

  const rows = await listMeetingMinutesView();
  const updated = rows.find((r) => r.id === id);
  if (!updated) throw new Error("Updated minute could not be reloaded");
  return updated;
}

export async function deleteMeetingMinuteView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/meeting-minutes/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

export async function listActionItemFormOptions(): Promise<{
  assignees: { id: string; name: string }[];
  meetings: { title: string }[];
}> {
  const [users, meetings] = await Promise.all([fetchAuthUsers(), listApiMeetings()]);
  return {
    assignees: users.map((u) => ({ id: u.id, name: u.name })),
    meetings: meetings.map((m) => ({ title: m.title ?? "" })).filter((m) => m.title),
  };
}

export async function listActionItemsView(): Promise<MeetingActionItem[]> {
  const [items, meetings, users] = await Promise.all([
    listApiActionItems(),
    listApiMeetings(),
    fetchAuthUsers(),
  ]);
  const meetingById = new Map(meetings.map((m) => [m.id, m]));
  const userById = new Map(users.map((u) => [u.id, u.name]));

  return items.map((row) => {
    const meeting = row.meeting_id ? meetingById.get(row.meeting_id) : undefined;
    return {
      id: row.id,
      title: row.title ?? "",
      meetingTitle: meeting?.title ?? "",
      assigneeId: row.assigned_to ?? "",
      assigneeName: row.assigned_to ? userById.get(row.assigned_to) ?? row.assigned_to : "",
      dueDate: row.due_date ? String(row.due_date) : "",
      priority: row.priority as ActionPriority,
      progress: row.progress_percentage ?? 0,
      status: actionStatusToUi(row.status),
      description: row.description ?? "",
      notes: row.notes ?? "",
    };
  });
}

export async function createActionItemView(
  input: Omit<MeetingActionItem, "id">,
): Promise<MeetingActionItem> {
  const [meetings, users] = await Promise.all([listApiMeetings(), fetchAuthUsers()]);
  const meeting = meetings.find((m) => m.title === input.meetingTitle);
  if (!meeting) throw new Error("Meeting not found");

  const created = await apiFetch<ApiItemResponse<ApiActionItem>>("/api/v1/hrm/action-items", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      meeting_id: meeting.id,
      title: input.title,
      description: input.description || undefined,
      assigned_to: input.assigneeId || undefined,
      due_date: input.dueDate || undefined,
      priority: input.priority,
      notes: input.notes || undefined,
    }),
  });

  // optional: align progress to UI if user set it
  const progress = Math.min(100, Math.max(0, input.progress));
  if (progress > 0) {
    await apiFetch<ApiItemResponse<ApiActionItem>>(
      `/api/v1/hrm/action-items/${encodeURIComponent(created.data.id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({ progress_percentage: progress }),
      },
    );
  }

  const rows = await listActionItemsView();
  const createdRow = rows.find((r) => r.id === created.data.id);
  if (!createdRow) throw new Error("Created action item could not be reloaded");
  return createdRow;
}

export async function updateActionItemView(
  id: string,
  input: Omit<MeetingActionItem, "id" | "meetingTitle" | "assigneeName" | "status">,
): Promise<MeetingActionItem> {
  await apiFetch<ApiItemResponse<ApiActionItem>>(
    `/api/v1/hrm/action-items/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        title: input.title || undefined,
        description: input.description || undefined,
        assigned_to: input.assigneeId || undefined,
        due_date: input.dueDate || undefined,
        priority: input.priority,
        progress_percentage: Math.min(100, Math.max(0, input.progress)),
        notes: input.notes || undefined,
      }),
    },
  );

  const rows = await listActionItemsView();
  const updated = rows.find((r) => r.id === id);
  if (!updated) throw new Error("Updated action item could not be reloaded");
  return updated;
}

export async function completeActionItemView(id: string, progress: number): Promise<void> {
  const p = Math.min(100, Math.max(0, progress));
  if (p >= 100) {
    await apiFetch<void>(`/api/v1/hrm/action-items/${encodeURIComponent(id)}/complete?company_id=default`, {
      method: "POST",
    });
  } else {
    await apiFetch<ApiItemResponse<ApiActionItem>>(
      `/api/v1/hrm/action-items/${encodeURIComponent(id)}?company_id=default`,
      {
        method: "PATCH",
        body: JSON.stringify({ progress_percentage: p }),
      },
    );
  }
}

export async function deleteActionItemView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/action-items/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}

export async function createMeetingView(payload: Omit<HrmMeeting, "id">): Promise<HrmMeeting> {
  const { types, rooms, users } = await resolveMeetingLookups();
  const type = types.find((row) => row.name === payload.meetingType);
  const room = rooms.find((row) => row.name === payload.room);
  const organizer = users.find((row) => row.name === payload.organizer);
  const res = await apiFetch<ApiItemResponse<ApiMeeting>>("/api/v1/hrm/meetings", {
    method: "POST",
    body: JSON.stringify({
      company_id: "default",
      title: payload.title.trim(),
      description: payload.description.trim() || undefined,
      type_id: type?.id,
      room_id: room?.id,
      meeting_date: payload.meetingDate,
      start_time: payload.startTime,
      end_time: payload.endTime,
      agenda: payload.description.trim() || undefined,
      recurrence: payload.recurrence,
      organizer_id: organizer?.id,
    }),
  });
  await applyMeetingStatus(res.data.id, res.data.status, payload.status);
  const rows = await listMeetingsView();
  const created = rows.find((row) => row.id === res.data.id);
  if (!created) throw new Error("Created meeting could not be loaded");
  return created;
}

export async function updateMeetingView(
  id: string,
  payload: Omit<HrmMeeting, "id">,
): Promise<HrmMeeting> {
  const existingRows = await listApiMeetings();
  const existing = existingRows.find((row) => row.id === id);
  if (!existing) throw new Error("Meeting not found");
  const { types, rooms, users } = await resolveMeetingLookups();
  const type = types.find((row) => row.name === payload.meetingType);
  const room = rooms.find((row) => row.name === payload.room);
  const organizer = users.find((row) => row.name === payload.organizer);
  await apiFetch<ApiItemResponse<ApiMeeting>>(
    `/api/v1/hrm/meetings/${encodeURIComponent(id)}?company_id=default`,
    {
      method: "PATCH",
      body: JSON.stringify({
        title: payload.title.trim(),
        description: payload.description.trim() || undefined,
        type_id: type?.id,
        room_id: room?.id,
        meeting_date: payload.meetingDate,
        start_time: payload.startTime,
        end_time: payload.endTime,
        agenda: payload.description.trim() || undefined,
        recurrence: payload.recurrence,
        organizer_id: organizer?.id,
      }),
    },
  );
  await applyMeetingStatus(id, existing.status, payload.status);
  const rows = await listMeetingsView();
  const updated = rows.find((row) => row.id === id);
  if (!updated) throw new Error("Updated meeting could not be loaded");
  return updated;
}

export async function deleteMeetingView(id: string): Promise<void> {
  await apiFetch<void>(`/api/v1/hrm/meetings/${encodeURIComponent(id)}?company_id=default`, {
    method: "DELETE",
  });
}
