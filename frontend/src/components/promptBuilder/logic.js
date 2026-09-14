import { SCORING_TYPES, SEVERITY_TEXT } from './config.js'

export function prettyLabel(str) {
  return String(str || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

function scoringLabel(type) {
  const t = SCORING_TYPES.find((s) => s.value === type)
  return t ? t.label : prettyLabel(type)
}

function scoringGuide(type) {
  if (type === 'numeric') return 'Assign a score from 0 to 100.'
  if (type === 'boolean') return 'Assign YES (full) or NO (zero).'
  return 'Assign PASS (5), PARTIAL (2.5), or FAIL (0).'
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function assemblePrompt(config) {
  if (!config) return ''
  const { preamble = {}, parameters = [], fatalRules = [], hardRules = [], behaviours = [], outputSchema = {} } = config
  const p = preamble || {}
  const universal = outputSchema.universalBase || []
  const custom = outputSchema.customFields || []

  const lines = []
  lines.push(`You are an expert QA auditor.`)
  if (p.objective) lines.push('')
  lines.push(`TASK`)
  lines.push(escapeHtml(p.objective || 'Evaluate the customer service call transcript.'))

  if ((p.scope || '').trim()) {
    lines.push('')
    lines.push(`SCOPE`)
    lines.push(escapeHtml(p.scope))
  }

  if (p.generalRules && p.generalRules.length) {
    lines.push('')
    lines.push(`GENERAL RULES`)
    p.generalRules.forEach((r) => lines.push(`- ${escapeHtml(r)}`))
  }

  if ((p.role || '').trim()) {
    lines.push('')
    lines.push(`ROLE & BEHAVIOUR`)
    lines.push(escapeHtml(p.role))
  }

  if ((p.scoringInstructions || '').trim()) {
    lines.push('')
    lines.push(`SCORING INSTRUCTIONS`)
    lines.push(escapeHtml(p.scoringInstructions))
  }

  if (parameters && parameters.length) {
    lines.push('')
    lines.push(`PARAMETERS`)
    parameters.forEach((param, idx) => {
      lines.push('')
      lines.push(`${idx + 1}. ${escapeHtml(param.name)}  [Weight: ${param.weight}%]`)
      if ((param.description || '').trim()) lines.push(`   ${escapeHtml(param.description)}`)
      if (param.questions && param.questions.length) {
        lines.push(`   Evaluation criteria:`)
        param.questions.forEach((q) => {
          lines.push(`   - ${escapeHtml(q.name)} (${q.weight}%)`)
          if ((q.criteria || '').trim()) lines.push(`       ${escapeHtml(q.criteria)}`)
          lines.push(`       Scoring: ${scoringLabel(q.scoringType)}`)
          if (q.fatal) lines.push(`       [FATAL]`)
          if (q.hardRule) lines.push(`       [HARD RULE]`)
          if (q.evidenceRequired) lines.push(`       [Evidence required]`)
        })
      }
    })
  }

  if (hardRules && hardRules.length) {
    lines.push('')
    lines.push(`HARD RULES`)
    hardRules.forEach((h) => {
      lines.push(`- ${escapeHtml(h.name)}`)
      lines.push(`    IF: ${escapeHtml(h.condition)}`)
      lines.push(`    THEN: ${escapeHtml(h.expectedBehaviour)} → ${escapeHtml(h.failureBehaviour)}`)
      if ((h.scoreImpact || '').trim()) lines.push(`    Score impact: ${escapeHtml(h.scoreImpact)}`)
    })
  }

  if (fatalRules && fatalRules.length) {
    lines.push('')
    lines.push(`FATAL RULES`)
    fatalRules.forEach((f) => {
      lines.push(`- ${escapeHtml(f.name)} [${SEVERITY_TEXT[f.severity] || f.severity}]`)
      lines.push(`    IF: ${escapeHtml(f.detectionCondition)}`)
      lines.push(`    THEN: FATAL FAILURE = TRUE → ${escapeHtml(f.action)}`)
      if ((f.scoreImpact || '').trim()) lines.push(`    Impact: ${escapeHtml(f.scoreImpact)}`)
    })
  }

  if (behaviours && behaviours.length) {
    lines.push('')
    lines.push(`BEHAVIOUR DETECTION`)
    const pos = behaviours.filter((b) => b.classification === 'positive')
    const neg = behaviours.filter((b) => b.classification === 'negative')
    if (pos.length) {
      lines.push(`Detect and reward positive behaviours:`)
      pos.forEach((b) => lines.push(`- ${escapeHtml(b.name)}: ${escapeHtml(b.detectionCriteria)}${(b.scoreImpact || '').trim() ? ` (${escapeHtml(b.scoreImpact)})` : ''}`))
    }
    if (neg.length) {
      lines.push(`Detect and penalize negative behaviours:`)
      neg.forEach((b) => lines.push(`- ${escapeHtml(b.name)}: ${escapeHtml(b.detectionCriteria)}${(b.scoreImpact || '').trim() ? ` (${escapeHtml(b.scoreImpact)})` : ''}`))
    }
  }

  if ((p.transcriptInterpretation || '').trim()) {
    lines.push('')
    lines.push(`TRANSCRIPT INTERPRETATION`)
    lines.push(escapeHtml(p.transcriptInterpretation))
  }

  if ((p.constraints || '').trim()) {
    lines.push('')
    lines.push(`CONSTRAINTS`)
    lines.push(escapeHtml(p.constraints))
  }

  lines.push('')
  lines.push(`OUTPUT FORMAT`)
  lines.push(`Return ONLY valid JSON matching this schema:`)
  lines.push('')
  lines.push(`{`)
  ;[...universal, ...custom].forEach((f, idx) => {
    const comma = idx < universal.length + custom.length - 1 ? ',' : ''
    let typeStr = f.type
    if (f.type === 'array' && f.arrayOf) typeStr = `array<${f.arrayOf}>`
    const req = f.required ? ' (required)' : ''
    const enumStr = f.enum && f.enum.length ? ` enum: ${f.enum.join('|')}` : ''
    lines.push(`  "${f.name}": <${typeStr}>${req}${enumStr}${comma}`)
  })
  lines.push(`}`)

  if ((p.scoringInstructions || '').trim()) {
    lines.push('')
    lines.push(`Scoring reference for each question`)
    lines.push(scoringGuide('pass_partial_fail'))
  }

  return lines.join('\n')
}

export function validatePrompt(config) {
  const errors = []
  const warnings = []
  if (!config) return { errors, warnings }

  const { preamble = {}, parameters = [], fatalRules = [], hardRules = [], outputSchema = {} } = config

  const paramTotal = parameters.reduce((sum, p) => sum + (Number(p.weight) || 0), 0)
  if (parameters.length && paramTotal !== 100) {
    errors.push(`Parameter weights must total 100% (currently ${paramTotal}%).`)
  }

  if (!preamble.role || !preamble.role.trim()) {
    warnings.push('Preamble is missing a role/instructions.')
  }
  if (!preamble.objective || !preamble.objective.trim()) {
    warnings.push('Preamble is missing an evaluation objective.')
  }

  const seenParam = new Map()
  parameters.forEach((param) => {
    if (!param.name || !param.name.trim()) {
      errors.push('A parameter is missing a name.')
    } else if (seenParam.has(param.name.trim().toLowerCase())) {
      errors.push(`Duplicate parameter: "${param.name}".`)
    }
    seenParam.set(param.name.trim().toLowerCase(), true)

    const qTotal = (param.questions || []).reduce((sum, q) => sum + (Number(q.weight) || 0), 0)
    if (param.questions && param.questions.length && qTotal !== 100) {
      errors.push(`"${param.name}" question weights must total 100% (currently ${qTotal}%).`)
    }
    const seenQ = new Map()
    ;(param.questions || []).forEach((q) => {
      if (!q.name || !q.name.trim()) {
        errors.push(`"${param.name}" contains a question without a name.`)
      } else if (seenQ.has(q.name.trim().toLowerCase())) {
        errors.push(`Duplicate question: "${q.name}" in "${param.name}".`)
      }
      seenQ.set(q.name.trim().toLowerCase(), true)
      if (!q.criteria || !q.criteria.trim()) {
        errors.push(`"${param.name}" · "${q.name}" is missing evaluation criteria.`)
      }
      if (q.required && !q.scoringType) {
        warnings.push(`"${param.name}" · "${q.name}" has no scoring type.`)
      }
    })
  })

  fatalRules.forEach((f) => {
    if (!f.detectionCondition || !f.detectionCondition.trim()) {
      errors.push(`Fatal rule "${f.name || 'Unnamed'}" is missing a detection condition.`)
    }
  })

  hardRules.forEach((h) => {
    if (!h.condition || !h.condition.trim()) {
      errors.push(`Hard rule "${h.name || 'Unnamed'}" is missing a condition.`)
    }
    if (!h.expectedBehaviour || !h.expectedBehaviour.trim()) {
      warnings.push(`Hard rule "${h.name || 'Unnamed'}" is missing expected behaviour.`)
    }
  })

  const base = outputSchema.universalBase || []
  const custom = outputSchema.customFields || []
  if (!base.length && !custom.length) {
    errors.push('Output schema is missing. Add at least one output field.')
  }
  const schemaNames = [...base, ...custom].map((s) => (s.name || '').trim().toLowerCase())
  const dupSchema = schemaNames.filter((n, i) => n && schemaNames.indexOf(n) !== i)
  if (dupSchema.length) {
    errors.push(`Duplicate output schema field: "${dupSchema[0]}".`)
  }

  return { errors, warnings }
}
