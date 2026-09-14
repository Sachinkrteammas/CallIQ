export const USER = { name: 'Rohan Mehta', initials: 'RM', role: 'Operations Manager', company: 'Acme BPO' }

export const QUALITY_KPIS = [
  { key: 'calls_audited', label: 'Calls Audited', value: '1,247', trend: 12, spark: [42,55,48,62,58,71,65,78,82,88,91,95] },
  { key: 'avg_score', label: 'Avg Quality Score', value: '77%', trend: 3, spark: [72,74,71,75,73,76,74,77,78,76,79,82] },
  { key: 'fcr', label: 'First Call Resolution', value: '84%', trend: -2, spark: [80,82,85,83,81,84,86,85,83,84,82,84] },
  { key: 'compliance', label: 'Compliance Rate', value: '91%', trend: 5, spark: [85,86,88,87,89,90,88,91,90,92,91,93] },
  { key: 'csat', label: 'Customer Satisfaction', value: '4.2', trend: -1, spark: [4.0,4.1,4.2,4.3,4.1,4.2,4.3,4.2,4.1,4.2,4.3,4.2] },
  { key: 'avg_handle', label: 'Avg Handle Time', value: '5m 23s', trend: -3, spark: [340,335,328,325,320,318,322,315,323,318,310,323] },
  { key: 'escalation', label: 'Escalation Rate', value: '6.8%', trend: -8, spark: [9.2,8.8,8.5,8.1,7.8,7.5,7.2,7.0,6.9,6.8,6.7,6.8] },
  { key: 'greeting', label: 'Greeting Compliance', value: '94%', trend: 12, spark: [80,82,84,85,87,88,89,90,91,92,93,94] },
]

export const AI_KPIS = [
  { key: 'dead_air', label: 'Dead Air %', value: '3.2%', trend: -15, spark: [5.1,4.8,4.5,4.2,4.0,3.8,3.7,3.5,3.4,3.3,3.2,3.2] },
  { key: 'hold_time', label: 'Avg Hold Time', value: '42s', trend: 28, spark: [28,30,32,34,35,36,38,40,39,41,42,42] },
  { key: 'interruptions', label: 'Interruptions/Call', value: '1.8', trend: 18, spark: [1.2,1.3,1.3,1.4,1.5,1.5,1.6,1.6,1.7,1.7,1.8,1.8] },
  { key: 'talk_ratio', label: 'Agent Talk Ratio', value: '62%', trend: -5, spark: [68,67,66,65,65,64,64,63,63,62,62,62] },
  { key: 'sentiment', label: 'Positive Sentiment', value: '68%', trend: 4, spark: [62,63,64,64,65,65,66,66,67,67,68,68] },
  { key: 'escalation_risk', label: 'Escalation Risk', value: '12%', trend: -10, spark: [18,17,16,15,14,14,13,13,12,12,12,12] },
  { key: 'abusive', label: 'Abusive Calls', value: '23', trend: 8, spark: [15,16,18,19,19,20,21,21,22,22,23,23] },
  { key: 'silence', label: 'Long Silence', value: '1.4%', trend: -20, spark: [2.8,2.5,2.3,2.1,1.9,1.8,1.7,1.6,1.5,1.5,1.4,1.4] },
  { key: 'cross_talk', label: 'Cross Talk', value: '0.9%', trend: -12, spark: [1.5,1.4,1.3,1.2,1.1,1.1,1.0,1.0,0.9,0.9,0.9,0.9] },
  { key: 'script_dev', label: 'Script Deviation', value: '11%', trend: -9, spark: [18,17,16,15,14,13,13,12,12,11,11,11] },
]

export const HEALTH_SCORE = {
  score: 77,
  breakdown: [
    { label: 'Professionalism', value: 83 },
    { label: 'Compliance', value: 88 },
    { label: 'Communication', value: 72 },
    { label: 'Resolution', value: 78 },
    { label: 'Empathy', value: 64 },
    { label: 'Customer Experience', value: 69 },
  ],
}

export const EXECUTIVE_INSIGHTS = [
  { id: 1, text: '18% increase in customer interruptions — Technical Support queue is the primary driver.', severity: 'High', filter: { tag: 'interruptions', queue: 'Technical Support' } },
  { id: 2, text: 'Agent greeting compliance improved by 12% — Training cohort TRN-04 leading this improvement.', severity: 'Low', filter: { tag: 'greeting' } },
  { id: 3, text: 'Hold times increased 28% for Technical Support. Root cause: billing system latency.', severity: 'Medium', filter: { tag: 'hold_time', queue: 'Technical Support' } },
  { id: 4, text: 'Three agents (Amit Verma, Ravi Patel, Ankit Sharma) drove 80% of abusive conversations this week.', severity: 'Critical', filter: { tag: 'abusive' } },
  { id: 5, text: 'Refund-related calls have lowest CSAT at 52%. Script revision recommended for this call flow.', severity: 'High', filter: { tag: 'csat', queue: 'Billing' } },
  { id: 6, text: 'Script deviation rate dropped 9% since new prompt deployed Monday. Retention queue most improved.', severity: 'Low', filter: { tag: 'script_dev' } },
  { id: 7, text: 'Friday 3–5 PM shows peak escalation probability. Consider additional senior agent coverage.', severity: 'Medium', filter: { tag: 'escalation' } },
]

