import React, { useState, useEffect, useCallback } from 'react'
import { Card, SectionTitle, EmptyState } from '../components/shared.jsx'
import { useAuth } from '../components/AuthContext.jsx'
import {
  getCoachingQueue, updateCoaching, deleteCoaching, autoFlagCoaching, createCoaching, listAgents,
} from '../api/client.js'
import {
  Target, CheckCircle, Clock, AlertTriangle, ArrowRight, Zap,
  Plus, Trash2, RefreshCw, Activity,
} from 'lucide-react'

const STATUSES = ['Needs Coaching', 'Assigned', 'Completed', 'Escalated']
const statusIcon = { 'Needs Coaching': Target, 'Assigned': Clock, 'Completed': CheckCircle, 'Escalated': AlertTriangle }
const statusColor = { 'Needs Coaching': '#C9862B', 'Assigned': '#3457D5', 'Completed': '#1C9A6C', 'Escalated': '#D14343' }

export default function CoachingCenter() {
  const { isAdmin } = useAuth()
  const [items, setItems] = useState([])
  const [allAgents, setAllAgents] = useState([])
  const [selectedItem, setSelectedItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [autoFlagging, setAutoFlagging] = useState(false)
  const [flagResult, setFlagResult] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState(null)
  const [newItem, setNewItem] = useState({ agent_id: '', agent_name: '', team: '', recommendation: '', estimated_improvement: '', reason: '' })

  const loadCoaching = useCallback(async () => {
    try {
      const data = await getCoachingQueue()
      setItems(data)
    } catch { /* ignore */ }
  }, [])

  const loadAgents = useCallback(async () => {
    try {
      const data = await listAgents()
      setAllAgents(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      await Promise.all([loadCoaching(), loadAgents()])
      setLoading(false)
    }
    load()
  }, [loadCoaching, loadAgents])

  const advance = async (item) => {
    const idx = STATUSES.indexOf(item.status)
    const next = STATUSES[Math.min(idx + 1, STATUSES.length - 1)]
    try {
      await updateCoaching(item.id, { status: next })
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, status: next } : x))
      if (selectedItem?.id === item.id) {
        setSelectedItem(prev => ({ ...prev, status: next }))
      }
    } catch { /* ignore */ }
  }

  const removeItem = async (id) => {
    if (!window.confirm('Delete this coaching item?')) return
    try {
      await deleteCoaching(id)
      setItems(prev => prev.filter(x => x.id !== id))
      if (selectedItem?.id === id) setSelectedItem(null)
    } catch { /* ignore */ }
  }

  const handleAutoFlag = async () => {
    setAutoFlagging(true)
    setFlagResult(null)
    try {
      const result = await autoFlagCoaching()
      setFlagResult(result)
      await loadCoaching()
    } catch { /* ignore */ }
    setAutoFlagging(false)
  }

  const handleAdd = async () => {
    if (!newItem.agent_id || !newItem.agent_name) {
      setError('Please select an agent first')
      return
    }
    try {
      await createCoaching(newItem)
      setNewItem({ agent_id: '', agent_name: '', team: '', recommendation: '', estimated_improvement: '', reason: '' })
      setShowAdd(false)
      setError(null)
      await loadCoaching()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to save coaching item')
    }
  }

  const onAgentSelect = (agentId) => {
    const agent = allAgents.find(a => a.id === agentId)
    if (agent) {
      setNewItem(prev => ({
        ...prev,
        agent_id: agent.id,
        agent_name: agent.name,
        team: agent.team,
      }))
    }
  }

  const getScoreColor = (score) => {
    if (score >= 80) return '#1C9A6C'
    if (score >= 70) return '#C9862B'
    return '#D14343'
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-[#1D2433]">Coaching Center</h1>
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3457D5]" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1D2433]">Coaching Center</h1>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button onClick={handleAutoFlag} disabled={autoFlagging}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C9862B] text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition">
                <RefreshCw size={13} className={autoFlagging ? 'animate-spin' : ''} />
                {autoFlagging ? 'Scanning...' : 'Auto-Flag Agents'}
              </button>
              <button onClick={() => setShowAdd(!showAdd)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3457D5] text-white text-xs font-semibold hover:opacity-90 transition">
                <Plus size={13} /> Add Coaching
              </button>
            </>
          )}
        </div>
      </div>

      {flagResult && (
        <div className="border border-[#C9862B]/30 bg-[#C9862B]/5 rounded-xl px-4 py-3 text-sm">
          <span className="font-semibold text-[#C9862B]">Auto-Flag Result:</span>{' '}
          <span className="text-[#1D2433]">
            {flagResult.count === 0
              ? 'No new agents flagged. All eligible agents already have active coaching items.'
              : `${flagResult.count} agent(s) flagged for coaching.`}
          </span>
          {flagResult.flagged.length > 0 && (
            <div className="mt-2 space-y-1">
              {flagResult.flagged.map(f => (
                <div key={f.agent_id} className="text-xs text-[#6B7385]">
                  <span className="font-medium text-[#1D2433]">{f.name}</span> (score: {f.score}) — {f.reasons.join(', ')}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <Card>
          <SectionTitle>Add Coaching Item</SectionTitle>
          {error && (
            <div className="mb-3 bg-[#FBE9E9] text-[#D14343] text-xs font-semibold px-3 py-2 rounded-xl">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="text-xs text-[#6B7385] font-medium">Select Agent</label>
              <select value={newItem.agent_id} onChange={e => onAgentSelect(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30">
                <option value="">-- Select Agent --</option>
                {allAgents.map(a => (
                  <option key={a.id} value={a.id}>{a.name} ({a.id}) — Score: {a.avg_score}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-[#6B7385] font-medium">Team</label>
              <input value={newItem.team} onChange={e => setNewItem(p => ({ ...p, team: e.target.value }))}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-[#6B7385] font-medium">Recommendation</label>
              <textarea value={newItem.recommendation} onChange={e => setNewItem(p => ({ ...p, recommendation: e.target.value }))}
                rows={2} className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
            </div>
            <div>
              <label className="text-xs text-[#6B7385] font-medium">Expected Improvement</label>
              <input value={newItem.estimated_improvement} onChange={e => setNewItem(p => ({ ...p, estimated_improvement: e.target.value }))}
                placeholder="+10% score" className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
            </div>
            <div>
              <label className="text-xs text-[#6B7385] font-medium">Reason</label>
              <input value={newItem.reason} onChange={e => setNewItem(p => ({ ...p, reason: e.target.value }))}
                placeholder="Low score, compliance issue, etc." className="w-full mt-1 px-3 py-2 rounded-xl border border-[#E7E2D8] text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30" />
            </div>
            <div className="col-span-2 flex gap-2">
              <button onClick={handleAdd} className="px-4 py-2 rounded-xl bg-[#3457D5] text-white text-xs font-semibold hover:opacity-90 transition">Save</button>
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-xl border border-[#E7E2D8] text-[#6B7385] text-xs font-semibold hover:bg-[#F7F4EE]">Cancel</button>
            </div>
          </div>
        </Card>
      )}

      {/* Status Pipeline */}
      <div className="grid grid-cols-4 gap-4">
        {STATUSES.map((status) => {
          const bucket = items.filter((i) => i.status === status)
          const Icon = statusIcon[status]
          return (
            <Card key={status}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: statusColor[status] + '15' }}>
                  <Icon size={14} style={{ color: statusColor[status] }} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1D2433]">{status}</div>
                  <div className="text-[10px] text-[#6B7385]">{bucket.length} agents</div>
                </div>
              </div>
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {bucket.length === 0 ? (
                  <EmptyState text="No agents in this stage." />
                ) : bucket.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => setSelectedItem(selectedItem?.id === c.id ? null : c)}
                    className={`border rounded-xl p-3 cursor-pointer transition-all group ${selectedItem?.id === c.id ? 'border-[#3457D5] bg-[#EEF1FE]/50' : 'border-[#E7E2D8] hover:border-[#3457D5]/30'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-[#1D2433]">{c.agent_name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#6B7385]">{c.team}</span>
                        {isAdmin && (
                          <button onClick={(e) => { e.stopPropagation(); removeItem(c.id) }}
                            className="text-[#D14343] opacity-0 group-hover:opacity-100 transition">
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-[#6B7385] line-clamp-2 mb-2">{c.recommendation}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-[#1C9A6C]">{c.estimated_improvement}</span>
                      {status !== 'Completed' && status !== 'Escalated' && isAdmin && (
                        <button onClick={(e) => { e.stopPropagation(); advance(c) }} className="text-[10px] font-semibold text-[#3457D5] flex items-center gap-0.5">
                          Advance <ArrowRight size={10} />
                        </button>
                      )}
                    </div>
                    {c.score_at_flag != null && (
                      <div className="flex items-center gap-1 mt-1.5">
                        <Activity size={10} style={{ color: getScoreColor(c.score_at_flag) }} />
                        <span className="text-[10px] font-semibold" style={{ color: getScoreColor(c.score_at_flag) }}>
                          Score: {c.score_at_flag}
                        </span>
                      </div>
                    )}
                    {c.reason && (
                      <div className="text-[10px] text-[#6B7385] mt-1 italic">{c.reason}</div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )
        })}
      </div>

      {/* AI Coaching Workflow */}
      <Card>
        <SectionTitle icon={Zap}>AI Coaching Workflow</SectionTitle>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {[
            { step: 1, label: 'Score Analysis', description: 'Agent scores evaluated against thresholds' },
            { step: 2, label: 'Auto-Flag', description: 'Low performers automatically flagged for coaching' },
            { step: 3, label: 'Evidence Gathering', description: 'System collects call data and incident history' },
            { step: 4, label: 'Recommendation', description: 'AI generates personalized coaching plan' },
            { step: 5, label: 'Manager Review', description: 'Team lead reviews and assigns coaching' },
            { step: 6, label: 'Training', description: 'Agent completes assigned training modules' },
            { step: 7, label: 'Re-Assessment', description: 'Follow-up scoring to measure improvement' },
            { step: 8, label: 'Closure', description: 'Coaching closed if improvement confirmed' },
          ].map((step, i, arr) => (
            <React.Fragment key={step.step}>
              <div className="flex flex-col items-center min-w-[120px]">
                <div className="w-10 h-10 rounded-full bg-[#EEF1FE] flex items-center justify-center text-sm font-bold text-[#3457D5] mb-2">
                  {step.step}
                </div>
                <div className="text-xs font-semibold text-[#1D2433] text-center">{step.label}</div>
                <div className="text-[10px] text-[#6B7385] text-center mt-0.5 max-w-[100px]">{step.description}</div>
              </div>
              {i < arr.length - 1 && (
                <ArrowRight size={16} className="text-[#E7E2D8] shrink-0" />
              )}
            </React.Fragment>
          ))}
        </div>
      </Card>

      {/* Training Assignment Detail */}
      {selectedItem && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <SectionTitle>Training Assignment — {selectedItem.agent_name}</SectionTitle>
            {selectedItem.score_at_flag != null && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[#E7E2D8]">
                <Activity size={14} style={{ color: getScoreColor(selectedItem.score_at_flag) }} />
                <span className="text-sm font-bold" style={{ color: getScoreColor(selectedItem.score_at_flag) }}>
                  Score at Flag: {selectedItem.score_at_flag}
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-xs font-semibold text-[#6B7385] mb-1">Recommendation</div>
              <p className="text-sm text-[#1D2433]">{selectedItem.recommendation}</p>
            </div>
            <div>
              <div className="text-xs font-semibold text-[#6B7385] mb-1">Evidence</div>
              <p className="text-sm text-[#1D2433]">{selectedItem.evidence || 'N/A'}</p>
              {selectedItem.reason && (
                <div className="mt-2">
                  <div className="text-xs font-semibold text-[#6B7385] mb-1">Flag Reason</div>
                  <p className="text-xs text-[#6B7385] italic">{selectedItem.reason}</p>
                </div>
              )}
            </div>
            <div>
              <div className="text-xs font-semibold text-[#6B7385] mb-1">Expected Improvement</div>
              <p className="text-sm font-semibold text-[#1C9A6C]">{selectedItem.estimated_improvement}</p>
              {selectedItem.status !== 'Completed' && selectedItem.status !== 'Escalated' && isAdmin && (
                <div className="mt-3">
                  <button onClick={() => advance(selectedItem)} className="text-xs font-semibold px-4 py-2 rounded-xl bg-[#3457D5] text-white hover:opacity-90 transition">
                    Assign Training
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
