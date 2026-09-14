import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'
import { Card, SectionTitle, Gauge, ProgressBar, SeverityBadge, Trend } from '../components/shared.jsx'
import { getClientOverview, getClientsSummary } from '../api/client.js'
import { useClientFilter, getDateRange } from '../components/ClientContext.jsx'
import { AlertTriangle, Target, ShieldAlert, ClipboardList, UserX, ChevronRight, ArrowRight, Clock, TrendingUp, Eye, Calendar, RefreshCw } from 'lucide-react'

const COLORS = ['#1C9A6C', '#C9862B', '#3457D5', '#D14343', '#7C3AED', '#EC4899']

const sectionLabels = {
  opening: 'Opening',
  communication: 'Communication',
  probing_resolution: 'Probing & Resolution',
  process_compliance: 'Process Compliance',
  closure: 'Closure',
}

const sectionIcons = {
  opening: '📞',
  communication: '💬',
  probing_resolution: '🔍',
  process_compliance: '📋',
  closure: '✅',
}

export default function Overview() {
  const navigate = useNavigate()
  const { clientId, clients, setClientId, selectedClient, isAllClients, fromDate, toDate, setFromDate, setToDate, clientType } = useClientFilter()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (clientId === null) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    const req = isAllClients
      ? getClientsSummary(fromDate, toDate, clientType)
      : getClientOverview(clientId, fromDate, toDate, clientType)
    req
      .then((res) => {
        if (!cancelled) {
          setData(res)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || 'Failed to load data')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [clientId, isAllClients, fromDate, toDate, clientType, refreshKey])

  const handleRefresh = () => setRefreshKey((k) => k + 1)

  const handlePreset = (days) => {
    const range = getDateRange(days)
    setFromDate(range.from)
    setToDate(range.to)
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw size={32} className="text-[#3457D5] animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#6B7385] font-medium">Loading audit data...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertTriangle size={32} className="text-[#D14343] mx-auto mb-3" />
          <p className="text-sm text-[#D14343] font-medium">{error}</p>
          <button onClick={handleRefresh} className="mt-3 text-xs font-semibold text-[#3457D5] hover:underline">Retry</button>
        </div>
      </div>
    )
  }

  if (isAllClients && data) {
    const summaryCards = [
      { label: 'Critical Calls', count: data.critical_calls ?? 0, icon: AlertTriangle, color: '#D14343', link: '/incidents' },
      { label: 'Needs Coaching', count: data.needs_coaching ?? 0, icon: Target, color: '#3457D5', link: '/coaching' },
      { label: 'Compliance Violations', count: data.compliance_violations ?? 0, icon: ShieldAlert, color: '#C9862B', link: '/incidents' },
      { label: 'Pending Reviews', count: data.pending_reviews ?? 0, icon: ClipboardList, color: '#7C3AED', link: '/calls' },
      { label: 'High Risk Agents', count: data.high_risk_agents ?? 0, icon: UserX, color: '#16213E', link: '/agents' },
    ]
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#1D2433]">All Clients Summary</h1>
            <p className="text-xs text-[#6B7385] mt-0.5">{clients.length} clients · {fromDate} to {toDate}</p>
          </div>
        </div>

        <FilterBar clients={clients} clientId={clientId} setClientId={setClientId} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onPreset={handlePreset} onRefresh={handleRefresh} loading={loading} />

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold text-[#1D2433]">Action Center</h3>
            <button onClick={() => setClientId(clients.length > 0 ? clients[0].id : 'all')} className="text-xs font-semibold text-[#3457D5] hover:underline">
              View all →
            </button>
          </div>
          <div className="grid grid-cols-5 gap-4">
            {summaryCards.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.label}
                  onClick={() => item.link && navigate(item.link)}
                  className="text-left p-4 rounded-xl border border-[#E7E2D8] hover:border-[#3457D5]/40 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: item.color + '15' }}>
                      <Icon size={16} style={{ color: item.color }} />
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-[#1D2433]">{item.count}</div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-[#6B7385] font-medium">{item.label}</span>
                    <span className="text-[10px] font-semibold text-[#3457D5] opacity-0 group-hover:opacity-100 transition-opacity">View →</span>
                  </div>
                </button>
              )
            })}
          </div>
        </Card>

        <p className="text-xs text-[#6B7385]">Select a specific client from the dropdown above to see their detailed audit dashboard.</p>
      </div>
    )
  }

  if (!data || data.total_calls === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#1D2433]">Transcript Audit Overview</h1>
            <p className="text-xs text-[#6B7385] mt-0.5">{selectedClient ? selectedClient.name : 'No client selected'} · {fromDate} to {toDate}</p>
          </div>
        </div>
        <FilterBar clients={clients} clientId={clientId} setClientId={setClientId} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onPreset={handlePreset} onRefresh={handleRefresh} loading={loading} />
        <Card>
          <div className="flex flex-col items-center justify-center py-14">
            <ClipboardList size={40} className="text-[#6B7385] mb-3" />
            <p className="text-sm text-[#6B7385] font-medium">No audit data found for this period</p>
            <p className="text-xs text-[#6B7385] mt-1">Try adjusting the date range</p>
          </div>
        </Card>
      </div>
    )
  }

  const sectionNames = Object.keys(data.sections || {})
  const actionCenterItems = [
    { label: 'Total Calls', count: data.total_calls, icon: ClipboardList, color: '#3457D5', link: '/calls' },
    { label: 'Fatal (Abusive)', count: data.transcript_fatal_count || 0, icon: AlertTriangle, color: '#D14343', link: '/incidents' },
    { label: 'Avg Score', count: data.avg_total_score, icon: Target, color: '#1C9A6C', link: null },
    { label: 'Avg Percentage', count: `${data.avg_percentage}%`, icon: TrendingUp, color: '#C9862B', link: null },
    { label: 'Bookings Done', count: data.conversion_audit?.booking_done || 0, icon: ShieldAlert, color: '#7C3AED', link: null },
  ]

  const rankingData = Object.entries(data.ranking_distribution || {}).map(([name, value]) => ({ name, value }))
  const categoryData = Object.entries(data.call_category_distribution || {}).map(([name, value]) => ({ name, value }))
  const registrationData = Object.entries(data.registration_stats || {}).map(([name, value]) => ({ name, value }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1D2433]">Transcript Audit Overview</h1>
          <p className="text-xs text-[#6B7385] mt-0.5">{selectedClient ? selectedClient.name : 'No client selected'} · {fromDate} to {toDate}</p>
        </div>
      </div>

      <FilterBar clients={clients} clientId={clientId} setClientId={setClientId} fromDate={fromDate} toDate={toDate} setFromDate={setFromDate} setToDate={setToDate} onPreset={handlePreset} onRefresh={handleRefresh} loading={loading} />

      {/* Action Center */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold text-[#1D2433]">Audit Summary</h3>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {actionCenterItems.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                onClick={() => item.link && navigate(item.link)}
                className={`text-left p-4 rounded-xl border border-[#E7E2D8] hover:border-[#3457D5]/40 hover:shadow-md transition-all group ${!item.link ? 'cursor-default' : ''}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: item.color + '15' }}>
                    <Icon size={16} style={{ color: item.color }} />
                  </div>
                </div>
                <div className="text-2xl font-bold text-[#1D2433]">{item.count}</div>
                <div className="text-xs text-[#6B7385] font-medium mt-0.5">{item.label}</div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Section Scores Breakdown */}
      <div className="grid grid-cols-5 gap-4">
        {sectionNames.map((sec) => {
          const s = data.sections[sec]
          return (
            <Card key={sec}>
              <div className="text-center">
                <div className="text-lg mb-1">{sectionIcons[sec] || '📊'}</div>
                <h4 className="text-xs font-semibold text-[#1D2433] mb-2">{sectionLabels[sec] || sec}</h4>
                <div className="text-3xl font-bold" style={{ color: s.percentage >= 90 ? '#1C9A6C' : s.percentage >= 70 ? '#C9862B' : '#D14343' }}>
                  {s.percentage}%
                </div>
                <div className="text-[10px] text-[#6B7385] mt-1">{s.avg_score} / {s.avg_max}</div>
                <div className="h-2 rounded-full bg-[#F0EDE4] overflow-hidden mt-3">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${s.percentage}%`,
                      background: s.percentage >= 90 ? '#1C9A6C' : s.percentage >= 70 ? '#C9862B' : '#D14343',
                    }}
                  />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Daily Trend */}
        <Card className="col-span-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold text-[#1D2433]">Daily Score Trend</h3>
          </div>
          <div className="h-56">
            {data.daily_trend && data.daily_trend.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily_trend}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3457D5" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3457D5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#EFEAE0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
                  <Tooltip />
                  <Area type="monotone" dataKey="avg_score" name="Avg Score" stroke="#3457D5" fill="url(#scoreGrad)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-[#6B7385]">No trend data</div>
            )}
          </div>
        </Card>

        {/* Ranking Distribution */}
        <Card className="col-span-1">
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Ranking Distribution</h3>
          <div className="flex items-center justify-center h-48">
            {rankingData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={rankingData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {rankingData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-[#6B7385]">No data</div>
            )}
          </div>
          <div className="flex flex-wrap gap-3 justify-center mt-2">
            {rankingData.map((r, i) => (
              <div key={r.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                <span className="text-[10px] font-medium text-[#6B7385]">{r.name}: {r.value}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Call Category Distribution */}
        <Card className="col-span-1">
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Call Categories</h3>
          <div className="space-y-2">
            {categoryData.map((c, i) => {
              const pct = Math.round((c.value / data.total_calls) * 100)
              return (
                <div key={c.name}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-[#1D2433] font-medium capitalize">{c.name.replace(/_/g, ' ')}</span>
                    <span className="text-[#6B7385] font-semibold">{c.value} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F0EDE4] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Complaint & Conversion & Registration Stats */}
      <div className="grid grid-cols-3 gap-6">
        {/* Complaint Audit */}
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Complaint Audit</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#EEF1FE] border border-[#3457D5]/20">
              <span className="text-xs font-semibold text-[#3457D5]">Total Audits</span>
              <span className="text-lg font-bold text-[#1D2433]">{data.complaint_audit?.total || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#E7F7EF] border border-[#1C9A6C]/20">
              <span className="text-xs font-semibold text-[#1C9A6C]">Requests Raised</span>
              <span className="text-lg font-bold text-[#1D2433]">{data.complaint_audit?.request_raised || 0}</span>
            </div>
            {data.complaint_audit?.classification_map && Object.keys(data.complaint_audit.classification_map).length > 0 && (
              <div className="p-3 rounded-xl border border-[#E7E2D8]">
                <div className="text-xs font-semibold text-[#6B7385] mb-2">By Classification</div>
                {Object.entries(data.complaint_audit.classification_map).map(([cls, count]) => (
                  <div key={cls} className="flex justify-between text-xs py-1">
                    <span className="text-[#1D2433] capitalize">{cls.replace(/_/g, ' ')}</span>
                    <span className="font-semibold text-[#6B7385]">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        {/* Conversion Audit */}
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Conversion Audit</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#EEF1FE] border border-[#3457D5]/20">
              <span className="text-xs font-semibold text-[#3457D5]">Total Audits</span>
              <span className="text-lg font-bold text-[#1D2433]">{data.conversion_audit?.total || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#E7F7EF] border border-[#1C9A6C]/20">
              <span className="text-xs font-semibold text-[#1C9A6C]">Bookings Done</span>
              <span className="text-lg font-bold text-[#1D2433]">{data.conversion_audit?.booking_done || 0}</span>
            </div>
            {data.conversion_audit?.total > 0 && (
              <div className="p-3 rounded-xl border border-[#E7E2D8]">
                <div className="text-xs font-semibold text-[#6B7385] mb-1">Conversion Rate</div>
                <div className="text-2xl font-bold text-[#1C9A6C]">
                  {Math.round((data.conversion_audit.booking_done / data.conversion_audit.total) * 100)}%
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Registration Status */}
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Registration Status</h3>
          {registrationData.length > 0 && (
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={registrationData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                    {registrationData.map((entry, i) => {
                      const status = entry.name
                      const colorMap = { 'Full Registration': '#1C9A6C', 'Partial': '#C9862B', 'Other': '#6B7385' }
                      return <Cell key={i} fill={colorMap[status] || COLORS[i % COLORS.length]} />
                    })}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="space-y-2">
            {Object.entries(data.registration_stats || {}).map(([status, count]) => {
              if (count === 0) return null
              const pct = Math.round((count / data.total_calls) * 100)
              const colorMap = { 'Full Registration': '#1C9A6C', 'Partial': '#C9862B', 'Other': '#6B7385' }
              return (
                <div key={status}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="flex items-center gap-1.5 text-[#1D2433] font-medium">
                      <span className="w-2 h-2 rounded-full" style={{ background: colorMap[status] || '#3457D5' }} />
                      {status}
                    </span>
                    <span className="text-[#6B7385] font-semibold">{count} ({pct}%)</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#F0EDE4] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colorMap[status] || '#3457D5' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* Section Parameters Detail */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold text-[#1D2433]">Section Parameter Scores</h3>
        </div>
        <div className="grid grid-cols-5 gap-4">
          {sectionNames.map((sec) => {
            const params = data.section_parameters?.[sec] || {}
            const paramEntries = Object.entries(params)
            return (
              <div key={sec} className="p-3 rounded-xl border border-[#E7E2D8]">
                <h4 className="text-xs font-bold text-[#1D2433] mb-2 capitalize">{sectionLabels[sec] || sec}</h4>
                <div className="space-y-1.5">
                  {paramEntries.map(([pname, score]) => (
                    <div key={pname} className="flex justify-between text-[10px]">
                      <span className="text-[#6B7385] truncate mr-1">{pname.replace(/_/g, ' ')}</span>
                      <span className="font-semibold" style={{ color: score >= 1.5 ? '#1C9A6C' : score >= 1 ? '#C9862B' : '#D14343' }}>
                        {score.toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Sensitive Words */}
      {data.sensitive_words && data.sensitive_words.length > 0 && (
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Sensitive Words Detected</h3>
          <div className="flex flex-wrap gap-2">
            {data.sensitive_words.map((word) => (
              <span key={word} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#FBE9E9] text-[#D14343] border border-[#D14343]/20">
                {word}
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}


function FilterBar({ clients, clientId, setClientId, fromDate, toDate, setFromDate, setToDate, onPreset, onRefresh, loading }) {
  return (
    <Card>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#6B7385]">Client</label>
          <select
            value={clientId ?? ''}
            onChange={(e) => setClientId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#3457D5] min-w-[160px]"
          >
            <option value="all">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-[#6B7385]" />
          <label className="text-xs font-semibold text-[#6B7385]">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#3457D5]"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#6B7385]">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#3457D5]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              onClick={() => onPreset(d)}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-[#E7E2D8] hover:border-[#3457D5]/40 text-[#6B7385] hover:text-[#3457D5] transition"
            >
              {d}D
            </button>
          ))}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[#3457D5] hover:underline disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
    </Card>
  )
}
