"""Shared Sales/Service client scoping.

A client is Sales when `clients.ingroups` is empty, Service when it is not.
Every API that accepts `client_id` and `client_type` must agree: a Sales
client ID must never be used in a Service view, and vice versa.
"""
from typing import Optional, Tuple, List

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session


def normalize_client_type(value) -> Optional[str]:
    if not value:
        return None
    raw = str(value).strip().lower()
    if raw in ("sales", "sale"):
        return "sales"
    if raw in ("service", "services"):
        return "service"
    return None


def get_client_type(db: Session, client_id: int) -> Optional[str]:
    """Return 'sales' / 'service' for a client, or None when it does not exist."""
    row = db.execute(
        text("""
            SELECT CASE WHEN COALESCE(ingroups, '') = '' COLLATE utf8mb4_general_ci
                        THEN 'sales' ELSE 'service' END AS client_type
            FROM clients WHERE id = :id
        """),
        {"id": client_id},
    ).scalar()
    return normalize_client_type(row)


def scope_where(
    db: Session,
    client_id: Optional[int],
    client_type: Optional[str],
    alias: str = "ca",
) -> Tuple[List[str], dict, Optional[str]]:
    """Build WHERE fragments and params for a client/type selection.

    Returns (where_fragments, params, effective_type). `effective_type` is the
    type used by the caller to decide whether Sales-only columns belong in a
    report. Passing a client_id that conflicts with client_type is rejected.
    """
    requested = normalize_client_type(client_type)
    where: List[str] = []
    params: dict = {}

    if client_id:
        actual = get_client_type(db, client_id)
        if requested and actual and requested != actual:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Client {client_id} is a {actual.title()} client and cannot "
                    f"be used in a {requested.title()} view."
                ),
            )
        where.append(f"{alias}.client_id = :client_id")
        params["client_id"] = client_id
        return where, params, actual or requested

    if requested:
        op = "=" if requested == "sales" else "!="
        where.append(
            f"{alias}.client_id IN ("
            f"SELECT id FROM clients "
            f"WHERE COALESCE(ingroups, '') {op} '' COLLATE utf8mb4_general_ci"
            f")"
        )
    return where, params, requested
