import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, PhoneCall, Users, Target, Brain, BarChart3,
  FileText, Settings, AlertTriangle, Bell, Users2, Settings2,
  AudioWaveform, Headphones, TrendingUp, LogOut,
} from 'lucide-react'
import { useAuth } from './AuthContext.jsx'

const adminItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/calls', label: 'Call Explorer', icon: PhoneCall },
  { to: '/agents', label: 'Agents', icon: Users },
  { to: '/coaching', label: 'Coaching Center', icon: Target },
  { to: '/conversation-intelligence', label: 'Conversation Intelligence', icon: Brain },
  // { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/ai-config', label: 'AI Configuration', icon: Settings },
  { to: '/incidents', label: 'Incident Center', icon: AlertTriangle, badge: 5 },
  { to: '/alerts', label: 'Alerts', icon: Bell, badge: 3 },
  { to: '/clients', label: 'Clients', icon: Users2 },
  { to: '/settings', label: 'Settings', icon: Settings2 },
]

const salesItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  // { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/calls', label: 'Call Explorer', icon: PhoneCall },
  { to: '/agents', label: 'Agents', icon: Users },
]

const serviceItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  // { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/calls', label: 'Call Explorer', icon: PhoneCall },
  { to: '/agents', label: 'Agents', icon: Users },
  { to: '/incidents', label: 'Incident Center', icon: AlertTriangle },
  { to: '/alerts', label: 'Alerts', icon: Bell },
]

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth()
  const navigate = useNavigate()

  const isSales = !isAdmin && user?.client_type === 'sales'
  const isService = !isAdmin && user?.client_type === 'service'
  const items = isAdmin ? adminItems : isSales ? salesItems : serviceItems
  const displayName = user?.full_name || user?.email || 'User'
  const initials = displayName.charAt(0).toUpperCase() + (displayName.split('@')[0].slice(-1) || '').toLocaleUpperCase()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-60 shrink-0 bg-[#16213E] text-white flex flex-col h-screen sticky top-0 overflow-y-auto">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="w-9 h-9 rounded-xl bg-[#3457D5] flex items-center justify-center">
          <AudioWaveform size={20} />
        </div>
        <div>
          <div className="font-bold text-sm leading-tight tracking-tight">CallIQ</div>
          <div className="text-[10px] text-white/40 leading-tight">v2.0</div>
        </div>
      </div>

      <div className="px-5 py-2 mb-1">
        <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
          {isAdmin ? (
            <Users2 size={16} className="text-[#3457D5]" />
          ) : isSales ? (
            <TrendingUp size={16} className="text-[#3457D5]" />
          ) : (
            <Headphones size={16} className="text-[#3457D5]" />
          )}
          <div className="text-xs font-medium truncate">{displayName}</div>
          <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded font-semibold ${
            isAdmin ? 'bg-[#1C9A6C] text-white' : isSales ? 'bg-[#C9862B] text-white' : 'bg-[#3457D5] text-white'
          }`}>
            {isAdmin ? 'Admin' : isSales ? 'Sales' : 'Service'}
          </span>
        </div>
      </div>

      <nav className="flex-1 px-3 mt-2 space-y-0.5">
        {items.map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                isActive ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white/80'
              }`
            }
          >
            <Icon size={17} />
            <span className="flex-1">{label}</span>
            {badge && (
              <span className="w-5 h-5 rounded-full bg-[#D14343] text-white text-[10px] font-bold flex items-center justify-center">
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-[#3457D5]/70 flex items-center justify-center text-xs font-bold">
            {initials}
          </div>
          <div className="text-xs min-w-0 flex-1">
            <div className="font-semibold truncate">{displayName}</div>
            <div className="text-white/40 truncate">{user?.role === 'admin' ? 'Administrator' : 'User'}</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-white/50 hover:bg-white/5 hover:text-[#D14343] transition"
        >
          <LogOut size={16} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
