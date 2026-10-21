"""Reports and CSV export endpoints."""
import csv
import io
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/api/reports", tags=["reports"])


def _extract_sale_fields(audit_json, sale_category, invalid_reason):
    """Extract sale fields with fallback to audit_json."""
    j = audit_json or {}
    if isinstance(j, str):
        try:
            j = json.loads(j)
        except Exception:
            j = {}

    # Fallback from JSON if DB column is NULL
    sc = sale_category or j.get("sale_category") or "Unknown"
    ir = invalid_reason or j.get("invalid_reason")

    # Recompute from boolean logic if Unknown
    if sc == "Unknown":
        call_connected = bool(j.get("call_connected", False))
        purchase_discussed = bool(j.get("purchase_discussed", False))
        intent_validated = bool(j.get("intent_validated", False))
        confirmation_received = bool(j.get("confirmation_received", False))
        required_info_collected = bool(j.get("required_info_collected", False))
        order_after_confirmation = bool(j.get("order_after_confirmation", False))

        if not call_connected or not purchase_discussed:
            sc, ir = "Unknown", None
        elif (intent_validated and confirmation_received
              and required_info_collected and order_after_confirmation):
            sc, ir = "Genuine", None
        else:
            sc = "Invalid"
            if not confirmation_received:
                ir = "Not Confirmed"
            elif not required_info_collected or not order_after_confirmation:
                ir = "Without Information"
            elif not intent_validated:
                ir = "Forcefully Placed"
            else:
                ir = "Not Confirmed"

    return sc, ir


# ═══════════════════════════════════════════════════════════
# CLIENT-WISE EXPORT (fixed with fallback)
# ═══════════════════════════════════════════════════════════
@router.get("/client-wise/export")
def export_client_wise(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    client_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    where = ["1=1"]
    params = {}
    if from_date:
        where.append("ca.created_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("ca.created_at <= :to_date")
        params["to_date"] = to_date + " 23:59:59"
    wc = " AND ".join(where)

    try:
        rows = db.execute(text(f"""
            SELECT
                ca.client_id,
                c.name AS client_name,
                ca.total_score,
                ca.fatal_flag,
                ca.sale_category,
                ca.invalid_reason,
                ca.audit_json
            FROM call_audits ca
            LEFT JOIN clients c ON c.id = ca.client_id
            WHERE {wc}
        """), params).mappings().all()
    except Exception as e:
        print(f"[client-wise-export] failed: {e}")
        rows = []

    # Aggregate per client (with fallback logic)
    client_map = {}
    for r in rows:
        cid = r["client_id"]
        if cid not in client_map:
            client_map[cid] = {
                "client_id": cid,
                "client_name": r["client_name"] or f"Client {cid}",
                "total": 0, "score_sum": 0, "fatal": 0,
                "genuine": 0, "invalid": 0,
                "forcefully": 0, "not_confirmed": 0, "without_info": 0,
            }
        cm = client_map[cid]
        cm["total"] += 1
        cm["score_sum"] += float(r["total_score"] or 0)
        cm["fatal"] += int(r["fatal_flag"] or 0)

        sc, ir = _extract_sale_fields(r["audit_json"], r["sale_category"], r["invalid_reason"])
        if sc == "Genuine":
            cm["genuine"] += 1
        elif sc == "Invalid":
            cm["invalid"] += 1
        if ir == "Forcefully Placed":
            cm["forcefully"] += 1
        elif ir == "Not Confirmed":
            cm["not_confirmed"] += 1
        elif ir == "Without Information":
            cm["without_info"] += 1

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Client ID", "Client Name", "Total Audits", "Avg Score", "Fatal",
        "Genuine Sales", "Invalid Sales", "Forcefully Placed",
        "Not Confirmed", "Without Information",
        "Genuine %", "Invalid %",
    ])

    for cm in sorted(client_map.values(), key=lambda x: -x["total"]):
        total = cm["total"]
        genuine = cm["genuine"]
        invalid = cm["invalid"]
        avg = round(cm["score_sum"] / total, 1) if total else 0
        gen_pct = round((genuine / total) * 100, 2) if total else 0
        inv_pct = round((invalid / total) * 100, 2) if total else 0

        writer.writerow([
            cm["client_id"], cm["client_name"], total, avg, cm["fatal"],
            genuine, invalid, cm["forcefully"], cm["not_confirmed"], cm["without_info"],
            f"{gen_pct}%", f"{inv_pct}%",
        ])

    output.seek(0)
    filename = f"client_wise_{datetime.now().strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ═══════════════════════════════════════════════════════════
