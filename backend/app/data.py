"""
In-memory mock data store for CallIQ.
Everything lives in module-level lists/dicts so the FastAPI app behaves like a
tiny stateful backend (status changes, assignments, toggles persist while the
server process is running). Restarting the server resets the data.
"""
import random
from datetime import datetime, timedelta

random.seed(42)

TEAMS = ["Technical Support", "Billing", "Retention", "Sales", "Onboarding"]
PROJECTS = ["Acme Telecom", "Northwind Bank", "Zenith Health", "Orbit Retail"]
QUEUES = ["Inbound-L1", "Inbound-L2", "Outbound-Sales", "VIP-Support", "Escalations"]
LANGUAGES = ["English", "Hindi", "Spanish", "French"]
DISPOSITIONS = ["Resolved", "Follow-up Required", "Escalated", "Unresolved", "Callback Scheduled"]

FIRST_NAMES = ["Aarav", "Priya", "Rohan", "Ishita", "Kabir", "Meera", "Sara", "Daniel",
               "Alex", "Nina", "Liam", "Zoya", "Omar", "Grace", "Ethan", "Tara"]
LAST_NAMES = ["Sharma", "Verma", "Khan", "Patel", "Nair", "Reddy", "Fernandes", "Gupta",
              "Cohen", "Silva", "Martins", "Rossi", "Chen", "Iyer", "Bose", "Kapoor"]

AGENT_COUNT = 24


def _name(i):
    random.seed(1000 + i)
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


AGENTS = []
for i in range(AGENT_COUNT):
    random.seed(2000 + i)
    AGENTS.append({
        "id": f"AG{60700 + i}",
        "name": _name(i),
        "team": TEAMS[i % len(TEAMS)],
        "avatar_seed": i,
        "tenure_months": random.randint(2, 60),
        "conversation_score": round(random.uniform(58, 96), 1),
        "sentiment_score": round(random.uniform(50, 95), 1),
        "professionalism": round(random.uniform(60, 98), 1),
        "compliance": round(random.uniform(55, 99), 1),
        "avg_score": round(random.uniform(60, 95), 1),
        "calls_audited": random.randint(80, 420),
        "coaching_assigned": random.randint(0, 4),
        "risk": random.choices(["Low", "Medium", "High", "Critical"], weights=[45, 30, 18, 7])[0],
        "trend": round(random.uniform(-9, 9), 1),
    })

SEVERITIES = ["Low", "Medium", "High", "Critical"]
BEHAVIOURS = ["Dead Air", "Long Hold", "Abuse", "Compliance", "Interruptions",
              "Script Deviation", "High Emotion", "Missed Greeting", "Missed Closing"]

TIMELINE_TEMPLATE = [
    ("0:00", "Greeting", "info"),
    ("0:45", "Customer Issue", "info"),
    ("2:15", "Dead Air", "amber"),
    ("2:45", "Hold", "amber"),
    ("4:10", "Customer Angry", "red"),
    ("6:12", "Abusive Language", "red"),
    ("7:05", "Escalation", "red"),
    ("8:15", "Resolution", "green"),
]

TRANSCRIPT_LINES = [
    ("agent", "Thank you for calling support, this is {agent}, how can I help you today?"),
    ("customer", "Yeah I've been trying to get my refund for two weeks now, nobody is helping me."),
    ("agent", "I completely understand the frustration, let me pull up your account."),
    ("customer", "This is ridiculous, I've called three times already."),
    ("agent", "I'm really sorry about that. Give me just a moment to check the status."),
    ("customer", "You people don't understand anything, just give me my money back."),
    ("agent", "I hear you, and I want to resolve this today. I can see the refund was delayed."),
    ("customer", "This is unacceptable, I want to speak to your manager right now."),
    ("agent", "Of course, let me escalate this call for you immediately."),
    ("agent", "I've processed the escalation and a manager will call you within the hour."),
]

