import React, { useState } from 'react'
import { Field, TextInput, TextArea, Select, AddBtn, IconBtn, Toggle, SevBadge } from './ui.jsx'
import { SEVERITIES } from './config.js'
import { Plus, Trash2, ThumbsUp, ThumbsDown, Edit3 } from 'lucide-react'

const uid = () => `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export default function BehaviourDetector({ behaviours, update }) {
  const [editing, setEditing] = useState({})

  const setBehaviour = (id, val) => update(behaviours.map((b) => (b.id === id ? val : b)))
  const removeBehaviour = (id) => {
    update(behaviours.filter((b) => b.id !== id))
    const { [id]: _, ...rest } = editing
    setEditing(rest)
  }
  const addBehaviour = (classification) => {
    const nb = { id: uid(), name: '', description: '', detectionCriteria: '', classification, severity: classification === 'positive' ? 'minor' : 'major', scoreImpact: '', enabled: true }
    update([...behaviours, nb])
    setEditing((s) => ({ ...s, [nb.id]: true }))
  }

  const groups = {
    positive: behaviours.filter((b) => b.classification === 'positive'),
    negative: behaviours.filter((b) => b.classification === 'negative'),
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-bold text-[#1D2433]">Behaviour Detection</h4>
          <p className="text-[11px] text-[#6B7385]">Define behaviours the AI should detect from transcripts, classified as positive or negative.</p>
        </div>
        <div className="flex gap-2">
          <AddBtn variant="secondary" onClick={() => addBehaviour('positive')}><ThumbsUp size={13} /> Positive</AddBtn>
          <AddBtn onClick={() => addBehaviour('negative')}><ThumbsDown size={13} /> Negative</AddBtn>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {['positive', 'negative'].map((cls) => (
          <div key={cls} className="border border-[#E7E2D8] rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              {cls === 'positive'
                ? <ThumbsUp size={15} className="text-[#1C9A6C]" />
                : <ThumbsDown size={15} className="text-[#D14343]" />}
              <span className="text-xs font-bold uppercase tracking-wide text-[#1D2433]">{cls} behaviours</span>
              <span className="text-[10px] text-[#6B7385]">{groups[cls].length}</span>
            </div>
            <div className="space-y-2">
              {groups[cls].map((b) => {
                if (editing[b.id]) {
                  return (
                    <div key={b.id} className="border border-[#E7E2D8] rounded-lg p-2.5 bg-[#FBF9F3]">
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <Field label="Behaviour name"><TextInput value={b.name} onChange={(e) => setBehaviour(b.id, { ...b, name: e.target.value })} /></Field>
                        <Field label="Severity">
                          <Select value={b.severity} onChange={(e) => setBehaviour(b.id, { ...b, severity: e.target.value })} options={SEVERITIES} />
                        </Field>
                      </div>
                      <Field label="Description" className="mb-2">
                        <TextArea rows={2} value={b.description} onChange={(e) => setBehaviour(b.id, { ...b, description: e.target.value })} />
                      </Field>
                      <Field label="Detection criteria">
                        <TextArea rows={2} value={b.detectionCriteria} onChange={(e) => setBehaviour(b.id, { ...b, detectionCriteria: e.target.value })} />
                      </Field>
                      <Field label="Score impact" className="mt-2">
                        <TextInput value={b.scoreImpact} onChange={(e) => setBehaviour(b.id, { ...b, scoreImpact: e.target.value })} />
                      </Field>
                      <div className="flex items-center justify-between mt-2">
                        <label className="flex items-center gap-2 text-[11px] text-[#1D2433] font-medium">
                          <Toggle checked={!!b.enabled} onChange={(v) => setBehaviour(b.id, { ...b, enabled: v })} /> Enabled
                        </label>
                        <IconBtn danger onClick={() => removeBehaviour(b.id)} title="Delete"><Trash2 size={13} /></IconBtn>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={b.id} className="flex items-center gap-2.5 border border-[#E7E2D8] rounded-lg px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#1D2433]">{b.name || 'Untitled behaviour'}</span>
                        <SevBadge value={b.severity} />
                      </div>
                      <div className="text-[10px] text-[#6B7385] truncate">{b.detectionCriteria || 'No detection criteria'}</div>
                    </div>
                    <IconBtn onClick={() => setEditing((s) => ({ ...s, [b.id]: true }))} title="Edit"><Edit3 size={13} /></IconBtn>
                    <Toggle checked={!!b.enabled} onChange={(v) => setBehaviour(b.id, { ...b, enabled: v })} />
                  </div>
                )
              })}
              {groups[cls].length === 0 && <p className="text-[11px] text-[#6B7385] py-2">No {cls} behaviours.</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
