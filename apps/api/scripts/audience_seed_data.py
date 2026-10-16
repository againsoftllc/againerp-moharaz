from __future__ import annotations

AUDIENCE_SEED: list[dict] = [
    {
        "id": "seg_newsletter",
        "name": "Newsletter subscribers",
        "members": 8420,
        "growth": "+124 / week",
        "source": "Website signup",
    },
    {
        "id": "seg_vip",
        "name": "VIP customers",
        "members": 312,
        "growth": "+8 / week",
        "source": "Loyalty tier",
    },
    {
        "id": "seg_inactive",
        "name": "Inactive 30 days",
        "members": 2140,
        "growth": "+42 / week",
        "source": "Behavior rule",
    },
    {
        "id": "seg_churn",
        "name": "Churn risk cohort",
        "members": 486,
        "growth": "AI scored",
        "source": "Marketing Agent",
    },
    {
        "id": "seg_electronics",
        "name": "Electronics buyers",
        "members": 1680,
        "growth": "+56 / week",
        "source": "Purchase history",
    },
]
