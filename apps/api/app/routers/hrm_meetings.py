from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps.auth import require_permission, get_current_company_id
from app.models.auth_user import AuthUser
from app.schemas.hrm.meetings import (
    ActionItemCreate,
    ActionItemListResponse,
    ActionItemRead,
    ActionItemResponse,
    ActionItemUpdate,
    MeetingAttendeeCreate,
    MeetingAttendeeListResponse,
    MeetingAttendeeRead,
    MeetingAttendeeResponse,
    MeetingAttendeeUpdate,
    MeetingCreate,
    MeetingListResponse,
    MeetingMinuteCreate,
    MeetingMinuteListResponse,
    MeetingMinuteRead,
    MeetingMinuteResponse,
    MeetingMinuteUpdate,
    MeetingRead,
    MeetingResponse,
    MeetingRoomCreate,
    MeetingRoomListResponse,
    MeetingRoomResponse,
    MeetingRoomUpdate,
    MeetingRsvpBody,
    MeetingTypeCreate,
    MeetingTypeListResponse,
    MeetingTypeRead,
    MeetingTypeResponse,
    MeetingTypeUpdate,
    MeetingUpdate,
)
from app.services.hrm import meetings_service as svc

meeting_types_router = APIRouter(prefix="/meeting-types", tags=["hrm-meeting-types"])
rooms_router = APIRouter(prefix="/meeting-rooms", tags=["hrm-meeting-rooms"])
meetings_router = APIRouter(prefix="/meetings", tags=["hrm-meetings"])
attendees_router = APIRouter(prefix="/meeting-attendees", tags=["hrm-meeting-attendees"])
minutes_router = APIRouter(prefix="/meeting-minutes", tags=["hrm-meeting-minutes"])
action_items_router = APIRouter(prefix="/action-items", tags=["hrm-action-items"])


def _meta(rows):
    return {"count": len(rows)}


