from typing import List

from pydantic import BaseModel, Field


class SettingsUpsert(BaseModel):
    client_id: int
    total: int = Field(default=0)
    min_call_duration: int = Field(default=20)
    max_call_duration: int = Field(default=3600)
    audit_calls_per_agent: int = Field(default=0)
    agents: List[str] = Field(default_factory=list)
    campaign_filter: List[str] = Field(default_factory=list)
    ingroup_filter: List[str] = Field(default_factory=list)


class SettingsOut(BaseModel):
    client_id: int
    total: int = 0
    min_call_duration: int = 20
    max_call_duration: int = 3600
    audit_calls_per_agent: int = 0
    agents: List[str] = Field(default_factory=list)
    campaign_filter: List[str] = Field(default_factory=list)
    ingroup_filter: List[str] = Field(default_factory=list)
    agent_details: List[dict] = Field(default_factory=list)
    is_default: bool = False