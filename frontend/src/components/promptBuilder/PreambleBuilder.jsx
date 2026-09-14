import React, { useState } from 'react'
import { Field, TextInput, TextArea, IconBtn } from './ui.jsx'
import { Plus, Trash2, ChevronDown } from 'lucide-react'

function RuleRow({ value, onChange, onRemove }) {
  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        <TextInput value={value} placeholder="Rule or instruction" onChange={(e) => onChange(e.target.value)} />
      </div>
      <IconBtn danger onClick={onRemove} title="Remove rule"><Trash2 size={14} /></IconBtn>
    </div>
  )
}

export default function PreambleBuilder({ preamble, update }) {
  const [open, setOpen] = useState(true)

  const set = (key, val) => update({ ...preamble, [key]: val })
  const setRule = (i, val) => {
    const rules = [...(preamble.generalRules || [])]
    rules[i] = val
    set('generalRules', rules)
  }
  const addRule = () => set('generalRules', [...(preamble.generalRules || []), ''])
  const removeRule = (i) => set('generalRules', (preamble.generalRules || []).filter((_, x) => x !== i))

  return (
    <div className="border border-[#E7E2D8] rounded-xl">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#F7F4EE] rounded-t-xl"
      >
        <span className="text-sm font-bold text-[#1D2433]">Prompt Preamble</span>
        <span className="flex items-center gap-2">
          <span className="text-[10px] text-[#6B7385] font-medium">Global instructions for the AI auditor</span>
          <ChevronDown size={15} className={`text-[#6B7385] transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="p-4 grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <Field label="Role / Instructions">
              <TextArea rows={2} value={preamble.role || ''} onChange={(e) => set('role', e.target.value)} />
            </Field>
            <Field label="Evaluation Objective">
              <TextArea rows={2} value={preamble.objective || ''} onChange={(e) => set('objective', e.target.value)} />
            </Field>
            <Field label="Scope">
              <TextArea rows={2} value={preamble.scope || ''} onChange={(e) => set('scope', e.target.value)} />
            </Field>
          </div>
          <div className="space-y-3">
            <Field label="General Rules">
              <div className="space-y-2">
                {(preamble.generalRules || []).map((r, i) => (
                  <RuleRow key={i} value={r} onChange={(v) => setRule(i, v)} onRemove={() => removeRule(i)} />
                ))}
                <button
                  type="button"
                  onClick={addRule}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3457D5] hover:underline"
                >
                  <Plus size={13} /> Add rule
                </button>
              </div>
            </Field>
            <Field label="Scoring Instructions">
              <TextArea rows={2} value={preamble.scoringInstructions || ''} onChange={(e) => set('scoringInstructions', e.target.value)} />
            </Field>
            <Field label="Transcript Interpretation">
              <TextArea rows={2} value={preamble.transcriptInterpretation || ''} onChange={(e) => set('transcriptInterpretation', e.target.value)} />
            </Field>
            <Field label="Additional Constraints">
              <TextArea rows={2} value={preamble.constraints || ''} onChange={(e) => set('constraints', e.target.value)} />
            </Field>
          </div>
        </div>
      )}
    </div>
  )
}
