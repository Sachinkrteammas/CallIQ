export const PRIORITY_LEVELS = [
  { value: 'normal', label: 'Normal', color: '#6B7385', bg: '#F1F1F4' },
  { value: 'important', label: 'Important', color: '#C9862B', bg: '#FCF1DF' },
  { value: 'critical', label: 'Critical', color: '#D14343', bg: '#FBE9E9' },
]

export const PRIORITY_MAP = PRIORITY_LEVELS.reduce((acc, p) => {
  acc[p.value] = p
  return acc
}, {})

export const SCORING_TYPES = [
  { value: 'pass_partial_fail', label: 'Pass / Partial / Fail' },
  { value: 'numeric', label: 'Numeric (0-100)' },
  { value: 'boolean', label: 'Boolean (Yes/No)' },
]

export const OUTPUT_TYPES = [
  { value: 'string', label: 'String' },
  { value: 'integer', label: 'Integer' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' },
]

export const SEVERITIES = [
  { value: 'critical', label: 'Critical', color: '#D14343', bg: '#FBE9E9' },
  { value: 'major', label: 'Major', color: '#C9862B', bg: '#FCF1DF' },
  { value: 'minor', label: 'Minor', color: '#3457D5', bg: '#EEF1FE' },
]

export const SEVERITY_TEXT = SEVERITIES.reduce((acc, s) => {
  acc[s.value] = s.label
  return acc
}, {})

export const INITIAL_CONFIG = {
  name: 'Customer Service QA Audit Prompt',
  description: 'Structured AI evaluation prompt for auditing customer-service call transcripts.',
  version: 'v5.2',
  status: 'Draft',
  preamble: {
    role: 'You are an expert QA auditor responsible for evaluating customer-service call transcripts.',
    objective: 'Evaluate whether the agent followed the prescribed QA framework and delivered compliant, effective, empathetic service.',
    scope: 'Analyze the full transcript including greeting, discovery, resolution, and closing. Assess both compliance and soft skills.',
    generalRules: [
      'Evaluate only information that is supported by the transcript.',
      'Do not assume or infer information that is not present in the transcript.',
      'Apply the configured scoring rules and weights to each criterion.',
      'Identify fatal failures and hard rule violations regardless of overall score.',
      'Calculate the final score normalized to 100.',
    ],
    scoringInstructions: 'For each question, assign PASS (5), PARTIAL (2.5) or FAIL (0). Weight each question to its parameter, then weight each parameter to the overall score. The final overall score must be normalized to 100.',
    transcriptInterpretation: 'Treat the customer as the primary speaker triggering the call. Ignore hold music and non-verbal filler unless it indicates dead air. Count overlapping speech as an interruption.',
    constraints: 'Do not reveal internal scoring logic to the customer. Output must be valid JSON matching the provided schema and nothing else.',
  },
  parameters: [
    {
      id: 'p1',
      name: 'Opening & Call Initiation',
      description: 'Evaluate whether the agent properly opened the call with a professional greeting.',
      weight: 10,
      priority: 'normal',
      evaluationType: 'pass_partial_fail',
      questions: [
        { id: 'q1', name: 'Professional greeting', criteria: 'Agent should greet the customer professionally and state the company name.', weight: 20, priority: 'normal', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
        { id: 'q2', name: 'Agent identification', criteria: 'Agent identifies themselves by name and role.', weight: 20, priority: 'normal', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
        { id: 'q3', name: 'Customer verification', criteria: 'Agent verifies the customer identity and account before proceeding.', weight: 30, priority: 'important', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: true, evidenceRequired: true },
        { id: 'q4', name: 'Purpose confirmation', criteria: 'Agent confirms the reason for the call and sets expectations.', weight: 30, priority: 'normal', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
      ],
    },
    {
      id: 'p2',
      name: 'Customer Understanding',
      description: 'Evaluate how well the agent understood the customer issue through discovery.',
      weight: 15,
      priority: 'normal',
      evaluationType: 'pass_partial_fail',
      questions: [
        { id: 'q5', name: 'Active listening', criteria: 'Agent paraphrases and acknowledges the customer issue.', weight: 40, priority: 'normal', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
        { id: 'q6', name: 'Discovery & probing', criteria: 'Agent asks relevant open questions to uncover the root cause.', weight: 40, priority: 'important', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
        { id: 'q7', name: 'Empathy', criteria: 'Agent demonstrates empathy and acknowledges customer emotion.', weight: 20, priority: 'normal', scoringType: 'pass_partial_fail', required: false, fatal: false, hardRule: false, evidenceRequired: false },
      ],
    },
    {
      id: 'p3',
      name: 'Discovery & Probing',
      description: 'Evaluate the quality of questioning used to diagnose the issue.',
      weight: 15,
      priority: 'important',
      evaluationType: 'pass_partial_fail',
      questions: [
        { id: 'q8', name: 'Root cause identification', criteria: 'Agent identifies the true root cause before proposing a solution.', weight: 50, priority: 'critical', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: true },
        { id: 'q9', name: 'Relevant questioning', criteria: 'Agent asks questions aligned to the reported issue.', weight: 50, priority: 'normal', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
      ],
    },
    {
      id: 'p4',
      name: 'Resolution & Closing',
      description: 'Evaluate the quality of the resolution provided and how the call was closed.',
      weight: 20,
      priority: 'critical',
      evaluationType: 'pass_partial_fail',
      questions: [
        { id: 'q10', name: 'Accurate resolution', criteria: 'Agent provides an accurate solution that resolves the customer issue.', weight: 40, priority: 'critical', scoringType: 'pass_partial_fail', required: true, fatal: true, hardRule: false, evidenceRequired: true },
        { id: 'q11', name: 'Next steps & confirmation', criteria: 'Agent confirms next steps and that the customer is satisfied.', weight: 30, priority: 'important', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
        { id: 'q12', name: 'Professional closing', criteria: 'Agent closes the call professionally with a summary.', weight: 30, priority: 'normal', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
      ],
    },
    {
      id: 'p5',
      name: 'Communication & Soft Skills',
      description: 'Evaluate clarity, tone, and interpersonal skills.',
      weight: 10,
      priority: 'normal',
      evaluationType: 'pass_partial_fail',
      questions: [
        { id: 'q13', name: 'Clarity of communication', criteria: 'Agent communicates clearly without jargon or ambiguity.', weight: 50, priority: 'normal', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
        { id: 'q14', name: 'Tone & professionalism', criteria: 'Agent maintains a professional and courteous tone.', weight: 50, priority: 'normal', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
      ],
    },
    {
      id: 'p6',
      name: 'Process Adherence',
      description: 'Evaluate adherence to scripts, compliance statements, and policy.',
      weight: 10,
      priority: 'important',
      evaluationType: 'pass_partial_fail',
      questions: [
        { id: 'q15', name: 'Compliance statement', criteria: 'Agent delivers the required compliance/disclosure statement.', weight: 60, priority: 'critical', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: true, evidenceRequired: true },
        { id: 'q16', name: 'Script adherence', criteria: 'Agent follows the approved call script flow.', weight: 40, priority: 'normal', scoringType: 'pass_partial_fail', required: false, fatal: false, hardRule: false, evidenceRequired: false },
      ],
    },
    {
      id: 'p7',
      name: 'Call Control',
      description: 'Evaluate the agent\u2019s ability to manage the call and retain control.',
      weight: 10,
      priority: 'normal',
      evaluationType: 'pass_partial_fail',
      questions: [
        { id: 'q17', name: 'Handling objections', criteria: 'Agent handles objections calmly and redirects effectively.', weight: 50, priority: 'normal', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
        { id: 'q18', name: 'Managing angry customers', criteria: 'Agent de-escalates anger without becoming defensive.', weight: 50, priority: 'critical', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
      ],
    },
    {
      id: 'p8',
      name: 'Closing & Outcome',
      description: 'Evaluate overall outcome and customer satisfaction signal.',
      weight: 10,
      priority: 'normal',
      evaluationType: 'pass_partial_fail',
      questions: [
        { id: 'q19', name: 'Outcome clarity', criteria: 'The customer clearly understands the outcome.', weight: 50, priority: 'normal', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
        { id: 'q20', name: 'Satisfaction signal', criteria: 'Customer conveys satisfaction or acceptance of resolution.', weight: 50, priority: 'important', scoringType: 'pass_partial_fail', required: false, fatal: false, hardRule: false, evidenceRequired: false },
      ],
    },
  ],
  fatalRules: [
    { id: 'f1', name: 'False Information', description: 'Agent provides intentionally false or fabricated critical information to the customer.', detectionCondition: 'Agent states critical account or policy information that contradicts known records without basis.', severity: 'critical', action: 'fail', scoreImpact: 'Auto-fail and escalate to management', enabled: true },
    { id: 'f2', name: 'Abusive Language', description: 'Agent uses abusive, profane, or threatening language.', detectionCondition: 'Transcript contains profanity, threats, or insults from the agent.', severity: 'critical', action: 'fail', scoreImpact: 'Auto-fail and escalate to management', enabled: true },
    { id: 'f3', name: 'Data Breach / Privacy', description: 'Agent discloses sensitive customer data to an unauthorized party.', detectionCondition: 'Agent reveals PII or account detail not verified to the customer on the call.', severity: 'critical', action: 'fail', scoreImpact: 'Auto-fail, escalate and flag for compliance review', enabled: true },
    { id: 'f4', name: 'Incorrect Critical Information', description: 'Agent gives incorrect critical information leading to potential harm.', detectionCondition: 'Agent provides a materially wrong answer on a high-impact topic (billing, account, legal).', severity: 'major', action: 'penalize', scoreImpact: 'Cap score at 50 and flag for review', enabled: false },
  ],
  hardRules: [
    { id: 'h1', name: 'Customer placed on hold without explanation', condition: 'Agent places customer on hold without informing them.', expectedBehaviour: 'Agent explains the hold, states reason, and sets expectation.', failureBehaviour: 'Mark question as FAIL and deduct from call control.', scoreImpact: '-5 points', enabled: true },
    { id: 'h2', name: 'Customer identity not verified', condition: 'Agent proceeds without confirming customer identity.', expectedBehaviour: 'Agent verifies identity using approved method before sharing info.', failureBehaviour: 'Mark verification question FAIL.', scoreImpact: '-5 points + flag', enabled: true },
    { id: 'h3', name: 'Improper call disconnection', condition: 'Agent disconnects the call without proper closing.', expectedBehaviour: 'Agent summarizes and closes professionally before ending.', failureBehaviour: 'Mark closing question FAIL.', scoreImpact: '-3 points', enabled: true },
    { id: 'h4', name: 'Required compliance statement missing', condition: 'Mandatory disclosure statement was omitted.', expectedBehaviour: 'Agent delivers the required compliance statement verbatim.', failureBehaviour: 'Mark process adherence FAIL.', scoreImpact: '-8 points + flag', enabled: true },
  ],
  behaviours: [
    { id: 'b1', name: 'Empathy', description: 'Agent acknowledges and validates customer emotion.', detectionCriteria: 'Empathetic phrases, tone recognition, acknowledgment of emotion.', classification: 'positive', severity: 'minor', scoreImpact: '+1 point', enabled: true },
    { id: 'b2', name: 'Active listening', description: 'Agent demonstrates attentive listening.', detectionCriteria: 'Paraphrasing, follow-up questions, minimal interruptions.', classification: 'positive', severity: 'minor', scoreImpact: '+1 point', enabled: true },
    { id: 'b3', name: 'Ownership', description: 'Agent takes responsibility for resolving the issue.', detectionCriteria: 'Phrases indicating accountability, follows through.', classification: 'positive', severity: 'minor', scoreImpact: '+1 point', enabled: true },
    { id: 'b4', name: 'Professional communication', description: 'Clear, courteous, and professional language.', detectionCriteria: 'Tone, word choice, absence of slang.', classification: 'positive', severity: 'minor', scoreImpact: '+1 point', enabled: true },
    { id: 'b5', name: 'Interruption', description: 'Agent interrupts the customer while speaking.', detectionCriteria: 'Overlapping speech with the customer initiating.', classification: 'negative', severity: 'major', scoreImpact: '-2 points', enabled: true },
    { id: 'b6', name: 'Argumentative behaviour', description: 'Agent becomes argumentative or defensive.', detectionCriteria: 'Defensive tone, contradicting customer aggressively.', classification: 'negative', severity: 'major', scoreImpact: '-2 points', enabled: true },
    { id: 'b7', name: 'Excessive hold', description: 'Customer left on hold for an excessive period.', detectionCriteria: 'Hold duration above threshold without explanation.', classification: 'negative', severity: 'major', scoreImpact: '-2 points', enabled: true },
    { id: 'b8', name: 'False information', description: 'Agent provides false or misleading information.', detectionCriteria: 'Statement contradicts known records.', classification: 'negative', severity: 'critical', scoreImpact: 'Triggers fatal rule', enabled: true },
  ],
  outputSchema: {
    universalBase: [
      { id: 's1', name: 'overall_score', type: 'integer', description: 'Final normalized score from 0-100.', required: true, enum: null, nested: null, arrayOf: null },
      { id: 's2', name: 'parameter_scores', type: 'array', description: 'Score breakdown per parameter.', required: true, enum: null, nested: 'parameter_score', arrayOf: 'object' },
      { id: 's3', name: 'fatal_fail', type: 'boolean', description: 'Whether a fatal rule was triggered.', required: true, enum: null, nested: null, arrayOf: null },
      { id: 's4', name: 'hard_rule_failures', type: 'array', description: 'List of triggered hard rule violations.', required: true, enum: null, nested: null, arrayOf: 'string' },
      { id: 's5', name: 'behaviour_detection', type: 'array', description: 'Detected behaviours with confidence and timestamp.', required: true, enum: null, nested: 'behaviour', arrayOf: 'object' },
      { id: 's6', name: 'recommendations', type: 'array', description: 'AI recommendations for coaching.', required: true, enum: null, nested: null, arrayOf: 'string' },
      { id: 's7', name: 'summary', type: 'string', description: 'Concise evaluation summary of the call.', required: true, enum: null, nested: null, arrayOf: null },
    ],
    customFields: [
      { id: 's8', name: 'sentiment_score', type: 'number', description: 'Aggregate sentiment score -1 to 1.', required: false, enum: null, nested: null, arrayOf: null },
      { id: 's9', name: 'compliance_status', type: 'string', description: 'Overall compliance status.', required: false, enum: ['Compliant', 'Non-Compliant'], nested: null, arrayOf: null },
    ],
  },
}
