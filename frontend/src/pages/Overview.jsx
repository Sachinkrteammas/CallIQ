import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend
} from 'recharts'
import { Card } from '../components/shared.jsx'
import {
  getClientOverview, getClientsSummary,
  getSalesCategorization, getCallDurationCategories,
  getMonthlyAuditSummary
} from '../api/client.js'
import { useClientFilter, getDateRange } from '../components/ClientContext.jsx'
import {
  AlertTriangle, Target, ShieldAlert, ClipboardList, UserX,
  TrendingUp, Calendar, RefreshCw, Clock, Download
} from 'lucide-react'

const COLORS = ['#1C9A6C', '#C9862B', '#3457D5', '#D14343', '#7C3AED', '#EC4899']

const sectionLabels = {
  opening: 'Opening', communication: 'Communication',
  probing_resolution: 'Probing & Resolution',
  process_compliance: 'Process Compliance', closure: 'Closure',
}
const sectionIcons = {
  opening: '📞', communication: '💬', probing_resolution: '🔍',
  process_compliance: '📋', closure: '✅',
}

const SALES_CATEGORY_DEFINITIONS = [
  {
    category: 'Genuine Sale',
    reason: 'Customer has provided complete confirmation and the order has been placed as per the defined process.',
    key: 'genuine', color: '#1C9A6C',
  },
  {
    category: 'Fake / Invalid Sale',
    reason: 'Forcefully Placed – Order placed without genuine customer intent/confirmation.',
    key: 'forcefully_placed', color: '#C9862B',
  },
  {
    category: 'Fake / Invalid Sale',
    reason: 'Not Confirmed – Sale marked as done, but customer confirmation is missing or incomplete.',
    key: 'not_confirmed', color: '#D14343',
  },
  {
    category: 'Fake / Invalid Sale',
    reason: 'Without Information – Sale marked as done without the required customer/order information being captured.',
    key: 'without_information', color: '#7C3AED',
  },
]


