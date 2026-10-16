"""CRM foundation constants — statuses, stages, and legal transitions."""

LEAD_SOURCES = (
    "website",
    "facebook",
    "google",
    "linkedin",
    "whatsapp",
    "phone",
    "email",
    "referral",
    "campaign",
    "event",
    "cold_call",
    "social",
    "manual",
    "other",
)

# New -> Contacted -> Interested -> Qualified -> Converted (to a Deal), or
# Lost/Unqualified from anywhere open. Proposal/Negotiation/Won live on the
# Deal itself (see DEAL_STAGES below) rather than being duplicated here —
# a Lead's job ends at "qualified enough to become an opportunity".
LEAD_STATUSES = ("new", "contacted", "interested", "qualified", "unqualified", "converted", "lost")
LEAD_OPEN_STATUSES = ("new", "contacted", "interested", "qualified")
LEAD_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    "new": frozenset({"contacted", "unqualified", "lost"}),
    "contacted": frozenset({"interested", "unqualified", "lost"}),
    "interested": frozenset({"qualified", "unqualified", "lost"}),
    "qualified": frozenset({"converted", "lost"}),
    "unqualified": frozenset(),
    "converted": frozenset(),
    "lost": frozenset(),
}

LEAD_LOST_REASONS = (
    "budget_issue",
    "competitor_selected",
    "no_response",
    "project_cancelled",
    "not_interested",
    "wrong_lead",
    "timeline_changed",
    "other",
)

FOLLOW_UP_TYPES = ("call", "email", "meeting", "whatsapp", "send_proposal", "demo", "other")

DEAL_STAGES = ("new", "qualified", "proposal", "negotiation", "won", "lost")
DEAL_OPEN_STAGES = ("new", "qualified", "proposal", "negotiation")
DEAL_STAGE_TRANSITIONS: dict[str, frozenset[str]] = {
    "new": frozenset({"qualified", "lost"}),
    "qualified": frozenset({"proposal", "lost"}),
    "proposal": frozenset({"negotiation", "lost"}),
    "negotiation": frozenset({"won", "lost"}),
    "won": frozenset(),
    "lost": frozenset(),
}
DEAL_STAGE_DEFAULT_PROBABILITY = {
    "new": 10,
    "qualified": 30,
    "proposal": 50,
    "negotiation": 75,
    "won": 100,
    "lost": 0,
}

PROJECT_STATUSES = ("planning", "active", "on_hold", "completed", "cancelled")
PROJECT_OPEN_STATUSES = ("planning", "active", "on_hold")

TASK_STATUSES = ("todo", "in_progress", "done", "cancelled")
TASK_OPEN_STATUSES = ("todo", "in_progress")
TASK_PRIORITIES = ("low", "medium", "high", "urgent")
TASK_RELATED_TYPES = ("lead", "deal", "project", "ticket", "customer")

TICKET_CATEGORIES = ("general", "billing", "technical", "complaint", "other")
TICKET_PRIORITIES = ("low", "medium", "high", "urgent")
TICKET_STATUSES = ("open", "in_progress", "waiting_on_customer", "resolved", "closed")
TICKET_OPEN_STATUSES = ("open", "in_progress", "waiting_on_customer")
TICKET_STATUS_TRANSITIONS: dict[str, frozenset[str]] = {
    "open": frozenset({"in_progress", "waiting_on_customer", "resolved", "closed"}),
    "in_progress": frozenset({"waiting_on_customer", "resolved", "closed"}),
    "waiting_on_customer": frozenset({"in_progress", "resolved", "closed"}),
    "resolved": frozenset({"closed", "in_progress"}),
    "closed": frozenset({"in_progress"}),
}
