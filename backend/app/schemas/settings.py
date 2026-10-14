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
    client_mrr: float = Field(default=0.0)
    client_criticality: str = Field(default='Medium')
    client_call_volume: int = Field(default=0)
    agent_allocation: int = Field(default=0)
    # NEW
    criticality_revenue_impact: int = Field(default=3, ge=1, le=5)
    criticality_customer_sensitivity: int = Field(default=3, ge=1, le=5)
    criticality_escalation_risk: int = Field(default=3, ge=1, le=5)
    criticality_sla_requirement: int = Field(default=3, ge=1, le=5)
    criticality_process_complexity: int = Field(default=3, ge=1, le=5)
    short_call_max: int = Field(default=120)
    medium_call_max: int = Field(default=600)


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
    client_mrr: float = 0.0
    client_criticality: str = 'Medium'
    client_call_volume: int = 0
    agent_allocation: int = 0
    # NEW
    criticality_revenue_impact: int = 3
    criticality_customer_sensitivity: int = 3
    criticality_escalation_risk: int = 3
    criticality_sla_requirement: int = 3
    criticality_process_complexity: int = 3
    short_call_max: int = 120
    medium_call_max: int = 600