import React, { useState, useRef, useEffect } from 'react'
import { Search, Bell, Download, ChevronDown, TrendingUp, Headphones, User, Settings, LogOut, FileText, AlertTriangle, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { USER } from '../data/mock.js'
import { useClientFilter } from './ClientContext.jsx'

export default function Topbar() {
  const [q, setQ] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [exporting, setExporting] = useState(false)

  const navigate = useNavigate()
  const { clientType, setClientType, allClients, isClientUser, clientId, fromDate, toDate } = useClientFilter()

  const notifRef = useRef(null)
  const profileRef = useRef(null)
  const exportRef = useRef(null)

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false)
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false)
      if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const suggestions = [
    { text: 'CL-60782 — Abusive Language', link: '/calls/CL-60782' },
    { text: 'Amit Verma — Delta team', link: '/agents' },
    { text: 'Critical incidents this week', link: '/incidents' },
    { text: 'Compliance violations', link: '/alerts' },
  ]

  const filtered = q.trim()
    ? suggestions.filter((s) => s.text.toLowerCase().includes(q.toLowerCase()))
    : suggestions

  const onSearch = (e) => {
    e.preventDefault()
    if (q.trim()) navigate(`/calls?q=${encodeURIComponent(q.trim())}`)
    setShowSearch(false)
  }

  const salesCount = allClients.filter((c) => c.type === 'Sales').length
  const serviceCount = allClients.filter((c) => c.type === 'Service').length

  // ═══ NOTIFICATIONS (mock data — replace with API later) ═══
  const notifications = [
    { id: 1, title: 'Critical Incident Detected', desc: 'Abusive language on call CL-60782', time: '2 min ago', type: 'critical', link: '/incidents' },
    { id: 2, title: 'Compliance Violation', desc: 'Missing disclaimer on call CL-60770', time: '18 min ago', type: 'warning', link: '/alerts' },
    { id: 3, title: 'High Escalation Risk', desc: 'Agent AG60703 — 3 escalations today', time: '1 hr ago', type: 'warning', link: '/agents' },
    { id: 4, title: 'Weekly Report Ready', desc: 'Executive Summary for Week 41', time: '3 hr ago', type: 'info', link: '/reports' },
  ]
  const unreadCount = notifications.length

  // ═══ EXPORT HANDLER ═══
  const handleExport = (format) => {
    setExporting(true)
    const params = new URLSearchParams()
    if (clientId && clientId !== 'all') params.set('client_id', clientId)
    if (fromDate) params.set('from_date', fromDate)
    if (toDate) params.set('to_date', toDate)

    const url = `/api/reports/audits/export?${params.toString()}`
    window.open(url, '_blank')
    setTimeout(() => {
      setExporting(false)
      setShowExport(false)
    }, 800)
  }

  const handleMonthlyExport = () => {
    setExporting(true)
    const params = new URLSearchParams()
    if (clientId && clientId !== 'all') params.set('client_id', clientId)
    const url = `/api/reports/monthly-audit/export?${params.toString()}`
    window.open(url, '_blank')
    setTimeout(() => {
      setExporting(false)
      setShowExport(false)
    }, 800)
  }

  const handleProfileAction = (action) => {
    setShowProfile(false)
    if (action === 'settings') navigate('/settings')
    else if (action === 'logout') {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    } else if (action === 'profile') navigate('/settings')
  }

  const handleNotificationClick = (n) => {
    setShowNotifications(false)
    if (n.link) navigate(n.link)
  }

  return (
    <header className="h-14 bg-white border-b border-[#E7E2D8] flex items-center justify-between px-6 sticky top-0 z-20">
      {/* ═══ SEARCH ═══ */}
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
        {/* Sales / Service Toggle */}
        {!isClientUser && (
          <div className="flex items-center gap-1 bg-[#F7F4EE] rounded-xl p-1 border border-[#E7E2D8]">
            <button
              onClick={() => setClientType('Sales')}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                clientType === 'Sales' ? 'bg-[#3457D5] text-white shadow-sm' : 'text-[#6B7385] hover:text-[#1D2433]'
              }`}
            >
              <TrendingUp size={14} /> Sales
              <span className={`text-[10px] ${clientType === 'Sales' ? 'text-white/70' : 'text-[#6B7385]'}`}>{salesCount}</span>
            </button>
            <button
              onClick={() => setClientType('Service')}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                clientType === 'Service' ? 'bg-[#3457D5] text-white shadow-sm' : 'text-[#6B7385] hover:text-[#1D2433]'
              }`}
            >
              <Headphones size={14} /> Service
              <span className={`text-[10px] ${clientType === 'Service' ? 'text-white/70' : 'text-[#6B7385]'}`}>{serviceCount}</span>
            </button>
          </div>
        )}

        {/* ═══ NOTIFICATIONS ═══ */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setShowNotifications((v) => !v); setShowProfile(false); setShowExport(false) }}
            className="relative p-2 rounded-full hover:bg-[#F7F4EE] transition"
            aria-label="Notifications"
          >
            <Bell size={18} className="text-[#1D2433]" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] rounded-full bg-[#D14343] text-white text-[9px] font-bold flex items-center justify-center px-1">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute top-full right-0 mt-2 w-96 bg-white rounded-xl border border-[#E7E2D8] shadow-xl overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#E7E2D8]">
                <span className="text-sm font-bold text-[#1D2433]">Notifications</span>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-[#6B7385] hover:text-[#1D2433]"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#6B7385]">No notifications</div>
                ) : (
                  notifications.map((n) => {
                    const colorMap = { critical: '#D14343', warning: '#C9862B', info: '#3457D5' }
                    const Icon = n.type === 'critical' ? AlertTriangle : n.type === 'warning' ? AlertTriangle : FileText
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className="w-full text-left px-4 py-3 hover:bg-[#F7F4EE] border-b border-[#E7E2D8]/60 flex items-start gap-3 transition"
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ background: colorMap[n.type] + '15' }}>
                          <Icon size={14} style={{ color: colorMap[n.type] }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-[#1D2433]">{n.title}</div>
                          <div className="text-[11px] text-[#6B7385] mt-0.5 truncate">{n.desc}</div>
                          <div className="text-[10px] text-[#6B7385] mt-1">{n.time}</div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>
              <button
                onClick={() => { navigate('/alerts'); setShowNotifications(false) }}
                className="w-full py-2.5 text-center text-xs font-semibold text-[#3457D5] hover:bg-[#F7F4EE] transition border-t border-[#E7E2D8]"
              >
                View all alerts →
              </button>
            </div>
          )}
        </div>

        {/* ═══ EXPORT ═══ */}
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => { setShowExport((v) => !v); setShowNotifications(false); setShowProfile(false) }}
            className="flex items-center gap-2 text-sm font-semibold bg-[#16213E] text-white px-4 py-2 rounded-xl hover:bg-[#1B3157] transition"
          >
            <Download size={15} /> Export
          </button>

          {showExport && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl border border-[#E7E2D8] shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-[#E7E2D8]">
                <span className="text-xs font-bold text-[#1D2433] uppercase">Download Reports</span>
              </div>
              <button
                onClick={handleMonthlyExport}
                disabled={exporting}
                className="w-full text-left px-4 py-3 hover:bg-[#F7F4EE] border-b border-[#E7E2D8]/60 disabled:opacity-50"
              >
                <div className="text-xs font-semibold text-[#1D2433]">📅 Monthly Audit Report</div>
                <div className="text-[10px] text-[#6B7385] mt-0.5">Month-wise audit counts (CSV)</div>
              </button>
              <button
                onClick={() => handleExport('audits')}
                disabled={exporting}
                className="w-full text-left px-4 py-3 hover:bg-[#F7F4EE] border-b border-[#E7E2D8]/60 disabled:opacity-50"
              >
                <div className="text-xs font-semibold text-[#1D2433]">📊 Detailed Audit Records</div>
                <div className="text-[10px] text-[#6B7385] mt-0.5">All audits with sale category (CSV)</div>
              </button>
              <button
                onClick={() => { navigate('/reports'); setShowExport(false) }}
                className="w-full text-left px-4 py-3 hover:bg-[#F7F4EE]"
              >
                <div className="text-xs font-semibold text-[#1D2433]">📄 Custom Report Builder</div>
                <div className="text-[10px] text-[#6B7385] mt-0.5">Generate PDF/Excel reports</div>
              </button>
            </div>
          )}
        </div>

        {/* ═══ PROFILE ═══ */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => { setShowProfile((v) => !v); setShowNotifications(false); setShowExport(false) }}
            className="w-8 h-8 rounded-full bg-[#3457D5] flex items-center justify-center text-[10px] font-bold text-white cursor-pointer hover:opacity-90 transition"
          >
            {USER.initials}
          </button>

          {showProfile && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl border border-[#E7E2D8] shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-[#E7E2D8] bg-[#F7F4EE]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#3457D5] flex items-center justify-center text-sm font-bold text-white">
                    {USER.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-[#1D2433] truncate">{USER.name || 'Admin User'}</div>
                    <div className="text-[10px] text-[#6B7385] truncate">{USER.email || 'admin@calliq.local'}</div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleProfileAction('profile')}
                className="w-full text-left px-4 py-2.5 hover:bg-[#F7F4EE] flex items-center gap-2 text-xs text-[#1D2433]"
              >
                <User size={14} className="text-[#6B7385]" /> My Profile
              </button>
              <button
                onClick={() => handleProfileAction('settings')}
                className="w-full text-left px-4 py-2.5 hover:bg-[#F7F4EE] flex items-center gap-2 text-xs text-[#1D2433]"
              >
                <Settings size={14} className="text-[#6B7385]" /> Settings
              </button>
              <div className="border-t border-[#E7E2D8] my-1" />
              <button
                onClick={() => handleProfileAction('logout')}
                className="w-full text-left px-4 py-2.5 hover:bg-[#FBE9E9] flex items-center gap-2 text-xs text-[#D14343] font-semibold"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}