export const TREND_DATA = [
  { week: 'Mar', avg_score: 72, compliance: 85, sentiment: 62 },
  { week: 'Apr', avg_score: 74, compliance: 87, sentiment: 64 },
  { week: 'May', avg_score: 73, compliance: 86, sentiment: 63 },
  { week: 'Jun', avg_score: 76, compliance: 89, sentiment: 66 },
  { week: 'Jul', avg_score: 78, compliance: 91, sentiment: 67 },
  { week: 'Aug', avg_score: 77, compliance: 91, sentiment: 68 },
]

export const TEAM_PERFORMANCE = [
  { rank: 1, name: 'Team Gamma', trend: 6, score: 88, risk: 'Low' },
  { rank: 2, name: 'Team Alpha', trend: 3, score: 82, risk: 'Low' },
  { rank: 3, name: 'Team Beta', trend: -1, score: 76, risk: 'Medium' },
  { rank: 4, name: 'Team Epsilon', trend: 2, score: 71, risk: 'Medium' },
  { rank: 5, name: 'Team Delta', trend: -9, score: 58, risk: 'Critical' },
]

export const AGENTS_SNAPSHOT = [
  { id: 'PS', name: 'Priya Sharma', team: 'Alpha', calls: 412, score: 88, trend: 3, coaching: 1 },
  { id: 'DM', name: 'Divya Menon', team: 'Gamma', calls: 398, score: 84, trend: 5, coaching: 0 },
  { id: 'MN', name: 'Meena Nair', team: 'Beta', calls: 356, score: 79, trend: 1, coaching: 1 },
  { id: 'SK', name: 'Suresh Kumar', team: 'Beta', calls: 344, score: 72, trend: -2, coaching: 2 },
  { id: 'AV', name: 'Amit Verma', team: 'Delta', calls: 389, score: 54, trend: -8, coaching: 4 },
  { id: 'RP', name: 'Ravi Patel', team: 'Delta', calls: 401, score: 48, trend: -12, coaching: 5 },
]

export const CRITICAL_INCIDENTS_TABLE = [
  { id: 'CL-60782', agent: 'Amit Verma', issue: 'Abusive Language', severity: 'Critical', status: 'Open', assigned: 'Rohan Mehta' },
  { id: 'CL-60688', agent: 'Ravi Patel', issue: 'Compliance Violation', severity: 'Critical', status: 'Acknowledged', assigned: 'Priya Sharma' },
  { id: 'CL-60654', agent: 'Ankit Sharma', issue: 'Customer Threat', severity: 'Critical', status: 'Open', assigned: null },
  { id: 'CL-60521', agent: 'Deepa Joshi', issue: 'Data Leak Attempt', severity: 'Major', status: 'Resolved', assigned: 'Rohan Mehta' },
  { id: 'CL-60498', agent: 'Vikram Singh', issue: 'Extended Dead Air', severity: 'Major', status: 'Acknowledged', assigned: 'Neha Gupta' },
]

export const ACTION_CENTER = [
  { label: 'Critical Calls', count: 23, icon: 'AlertTriangle', color: '#D14343', link: '/incidents' },
  { label: 'Needs Coaching', count: 7, icon: 'Target', color: '#C9862B', link: '/coaching' },
  { label: 'Compliance Violations', count: 14, icon: 'ShieldAlert', color: '#D14343', link: '/alerts' },
  { label: 'Pending Reviews', count: 41, icon: 'ClipboardList', color: '#3457D5', link: '/calls' },
  { label: 'High Risk Agents', count: 5, icon: 'UserX', color: '#D14343', link: '/agents' },
]

export const CALLS = Array.from({ length: 50 }, (_, i) => ({
  id: `CL-${58000 + i}`,
  agent_name: ['Priya Sharma','Divya Menon','Meena Nair','Suresh Kumar','Amit Verma','Ravi Patel','Ankit Sharma','Deepa Joshi','Vikram Singh','Neha Gupta'][i % 10],
  agent_id: ['PS','DM','MN','SK','AV','RP','AS','DJ','VS','NG'][i % 10],
  customer: ['Rajesh Kumar','Sunita Devi','Mohammed Ali','Priya Patel','Amit Singh','Sara Khan','Vijay Mehta','Anjali Sharma'][i % 8],
  queue: ['Inbound-L1','Inbound-L2','Outbound-Sales','VIP-Support','Escalations','Technical Support','Billing','Retention'][i % 8],
  team: ['Alpha','Beta','Gamma','Delta','Epsilon'][i % 5],
  project: 'Acme BPO',
  duration_sec: 180 + Math.floor(Math.random() * 420),
  score: 40 + Math.floor(Math.random() * 55),
  customer_sentiment: ['Positive','Neutral','Negative','Frustrated'][i % 4],
  agent_sentiment: ['Calm','Neutral','Defensive','Aggressive'][i % 4],
  risk: ['Low','Low','Medium','Medium','High','Critical'][i % 6],
  compliance: Math.floor(60 + Math.random() * 40),
  sentiment: Math.floor(40 + Math.random() * 55),
  disposition: ['Resolved','Escalated','Follow-up','Transferred','Dropped'][i % 5],
  date: `2026-08-${String(1 + (i % 5)).padStart(2, '0')}`,
  time: `${8 + (i % 12)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')} AM`,
}))

