from typing import Optional
from fastapi import APIRouter, Query, HTTPException, Depends
from sqlalchemy import text, or_
from sqlalchemy.orm import Session

from app.database import get_db
from .. import data  # Keep mock as fallback for dev

router = APIRouter(prefix="/api/calls", tags=["calls"])


def _db_row_to_call(row) -> dict:
    """Convert DB row (call_logs + call_audits join) to API response dict."""
    audit_json = row.get("audit_json") or {}
    if isinstance(audit_json, str):
        import json
        try:
            audit_json = json.loads(audit_json)
        except Exception:
            audit_json = {}
    
    return {
        "_call_id": row.get("call_id"),
        "_id": row.get("call_id"),
        "_agent_id": row.get("agent_id"),
        "_agent_name": row.get("agent_id"),  # Can join agent_master if needed
        "_duration": row.get("duration") or 0,
        "_created_at": str(row.get("created_at") or ""),
        "total_score": row.get("total_score") or 0,
        "percentage": row.get("percentage") or 0,
        "ranking": row.get("ranking") or "—",
        "fatal_flag": row.get("fatal_flag") or False,
        "call_category": audit_json.get("call_category") or "—",
        "sections": audit_json.get("sections") or {},
        # NEW: Sales Categorization (from call_audits table)
        "sale_category": row.get("sale_category") or "Unknown",
        "invalid_reason": row.get("invalid_reason"),
        "crm_sale_done": row.get("crm_sale_done") or False,
        "customer_confirmation": row.get("customer_confirmation") or "Not Confirmed",
        "order_information": row.get("order_information") or "Not Available",
    }


