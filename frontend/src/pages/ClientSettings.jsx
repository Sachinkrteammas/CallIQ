import React, { useEffect, useState } from 'react'
import { Card } from '../components/shared.jsx'
import { useClientFilter } from '../components/ClientContext.jsx'
import { getClientSettings, saveClientSettings } from '../api/client.js'

function getDefaultForm(clientId) {
  return {
    client_id: clientId,
    total: 0,
    min_call_duration: 20,
    max_call_duration: 3600,
    agents: [],
    campaign_filter: [],
    ingroup_filter: [],
    audit_calls_per_agent: 0,
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

const TEAM_BADGES = {
  Sales: { accent: '#C9862B', soft: '#FBF3E7' },
  Service: { accent: '#3457D5', soft: '#EEF1FE' },
}

export default function ClientSettings() {
  const { clientType, clients, clientId, setClientId, loading } = useClientFilter()

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
    const total = form.agents.length * (form.audit_calls_per_agent || 0)
    if (form.total !== total) {
      setForm((prev) => ({ ...prev, total }))
    }
  }, [form.agents, form.audit_calls_per_agent])

  const handleSave = async () => {
    setSaving(true)
    setNotice(null)
    try {
      await saveClientSettings({
        ...form,
        ingroup_filter: isSales ? [] : form.ingroup_filter,
      })
      setNotice({ type: 'success', text: 'Settings updated' })
    } catch (err) {
      setNotice({ type: 'error', text: err?.response?.data?.detail || 'Failed to save settings' })
    }
    setSaving(false)
  }

  const selectedClient = clients.find((c) => c.id === clientId)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#3457D5]" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: badge.soft, color: badge.accent }}>
              {clientType}
            </span>
            <h2 className="text-[15px] font-semibold text-[#1D2433]">Client Settings</h2>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-[10px] font-semibold text-[#6B7385] uppercase block mb-1">
            {clientType} Client
          </label>
          <select
            value={clientId ?? ''}
            onChange={(e) => setClientId(Number(e.target.value))}
            className="w-full text-xs border border-[#E7E2D8] rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
          >
            {!clients.length && <option value="">No {clientType} clients available</option>}
            {clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>

        {clients.length === 0 ? (
          <div className="border border-dashed border-[#E7E2D8] rounded-xl py-8 text-center text-xs text-[#6B7385]">
            No {clientType} clients. Switch to {clientType === 'Sales' ? 'Service' : 'Sales'} from the top bar to manage that team.
          </div>
        ) : (
          <>
            {notice && (
              <div className={`mb-4 text-xs font-semibold px-3 py-2 rounded-xl ${notice.type === 'success' ? 'bg-[#E7F7EF] text-[#1C9A6C]' : 'bg-[#FBE9E9] text-[#D14343]'}`}>
                {notice.text}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Min Call Duration (sec)</label>
                <input
                  type="number"
                  disabled={settingsLoading}
                  className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
                  value={form.min_call_duration || ''}
                  placeholder="e.g. 20"
                  onChange={(e) => setForm((p) => ({ ...p, min_call_duration: Number(e.target.value) }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Max Call Duration (sec)</label>
                <input
                  type="number"
                  disabled={settingsLoading}
                  className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
                  value={form.max_call_duration || ''}
                  placeholder="e.g. 3600"
                  onChange={(e) => setForm((p) => ({ ...p, max_call_duration: Number(e.target.value) }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Audit Calls Per Agent</label>
                <input
                  type="number"
                  disabled={settingsLoading}
                  className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
                  value={form.audit_calls_per_agent || ''}
                  placeholder="e.g. 10"
                  onChange={(e) => setForm((p) => ({ ...p, audit_calls_per_agent: Number(e.target.value) || 0 }))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Total Calls</label>
                <input readOnly value={form.total} className="rounded-xl border border-[#E7E2D8] bg-[#F7F4EE] px-3 py-2 text-sm" />
              </div>

              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">
                  Agent Out Of ({agentDetails.length})
                </label>
                <select
                  multiple
                  disabled={settingsLoading}
                  className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm h-32 focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
                  value={form.agents}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map((opt) => opt.value)
                    setForm((prev) => ({ ...prev, agents: selected }))
                  }}
                >
                  {getAgentItems(agentDetails, form.agents).map((agent) => (
                    <option key={agent.username} value={agent.username}>{agent.displayname}</option>
                  ))}
                </select>
                <div className="text-xs text-[#6B7385] mt-1">
                  Selected: {form.agents.length ? form.agents.join(', ') : 'None'}
                </div>
              </div>

              <div className="flex flex-col gap-1 md:col-span-2">
                <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Campaign Filter</label>
                <input
                  disabled={settingsLoading}
                  className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
                  value={form.campaign_filter.length ? form.campaign_filter.join(',') : ''}
                  placeholder="Campaign filter (comma separated)"
                  onChange={(e) => setForm((p) => ({ ...p, campaign_filter: e.target.value.split(',').filter(Boolean) }))}
                />
              </div>

              {!isSales && (
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Ingroup Filter</label>
                  <input
                    disabled={settingsLoading}
                    className="rounded-xl border border-[#E7E2D8] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
                    value={form.ingroup_filter.length ? form.ingroup_filter.join(',') : ''}
                    placeholder="Ingroup filter (comma separated)"
                    onChange={(e) => setForm((p) => ({ ...p, ingroup_filter: e.target.value.split(',').filter(Boolean) }))}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end mt-5">
              <button
                onClick={handleSave}
                disabled={saving || settingsLoading || !selectedClient}
                className="rounded-xl bg-[#3457D5] px-6 py-2 text-sm font-semibold text-white shadow-md hover:bg-[#2a45b0] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}