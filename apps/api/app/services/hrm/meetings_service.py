from __future__ import annotations

import json
from datetime import date, datetime
from typing import List, Optional, Type, TypeVar

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.auth_user import AuthUser
from app.models.hrm.meetings import (
    HrmActionItem,
    HrmMeeting,
    HrmMeetingAttendee,
    HrmMeetingMinute,
    HrmMeetingRoom,
    HrmMeetingType,
)
from app.schemas.hrm.meetings import (
    ActionItemCreate,
    ActionItemUpdate,
    MeetingAttendeeCreate,
    MeetingAttendeeUpdate,
    MeetingCreate,
    MeetingMinuteCreate,
    MeetingMinuteUpdate,
    MeetingRoomCreate,
    MeetingRoomRead,
    MeetingRoomUpdate,
    MeetingRsvpBody,
    MeetingTypeCreate,
    MeetingTypeUpdate,
    MeetingUpdate,
)

T = TypeVar("T")


def _get(db: Session, model: Type[T], row_id: str, company_id: Optional[str], label: str) -> T:
    row = db.get(model, row_id)
    if not row or (company_id and getattr(row, "company_id", None) != company_id):
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


def _require_user(db: Session, user_id: str) -> AuthUser:
    row = db.get(AuthUser, user_id)
    if not row:
        raise HTTPException(status_code=400, detail="Invalid user_id")
    return row


def _loads_list(raw: Optional[str]) -> Optional[List[str]]:
    if raw is None or raw == "":
        return None
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x) for x in data]
    except (TypeError, ValueError):
        pass
    return [raw]


def _dumps_list(value: Optional[List[str]]) -> Optional[str]:
    if value is None:
        return None
    return json.dumps(value)


