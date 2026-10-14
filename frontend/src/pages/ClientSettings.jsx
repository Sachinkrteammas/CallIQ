import React, { useEffect, useState } from 'react'
import { Card } from '../components/shared.jsx'
import { useClientFilter } from '../components/ClientContext.jsx'
import { getClientSettings, saveClientSettings } from '../api/client.js'
import { Download, Users, Building2, FileText } from 'lucide-react'

function getDefaultForm(clientId) {
  return {
    client_id: clientId,
    total: 0,
    min_call_duration: 20,
    max_call_duration: 3600,
    agents: [],
    campaign_filter: [],
    ingroup_filter: [],

    audit_mode: 'monthly',
    monthly_target: 30,
    daily_target: 1,
    audit_calls_per_agent: 0,

    short_call_count: 5,
    medium_call_count: 15,
    long_call_count: 10,
    short_call_max: 120,
    medium_call_max: 600,

    client_mrr: 0,
    client_criticality: 'Medium',
    client_call_volume: 0,
    agent_allocation: 0,
    criticality_revenue_impact: 3,
    criticality_customer_sensitivity: 3,
    criticality_escalation_risk: 3,
    criticality_sla_requirement: 3,
    criticality_process_complexity: 3,
  }
}

function getAgentItems(agentDetails, selected) {
  const items = []
  const known = new Set()
  for (const a of agentDetails) {
    items.push(a)
    known.add(a.username)
  }
  for (const uname of selected) {
    if (!known.has(uname)) items.push({ username: uname, displayname: uname })
  }
  return items
}

function computeCriticality(form) {
  const scores = [
    form.criticality_revenue_impact || 3,
    form.criticality_customer_sensitivity || 3,
    form.criticality_escalation_risk || 3,
    form.criticality_sla_requirement || 3,
    form.criticality_process_complexity || 3,
  ]
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length
  if (avg >= 4.2) return 'High'
  if (avg >= 2.8) return 'Medium'
  return 'Low'
}

const TEAM_BADGES = {
  Sales: { accent: '#C9862B', soft: '#FBF3E7' },
  Service: { accent: '#3457D5', soft: '#EEF1FE' },
}