CALL_COUNT = 140
CALLS = []
now = datetime.now()
for i in range(CALL_COUNT):
    random.seed(3000 + i)
    agent = random.choice(AGENTS)
    duration = random.randint(180, 900)
    critical = random.random() < 0.12
    escalated = critical or random.random() < 0.15
    sentiment = random.choice(["Positive", "Neutral", "Negative"])
    call = {
        "id": f"CL{100000 + i}",
        "agent_id": agent["id"],
        "agent_name": agent["name"],
        "team": agent["team"],
        "customer": f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)[0]}.",
        "phone": f"+91-{random.randint(70000,99999)}{random.randint(10000,99999)}",
        "project": random.choice(PROJECTS),
        "queue": random.choice(QUEUES),
        "language": random.choice(LANGUAGES),
        "disposition": random.choice(DISPOSITIONS),
        "date": (now - timedelta(days=random.randint(0, 29), hours=random.randint(0, 23))).isoformat(),
        "duration_sec": duration,
        "score": round(random.uniform(40, 99), 1),
        "conversation_score": round(random.uniform(40, 99), 1),
        "sentiment": sentiment,
        "customer_sentiment": sentiment,
        "agent_sentiment": random.choice(["Positive", "Neutral", "Negative"]),
        "compliance_score": round(random.uniform(40, 100), 1),
        "risk": random.choices(SEVERITIES, weights=[50, 25, 17, 8])[0],
        "escalated": escalated,
        "critical": critical,
        "dead_air_pct": round(random.uniform(0, 22), 1),
        "hold_time_sec": random.randint(0, 240),
        "interruptions": random.randint(0, 9),
        "abusive": critical and random.random() < 0.5,
        "silent": random.random() < 0.04,
        "compliance_violation": critical and random.random() < 0.6,
    }
    CALLS.append(call)

# ---- Incidents derived from risky calls ----
INCIDENT_TYPES = ["Agent Abused Customer", "Customer Threatened Agent", "Fraud Mention",
                   "Data Leakage", "PII Shared", "Compliance Failure", "Fake Promise",
                   "Mis-selling", "Legal Risk", "Policy Violation"]
STATUSES = ["Open", "Acknowledged", "Resolved"]

INCIDENTS = []
inc_i = 0
for c in CALLS:
    if c["risk"] in ("High", "Critical"):
        random.seed(4000 + inc_i)
        inc_i += 1
        sev = "Critical" if c["risk"] == "Critical" else random.choice(["Major", "Minor"])
        INCIDENTS.append({
            "id": f"INC{5000 + inc_i}",
            "call_id": c["id"],
            "agent_id": c["agent_id"],
            "agent_name": c["agent_name"],
            "customer": c["customer"],
            "project": c["project"],
            "queue": c["queue"],
            "incident_type": random.choice(INCIDENT_TYPES),
            "severity": sev,
            "timestamp": c["date"],
            "status": random.choice(STATUSES),
            "assigned_to": random.choice(AGENTS)["name"] if random.random() < 0.5 else None,
        })

FATAL_RULES = [
    {"id": "fr1", "name": "Agent Abused Customer", "enabled": True, "severity": "Critical", "escalation_level": "Immediate"},
    {"id": "fr2", "name": "Customer Threatened Agent", "enabled": True, "severity": "Critical", "escalation_level": "Immediate"},
    {"id": "fr3", "name": "Fraud Mention", "enabled": True, "severity": "Critical", "escalation_level": "Immediate"},
    {"id": "fr4", "name": "Data Leakage", "enabled": True, "severity": "Critical", "escalation_level": "Immediate"},
    {"id": "fr5", "name": "PII Shared", "enabled": True, "severity": "High", "escalation_level": "1 Hour"},
    {"id": "fr6", "name": "Compliance Failure", "enabled": True, "severity": "High", "escalation_level": "1 Hour"},
    {"id": "fr7", "name": "Fake Promise", "enabled": False, "severity": "Medium", "escalation_level": "Daily Digest"},
    {"id": "fr8", "name": "Mis-selling", "enabled": True, "severity": "High", "escalation_level": "1 Hour"},
    {"id": "fr9", "name": "Legal Risk", "enabled": True, "severity": "Critical", "escalation_level": "Immediate"},
    {"id": "fr10", "name": "Policy Violation", "enabled": False, "severity": "Medium", "escalation_level": "Daily Digest"},
]

