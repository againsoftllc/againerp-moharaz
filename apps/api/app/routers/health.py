import asyncio

from fastapi import APIRouter

from app.config import get_settings
from app.database import check_database_connection
from app.schemas.product import HealthResponse

router = APIRouter(tags=["health"])
settings = get_settings()


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    try:
        db = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, check_database_connection),
            timeout=5.0,
        )
    except asyncio.TimeoutError:
        db = {"ok": False, "error": "database connection timeout"}
    return HealthResponse(
        status="ok" if db.get("ok") else "degraded",
        app=settings.app_name,
        env=settings.app_env,
        database=db,
    )
