from __future__ import annotations

from datetime import date as Date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


# --- meeting types ---
class MeetingTypeCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    color: str = Field(default="#3B82F6", max_length=50)
    default_duration: int = Field(default=60, ge=0)
    status: str = Field(default="active", pattern="^(active|inactive)$")


class MeetingTypeUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, max_length=50)
    default_duration: Optional[int] = Field(default=None, ge=0)
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class MeetingTypeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    color: str
    default_duration: int
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MeetingTypeListResponse(BaseModel):
    data: List[MeetingTypeRead]
    meta: dict
    errors: List[str] = []


class MeetingTypeResponse(BaseModel):
    data: MeetingTypeRead
    errors: List[str] = []


# --- rooms ---
class MeetingRoomCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    type: str = Field(default="physical", pattern="^(physical|virtual)$")
    location: Optional[str] = Field(default=None, max_length=255)
    capacity: int = Field(default=0, ge=0)
    equipment: Optional[List[str]] = None
    booking_url: Optional[str] = None
    status: str = Field(default="active", pattern="^(active|inactive)$")


class MeetingRoomUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    type: Optional[str] = Field(default=None, pattern="^(physical|virtual)$")
    location: Optional[str] = Field(default=None, max_length=255)
    capacity: Optional[int] = Field(default=None, ge=0)
    equipment: Optional[List[str]] = None
    booking_url: Optional[str] = None
    status: Optional[str] = Field(default=None, pattern="^(active|inactive)$")


class MeetingRoomRead(BaseModel):
    id: str
    company_id: str
    name: str
    description: Optional[str] = None
    type: str
    location: Optional[str] = None
    capacity: int
    equipment: Optional[List[str]] = None
    booking_url: Optional[str] = None
    status: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MeetingRoomListResponse(BaseModel):
    data: List[MeetingRoomRead]
    meta: dict
    errors: List[str] = []


class MeetingRoomResponse(BaseModel):
    data: MeetingRoomRead
    errors: List[str] = []


# --- meetings ---
class MeetingCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    title: str = Field(min_length=1)
    description: Optional[str] = None
    type_id: Optional[str] = Field(default=None, max_length=36)
    room_id: Optional[str] = Field(default=None, max_length=36)
    meeting_date: Optional[str] = Field(default=None, max_length=255)
    start_time: Optional[str] = Field(default=None, max_length=255)
    end_time: Optional[str] = Field(default=None, max_length=255)
    agenda: Optional[str] = None
    recurrence: str = Field(default="none", pattern="^(none|daily|weekly|monthly)$")
    recurrence_end_date: Optional[Date] = None
    organizer_id: Optional[str] = Field(default=None, max_length=36)


class MeetingUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    type_id: Optional[str] = Field(default=None, max_length=36)
    room_id: Optional[str] = Field(default=None, max_length=36)
    meeting_date: Optional[str] = Field(default=None, max_length=255)
    start_time: Optional[str] = Field(default=None, max_length=255)
    end_time: Optional[str] = Field(default=None, max_length=255)
    agenda: Optional[str] = None
    recurrence: Optional[str] = Field(default=None, pattern="^(none|daily|weekly|monthly)$")
    recurrence_end_date: Optional[Date] = None
    organizer_id: Optional[str] = Field(default=None, max_length=36)


class MeetingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    type_id: Optional[str] = None
    room_id: Optional[str] = None
    meeting_date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration: int
    agenda: Optional[str] = None
    status: str
    recurrence: str
    recurrence_end_date: Optional[Date] = None
    organizer_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MeetingListResponse(BaseModel):
    data: List[MeetingRead]
    meta: dict
    errors: List[str] = []


class MeetingResponse(BaseModel):
    data: MeetingRead
    errors: List[str] = []


# --- attendees ---
class MeetingAttendeeCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    meeting_id: str = Field(min_length=1, max_length=36)
    user_id: str = Field(min_length=1, max_length=36)
    type: str = Field(default="required", pattern="^(required|optional)$")


class MeetingAttendeeUpdate(BaseModel):
    type: Optional[str] = Field(default=None, pattern="^(required|optional)$")
    attendance_status: Optional[str] = Field(
        default=None, pattern="^(not_attended|present|late|left_early)$"
    )
    decline_reason: Optional[str] = None


class MeetingRsvpBody(BaseModel):
    rsvp_status: str = Field(pattern="^(accepted|declined|tentative)$")
    decline_reason: Optional[str] = None


class MeetingAttendeeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    meeting_id: Optional[str] = None
    user_id: Optional[str] = None
    type: str
    rsvp_status: str
    attendance_status: str
    rsvp_date: Optional[datetime] = None
    decline_reason: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MeetingAttendeeListResponse(BaseModel):
    data: List[MeetingAttendeeRead]
    meta: dict
    errors: List[str] = []


class MeetingAttendeeResponse(BaseModel):
    data: MeetingAttendeeRead
    errors: List[str] = []


# --- minutes ---
class MeetingMinuteCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    meeting_id: str = Field(min_length=1, max_length=36)
    topic: Optional[str] = Field(default=None, max_length=50)
    content: Optional[str] = None
    type: str = Field(default="discussion", pattern="^(discussion|decision|action_item|note)$")


class MeetingMinuteUpdate(BaseModel):
    topic: Optional[str] = Field(default=None, max_length=50)
    content: Optional[str] = None
    type: Optional[str] = Field(default=None, pattern="^(discussion|decision|action_item|note)$")


class MeetingMinuteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    meeting_id: Optional[str] = None
    topic: Optional[str] = None
    content: Optional[str] = None
    type: str
    recorded_by: Optional[str] = None
    recorded_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MeetingMinuteListResponse(BaseModel):
    data: List[MeetingMinuteRead]
    meta: dict
    errors: List[str] = []


class MeetingMinuteResponse(BaseModel):
    data: MeetingMinuteRead
    errors: List[str] = []


# --- action items ---
class ActionItemCreate(BaseModel):
    company_id: str = Field(default="default", min_length=1, max_length=36)
    meeting_id: str = Field(min_length=1, max_length=36)
    title: str = Field(min_length=1)
    description: Optional[str] = None
    assigned_to: Optional[str] = Field(default=None, max_length=36)
    due_date: Optional[Date] = None
    priority: str = Field(default="medium", pattern="^(low|medium|high|critical)$")
    notes: Optional[str] = None


class ActionItemUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    assigned_to: Optional[str] = Field(default=None, max_length=36)
    due_date: Optional[Date] = None
    priority: Optional[str] = Field(default=None, pattern="^(low|medium|high|critical)$")
    progress_percentage: Optional[int] = Field(default=None, ge=0, le=100)
    notes: Optional[str] = None


class ActionItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    company_id: str
    meeting_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[Date] = None
    priority: str
    status: str
    progress_percentage: int
    notes: Optional[str] = None
    completed_date: Optional[Date] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ActionItemListResponse(BaseModel):
    data: List[ActionItemRead]
    meta: dict
    errors: List[str] = []


class ActionItemResponse(BaseModel):
    data: ActionItemRead
    errors: List[str] = []
