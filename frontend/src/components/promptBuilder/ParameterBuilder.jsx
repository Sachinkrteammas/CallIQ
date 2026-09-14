import React, { useState } from 'react'
import { Field, TextInput, TextArea, Select, IconBtn, AddBtn, PvBadge, Toggle } from './ui.jsx'
import { PRIORITY_LEVELS, SCORING_TYPES } from './config.js'
import { ChevronDown, Plus, Trash2, GripVertical, Flag, ShieldAlert, FileSearch } from 'lucide-react'

const uid = (p) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

function QuestionEditor({ param, q, onChange, onRemove }) {
  const set = (key, val) => onChange({ ...q, [key]: val })
  return (
    <div className="border border-[#E7E2D8] rounded-lg p-3 bg-[#FBF9F3] mb-2">
      <div className="grid grid-cols-12 gap-2 mb-2">
        <Field label="Question name" className="col-span-5">
          <TextInput value={q.name} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Weight %" className="col-span-2">
          <TextInput type="number" min={0} max={100} value={q.weight} onChange={(e) => set('weight', Number(e.target.value))} />
        </Field>
        <Field label="Priority" className="col-span-3">
          <Select value={q.priority} onChange={(e) => set('priority', e.target.value)} options={PRIORITY_LEVELS} />
        </Field>
        <div className="col-span-2 flex items-end justify-end pb-1">
          <IconBtn danger onClick={onRemove} title="Delete question"><Trash2 size={14} /></IconBtn>
        </div>
      </div>
      <Field label="Evaluation criteria" className="mb-2">
        <TextArea rows={2} value={q.criteria} onChange={(e) => set('criteria', e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-3 items-center">
        <Field label="Scoring type">
          <Select value={q.scoringType} onChange={(e) => set('scoringType', e.target.value)} options={SCORING_TYPES} />
        </Field>
        <div className="flex items-center gap-4 pt-5">
          <label className="flex items-center gap-1.5 text-[11px] text-[#1D2433] font-medium">
            <Toggle checked={!!q.required} onChange={(v) => set('required', v)} /> Required
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-[#1D2433] font-medium">
            <Toggle checked={!!q.fatal} onChange={(v) => set('fatal', v)} /> Fatal
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-[#1D2433] font-medium">
            <Toggle checked={!!q.hardRule} onChange={(v) => set('hardRule', v)} /> Hard rule
          </label>
          <label className="flex items-center gap-1.5 text-[11px] text-[#1D2433] font-medium">
            <Toggle checked={!!q.evidenceRequired} onChange={(v) => set('evidenceRequired', v)} /> Evidence
          </label>
        </div>
      </div>
    </div>
  )
}

function QuestionRow({ q, onEdit }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[#F1EDE2] last:border-0">
      <GripVertical size={13} className="text-[#D8D2C4] shrink-0" />
      <span className="text-[10px] font-bold text-[#3457D5] w-8 shrink-0">{q.weight}%</span>
      <button onClick={onEdit} className="text-xs font-medium text-[#1D2433] hover:text-[#3457D5] text-left flex-1 hover:underline">
        {q.name || 'Untitled question'}
      </button>
      <div className="flex items-center gap-1.5">
        {q.fatal && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#D14343]"><Flag size={11} />FATAL</span>}
        {q.hardRule && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#C9862B]"><ShieldAlert size={11} />HARD</span>}
        {q.evidenceRequired && <span className="inline-flex items-center gap-1 text-[9px] font-bold text-[#3457D5]"><FileSearch size={11} />EVID</span>}
        <PvBadge value={q.priority} />
        <span className="text-[10px] text-[#6B7385]">{SCORING_TYPES.find((s) => s.value === q.scoringType)?.label.split(' ')[0] || ''}</span>
      </div>
    </div>
  )
}

export default function ParameterBuilder({ parameters, update }) {
  const [expanded, setExpanded] = useState({})
  const [editing, setEditing] = useState({})

  const setParam = (id, val) => update(parameters.map((p) => (p.id === id ? val : p)))
  const toggleExpand = (id) => setExpanded((s) => ({ ...s, [id]: !s[id] }))

  const addParameter = () => {
    const np = {
      id: uid('p'),
      name: '',
      description: '',
      weight: 0,
      priority: 'normal',
      evaluationType: 'pass_partial_fail',
      questions: [],
    }
    update([...parameters, np])
    setExpanded((s) => ({ ...s, [np.id]: true }))
  }

  const removeParameter = (id) => {
    update(parameters.filter((p) => p.id !== id))
    const { [id]: _, ...rest } = expanded
    setExpanded(rest)
  }

  const addQuestion = (param) => {
    setParam(param.id, {
      ...param,
      questions: [
        ...(param.questions || []),
        { id: uid('q'), name: '', criteria: '', weight: 0, priority: 'normal', scoringType: 'pass_partial_fail', required: true, fatal: false, hardRule: false, evidenceRequired: false },
      ],
    })
  }

  const setQuestion = (param, qid, val) => {
    setParam(param.id, { ...param, questions: (param.questions || []).map((q) => (q.id === qid ? val : q)) })
  }

  const removeQuestion = (param, qid) => {
    setParam(param.id, { ...param, questions: (param.questions || []).filter((q) => q.id !== qid) })
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-bold text-[#1D2433]">Parameters / QA Sections</h4>
          <p className="text-[11px] text-[#6B7385]">Define major QA categories, their weights, and the questions that measure each.</p>
        </div>
        <AddBtn onClick={addParameter}><Plus size={13} /> Add parameter</AddBtn>
      </div>

      <div className="space-y-3">
        {parameters.map((p) => {
          const isOpen = !!expanded[p.id]
          const isEditing = !!editing[p.id]
          const qTotal = (p.questions || []).reduce((s, q) => s + (Number(q.weight) || 0), 0)
          return (
            <div key={p.id} className="border border-[#E7E2D8] rounded-xl bg-white">
              <div className="flex items-center gap-2 px-4 py-2.5">
                <GripVertical size={15} className="text-[#D8D2C4] shrink-0" />
                <button
                  onClick={() => toggleExpand(p.id)}
                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                >
                  <ChevronDown size={15} className={`text-[#6B7385] transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
                  <span className="text-sm font-semibold text-[#1D2433] truncate">{p.name || 'Untitled parameter'}</span>
                  <PvBadge value={p.priority} />
                </button>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#6B7385]">
                  <span className="w-5 h-5 rounded-full bg-[#EEF1FE] text-[#3457D5] flex items-center justify-center font-bold">{p.weight}%</span>
                  weight
                </span>
                <span className="text-[10px] text-[#6B7385]">{p.questions?.length || 0} questions</span>
                <span className={`text-[10px] font-semibold ${qTotal === 100 ? 'text-[#1C9A6C]' : 'text-[#D14343]'}`}>Q&sum; {qTotal}%</span>
                <IconBtn onClick={() => setEditing((s) => ({ ...s, [p.id]: !s[p.id] }))} title={isEditing ? 'Done editing' : 'Edit'}>
                  <span className="text-[11px] font-semibold">{isEditing ? 'Done' : 'Edit'}</span>
                </IconBtn>
                <IconBtn danger onClick={() => removeParameter(p.id)} title="Delete parameter"><Trash2 size={14} /></IconBtn>
              </div>

              {isEditing && (
                <div className="px-5 pb-4 border-t border-[#F1EDE2] pt-4">
                  <div className="grid grid-cols-12 gap-3 mb-3">
                    <Field label="Parameter name" className="col-span-5">
                      <TextInput value={p.name} onChange={(e) => setParam(p.id, { ...p, name: e.target.value })} />
                    </Field>
                    <Field label="Weight %" className="col-span-2">
                      <TextInput type="number" min={0} max={100} value={p.weight} onChange={(e) => setParam(p.id, { ...p, weight: Number(e.target.value) })} />
                    </Field>
                    <Field label="Priority" className="col-span-3">
                      <Select value={p.priority} onChange={(e) => setParam(p.id, { ...p, priority: e.target.value })} options={PRIORITY_LEVELS} />
                    </Field>
                    <Field label="Evaluation type" className="col-span-2">
                      <Select value={p.evaluationType} onChange={(e) => setParam(p.id, { ...p, evaluationType: e.target.value })} options={SCORING_TYPES} />
                    </Field>
                  </div>
                  <Field label="Description">
                    <TextArea rows={2} value={p.description} onChange={(e) => setParam(p.id, { ...p, description: e.target.value })} />
                  </Field>
                </div>
              )}

              {isOpen && (
                <div className="px-4 pb-4">
                  <div className="border border-[#E7E2D8] rounded-lg overflow-hidden mb-2">
                    {(p.questions || []).map((q) =>
                      editing[p.id] ? (
                        <div key={q.id} className="p-2 border-b border-[#F1EDE2] last:border-0">
                          <QuestionEditor param={p} q={q} onChange={(v) => setQuestion(p, q.id, v)} onRemove={() => removeQuestion(p, q.id)} />
                        </div>
                      ) : (
                        <QuestionRow key={q.id} q={q} onEdit={() => setEditing((s) => ({ ...s, [p.id]: true }))} />
                      )
                    )}
                    {(p.questions || []).length === 0 && (
                      <p className="text-[11px] text-[#6B7385] px-3 py-3">No questions yet. Add a question to this parameter.</p>
                    )}
                  </div>
                  <AddBtn variant="secondary" onClick={() => addQuestion(p)}>
                    <Plus size={13} /> Add question
                  </AddBtn>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