export const CALL_DETAIL = {
  id: 'CL-60782',
  agent_name: 'Amit Verma',
  agent_id: 'AV',
  customer: 'Rajesh Kumar',
  queue: 'Technical Support',
  team: 'Delta',
  project: 'Acme BPO',
  duration_sec: 487,
  score: 38,
  risk: 'Critical',
  customer_sentiment: 'Frustrated',
  scores: {
    overall: 38, professionalism: 32, empathy: 28, listening: 45, confidence: 41,
    compliance: 22, patience: 35, resolution: 48, control: 30,
  },
  timeline: [
    { time: '0:00', label: 'Greeting', level: 'green' },
    { time: '0:15', label: 'Hold', level: 'amber' },
    { time: '0:45', label: 'Dead Air', level: 'red' },
    { time: '1:30', label: 'Interruption', level: 'red' },
    { time: '2:15', label: 'Script Dev', level: 'amber' },
    { time: '3:00', label: 'Escalation', level: 'red' },
    { time: '4:30', label: 'Complaint', level: 'red' },
    { time: '5:45', label: 'Resolution', level: 'green' },
  ],
  transcript: [
    { speaker: 'agent', text: 'Thank you for calling Acme BPO, this is Amit. How can I help you today?', time: '0:00', emotion: 'neutral' },
    { speaker: 'customer', text: 'I need to speak to a manager. Your system charged me twice for the same order and nobody is helping me.', time: '0:08', emotion: 'negative' },
    { speaker: 'agent', text: 'I understand your frustration sir. Let me look into this for you.', time: '0:15', emotion: 'neutral' },
    { speaker: 'agent', text: '', time: '0:45', emotion: 'neutral' },
    { speaker: 'customer', text: 'Hello? Are you there? This is ridiculous.', time: '1:20', emotion: 'frustrated' },
    { speaker: 'agent', text: 'Yes I am here. I was checking the system. It shows the payment was processed twice.', time: '1:30', emotion: 'neutral' },
    { speaker: 'customer', text: 'Then why haven\'t I received my refund? It\'s been two weeks!', time: '2:00', emotion: 'negative' },
    { speaker: 'agent', text: 'Let me— sorry, let me just— I need to check with my supervisor about this.', time: '2:15', emotion: 'neutral' },
    { speaker: 'customer', text: 'You said that last time! I want to speak to someone who can actually fix this!', time: '2:45', emotion: 'negative' },
    { speaker: 'agent', text: 'Sir, I am trying to help you. Please don\'t shout at me.', time: '3:00', emotion: 'neutral' },
    { speaker: 'customer', text: 'I am not shouting, I am frustrated because nobody is doing their job!', time: '3:30', emotion: 'negative' },
    { speaker: 'agent', text: 'Okay okay, let me transfer you to a supervisor.', time: '4:00', emotion: 'neutral' },
    { speaker: 'customer', text: 'Finally. This is the worst customer service I have ever experienced.', time: '4:30', emotion: 'negative' },
    { speaker: 'agent', text: 'I am transferring you now. Your reference number is RF-44219.', time: '5:00', emotion: 'neutral' },
    { speaker: 'customer', text: 'Fine. I hope someone actually resolves this.', time: '5:30', emotion: 'frustrated' },
    { speaker: 'agent', text: 'Thank you for your patience. Goodbye.', time: '5:45', emotion: 'neutral' },
  ],
  behaviours: [
    { label: 'Dead Air — 30s silence at 0:45', confidence: 96, timestamp: '0:45', severity: 'High' },
    { label: 'Customer Interruption — 3 instances', confidence: 92, timestamp: '1:30', severity: 'High' },
    { label: 'Script Deviation — Missing disclaimer', confidence: 88, timestamp: '2:15', severity: 'Medium' },
    { label: 'Escalation Risk — Customer anger detected', confidence: 94, timestamp: '3:00', severity: 'Critical' },
    { label: 'Defensive Response — Agent pushback', confidence: 87, timestamp: '3:00', severity: 'High' },
    { label: 'Failed Resolution — Transferred instead', confidence: 91, timestamp: '4:00', severity: 'Critical' },
    { label: 'Long Hold — 30s unsupervised hold', confidence: 89, timestamp: '0:15', severity: 'Medium' },
    { label: 'Missing Greeting Compliance', confidence: 75, timestamp: '0:00', severity: 'Low' },
  ],
  coaching: { status: 'Needs Coaching', recommendation: 'Agent needs retraining on de-escalation techniques and script adherence. Focus on active listening and empathy training.', estimated_improvement: '+15% score improvement' },
  incident: { id: 'INC-4021', type: 'Abusive Language + Escalation', severity: 'Critical', status: 'Open' },
}

