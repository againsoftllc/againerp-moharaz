from __future__ import annotations

JOURNEY_SEED: list[dict] = [
    {
        "id": "jrn_welcome",
        "name": "Welcome series",
        "trigger": "New subscriber",
        "steps": 3,
        "enrolled": 1240,
        "completed": 890,
        "status": "active",
    },
    {
        "id": "jrn_cart",
        "name": "Abandoned cart recovery",
        "trigger": "Cart abandoned 1h",
        "steps": 2,
        "enrolled": 420,
        "completed": 186,
        "status": "active",
    },
    {
        "id": "jrn_post",
        "name": "Post-purchase nurture",
        "trigger": "Order delivered",
        "steps": 4,
        "enrolled": 680,
        "completed": 512,
        "status": "active",
    },
    {
        "id": "jrn_birthday",
        "name": "Birthday offer",
        "trigger": "Birthday date",
        "steps": 1,
        "enrolled": 0,
        "completed": 0,
        "status": "draft",
    },
]
