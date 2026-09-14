from sqlalchemy import Column, Float, Integer, JSON

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