export const DISTRIBUTION = [
  { label: 'Dead Air', value: '3.2%', unit: '', trend: -15, spark: [5.1,4.8,4.5,4.2,4.0,3.8,3.7,3.5,3.4,3.3,3.2,3.2] },
  { label: 'Long Hold', value: '42s', unit: '', trend: 28, spark: [28,30,32,34,35,36,38,40,39,41,42,42] },
  { label: 'Interruptions', value: '1.8', unit: '/call', trend: 18, spark: [1.2,1.3,1.3,1.4,1.5,1.5,1.6,1.6,1.7,1.7,1.8,1.8] },
  { label: 'Talk Ratio', value: '62%', unit: '', trend: -5, spark: [68,67,66,65,65,64,64,63,63,62,62,62] },
  { label: 'Silence', value: '1.4%', unit: '', trend: -20, spark: [2.8,2.5,2.3,2.1,1.9,1.8,1.7,1.6,1.5,1.5,1.4,1.4] },
  { label: 'Cross Talk', value: '0.9%', unit: '', trend: -12, spark: [1.5,1.4,1.3,1.2,1.1,1.1,1.0,1.0,0.9,0.9,0.9,0.9] },
  { label: 'Escalation', value: '6.8%', unit: '', trend: -8, spark: [9.2,8.8,8.5,8.1,7.8,7.5,7.2,7.0,6.9,6.8,6.7,6.8] },
  { label: 'Script Deviation', value: '11%', unit: '', trend: -9, spark: [18,17,16,15,14,13,13,12,12,11,11,11] },
]

export const HEATMAP = {
  behaviours: ['Dead Air', 'Long Hold', 'Interruptions', 'Talk Ratio', 'Silence', 'Cross Talk', 'Escalation', 'Script Dev', 'Sentiment'],
  rows: [
    { team: 'Alpha', cells: { 'Dead Air': 'green', 'Long Hold': 'green', 'Interruptions': 'amber', 'Talk Ratio': 'green', 'Silence': 'green', 'Cross Talk': 'green', 'Escalation': 'green', 'Script Dev': 'amber', 'Sentiment': 'green' } },
    { team: 'Beta', cells: { 'Dead Air': 'amber', 'Long Hold': 'amber', 'Interruptions': 'amber', 'Talk Ratio': 'amber', 'Silence': 'green', 'Cross Talk': 'amber', 'Escalation': 'amber', 'Script Dev': 'green', 'Sentiment': 'amber' } },
    { team: 'Gamma', cells: { 'Dead Air': 'green', 'Long Hold': 'green', 'Interruptions': 'green', 'Talk Ratio': 'green', 'Silence': 'green', 'Cross Talk': 'green', 'Escalation': 'green', 'Script Dev': 'green', 'Sentiment': 'green' } },
    { team: 'Delta', cells: { 'Dead Air': 'red', 'Long Hold': 'red', 'Interruptions': 'red', 'Talk Ratio': 'red', 'Silence': 'amber', 'Cross Talk': 'red', 'Escalation': 'red', 'Script Dev': 'red', 'Sentiment': 'red' } },
    { team: 'Epsilon', cells: { 'Dead Air': 'amber', 'Long Hold': 'green', 'Interruptions': 'amber', 'Talk Ratio': 'green', 'Silence': 'amber', 'Cross Talk': 'green', 'Escalation': 'amber', 'Script Dev': 'amber', 'Sentiment': 'green' } },
  ],
}

export const AI_FINDINGS = [
  { id: 'F1', icon: 'AlertTriangle', severity: 'Critical', description: 'Three agents drove 80% of all abusive conversations this week. Pattern indicates systemic de-escalation failure in Delta team.', affected_calls: ['CL-60782','CL-60688','CL-60654','CL-60521','CL-60498'], affected_agents: ['Amit Verma','Ravi Patel','Ankit Sharma'] },
  { id: 'F2', icon: 'Clock', severity: 'High', description: 'Hold times increased 28% for Technical Support queue. Billing system integration latency identified as root cause.', affected_calls: ['CL-60712','CL-60698','CL-60655'], affected_agents: ['Suresh Kumar','Deepa Joshi'] },
  { id: 'F3', icon: 'VolumeX', severity: 'Medium', description: 'Dead air episodes exceeding 20s detected in 12% of Retention queue calls, correlating with 3x higher drop rates.', affected_calls: ['CL-60580','CL-60567','CL-60544','CL-60521'], affected_agents: ['Vikram Singh','Neha Gupta'] },
  { id: 'F4', icon: 'MessageSquareWarning', severity: 'High', description: 'Customer interruptions increased 18% week-over-week. Technical Support queue primary driver with 2.3x average.', affected_calls: ['CL-60782','CL-60745','CL-60701'], affected_agents: ['Amit Verma','Priya Sharma'] },
  { id: 'F5', icon: 'TrendingDown', severity: 'Medium', description: 'Script deviation rate dropped 9% since new prompt deployment. Retention queue showed most improvement at -14%.', affected_calls: [], affected_agents: [] },
  { id: 'F6', icon: 'Shield', severity: 'Low', description: 'Greeting compliance improved 12% following TRN-04 training cohort. Recommend extending to all teams.', affected_calls: [], affected_agents: [] },
]

