import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, SectionTitle, SeverityBadge, ProgressBar, Trend } from '../components/shared.jsx'
import { COACHING_QUEUE } from '../data/mock.js'
import { getClientAgents, getClientTeamHealth } from '../api/client.js'
import { useClientFilter, getDateRange } from '../components/ClientContext.jsx'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts'
import { TrendingUp, Target, Award, RefreshCw, AlertTriangle, Calendar, Building2 } from 'lucide-react'

const riskColor = { Low: 'text-[#1C9A6C]', Medium: 'text-[#C9862B]', High: 'text-[#D14343]', Critical: 'text-[#D14343] font-bold' }

const teamNameMap = {
  blank_call: 'Blank Call',
  bill_request: 'Bill Request',
  purchase_query: 'Purchase Query',
  complaint_call: 'Complaint Call',
  ac_installation_coordination: 'AC Installation',
  inbound: 'Inbound Support',
  outbound: 'Outbound Sales',
  retention: 'Retention',
  billing: 'Billing',
  technical: 'Technical Support',
  sales: 'Sales',
  onboarding: 'Onboarding',
  support: 'Customer Support',
  unknown: 'Unassigned',
}

export default function Agents() {
  const [searchParams, setSearchParams] = useSearchParams()
  const agentParam = searchParams.get('agent')
  const { clientId, clients, setClientId, selectedClient, isAllClients, fromDate, toDate, setFromDate, setToDate, clientType } = useClientFilter()

  const [agents, setAgents] = useState([])
  const [teamHealth, setTeamHealth] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedAgent, setSelectedAgent] = useState(agentParam || null)
  const [sortKey, setSortKey] = useState('avg_score')
  const [sortDir, setSortDir] = useState('desc')
  const [refreshKey, setRefreshKey] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    if (!clientId || isAllClients) {
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      getClientAgents(clientId, fromDate, toDate, clientType),
      getClientTeamHealth(clientId, fromDate, toDate, clientType),
    ])
      .then(([agentRes, teamRes]) => {
        if (!cancelled) {
          setAgents(agentRes.agents || [])
          setTeamHealth(teamRes.teams || [])
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
  }, [clientId, fromDate, toDate, clientType, refreshKey])

  const handlePreset = (days) => {
    const range = getDateRange(days)
    setFromDate(range.from)
    setToDate(range.to)
  }

  useEffect(() => {
    if (agentParam) setSelectedAgent(agentParam)
  }, [agentParam])

  useEffect(() => {
    setSelectedAgent(null)
  }, [clientId])

  const sorted = [...agents].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    return (a[sortKey] - b[sortKey]) * dir
  })

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const selectAgent = (id) => {
    setSelectedAgent(id)
    setSearchParams(prev => { prev.set('agent', id); return prev })
  }

  const agent = selectedAgent ? agents.find(a => a.id === selectedAgent) : null
  const radarData = agent ? [
    { dim: 'Conversation', value: agent.conversation_score },
    { dim: 'Sentiment', value: agent.sentiment_score },
    { dim: 'Professionalism', value: agent.professionalism },
    { dim: 'Compliance', value: agent.compliance },
    { dim: 'Avg Score', value: agent.avg_score },
  ] : []

  if (isAllClients) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-[#1D2433]">Agents</h1>
          <p className="text-xs text-[#6B7385] mt-0.5">All Clients · {fromDate} to {toDate}</p>
        </div>
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
          </div>
        </Card>
        <Card className="flex items-center justify-center h-64 text-sm text-[#6B7385]">
          Select a specific client to view their agents
        </Card>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw size={32} className="text-[#3457D5] animate-spin mx-auto mb-3" />
          <p className="text-sm text-[#6B7385] font-medium">Loading agents for {selectedClient ? selectedClient.name : 'client'}...</p>
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
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1D2433]">Agents</h1>
          <p className="text-xs text-[#6B7385] mt-0.5">{selectedClient ? selectedClient.name : 'No client selected'} · {fromDate} to {toDate} · {agents.length} agents</p>
        </div>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-semibold text-[#3457D5] hover:underline disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

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
        </div>
      </Card>

      {/* Team Health Cards */}
      {teamHealth.length > 0 && (
        <div>
          <SectionTitle>Team Health</SectionTitle>
          <div className="grid grid-cols-5 gap-4">
            {teamHealth.slice(0, 5).map((t, i) => (
              <Card key={t.team + i} className="cursor-pointer hover:border-[#3457D5]/40 transition-all">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#6B7385]">{teamNameMap[t.team?.toLowerCase()] || t.team}</span>
                </div>
                <div className="text-2xl font-bold text-[#1D2433]">{t.score}%</div>
                <div className="text-[10px] text-[#6B7385] mt-1">{t.calls} calls · {t.agents} agents</div>
                <div className={`text-[10px] font-semibold mt-2 px-2 py-0.5 rounded-full inline-block ${
                  t.risk === 'Low' ? 'bg-[#E7F7EF] text-[#1C9A6C]' :
                  t.risk === 'Medium' ? 'bg-[#FCF1DF] text-[#C9862B]' :
                  'bg-[#D14343] text-white'
                }`}>{t.risk}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Agent Leaderboard */}
        <Card className="col-span-2">
          <SectionTitle>Agent Leaderboard</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] text-[#6B7385] font-semibold uppercase border-b border-[#E7E2D8]">
                  <th className="py-2 pr-3">Agent</th>
                  <th className="py-2 pr-3 cursor-pointer hover:text-[#1D2433]" onClick={() => toggleSort('avg_score')}>Avg Score</th>
                  <th className="py-2 pr-3 cursor-pointer hover:text-[#1D2433]" onClick={() => toggleSort('conversation_score')}>Conversation</th>
                  <th className="py-2 pr-3 cursor-pointer hover:text-[#1D2433]" onClick={() => toggleSort('sentiment_score')}>Sentiment</th>
                  <th className="py-2 pr-3 cursor-pointer hover:text-[#1D2433]" onClick={() => toggleSort('compliance')}>Compliance</th>
                  <th className="py-2 pr-3">Fatal</th>
                  <th className="py-2 pr-3">Risk</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((a) => (
                  <tr
                    key={a.id}
                    onClick={() => selectAgent(a.id)}
                    className={`border-b border-[#E7E2D8]/70 hover:bg-[#F7F4EE] cursor-pointer transition ${selectedAgent === a.id ? 'bg-[#EEF1FE]' : ''}`}
                  >
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white bg-[#3457D5]">{a.id.slice(-2)}</div>
                        <span className="font-semibold text-[#1D2433]">{a.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 font-semibold">{a.avg_score}%</td>
                    <td className="py-2.5 pr-3">{a.conversation_score}%</td>
                    <td className="py-2.5 pr-3">{a.sentiment_score}%</td>
                    <td className="py-2.5 pr-3">{a.compliance}%</td>
                    <td className="py-2.5 pr-3 text-[#6B7385]">{a.fatal_count}</td>
                    <td className={`py-2.5 pr-3 ${riskColor[a.risk]}`}>{a.risk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Agent Profile Panel */}
        <div className="space-y-6">
          {agent ? (
            <>
              <Card>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold text-white bg-[#3457D5]">{agent.id.slice(-2)}</div>
                  <div>
                    <div className="text-sm font-bold text-[#1D2433]">{agent.name}</div>
                    <div className="text-xs text-[#6B7385]">{agent.calls} calls audited</div>
                  </div>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="#E7E2D8" />
                      <PolarAngleAxis dataKey="dim" tick={{ fontSize: 10 }} />
                      <Radar dataKey="value" stroke="#3457D5" fill="#3457D5" fillOpacity={0.2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <SectionTitle icon={Target}>Parameter Breakdown</SectionTitle>
                <ProgressBar label="Conversation" value={agent.conversation_score} />
                <ProgressBar label="Sentiment" value={agent.sentiment_score} />
                <ProgressBar label="Professionalism" value={agent.professionalism} />
                <ProgressBar label="Compliance" value={agent.compliance} />
              </Card>

              <Card>
                <SectionTitle icon={TrendingUp}>Risk Summary</SectionTitle>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6B7385]">Fatal flags</span>
                    <span className="font-semibold text-[#D14343]">{agent.fatal_count}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6B7385]">Low scores (&lt;60%)</span>
                    <span className="font-semibold text-[#C9862B]">{agent.low_score_count}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-[#6B7385]">Risk level</span>
                    <span className={`font-semibold ${riskColor[agent.risk]}`}>{agent.risk}</span>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <Card className="flex items-center justify-center h-64 text-sm text-[#6B7385]">
              Click an agent to view their profile
            </Card>
          )}
        </div>
      </div>

      {/* AI Coaching Recommendations */}
      <Card>
        <SectionTitle icon={Award}>AI Coaching Recommendations</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          {COACHING_QUEUE.slice(0, 6).map((c) => (
            <div key={c.id} className="border border-[#E7E2D8] rounded-xl p-4 hover:border-[#3457D5]/30 transition">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-[#1D2433]">{c.agent_name}</span>
                <SeverityBadge level={c.status === 'Escalated' ? 'High' : c.status === 'Completed' ? 'Low' : 'Medium'} />
              </div>
              <p className="text-xs text-[#6B7385] mb-2 line-clamp-2">{c.recommendation}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#1C9A6C]">{c.estimated_improvement}</span>
                <button
                  disabled={c.status !== 'Needs Coaching'}
                  onClick={() => navigate('/coaching')}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#16213E] text-white disabled:opacity-40"
                >
                  {c.status === 'Needs Coaching' ? 'Assign Training' : c.status}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
