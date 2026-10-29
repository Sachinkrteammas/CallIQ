from sqlalchemy import Column, Float, Integer, JSON, String

from app.db.base import Base


class Setting(Base):
    __tablename__ = "client_settings"

    client_id = Column(Integer, primary_key=True)
    total = Column(Integer)
    min_call_duration = Column(Integer)
    max_call_duration = Column(Integer)
    agents = Column(JSON)
    campaign_filter = Column(JSON)
    ingroup_filter = Column(JSON)
    audit_calls_per_agent = Column(Integer)
    
    # CLIENT-WISE AUDIT ALLOCATION
    client_mrr = Column(Float, default=0.0)
    client_criticality = Column(String(50), default='Medium')
    client_call_volume = Column(Integer, default=0)
    agent_allocation = Column(Integer, default=0)
    
    # NEW: Criticality sub-parameters (1-5 scale)
    criticality_revenue_impact = Column(Integer, default=3)
    criticality_customer_sensitivity = Column(Integer, default=3)
    criticality_escalation_risk = Column(Integer, default=3)
    criticality_sla_requirement = Column(Integer, default=3)
    criticality_process_complexity = Column(Integer, default=3)
    
    # NEW: Call duration-wise classification thresholds (seconds)
    short_call_max = Column(Integer, default=120)      # <= 2 min = Short
    medium_call_max = Column(Integer, default=600)     # 2-10 min = Medium
    # > medium_call_max = Long

    # Sales category settings
    enable_sales_category_filter = Column(Integer, default=0)
    sales_interested_values = Column(JSON)
    sales_not_interested_values = Column(JSON)

    monthly_target = Column(Integer, default=30)
    monthly_max = Column(Integer, default=60)    # ← NEW
    daily_target = Column(Integer, default=1)
    daily_max = Column(Integer, default=3)       # ← NEW