export const ALL_AGENTS = [
  { id: 'PS', name: 'Priya Sharma', team: 'Alpha', calls: 412, avg_score: 88, conversation_score: 85, sentiment_score: 82, professionalism: 91, compliance: 94, risk: 'Low', trend: 3, coaching_assigned: 1, avatar_bg: '#3457D5' },
  { id: 'DM', name: 'Divya Menon', team: 'Gamma', calls: 398, avg_score: 84, conversation_score: 81, sentiment_score: 79, professionalism: 86, compliance: 90, risk: 'Low', trend: 5, coaching_assigned: 0, avatar_bg: '#1C9A6C' },
  { id: 'MN', name: 'Meena Nair', team: 'Beta', calls: 356, avg_score: 79, conversation_score: 76, sentiment_score: 74, professionalism: 80, compliance: 85, risk: 'Low', trend: 1, coaching_assigned: 1, avatar_bg: '#C9862B' },
  { id: 'SK', name: 'Suresh Kumar', team: 'Beta', calls: 344, avg_score: 72, conversation_score: 69, sentiment_score: 67, professionalism: 74, compliance: 78, risk: 'Medium', trend: -2, coaching_assigned: 2, avatar_bg: '#7C3AED' },
  { id: 'VS', name: 'Vikram Singh', team: 'Epsilon', calls: 378, avg_score: 71, conversation_score: 68, sentiment_score: 66, professionalism: 73, compliance: 76, risk: 'Medium', trend: -3, coaching_assigned: 2, avatar_bg: '#EC4899' },
  { id: 'NG', name: 'Neha Gupta', team: 'Epsilon', calls: 362, avg_score: 75, conversation_score: 72, sentiment_score: 70, professionalism: 77, compliance: 81, risk: 'Medium', trend: 0, coaching_assigned: 1, avatar_bg: '#F59E0B' },
  { id: 'DJ', name: 'Deepa Joshi', team: 'Beta', calls: 335, avg_score: 76, conversation_score: 73, sentiment_score: 71, professionalism: 78, compliance: 82, risk: 'Medium', trend: 2, coaching_assigned: 1, avatar_bg: '#06B6D4' },
  { id: 'AS', name: 'Ankit Sharma', team: 'Delta', calls: 395, avg_score: 62, conversation_score: 58, sentiment_score: 55, professionalism: 60, compliance: 65, risk: 'High', trend: -5, coaching_assigned: 3, avatar_bg: '#EF4444' },
  { id: 'AV', name: 'Amit Verma', team: 'Delta', calls: 389, avg_score: 54, conversation_score: 48, sentiment_score: 45, professionalism: 52, compliance: 58, risk: 'Critical', trend: -8, coaching_assigned: 4, avatar_bg: '#DC2626' },
  { id: 'RP', name: 'Ravi Patel', team: 'Delta', calls: 401, avg_score: 48, conversation_score: 42, sentiment_score: 38, professionalism: 45, compliance: 52, risk: 'Critical', trend: -12, coaching_assigned: 5, avatar_bg: '#991B1B' },
]

export const TEAM_HEALTH = [
  { team: 'Team Alpha', score: 82, calls: 810, trend: 3, agents: 2, risk: 'Low', top_performer: 'Priya Sharma', improvement: 'Greeting compliance +12%' },
  { team: 'Team Beta', score: 76, calls: 1035, trend: -1, agents: 3, risk: 'Medium', top_performer: 'Meena Nair', improvement: 'FCR +5%' },
  { team: 'Team Gamma', score: 88, calls: 796, trend: 6, agents: 2, risk: 'Low', top_performer: 'Divya Menon', improvement: 'Sentiment +8%' },
  { team: 'Team Delta', score: 58, calls: 1185, trend: -9, agents: 3, risk: 'Critical', top_performer: 'Ankit Sharma', improvement: 'Needs intervention' },
  { team: 'Team Epsilon', score: 71, calls: 740, trend: 2, agents: 2, risk: 'Medium', top_performer: 'Neha Gupta', improvement: 'Dead air -15%' },
]

