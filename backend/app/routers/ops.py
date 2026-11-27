"""Operational trigger endpoints (Issue 6: live data pipeline).

Lets the portal trigger the fetch / STT / audit pipeline for a client
on demand so real calls are fetched, transcribed and audited end-to-end.
"""
from typing import List, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
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
    max_age_hours: int = Query(default=0, description="STT retry window; 0 disables the age limit"),
    reaudit: bool = Query(default=False),
    use_mock: bool = Query(default=False),
):
    """Trigger fetch → STT → audit for one client (or all when client_id is None)."""
    import fetch_worker
    import stt_worker
    import audit_worker

    requested = [s.strip().lower() for s in (stages or ["fetch", "stt", "audit"]) if s.strip()]
    results: dict = {
        "client_id": client_id,
        "stages": {},
        "errors": [],
        "params": {
            "limit": limit,
            "max_age_hours": max_age_hours,
            "reaudit": reaudit,
            "use_mock": use_mock,
        },
    }

    for stage in requested:
        try:
            if stage == "fetch":
                results["stages"]["fetch"] = fetch_worker.run_once(client_id=client_id, limit=limit)
            elif stage == "stt":
                results["stages"]["stt"] = stt_worker.run_once(
                    limit=limit,
                    client_id=client_id,
                    max_age_hours=max_age_hours,
                )
            elif stage == "audit":
                audited = audit_worker.run_once(
                    limit=limit,
                    client_id=client_id,
                    reaudit=reaudit,
                    use_mock=use_mock,
                )
                results["stages"]["audit"] = audited
                results["audit_stats"] = audit_worker.get_last_stats()
            else:
                results["errors"].append(f"unknown stage: {stage}")
        except Exception as exc:
            print(f"[ops] {stage} failed: {exc}")
            results["errors"].append(f"{stage}: {exc}")

    return results


@router.post("/iq-audit")
def run_iq_audit(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
):
    """Run IQ auditing on sample calls.

    Body:
      - call_ids: optional list of specific call IDs
      - client_id: optional client filter
      - limit: max calls (default 10, max 100)
      - reaudit: audit calls that already have an audit row
      - use_mock: use the deterministic evaluator when no LLM provider responds
    """
    import audit_worker

    call_ids = payload.get("call_ids") or None
    if call_ids and not isinstance(call_ids, list):
        raise HTTPException(status_code=422, detail="call_ids must be a list")
    client_id = payload.get("client_id")
    if client_id is not None:
        try:
            client_id = int(client_id)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="client_id must be an integer")

    try:
        limit = min(max(1, int(payload.get("limit") or 10)), 100)
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="limit must be an integer")

    audited = audit_worker.run_once(
        limit=limit,
        client_id=client_id,
        reaudit=bool(payload.get("reaudit")),
        call_ids=call_ids,
        use_mock=bool(payload.get("use_mock")),
    )
    stats = audit_worker.get_last_stats()
    return {
        "audited": audited,
        "call_ids": stats.get("audited_calls") or [],
        "skipped": stats.get("skipped") or 0,
        "skip_reasons": stats.get("skip_reasons") or {},
        "errors": stats.get("errors") or [],
    }
