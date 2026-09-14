import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, SectionTitle, Sparkline, Trend, SeverityBadge } from '../components/shared.jsx'
import { DISTRIBUTION, HEATMAP, AI_FINDINGS, TREND_DATA, HEALTH_SCORE } from '../data/mock.js'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, BarChart, Bar } from 'recharts'
import * as Icons from 'lucide-react'

const levelColor = { green: 'bg-[#1C9A6C]', amber: 'bg-[#C9862B]', red: 'bg-[#D14343]' }

export default function ConversationIntelligence() {
  const [hoverCell, setHoverCell] = useState(null)
  const [heatmapView, setHeatmapView] = useState('team')
  const navigate = useNavigate()

  const multiLineTrend = TREND_DATA.map(d => ({
    ...d, dead_air: 4 + Math.random() * 2, interruptions: 1.2 + Math.random() * 0.8, escalation: 6 + Math.random() * 3,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1D2433]">Conversation Intelligence</h1>
        <p className="text-xs text-[#6B7385] mt-0.5">AI-powered analysis of conversation behaviours and patterns</p>
      </div>

      {/* Behaviour Distribution Cards */}
      <div>
        <SectionTitle>Behaviour Distribution</SectionTitle>
        <div className="grid grid-cols-4 gap-4">
          {DISTRIBUTION.map((d) => (
            <Card key={d.label}>
              <div className="text-xs text-[#6B7385] font-medium mb-1">{d.label}</div>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-bold text-[#1D2433]">{d.value}<span className="text-xs font-medium text-[#6B7385] ml-0.5">{d.unit}</span></div>
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
              <button key={v} onClick={() => setHeatmapView(v)} className={`text-xs font-semibold px-3 py-1 rounded-md transition ${heatmapView === v ? 'bg-white shadow text-[#1D2433]' : 'text-[#6B7385]'}`}>
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