@router.get("")
def list_calls(
    q: Optional[str] = None,
    team: Optional[str] = None,
    project: Optional[str] = None,
    queue: Optional[str] = None,
    agent_id: Optional[str] = None,
    severity: Optional[str] = None,
    critical_only: bool = False,
    escalated_only: bool = False,
    dead_air_only: bool = False,
    tag: Optional[str] = None,
    sale_category: Optional[str] = None,
    invalid_reason: Optional[str] = None,
    crm_sale_done: Optional[bool] = None,
    customer_confirmation: Optional[str] = None,
    order_information: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 15,
    db: Session = Depends(get_db),
):
    # Build SQL with filters
    where = ["1=1"]
    params = {}
    
    if q:
        where.append("(cl.call_id LIKE :q OR cl.agent_id LIKE :q)")
        params["q"] = f"%{q}%"
    if agent_id:
        where.append("cl.agent_id = :agent_id")
        params["agent_id"] = agent_id
    if from_date:
        where.append("cl.created_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("cl.created_at <= :to_date")
        params["to_date"] = to_date + " 23:59:59"
    if sale_category:
        where.append("ca.sale_category = :sale_category")
        params["sale_category"] = sale_category
    if invalid_reason:
        where.append("ca.invalid_reason = :invalid_reason")
        params["invalid_reason"] = invalid_reason
    if crm_sale_done is not None:
        where.append("ca.crm_sale_done = :crm_sale_done")
        params["crm_sale_done"] = crm_sale_done
    if customer_confirmation:
        where.append("ca.customer_confirmation = :customer_confirmation")
        params["customer_confirmation"] = customer_confirmation
    if order_information:
        where.append("ca.order_information = :order_information")
        params["order_information"] = order_information

    where_clause = " AND ".join(where)
    
    # Count total
    count_sql = text(f"""
        SELECT COUNT(*) AS cnt
        FROM call_logs cl
        LEFT JOIN call_audits ca ON ca.call_id = cl.call_id
        WHERE {where_clause}
    """)
    total = db.execute(count_sql, params).scalar() or 0

    # Fetch page
    offset = (page - 1) * page_size
    params["limit"] = page_size
    params["offset"] = offset
    
    data_sql = text(f"""
        SELECT cl.call_id, cl.agent_id, cl.duration, cl.created_at,
               ca.total_score, ca.percentage, ca.ranking, ca.fatal_flag, ca.audit_json,
               ca.sale_category, ca.invalid_reason, ca.crm_sale_done,
               ca.customer_confirmation, ca.order_information
        FROM call_logs cl
        LEFT JOIN call_audits ca ON ca.call_id = cl.call_id
        WHERE {where_clause}
        ORDER BY cl.created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    rows = db.execute(data_sql, params).mappings().all()
    
    # If DB empty, fallback to mock for dev
    if total == 0 and not any([q, sale_category, invalid_reason, crm_sale_done]):
        print("[calls] DB empty — falling back to mock data.CALLS")
        return _mock_list_calls(
            q, team, project, queue, agent_id, severity, critical_only,
            escalated_only, dead_air_only, tag, sale_category, invalid_reason,
            crm_sale_done, customer_confirmation, order_information,
            page, page_size
        )
    
    items = [_db_row_to_call(dict(r)) for r in rows]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def _mock_list_calls(q, team, project, queue, agent_id, severity, critical_only,
                     escalated_only, dead_air_only, tag, sale_category, invalid_reason,
                     crm_sale_done, customer_confirmation, order_information,
                     page, page_size):
    """Fallback: old mock behavior."""
    results = data.CALLS
    if q:
        ql = q.lower()
        results = [c for c in results if ql in c["id"].lower() or ql in c["agent_name"].lower()]
    if agent_id:
        results = [c for c in results if c["agent_id"] == agent_id]
    total = len(results)
    start = (page - 1) * page_size
    page_items = results[start:start + page_size]
    # Normalize for frontend
    normalized = [{
        "_call_id": c["id"], "_id": c["id"],
        "_agent_id": c["agent_id"], "_agent_name": c["agent_name"],
        "_duration": c.get("duration_sec") or 0,
        "_created_at": c.get("date", ""),
        "total_score": c.get("score") or 0,
        "percentage": c.get("score") or 0,
        "ranking": "—", "fatal_flag": c.get("critical", False),
        "call_category": "—", "sections": {},
        "sale_category": c.get("sale_category", "Unknown"),
        "invalid_reason": c.get("invalid_reason"),
        "crm_sale_done": c.get("crm_sale_done", False),
        "customer_confirmation": c.get("customer_confirmation", "Not Confirmed"),
        "order_information": c.get("order_information", "Not Available"),
    } for c in page_items]
    return {"items": normalized, "total": total, "page": page, "page_size": page_size}


@router.get("/{call_id}")
def get_call(call_id: str, db: Session = Depends(get_db)):
    row = db.execute(
        text("""
            SELECT cl.call_id, cl.agent_id, cl.duration, cl.created_at, cl.transcript,
                   ca.total_score, ca.percentage, ca.ranking, ca.fatal_flag, ca.audit_json,
                   ca.sale_category, ca.invalid_reason, ca.crm_sale_done,
                   ca.customer_confirmation, ca.order_information
            FROM call_logs cl
            LEFT JOIN call_audits ca ON ca.call_id = cl.call_id
            WHERE cl.call_id = :cid
        """),
        {"cid": call_id},
    ).mappings().one_or_none()
    
    if not row:
        # Fallback to mock
        call = next((c for c in data.CALLS if c["id"] == call_id), None)
        if not call:
            raise HTTPException(status_code=404, detail="Call not found")
        return _build_mock_detail(call)
    
    audit_json = row.get("audit_json") or {}
    if isinstance(audit_json, str):
        import json
        try:
            audit_json = json.loads(audit_json)
        except Exception:
            audit_json = {}
    
    return {
        **_db_row_to_call(dict(row)),
        "transcript": row.get("transcript") or "",
        "timeline": audit_json.get("timeline", []),
        "scores": audit_json.get("scores", {}),
        "behaviours": audit_json.get("behaviours_detected", []),
        "emotion_journey": audit_json.get("emotion_journey", []),
        "summary": audit_json.get("summary", ""),
        "recommendations": audit_json.get("recommendations", []),
        "areas_for_improvement": audit_json.get("areas_for_improvement", []),
    }


def _build_mock_detail(call):
    import random
    random.seed(hash(call["id"]) % (2**31))
    return {
        **call,
        "timeline": [{"time": t, "label": l, "level": lv} for t, l, lv in data.TIMELINE_TEMPLATE],
        "transcript": [],
        "scores": {"overall": call.get("conversation_score", 0)},
        "behaviours": [],
        "emotion_journey": [],
    }