# meeting types
@meeting_types_router.get("", response_model=MeetingTypeListResponse)
def list_meeting_types(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"), q: Optional[str] = None):
    rows = svc.list_meeting_types(db, company_id=company_id, status=status, q=q)
    data = [MeetingTypeRead.model_validate(r) for r in rows]
    return MeetingTypeListResponse(data=data, meta=_meta(data))


@meeting_types_router.post("", response_model=MeetingTypeResponse, status_code=201)
def create_meeting_type(payload: MeetingTypeCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return MeetingTypeResponse(data=MeetingTypeRead.model_validate(svc.create_meeting_type(db, payload, created_by=user.id)))


@meeting_types_router.patch("/{row_id}", response_model=MeetingTypeResponse)
def update_meeting_type(row_id: str, payload: MeetingTypeUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return MeetingTypeResponse(data=MeetingTypeRead.model_validate(svc.update_meeting_type(db, row_id, payload, company_id=company_id)))


@meeting_types_router.delete("/{row_id}", status_code=204)
def delete_meeting_type(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_meeting_type(db, row_id, company_id=company_id)
    return Response(status_code=204)


# rooms
@rooms_router.get("", response_model=MeetingRoomListResponse)
def list_rooms(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), status: Optional[str] = Query(default=None, pattern="^(active|inactive)$"), type: Optional[str] = Query(default=None, pattern="^(physical|virtual)$"), q: Optional[str] = None):
    rows = svc.list_rooms(db, company_id=company_id, status=status, type=type, q=q)
    data = [svc._room_to_read(r) for r in rows]
    return MeetingRoomListResponse(data=data, meta=_meta(data))


@rooms_router.post("", response_model=MeetingRoomResponse, status_code=201)
def create_room(payload: MeetingRoomCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return MeetingRoomResponse(data=svc._room_to_read(svc.create_room(db, payload, created_by=user.id)))


@rooms_router.patch("/{row_id}", response_model=MeetingRoomResponse)
def update_room(row_id: str, payload: MeetingRoomUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return MeetingRoomResponse(data=svc._room_to_read(svc.update_room(db, row_id, payload, company_id=company_id)))


@rooms_router.delete("/{row_id}", status_code=204)
def delete_room(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_room(db, row_id, company_id=company_id)
    return Response(status_code=204)


# meetings
@meetings_router.get("", response_model=MeetingListResponse)
def list_meetings(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), status: Optional[str] = Query(default=None, pattern="^(scheduled|in_progress|completed|cancelled)$"), type_id: Optional[str] = None, room_id: Optional[str] = None, q: Optional[str] = None):
    rows = svc.list_meetings(db, company_id=company_id, status=status, type_id=type_id, room_id=room_id, q=q)
    data = [MeetingRead.model_validate(r) for r in rows]
    return MeetingListResponse(data=data, meta=_meta(data))


@meetings_router.post("", response_model=MeetingResponse, status_code=201)
def create_meeting(payload: MeetingCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return MeetingResponse(data=MeetingRead.model_validate(svc.create_meeting(db, payload, created_by=user.id)))


@meetings_router.patch("/{row_id}", response_model=MeetingResponse)
def update_meeting(row_id: str, payload: MeetingUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return MeetingResponse(data=MeetingRead.model_validate(svc.update_meeting(db, row_id, payload, company_id=company_id)))


@meetings_router.post("/{row_id}/start", response_model=MeetingResponse)
def start_meeting(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return MeetingResponse(data=MeetingRead.model_validate(svc.start_meeting(db, row_id, company_id=company_id)))


@meetings_router.post("/{row_id}/complete", response_model=MeetingResponse)
def complete_meeting(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return MeetingResponse(data=MeetingRead.model_validate(svc.complete_meeting(db, row_id, company_id=company_id)))


@meetings_router.post("/{row_id}/cancel", response_model=MeetingResponse)
def cancel_meeting(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return MeetingResponse(data=MeetingRead.model_validate(svc.cancel_meeting(db, row_id, company_id=company_id)))


@meetings_router.delete("/{row_id}", status_code=204)
def delete_meeting(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_meeting(db, row_id, company_id=company_id)
    return Response(status_code=204)


# attendees
@attendees_router.get("", response_model=MeetingAttendeeListResponse)
def list_attendees(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), meeting_id: Optional[str] = None, user_id: Optional[str] = None):
    rows = svc.list_attendees(db, company_id=company_id, meeting_id=meeting_id, user_id=user_id)
    data = [MeetingAttendeeRead.model_validate(r) for r in rows]
    return MeetingAttendeeListResponse(data=data, meta=_meta(data))


@attendees_router.post("", response_model=MeetingAttendeeResponse, status_code=201)
def create_attendee(payload: MeetingAttendeeCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return MeetingAttendeeResponse(data=MeetingAttendeeRead.model_validate(svc.create_attendee(db, payload, created_by=user.id)))


@attendees_router.patch("/{row_id}", response_model=MeetingAttendeeResponse)
def update_attendee(row_id: str, payload: MeetingAttendeeUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return MeetingAttendeeResponse(data=MeetingAttendeeRead.model_validate(svc.update_attendee(db, row_id, payload, company_id=company_id)))


@attendees_router.post("/{row_id}/rsvp", response_model=MeetingAttendeeResponse)
def rsvp_attendee(row_id: str, payload: MeetingRsvpBody, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return MeetingAttendeeResponse(data=MeetingAttendeeRead.model_validate(svc.rsvp_attendee(db, row_id, payload, company_id=company_id)))


@attendees_router.delete("/{row_id}", status_code=204)
def delete_attendee(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_attendee(db, row_id, company_id=company_id)
    return Response(status_code=204)


# minutes
@minutes_router.get("", response_model=MeetingMinuteListResponse)
def list_minutes(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), meeting_id: Optional[str] = None):
    rows = svc.list_minutes(db, company_id=company_id, meeting_id=meeting_id)
    data = [MeetingMinuteRead.model_validate(r) for r in rows]
    return MeetingMinuteListResponse(data=data, meta=_meta(data))


@minutes_router.post("", response_model=MeetingMinuteResponse, status_code=201)
def create_minute(payload: MeetingMinuteCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return MeetingMinuteResponse(data=MeetingMinuteRead.model_validate(svc.create_minute(db, payload, created_by=user.id)))


@minutes_router.patch("/{row_id}", response_model=MeetingMinuteResponse)
def update_minute(row_id: str, payload: MeetingMinuteUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return MeetingMinuteResponse(data=MeetingMinuteRead.model_validate(svc.update_minute(db, row_id, payload, company_id=company_id)))


@minutes_router.delete("/{row_id}", status_code=204)
def delete_minute(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_minute(db, row_id, company_id=company_id)
    return Response(status_code=204)


# action items
@action_items_router.get("", response_model=ActionItemListResponse)
def list_action_items(db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "read")), company_id: str = Depends(get_current_company_id), meeting_id: Optional[str] = None, assigned_to: Optional[str] = None, status: Optional[str] = Query(default=None, pattern="^(not_started|in_progress|completed|overdue)$")):
    rows = svc.list_action_items(db, company_id=company_id, meeting_id=meeting_id, assigned_to=assigned_to, status=status)
    data = [ActionItemRead.model_validate(r) for r in rows]
    return ActionItemListResponse(data=data, meta=_meta(data))


@action_items_router.post("", response_model=ActionItemResponse, status_code=201)
def create_action_item(payload: ActionItemCreate, db: Session = Depends(get_db), user: AuthUser = Depends(require_permission("hrm", "create"))):
    return ActionItemResponse(data=ActionItemRead.model_validate(svc.create_action_item(db, payload, created_by=user.id)))


@action_items_router.patch("/{row_id}", response_model=ActionItemResponse)
def update_action_item(row_id: str, payload: ActionItemUpdate, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return ActionItemResponse(data=ActionItemRead.model_validate(svc.update_action_item(db, row_id, payload, company_id=company_id)))


@action_items_router.post("/{row_id}/complete", response_model=ActionItemResponse)
def complete_action_item(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "write")), company_id: str = Depends(get_current_company_id)):
    return ActionItemResponse(data=ActionItemRead.model_validate(svc.complete_action_item(db, row_id, company_id=company_id)))


@action_items_router.delete("/{row_id}", status_code=204)
def delete_action_item(row_id: str, db: Session = Depends(get_db), _: AuthUser = Depends(require_permission("hrm", "delete")), company_id: str = Depends(get_current_company_id)):
    svc.delete_action_item(db, row_id, company_id=company_id)
    return Response(status_code=204)