# AGENT-WISE EXPORT (FIXED with fallback)
# ═══════════════════════════════════════════════════════════
@router.get("/agent-wise/export")
def export_agent_wise(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    where = ["ca.agent_id IS NOT NULL"]
    params = {}
    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id
    if from_date:
        where.append("ca.created_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("ca.created_at <= :to_date")
        params["to_date"] = to_date + " 23:59:59"
    wc = " AND ".join(where)

    try:
        rows = db.execute(text(f"""
            SELECT
                ca.agent_id,
                ca.total_score,
                ca.fatal_flag,
                ca.sale_category,
                ca.invalid_reason,
                ca.audit_json
            FROM call_audits ca
            WHERE {wc}
        """), params).mappings().all()
    except Exception as e:
        print(f"[agent-wise-export] failed: {e}")
        rows = []

    # Aggregate per agent (with fallback logic)
    agent_map = {}
    for r in rows:
        aid = r["agent_id"]
        if aid not in agent_map:
            agent_map[aid] = {
                "agent_id": aid,
                "total": 0, "score_sum": 0, "fatal": 0,
                "genuine": 0, "invalid": 0,
                "forcefully": 0, "not_confirmed": 0, "without_info": 0,
            }
        am = agent_map[aid]
        am["total"] += 1
        am["score_sum"] += float(r["total_score"] or 0)
        am["fatal"] += int(r["fatal_flag"] or 0)

        sc, ir = _extract_sale_fields(r["audit_json"], r["sale_category"], r["invalid_reason"])
        if sc == "Genuine":
            am["genuine"] += 1
        elif sc == "Invalid":
            am["invalid"] += 1
        if ir == "Forcefully Placed":
            am["forcefully"] += 1
        elif ir == "Not Confirmed":
            am["not_confirmed"] += 1
        elif ir == "Without Information":
            am["without_info"] += 1

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Agent ID", "Total Audits", "Avg Score", "Fatal",
        "Genuine Sales", "Invalid Sales", "Forcefully Placed",
        "Not Confirmed", "Without Information",
        "Genuine %", "Invalid %",
    ])

    for am in sorted(agent_map.values(), key=lambda x: -x["total"]):
        total = am["total"]
        genuine = am["genuine"]
        invalid = am["invalid"]
        avg = round(am["score_sum"] / total, 1) if total else 0
        gen_pct = round((genuine / total) * 100, 2) if total else 0
        inv_pct = round((invalid / total) * 100, 2) if total else 0

        writer.writerow([
            am["agent_id"], total, avg, am["fatal"],
            genuine, invalid, am["forcefully"], am["not_confirmed"], am["without_info"],
            f"{gen_pct}%", f"{inv_pct}%",
        ])

    output.seek(0)
    filename = f"agent_wise_{datetime.now().strftime('%Y%m%d')}"
    if client_id:
        filename += f"_client_{client_id}"
    filename += ".csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ═══════════════════════════════════════════════════════════
# DETAILED AUDITS EXPORT (existing — unchanged)
# ═══════════════════════════════════════════════════════════
@router.get("/audits/export")
def export_audits(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    sale_category: Optional[str] = None,
    db: Session = Depends(get_db),
):
    where = ["1=1"]
    params = {}
    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id
    if from_date:
        where.append("ca.created_at >= :from_date")
        params["from_date"] = from_date
    if to_date:
        where.append("ca.created_at <= :to_date")
        params["to_date"] = to_date + " 23:59:59"
    if sale_category:
        where.append("ca.sale_category = :sale_category")
        params["sale_category"] = sale_category
    wc = " AND ".join(where)

    rows = db.execute(text(f"""
        SELECT ca.call_id, ca.client_id, ca.agent_id,
               ca.total_score, ca.percentage, ca.ranking, ca.fatal_flag,
               ca.sale_category, ca.invalid_reason, ca.crm_sale_done,
               ca.customer_confirmation, ca.order_information,
               ca.created_at, ca.audit_json
        FROM call_audits ca WHERE {wc}
        ORDER BY ca.created_at DESC
    """), params).mappings().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Call ID", "Client ID", "Agent ID", "Score", "Percentage",
        "Ranking", "Fatal", "Sale Category", "Invalid Reason",
        "CRM Sale Done", "Customer Confirmation", "Order Information",
        "Audit Date"
    ])
    for r in rows:
        sc, ir = _extract_sale_fields(r["audit_json"], r["sale_category"], r["invalid_reason"])
        writer.writerow([
            r["call_id"], r["client_id"], r["agent_id"],
            r["total_score"], r["percentage"], r["ranking"],
            "Yes" if r["fatal_flag"] else "No",
            sc, ir or "",
            "Yes" if r["crm_sale_done"] else "No",
            r["customer_confirmation"], r["order_information"],
            str(r["created_at"] or ""),
        ])

    output.seek(0)
    filename = f"audits_export_{datetime.now().strftime('%Y%m%d')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ═══════════════════════════════════════════════════════════
# MONTHLY AUDIT EXPORT (existing — unchanged)
# ═══════════════════════════════════════════════════════════
@router.get("/monthly-audit/export")
def export_monthly_audit(
    client_id: Optional[int] = None,
    year: Optional[int] = None,
    db: Session = Depends(get_db),
):
    if year is None:
        year = datetime.now().year

    where = ["YEAR(ca.created_at) = :year"]
    params = {"year": year}
    if client_id:
        where.append("ca.client_id = :client_id")
        params["client_id"] = client_id
    wc = " AND ".join(where)

    rows = db.execute(text(f"""
        SELECT MONTH(ca.created_at) AS m, COUNT(*) AS cnt,
               AVG(ca.total_score) AS avg_score,
               SUM(CASE WHEN ca.sale_category = 'Genuine' THEN 1 ELSE 0 END) AS genuine_count,
               SUM(CASE WHEN ca.sale_category = 'Invalid' THEN 1 ELSE 0 END) AS invalid_count
        FROM call_audits ca WHERE {wc}
        GROUP BY MONTH(ca.created_at) ORDER BY m
    """), params).mappings().all()

    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                   "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Month", "Audits", "Avg Score", "Genuine", "Invalid"])

    month_map = {r["m"]: r for r in rows}
    total = 0
    for m in range(1, 13):
        r = month_map.get(m)
        if r:
            writer.writerow([month_names[m - 1], r["cnt"],
                             round(float(r["avg_score"] or 0), 1),
                             r["genuine_count"], r["invalid_count"]])
            total += r["cnt"]
        else:
            writer.writerow([month_names[m - 1], 0, 0, 0, 0])
    writer.writerow([])
    writer.writerow(["TOTAL", total, "", "", ""])

    output.seek(0)
    filename = f"monthly_audit_{year}"
    if client_id:
        filename += f"_client_{client_id}"
    filename += ".csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )