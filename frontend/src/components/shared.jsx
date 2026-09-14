import React from 'react'
import { ArrowUpRight, ArrowDownRight, Inbox } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

export function Card({ children, className = '', onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-[#E7E2D8] shadow-sm p-5 ${onClick ? 'cursor-pointer hover:border-[#3457D5]/40 hover:shadow-md transition-all' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function SectionTitle({ children, action, icon: Icon }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-[15px] font-semibold text-[#1D2433] flex items-center gap-2">
        {Icon && <Icon size={16} className="text-[#3457D5]" />}
        {children}
      </h3>
      {action}
    </div>
  )
}

const sevMap = {
  Low: 'bg-[#E7F7EF] text-[#1C9A6C]',
  Medium: 'bg-[#FCF1DF] text-[#C9862B]',
  High: 'bg-[#FBE9E9] text-[#D14343]',
  Critical: 'bg-[#D14343] text-white',
  Minor: 'bg-[#E7F7EF] text-[#1C9A6C]',
  Major: 'bg-[#FCF1DF] text-[#C9862B]',
  Informational: 'bg-[#EEF1FE] text-[#3457D5]',
  Open: 'bg-[#FBE9E9] text-[#D14343]',
  Acknowledged: 'bg-[#FCF1DF] text-[#C9862B]',
  Resolved: 'bg-[#E7F7EF] text-[#1C9A6C]',
}

export function SeverityBadge({ level }) {
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sevMap[level] || 'bg-gray-100 text-gray-600'}`}>
      {level}
    </span>
  )
}

export function Trend({ value }) {
  const up = value >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-[#1C9A6C]' : 'text-[#D14343]'}`}>
      {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {Math.abs(value)}%
    </span>
  )
}

export function Sparkline({ data, color = '#3457D5' }) {
  const points = (data || []).map((v, i) => ({ i, v }))
  return (
    <div className="h-8 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points}>
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export function KpiCard({ label, value, unit, trend, spark, onClick, filterKey }) {
  const navigate = useNavigate()
  const handleClick = onClick || (filterKey ? () => navigate(`/calls?tag=${filterKey}`) : undefined)
  return (
    <Card onClick={handleClick} className="min-w-[160px]">
      <div className="text-xs text-[#6B7385] font-medium mb-1">{label}</div>
      <div className="flex items-end justify-between">
        <div className="text-2xl font-bold text-[#1D2433]">{value}<span className="text-sm font-medium text-[#6B7385] ml-0.5">{unit || ''}</span></div>
        {trend !== undefined && <Trend value={trend} />}
      </div>
      {spark && <div className="mt-2"><Sparkline data={spark} /></div>}
    </Card>
  )
}

export function ProgressBar({ label, value, max = 100, color }) {
  const pct = Math.min(100, (value / max) * 100)
  const barColor = color || (pct >= 75 ? '#1C9A6C' : pct >= 50 ? '#C9862B' : '#D14343')
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[#1D2433] font-medium">{label}</span>
        <span className="text-[#6B7385] font-semibold">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-[#F0EDE4] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
      </div>
    </div>
  )
}

export function Gauge({ value = 0, size = 200 }) {
  const band = value >= 80 ? { color: '#1C9A6C', label: 'Good' } : value >= 60 ? { color: '#C9862B', label: 'Needs Attention' } : { color: '#D14343', label: 'Critical' }
  const r = 80
  const c = Math.PI * r
  const offset = c - (value / 100) * c
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 1.7} viewBox="0 0 200 120">
        <path d="M20,110 A80,80 0 0,1 180,110" fill="none" stroke="#EEEBE2" strokeWidth="16" strokeLinecap="round" />
        <path
          d="M20,110 A80,80 0 0,1 180,110"
          fill="none"
          stroke={band.color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x="100" y="95" textAnchor="middle" fontSize="34" fontWeight="800" fill="#1D2433">{value}</text>
      </svg>
      <div className="text-sm font-semibold mt-1" style={{ color: band.color }}>{band.label}</div>
    </div>
  )
}

export function CircleScore({ value, size = 64, label }) {
  const r = (size - 8) / 2
  const c = 2 * Math.PI * r
  const offset = c - (value / 100) * c
  const color = value >= 80 ? '#1C9A6C' : value >= 60 ? '#C9862B' : '#D14343'
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#EEEBE2" strokeWidth="5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset} transform={`rotate(-90 ${size/2} ${size/2})`} />
        <text x={size/2} y={size/2 + 1} textAnchor="middle" dominantBaseline="middle" fontSize={size * 0.22} fontWeight="700" fill="#1D2433">{value}</text>
      </svg>
      {label && <span className="text-[10px] text-[#6B7385] font-medium mt-1">{label}</span>}
    </div>
  )
}

export function EmptyState({ text = 'Nothing to show here yet.', icon: Icon = Inbox }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-12 h-12 rounded-full bg-[#EEF1FE] flex items-center justify-center mb-3">
        <Icon size={22} className="text-[#3457D5]" />
      </div>
      <p className="text-sm text-[#6B7385] font-medium max-w-xs">{text}</p>
    </div>
  )
}

export function Pill({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${active ? 'bg-[#16213E] text-white border-[#16213E]' : 'bg-white text-[#6B7385] border-[#E7E2D8] hover:border-[#3457D5]/40'}`}
    >
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`w-11 h-6 rounded-full relative transition-colors ${checked ? 'bg-[#1C9A6C]' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}