def _room_to_read(row: HrmMeetingRoom) -> MeetingRoomRead:
    return MeetingRoomRead(
        id=row.id,
        company_id=row.company_id,
        name=row.name,
        description=row.description,
        type=row.type,
        location=row.location,
        capacity=row.capacity,
        equipment=_loads_list(row.equipment),
        booking_url=row.booking_url,
        status=row.status,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    text = value.strip()
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M", "%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _compute_duration(start_time: Optional[str], end_time: Optional[str], fallback: int = 0) -> int:
    start = _parse_dt(start_time)
    end = _parse_dt(end_time)
    if not start or not end:
        return fallback
    # if time-only parse, both are on 1900-01-01
    minutes = int((end - start).total_seconds() // 60)
    return max(0, minutes)


def _action_status(progress: int, due_date: Optional[date], completed_date: Optional[date]) -> str:
    if progress >= 100 or completed_date is not None:
        return "completed"
    if due_date and due_date < date.today() and progress < 100:
        return "overdue"
    if progress > 0:
        return "in_progress"
    return "not_started"


# --- meeting types ---

def list_meeting_types(db: Session, *, company_id: str, status: Optional[str] = None, q: Optional[str] = None):
    query = db.query(HrmMeetingType).filter(HrmMeetingType.company_id == company_id)
    if status:
        query = query.filter(HrmMeetingType.status == status)
    if q:
        query = query.filter(HrmMeetingType.name.ilike(f"%{q.strip()}%"))
    return query.order_by(HrmMeetingType.name.asc()).all()


def get_meeting_type(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmMeetingType, row_id, company_id, "Meeting type")


def create_meeting_type(db: Session, payload: MeetingTypeCreate, *, created_by: Optional[str]):
    row = HrmMeetingType(
        company_id=payload.company_id,
        name=payload.name.strip(),
        description=payload.description,
        color=payload.color,
        default_duration=payload.default_duration,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_meeting_type(db: Session, row_id: str, payload: MeetingTypeUpdate, *, company_id: str):
    row = get_meeting_type(db, row_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_meeting_type(db: Session, row_id: str, *, company_id: str):
    row = get_meeting_type(db, row_id, company_id=company_id)
    in_use = db.query(HrmMeeting).filter(HrmMeeting.type_id == row_id).first()
    if in_use:
        raise HTTPException(status_code=409, detail="Meeting type is in use")
    db.delete(row)
    db.commit()


# --- rooms ---

def list_rooms(db: Session, *, company_id: str, status: Optional[str] = None, type: Optional[str] = None, q: Optional[str] = None):
    query = db.query(HrmMeetingRoom).filter(HrmMeetingRoom.company_id == company_id)
    if status:
        query = query.filter(HrmMeetingRoom.status == status)
    if type:
        query = query.filter(HrmMeetingRoom.type == type)
    if q:
        query = query.filter(HrmMeetingRoom.name.ilike(f"%{q.strip()}%"))
    return query.order_by(HrmMeetingRoom.name.asc()).all()


def get_room(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmMeetingRoom, row_id, company_id, "Meeting room")


def create_room(db: Session, payload: MeetingRoomCreate, *, created_by: Optional[str]):
    row = HrmMeetingRoom(
        company_id=payload.company_id,
        name=payload.name.strip(),
        description=payload.description,
        type=payload.type,
        location=payload.location,
        capacity=payload.capacity,
        equipment=_dumps_list(payload.equipment),
        booking_url=payload.booking_url,
        status=payload.status,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_room(db: Session, row_id: str, payload: MeetingRoomUpdate, *, company_id: str):
    row = get_room(db, row_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        data["name"] = data["name"].strip()
    if "equipment" in data:
        data["equipment"] = _dumps_list(data["equipment"])
    for k, v in data.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_room(db: Session, row_id: str, *, company_id: str):
    row = get_room(db, row_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- meetings ---

def list_meetings(
    db: Session,
    *,
    company_id: str,
    status: Optional[str] = None,
    type_id: Optional[str] = None,
    room_id: Optional[str] = None,
    q: Optional[str] = None,
):
    query = db.query(HrmMeeting).filter(HrmMeeting.company_id == company_id)
    if status:
        query = query.filter(HrmMeeting.status == status)
    if type_id:
        query = query.filter(HrmMeeting.type_id == type_id)
    if room_id:
        query = query.filter(HrmMeeting.room_id == room_id)
    if q:
        query = query.filter(HrmMeeting.title.ilike(f"%{q.strip()}%"))
    return query.order_by(HrmMeeting.created_at.desc()).all()


def get_meeting(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmMeeting, row_id, company_id, "Meeting")


def create_meeting(db: Session, payload: MeetingCreate, *, created_by: Optional[str]):
    if payload.type_id:
        get_meeting_type(db, payload.type_id, company_id=payload.company_id)
    if payload.room_id:
        get_room(db, payload.room_id, company_id=payload.company_id)
    organizer_id = payload.organizer_id or created_by
    if organizer_id:
        _require_user(db, organizer_id)
    fallback = 60
    if payload.type_id:
        mt = get_meeting_type(db, payload.type_id, company_id=payload.company_id)
        fallback = mt.default_duration or 60
    duration = _compute_duration(payload.start_time, payload.end_time, fallback)
    row = HrmMeeting(
        company_id=payload.company_id,
        title=payload.title.strip(),
        description=payload.description,
        type_id=payload.type_id,
        room_id=payload.room_id,
        meeting_date=payload.meeting_date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        duration=duration,
        agenda=payload.agenda,
        status="scheduled",
        recurrence=payload.recurrence,
        recurrence_end_date=payload.recurrence_end_date,
        organizer_id=organizer_id,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_meeting(db: Session, row_id: str, payload: MeetingUpdate, *, company_id: str):
    row = get_meeting(db, row_id, company_id=company_id)
    if row.status in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="Finished meetings cannot be edited")
    data = payload.model_dump(exclude_unset=True)
    if "type_id" in data and data["type_id"]:
        get_meeting_type(db, data["type_id"], company_id=company_id)
    if "room_id" in data and data["room_id"]:
        get_room(db, data["room_id"], company_id=company_id)
    if "organizer_id" in data and data["organizer_id"]:
        _require_user(db, data["organizer_id"])
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    start = data.get("start_time", row.start_time)
    end = data.get("end_time", row.end_time)
    row.duration = _compute_duration(start, end, row.duration or 0)
    db.commit()
    db.refresh(row)
    return row


def start_meeting(db: Session, row_id: str, *, company_id: str):
    row = get_meeting(db, row_id, company_id=company_id)
    if row.status != "scheduled":
        raise HTTPException(status_code=409, detail="Only scheduled meetings can be started")
    row.status = "in_progress"
    db.commit()
    db.refresh(row)
    return row


def complete_meeting(db: Session, row_id: str, *, company_id: str):
    row = get_meeting(db, row_id, company_id=company_id)
    if row.status not in ("scheduled", "in_progress"):
        raise HTTPException(status_code=409, detail="Only scheduled/in_progress meetings can be completed")
    row.status = "completed"
    db.commit()
    db.refresh(row)
    return row


def cancel_meeting(db: Session, row_id: str, *, company_id: str):
    row = get_meeting(db, row_id, company_id=company_id)
    if row.status in ("completed", "cancelled"):
        raise HTTPException(status_code=409, detail="Meeting already finished")
    row.status = "cancelled"
    db.commit()
    db.refresh(row)
    return row


def delete_meeting(db: Session, row_id: str, *, company_id: str):
    row = get_meeting(db, row_id, company_id=company_id)
    if row.status not in ("scheduled", "cancelled"):
        raise HTTPException(status_code=409, detail="Only scheduled/cancelled meetings can be deleted")
    db.delete(row)
    db.commit()


# --- attendees ---

def list_attendees(db: Session, *, company_id: str, meeting_id: Optional[str] = None, user_id: Optional[str] = None):
    query = db.query(HrmMeetingAttendee).filter(HrmMeetingAttendee.company_id == company_id)
    if meeting_id:
        query = query.filter(HrmMeetingAttendee.meeting_id == meeting_id)
    if user_id:
        query = query.filter(HrmMeetingAttendee.user_id == user_id)
    return query.order_by(HrmMeetingAttendee.created_at.desc()).all()


def get_attendee(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmMeetingAttendee, row_id, company_id, "Meeting attendee")


def create_attendee(db: Session, payload: MeetingAttendeeCreate, *, created_by: Optional[str]):
    get_meeting(db, payload.meeting_id, company_id=payload.company_id)
    _require_user(db, payload.user_id)
    existing = (
        db.query(HrmMeetingAttendee)
        .filter(
            HrmMeetingAttendee.company_id == payload.company_id,
            HrmMeetingAttendee.meeting_id == payload.meeting_id,
            HrmMeetingAttendee.user_id == payload.user_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="User already invited to this meeting")
    row = HrmMeetingAttendee(
        company_id=payload.company_id,
        meeting_id=payload.meeting_id,
        user_id=payload.user_id,
        type=payload.type,
        rsvp_status="pending",
        attendance_status="not_attended",
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_attendee(db: Session, row_id: str, payload: MeetingAttendeeUpdate, *, company_id: str):
    row = get_attendee(db, row_id, company_id=company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def rsvp_attendee(db: Session, row_id: str, payload: MeetingRsvpBody, *, company_id: str):
    row = get_attendee(db, row_id, company_id=company_id)
    row.rsvp_status = payload.rsvp_status
    row.rsvp_date = datetime.utcnow()
    if payload.rsvp_status == "declined":
        row.decline_reason = payload.decline_reason
    else:
        row.decline_reason = None
    db.commit()
    db.refresh(row)
    return row


def delete_attendee(db: Session, row_id: str, *, company_id: str):
    row = get_attendee(db, row_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- minutes ---

def list_minutes(db: Session, *, company_id: str, meeting_id: Optional[str] = None):
    query = db.query(HrmMeetingMinute).filter(HrmMeetingMinute.company_id == company_id)
    if meeting_id:
        query = query.filter(HrmMeetingMinute.meeting_id == meeting_id)
    return query.order_by(HrmMeetingMinute.created_at.desc()).all()


def get_minute(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmMeetingMinute, row_id, company_id, "Meeting minute")


def create_minute(db: Session, payload: MeetingMinuteCreate, *, created_by: Optional[str]):
    get_meeting(db, payload.meeting_id, company_id=payload.company_id)
    row = HrmMeetingMinute(
        company_id=payload.company_id,
        meeting_id=payload.meeting_id,
        topic=payload.topic,
        content=payload.content,
        type=payload.type,
        recorded_by=created_by,
        recorded_at=datetime.utcnow(),
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_minute(db: Session, row_id: str, payload: MeetingMinuteUpdate, *, company_id: str):
    row = get_minute(db, row_id, company_id=company_id)
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


def delete_minute(db: Session, row_id: str, *, company_id: str):
    row = get_minute(db, row_id, company_id=company_id)
    db.delete(row)
    db.commit()


# --- action items ---

def list_action_items(
    db: Session,
    *,
    company_id: str,
    meeting_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    status: Optional[str] = None,
):
    query = db.query(HrmActionItem).filter(HrmActionItem.company_id == company_id)
    if meeting_id:
        query = query.filter(HrmActionItem.meeting_id == meeting_id)
    if assigned_to:
        query = query.filter(HrmActionItem.assigned_to == assigned_to)
    if status:
        query = query.filter(HrmActionItem.status == status)
    return query.order_by(HrmActionItem.created_at.desc()).all()


def get_action_item(db: Session, row_id: str, *, company_id: str):
    return _get(db, HrmActionItem, row_id, company_id, "Action item")


def create_action_item(db: Session, payload: ActionItemCreate, *, created_by: Optional[str]):
    get_meeting(db, payload.meeting_id, company_id=payload.company_id)
    if payload.assigned_to:
        _require_user(db, payload.assigned_to)
    row = HrmActionItem(
        company_id=payload.company_id,
        meeting_id=payload.meeting_id,
        title=payload.title.strip(),
        description=payload.description,
        assigned_to=payload.assigned_to,
        due_date=payload.due_date,
        priority=payload.priority,
        status=_action_status(0, payload.due_date, None),
        progress_percentage=0,
        notes=payload.notes,
        created_by=created_by,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update_action_item(db: Session, row_id: str, payload: ActionItemUpdate, *, company_id: str):
    row = get_action_item(db, row_id, company_id=company_id)
    data = payload.model_dump(exclude_unset=True)
    if "assigned_to" in data and data["assigned_to"]:
        _require_user(db, data["assigned_to"])
    if "title" in data and data["title"] is not None:
        data["title"] = data["title"].strip()
    for k, v in data.items():
        setattr(row, k, v)
    if row.progress_percentage >= 100 and row.completed_date is None:
        row.completed_date = date.today()
    if row.progress_percentage < 100:
        row.completed_date = None
    row.status = _action_status(row.progress_percentage, row.due_date, row.completed_date)
    db.commit()
    db.refresh(row)
    return row


def complete_action_item(db: Session, row_id: str, *, company_id: str):
    row = get_action_item(db, row_id, company_id=company_id)
    row.progress_percentage = 100
    row.completed_date = date.today()
    row.status = "completed"
    db.commit()
    db.refresh(row)
    return row


def delete_action_item(db: Session, row_id: str, *, company_id: str):
    row = get_action_item(db, row_id, company_id=company_id)
    db.delete(row)
    db.commit()