NOTIFICATION_RULES = [
    {"id": "nr1", "trigger": "Abusive Language", "channels": ["Email", "Slack"], "frequency": "Immediate", "enabled": True},
    {"id": "nr2", "trigger": "Long Hold", "channels": ["Email"], "frequency": "Hourly Digest", "enabled": True},
    {"id": "nr3", "trigger": "Dead Air", "channels": ["Slack"], "frequency": "Daily Digest", "enabled": False},
    {"id": "nr4", "trigger": "Escalation", "channels": ["Email", "SMS", "Teams"], "frequency": "Immediate", "enabled": True},
    {"id": "nr5", "trigger": "Negative Sentiment", "channels": ["Email"], "frequency": "Daily Digest", "enabled": True},
    {"id": "nr6", "trigger": "Low Score", "channels": ["Email"], "frequency": "Hourly Digest", "enabled": False},
    {"id": "nr7", "trigger": "Critical Failure", "channels": ["Email", "Slack", "Webhook"], "frequency": "Immediate", "enabled": True},
]

AI_INSIGHTS = [
    {"id": "ins1", "text": "18% increase in customer interruptions this week", "severity": "High", "filter": {"tag": "interruptions"}},
    {"id": "ins2", "text": "Agent greeting compliance improved by 12%", "severity": "Low", "filter": {"tag": "greeting"}},
    {"id": "ins3", "text": "Hold times increased for Technical Support queue", "severity": "Medium", "filter": {"team": "Technical Support"}},
    {"id": "ins4", "text": "Three agents contributed to 80% of abusive conversations", "severity": "Critical", "filter": {"tag": "abusive"}},
    {"id": "ins5", "text": "Refund-related calls have lowest CSAT this month", "severity": "Medium", "filter": {"tag": "refund"}},
    {"id": "ins6", "text": "Dead air spiked 9% on the Billing queue after 6 PM", "severity": "Medium", "filter": {"team": "Billing"}},
    {"id": "ins7", "text": "Compliance violations dropped 15% following new script rollout", "severity": "Low", "filter": {"tag": "compliance"}},
    {"id": "ins8", "text": "Escalation rate crossed threshold on VIP-Support queue", "severity": "High", "filter": {"queue": "VIP-Support"}},
]

ALERTS = []
for i, inc in enumerate(INCIDENTS):
    if inc["severity"] == "Critical":
        ALERTS.append({
            "id": f"ALT{7000+i}",
            "incident": inc["incident_type"],
            "agent": inc["agent_name"],
            "queue": inc["queue"],
            "time": inc["timestamp"],
            "severity": inc["severity"],
            "status": inc["status"],
            "assigned_to": inc["assigned_to"],
            "call_id": inc["call_id"],
        })

COACHING_QUEUE = []
for i in range(10):
    random.seed(6000 + i)
    ag = AGENTS[i]
    COACHING_QUEUE.append({
        "id": f"CO{8000+i}",
        "agent_id": ag["id"],
        "agent_name": ag["name"],
        "team": ag["team"],
        "recommendation": random.choice([
            "Agent frequently interrupts customers. Recommend active listening training.",
            "High dead-air time detected. Recommend call-control coaching.",
            "Compliance disclaimer missed repeatedly. Recommend compliance refresher.",
            "Low empathy score on escalated calls. Recommend empathy & tone coaching.",
            "Frequent script deviation. Recommend script adherence coaching.",
        ]),
        "estimated_improvement": f"+{random.randint(4,14)}%",
        "status": random.choice(["Needs Coaching", "Assigned", "Completed", "Escalated"]),
    })

WEEKLY_TREND = []
for w in range(12):
    random.seed(9000 + w)
    WEEKLY_TREND.append({
        "week": f"W{w+1}",
        "avg_score": round(random.uniform(70, 92), 1),
        "compliance": round(random.uniform(65, 96), 1),
        "sentiment": round(random.uniform(55, 90), 1),
    })
