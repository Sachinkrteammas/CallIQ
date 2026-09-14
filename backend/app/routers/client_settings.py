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
            ingroup_filter JSON
        )
    """))
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


def _settings_response(
    client_id: int,
    campaigns: List[str],
    ingroups: List[str],
    settings: Optional[Setting],
    agents_list: List[dict],
) -> dict:
    if settings:
        return {
            "client_id": client_id,
            "total": settings.total or 0,
            "audit_calls_per_agent": settings.audit_calls_per_agent or 0,
            "min_call_duration": settings.min_call_duration if settings.min_call_duration else 20,
            "max_call_duration": settings.max_call_duration if settings.max_call_duration else 3600,
            "agents": settings.agents or [a["username"] for a in agents_list],
            "campaign_filter": settings.campaign_filter if settings.campaign_filter is not None else campaigns,
            "ingroup_filter": settings.ingroup_filter if settings.ingroup_filter is not None else ingroups,
            "agent_details": agents_list,
            "is_default": False,
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
    if settings:
        for key, value in payload.model_dump().items():
            setattr(settings, key, value)
    else:
        settings = Setting(**payload.model_dump())
        db.add(settings)
    db.commit()
    db.refresh(settings)

    return _client_settings(db, client, db2, db3)