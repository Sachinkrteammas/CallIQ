import React, { useState } from 'react'
import { Search, Bell, Download, ChevronDown, TrendingUp, Headphones } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { USER } from '../data/mock.js'
import { useClientFilter } from './ClientContext.jsx'

export default function Topbar() {
  const [q, setQ] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const navigate = useNavigate()
  const { clientType, setClientType, allClients, isClientUser } = useClientFilter()

  const suggestions = [
    { text: 'CL-60782 — Abusive Language', link: '/calls/CL-60782' },
    { text: 'Amit Verma — Delta team', link: '/agents' },
    { text: 'Critical incidents this week', link: '/incidents' },
    { text: 'Compliance violations', link: '/alerts' },
  ]

  const filtered = q.trim() ? suggestions.filter(s => s.text.toLowerCase().includes(q.toLowerCase())) : suggestions

  const onSearch = (e) => {
    e.preventDefault()
    if (q.trim()) navigate(`/calls?q=${encodeURIComponent(q.trim())}`)
    setShowSearch(false)
  }

  const salesCount = allClients.filter(c => c.type === 'Sales').length
  const serviceCount = allClients.filter(c => c.type === 'Service').length

  return (
    <header className="h-14 bg-white border-b border-[#E7E2D8] flex items-center justify-between px-6 sticky top-0 z-20">
      <div className="relative w-96 max-w-[40vw]">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7385]" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setShowSearch(true) }}
          onFocus={() => setShowSearch(true)}
          onBlur={() => setTimeout(() => setShowSearch(false), 200)}
          placeholder="Search calls, agents, IDs..."
          className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[#F7F4EE] border border-[#E7E2D8] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
        />
        {showSearch && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-[#E7E2D8] shadow-lg overflow-hidden z-50">
            <div className="px-3 py-2 text-[10px] font-semibold text-[#6B7385] uppercase">Suggestions</div>
            {filtered.map((s, i) => (
              <button
                key={i}
                onClick={() => { navigate(s.link); setShowSearch(false); setQ('') }}
                className="w-full text-left px-3 py-2 text-sm text-[#1D2433] hover:bg-[#F7F4EE] flex items-center gap-2"
              >
                <Search size={13} className="text-[#6B7385]" />
                {s.text}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        {/* Global Sales / Service toggle */}
        {!isClientUser && (
        <div className="flex items-center gap-1 bg-[#F7F4EE] rounded-xl p-1 border border-[#E7E2D8]">
          <button
            onClick={() => setClientType('Sales')}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
              clientType === 'Sales' ? 'bg-[#3457D5] text-white shadow-sm' : 'text-[#6B7385] hover:text-[#1D2433]'
            }`}
          >
            <TrendingUp size={14} />
            Sales
            <span className={`text-[10px] ${clientType === 'Sales' ? 'text-white/70' : 'text-[#6B7385]'}`}>{salesCount}</span>
          </button>
          <button
            onClick={() => setClientType('Service')}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
              clientType === 'Service' ? 'bg-[#3457D5] text-white shadow-sm' : 'text-[#6B7385] hover:text-[#1D2433]'
            }`}
          >
            <Headphones size={14} />
            Service
            <span className={`text-[10px] ${clientType === 'Service' ? 'text-white/70' : 'text-[#6B7385]'}`}>{serviceCount}</span>
          </button>
        </div>
        )}

        <div className="flex items-center gap-1.5 text-xs text-[#6B7385] mr-2 hidden">
          <span className="font-medium">This Week</span>
          <ChevronDown size={14} />
        </div>
        <button className="relative p-2 rounded-full hover:bg-[#F7F4EE] transition" aria-label="Notifications">
          <Bell size={18} className="text-[#1D2433]" />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#D14343]" />
        </button>
        <button className="flex items-center gap-2 text-sm font-semibold bg-[#16213E] text-white px-4 py-2 rounded-xl hover:bg-[#1B3157] transition">
          <Download size={15} /> Export
        </button>
        <div className="w-8 h-8 rounded-full bg-[#3457D5] flex items-center justify-center text-[10px] font-bold text-white cursor-pointer">
          {USER.initials}
        </div>
      </div>
    </header>
  )
}
