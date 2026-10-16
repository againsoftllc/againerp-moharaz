# AgainERP ↔ MoharazNX separation

AgainERP and MoharazNX are **totally separate** projects: separate folders, Docker containers, Postgres volumes, databases, and ports.

## Isolation map

| | **AgainERP** (`/htdocs/againerp`) | **MoharazNX** (`/htdocs/moharaznx`) |
|--|-----------------------------------|-------------------------------------|
| Admin | :3210 | :3200 |
| API | :8010 | :8000 |
| Shop | :3010 (`apps/frontstore`) | Monarch → :8000 |
| Postgres host port | **5440** | **5433** |
| DB name / user / pass | `againerp` / `againerp` / `againerp` | `moharaznx` / `moharaznx` / `moharaznx` |
| Container | `againerp-postgres` | `moharaznx-postgres` |
| Volume | `againerp_pgdata` | `moharaznx_pgdata` |
| Compose project | `againerp` | `moharaznx` |

## Connection strings

```bash
# AgainERP only
postgresql://againerp:againerp@127.0.0.1:5440/againerp

# MoharazNX only
postgresql://moharaznx:moharaznx@127.0.0.1:5433/moharaznx
```

## Rules

1. Never point AgainERP `.env` at port **5433** or DB `moharaznx`.
2. Never point MoharazNX `.env` at port **5440** or DB `againerp` / legacy `againerp`.
3. Do not share Docker volumes between the two stacks.
4. Monarch (`/htdocs/monarch`) stays aligned with **MoharazNX**, not AgainERP.
5. AgainERP frontstore is its own Monarch-derived copy under `againerp/apps/frontstore`.

## Quick verify

```bash
docker exec againerp-postgres  psql -U againerp  -d againerp  -c 'SELECT current_database(), current_user;'
docker exec moharaznx-postgres psql -U moharaznx -d moharaznx -c 'SELECT current_database(), current_user;'

docker volume ls | grep -E 'againerp_pgdata|moharaznx_pgdata'
```

Expect two different databases and two different volumes.
