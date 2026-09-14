import React from 'react'
import { PRIORITY_MAP, SEVERITIES } from './config.js'

export function PvBadge({ value }) {
  const p = PRIORITY_MAP[value] || PRIORITY_MAP.normal
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: p.bg, color: p.color }}>
      {p.label}
    </span>
  )
}

export function SevBadge({ value }) {
  const s = SEVERITIES.find((x) => x.value === value)
  if (!s) return null
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

export function Field({ label, required, children, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-semibold text-[#6B7385] mb-1">
        {label}
        {required && <span className="text-[#D14343] ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[10px] text-[#B0A88F] mt-1">{hint}</span>}
    </label>
  )
}

const inputCls =
  'w-full text-xs text-[#1D2433] bg-white border border-[#E7E2D8] rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30 focus:border-[#3457D5]'

export function TextInput(props) {
  return <input {...props} className={`${inputCls} ${props.className || ''}`} />
}

export function TextArea(props) {
  return <textarea {...props} className={`${inputCls} resize-y ${props.className || ''}`} />
}

export function Select({ value, onChange, options, className = '' }) {
  return (
    <select value={value} onChange={onChange} className={`${inputCls} appearance-none ${className}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-9 h-5 rounded-full relative transition-colors shrink-0 ${checked ? 'bg-[#1C9A6C]' : 'bg-[#D8D2C4]'}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

export function IconBtn({ children, onClick, title, danger }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded-lg border transition text-[#6B7385] ${
        danger ? 'hover:bg-[#FBE9E9] hover:text-[#D14343] hover:border-[#D14343]/30' : 'hover:bg-[#EEF1FE] hover:text-[#3457D5] hover:border-[#3457D5]/30'
      } border-transparent`}
    >
      {children}
    </button>
  )
}

export function AddBtn({ onClick, children, variant = 'primary' }) {
  const base =
    variant === 'primary'
      ? 'bg-[#3457D5] text-white hover:bg-[#2E4AB8]'
      : 'bg-white text-[#3457D5] border border-[#3457D5]/30 hover:bg-[#EEF1FE]'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition ${base}`}
    >
      {children}
    </button>
  )
}

export function BuilderSectionHeader({ title, description, action, icon: Icon }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="flex items-start gap-2.5">
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-[#EEF1FE] flex items-center justify-center text-[#3457D5] shrink-0">
            <Icon size={16} />
          </div>
        )}
        <div>
          <h4 className="text-sm font-bold text-[#1D2433]">{title}</h4>
          {description && <p className="text-[11px] text-[#6B7385] mt-0.5 max-w-xl">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}
