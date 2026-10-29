from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal2, SessionLocal3, get_db
from app.models.client import Client
from app.models.settings import Setting
from app.routers.auth import get_current_user
from app.schemas.settings import SettingsOut, SettingsUpsert

router = APIRouter(prefix="/api/client-settings", tags=["client-settings"])


def _ensure_table(db: Session):
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS client_settings (
            client_id INT PRIMARY KEY,
            total INT DEFAULT 0,
            min_call_duration INT DEFAULT 20,
            max_call_duration INT DEFAULT 3600,
            audit_calls_per_agent INT DEFAULT 0,
            agents JSON,
            campaign_filter JSON,
            ingroup_filter JSON,
            client_mrr FLOAT DEFAULT 0,
            client_criticality VARCHAR(50) DEFAULT 'Medium',
            client_call_volume INT DEFAULT 0,
            agent_allocation INT DEFAULT 0,
            criticality_revenue_impact INT DEFAULT 3,
            criticality_customer_sensitivity INT DEFAULT 3,
            criticality_escalation_risk INT DEFAULT 3,
            criticality_sla_requirement INT DEFAULT 3,
            criticality_process_complexity INT DEFAULT 3,
            short_call_max INT DEFAULT 120,
            medium_call_max INT DEFAULT 600,
            enable_sales_category_filter TINYINT(1) DEFAULT 0,
            sales_interested_values JSON,
            sales_not_interested_values JSON
        )
    """))
    # Safe migrations
    for col, dtype in [
        ("client_mrr", "FLOAT DEFAULT 0"),
        ("client_criticality", "VARCHAR(50) DEFAULT 'Medium'"),
        ("client_call_volume", "INT DEFAULT 0"),
        ("agent_allocation", "INT DEFAULT 0"),
        ("criticality_revenue_impact", "INT DEFAULT 3"),
        ("criticality_customer_sensitivity", "INT DEFAULT 3"),
        ("criticality_escalation_risk", "INT DEFAULT 3"),
        ("criticality_sla_requirement", "INT DEFAULT 3"),
        ("criticality_process_complexity", "INT DEFAULT 3"),
        ("short_call_max", "INT DEFAULT 120"),
        ("medium_call_max", "INT DEFAULT 600"),
        ("enable_sales_category_filter", "TINYINT(1) DEFAULT 0"),
        ("sales_interested_values", "JSON"),
        ("sales_not_interested_values", "JSON"),
        ("audit_mode", "VARCHAR(20) DEFAULT 'monthly'"),
        ("monthly_target", "INT DEFAULT 30"),
        ("monthly_max", "INT DEFAULT 60"),
        ("daily_target", "INT DEFAULT 1"),
        ("daily_max", "INT DEFAULT 3"),
        ("short_call_count", "INT DEFAULT 5"),
        ("medium_call_count", "INT DEFAULT 15"),
        ("long_call_count", "INT DEFAULT 10"),
    ]:
        try:
            db.execute(text(f"ALTER TABLE client_settings ADD COLUMN {col} {dtype}"))
        except Exception:
            pass
    db.commit()


def _db2_or_none():
    if SessionLocal2 is None:
        yield None
        return
    db = SessionLocal2()
    try:
        yield db
    finally:
        db.close()


def _db3_or_none():
    if SessionLocal3 is None:
        yield None
        return
    db = SessionLocal3()
    try:
        yield db
    finally:
        db.close()


def _split_csv(raw: Optional[str]) -> List[str]:
    return [v.strip() for v in (raw or "").split(",") if v.strip()]


def _build_agent_details(client: Client, db2: Optional[Session], db3: Optional[Session]) -> List[dict]:
    campaigns = _split_csv(client.campaigns)
    ingroups = _split_csv(client.ingroups)

    all_users: set[str] = set()

    if db3 is not None:
        filters = ingroups if ingroups else campaigns
        for f in filters:
            rows = db3.execute(
                text("SELECT user FROM vicidial_users WHERE closer_campaigns LIKE :val"),
                {"val": f"%{f}%"},
            ).mappings().all()
            for r in rows:
                if r["user"]:
                    all_users.add(r["user"].strip())

    agents_list: List[dict] = []
    if db2 is None or SessionLocal3 is None:
        return agents_list

    if not ingroups and db3 is not None:
        vicidial_rows = db3.execute(
            text("SELECT user FROM vicidial_users WHERE user_group = 'Dialdesk'")
        ).mappings().all()
        dialdesk_users = [r["user"].strip() for r in vicidial_rows if r["user"]]
        usernames = dialdesk_users
    else:
        usernames = list(all_users)

    if usernames:
        placeholders = ",".join([f":u{i}" for i in range(len(usernames))])
        rows = db2.execute(
            text(f"""
                SELECT username, displayname
                FROM agent_master
                WHERE username IN ({placeholders})
                  AND status = 'A'
            """),
            {f"u{i}": user for i, user in enumerate(usernames)},
        ).mappings().all()
        agents_list = [
            {"username": r["username"], "displayname": r["displayname"]}
            for r in rows
        ]

    return agents_list


def _auto_criticality(settings: Setting) -> str:
    """Compute criticality from 5 sub-parameters (avg score)."""
    scores = [
        settings.criticality_revenue_impact or 3,
        settings.criticality_customer_sensitivity or 3,
        settings.criticality_escalation_risk or 3,
        settings.criticality_sla_requirement or 3,
        settings.criticality_process_complexity or 3,
    ]
    avg = sum(scores) / len(scores)
    if avg >= 4.2:
        return "High"
    if avg >= 2.8:
        return "Medium"
    return "Low"


def _calculate_total(settings: Setting, selected_agents: List[str]) -> int:
    """Total = agent_allocation * per_agent (priority), else selected_agents * per_agent."""
    per_agent = settings.audit_calls_per_agent or 0
    alloc = settings.agent_allocation or 0
    if alloc > 0:
        return alloc * per_agent
    return len(selected_agents) * per_agent


def _settings_response(
    client_id: int,
    campaigns: List[str],
    ingroups: List[str],
    settings: Optional[Setting],
    agents_list: List[dict],
) -> dict:
    if settings:
        selected_agents = settings.agents or [a["username"] for a in agents_list]
        total = _calculate_total(settings, selected_agents)
        sales_interested = getattr(settings, "sales_interested_values", None) or []
        sales_not_interested = getattr(settings, "sales_not_interested_values", None) or []
        if isinstance(sales_interested, str):
            try:
                import json

                sales_interested = json.loads(sales_interested)
            except Exception:
                sales_interested = []
        if isinstance(sales_not_interested, str):
            try:
                import json

                sales_not_interested = json.loads(sales_not_interested)
            except Exception:
                sales_not_interested = []
        return {
            "client_id": client_id,
            "total": total,
            "audit_calls_per_agent": settings.audit_calls_per_agent or 0,
            "min_call_duration": settings.min_call_duration or 20,
            "max_call_duration": settings.max_call_duration or 3600,
            "agents": selected_agents,
            "campaign_filter": settings.campaign_filter if settings.campaign_filter is not None else campaigns,
            "ingroup_filter": settings.ingroup_filter if settings.ingroup_filter is not None else ingroups,
            "agent_details": agents_list,
            "is_default": False,
            "client_mrr": settings.client_mrr or 0.0,
            "client_criticality": settings.client_criticality or _auto_criticality(settings),
            "client_call_volume": settings.client_call_volume or 0,
            "agent_allocation": settings.agent_allocation or 0,
            "criticality_revenue_impact": settings.criticality_revenue_impact or 3,
            "criticality_customer_sensitivity": settings.criticality_customer_sensitivity or 3,
            "criticality_escalation_risk": settings.criticality_escalation_risk or 3,
            "criticality_sla_requirement": settings.criticality_sla_requirement or 3,
            "criticality_process_complexity": settings.criticality_process_complexity or 3,
            "short_call_max": settings.short_call_max or 120,
            "medium_call_max": settings.medium_call_max or 600,
            "enable_sales_category_filter": int(getattr(settings, "enable_sales_category_filter", 0) or 0),
            "sales_interested_values": sales_interested or [],
            "sales_not_interested_values": sales_not_interested or [],
        }

    return {
        "client_id": client_id,
        "total": 0,
        "audit_calls_per_agent": 0,
        "min_call_duration": 20,
        "max_call_duration": 3600,
        "agents": [a["username"] for a in agents_list],
        "campaign_filter": campaigns,
        "ingroup_filter": ingroups,
        "agent_details": agents_list,
        "is_default": True,
        "client_mrr": 0.0,
        "client_criticality": 'Medium',
        "client_call_volume": 0,
        "agent_allocation": 0,
        "criticality_revenue_impact": 3,
        "criticality_customer_sensitivity": 3,
        "criticality_escalation_risk": 3,
        "criticality_sla_requirement": 3,
        "criticality_process_complexity": 3,
        "short_call_max": 120,
        "medium_call_max": 600,
        "enable_sales_category_filter": 0,
        "sales_interested_values": [],
        "sales_not_interested_values": [],
    }


def _client_settings(
    db: Session,
    client: Client,
    db2: Optional[Session],
    db3: Optional[Session],
) -> dict:
    campaigns = _split_csv(client.campaigns)
    ingroups = _split_csv(client.ingroups)
    settings = db.query(Setting).filter(Setting.client_id == client.id).first()
    agents_list = _build_agent_details(client, db2, db3)
    return _settings_response(client.id, campaigns, ingroups, settings, agents_list)


@router.get("/{client_id}", response_model=SettingsOut)
def get_client_settings(
    client_id: int,
    db: Session = Depends(get_db),
    db2: Optional[Session] = Depends(_db2_or_none),
    db3: Optional[Session] = Depends(_db3_or_none),
    _: dict = Depends(get_current_user),
):
    _ensure_table(db)
    client = db.query(Client).filter(Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return _client_settings(db, client, db2, db3)


@router.post("", response_model=SettingsOut)
def upsert_client_settings(
    payload: SettingsUpsert,
    db: Session = Depends(get_db),
    db2: Optional[Session] = Depends(_db2_or_none),
    db3: Optional[Session] = Depends(_db3_or_none),
    _: dict = Depends(get_current_user),
):
    _ensure_table(db)
    client = db.query(Client).filter(Client.id == payload.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    settings = db.query(Setting).filter(Setting.client_id == payload.client_id).first()
    data = payload.model_dump()
    if settings:
        for key, value in data.items():
            if hasattr(settings, key):
                setattr(settings, key, value)
        # Auto-compute criticality
        settings.client_criticality = _auto_criticality(settings)
    else:
        settings = Setting(**data)
        settings.client_criticality = _auto_criticality(settings)
        db.add(settings)
    db.commit()
    db.refresh(settings)
    return _client_settings(db, client, db2, db3)