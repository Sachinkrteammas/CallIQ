from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.db.base import Base


class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, default="")
    email = Column(String(255), default="")
    is_active = Column(Boolean, default=True)

    dialer_ip = Column(String(128), default="")
    dialer_user = Column(String(128), default="")
    dialer_pass = Column(String(255), default="")
    db_host = Column(String(128), default="")
    db_user = Column(String(128), default="")
    db_pass = Column(String(255), default="")
    campaigns = Column(Text)
    ingroups = Column(Text)

    created_at = Column(DateTime)