export default function ClientSettings() {
  const { clientType, clients, clientId, setClientId, loading, fromDate, toDate, setFromDate, setToDate } = useClientFilter()
  const isSales = clientType === 'Sales'
  const badge = TEAM_BADGES[clientType] || TEAM_BADGES.Sales

  const [form, setForm] = useState(getDefaultForm(0))
  const [agentDetails, setAgentDetails] = useState([])
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    if (!clients.length) return
    if (!clientId || !clients.some((c) => c.id === clientId)) {
      setClientId(clients[0].id)
    }
  }, [clients, clientId, clientType])

  useEffect(() => {
    if (!clientId) return
    let cancelled = false
    setSettingsLoading(true)
    setNotice(null)

    getClientSettings(clientId)
      .then((data) => {
        if (cancelled) return
        if (!data) {
          setForm(getDefaultForm(clientId))
          setAgentDetails([])
          return
        }
        setAgentDetails(data.agent_details || [])
        setForm({
          client_id: clientId,
          audit_calls_per_agent: data.audit_calls_per_agent ?? 0,
          total: data.total ?? 0,
          min_call_duration: data.min_call_duration ?? 20,
          max_call_duration: data.max_call_duration ?? 3600,
          agents: data.agents ?? [],
          campaign_filter: data.campaign_filter ?? [],
          ingroup_filter: data.ingroup_filter ?? [],

          audit_mode: data.audit_mode ?? 'monthly',
          monthly_target: data.monthly_target ?? 30,
          daily_target: data.daily_target ?? 1,

          short_call_count: data.short_call_count ?? 5,
          medium_call_count: data.medium_call_count ?? 15,
          long_call_count: data.long_call_count ?? 10,
          short_call_max: data.short_call_max ?? 120,
          medium_call_max: data.medium_call_max ?? 600,

          client_mrr: data.client_mrr ?? 0,
          client_criticality: data.client_criticality ?? 'Medium',
          client_call_volume: data.client_call_volume ?? 0,
          agent_allocation: data.agent_allocation ?? 0,
          criticality_revenue_impact: data.criticality_revenue_impact ?? 3,
          criticality_customer_sensitivity: data.criticality_customer_sensitivity ?? 3,
          criticality_escalation_risk: data.criticality_escalation_risk ?? 3,
          criticality_sla_requirement: data.criticality_sla_requirement ?? 3,
          criticality_process_complexity: data.criticality_process_complexity ?? 3,
        })
      })
      .catch((err) => {
        if (!cancelled) {
          setNotice({ type: 'error', text: err?.response?.data?.detail || 'Failed to load settings' })
        }
      })
      .finally(() => { if (!cancelled) setSettingsLoading(false) })
    return () => { cancelled = true }
  }, [clientId])

  useEffect(() => {
    const shortN = Number(form.short_call_count) || 0
    const medN = Number(form.medium_call_count) || 0
    const longN = Number(form.long_call_count) || 0
    const durationTotal = shortN + medN + longN
    const modeTotal = form.audit_mode === 'monthly'
      ? Number(form.monthly_target) || 0
      : Number(form.daily_target) || 0
    const finalTotal = durationTotal > 0 ? durationTotal : modeTotal
    if (form.total !== finalTotal) {
      setForm((prev) => ({ ...prev, total: finalTotal }))
    }
  }, [
    form.audit_mode, form.monthly_target, form.daily_target,
    form.short_call_count, form.medium_call_count, form.long_call_count,
  ])

  useEffect(() => {
    if (!agentDetails.length) return
    if (form.agents.length > 0) return
    const all = agentDetails.map((a) => a.username)
    setForm((prev) => ({ ...prev, agents: all }))
  }, [agentDetails])

  const handleSave = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const computedCrit = computeCriticality(form)
      await saveClientSettings({
        ...form,
        client_criticality: computedCrit,
        ingroup_filter: isSales ? [] : form.ingroup_filter,
      })
      setNotice({ type: 'success', text: `Settings saved (Criticality: ${computedCrit})` })
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.detail || 'Failed to save settings' })
    }
    setSaving(false)
  }

  // ═══════════════════════════════════════════════════════════
  // DOWNLOAD HANDLERS
  // ═══════════════════════════════════════════════════════════
  const buildDateParams = () => {
    const p = new URLSearchParams()
    if (fromDate) p.set('from_date', fromDate)
    if (toDate) p.set('to_date', toDate)
    return p
  }

  const handleDownloadClientWise = () => {
    const p = buildDateParams()
    window.open(`/api/reports/client-wise/export?${p.toString()}`, '_blank')
  }

  const handleDownloadAgentWise = () => {
    const p = buildDateParams()
    if (clientId) p.set('client_id', clientId)
    window.open(`/api/reports/agent-wise/export?${p.toString()}`, '_blank')
  }

  const handleDownloadDetailedAudits = () => {
    const p = buildDateParams()
    if (clientId) p.set('client_id', clientId)
    window.open(`/api/reports/audits/export?${p.toString()}`, '_blank')
  }

  const selectedClient = clients.find((c) => c.id === clientId)
  const computedCriticality = computeCriticality(form)

  const shortN = Number(form.short_call_count) || 0
  const medN = Number(form.medium_call_count) || 0
  const longN = Number(form.long_call_count) || 0
  const durationTotal = shortN + medN + longN

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3457D5]" />
      </div>
    )
  }

  const renderScale = (label, key) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-[#6B7385] uppercase">{label}</label>
      <select
        disabled={settingsLoading}
        className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: Number(e.target.value) }))}
      >
        {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  )

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ═══════════════════════════════════════════════
          DOWNLOAD REPORTS SECTION (NEW)
         ═══════════════════════════════════════════════ */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[15px] font-semibold text-[#1D2433] flex items-center gap-2">
              <Download size={16} className="text-[#3457D5]" /> Download Reports
            </h2>
            <p className="text-[11px] text-[#6B7385] mt-0.5">
              Export as CSV for the selected date range
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
              className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5" />
            <span className="text-xs text-[#6B7385]">to</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
              className="text-xs border border-[#E7E2D8] rounded-lg px-2 py-1.5" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* Client-wise */}
          <button onClick={handleDownloadClientWise}
            className="text-left p-4 rounded-xl border border-[#E7E2D8] hover:border-[#3457D5]/40 hover:shadow-md transition-all group">
            <div className="w-9 h-9 rounded-lg bg-[#EEF1FE] flex items-center justify-center mb-2">
              <Building2 size={16} className="text-[#3457D5]" />
            </div>
            <div className="text-sm font-bold text-[#1D2433]">Client-wise Report</div>
            <div className="text-[10px] text-[#6B7385] mt-1">
              Sabhi clients ka summary — total audits, score, genuine, invalid
            </div>
            <div className="flex items-center gap-1 mt-2 text-[10px] font-semibold text-[#3457D5] opacity-0 group-hover:opacity-100 transition">
              <Download size={10} /> Download CSV
            </div>
          </button>

          {/* Agent-wise (is client ke) */}
          <button onClick={handleDownloadAgentWise}
            className="text-left p-4 rounded-xl border border-[#E7E2D8] hover:border-[#3457D5]/40 hover:shadow-md transition-all group">
            <div className="w-9 h-9 rounded-lg bg-[#E7F7EF] flex items-center justify-center mb-2">
              <Users size={16} className="text-[#1C9A6C]" />
            </div>
            <div className="text-sm font-bold text-[#1D2433]">Agent-wise Report</div>
            <div className="text-[10px] text-[#6B7385] mt-1">
              Selected client ke saare agents ka breakdown
            </div>
            <div className="flex items-center gap-1 mt-2 text-[10px] font-semibold text-[#1C9A6C] opacity-0 group-hover:opacity-100 transition">
              <Download size={10} /> Download CSV
            </div>
          </button>

          {/* Detailed Audits */}
          <button onClick={handleDownloadDetailedAudits}
            className="text-left p-4 rounded-xl border border-[#E7E2D8] hover:border-[#3457D5]/40 hover:shadow-md transition-all group">
            <div className="w-9 h-9 rounded-lg bg-[#FCF1DF] flex items-center justify-center mb-2">
              <FileText size={16} className="text-[#C9862B]" />
            </div>
            <div className="text-sm font-bold text-[#1D2433]">Detailed Audit Records</div>
            <div className="text-[10px] text-[#6B7385] mt-1">
              Har call ka poora record — sale category, reason, score
            </div>
            <div className="flex items-center gap-1 mt-2 text-[10px] font-semibold text-[#C9862B] opacity-0 group-hover:opacity-100 transition">
              <Download size={10} /> Download CSV
            </div>
          </button>
        </div>
      </Card>

      {/* ═══════════════════════════════════════════════
          CLIENT SETTINGS
         ═══════════════════════════════════════════════ */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: badge.soft, color: badge.accent }}>
              {clientType}
            </span>
            <h2 className="text-[15px] font-semibold text-[#1D2433]">Client Settings</h2>
          </div>
        </div>

        <div className="mb-5">
          <label className="text-[10px] font-semibold text-[#6B7385] uppercase block mb-1">
            {clientType} Client
          </label>
          <select
            value={clientId ?? ''}
            onChange={(e) => setClientId(Number(e.target.value))}
            className="w-full text-sm border border-[#E7E2D8] rounded-xl px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
          >
            {!clients.length && <option value="">No {clientType} clients</option>}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>

        {clients.length === 0 ? (
          <div className="border border-dashed border-[#E7E2D8] rounded-xl py-8 text-center text-xs text-[#6B7385]">
            No {clientType} clients available.
          </div>
        ) : (
          <>
            {notice && (
              <div className={`mb-4 text-xs font-semibold px-3 py-2 rounded-xl ${
                notice.type === 'success' ? 'bg-[#E7F7EF] text-[#1C9A6C]' : 'bg-[#FBE9E9] text-[#D14343]'
              }`}>
                {notice.text}
              </div>
            )}

            {/* SECTION 1: Audit Frequency */}
            <div className="mb-6 p-4 rounded-xl bg-[#F7F4EE] border border-[#E7E2D8]">
              <h3 className="text-xs font-bold text-[#1D2433] uppercase mb-3">1. Audit Frequency</h3>
              <div className="flex gap-2 mb-4">
                {['monthly', 'daily'].map((mode) => (
                  <button key={mode}
                    onClick={() => setForm((p) => ({ ...p, audit_mode: mode }))}
                    className={`flex-1 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
                      form.audit_mode === mode
                        ? 'bg-[#3457D5] text-white border-[#3457D5] shadow-md'
                        : 'bg-white text-[#6B7385] border-[#E7E2D8] hover:border-[#3457D5]/40'
                    }`}>
                    {mode === 'monthly' ? '📅 Monthly Target' : '📆 Daily Target'}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {form.audit_mode === 'monthly' ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Monthly Audit Target</label>
                    <input type="number" disabled={settingsLoading}
                      className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm"
                      value={form.monthly_target}
                      onChange={(e) => setForm((p) => ({ ...p, monthly_target: Number(e.target.value) || 0 }))} />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Daily Audit Target</label>
                    <input type="number" disabled={settingsLoading}
                      className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm"
                      value={form.daily_target}
                      onChange={(e) => setForm((p) => ({ ...p, daily_target: Number(e.target.value) || 0 }))} />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Total Calls (auto)</label>
                  <input readOnly value={form.total}
                    className="rounded-xl border border-[#E7E2D8] bg-[#F0EDE4] px-3 py-2 text-sm font-bold text-[#3457D5]" />
                </div>
              </div>
            </div>

            {/* SECTION 2: Duration Distribution */}
            <div className="mb-6 p-4 rounded-xl bg-[#EEF1FE] border border-[#3457D5]/20">
              <h3 className="text-xs font-bold text-[#1D2433] uppercase mb-1">2. Call Duration Distribution</h3>
              <p className="text-[10px] text-[#6B7385] mb-3">Distribute target across Short / Medium / Long calls</p>
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#1C9A6C] uppercase">Short (≤{form.short_call_max}s)</label>
                  <input type="number" disabled={settingsLoading}
                    className="rounded-xl border border-[#1C9A6C]/30 bg-white px-3 py-2 text-sm"
                    value={form.short_call_count}
                    onChange={(e) => setForm((p) => ({ ...p, short_call_count: Number(e.target.value) || 0 }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#C9862B] uppercase">Medium ({form.short_call_max}-{form.medium_call_max}s)</label>
                  <input type="number" disabled={settingsLoading}
                    className="rounded-xl border border-[#C9862B]/30 bg-white px-3 py-2 text-sm"
                    value={form.medium_call_count}
                    onChange={(e) => setForm((p) => ({ ...p, medium_call_count: Number(e.target.value) || 0 }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#3457D5] uppercase">Long (&gt;{form.medium_call_max}s)</label>
                  <input type="number" disabled={settingsLoading}
                    className="rounded-xl border border-[#3457D5]/30 bg-white px-3 py-2 text-sm"
                    value={form.long_call_count}
                    onChange={(e) => setForm((p) => ({ ...p, long_call_count: Number(e.target.value) || 0 }))} />
                </div>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-white/60">
                <span className="text-[11px] font-semibold text-[#1D2433]">
                  Duration Total: <span className="text-[#3457D5]">{durationTotal}</span> calls
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Short Max (sec)</label>
                  <input type="number" disabled={settingsLoading}
                    className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm"
                    value={form.short_call_max}
                    onChange={(e) => setForm((p) => ({ ...p, short_call_max: Number(e.target.value) || 120 }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Medium Max (sec)</label>
                  <input type="number" disabled={settingsLoading}
                    className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm"
                    value={form.medium_call_max}
                    onChange={(e) => setForm((p) => ({ ...p, medium_call_max: Number(e.target.value) || 600 }))} />
                </div>
              </div>
            </div>

            {/* SECTION 3: Agent Allocation */}
            <div className="mb-6 p-4 rounded-xl bg-[#E7F7EF] border border-[#1C9A6C]/20">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-[#1D2433] uppercase">3. Agent Allocation</h3>
                <div className="flex gap-2">
                  <button onClick={() => setForm((p) => ({ ...p, agents: agentDetails.map((a) => a.username) }))}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-white border border-[#E7E2D8]">
                    Select All
                  </button>
                  <button onClick={() => setForm((p) => ({ ...p, agents: [] }))}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-lg bg-white border border-[#E7E2D8]">
                    Clear All
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-[#6B7385] mb-3">
                Selected: <span className="font-bold text-[#1C9A6C]">{form.agents.length}</span> / {agentDetails.length}
              </p>
              <div className="max-h-48 overflow-y-auto border border-[#E7E2D8] rounded-xl bg-white p-2">
                {getAgentItems(agentDetails, form.agents).map((agent) => {
                  const checked = form.agents.includes(agent.username)
                  return (
                    <label key={agent.username}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[#F7F4EE] ${checked ? 'bg-[#EEF1FE]' : ''}`}>
                      <input type="checkbox" checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) setForm((p) => ({ ...p, agents: [...p.agents, agent.username] }))
                          else setForm((p) => ({ ...p, agents: p.agents.filter((u) => u !== agent.username) }))
                        }}
                        className="accent-[#3457D5]" />
                      <span className="text-xs text-[#1D2433]">{agent.displayname}</span>
                      <span className="text-[10px] text-[#6B7385] ml-auto">{agent.username}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* SECTION 4: Criticality */}
            <div className="mb-6 p-4 rounded-xl bg-white border border-[#E7E2D8]">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-[#1D2433] uppercase">4. Client Criticality</h3>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                  computedCriticality === 'High' ? 'bg-[#FBE9E9] text-[#D14343]'
                  : computedCriticality === 'Medium' ? 'bg-[#FCF1DF] text-[#C9862B]'
                  : 'bg-[#E7F7EF] text-[#1C9A6C]'
                }`}>Auto: {computedCriticality}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-5">
                {renderScale('Revenue Impact', 'criticality_revenue_impact')}
                {renderScale('Customer Sensitivity', 'criticality_customer_sensitivity')}
                {renderScale('Escalation Risk', 'criticality_escalation_risk')}
                {renderScale('SLA Requirement', 'criticality_sla_requirement')}
                {renderScale('Process Complexity', 'criticality_process_complexity')}
              </div>
            </div>

            {/* SECTION 5: Additional */}
            <div className="mb-6 p-4 rounded-xl bg-white border border-[#E7E2D8]">
              <h3 className="text-xs font-bold text-[#1D2433] uppercase mb-3">5. Additional Settings</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Client MRR</label>
                  <input type="number" disabled={settingsLoading}
                    className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm"
                    value={form.client_mrr}
                    onChange={(e) => setForm((p) => ({ ...p, client_mrr: Number(e.target.value) || 0 }))} />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Call Volume</label>
                  <input type="number" disabled={settingsLoading}
                    className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm"
                    value={form.client_call_volume}
                    onChange={(e) => setForm((p) => ({ ...p, client_call_volume: Number(e.target.value) || 0 }))} />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Campaign Filter</label>
                  <input disabled={settingsLoading}
                    className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm"
                    value={form.campaign_filter.length ? form.campaign_filter.join(',') : ''}
                    onChange={(e) => setForm((p) => ({ ...p, campaign_filter: e.target.value.split(',').filter(Boolean) }))} />
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-5">
              <button onClick={handleSave} disabled={saving || settingsLoading || !selectedClient}
                className="rounded-xl bg-[#3457D5] px-6 py-2.5 text-sm font-semibold text-white shadow-md hover:bg-[#2a45b0] disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}