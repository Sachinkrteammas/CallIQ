import React, { useState } from 'react'
import { Field, TextInput, Select, AddBtn, IconBtn, Toggle } from './ui.jsx'
import { OUTPUT_TYPES } from './config.js'
import { Plus, Trash2, Lock, Edit3 } from 'lucide-react'

const uid = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

function FieldEditor({ field, onChange, onRemove, locked }) {
  const set = (k, v) => onChange({ ...field, [k]: v })
  return (
    <div className="border border-[#E7E2D8] rounded-lg p-2.5 bg-[#FBF9F3] mb-2">
      <div className="grid grid-cols-12 gap-2 mb-2">
        <Field label="Field name" className="col-span-5">
          <TextInput value={field.name} disabled={locked} onChange={(e) => set('name', e.target.value)} />
        </Field>
        <Field label="Type" className="col-span-3">
          <Select value={field.type} onChange={(e) => set('type', e.target.value)} options={OUTPUT_TYPES} />
        </Field>
        <Field label="Array of" className="col-span-2">
          <TextInput value={field.arrayOf || ''} placeholder="element" onChange={(e) => set('arrayOf', e.target.value)} />
        </Field>
        <div className="col-span-2 flex items-end justify-end pb-1">
          {!locked && <IconBtn danger onClick={onRemove} title="Delete field"><Trash2 size={14} /></IconBtn>}
        </div>
      </div>
      <Field label="Description" className="mb-2">
        <TextInput value={field.description} onChange={(e) => set('description', e.target.value)} placeholder="Purpose of this field" />
      </Field>
      <div className="flex items-center gap-4">
        <Field label="Enum values (comma separated)" className="flex-1">
          <TextInput value={(field.enum || []).join(', ')} onChange={(e) => set('enum', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />
        </Field>
        <label className="flex items-center gap-1.5 text-[11px] text-[#1D2433] font-medium pt-5">
          <Toggle checked={!!field.required} onChange={(v) => set('required', v)} /> Required
        </label>
      </div>
    </div>
  )
}

export default function OutputSchemaBuilder({ schema, update }) {
  const [editing, setEditing] = useState({})
  const [tab, setTab] = useState('universal')

  const setTabData = (key, val) => update({ ...schema, [key]: val })

  const addField = (key) => {
    const nf = { id: uid(), name: '', type: 'string', description: '', required: true, enum: [], nested: null, arrayOf: null }
    setTabData(key, [...(schema[key] || []), nf])
    setEditing((s) => ({ ...s, [nf.id]: true }))
  }

  const setField = (key, id, val) => setTabData(key, (schema[key] || []).map((f) => (f.id === id ? val : f)))
  const removeField = (key, id) => setTabData(key, (schema[key] || []).filter((f) => f.id !== id))

  const renderBlock = (fields, key, locked) => (
    <div className="border border-[#E7E2D8] rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-xs font-bold text-[#1D2433]">
          {locked && <Lock size={12} className="text-[#C9862B]" />}
          {locked ? 'Universal base fields' : 'Custom fields'}
        </span>
        {!locked && <AddBtn variant="secondary" onClick={() => addField(key)}><Plus size={12} /> Add field</AddBtn>}
      </div>
      <div className="space-y-2">
        {fields.map((f) => (
          editing[f.id] ? (
            <FieldEditor key={f.id} field={f} locked={locked} onChange={(v) => setField(key, f.id, v)} onRemove={() => removeField(key, f.id)} />
          ) : (
            <div key={f.id} className="flex items-center gap-2.5 border border-[#E7E2D8] rounded-lg px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono font-semibold text-[#1D2433]">{f.name}</span>
                  <span className="text-[9px] font-mono bg-[#EEF1FE] text-[#3457D5] px-1.5 py-0.5 rounded">{f.type}{f.arrayOf ? `<${f.arrayOf}>` : ''}</span>
                  {f.required && <span className="text-[9px] text-[#D14343] font-semibold">required</span>}
                </div>
                <div className="text-[10px] text-[#6B7385] truncate">{f.description || (f.enum && f.enum.length ? `enum: ${f.enum.join(' | ')}` : '')}</div>
              </div>
              <IconBtn onClick={() => setEditing((s) => ({ ...s, [f.id]: !s[f.id] }))} title="Edit"><Edit3 size={13} /></IconBtn>
            </div>
          )
        ))}
        {fields.length === 0 && <p className="text-[11px] text-[#6B7385] py-2">No fields.</p>}
      </div>
    </div>
  )

  const universal = schema.universalBase || []
  const custom = schema.customFields || []

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-bold text-[#1D2433]">Output Schema Builder</h4>
          <p className="text-[11px] text-[#6B7385]">Define the structured JSON fields the AI must return.</p>
        </div>
        <div className="flex gap-1 bg-[#F7F4EE] border border-[#E7E2D8] rounded-lg p-0.5">
          {['universal', 'custom'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition ${tab === t ? 'bg-white shadow-sm text-[#1D2433]' : 'text-[#6B7385]'}`}
            >
              {t === 'universal' ? `Universal (${universal.length})` : `Custom (${custom.length})`}
            </button>
          ))}
        </div>
      </div>
      {tab === 'universal' ? renderBlock(universal, 'universalBase', true) : renderBlock(custom, 'customFields', false)}
      <pre className="mt-3 bg-[#1D2433] text-[#E7E2D8] text-[11px] font-mono rounded-lg p-3 overflow-x-auto whitespace-pre">
{`{
${[...universal, ...custom].map((f) => `  "${f.name}": ${f.type === 'array' ? (f.arrayOf ? `[ ${f.arrayOf} ]` : '[ ... ]') : f.type === 'boolean' ? 'boolean' : f.type === 'integer' ? 'number' : f.type === 'object' ? '{ ... }' : `"${f.type}"`}${f.required ? '' : '?'}`).join(',\n')}
}`}
      </pre>
    </div>
  )
}
