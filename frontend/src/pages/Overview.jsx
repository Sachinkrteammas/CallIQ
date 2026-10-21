import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts'
import { Card } from '../components/shared.jsx'
import {
  getClientOverview, getClientsSummary,
  getSalesCategorization, getCallDurationCategories,
  getMonthlyAuditSummary, getScoreByParameter,
  getAgentLeaderboard, getTrends, getQualityBands
} from '../api/client.js'
import { useClientFilter, getDateRange } from '../components/ClientContext.jsx'
import {
  AlertTriangle, Target, ShieldAlert, ClipboardList, UserX,
  TrendingUp, Calendar, RefreshCw, Clock, Download, Trophy, Award, ChevronRight
} from 'lucide-react'

const COLORS = ['#1C9A6C', '#C9862B', '#3457D5', '#D14343', '#7C3AED', '#EC4899']

const sectionLabels = {
  opening: 'Opening', customer_understanding: 'Customer Understanding',
  resolution_quality: 'Resolution Quality', communication: 'Communication',
  call_control: 'Call Control', process_adherence: 'Process Adherence',
  closing: 'Closing',
}

const RAG_COLORS = {
  green: { bg: '#E7F7EF', text: '#1C9A6C', border: '#1C9A6C' },
  amber: { bg: '#FCF1DF', text: '#C9862B', border: '#C9862B' },
  red: { bg: '#FBE9E9', text: '#D14343', border: '#D14343' },
}

