from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class AiDashboardKpi(BaseModel):
    label: str
    value: str
    sub: str
    pct: Optional[int] = None
    alert: Optional[bool] = None
    up: Optional[bool] = None


class AiDashboardTokenDay(BaseModel):
    day: str
    tokens: int


class AiDashboardAgentActivity(BaseModel):
    agent: str
    runs: int


class AiDashboardData(BaseModel):
    kpis: List[AiDashboardKpi]
    token_usage_chart: List[AiDashboardTokenDay]
    agent_activity_chart: List[AiDashboardAgentActivity]


class AiDashboardResponse(BaseModel):
    data: AiDashboardData
