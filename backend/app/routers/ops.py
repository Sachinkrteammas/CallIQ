"""Operational trigger endpoints (Issue 6: live data pipeline).

Lets the portal trigger the fetch / STT / audit pipeline for a client
on demand so real calls are fetched, transcribed and audited end-to-end.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/api/ops", tags=["ops"])


@router.get("/pipeline/status")
def pipeline_status(
    client_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    """Quick counts of calls and audited calls — the "live data" view."""
    where = "WHERE client_id = :client_id"
    params = {}
    if client_id is not None:
        params["client_id"] = client_id
    else:
        where = ""

    calls = db.execute(text(f"""
        SELECT COUNT(*) AS cnt, COALESCE(SUM(duration), 0) AS total_sec
        FROM call_logs {where}
    """), params).mappings().one()

    if client_id is not None:
        audited = db.execute(text("""
            SELECT COUNT(*) AS cnt,
                   COALESCE(AVG(ca.percentage), 0) AS avg_pct,
                   COUNT(DISTINCT ca.agent_id) AS agents,
                   COUNT(DISTINCT CASE WHEN ca.fatal_flag = 1 THEN ca.call_id END) AS fatal
            FROM call_audits ca
            JOIN call_logs cl ON cl.call_id = ca.call_id AND cl.client_id = :client_id
        """), {"client_id": client_id}).mappings().one()
    else:
        audited = db.execute(text("""
            SELECT COUNT(*) AS cnt,
                   COALESCE(AVG(percentage), 0) AS avg_pct,
                   COUNT(DISTINCT agent_id) AS agents,
                   COUNT(DISTINCT CASE WHEN fatal_flag = 1 THEN call_id END) AS fatal
            FROM call_audits
        """)).mappings().one()

    return {
        "calls": int(calls["cnt"] or 0),
        "total_duration_sec": int(calls["total_sec"] or 0),
        "audited_calls": int(audited["cnt"] or 0),
        "avg_percentage": round(float(audited["avg_pct"] or 0), 1),
        "agents": int(audited["agents"] or 0),
        "fatal_calls": int(audited["fatal"] or 0),
    }


@router.post("/pipeline/trigger")
def pipeline_trigger(
    client_id: Optional[int] = Query(default=None),
    stages: Optional[List[str]] = Query(default=None),
    limit: int = Query(default=50),
):
    """Trigger fetch → STT → audit for one client (or all when client_id is None)."""
    import fetch_worker
    import stt_worker
    import audit_worker

    requested = [s.strip().lower() for s in (stages or ["fetch", "stt", "audit"]) if s.strip()]
    results: dict = {"client_id": client_id, "stages": {}, "errors": []}

    for stage in requested:
        try:
            if stage == "fetch":
                results["stages"]["fetch"] = fetch_worker.run_once(client_id=client_id, limit=limit)
            elif stage == "stt":
                results["stages"]["stt"] = stt_worker.run_once(limit=limit, client_id=client_id)
            elif stage == "audit":
                results["stages"]["audit"] = audit_worker.run_once(limit=limit, client_id=client_id)
            else:
                results["errors"].append(f"unknown stage: {stage}")
        except Exception as exc:
            print(f"[ops] {stage} failed: {exc}")
            results["errors"].append(f"{stage}: {exc}")

    return results
