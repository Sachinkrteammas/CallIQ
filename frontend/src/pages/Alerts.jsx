import React, { useState, useEffect, useCallback } from 'react'
import { Card, SectionTitle, SeverityBadge, EmptyState } from '../components/shared.jsx'
import { Bell, Mail, CheckCircle, Clock, AlertTriangle, RefreshCw, Filter } from 'lucide-react'
import { listAlerts, updateAlert, getSampleEmail } from '../api/client.js'

// Only 5 allowed categories
const ALLOWED_CATEGORIES = [
  'Abusive Language',
  'Compliance Violation',
  'Customer Threat',
  'Data Privacy Breach',
  'Policy Violation',
]

const STATUSES = ['All', 'Open', 'Acknowledged', 'Resolved']

const CATEGORY_ICONS = {
  'Abusive Language': AlertTriangle,
  'Compliance Violation': AlertTriangle,
  'Customer Threat': AlertTriangle,
  'Data Privacy Breach': AlertTriangle,
  'Policy Violation': AlertTriangle,
}

const CATEGORY_COLORS = {
  'Abusive Language': '#D14343',
  'Compliance Violation': '#C9862B',
  'Customer Threat': '#D14343',
  'Data Privacy Breach': '#7C3AED',
  'Policy Violation': '#3457D5',
}


export default function Alerts() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedEmail, setSelectedEmail] = useState(null)

  const loadAlerts = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await listAlerts()
      setAlerts(data || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load alerts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAlerts() }, [loadAlerts])

  const filtered = alerts.filter((a) => {
    if (!ALLOWED_CATEGORIES.includes(a.category)) return false
    if (statusFilter !== 'All' && a.status !== statusFilter) return false
    if (categoryFilter && a.category !== categoryFilter) return false
    return true
  })

  const handleAcknowledge = async (id) => {
    try {
      await updateAlert(id, { status: 'Acknowledged' })
      loadAlerts()
    } catch { /* ignore */ }
  }

  const handleResolve = async (id) => {
    try {
      await updateAlert(id, { status: 'Resolved' })
      loadAlerts()
    } catch { /* ignore */ }
  }

  const handleViewEmail = async (id) => {
    try {
      const email = await getSampleEmail(id)
      setSelectedEmail(email)
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1D2433]">Alerts</h1>
          <p className="text-xs text-[#6B7385] mt-0.5">
            5 critical categories · {filtered.length} alerts
          </p>
        </div>
        <button onClick={loadAlerts} disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#3457D5] hover:underline disabled:opacity-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter size={13} className="text-[#6B7385]" />
            <label className="text-xs font-semibold text-[#6B7385]">Category</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
              className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 bg-white">
              <option value="">All Categories</option>
              {ALLOWED_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-semibold text-[#6B7385]">Status</label>
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition ${
                  statusFilter === s
                    ? 'bg-[#3457D5] text-white border-[#3457D5]'
                    : 'border-[#E7E2D8] text-[#6B7385] hover:border-[#3457D5]/40'
                }`}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {error && (
        <div className="text-xs font-semibold text-[#D14343] bg-[#FBE9E9] px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <Card>
        {loading ? (
          <div className="py-14 text-center text-sm text-[#6B7385]">Loading alerts...</div>
        ) : filtered.length === 0 ? (
          <EmptyState text="No alerts yet. Alerts will appear when AI detects critical behaviors." />
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => {
              const Icon = CATEGORY_ICONS[a.category] || Bell
              const color = CATEGORY_COLORS[a.category] || '#3457D5'
              return (
                <div key={a.id}
                  className="border border-[#E7E2D8] rounded-xl p-4 hover:border-[#3457D5]/30 transition">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: color + '15' }}>
                      <Icon size={16} style={{ color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-[#1D2433]">{a.category}</span>
                        <SeverityBadge level={a.severity} />
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          a.status === 'Resolved' ? 'bg-[#E7F7EF] text-[#1C9A6C]'
                          : a.status === 'Acknowledged' ? 'bg-[#EEF1FE] text-[#3457D5]'
                          : 'bg-[#FCF1DF] text-[#C9862B]'
                        }`}>
                          {a.status}
                        </span>
                        {a.confidence && (
                          <span className="text-[10px] text-[#6B7385]">
                            Confidence: {a.confidence}%
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#6B7385] mb-1.5">
                        {a.agent_name && <span>Agent: {a.agent_name} · </span>}
                        {a.queue && <span>Queue: {a.queue} · </span>}
                        {a.call_id && <span>Call: {a.call_id} · </span>}
                        {a.created_at && <span>{new Date(a.created_at).toLocaleString()}</span>}
                      </div>
                      <div className="flex gap-2 mt-2">
                        {a.status === 'Open' && (
                          <button onClick={() => handleAcknowledge(a.id)}
                            className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-[#E7E2D8] hover:border-[#3457D5]">
                            Acknowledge
                          </button>
                        )}
                        {a.status !== 'Resolved' && (
                          <button onClick={() => handleResolve(a.id)}
                            className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-[#1C9A6C] text-white hover:opacity-90">
                            Resolve
                          </button>
                        )}
                        <button onClick={() => handleViewEmail(a.id)}
                          className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-[#E7E2D8] hover:border-[#3457D5] flex items-center gap-1">
                          <Mail size={10} /> Email Preview
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Email Modal */}
      {selectedEmail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedEmail(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#1D2433]">Email Preview</h3>
              <button onClick={() => setSelectedEmail(null)} className="text-[#6B7385]">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold text-[#6B7385] uppercase">Subject</div>
                <div className="text-sm font-semibold">{selectedEmail.subject}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold text-[#6B7385] uppercase">Body</div>
                <pre className="text-xs text-[#1D2433] bg-[#F7F4EE] p-3 rounded-lg whitespace-pre-wrap">
                  {selectedEmail.body}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}