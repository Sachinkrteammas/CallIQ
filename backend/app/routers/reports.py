"""Reports and CSV export endpoints."""
import csv
import io
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db

router = APIRouter(prefix="/api/reports", tags=["reports"])


# ═══════════════════════════════════════════════════════════
# MONTHLY AUDIT EXPORT (existing)
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
            audits = r["cnt"]
            writer.writerow([month_names[m - 1], audits,
                             round(float(r["avg_score"] or 0), 1),
                             r["genuine_count"], r["invalid_count"]])
            total += audits
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


# ═══════════════════════════════════════════════════════════
# DETAILED AUDITS EXPORT (existing)
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
               ca.created_at
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
        writer.writerow([
            r["call_id"], r["client_id"], r["agent_id"],
            r["total_score"], r["percentage"], r["ranking"],
            "Yes" if r["fatal_flag"] else "No",
            r["sale_category"], r["invalid_reason"] or "",
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
# CLIENT-WISE SUMMARY EXPORT (NEW)
# ═══════════════════════════════════════════════════════════
@router.get("/client-wise/export")
def export_client_wise(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    client_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Export per-client summary:
    Client | Total Audits | Avg Score | Fatal | Genuine | Invalid |
    Forcefully Placed | Not Confirmed | Without Info
    """
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
                COUNT(*) AS total_audits,
                AVG(ca.total_score) AS avg_score,
                SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count,
                SUM(CASE WHEN ca.sale_category = 'Genuine' THEN 1 ELSE 0 END) AS genuine_count,
                SUM(CASE WHEN ca.sale_category = 'Invalid' THEN 1 ELSE 0 END) AS invalid_count,
                SUM(CASE WHEN ca.invalid_reason = 'Forcefully Placed' THEN 1 ELSE 0 END) AS forcefully_placed,
                SUM(CASE WHEN ca.invalid_reason = 'Not Confirmed' THEN 1 ELSE 0 END) AS not_confirmed,
                SUM(CASE WHEN ca.invalid_reason = 'Without Information' THEN 1 ELSE 0 END) AS without_info
            FROM call_audits ca
            LEFT JOIN clients c ON c.id = ca.client_id
            WHERE {wc}
            GROUP BY ca.client_id, c.name
            ORDER BY total_audits DESC
        """), params).mappings().all()
    except Exception as e:
        print(f"[client-wise-export] failed: {e}")
        rows = []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Client ID", "Client Name", "Total Audits", "Avg Score", "Fatal",
        "Genuine Sales", "Invalid Sales", "Forcefully Placed",
        "Not Confirmed", "Without Information",
        "Genuine %", "Invalid %",
    ])

    for r in rows:
        total = int(r["total_audits"] or 0)
        genuine = int(r["genuine_count"] or 0)
        invalid = int(r["invalid_count"] or 0)
        genuine_pct = round((genuine / total) * 100, 1) if total else 0
        invalid_pct = round((invalid / total) * 100, 1) if total else 0

        writer.writerow([
            r["client_id"],
            r["client_name"] or f"Client {r['client_id']}",
            total,
            round(float(r["avg_score"] or 0), 1),
            int(r["fatal_count"] or 0),
            genuine,
            invalid,
            int(r["forcefully_placed"] or 0),
            int(r["not_confirmed"] or 0),
            int(r["without_info"] or 0),
            f"{genuine_pct}%",
            f"{invalid_pct}%",
        ])

    output.seek(0)
    filename = f"client_wise_summary_{datetime.now().strftime('%Y%m%d')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ═══════════════════════════════════════════════════════════
# AGENT-WISE SUMMARY EXPORT (NEW)
# ═══════════════════════════════════════════════════════════
@router.get("/agent-wise/export")
def export_agent_wise(
    client_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """
    Export per-agent summary:
    Agent | Total Audits | Avg Score | Fatal | Genuine | Invalid |
    Forcefully Placed | Not Confirmed | Without Info
    """
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
                COUNT(*) AS total_audits,
                AVG(ca.total_score) AS avg_score,
                SUM(CASE WHEN ca.fatal_flag = 1 THEN 1 ELSE 0 END) AS fatal_count,
                SUM(CASE WHEN ca.sale_category = 'Genuine' THEN 1 ELSE 0 END) AS genuine_count,
                SUM(CASE WHEN ca.sale_category = 'Invalid' THEN 1 ELSE 0 END) AS invalid_count,
                SUM(CASE WHEN ca.invalid_reason = 'Forcefully Placed' THEN 1 ELSE 0 END) AS forcefully_placed,
                SUM(CASE WHEN ca.invalid_reason = 'Not Confirmed' THEN 1 ELSE 0 END) AS not_confirmed,
                SUM(CASE WHEN ca.invalid_reason = 'Without Information' THEN 1 ELSE 0 END) AS without_info
            FROM call_audits ca
            WHERE {wc}
            GROUP BY ca.agent_id
            ORDER BY avg_score DESC
        """), params).mappings().all()
    except Exception as e:
        print(f"[agent-wise-export] failed: {e}")
        rows = []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Agent ID", "Total Audits", "Avg Score", "Fatal",
        "Genuine Sales", "Invalid Sales", "Forcefully Placed",
        "Not Confirmed", "Without Information",
        "Genuine %", "Invalid %",
    ])

    for r in rows:
        total = int(r["total_audits"] or 0)
        genuine = int(r["genuine_count"] or 0)
        invalid = int(r["invalid_count"] or 0)
        genuine_pct = round((genuine / total) * 100, 1) if total else 0
        invalid_pct = round((invalid / total) * 100, 1) if total else 0

        writer.writerow([
            r["agent_id"],
            total,
            round(float(r["avg_score"] or 0), 1),
            int(r["fatal_count"] or 0),
            genuine,
            invalid,
            int(r["forcefully_placed"] or 0),
            int(r["not_confirmed"] or 0),
            int(r["without_info"] or 0),
            f"{genuine_pct}%",
            f"{invalid_pct}%",
        ])

    output.seek(0)
    filename = f"agent_wise_summary_{datetime.now().strftime('%Y%m%d')}"
    if client_id:
        filename += f"_client_{client_id}"
    filename += ".csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )