import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, SectionTitle, Sparkline, Trend, SeverityBadge, EmptyState } from '../components/shared.jsx'
import { DISTRIBUTION, HEATMAP, AI_FINDINGS, TREND_DATA } from '../data/mock.js'
import { useClientFilter } from '../components/ClientContext.jsx'
import { getClientVADMetrics, triggerVADProcessing } from '../api/client.js'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, LineChart, Line, BarChart, Bar,
} from 'recharts'
import * as Icons from 'lucide-react'
import {
  Building2, Calendar, RefreshCw, Mic, Phone, AlertTriangle,
  Users, VolumeX, MessageSquare, Zap, FileText,
} from 'lucide-react'

const levelColor = { green: 'bg-[#1C9A6C]', amber: 'bg-[#C9862B]', red: 'bg-[#D14343]' }

// ESM VAD metric definitions
const VAD_METRICS = [
  { key: 'dead_air', label: 'Dead Air', unit: '%', icon: VolumeX, color: '#D14343', threshold: 10, inverse: true },
  { key: 'long_hold', label: 'Long Hold', unit: 's', icon: Phone, color: '#C9862B', threshold: 30, inverse: true },
  { key: 'interruptions', label: 'Interruptions', unit: '/call', icon: Zap, color: '#C9862B', threshold: 2, inverse: true },
  { key: 'talk_ratio', label: 'Talk Ratio', unit: '%', icon: MessageSquare, color: '#3457D5', threshold: 55, inverse: false },
  { key: 'silence', label: 'Silence', unit: '%', icon: VolumeX, color: '#D14343', threshold: 10, inverse: true },
  { key: 'cross_talk', label: 'Cross Talk', unit: '%', icon: Users, color: '#C9862B', threshold: 5, inverse: true },
  { key: 'escalation', label: 'Escalation', unit: '%', icon: AlertTriangle, color: '#D14343', threshold: 5, inverse: true },
  { key: 'script_deviation', label: 'Script Deviation', unit: '%', icon: FileText, color: '#C9862B', threshold: 15, inverse: true },
]

export default function ConversationIntelligence() {
  const [hoverCell, setHoverCell] = useState(null)
  const [heatmapView, setHeatmapView] = useState('team')
  const [vadData, setVadData] = useState([])
  const [vadLoading, setVadLoading] = useState(false)
  const [vadError, setVadError] = useState(null)
  const [vadView, setVadView] = useState('cards') // 'cards' | 'table'
  const [vadTriggering, setVadTriggering] = useState(false)
  const navigate = useNavigate()

  // Shared client filter context (same as CallExplorer)
  const {
    clientId,
    clients,
    setClientId,
    selectedClient,
    isAllClients,
    fromDate,
    toDate,
    setFromDate,
    setToDate,
    clientType,
  } = useClientFilter()

  const multiLineTrend = TREND_DATA.map(d => ({
    ...d,
    dead_air: 4 + Math.random() * 2,
    interruptions: 1.2 + Math.random() * 0.8,
    escalation: 6 + Math.random() * 3,
  }))

  // Fetch VAD metrics from the real API when client or dates change
  const fetchVADMetrics = useCallback(() => {
    if (!clientId) {
      setVadData([])
      return
    }
    setVadLoading(true)
    setVadError(null)
    getClientVADMetrics(clientId, fromDate, toDate, clientType)
      .then((res) => {
        setVadData(res.metrics || [])
        setVadLoading(false)
      })
      .catch((err) => {
        setVadError(err.response?.data?.detail || err.message || 'Failed to load VAD metrics')
        setVadLoading(false)
      })
  }, [clientId, fromDate, toDate, clientType])

  useEffect(() => {
    fetchVADMetrics()
  }, [fetchVADMetrics])

  // Trigger VAD processing on the backend
  const handleProcessVAD = useCallback(async () => {
    if (!clientId) return
    setVadTriggering(true)
    try {
      const res = await triggerVADProcessing(clientId, fromDate, toDate, clientType)
      if (res.pending_count > 0) {
        alert(
          `VAD processing started for ${res.pending_count} recording${res.pending_count === 1 ? '' : 's'}.\n\n` +
          `Refresh in 5–10 minutes to see results.`
        )
      } else {
        alert('No new recordings to process for this range. All are already analyzed.')
      }
    } catch (err) {
      alert('Failed to start VAD: ' + (err.response?.data?.detail || err.message || 'Unknown error'))
    } finally {
      setVadTriggering(false)
    }
  }, [clientId, fromDate, toDate, clientType])

  const handlePreset = (days) => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days)
    setFromDate(from.toISOString().slice(0, 10))
    setToDate(to.toISOString().slice(0, 10))
  }

  const getMetricStatus = (metric) => {
    const def = VAD_METRICS.find((m) => m.key === metric.key)
    if (!def) return 'green'
    if (def.inverse) {
      if (metric.value >= def.threshold * 1.5) return 'red'
      if (metric.value >= def.threshold) return 'amber'
      return 'green'
    }
    if (metric.value < def.threshold * 0.7) return 'red'
    if (metric.value < def.threshold) return 'amber'
    return 'green'
  }

  const formatValue = (metric) => {
    const def = VAD_METRICS.find((m) => m.key === metric.key)
    if (!def) return metric.value
    if (def.unit === '%') return `${metric.value}%`
    if (def.unit === 's') return `${metric.value}s`
    return `${metric.value}${def.unit}`
  }

  const formatBenchmark = (metric) => {
    const def = VAD_METRICS.find((m) => m.key === metric.key)
    if (!def) return metric.benchmark
    if (def.unit === 's') return `${metric.benchmark}s`
    return `${metric.benchmark}${def.unit}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1D2433]">Conversation Intelligence</h1>
          <p className="text-xs text-[#6B7385] mt-0.5">
            AI-powered analysis of conversation behaviours and patterns
            {selectedClient && !isAllClients && ` · ${selectedClient.name}`}
          </p>
        </div>
      </div>

      {/* Client + Date Filter Bar (synced with CallExplorer) */}
      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 size={14} className="text-[#6B7385]" />
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
                onClick={() => handlePreset(d)}
                className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-[#E7E2D8] hover:border-[#3457D5]/40 text-[#6B7385] hover:text-[#3457D5] transition"
              >
                {d}D
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={handleProcessVAD}
              disabled={!clientId || vadTriggering}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#3457D5] hover:bg-[#2a45b8] disabled:opacity-40 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition"
              title={!clientId ? 'Select a client first' : 'Run VAD on unprocessed recordings'}
            >
              {vadTriggering ? (
                <RefreshCw size={13} className="animate-spin" />
              ) : (
                <Zap size={13} />
              )}
              {vadTriggering ? 'Starting…' : 'Process VAD'}
            </button>
            <button
              onClick={fetchVADMetrics}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#3457D5] hover:bg-[#EEF1FE] px-3 py-1.5 rounded-lg transition"
            >
              <RefreshCw size={13} className={vadLoading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </div>
      </Card>

      {/* ESM VAD Metrics Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mic size={16} className="text-[#3457D5]" />
            <SectionTitle>ESM VAD — Recording Analysis</SectionTitle>
          </div>
          <div className="flex gap-1 bg-[#F7F4EE] rounded-lg p-0.5">
            {['cards', 'table'].map((v) => (
              <button
                key={v}
                onClick={() => setVadView(v)}
                className={`text-xs font-semibold px-3 py-1 rounded-md transition ${vadView === v ? 'bg-white shadow text-[#1D2433]' : 'text-[#6B7385]'}`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {!clientId ? (
          <Card>
            <EmptyState text="Select a client to view ESM VAD recording analysis." />
          </Card>
        ) : vadLoading ? (
          <Card>
            <div className="flex items-center justify-center py-10">
              <RefreshCw size={22} className="text-[#3457D5] animate-spin" />
            </div>
          </Card>
        ) : vadError ? (
          <Card>
            <div className="text-center py-10">
              <p className="text-sm text-[#D14343] font-medium">{vadError}</p>
              <button onClick={fetchVADMetrics} className="mt-2 text-xs font-semibold text-[#3457D5] hover:underline">Retry</button>
            </div>
          </Card>
        ) : vadData.length === 0 ? (
          <Card>
            <EmptyState text="No VAD data available yet. Click “Process VAD” to analyze recordings for this client." />
          </Card>
        ) : vadView === 'cards' ? (
          <div className="grid grid-cols-4 gap-4">
            {vadData.map((metric) => {
              const def = VAD_METRICS.find((m) => m.key === metric.key) || {}
              const Icon = def.icon || Mic
              const status = getMetricStatus(metric)
              return (
                <Card key={metric.key}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        status === 'green' ? 'bg-[#E7F7EF]' : status === 'amber' ? 'bg-[#FCF1DF]' : 'bg-[#FBE9E9]'
                      }`}>
                        <Icon size={15} className={
                          status === 'green' ? 'text-[#1C9A6C]' : status === 'amber' ? 'text-[#C9862B]' : 'text-[#D14343]'
                        } />
                      </div>
                      <div>
                        <div className="text-xs text-[#6B7385] font-medium">{def.label || metric.key}</div>
                        <div className="text-lg font-bold text-[#1D2433]">{formatValue(metric)}</div>
                      </div>
                    </div>
                    <span className={`w-2 h-2 rounded-full ${levelColor[status]}`} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-[#6B7385] mt-1">
                    <span>Benchmark: {formatBenchmark(metric)}</span>
                    {typeof metric.trend === 'number' && (
                      <span className={metric.trend < 0 ? 'text-[#1C9A6C]' : 'text-[#D14343]'}>
                        {metric.trend > 0 ? '↑' : '↓'} {Math.abs(metric.trend)}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 h-1 rounded-full bg-[#F0EDE4] overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        status === 'green' ? 'bg-[#1C9A6C]' : status === 'amber' ? 'bg-[#C9862B]' : 'bg-[#D14343]'
                      }`}
                      style={{
                        width: `${Math.min(100, (metric.value / (def.threshold * 2 || 1)) * 100)}%`,
                      }}
                    />
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] text-[#6B7385] font-semibold uppercase border-b border-[#E7E2D8]">
                    <th className="py-2 pr-3">Metric</th>
                    <th className="py-2 pr-3">Value</th>
                    <th className="py-2 pr-3">Benchmark</th>
                    <th className="py-2 pr-3">Trend</th>
                    <th className="py-2 pr-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {vadData.map((metric) => {
                    const def = VAD_METRICS.find((m) => m.key === metric.key) || {}
                    const status = getMetricStatus(metric)
                    const Icon = def.icon || Mic
                    return (
                      <tr key={metric.key} className="border-b border-[#E7E2D8]/70">
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2">
                            <Icon size={14} className="text-[#6B7385]" />
                            <span className="font-medium text-[#1D2433]">{def.label || metric.key}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-3 font-semibold text-[#1D2433]">{formatValue(metric)}</td>
                        <td className="py-2.5 pr-3 text-[#6B7385]">{formatBenchmark(metric)}</td>
                        <td className={`py-2.5 pr-3 font-medium ${
                          typeof metric.trend === 'number'
                            ? metric.trend < 0 ? 'text-[#1C9A6C]' : 'text-[#D14343]'
                            : 'text-[#6B7385]'
                        }`}>
                          {typeof metric.trend === 'number'
                            ? `${metric.trend > 0 ? '↑' : '↓'} ${Math.abs(metric.trend)}`
                            : '—'}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            status === 'green' ? 'bg-[#E7F7EF] text-[#1C9A6C]'
                            : status === 'amber' ? 'bg-[#FCF1DF] text-[#C9862B]'
                            : 'bg-[#FBE9E9] text-[#D14343]'
                          }`}>
                            {status === 'green' ? 'Good' : status === 'amber' ? 'Needs Attention' : 'Critical'}
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
      </div>

      {/* Behaviour Distribution Cards */}
      <div>
        <SectionTitle>Behaviour Distribution</SectionTitle>
        <div className="grid grid-cols-4 gap-4">
          {DISTRIBUTION.map((d) => (
            <Card key={d.label}>
              <div className="text-xs text-[#6B7385] font-medium mb-1">{d.label}</div>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold text-[#1D2433]">
                  {d.value}<span className="text-xs font-medium text-[#6B7385] ml-0.5">{d.unit}</span>
                </div>
                <Trend value={d.trend} />
              </div>
              <div className="mt-2"><Sparkline data={d.spark} /></div>
            </Card>
          ))}
        </div>
      </div>

      {/* Multi-line Trend + Sentiment Chart */}
      <div className="grid grid-cols-2 gap-6">
        <Card>
          <SectionTitle>Behaviour Trends</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={multiLineTrend}>
                <CartesianGrid vertical={false} stroke="#EFEAE0" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip />
                <Line type="monotone" dataKey="avg_score" name="Score" stroke="#3457D5" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="compliance" name="Compliance" stroke="#1C9A6C" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="sentiment" name="Sentiment" stroke="#C9862B" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <SectionTitle>Sentiment Distribution</SectionTitle>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={[
                { month: 'Mar', positive: 58, neutral: 28, negative: 14 },
                { month: 'Apr', positive: 60, neutral: 27, negative: 13 },
                { month: 'May', positive: 62, neutral: 26, negative: 12 },
                { month: 'Jun', positive: 64, neutral: 25, negative: 11 },
                { month: 'Jul', positive: 66, neutral: 24, negative: 10 },
                { month: 'Aug', positive: 68, neutral: 23, negative: 9 },
              ]}>
                <CartesianGrid vertical={false} stroke="#EFEAE0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip />
                <Area type="monotone" dataKey="positive" name="Positive" stackId="1" stroke="#1C9A6C" fill="#1C9A6C" fillOpacity={0.3} />
                <Area type="monotone" dataKey="neutral" name="Neutral" stackId="1" stroke="#C9862B" fill="#C9862B" fillOpacity={0.3} />
                <Area type="monotone" dataKey="negative" name="Negative" stackId="1" stroke="#D14343" fill="#D14343" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Keyword Topic Bars */}
      <Card>
        <SectionTitle>Top Conversation Topics</SectionTitle>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { topic: 'Billing', count: 245 },
              { topic: 'Refund', count: 198 },
              { topic: 'Technical', count: 178 },
              { topic: 'Account', count: 156 },
              { topic: 'Shipping', count: 134 },
              { topic: 'Cancellation', count: 112 },
              { topic: 'Upgrade', count: 98 },
              { topic: 'Complaint', count: 87 },
            ]} layout="vertical">
              <CartesianGrid horizontal={false} stroke="#EFEAE0" />
              <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="topic" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip />
              <Bar dataKey="count" fill="#3457D5" radius={[0, 4, 4, 0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Behaviour Heatmap */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold text-[#1D2433]">Behaviour Heatmap</h3>
          <div className="flex gap-1 bg-[#F7F4EE] rounded-lg p-0.5">
            {['team', 'agent', 'queue'].map((v) => (
              <button
                key={v}
                onClick={() => setHeatmapView(v)}
                className={`text-xs font-semibold px-3 py-1 rounded-md transition ${heatmapView === v ? 'bg-white shadow text-[#1D2433]' : 'text-[#6B7385]'}`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-left text-[#6B7385] font-semibold p-2 w-40 capitalize">{heatmapView}</th>
                {HEATMAP.behaviours.map((b) => (
                  <th key={b} className="text-[#6B7385] font-semibold p-2 text-center whitespace-nowrap">{b}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HEATMAP.rows.map((row) => (
                <tr key={row.team}>
                  <td className="p-2 font-semibold text-[#1D2433]">{row.team}</td>
                  {HEATMAP.behaviours.map((b) => {
                    const level = row.cells[b]
                    const key = `${row.team}-${b}`
                    return (
                      <td key={b} className="p-1 text-center">
                        <button
                          onMouseEnter={() => setHoverCell(key)}
                          onMouseLeave={() => setHoverCell(null)}
                          onClick={() => navigate(`/calls?team=${encodeURIComponent(row.team)}`)}
                          className={`w-10 h-8 rounded-md ${levelColor[level]} ${hoverCell === key ? 'ring-2 ring-[#16213E] scale-110' : ''} transition-all`}
                          title={`${row.team} · ${b}: ${level}`}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-4 mt-4 text-xs text-[#6B7385]">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#1C9A6C] inline-block" /> Good</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#C9862B] inline-block" /> Needs Attention</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-[#D14343] inline-block" /> Critical</span>
          <span className="ml-auto">Click a cell to view related calls</span>
        </div>
      </Card>

      {/* Top AI Findings */}
      <div>
        <SectionTitle>Top AI Findings</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          {AI_FINDINGS.map((f) => {
            const Icon = Icons[toPascal(f.icon)] || Icons.Sparkles
            return (
              <Card key={f.id}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#EEF1FE] flex items-center justify-center shrink-0">
                    <Icon size={17} className="text-[#3457D5]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <SeverityBadge level={f.severity} />
                    </div>
                    <p className="text-sm text-[#1D2433] font-medium leading-snug">{f.description}</p>
                    {f.affected_calls.length > 0 && (
                      <div className="text-xs text-[#6B7385] mt-2">
                        {f.affected_calls.length} calls affected · {f.affected_agents.length} agents involved
                      </div>
                    )}
                    {f.affected_calls.length > 0 && (
                      <button
                        onClick={() => navigate(`/calls?q=${f.affected_calls[0]}`)}
                        className="mt-2 text-xs font-semibold text-[#3457D5] hover:underline"
                      >
                        View Calls →
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function toPascal(kebab) {
  return kebab.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('')
}