export const COACHING_QUEUE = [
  { id: 'C1', agent_name: 'Amit Verma', agent_id: 'AV', team: 'Delta', status: 'Needs Coaching', recommendation: 'De-escalation techniques and active listening. Agent displayed defensive behavior in 4/5 reviewed calls.', estimated_improvement: '+15% score', evidence: 'CL-60782, CL-60688', created: '2026-08-01' },
  { id: 'C2', agent_name: 'Ravi Patel', agent_id: 'RP', team: 'Delta', status: 'Needs Coaching', recommendation: 'Script adherence and compliance. Missing mandatory disclaimers in 60% of calls.', estimated_improvement: '+20% compliance', evidence: 'CL-60654, CL-60521', created: '2026-08-01' },
  { id: 'C3', agent_name: 'Ankit Sharma', agent_id: 'AS', team: 'Delta', status: 'Assigned', recommendation: 'Empathy and customer experience. Customer satisfaction scores consistently below 40%.', estimated_improvement: '+12% CSAT', evidence: 'CL-60498', created: '2026-07-30' },
  { id: 'C4', agent_name: 'Suresh Kumar', agent_id: 'SK', team: 'Beta', status: 'Needs Coaching', recommendation: 'Dead air management. Average dead air per call at 4.2s vs team avg of 1.8s.', estimated_improvement: '+8% score', evidence: 'CL-60580', created: '2026-08-02' },
  { id: 'C5', agent_name: 'Vikram Singh', agent_id: 'VS', team: 'Epsilon', status: 'Assigned', recommendation: 'Hold time optimization. Hold episodes exceeding 60s in 30% of calls.', estimated_improvement: '+6% AHT', evidence: 'CL-60567', created: '2026-07-29' },
  { id: 'C6', agent_name: 'Deepa Joshi', agent_id: 'DJ', team: 'Beta', status: 'Completed', recommendation: 'Script adherence completed. Score improved from 71% to 76%.', estimated_improvement: '+5% achieved', evidence: 'CL-60445', created: '2026-07-25' },
  { id: 'C7', agent_name: 'Priya Sharma', agent_id: 'PS', team: 'Alpha', status: 'Completed', recommendation: 'Advanced de-escalation workshop completed. Certification earned.', estimated_improvement: 'Maintained 88%', evidence: 'N/A', created: '2026-07-20' },
  { id: 'C8', agent_name: 'Amit Verma', agent_id: 'AV', team: 'Delta', status: 'Escalated', recommendation: 'Multiple coaching sessions completed without improvement. Requires management intervention.', estimated_improvement: 'HR review pending', evidence: 'CL-60782, CL-60688, CL-60654', created: '2026-07-15' },
]

export const INCIDENTS = [
  { id: 'INC-4021', severity: 'Critical', incident_type: 'Abusive Language + Customer Escalation', call_id: 'CL-60782', agent_name: 'Amit Verma', customer: 'Rajesh Kumar', project: 'Acme BPO', queue: 'Technical Support', timestamp: '2026-08-05T14:32:00Z', status: 'Open', assigned_to: 'Rohan Mehta', transcript_excerpt: 'Sir, I am trying to help you. Please don\'t shout at me.' },
  { id: 'INC-4020', severity: 'Critical', incident_type: 'Compliance Violation — Missing disclaimer', call_id: 'CL-60688', agent_name: 'Ravi Patel', customer: 'Sunita Devi', project: 'Acme BPO', queue: 'Billing', timestamp: '2026-08-05T11:15:00Z', status: 'Acknowledged', assigned_to: 'Priya Sharma', transcript_excerpt: 'Agent proceeded with billing change without recording consent.' },
  { id: 'INC-4019', severity: 'Critical', incident_type: 'Customer Threat of Legal Action', call_id: 'CL-60654', agent_name: 'Ankit Sharma', customer: 'Mohammed Ali', project: 'Acme BPO', queue: 'Retention', timestamp: '2026-08-04T16:45:00Z', status: 'Open', assigned_to: null, transcript_excerpt: 'Customer threatened to file consumer court complaint.' },
  { id: 'INC-4018', severity: 'Major', incident_type: 'Data Privacy Concern', call_id: 'CL-60521', agent_name: 'Deepa Joshi', customer: 'Priya Patel', project: 'Acme BPO', queue: 'Inbound-L2', timestamp: '2026-08-04T09:20:00Z', status: 'Resolved', assigned_to: 'Rohan Mehta', transcript_excerpt: 'Customer requested data deletion. Agent did not follow protocol.' },
  { id: 'INC-4017', severity: 'Major', incident_type: 'Extended Dead Air — 45s silence', call_id: 'CL-60498', agent_name: 'Vikram Singh', customer: 'Amit Singh', project: 'Acme BPO', queue: 'Escalations', timestamp: '2026-08-03T15:30:00Z', status: 'Acknowledged', assigned_to: 'Neha Gupta', transcript_excerpt: 'Agent left customer on hold for 45 seconds without update.' },
  { id: 'INC-4016', severity: 'Minor', incident_type: 'Greeting Non-compliance', call_id: 'CL-60445', agent_name: 'Deepa Joshi', customer: 'Sara Khan', project: 'Acme BPO', queue: 'Inbound-L1', timestamp: '2026-08-03T10:00:00Z', status: 'Resolved', assigned_to: 'Neha Gupta', transcript_excerpt: 'Agent skipped mandatory greeting script.' },
  { id: 'INC-4015', severity: 'Minor', incident_type: 'Missed Closing Script', call_id: 'CL-60412', agent_name: 'Meena Nair', customer: 'Vijay Mehta', project: 'Acme BPO', queue: 'Outbound-Sales', timestamp: '2026-08-02T14:10:00Z', status: 'Resolved', assigned_to: 'Priya Sharma', transcript_excerpt: 'Agent ended call without satisfaction survey prompt.' },
]

export const FATAL_RULES = [
  { id: 'FR1', name: 'Abusive Language Detection', severity: 'Critical', escalation_level: 'Immediate', enabled: true },
  { id: 'FR2', name: 'Customer Threat Detection', severity: 'Critical', escalation_level: 'Immediate', enabled: true },
  { id: 'FR3', name: 'Data Privacy Violation', severity: 'Critical', escalation_level: 'Within 1 hour', enabled: true },
  { id: 'FR4', name: 'Compliance Disclaimer Missing', severity: 'Major', escalation_level: 'Within 4 hours', enabled: true },
  { id: 'FR5', name: 'Extended Dead Air (>30s)', severity: 'Major', escalation_level: 'Within 2 hours', enabled: false },
  { id: 'FR6', name: 'Script Deviation — Critical Path', severity: 'Major', escalation_level: 'Within 4 hours', enabled: true },
]

