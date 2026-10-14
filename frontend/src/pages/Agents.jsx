import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts'
import { Card } from '../components/shared.jsx'
import {
  listAgents, getAgentScoreByParameter, getAgentComparison,
  getAgentSubParameterDrilldown, getAgentCoaching, getAgentLeaderboard
} from '../api/client.js'
import { useClientFilter } from '../components/ClientContext.jsx'
import {
  Search, RefreshCw, Users, Trophy, Award, TrendingUp,
  AlertTriangle, ChevronDown, Filter, Lightbulb
} from 'lucide-react'

const PARAMS = [
  { key: 'opening', label: 'Opening' },
  { key: 'customer_understanding', label: 'Customer Understanding' },
  { key: 'resolution_quality', label: 'Resolution Quality' },
  { key: 'communication', label: 'Communication' },
  { key: 'call_control', label: 'Call Control' },
  { key: 'process_adherence', label: 'Process Adherence' },
  { key: 'closing', label: 'Closing' },
]

const RAG = {
  green: { bg: '#E7F7EF', text: '#1C9A6C' },
  amber: { bg: '#FCF1DF', text: '#C9862B' },
  red: { bg: '#FBE9E9', text: '#D14343' },
}

function ragOf(pct) {
  if (pct >= 80) return RAG.green
  if (pct >= 60) return RAG.amber
  return RAG.red
}

