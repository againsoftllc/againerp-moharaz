from __future__ import annotations

ADMIN_USER = {
    "id": "user_admin",
    "email": "admin@againerp.local",
    "username": "admin",
    "name": "AgainERP Admin",
    "role": "admin",
    "password": "admin123",
}

STAFF_USER = {
    "id": "user_staff",
    "email": "staff@againerp.local",
    "username": "staff",
    "name": "AgainERP Staff",
    "role": "staff",
    "password": "staff123",
}

VIEWER_USER = {
    "id": "user_viewer",
    "email": "viewer@againerp.local",
    "username": "viewer",
    "name": "AgainERP Viewer",
    "role": "viewer",
    "password": "viewer123",
}

AUTH_USERS_SEED = [ADMIN_USER, STAFF_USER, VIEWER_USER]
