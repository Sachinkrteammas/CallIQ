from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String

from app.db.base import Base


class CallAudit(Base):
    __tablename__ = "call_audits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    call_id = Column(String(255), ForeignKey("call_logs.call_id"), index=True)
    client_id = Column(Integer, nullable=False, index=True)
    agent_id = Column(String(128), index=True)
    audit_json = Column(JSON)
    total_score = Column(Integer)
    percentage = Column(Integer)
    ranking = Column(String(32))
    fatal_flag = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # ═══ SALES CATEGORIZATION ═══
    sale_category = Column(String(50), default="Unknown", index=True)
    invalid_reason = Column(String(255), nullable=True, index=True)
    crm_sale_done = Column(Boolean, default=False)
    customer_confirmation = Column(String(50), default="Not Confirmed")
    order_information = Column(String(50), default="Not Available")