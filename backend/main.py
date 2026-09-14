from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.core.config import get_settings
from app.database import engine
from app.routers import kpis, conversation, calls, agents, incidents, alerts, settings as settings_router, client_overview, ai_prompts, auth, client_settings

app_settings = get_settings()

app = FastAPI(title="CallIQ API", version="2.0.0")


def _init_schema():
    # Ensure users table has role and full_name columns needed for role-based access
    try:
        with engine.begin() as conn:
            roles = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'"
            )).scalar()
            if roles == 0:
                conn.execute(text("ALTER TABLE users ADD COLUMN role VARCHAR(50) DEFAULT 'User'"))
                conn.execute(text("UPDATE users SET role = CASE WHEN is_superuser = 1 THEN 'System Admin' ELSE 'User' END"))
            fn = conn.execute(text(
                "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'full_name'"
            )).scalar()
            if fn == 0:
                conn.execute(text("ALTER TABLE users ADD COLUMN full_name VARCHAR(255)"))
    except Exception as exc:
        print(f"[CallIQ] Schema init skipped: {exc}")


app.add_middleware(
    CORSMiddleware,
    allow_origins=app_settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(kpis.router)
app.include_router(conversation.router)
app.include_router(calls.router)
app.include_router(agents.router)
app.include_router(incidents.router)
app.include_router(alerts.router)
app.include_router(settings_router.router)
app.include_router(ai_prompts.router)
app.include_router(auth.router)
app.include_router(client_overview.router)
app.include_router(client_overview.clients_router)
app.include_router(client_settings.router)


@app.on_event("startup")
def _startup():
    _init_schema()


@app.get("/api/health")
def health():
    return {"status": "ok"}
