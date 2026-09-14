from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.db.base import Base


class ClientPrompt(Base):
    __tablename__ = "ai_prompts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    client_id = Column(Integer, nullable=False, index=True)
    name = Column(String(255), default="")
    prompt = Column("prompt_text", Text)
    version = Column(String(64), default="v1.0")
    status = Column(String(32), default="Draft")
    created_at = Column(DateTime)
    updated_at = Column(DateTime)