export default function Overview() {
  const navigate = useNavigate()
  const {
    clientId, clients, setClientId, selectedClient, isAllClients,
    fromDate, toDate, setFromDate, setToDate, clientType
  } = useClientFilter()
  const [data, setData] = useState(null)
  const [salesData, setSalesData] = useState(null)
  const [durationData, setDurationData] = useState(null)
  const [monthlyData, setMonthlyData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (clientId === null) return
    let cancelled = false
    setLoading(true); setError(null); setData(null); setSalesData(null); setDurationData(null); setMonthlyData(null)

    const params = { from_date: fromDate, to_date: toDate }
    if (!isAllClients) params.client_id = clientId

    const monthlyParams = {}
    if (!isAllClients) monthlyParams.client_id = clientId

    const req = isAllClients
      ? getClientsSummary(fromDate, toDate, clientType)
      : getClientOverview(clientId, fromDate, toDate, clientType)

    Promise.all([
      req,
      getSalesCategorization(params).catch((e) => { console.warn('sales-cat failed', e); return null }),
      getCallDurationCategories(params).catch((e) => { console.warn('duration failed', e); return null }),
      getMonthlyAuditSummary(monthlyParams).catch((e) => { console.warn('monthly failed', e); return null }),
    ])
      .then(([overviewRes, salesRes, durRes, monthlyRes]) => {
        if (!cancelled) {
          setData(overviewRes)
          setSalesData(salesRes)
          setDurationData(durRes)
          setMonthlyData(monthlyRes)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) { setError(err.message || 'Failed to load data'); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [clientId, isAllClients, fromDate, toDate, clientType, refreshKey])

  const handleRefresh = () => setRefreshKey((k) => k + 1)
  const handlePreset = (days) => { const r = getDateRange(days); setFromDate(r.from); setToDate(r.to) }

  const handleDownloadMonthly = () => {
    const url = `/api/reports/monthly-audit/export${!isAllClients && clientId ? `?client_id=${clientId}` : ''}`
    window.open(url, '_blank')
  }

  const handleDownloadAudits = () => {
    const p = new URLSearchParams()
    if (!isAllClients && clientId) p.set('client_id', clientId)
    if (fromDate) p.set('from_date', fromDate)
    if (toDate) p.set('to_date', toDate)
    window.open(`/api/reports/audits/export?${p.toString()}`, '_blank')
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw size={32} className="text-[#3457D5] animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#6B7385]">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertTriangle size={32} className="text-[#D14343] mx-auto mb-3" />
          <p className="text-sm text-[#D14343]">{error}</p>
          <button onClick={handleRefresh} className="mt-3 text-xs font-semibold text-[#3457D5] hover:underline">Retry</button>
        </div>
      </div>
    )
  }

  // ═══ ALL CLIENTS VIEW ═══
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
          <button onClick={handleDownloadMonthly}
            className="flex items-center gap-2 bg-[#3457D5] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90">
            <Download size={14} /> Download Monthly Report
          </button>
        </div>

        <FilterBar {...{ clients, clientId, setClientId, fromDate, toDate, setFromDate, setToDate, onPreset: handlePreset, onRefresh: handleRefresh, loading }} />

        {/* Monthly Audit Summary */}
        {monthlyData && (
          <MonthlyAuditBlock monthlyData={monthlyData} onDownload={handleDownloadMonthly} />
        )}

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold text-[#1D2433]">Action Center</h3>
          </div>
          <div className="grid grid-cols-5 gap-4">
            {summaryCards.map((item) => {
              const Icon = item.icon
              return (
                <button key={item.label} onClick={() => item.link && navigate(item.link)}
                  className="text-left p-4 rounded-xl border border-[#E7E2D8] hover:border-[#3457D5]/40 hover:shadow-md transition-all group">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: item.color + '15' }}>
                    <Icon size={16} style={{ color: item.color }} />
                  </div>
                  <div className="text-2xl font-bold text-[#1D2433]">{item.count}</div>
                  <div className="text-xs text-[#6B7385] font-medium mt-0.5">{item.label}</div>
                </button>
              )
            })}
          </div>
        </Card>

        <SalesCategorizationBlock salesData={salesData} />
      </div>
    )
  }

  // ═══ EMPTY STATE ═══
  if (!data || data.total_calls === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#1D2433]">Transcript Audit Overview</h1>
            <p className="text-xs text-[#6B7385] mt-0.5">{selectedClient ? selectedClient.name : ''} · {fromDate} to {toDate}</p>
          </div>
          <button onClick={handleDownloadMonthly}
            className="flex items-center gap-2 bg-[#3457D5] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90">
            <Download size={14} /> Download Monthly Report
          </button>
        </div>
        <FilterBar {...{ clients, clientId, setClientId, fromDate, toDate, setFromDate, setToDate, onPreset: handlePreset, onRefresh: handleRefresh, loading }} />
        <Card>
          <div className="flex flex-col items-center justify-center py-14">
            <ClipboardList size={40} className="text-[#6B7385] mb-3" />
            <p className="text-sm text-[#6B7385]">No audit data found for this period</p>
          </div>
        </Card>
      </div>
    )
  }

  // ═══ SINGLE CLIENT VIEW ═══
  const sectionNames = Object.keys(data.sections || {})
  const actionCenterItems = [
    { label: 'Total Calls', count: data.total_calls, icon: ClipboardList, color: '#3457D5', link: '/calls' },
    { label: 'Fatal', count: data.transcript_fatal_count || 0, icon: AlertTriangle, color: '#D14343', link: '/incidents' },
    { label: 'Avg Score', count: data.avg_total_score, icon: Target, color: '#1C9A6C', link: null },
    { label: 'Avg %', count: `${data.avg_percentage}%`, icon: TrendingUp, color: '#C9862B', link: null },
    { label: 'Bookings Done', count: data.conversion_audit?.booking_done || 0, icon: ShieldAlert, color: '#7C3AED', link: null },
  ]
  const rankingData = Object.entries(data.ranking_distribution || {}).map(([name, value]) => ({ name, value }))
  const categoryData = Object.entries(data.call_category_distribution || {}).map(([name, value]) => ({ name, value }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1D2433]">Transcript Audit Overview</h1>
          <p className="text-xs text-[#6B7385] mt-0.5">{selectedClient ? selectedClient.name : ''} · {fromDate} to {toDate}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleDownloadAudits}
            className="flex items-center gap-2 border border-[#3457D5] text-[#3457D5] text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#EEF1FE]">
            <Download size={14} /> Export Audits
          </button>
          <button onClick={handleDownloadMonthly}
            className="flex items-center gap-2 bg-[#3457D5] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90">
            <Download size={14} /> Download Monthly Report
          </button>
        </div>
      </div>

      <FilterBar {...{ clients, clientId, setClientId, fromDate, toDate, setFromDate, setToDate, onPreset: handlePreset, onRefresh: handleRefresh, loading }} />

      {/* Monthly Audit Summary — Ma'am's requirement */}
      {monthlyData && (
        <MonthlyAuditBlock monthlyData={monthlyData} onDownload={handleDownloadMonthly} />
      )}

      <Card>
        <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Audit Summary</h3>
        <div className="grid grid-cols-5 gap-4">
          {actionCenterItems.map((item) => {
            const Icon = item.icon
            return (
              <button key={item.label} onClick={() => item.link && navigate(item.link)}
                className={`text-left p-4 rounded-xl border border-[#E7E2D8] ${item.link ? 'hover:border-[#3457D5]/40 hover:shadow-md' : 'cursor-default'}`}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2" style={{ background: item.color + '15' }}>
                  <Icon size={16} style={{ color: item.color }} />
                </div>
                <div className="text-2xl font-bold text-[#1D2433]">{item.count}</div>
                <div className="text-xs text-[#6B7385] font-medium mt-0.5">{item.label}</div>
              </button>
            )
          })}
        </div>
      </Card>

      <SalesCategorizationBlock salesData={salesData} />

      {durationData && (
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3 flex items-center gap-2">
            <Clock size={16} /> Call Duration Categories
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <MetricBox label="Short Calls" value={durationData.short} color="#1C9A6C" />
            <MetricBox label="Medium Calls" value={durationData.medium} color="#C9862B" />
            <MetricBox label="Long Calls" value={durationData.long} color="#3457D5" />
          </div>
          <div className="text-[10px] text-[#6B7385]">
            Thresholds: Short ≤ {durationData.thresholds?.short_max || 120}s · Medium ≤ {durationData.thresholds?.medium_max || 600}s · Long &gt; {durationData.thresholds?.medium_max || 600}s
          </div>
        </Card>
      )}

      <div className="grid grid-cols-5 gap-4">
        {sectionNames.map((sec) => {
          const s = data.sections[sec]
          return (
            <Card key={sec}>
              <div className="text-center">
                <div className="text-lg mb-1">{sectionIcons[sec] || '📊'}</div>
                <h4 className="text-xs font-semibold text-[#1D2433] mb-2">{sectionLabels[sec] || sec}</h4>
                <div className="text-3xl font-bold" style={{
                  color: s.percentage >= 90 ? '#1C9A6C' : s.percentage >= 70 ? '#C9862B' : '#D14343'
                }}>{s.percentage}%</div>
                <div className="text-[10px] text-[#6B7385] mt-1">{s.avg_score} / {s.avg_max}</div>
                <div className="h-2 rounded-full bg-[#F0EDE4] overflow-hidden mt-3">
                  <div className="h-full rounded-full" style={{
                    width: `${s.percentage}%`,
                    background: s.percentage >= 90 ? '#1C9A6C' : s.percentage >= 70 ? '#C9862B' : '#D14343'
                  }} />
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════
// MONTHLY AUDIT BLOCK — Ma'am's requirement
// ═══════════════════════════════════════════════════════════
function MonthlyAuditBlock({ monthlyData, onDownload }) {
  if (!monthlyData) return null
  const chartData = monthlyData.monthly || []

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-[#1D2433]">Per Month Audit Count — {monthlyData.year}</h3>
          <p className="text-[11px] text-[#6B7385] mt-0.5">Total audits completed each month</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10px] font-semibold text-[#6B7385] uppercase">This Month</div>
            <div className="text-lg font-bold text-[#3457D5]">{monthlyData.current_month_audits}</div>
            <div className="text-[10px] text-[#6B7385]">{monthlyData.current_month_name}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold text-[#6B7385] uppercase">Year Total</div>
            <div className="text-lg font-bold text-[#1C9A6C]">{monthlyData.total_audits}</div>
          </div>
          <button onClick={onDownload}
            className="flex items-center gap-2 bg-[#3457D5] text-white text-xs font-semibold px-3 py-2 rounded-lg hover:opacity-90">
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} stroke="#EFEAE0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="audit_count" name="Audits" fill="#3457D5" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}


// ═══════════════════════════════════════════════════════════
// SALES CATEGORIZATION BLOCK
// ═══════════════════════════════════════════════════════════
function SalesCategorizationBlock({ salesData }) {
  if (!salesData) {
    return (
      <Card>
        <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Sales Categorization</h3>
        <div className="flex flex-col items-center justify-center py-10">
          <p className="text-xs text-[#6B7385]">Loading sales categorization data...</p>
        </div>
      </Card>
    )
  }

  const pieData = [
    { name: 'Genuine', value: salesData.genuine || 0, color: '#1C9A6C' },
    { name: 'Invalid', value: salesData.invalid || 0, color: '#D14343' },
  ].filter((d) => d.value > 0)

  const reasonData = [
    { name: 'Forcefully Placed', value: salesData.forcefully_placed || 0, color: '#C9862B' },
    { name: 'Not Confirmed', value: salesData.not_confirmed || 0, color: '#D14343' },
    { name: 'Without Info', value: salesData.without_information || 0, color: '#7C3AED' },
  ]

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[#1D2433]">Sales Categorization</h3>
            <p className="text-[11px] text-[#6B7385] mt-0.5">
              Genuine vs Fake/Invalid sales with reasons — based on AI audit
            </p>
          </div>
          <div className="flex gap-3">
            <div className="text-right">
              <div className="text-[10px] font-semibold text-[#6B7385] uppercase">Genuine %</div>
              <div className="text-lg font-bold text-[#1C9A6C]">{salesData.genuine_percentage}%</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold text-[#6B7385] uppercase">Invalid %</div>
              <div className="text-lg font-bold text-[#D14343]">{salesData.invalid_percentage}%</div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-[#F7F4EE] text-[10px] text-[#6B7385] font-semibold uppercase">
                <th className="text-left py-2.5 px-3 border-b border-[#E7E2D8] w-[22%]">Category</th>
                <th className="text-left py-2.5 px-3 border-b border-[#E7E2D8]">Sub-Category / Reason</th>
                <th className="text-right py-2.5 px-3 border-b border-[#E7E2D8] w-[15%]">Count</th>
                <th className="text-right py-2.5 px-3 border-b border-[#E7E2D8] w-[12%]">%</th>
              </tr>
            </thead>
            <tbody>
              {SALES_CATEGORY_DEFINITIONS.map((def, idx) => {
                const count = salesData[def.key] || 0
                const total = salesData.total || 1
                const pct = ((count / total) * 100).toFixed(1)
                return (
                  <tr key={idx} className="hover:bg-[#F7F4EE]/50 transition">
                    <td className="py-3 px-3 border-b border-[#E7E2D8]/70">
                      <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                        def.category === 'Genuine Sale'
                          ? 'bg-[#E7F7EF] text-[#1C9A6C]'
                          : 'bg-[#FBE9E9] text-[#D14343]'
                      }`}>
                        {def.category}
                      </span>
                    </td>
                    <td className="py-3 px-3 border-b border-[#E7E2D8]/70 text-xs text-[#1D2433]">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: def.color }} />
                        {def.reason}
                      </div>
                    </td>
                    <td className="py-3 px-3 border-b border-[#E7E2D8]/70 text-right">
                      <span className="text-base font-bold" style={{ color: def.color }}>{count}</span>
                    </td>
                    <td className="py-3 px-3 border-b border-[#E7E2D8]/70 text-right text-xs font-semibold text-[#6B7385]">
                      {pct}%
                    </td>
                  </tr>
                )
              })}
              <tr className="bg-[#F7F4EE]/70">
                <td className="py-2.5 px-3 text-xs font-bold text-[#1D2433] uppercase" colSpan={2}>Total Audited Calls</td>
                <td className="py-2.5 px-3 text-right text-base font-bold text-[#1D2433]">{salesData.total}</td>
                <td className="py-2.5 px-3 text-right text-xs font-semibold text-[#6B7385]">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Genuine vs Fake/Invalid</h3>
          <div className="h-56">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={55} outerRadius={85} paddingAngle={3}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-[#6B7385]">
                No sales data available
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Invalid Sale Reasons</h3>
          <div className="h-56">
            {reasonData.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reasonData}>
                  <CartesianGrid vertical={false} stroke="#EFEAE0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" name="Count" radius={[6, 6, 0, 0]}>
                    {reasonData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-[#6B7385]">
                No invalid sales in this period
              </div>
            )}
          </div>
        </Card>
      </div>

      {salesData.advisor_breakdown?.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold text-[#1D2433]">Advisor-wise Sales Breakdown</h3>
            <span className="text-[10px] text-[#6B7385] font-medium">
              {salesData.advisor_breakdown.length} advisors
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] text-[#6B7385] font-semibold uppercase border-b border-[#E7E2D8]">
                  <th className="py-2.5 pr-3">Advisor</th>
                  <th className="py-2.5 pr-3 text-right">Genuine</th>
                  <th className="py-2.5 pr-3 text-right">Invalid</th>
                  <th className="py-2.5 pr-3 text-right">Forcefully Placed</th>
                  <th className="py-2.5 pr-3 text-right">Not Confirmed</th>
                  <th className="py-2.5 pr-3 text-right">Without Info</th>
                  <th className="py-2.5 pr-3 text-right">Total</th>
                  <th className="py-2.5 pr-3 text-right">Genuine %</th>
                </tr>
              </thead>
              <tbody>
                {salesData.advisor_breakdown
                  .slice()
                  .sort((a, b) => b.total - a.total)
                  .map((a) => {
                    const genPct = a.total > 0 ? ((a.genuine / a.total) * 100).toFixed(0) : 0
                    return (
                      <tr key={a.advisor} className="border-b border-[#E7E2D8]/70 hover:bg-[#F7F4EE]/50">
                        <td className="py-2.5 pr-3 font-semibold text-[#1D2433]">{a.advisor}</td>
                        <td className="py-2.5 pr-3 text-right font-bold text-[#1C9A6C]">{a.genuine}</td>
                        <td className="py-2.5 pr-3 text-right font-bold text-[#D14343]">{a.invalid}</td>
                        <td className="py-2.5 pr-3 text-right text-[#C9862B]">{a.forcefully_placed}</td>
                        <td className="py-2.5 pr-3 text-right text-[#D14343]">{a.not_confirmed}</td>
                        <td className="py-2.5 pr-3 text-right text-[#7C3AED]">{a.without_information}</td>
                        <td className="py-2.5 pr-3 text-right font-semibold text-[#1D2433]">{a.total}</td>
                        <td className="py-2.5 pr-3 text-right">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            genPct >= 80 ? 'bg-[#E7F7EF] text-[#1C9A6C]'
                            : genPct >= 50 ? 'bg-[#FCF1DF] text-[#C9862B]'
                            : 'bg-[#FBE9E9] text-[#D14343]'
                          }`}>
                            {genPct}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  )
}


function MetricBox({ label, value, color }) {
  return (
    <div className="p-3 rounded-xl border border-[#E7E2D8]">
      <div className="text-xs font-semibold" style={{ color }}>{label}</div>
      <div className="text-2xl font-bold text-[#1D2433] mt-1">{value}</div>
    </div>
  )
}

function FilterBar({ clients, clientId, setClientId, fromDate, toDate, setFromDate, setToDate, onPreset, onRefresh, loading }) {
  return (
    <Card>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#6B7385]">Client</label>
          <select value={clientId ?? ''} onChange={(e) => setClientId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 bg-white min-w-[160px]">
            <option value="all">All Clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-[#6B7385]" />
          <label className="text-xs font-semibold text-[#6B7385]">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
            className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-[#6B7385]">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
            className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5" />
        </div>
        <div className="flex items-center gap-1.5">
          {[7, 14, 30].map((d) => (
            <button key={d} onClick={() => onPreset(d)}
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-[#E7E2D8] hover:border-[#3457D5]/40">
              {d}D
            </button>
          ))}
        </div>
        <button onClick={onRefresh} disabled={loading}
          className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-[#3457D5] hover:underline disabled:opacity-50">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
    </Card>
  )
}