"""Central place to assemble the tool set for one authenticated AI request.

`build_tools(bearer_token, ...)` is what `ai_gateway.py` calls — the single point
that has to change as more tool modules are added (customer, finance, ...).
`tool_catalog()` builds the same set with a throwaway token and no db/user
purely to read metadata (name/description/risk_tier/module) for display —
building a tool set does no I/O by itself (handlers only call out when
actually invoked), so this is safe and cheap, not a real request. db/company_id/
user are optional for exactly that reason: finance_tools' handlers close over
them but tool_catalog() never calls a handler, so None is never dereferenced.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.services.ai.orchestrator import OrchestratorTool
from app.services.ai.tools.action_tools import build_action_tools
from app.services.ai.tools.catalog_import_tools import build_catalog_import_tools
from app.services.ai.tools.customer_tools import build_customer_tools
from app.services.ai.tools.database_tools import build_database_tools
from app.services.ai.tools.finance_report_tools import build_finance_report_tools
from app.services.ai.tools.finance_tools import build_finance_tools
from app.services.ai.tools.forecast_tools import build_forecast_tools
from app.services.ai.tools.image_tools import build_image_tools
from app.services.ai.tools.planning_tools import build_planning_tools
from app.services.ai.tools.inventory_tools import build_inventory_tools
from app.services.ai.tools.memory_tools import build_memory_tools
from app.services.ai.tools.preset_tools import build_preset_tools
from app.services.ai.tools.product_edit_tools import build_product_edit_tools
from app.services.ai.tools.purchase_tools import build_purchase_tools
from app.services.ai.tools.sales_tools import build_sales_tools


def build_tools(
    bearer_token: str,
    *,
    db: Session | None = None,
    company_id: str | None = None,
    user: Any | None = None,
) -> list[OrchestratorTool]:
    return [
        *build_customer_tools(bearer_token),
        *build_finance_tools(bearer_token, db=db, company_id=company_id, user=user),
        *build_finance_report_tools(bearer_token),
        *build_sales_tools(bearer_token, db=db, company_id=company_id, user=user),
        *build_inventory_tools(bearer_token),
        *build_purchase_tools(bearer_token, db=db, company_id=company_id, user=user),
        *build_action_tools(bearer_token, db=db, company_id=company_id, user=user),
        *build_catalog_import_tools(db=db, company_id=company_id, user=user),
        *build_product_edit_tools(db=db, company_id=company_id, user=user),
        *build_forecast_tools(db=db, company_id=company_id, user=user),
        *build_image_tools(db=db, company_id=company_id, user=user),
        *build_planning_tools(db=db, company_id=company_id, user=user),
        *build_memory_tools(db=db, company_id=company_id, user=user),
        *build_preset_tools(db=db, company_id=company_id, user=user),
        *build_database_tools(db=db, company_id=company_id, user=user),
    ]


def tool_catalog() -> list[OrchestratorTool]:
    return build_tools("catalog-metadata-only")
