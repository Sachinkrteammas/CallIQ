import React from 'react'
import { SlidersHorizontal, X, Bookmark } from 'lucide-react'
import { useFilters } from './FilterContext.jsx'

const PROJECTS = ['All Projects', 'Acme BPO', 'Northwind Bank', 'Zenith Health', 'Orbit Retail']
const QUEUES = ['All Queues', 'Inbound-L1', 'Inbound-L2', 'Outbound-Sales', 'VIP-Support', 'Escalations', 'Technical Support', 'Billing', 'Retention']
const TEAMS = ['All Teams', 'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']
const AGENTS = ['All Agents', 'Priya Sharma', 'Divya Menon', 'Meena Nair', 'Suresh Kumar', 'Amit Verma', 'Ravi Patel']
const DATE_RANGES = ['This Week', 'Last 7 Days', 'Last 30 Days', 'This Month', 'Custom']
const LANGUAGES = ['All Languages', 'English', 'Hindi', 'Tamil', 'Telugu']
const CALL_TYPES = ['All Types', 'Inbound', 'Outbound']
const DISPOSITIONS = ['All Dispositions', 'Resolved', 'Escalated', 'Follow-up', 'Transferred', 'Dropped']
const SEVERITIES = ['All Severities', 'Low', 'Medium', 'High', 'Critical']
const RISK_LEVELS = ['All Risk Levels', 'Low', 'Medium', 'High', 'Critical']

function Select({ label, value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs font-medium bg-white border border-[#E7E2D8] rounded-lg px-2.5 py-1.5 text-[#1D2433] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
    >
      <option value="">{label}</option>
      {options.filter(o => !o.startsWith('All')).map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

export default function FilterBar() {
  const { filters, updateFilter, resetFilters } = useFilters()
  const activeCount = Object.values(filters).filter((v) => v).length

  return (
    <div className="bg-white/90 backdrop-blur border-b border-[#E7E2D8] px-6 py-2 sticky top-14 z-10 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#6B7385] mr-1">
        <SlidersHorizontal size={14} /> Filter:
      </div>
      <Select label="Project ▾" value={filters.project} onChange={(v) => updateFilter('project', v)} options={PROJECTS} />
      <Select label="Queue ▾" value={filters.queue} onChange={(v) => updateFilter('queue', v)} options={QUEUES} />
      <Select label="Team ▾" value={filters.team} onChange={(v) => updateFilter('team', v)} options={TEAMS} />
      <Select label="Agent ▾" value={filters.agent} onChange={(v) => updateFilter('agent', v)} options={AGENTS} />
      <Select label="Date Range ▾" value={filters.date_range} onChange={(v) => updateFilter('date_range', v)} options={DATE_RANGES} />
      <Select label="Language ▾" value={filters.language} onChange={(v) => updateFilter('language', v)} options={LANGUAGES} />
      <Select label="Call Type ▾" value={filters.call_type} onChange={(v) => updateFilter('call_type', v)} options={CALL_TYPES} />
      <Select label="Disposition ▾" value={filters.disposition} onChange={(v) => updateFilter('disposition', v)} options={DISPOSITIONS} />
      <Select label="Severity ▾" value={filters.severity} onChange={(v) => updateFilter('severity', v)} options={SEVERITIES} />
      <Select label="Risk Level ▾" value={filters.risk_level} onChange={(v) => updateFilter('risk_level', v)} options={RISK_LEVELS} />
      <button className="text-xs font-semibold text-[#3457D5] flex items-center gap-1 px-2 py-1.5 border border-[#E7E2D8] rounded-lg hover:bg-[#EEF1FE] transition">
        <Bookmark size={12} /> Saved Views
      </button>
      {activeCount > 0 && (
        <button onClick={resetFilters} className="flex items-center gap-1 text-xs font-semibold text-[#D14343] ml-1">
          <X size={13} /> Clear ({activeCount})
        </button>
      )}
    </div>
  )
}