export const ALERTS = [
  { id: 'AL-1042', incident: 'Abusive Language Detected', agent: 'Amit Verma', call_id: 'CL-60782', queue: 'Technical Support', time: '2026-08-05T14:32:00Z', severity: 'Critical', status: 'Open', assigned_to: 'Rohan Mehta', detection: 'AI verified abusive language pattern', confidence: 96 },
  { id: 'AL-1041', incident: 'Compliance Violation', agent: 'Ravi Patel', call_id: 'CL-60688', queue: 'Billing', time: '2026-08-05T11:15:00Z', severity: 'Critical', status: 'Acknowledged', assigned_to: 'Priya Sharma', detection: 'Missing recording consent disclaimer', confidence: 94 },
  { id: 'AL-1040', incident: 'Customer Threat', agent: 'Ankit Sharma', call_id: 'CL-60654', queue: 'Retention', time: '2026-08-04T16:45:00Z', severity: 'Critical', status: 'Open', assigned_to: null, detection: 'Legal action threat detected', confidence: 91 },
  { id: 'AL-1039', incident: 'Dead Air Alert', agent: 'Vikram Singh', call_id: 'CL-60498', queue: 'Escalations', time: '2026-08-03T15:30:00Z', severity: 'High', status: 'Acknowledged', assigned_to: 'Neha Gupta', detection: '45s silence without agent update', confidence: 98 },
  { id: 'AL-1038', incident: 'Script Deviation', agent: 'Suresh Kumar', call_id: 'CL-60580', queue: 'Technical Support', time: '2026-08-03T13:20:00Z', severity: 'Medium', status: 'Resolved', assigned_to: 'Rohan Mehta', detection: 'Missing mandatory disclaimer at call start', confidence: 89 },
  { id: 'AL-1037', incident: 'Sentiment Drop', agent: 'Deepa Joshi', call_id: 'CL-60521', queue: 'Inbound-L2', time: '2026-08-04T09:20:00Z', severity: 'Medium', status: 'Resolved', assigned_to: 'Neha Gupta', detection: 'Customer sentiment shifted Negative within 30s', confidence: 85 },
  { id: 'AL-1036', incident: 'Long Hold Time', agent: 'Neha Gupta', call_id: 'CL-60544', queue: 'VIP-Support', time: '2026-08-03T11:45:00Z', severity: 'Low', status: 'Resolved', assigned_to: 'Rohan Mehta', detection: 'Hold exceeded 90s without callback', confidence: 92 },
]

export const ANALYTICS = {
  hourly_volume: Array.from({ length: 24 }, (_, i) => ({
    hour: `${String(i).padStart(2, '0')}:00`,
    calls: Math.floor(20 + Math.random() * 80 + (i >= 9 && i <= 17 ? 40 : 0)),
  })),
  sentiment_trend: [
    { month: 'Mar', positive: 58, neutral: 28, negative: 14 },
    { month: 'Apr', positive: 60, neutral: 27, negative: 13 },
    { month: 'May', positive: 62, neutral: 26, negative: 12 },
    { month: 'Jun', positive: 64, neutral: 25, negative: 11 },
    { month: 'Jul', positive: 66, neutral: 24, negative: 10 },
    { month: 'Aug', positive: 68, neutral: 23, negative: 9 },
  ],
  queue_performance: [
    { queue: 'Inbound-L1', score: 82, calls: 312, compliance: 94 },
    { queue: 'Inbound-L2', score: 78, calls: 198, compliance: 89 },
    { queue: 'Outbound-Sales', score: 75, calls: 156, compliance: 86 },
    { queue: 'VIP-Support', score: 85, calls: 89, compliance: 96 },
    { queue: 'Escalations', score: 68, calls: 67, compliance: 82 },
    { queue: 'Technical Support', score: 71, calls: 245, compliance: 85 },
    { queue: 'Billing', score: 74, calls: 178, compliance: 88 },
    { queue: 'Retention', score: 79, calls: 112, compliance: 91 },
  ],
  parameter_scores: [
    { param: 'Professionalism', score: 83 },
    { param: 'Compliance', score: 88 },
    { param: 'Communication', score: 72 },
    { param: 'Resolution', score: 78 },
    { param: 'Empathy', score: 64 },
    { param: 'Listening', score: 75 },
    { param: 'Confidence', score: 71 },
    { param: 'Patience', score: 77 },
  ],
}

export const CLIENTS = [
  { name: 'Acme BPO', industry: 'Telecommunications', type: 'Sales', score: 82, projects: 3, calls: 4215, agents: 12, trend: 3 },
  { name: 'Northwind Bank', industry: 'Banking & Finance', type: 'Service', score: 76, projects: 2, calls: 2890, agents: 8, trend: -1 },
  { name: 'Zenith Health', industry: 'Healthcare', type: 'Service', score: 88, projects: 4, calls: 3560, agents: 15, trend: 5 },
  { name: 'Orbit Retail', industry: 'E-commerce', type: 'Sales', score: 71, projects: 2, calls: 1980, agents: 6, trend: -2 },
  { name: 'Prism Media', industry: 'Media & Entertainment', type: 'Sales', score: 84, projects: 1, calls: 1240, agents: 4, trend: 7 },
  { name: 'Vertex Logistics', industry: 'Supply Chain', type: 'Service', score: 79, projects: 2, calls: 2100, agents: 7, trend: 1 },
]