export default function Agents() {
  const navigate = useNavigate()
  const { clientId, clients, setClientId, selectedClient, isAllClients, clientType, fromDate, toDate, setFromDate, setToDate } = useClientFilter()

  const [agents, setAgents] = useState([])
  const [leaderboard, setLeaderboard] = useState([])
  const [comparison, setComparison] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [agentParams, setAgentParams] = useState(null)
  const [agentDrill, setAgentDrill] = useState(null)
  const [agentCoach, setAgentCoach] = useState(null)
  const [agentCoachAll, setAgentCoachAll] = useState([])
  const [showComparison, setShowComparison] = useState(false)

  const fetchAgents = useCallback(() => {
    setLoading(true); setError(null)
    const params = {}
    if (clientId && clientId !== 'all') params.client_id = clientId
    if (search) params.q = search

    Promise.all([
      listAgents(params).catch(() => ({ agents: [] })),
      getAgentLeaderboard(params).catch(() => ({ leaderboard: [] })),
      getAgentComparison(params).catch(() => null),
    ])
      .then(([agentsRes, lbRes, compRes]) => {
        setAgents(agentsRes?.agents || [])
        setLeaderboard(lbRes?.leaderboard || [])
        setComparison(compRes)
        setLoading(false)
      })
      .catch((err) => { setError(err.message || 'Failed'); setLoading(false) })
  }, [clientId, search])

  useEffect(() => { fetchAgents() }, [fetchAgents])

  const loadAgentDetails = async (agentId) => {
    setSelectedAgent(agentId)
    setAgentParams(null); setAgentDrill(null); setAgentCoach(null)

    const params = {}
    if (clientId && clientId !== 'all') params.client_id = clientId
    if (fromDate) params.from_date = fromDate
    if (toDate) params.to_date = toDate

    Promise.all([
      getAgentScoreByParameter(agentId, params).catch(() => null),
      getAgentSubParameterDrilldown(agentId, params).catch(() => null),
      getAgentCoaching(agentId, params).catch(() => null),
    ]).then(([p, d, c]) => {
      setAgentParams(p)
      setAgentDrill(d)
      setAgentCoach(c)
    })
  }

  if (loading && !agents.length) {
    return <div className="flex items-center justify-center h-96">
      <RefreshCw size={32} className="text-[#3457D5] animate-spin" />
    </div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1D2433]">Agents</h1>
          <p className="text-xs text-[#6B7385] mt-0.5">
            {isAllClients ? 'All Clients' : selectedClient?.name || ''} · {agents.length} agents
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowComparison((v) => !v)}
            className={`flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border ${
              showComparison ? 'bg-[#3457D5] text-white border-[#3457D5]' : 'border-[#E7E2D8] hover:bg-[#F7F4EE]'
            }`}>
            <TrendingUp size={13} /> {showComparison ? 'Hide' : 'Show'} Comparison
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter size={13} className="text-[#6B7385]" />
            <select value={clientId ?? ''} onChange={(e) => setClientId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5 bg-white min-w-[140px]">
              <option value="all">All Clients</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5" />
            <span className="text-xs text-[#6B7385]">to</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5" />
          </div>
          <div className="relative flex-1 max-w-xs ml-auto">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7385]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search agent (IDC...)..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-[#F7F4EE] border border-[#E7E2D8] focus:outline-none" />
          </div>
          <button onClick={fetchAgents} disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#3457D5] hover:underline disabled:opacity-50">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </Card>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3 flex items-center gap-2">
            <Trophy size={16} className="text-[#C9862B]" /> Agent Leaderboard
          </h3>
          <div className="grid grid-cols-5 gap-3">
            {leaderboard.slice(0, 5).map((a) => {
              const rag = ragOf(a.percentage)
              const medal = a.rank === 1 ? '🥇' : a.rank === 2 ? '🥈' : a.rank === 3 ? '🥉' : `#${a.rank}`
              return (
                <button key={a.agent_id} onClick={() => loadAgentDetails(a.agent_id)}
                  className="text-left p-3 rounded-xl border border-[#E7E2D8] hover:border-[#3457D5]/40 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-lg">{medal}</span>
                    <span className="text-[10px] text-[#6B7385]">{a.audits} audits</span>
                  </div>
                  <div className="text-xs font-bold text-[#1D2433] truncate">{a.agent_id}</div>
                  <div className="text-xl font-bold mt-1" style={{ color: rag.text }}>{a.percentage}%</div>
                  {a.fatal_count > 0 && (
                    <div className="text-[9px] font-bold text-[#D14343] mt-1">
                      {a.fatal_count} Fatal
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {/* Comparison Table (if toggled) */}
      {showComparison && comparison?.comparison?.length > 0 && (
        <Card>
          <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">Parameter-wise Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] text-[#6B7385] font-semibold uppercase border-b border-[#E7E2D8]">
                  <th className="py-2 pr-3">Agent</th>
                  {PARAMS.map((p) => <th key={p.key} className="py-2 pr-2 text-center">{p.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {comparison.comparison.slice(0, 15).map((row) => (
                  <tr key={row.agent_id} className="border-b border-[#E7E2D8]/70 hover:bg-[#F7F4EE]/50">
                    <td className="py-2 pr-3 font-semibold text-[#1D2433]">{row.agent_id}</td>
                    {PARAMS.map((p) => {
                      const d = row.parameters[p.key] || {}
                      const rag = ragOf(d.percentage || 0)
                      return (
                        <td key={p.key} className="py-2 pr-2 text-center">
                          <span className="font-semibold" style={{ color: rag.text }}>
                            {d.percentage || 0}%
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Agents Grid */}
      <Card>
        <h3 className="text-[15px] font-semibold text-[#1D2433] mb-3">
          All Agents ({agents.length})
        </h3>
        <div className="grid grid-cols-3 gap-3">
          {agents.map((a) => {
            const rag = ragOf(a.percentage)
            return (
              <button key={a.agent_id} onClick={() => loadAgentDetails(a.agent_id)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  selectedAgent === a.agent_id ? 'border-[#3457D5] bg-[#EEF1FE]' : 'border-[#E7E2D8] hover:border-[#3457D5]/40'
                }`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-full bg-[#3457D5] text-white flex items-center justify-center text-[10px] font-bold">
                    {a.agent_id?.slice(-2) || '?'}
                  </div>
                  <span className="text-xl font-bold" style={{ color: rag.text }}>{a.percentage}%</span>
                </div>
                <div className="text-xs font-bold text-[#1D2433]">{a.agent_id}</div>
                <div className="grid grid-cols-3 gap-1 mt-2 text-[9px]">
                  <div>
                    <div className="text-[#6B7385]">Audits</div>
                    <div className="font-bold text-[#1D2433]">{a.total_audits}</div>
                  </div>
                  <div>
                    <div className="text-[#6B7385]">FCR</div>
                    <div className="font-bold text-[#1C9A6C]">{a.fcr_percentage}%</div>
                  </div>
                  <div>
                    <div className="text-[#6B7385]">Fatal</div>
                    <div className={`font-bold ${a.fatal_count > 0 ? 'text-[#D14343]' : 'text-[#1D2433]'}`}>{a.fatal_count}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Agent Detail Panel (when selected) */}
      {selectedAgent && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-[#1D2433]">
              Agent Details: {selectedAgent}
            </h3>
            <button onClick={() => setSelectedAgent(null)} className="text-xs text-[#6B7385] hover:text-[#1D2433]">Close</button>
          </div>

          {/* Parameter Scores */}
          {agentParams && (
            <div className="mb-6">
              <h4 className="text-xs font-bold text-[#1D2433] uppercase mb-2">Score by Parameter</h4>
              <div className="grid grid-cols-7 gap-2">
                {agentParams.parameters?.map((p) => {
                  const rag = ragOf(p.percentage)
                  return (
                    <div key={p.key} className="p-3 rounded-xl border text-center"
                      style={{ background: rag.bg, borderColor: rag.text + '40' }}>
                      <div className="text-[9px] font-semibold text-[#6B7385] min-h-[22px]">{p.label}</div>
                      <div className="text-xl font-bold" style={{ color: rag.text }}>{p.percentage}%</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Drill-down */}
          {agentDrill?.sub_parameters && (
            <div className="mb-6">
              <h4 className="text-xs font-bold text-[#1D2433] uppercase mb-2">Sub-Parameter Drill-Down</h4>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agentDrill.sub_parameters} layout="vertical">
                    <CartesianGrid vertical={false} stroke="#EFEAE0" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="sub" tick={{ fontSize: 10 }} width={110} />
                    <Tooltip />
                    <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                      {agentDrill.sub_parameters.map((s, i) => (
                        <rect key={i} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Coaching */}
          {agentCoach && (
            <div className="mb-4 p-4 rounded-xl bg-[#FCF1DF] border border-[#C9862B]/20">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb size={14} className="text-[#C9862B]" />
                <span className="text-xs font-bold text-[#1D2433] uppercase">AI Coaching Recommendations</span>
                <span className="text-[10px] font-bold text-[#1C9A6C] ml-auto">
                  {agentCoach.estimated_improvement}
                </span>
              </div>
              <ul className="space-y-1">
                {agentCoach.recommendations?.map((r, i) => (
                  <li key={i} className="text-xs text-[#1D2433] flex gap-2">
                    <span className="text-[#C9862B]">•</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}