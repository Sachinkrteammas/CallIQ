import React, { useState } from 'react'
import { Field, TextInput, TextArea, Select, AddBtn, IconBtn, Toggle, SevBadge } from './ui.jsx'
import { SEVERITIES } from './config.js'
import { Plus, Trash2, ShieldX, ShieldAlert, Edit3, Check } from 'lucide-react'

const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const ACTION_OPTIONS = [
  { value: 'fail', label: 'Fatal fail (auto-fail)' },
  { value: 'penalize', label: 'Severe penalty' },
  { value: 'flag', label: 'Flag for review only' },
  { value: 'escalate', label: 'Escalate to management' },
]

function RuleEditor({ rule, onChange, onRemove, kind }) {
  const set = (k, v) => onChange({ ...rule, [k]: v })
  return (
    <div className="border border-[#E7E2D8] rounded-lg p-3 bg-[#FBF9F3] mb-2">
      <div className="grid grid-cols-2 gap-3 mb-2">
        <Field label="Rule name" required>
          <TextInput value={rule.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label={kind === 'fatal' ? 'Severity' : 'Score impact'}>
          {kind === 'fatal' ? (
            <Select value={rule.severity} onChange={(e) => set('severity', e.target.value)} options={SEVERITIES} />
          ) : (
            <TextInput value={rule.scoreImpact} onChange={(e) => set('scoreImpact', e.target.value)} />
          )}
        </Field>
      </div>
      <Field label={kind === 'fatal' ? 'Detection condition' : 'Condition'}>
        <TextArea rows={2} value={kind === 'fatal' ? rule.detectionCondition : rule.condition} onChange={(e) => set(kind === 'fatal' ? 'detectionCondition' : 'condition', e.target.value)} />
      </Field>
      {kind === 'fatal' ? (
        <div className="grid grid-cols-2 gap-3 mt-2">
          <Field label="Action on trigger">
            <Select value={rule.action} onChange={(e) => set('action', e.target.value)} options={ACTION_OPTIONS} />
          </Field>
          <Field label="Score impact">
            <TextInput value={rule.scoreImpact} onChange={(e) => set('scoreImpact', e.target.value)} />
          </Field>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mt-2">
          <Field label="Expected behaviour">
            <TextArea rows={2} value={rule.expectedBehaviour} onChange={(e) => set('expectedBehaviour', e.target.value)} />
          </Field>
          <Field label="Failure behaviour">
            <TextArea rows={2} value={rule.failureBehaviour} onChange={(e) => set('failureBehaviour', e.target.value)} />
          </Field>
        </div>
      )}
      <div className="flex items-center justify-between mt-3">
        <label className="flex items-center gap-2 text-[11px] text-[#1D2433] font-medium">
          <Toggle checked={!!rule.enabled} onChange={(v) => set('enabled', v)} /> Enabled
        </label>
        <div className="flex items-center gap-1">
          <IconBtn danger onClick={onRemove} title="Delete rule"><Trash2 size={14} /></IconBtn>
        </div>
      </div>
    </div>
  )
}

export default function RulesConfigurator({ kind, rules, update }) {
  const [editing, setEditing] = useState({})
  const isFatal = kind === 'fatal'
  const accentColor = isFatal ? '#D14343' : '#C9862B'
  const icon = isFatal ? ShieldX : ShieldAlert

  const addRule = () => {
    const base = isFatal
      ? { id: uid('f'), name: '', description: '', detectionCondition: '', severity: 'critical', action: 'fail', scoreImpact: '', enabled: true }
      : { id: uid('h'), name: '', condition: '', expectedBehaviour: '', failureBehaviour: '', scoreImpact: '', enabled: true }
    update([...rules, base])
    setEditing((s) => ({ ...s, [base.id]: true }))
  }

  const setRule = (id, val) => update(rules.map((r) => (r.id === id ? val : r)))
  const removeRule = (id) => {
    update(rules.filter((r) => r.id !== id))
    const { [id]: _, ...rest } = editing
    setEditing(rest)
  }

  return (
    <div className="border border-[#E7E2D8] rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          {icon === ShieldX ? <ShieldX size={18} style={{ color: accentColor }} /> : <ShieldAlert size={18} style={{ color: accentColor }} />}
          <h4 className="text-sm font-bold text-[#1D2433]">{isFatal ? 'Fatal Rules Configurator' : 'Hard Rules Configurator'}</h4>
        </div>
        <AddBtn onClick={addRule}><Plus size={13} /> Add {isFatal ? 'fatal' : 'hard'} rule</AddBtn>
      </div>
      <p className="text-[11px] text-[#6B7385] mb-3">
        {isFatal
          ? 'Fatal rules force an automatic failure regardless of the normal score when a specific condition occurs.'
          : 'Hard rules are deterministic evaluation constraints that must be enforced during audit.'}
      </p>

      <div className="space-y-2">
        {rules.map((r) => {
          if (editing[r.id]) {
            return (
              <RuleEditor
                key={r.id}
                kind={kind}
                rule={r}
                onChange={(v) => setRule(r.id, v)}
                onRemove={() => removeRule(r.id)}
              />
            )
          }
          return (
            <div key={r.id} className="flex items-center gap-3 border border-[#E7E2D8] rounded-lg px-3 py-2.5">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0"
                style={{ background: accentColor }}
              >
                {icon === ShieldX ? <ShieldX size={15} /> : <ShieldAlert size={15} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-[#1D2433]">{r.name || 'Untitled rule'}</span>
                  {isFatal && <SevBadge value={r.severity} />}
                  {!r.enabled && <span className="text-[9px] font-semibold text-[#6B7385]">DISABLED</span>}
                </div>
                <div className="text-[10px] text-[#6B7385] truncate">
                  {isFatal ? r.detectionCondition : r.condition || 'No condition set'}
                </div>
                {!isFatal && <div className="text-[10px] text-[#C9862B] font-medium">Impact: {r.scoreImpact || '—'}</div>}
              </div>
              <IconBtn onClick={() => setEditing((s) => ({ ...s, [r.id]: true }))} title="Edit rule">
                <Edit3 size={13} />
              </IconBtn>
              <Toggle checked={!!r.enabled} onChange={(v) => setRule(r.id, { ...r, enabled: v })} />
              <IconBtn danger onClick={() => removeRule(r.id)} title="Delete"><Trash2 size={14} /></IconBtn>
            </div>
          )
        })}
        {rules.length === 0 && (
          <p className="text-[11px] text-[#6B7385] py-2">No {isFatal ? 'fatal' : 'hard'} rules configured.</p>
        )}
      </div>
    </div>
  )
}