export const NOTIFICATION_RULES = [
  { id: 'NR1', trigger: 'Critical Incident Detected', channels: ['Email', 'Slack', 'SMS'], frequency: 'Immediate', enabled: true },
  { id: 'NR2', trigger: 'Agent Score Drops Below 60', channels: ['Email', 'Slack'], frequency: 'Immediate', enabled: true },
  { id: 'NR3', trigger: 'Compliance Violation', channels: ['Email'], frequency: 'Immediate', enabled: true },
  { id: 'NR4', trigger: 'Daily Summary Report', channels: ['Email'], frequency: 'Daily 6 PM', enabled: true },
  { id: 'NR5', trigger: 'Weekly Executive Report', channels: ['Email'], frequency: 'Monday 8 AM', enabled: true },
  { id: 'NR6', trigger: 'Escalation Threshold Breach', channels: ['Email', 'Slack', 'SMS'], frequency: 'Immediate', enabled: false },
]

export const USERS = [
  { id: 'U1', name: 'Rohan Mehta', role: 'Operations Manager', email: 'rohan.mehta@acmebpo.com', status: 'Active', last_login: '2026-08-05 14:30' },
  { id: 'U2', name: 'Priya Sharma', role: 'Team Lead', email: 'priya.sharma@acmebpo.com', status: 'Active', last_login: '2026-08-05 13:15' },
  { id: 'U3', name: 'Neha Gupta', role: 'QA Analyst', email: 'neha.gupta@acmebpo.com', status: 'Active', last_login: '2026-08-05 12:00' },
  { id: 'U4', name: 'Vikram Singh', role: 'Team Lead', email: 'vikram.singh@acmebpo.com', status: 'Active', last_login: '2026-08-04 18:45' },
  { id: 'U5', name: 'Admin User', role: 'System Admin', email: 'admin@acmebpo.com', status: 'Active', last_login: '2026-08-05 09:00' },
]

export const INTEGRATIONS = [
  { name: 'Twilio', type: 'Telephony', status: 'Connected', icon: 'Phone' },
  { name: 'Slack', type: 'Notifications', status: 'Connected', icon: 'MessageSquare' },
  { name: 'Salesforce', type: 'CRM', status: 'Connected', icon: 'Database' },
  { name: 'Zendesk', type: 'Ticketing', status: 'Disconnected', icon: 'Ticket' },
  { name: 'AWS S3', type: 'Storage', status: 'Connected', icon: 'Cloud' },
  { name: 'Google Workspace', type: 'Email', status: 'Connected', icon: 'Mail' },
]

export const ALERT_CATEGORIES = [
  { label: 'Abusive Language', count: 23, icon: 'AlertTriangle', color: '#D14343' },
  { label: 'Compliance Violation', count: 14, icon: 'ShieldAlert', color: '#D14343' },
  { label: 'Customer Threat', count: 8, icon: 'Siren', color: '#D14343' },
  { label: 'Dead Air', count: 31, icon: 'VolumeX', color: '#C9862B' },
  { label: 'Long Hold', count: 19, icon: 'Clock', color: '#C9862B' },
  { label: 'Script Deviation', count: 42, icon: 'FileWarning', color: '#C9862B' },
  { label: 'Sentiment Drop', count: 15, icon: 'TrendingDown', color: '#3457D5' },
  { label: 'Data Privacy', count: 3, icon: 'Lock', color: '#D14343' },
]

export const CONVERSATION_SCORE_DIMENSIONS = [
  { dimension: 'Professionalism', score: 83 },
  { dimension: 'Empathy', score: 64 },
  { dimension: 'Listening', score: 75 },
  { dimension: 'Confidence', score: 71 },
  { dimension: 'Compliance', score: 88 },
  { dimension: 'Patience', score: 77 },
  { dimension: 'Resolution', score: 78 },
  { dimension: 'Customer Experience', score: 69 },
]

export const COACHING_WORKFLOW = [
  { step: 1, label: 'AI Detection', description: 'AI identifies coaching opportunity from call analysis' },
  { step: 2, label: 'Evidence Gathering', description: 'System collects transcript evidence and score data' },
  { step: 3, label: 'Recommendation', description: 'AI generates personalized coaching recommendation' },
  { step: 4, label: 'Manager Review', description: 'Operations manager reviews and approves recommendation' },
  { step: 5, label: 'Assignment', description: 'Coaching session assigned to agent with deadline' },
  { step: 6, label: 'Training', description: 'Agent completes assigned training modules' },
  { step: 7, label: 'Assessment', description: 'Follow-up call scored to measure improvement' },
  { step: 8, label: 'Closure', description: 'Coaching marked complete if improvement confirmed' },
  { step: 9, label: 'Escalation', description: 'If no improvement, escalated to HR/management' },
]
