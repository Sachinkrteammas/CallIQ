from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.db.base import Base


class CallLog(Base):
    __tablename__ = "call_logs"

    call_id = Column(String(255), primary_key=True)
    client_id = Column(Integer, nullable=False, index=True)
    agent_id = Column(String(128), index=True)
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    duration = Column(Integer)
    recording_path = Column(Text)
    transcript = Column(Text)
    voice_mail = Column(Boolean, default=False)
    created_at = Column(DateTime)