const SALES_CATEGORY_DEFINITIONS = [
  { category: 'Genuine Sale', reason: 'Customer has provided complete confirmation and the order has been placed as per the defined process.', key: 'genuine', color: '#1C9A6C' },
  { category: 'Fake / Invalid Sale', reason: 'Forcefully Placed – Order placed without genuine customer intent/confirmation.', key: 'forcefully_placed', color: '#C9862B' },
  { category: 'Fake / Invalid Sale', reason: 'Not Confirmed – Sale marked as done, but customer confirmation is missing or incomplete.', key: 'not_confirmed', color: '#D14343' },
  { category: 'Fake / Invalid Sale', reason: 'Without Information – Sale marked as done without the required customer/order information being captured.', key: 'without_information', color: '#7C3AED' },
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
  const [paramData, setParamData] = useState(null)
  const [leaderboard, setLeaderboard] = useState(null)
  const [trendsData, setTrendsData] = useState(null)
  const [qualityBandsData, setQualityBandsData] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (clientId === null) return
    let cancelled = false
    setLoading(true); setError(null)
    setData(null); setSalesData(null); setDurationData(null)
    setMonthlyData(null); setParamData(null); setLeaderboard(null); setTrendsData(null)
    setQualityBandsData(null)

    const params = { from_date: fromDate, to_date: toDate }
    if (!isAllClients) params.client_id = clientId

    const req = isAllClients
      ? getClientsSummary(fromDate, toDate, clientType)
      : getClientOverview(clientId, fromDate, toDate, clientType)

    Promise.all([
      req,
      getSalesCategorization(params).catch(() => null),
      getCallDurationCategories(params).catch(() => null),
      getMonthlyAuditSummary(params).catch(() => null),
      getScoreByParameter(params).catch(() => null),
      getAgentLeaderboard(params).catch(() => null),
      getTrends(params).catch(() => null),
      getQualityBands(params).catch(() => null),
    ])
      .then(([overviewRes, salesRes, durRes, monthlyRes, paramRes, lbRes, trendRes, qbRes]) => {
        if (!cancelled) {
          setData(overviewRes)
          setSalesData(salesRes)
          setDurationData(durRes)
          setMonthlyData(monthlyRes)
          setParamData(paramRes)
          setLeaderboard(lbRes)
          setTrendsData(trendRes)
          setQualityBandsData(qbRes)
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

  // ═══ Navigation helpers ═══
  const goToAgentCalls = (agentId) => {
    const p = new URLSearchParams()
    p.set('agent_id', agentId)
    if (fromDate) p.set('from', fromDate)
    if (toDate) p.set('to', toDate)
    if (clientId && clientId !== 'all') p.set('client_id', clientId)
    navigate(`/calls?${p.toString()}`)
  }

  const goToBandCalls = (band) => {
    const p = new URLSearchParams()
    p.set('band', band)  // BQ / MQ / TQ
    if (fromDate) p.set('from', fromDate)
    if (toDate) p.set('to', toDate)
    if (clientId && clientId !== 'all') p.set('client_id', clientId)
    navigate(`/calls?${p.toString()}`)
  }

  const goToAllCalls = () => {
    const p = new URLSearchParams()
    if (fromDate) p.set('from', fromDate)
    if (toDate) p.set('to', toDate)
    if (clientId && clientId !== 'all') p.set('client_id', clientId)
    navigate(`/calls?${p.toString()}`)
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw size={32} className="text-[#3457D5] animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#6B7385]">Loading dashboard...</p>
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
        <div>
          <h1 className="text-xl font-bold text-[#1D2433]">All Clients Summary</h1>
          <p className="text-xs text-[#6B7385] mt-0.5">{clients.length} clients · {fromDate} to {toDate}</p>
        </div>
        <FilterBar {...{ clients, clientId, setClientId, fromDate, toDate, setFromDate, setToDate, onPreset: handlePreset, onRefresh: handleRefresh, loading }} />

        {monthlyData && <MonthlyAuditBlock monthlyData={monthlyData} onNavigate={goToAllCalls} />}
        {qualityBandsData && <QualityBandsBlock data={qualityBandsData} onBandClick={goToBandCalls} onAgentClick={goToAgentCalls} />}

        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Action Center</h3>
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
        <div>
          <h1 className="text-xl font-bold text-[#1D2433]">Transcript Audit Overview</h1>
          <p className="text-xs text-[#6B7385] mt-0.5">{selectedClient ? selectedClient.name : ''} · {fromDate} to {toDate}</p>
        </div>
        <FilterBar {...{ clients, clientId, setClientId, fromDate, toDate, setFromDate, setToDate, onPreset: handlePreset, onRefresh: handleRefresh, loading }} />
        {qualityBandsData && <QualityBandsBlock data={qualityBandsData} onBandClick={goToBandCalls} onAgentClick={goToAgentCalls} />}
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
  const actionCenterItems = [
    { label: 'Total Audits', count: data.total_calls, icon: ClipboardList, color: '#3457D5', link: '/calls' },
    { label: 'FCR', count: `${data.fcr_percentage ?? 55}%`, icon: Target, color: '#1C9A6C', link: null },
    { label: 'Fatal', count: data.transcript_fatal_count || 0, icon: AlertTriangle, color: '#D14343', link: '/incidents' },
    { label: 'Avg Score', count: data.avg_total_score, icon: TrendingUp, color: '#C9862B', link: null },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1D2433]">Transcript Audit Overview</h1>
        <p className="text-xs text-[#6B7385] mt-0.5">{selectedClient ? selectedClient.name : ''} · {fromDate} to {toDate}</p>
      </div>

      <FilterBar {...{ clients, clientId, setClientId, fromDate, toDate, setFromDate, setToDate, onPreset: handlePreset, onRefresh: handleRefresh, loading }} />

      {monthlyData && <MonthlyAuditBlock monthlyData={monthlyData} onNavigate={goToAllCalls} />}

      {/* NEW: Quality Bands with click */}
      {qualityBandsData && (
        <QualityBandsBlock
          data={qualityBandsData}
          onBandClick={goToBandCalls}
          onAgentClick={goToAgentCalls}
        />
      )}

      <Card>
        <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Audit Summary</h3>
        <div className="grid grid-cols-4 gap-4">
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

      {paramData && <ScoreByParameterBlock paramData={paramData} />}
      {trendsData && <TrendsBlock trendsData={trendsData} />}
      {leaderboard && <AgentLeaderboardBlock leaderboard={leaderboard} onAgentClick={goToAgentCalls} />}
      <SalesCategorizationBlock salesData={salesData} />
      {durationData && (
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3 flex items-center gap-2">
            <Clock size={16} /> Call Duration Categories
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-3">
            <MetricBox label={`Short (≤${durationData.thresholds?.short_max || 120}s)`} value={durationData.short} color="#1C9A6C" />
            <MetricBox label={`Medium (≤${durationData.thresholds?.medium_max || 600}s)`} value={durationData.medium} color="#C9862B" />
            <MetricBox label={`Long (>${durationData.thresholds?.medium_max || 600}s)`} value={durationData.long} color="#3457D5" />
          </div>
        </Card>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════
// QUALITY BANDS BLOCK — CLICKABLE (cards, pie, bar, table)
// ═══════════════════════════════════════════════════════════
function QualityBandsBlock({ data, onBandClick, onAgentClick }) {
  if (!data) return null
  if (!data.total) {
    return (
      <Card>
        <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3 flex items-center gap-2">
          <Award size={16} className="text-[#3457D5]" /> Quality Bands (BQ / MQ / TQ)
        </h3>
        <p className="text-xs text-[#6B7385] text-center py-6">No audits to classify</p>
      </Card>
    )
  }

  const pieData = [
    { name: 'TQ (Top Quality)', key: 'TQ', value: data.tq, color: '#1C9A6C' },
    { name: 'MQ (Medium Quality)', key: 'MQ', value: data.mq, color: '#C9862B' },
    { name: 'BQ (Bottom Quality)', key: 'BQ', value: data.bq, color: '#D14343' },
  ].filter((d) => d.value > 0)

  const bands = [
    {
      key: 'TQ',
      label: 'Top Quality',
      range: `≥ ${data.thresholds.tq_min}%`,
      count: data.tq,
      pct: data.tq_percentage,
      color: RAG_COLORS.green,
    },
    {
      key: 'MQ',
      label: 'Medium Quality',
      range: `${data.thresholds.bq_max}–${data.thresholds.tq_min - 1}%`,
      count: data.mq,
      pct: data.mq_percentage,
      color: RAG_COLORS.amber,
    },
    {
      key: 'BQ',
      label: 'Bottom Quality',
      range: `< ${data.thresholds.bq_max}%`,
      count: data.bq,
      pct: data.bq_percentage,
      color: RAG_COLORS.red,
    },
  ]

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-[#1D2433] flex items-center gap-2">
            <Award size={16} className="text-[#3457D5]" /> Quality Bands (BQ / MQ / TQ)
          </h3>
          <p className="text-[11px] text-[#6B7385] mt-0.5">
            {data.total} calls classified · Avg: {data.avg_percentage}%
            · <span className="text-[#3457D5] font-semibold">Click any band to view calls</span>
          </p>
        </div>
      </div>

      {/* Clickable 3 cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {bands.map((b) => (
          <button
            key={b.key}
            onClick={() => onBandClick && onBandClick(b.key)}
            className="p-4 rounded-xl border text-center hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer group"
            style={{ background: b.color.bg, borderColor: b.color.border + '40' }}
          >
            <div className="flex items-center justify-center gap-1">
              <span className="text-[11px] font-bold uppercase" style={{ color: b.color.text }}>
                {b.key} — {b.label}
              </span>
              <ChevronRight size={12} style={{ color: b.color.text }} className="opacity-0 group-hover:opacity-100 transition" />
            </div>
            <div className="text-[10px] text-[#6B7385] mt-0.5">Range: {b.range}</div>
            <div className="text-3xl font-bold mt-2" style={{ color: b.color.text }}>
              {b.count}
            </div>
            <div className="text-xs font-semibold mt-0.5" style={{ color: b.color.text }}>
              {b.pct}%
            </div>
          </button>
        ))}
      </div>

      {/* Pie + Bar side by side, both clickable */}
      <div className="grid grid-cols-2 gap-4">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`}
                onClick={(entry) => onBandClick && onBandClick(entry.key)}
                style={{ cursor: 'pointer' }}
              >
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bands} layout="vertical">
              <CartesianGrid horizontal={false} stroke="#EFEAE0" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="key" tick={{ fontSize: 12, fontWeight: 'bold' }} width={40} />
              <Tooltip />
              <Bar
                dataKey="count"
                name="Calls"
                radius={[0, 6, 6, 0]}
                onClick={(entry) => onBandClick && onBandClick(entry.key)}
                style={{ cursor: 'pointer' }}
              >
                {bands.map((b, i) => <Cell key={i} fill={b.color.text} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Agent-wise table — clickable rows */}
      {data.agent_breakdown?.length > 0 && (
        <div className="mt-4 border-t border-[#E7E2D8] pt-4">
          <h4 className="text-xs font-bold text-[#1D2433] uppercase mb-2">
            Agent-wise Bands · <span className="text-[#3457D5] font-normal normal-case">Click any agent to view their calls</span>
          </h4>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#F7F4EE]">
                <tr className="text-left text-[10px] text-[#6B7385] font-semibold uppercase">
                  <th className="py-2 pr-3">Agent</th>
                  <th className="py-2 pr-3 text-right">Total</th>
                  <th className="py-2 pr-3 text-right">BQ</th>
                  <th className="py-2 pr-3 text-right">MQ</th>
                  <th className="py-2 pr-3 text-right">TQ</th>
                  <th className="py-2 pr-3 text-right">Avg %</th>
                  <th className="py-2 pr-3 text-right">Band</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {data.agent_breakdown.slice(0, 20).map((a) => {
                  const bandColor = a.band === 'TQ' ? RAG_COLORS.green
                    : a.band === 'MQ' ? RAG_COLORS.amber : RAG_COLORS.red
                  return (
                    <tr
                      key={a.agent_id}
                      onClick={() => onAgentClick && onAgentClick(a.agent_id)}
                      className="border-b border-[#E7E2D8]/70 hover:bg-[#F7F4EE] cursor-pointer transition group"
                    >
                      <td className="py-2 pr-3 font-semibold text-[#3457D5]">{a.agent_id}</td>
                      <td className="py-2 pr-3 text-right">{a.total}</td>
                      <td className="py-2 pr-3 text-right font-bold text-[#D14343]">{a.bq}</td>
                      <td className="py-2 pr-3 text-right font-bold text-[#C9862B]">{a.mq}</td>
                      <td className="py-2 pr-3 text-right font-bold text-[#1C9A6C]">{a.tq}</td>
                      <td className="py-2 pr-3 text-right">{a.avg_percentage}%</td>
                      <td className="py-2 pr-3 text-right">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: bandColor.bg, color: bandColor.text }}>
                          {a.band}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <ChevronRight size={12} className="inline text-[#6B7385] opacity-0 group-hover:opacity-100" />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  )
}


// ═══════════════════════════════════════════════════════════
// AGENT LEADERBOARD — clickable rows
// ═══════════════════════════════════════════════════════════
function AgentLeaderboardBlock({ leaderboard, onAgentClick }) {
  const rows = leaderboard?.leaderboard || []
  if (!rows.length) return null
  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[15px] font-semibold text-[#1D2433] flex items-center gap-2">
          <Trophy size={16} className="text-[#C9862B]" /> Agent Leaderboard
        </h3>
        <span className="text-[10px] text-[#3457D5] font-semibold">Click any agent to view their calls</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] text-[#6B7385] font-semibold uppercase border-b border-[#E7E2D8]">
              <th className="py-2 pr-3 w-12">Rank</th>
              <th className="py-2 pr-3">Agent</th>
              <th className="py-2 pr-3 text-right">Audits</th>
              <th className="py-2 pr-3 text-right">Avg Score</th>
              <th className="py-2 pr-3 text-right">Fatal</th>
              <th className="py-2 pr-3 text-right">Score %</th>
              <th className="py-2 pr-3 text-right">Band</th>
              <th className="py-2 pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const rag = RAG_COLORS[r.color] || RAG_COLORS.amber
              const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : null
              return (
                <tr
                  key={r.agent_id}
                  onClick={() => onAgentClick && onAgentClick(r.agent_id)}
                  className="border-b border-[#E7E2D8]/70 hover:bg-[#F7F4EE] cursor-pointer transition group"
                >
                  <td className="py-2.5 pr-3 font-bold text-[#1D2433]">{medal || `#${r.rank}`}</td>
                  <td className="py-2.5 pr-3 font-semibold text-[#3457D5]">{r.agent_id}</td>
                  <td className="py-2.5 pr-3 text-right text-[#6B7385]">{r.audits}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold">{r.avg_score}</td>
                  <td className="py-2.5 pr-3 text-right">
                    {r.fatal_count > 0 ? (
                      <span className="text-[10px] font-bold text-[#D14343] bg-[#FBE9E9] px-2 py-0.5 rounded-full">
                        {r.fatal_count}
                      </span>
                    ) : <span className="text-[#6B7385]">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: rag.bg, color: rag.text }}>
                      {r.percentage}%
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: rag.bg, color: rag.text }}>
                      {r.band}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    <ChevronRight size={12} className="inline text-[#6B7385] opacity-0 group-hover:opacity-100" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}


// ═══════════════════════════════════════════════════════════
// OTHER BLOCKS (same as before)
// ═══════════════════════════════════════════════════════════
function ScoreByParameterBlock({ paramData }) {
  const params = paramData?.parameters || []
  return (
    <Card>
      <h3 className="text-[15px] font-semibold text-[#1D2433] mb-4">Score by Parameter</h3>
      <div className="grid grid-cols-7 gap-3">
        {params.map((p) => {
          const rag = RAG_COLORS[p.color] || RAG_COLORS.amber
          return (
            <div key={p.key} className="p-3 rounded-xl border text-center"
              style={{ background: rag.bg, borderColor: rag.border + '40' }}>
              <div className="text-[10px] font-semibold text-[#6B7385] mb-1 min-h-[24px]">
                {p.label}
              </div>
              <div className="text-2xl font-bold" style={{ color: rag.text }}>
                {p.percentage}%
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}


function TrendsBlock({ trendsData }) {
  const series = trendsData?.series || []
  if (!series.length) return null
  return (
    <div className="grid grid-cols-3 gap-6">
      <Card>
        <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">FCR Trend</h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="fcrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1C9A6C" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#1C9A6C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#EFEAE0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
              <Tooltip />
              <Area type="monotone" dataKey="fcr" stroke="#1C9A6C" fill="url(#fcrGrad)" strokeWidth={2} name="FCR %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Fatal Trend</h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="fatalGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D14343" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#D14343" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#EFEAE0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
              <Tooltip />
              <Area type="monotone" dataKey="fatal" stroke="#D14343" fill="url(#fatalGrad)" strokeWidth={2} name="Fatal %" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Agent Score Trend</h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid vertical={false} stroke="#EFEAE0" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={30} domain={[0, 100]} />
              <Tooltip />
              <Line type="monotone" dataKey="avg_score" stroke="#3457D5" strokeWidth={2.5} dot={{ r: 2 }} name="Avg Score" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}


function MonthlyAuditBlock({ monthlyData, onNavigate }) {
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
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold text-[#6B7385] uppercase">Year Total</div>
            <div className="text-lg font-bold text-[#1C9A6C]">{monthlyData.total_audits}</div>
          </div>
          {onNavigate && (
            <button onClick={onNavigate}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#3457D5] text-white hover:opacity-90">
              View all →
            </button>
          )}
        </div>
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} stroke="#EFEAE0" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="audit_count" name="Audits" fill="#3457D5" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}


function SalesCategorizationBlock({ salesData }) {
  if (!salesData) return null
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
            <p className="text-[11px] text-[#6B7385] mt-0.5">Genuine vs Fake/Invalid — AI-audited live calls only</p>
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
                        def.category === 'Genuine Sale' ? 'bg-[#E7F7EF] text-[#1C9A6C]' : 'bg-[#FBE9E9] text-[#D14343]'
                      }`}>{def.category}</span>
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
                    <td className="py-3 px-3 border-b border-[#E7E2D8]/70 text-right text-xs font-semibold text-[#6B7385]">{pct}%</td>
                  </tr>
                )
              })}
              <tr className="bg-[#F7F4EE]/70">
                <td className="py-2.5 px-3 text-xs font-bold text-[#1D2433] uppercase" colSpan={2}>Total Classified</td>
                <td className="py-2.5 px-3 text-right text-base font-bold text-[#1D2433]">{salesData.total}</td>
                <td className="py-2.5 px-3 text-right text-xs font-semibold text-[#6B7385]">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Genuine vs Invalid</h3>
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
            ) : <div className="flex items-center justify-center h-full text-xs text-[#6B7385]">No data</div>}
          </div>
        </Card>
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Invalid Reasons</h3>
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
            ) : <div className="flex items-center justify-center h-full text-xs text-[#6B7385]">No invalid sales</div>}
          </div>
        </Card>
      </div>

      {salesData.advisor_breakdown?.length > 0 && (
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">
            Advisor-wise Sales Breakdown
          </h3>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#F7F4EE]">
                <tr className="text-left text-[10px] text-[#6B7385] font-semibold uppercase border-b border-[#E7E2D8]">
                  <th className="py-2.5 pr-3">Advisor</th>
                  <th className="py-2.5 pr-3 text-right">Genuine</th>
                  <th className="py-2.5 pr-3 text-right">Invalid</th>
                  <th className="py-2.5 pr-3 text-right">Forcefully</th>
                  <th className="py-2.5 pr-3 text-right">Not Confirmed</th>
                  <th className="py-2.5 pr-3 text-right">Without Info</th>
                  <th className="py-2.5 pr-3 text-right">Total</th>
                  <th className="py-2.5 pr-3 text-right">Genuine %</th>
                </tr>
              </thead>
              <tbody>
                {salesData.advisor_breakdown.slice().sort((a, b) => b.total - a.total).map((a) => {
                  const genPct = a.total > 0 ? ((a.genuine / a.total) * 100).toFixed(1) : 0
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
                        }`}>{genPct}%</span>
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