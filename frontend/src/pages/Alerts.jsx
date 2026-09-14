import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, SeverityBadge, EmptyState } from '../components/shared.jsx'
import { listAlerts, listAlertCategories, updateAlert, getSampleEmail } from '../api/client.js'
import { Mail, X, AlertTriangle, ShieldAlert, Siren, VolumeX, Clock, FileWarning, TrendingDown, Lock } from 'lucide-react'

const catIcons = { AlertTriangle, ShieldAlert, Siren, VolumeX, Clock, FileWarning, TrendingDown, Lock }

export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [emailPreview, setEmailPreview] = useState(null)
  const [activeCategory, setActiveCategory] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([listAlerts(), listAlertCategories()])
      .then(([alertData, catData]) => {
        setAlerts(alertData)
        setCategories(catData)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const resolve = (id) => {
    updateAlert(id, { status: 'Resolved' }).then((updated) => {
      setAlerts(prev => prev.map(a => a.id === id ? updated : a))
    })
  }

  const assign = (id) => {
    updateAlert(id, { status: 'Acknowledged', assigned_to: 'Rohan Mehta' }).then((updated) => {
      setAlerts(prev => prev.map(a => a.id === id ? updated : a))
    })
  }

  const handleEmailPreview = (alert) => {
    getSampleEmail(alert.id).then((emailData) => {
      setEmailPreview({ ...alert, emailData })
    })
  }

  const filtered = activeCategory
    ? alerts.filter(a => a.incident.toLowerCase().includes(activeCategory.toLowerCase()))
    : alerts

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-[#1D2433]">Alerts</h1>
        <div className="text-sm text-[#6B7385]">Loading alerts...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-[#1D2433]">Alerts</h1>

      {/* Alert Category Cards */}
      <div className="grid grid-cols-4 gap-4">
        {categories.map((cat) => {
          const Icon = catIcons[cat.icon] || AlertTriangle
          return (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(activeCategory === cat.label ? null : cat.label)}
              className={`text-left p-4 rounded-xl border transition-all ${activeCategory === cat.label ? 'border-[#3457D5] bg-[#EEF1FE] shadow-md' : 'border-[#E7E2D8] hover:border-[#3457D5]/40 hover:shadow'}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: cat.color + '15' }}>
                  <Icon size={16} style={{ color: cat.color }} />
                </div>
              </div>
              <div className="text-2xl font-bold text-[#1D2433]">{cat.count}</div>
              <div className="text-xs text-[#6B7385] font-medium mt-0.5">{cat.label}</div>
            </button>
          )
        })}
      </div>

      {/* Live Alert Feed */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold text-[#1D2433]">Live Alert Feed</h3>
          {activeCategory && (
            <button onClick={() => setActiveCategory(null)} className="text-xs font-semibold text-[#3457D5] hover:underline">
              Clear filter: {activeCategory}
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <EmptyState text="Excellent! No alerts match these criteria." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] text-[#6B7385] font-semibold uppercase border-b border-[#E7E2D8]">
                  <th className="py-2 pr-3">Alert</th>
                  <th className="py-2 pr-3">Agent</th>
                  <th className="py-2 pr-3">Queue</th>
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Severity</th>
                  <th className="py-2 pr-3">Confidence</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.id} className="border-b border-[#E7E2D8]/70 hover:bg-[#F7F4EE] transition">
                    <td className="py-2.5 pr-3 font-semibold text-[#1D2433]">{a.incident}</td>
                    <td className="py-2.5 pr-3 text-[#1D2433]">{a.agent}</td>
                    <td className="py-2.5 pr-3 text-[#6B7385]">{a.queue}</td>
                    <td className="py-2.5 pr-3 text-[#6B7385] text-xs">{new Date(a.time).toLocaleString()}</td>
                    <td className="py-2.5 pr-3"><SeverityBadge level={a.severity} /></td>
                    <td className="py-2.5 pr-3">
                      <span className={`text-xs font-semibold ${a.confidence >= 90 ? 'text-[#D14343]' : 'text-[#C9862B]'}`}>{a.confidence}%</span>
                    </td>
                    <td className="py-2.5 pr-3"><SeverityBadge level={a.status} /></td>
                    <td className="py-2.5 pr-3">
                      <div className="flex gap-2">
                        <button onClick={() => navigate(`/calls/${a.call_id}`)} className="text-xs font-semibold text-[#3457D5] hover:underline">View Call</button>
                        <button onClick={() => assign(a.id)} className="text-xs font-semibold text-[#1D2433] hover:underline">Assign</button>
                        <button onClick={() => resolve(a.id)} className="text-xs font-semibold text-[#1C9A6C] hover:underline">Resolve</button>
                        <button onClick={() => handleEmailPreview(a)} className="text-xs font-semibold text-[#6B7385] flex items-center gap-1 hover:underline"><Mail size={11} /> Email</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Email Preview Modal */}
      {emailPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEmailPreview(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl w-[480px] p-5 relative shadow-xl">
            <button onClick={() => setEmailPreview(null)} className="absolute top-3 right-3 text-[#6B7385] hover:text-[#1D2433]"><X size={16} /></button>
            <div className="text-xs text-[#6B7385] mb-1">Subject</div>
            <div className="font-semibold text-[#1D2433] mb-3">🚨 {emailPreview.incident} — {emailPreview.call_id}</div>
            <div className="text-xs text-[#6B7385] mb-1">Recipients</div>
            <div className="text-sm text-[#1D2433] mb-3">rohan.mehta@acmebpo.com</div>
            <div className="border border-[#E7E2D8] rounded-xl p-3 text-xs space-y-1 bg-[#F7F4EE]">
              <div><b>Agent:</b> {emailPreview.agent}</div>
              <div><b>Call ID:</b> {emailPreview.call_id}</div>
              <div><b>Severity:</b> {emailPreview.severity}</div>
              <div><b>AI Detection:</b> {emailPreview.emailData?.body?.detection || emailPreview.incident}</div>
              <div><b>Confidence:</b> {emailPreview.emailData?.body?.confidence || `${emailPreview.confidence}%`}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
