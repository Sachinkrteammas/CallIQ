from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from app.core.config import get_settings
from app.database import SessionLocal, engine
from app.services.client_scope import scope_where
from app.routers import kpis, conversation, calls, agents, incidents, alerts, settings as settings_router, client_overview, ai_prompts, auth, client_settings,auth
from app.routers import reports
from app.routers import smartping
from app.routers import ops
from app.routers import agents

app_settings = get_settings()

app = FastAPI(title="CallIQ API", version="2.0.0")


def _init_schema():
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


@app.middleware("http")
async def enforce_client_type_scope(request, call_next):
    """Reject a client_id that belongs to the other Sales/Service view."""
    raw_id = request.query_params.get("client_id")
    client_type = request.query_params.get("client_type")
    if raw_id and client_type and str(raw_id).isdigit():
        db = SessionLocal()
        try:
            scope_where(db, int(raw_id), client_type)
        except Exception as exc:
            detail = getattr(exc, "detail", "Invalid client selection")
            return JSONResponse(status_code=400, content={"detail": detail})
        finally:
            db.close()
    return await call_next(request)


app.include_router(kpis.router)
app.include_router(conversation.router)
app.include_router(calls.router)
app.include_router(agents.router)
app.include_router(incidents.router)
app.include_router(alerts.router)
app.include_router(settings_router.router)
app.include_router(ai_prompts.router)
app.include_router(smartping.router)
app.include_router(ops.router)
app.include_router(auth.router)
app.include_router(client_overview.router)
app.include_router(client_overview.clients_router)
app.include_router(client_settings.router)
app.include_router(reports.router)

@app.on_event("startup")
def _startup():
    _init_schema()


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "CallIQ Backend"
    }