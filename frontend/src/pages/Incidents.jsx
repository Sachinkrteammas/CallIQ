import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, SectionTitle, SeverityBadge, EmptyState, Pill, Toggle } from '../components/shared.jsx'
import { COACHING_WORKFLOW } from '../data/mock.js'
import { ShieldCheck, AlertTriangle, Mail, Plus, Trash2, X, Filter } from 'lucide-react'
import { useAuth } from '../components/AuthContext.jsx'
import {
  listIncidents, createIncident, updateIncident, deleteIncident,
  getFatalRules, createFatalRule, updateFatalRule, deleteFatalRule,
  getIncidentAgents,
} from '../api/client.js'

const SEVERITIES = ['Critical', 'Major', 'Minor']
const STATUSES = ['All', 'Open', 'Acknowledged', 'Resolved']
const INCIDENT_TYPES = ['Agent Abused Customer', 'Customer Threatened Agent', 'Fraud Mention', 'Data Leakage', 'PII Shared', 'Compliance Failure', 'Fake Promise', 'Mis-selling', 'Legal Risk', 'Policy Violation', 'Other']

export default function Incidents() {
  const { isAdmin } = useAuth()
  const [category, setCategory] = useState('Critical')
  const [statusFilter, setStatusFilter] = useState('All')
  const [incidents, setIncidents] = useState([])
  const [rules, setRules] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showAddRule, setShowAddRule] = useState(false)
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  const [newInc, setNewInc] = useState({
    incident_type: INCIDENT_TYPES[0],
    severity: 'Critical',
    call_id: '',
    agent_name: '',
    customer: '',
    project: '',
    queue: '',
    transcript_excerpt: '',
    assigned_to: '',
  })
  const [newRule, setNewRule] = useState({ name: '', enabled: true, severity: 'High', escalation_level: '1 Hour' })

  const load = useCallback(async () => {
    try {
      const [inc, rl, ag] = await Promise.all([
        listIncidents(category, statusFilter),
        getFatalRules(),
        getIncidentAgents(),
      ])
      setIncidents(inc || [])
      setRules(rl || [])
      setAgents(ag || [])
      setError('')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load incidents.')
    } finally {
      setLoading(false)
    }
  }, [category, statusFilter])

  useEffect(() => { load() }, [load])

  const assign = async (id) => {
    try {
      await updateIncident(id, { status: 'Acknowledged', assigned_to: 'Rohan Mehta' })
      load()
    } catch (e) { setError('Failed to assign.') }
  }
  const resolve = async (id) => {
    try {
      await updateIncident(id, { status: 'Resolved' })
      load()
    } catch (e) { setError('Failed to resolve.') }
  }
  const remove = async (id) => {
    try {
      await deleteIncident(id)
      load()
    } catch (e) { setError('Failed to delete.') }
  }
  const toggleRule = async (rule) => {
    try {
      await updateFatalRule(rule.id, { enabled: !rule.enabled })
      load()
    } catch (e) { setError('Failed to update rule.') }
  }
  const removeRule = async (id) => {
    try {
      await deleteFatalRule(id)
      load()
    } catch (e) { setError('Failed to delete rule.') }
  }

  const handleCreate = async () => {
    setSaving(true)
    try {
      await createIncident({
        ...newInc,
        agent_name: newInc.agent_name || newInc.assigned_to || '',
        transcript_excerpt: newInc.transcript_excerpt || null,
      })
      setShowAdd(false)
      setNewInc({ incident_type: INCIDENT_TYPES[0], severity: 'Critical', call_id: '', agent_name: '', customer: '', project: '', queue: '', transcript_excerpt: '', assigned_to: '' })
      load()
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to create incident.') }
    finally { setSaving(false) }
  }

  const handleCreateRule = async () => {
    if (!newRule.name.trim()) { setError('Rule name is required.'); return }
    setSaving(true)
    try {
      await createFatalRule(newRule)
      setShowAddRule(false)
      setNewRule({ name: '', enabled: true, severity: 'High', escalation_level: '1 Hour' })
      load()
    } catch (e) { setError(e?.response?.data?.detail || 'Failed to create rule.') }
    finally { setSaving(false) }
  }

  const filtered = incidents

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#1D2433]">Incident Center</h1>
        {isAdmin && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#3457D5] text-white hover:opacity-90 transition">
            <Plus size={14} /> Create Incident
          </button>
        )}
      </div>

      {error && <div className="text-xs font-semibold text-[#D14343] bg-[#FBE9E9] border border-[#F5C6C6] rounded-lg px-3 py-2">{error}</div>}

      {/* Create Incident Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#1D2433]">Create Incident</h3>
              <button onClick={() => setShowAdd(false)} className="text-[#6B7385] hover:text-[#1D2433]"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-xs text-[#6B7385]">Incident Type
                <select value={newInc.incident_type} onChange={(e) => setNewInc({ ...newInc, incident_type: e.target.value })} className="mt-1 w-full border border-[#E7E2D8] rounded-lg px-3 py-2 text-sm text-[#1D2433] bg-white">
                  {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="text-xs text-[#6B7385]">Severity
                <select value={newInc.severity} onChange={(e) => setNewInc({ ...newInc, severity: e.target.value })} className="mt-1 w-full border border-[#E7E2D8] rounded-lg px-3 py-2 text-sm text-[#1D2433] bg-white">
                  {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-xs text-[#6B7385]">Queue
                <input value={newInc.queue} onChange={(e) => setNewInc({ ...newInc, queue: e.target.value })} placeholder="e.g. Billing" className="mt-1 w-full border border-[#E7E2D8] rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-[#6B7385]">Call ID
                <input value={newInc.call_id} onChange={(e) => setNewInc({ ...newInc, call_id: e.target.value })} placeholder="CL-10001" className="mt-1 w-full border border-[#E7E2D8] rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-[#6B7385]">Assign To
                <select value={newInc.assigned_to} onChange={(e) => setNewInc({ ...newInc, assigned_to: e.target.value })} className="mt-1 w-full border border-[#E7E2D8] rounded-lg px-3 py-2 text-sm text-[#1D2433] bg-white">
                  <option value="">Unassigned</option>
                  {agents.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label className="col-span-2 text-xs text-[#6B7385]">Customer
                <input value={newInc.customer} onChange={(e) => setNewInc({ ...newInc, customer: e.target.value })} placeholder="Customer name" className="mt-1 w-full border border-[#E7E2D8] rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="col-span-2 text-xs text-[#6B7385]">Project
                <input value={newInc.project} onChange={(e) => setNewInc({ ...newInc, project: e.target.value })} placeholder="Project name" className="mt-1 w-full border border-[#E7E2D8] rounded-lg px-3 py-2 text-sm" />
              </label>
              <label className="col-span-2 text-xs text-[#6B7385]">Evidence / Transcript Excerpt
                <textarea value={newInc.transcript_excerpt} onChange={(e) => setNewInc({ ...newInc, transcript_excerpt: e.target.value })} rows={2} placeholder="Quote from conversation…" className="mt-1 w-full border border-[#E7E2D8] rounded-lg px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-[#E7E2D8] text-[#6B7385]">Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="text-xs font-semibold px-4 py-2 rounded-lg bg-[#3457D5] text-white disabled:opacity-60">{saving ? 'Creating…' : 'Create Incident'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Incident Management */}
      <Card>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-[#6B7385]"><Filter size={13} /> Severity</span>
            {SEVERITIES.map((c) => (
              <Pill key={c} active={category === c} onClick={() => setCategory(c)}>{c}</Pill>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-[#6B7385]">Status</span>
            {STATUSES.map((s) => (
              <Pill key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>{s}</Pill>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm text-[#6B7385]">Loading incidents…</div>
        ) : filtered.length === 0 ? (
          <EmptyState text={`No ${category.toLowerCase()} incidents found${statusFilter !== 'All' ? ` with status ${statusFilter}` : ''}.`} />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {filtered.map((inc) => (
              <div key={inc.id} className="border border-[#E7E2D8] rounded-xl p-4 hover:border-[#3457D5]/30 transition">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-[#3457D5] text-sm cursor-pointer hover:underline" onClick={() => inc.call_id && navigate(`/calls/${inc.call_id}`)}>#{inc.id}</span>
                  <div className="flex items-center gap-2">
                    <SeverityBadge level={inc.severity} />
                    {isAdmin && (
                      <button onClick={() => remove(inc.id)} className="text-[#D14343] hover:bg-[#FBE9E9] rounded p-1" title="Delete incident"><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>
                <div className="text-sm font-semibold text-[#1D2433] mb-1">{inc.incident_type}</div>
                <div className="text-xs text-[#6B7385] space-y-0.5">
                  <div>Call: {inc.call_id ? <button className="text-[#3457D5] font-semibold hover:underline" onClick={() => navigate(`/calls/${inc.call_id}`)}>{inc.call_id}</button> : <span className="text-[#B9B4A8]">—</span>} {inc.queue && <span>· {inc.queue}</span>}</div>
                  <div>Agent: {inc.agent_name || '—'} · Customer: {inc.customer || '—'}</div>
                  {inc.project && <div>Project: {inc.project}</div>}
                  <div>Created: {inc.created_at ? new Date(inc.created_at).toLocaleString() : '—'}</div>
                </div>

                {inc.transcript_excerpt && (
                  <div className="mt-2 p-2 rounded-lg bg-[#F7F4EE] border border-[#E7E2D8]">
                    <div className="text-[10px] font-semibold text-[#6B7385] mb-0.5">Evidence</div>
                    <p className="text-xs text-[#1D2433] italic">"{inc.transcript_excerpt}"</p>
                  </div>
                )}

                <div className="flex items-center justify-between mt-3">
                  <SeverityBadge level={inc.status} />
                  <div className="flex gap-2">
                    {inc.status !== 'Acknowledged' && inc.status !== 'Resolved' && (
                      <button onClick={() => assign(inc.id)} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-[#E7E2D8] hover:border-[#3457D5] transition">Assign</button>
                    )}
                    {inc.status !== 'Resolved' && (
                      <button onClick={() => resolve(inc.id)} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#1C9A6C] text-white hover:opacity-90 transition">Resolve</button>
                    )}
                  </div>
                </div>
                {inc.assigned_to && <div className="text-[11px] text-[#6B7385] mt-1.5">Assigned to {inc.assigned_to}</div>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* AI Workflow + Email + Fatal Rules */}
      <div className="grid grid-cols-3 gap-6">
        {/* AI Workflow Diagram */}
        <Card className="col-span-1">
          <SectionTitle icon={AlertTriangle}>AI Incident Workflow</SectionTitle>
          <div className="space-y-3">
            {COACHING_WORKFLOW.slice(0, 6).map((step, i) => (
              <div key={step.step} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-[#EEF1FE] flex items-center justify-center text-[10px] font-bold text-[#3457D5] shrink-0">
                  {step.step}
                </div>
                <div className="flex-1">
                  <div className="text-xs font-semibold text-[#1D2433]">{step.label}</div>
                  <div className="text-[10px] text-[#6B7385]">{step.description}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Email Notification Mockup */}
        <Card className="col-span-1">
          <SectionTitle icon={Mail}>Email Notification</SectionTitle>
          <div className="border border-[#E7E2D8] rounded-xl p-4 bg-[#F7F4EE]">
            <div className="text-xs text-[#6B7385] mb-1">Subject</div>
            <div className="text-sm font-semibold text-[#1D2433] mb-3">🚨 Critical Incident: Abusive Language — CL-60782</div>
            <div className="text-xs text-[#6B7385] mb-1">Recipients</div>
            <div className="text-xs text-[#1D2433] mb-3">rohan.mehta@acmebpo.com, priya.sharma@acmebpo.com</div>
            <div className="border border-[#E7E2D8] rounded-lg p-3 text-xs space-y-1 bg-white">
              <div><b>Agent:</b> Amit Verma</div>
              <div><b>Call ID:</b> CL-60782</div>
              <div><b>Severity:</b> <span className="text-[#D14343] font-semibold">Critical</span></div>
              <div><b>AI Detection:</b> Abusive language + customer escalation</div>
              <div><b>Confidence:</b> 96%</div>
              <div><b>Evidence:</b> "Sir, I am trying to help you. Please don't shout at me."</div>
            </div>
          </div>
        </Card>

        {/* Fatal Behaviour Rules */}
        <Card className="col-span-1">
          <SectionTitle
            icon={ShieldCheck}
            action={isAdmin ? (
              <button onClick={() => setShowAddRule(true)} className="flex items-center gap-1 text-[10px] font-semibold text-[#3457D5] hover:underline"><Plus size={12} /> Add Rule</button>
            ) : (
              <span className="text-[10px] text-[#6B7385]">Admin configuration</span>
            )}
          >
            Fatal Rules
          </SectionTitle>
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between border border-[#E7E2D8] rounded-xl px-3 py-2.5">
                <div>
                  <div className="text-xs font-semibold text-[#1D2433]">{r.name}</div>
                  <div className="text-[10px] text-[#6B7385] mt-0.5">Severity: {r.severity} · Escalation: {r.escalation_level}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Toggle checked={r.enabled} onChange={() => toggleRule(r)} />
                  {isAdmin && (
                    <button onClick={() => removeRule(r.id)} className="text-[#D14343] hover:bg-[#FBE9E9] rounded p-1" title="Delete rule"><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Add Fatal Rule Modal */}
      {showAddRule && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#1D2433]">Add Fatal Rule</h3>
              <button onClick={() => setShowAddRule(false)} className="text-[#6B7385] hover:text-[#1D2433]"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <label className="block text-xs text-[#6B7385]">Rule Name
                <input value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} placeholder="e.g. Abusive Language" className="mt-1 w-full border border-[#E7E2D8] rounded-lg px-3 py-2 text-sm" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs text-[#6B7385]">Severity
                  <select value={newRule.severity} onChange={(e) => setNewRule({ ...newRule, severity: e.target.value })} className="mt-1 w-full border border-[#E7E2D8] rounded-lg px-3 py-2 text-sm bg-white">
                    {['Critical', 'High', 'Medium', 'Low'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <label className="text-xs text-[#6B7385]">Escalation
                  <select value={newRule.escalation_level} onChange={(e) => setNewRule({ ...newRule, escalation_level: e.target.value })} className="mt-1 w-full border border-[#E7E2D8] rounded-lg px-3 py-2 text-sm bg-white">
                    {['Immediate', '1 Hour', 'Daily Digest'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-[#6B7385]">
                <input type="checkbox" checked={newRule.enabled} onChange={(e) => setNewRule({ ...newRule, enabled: e.target.checked })} className="accent-[#1C9A6C]" />
                Enabled
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAddRule(false)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-[#E7E2D8] text-[#6B7385]">Cancel</button>
              <button onClick={handleCreateRule} disabled={saving} className="text-xs font-semibold px-4 py-2 rounded-lg bg-[#3457D5] text-white disabled:opacity-60">{saving ? 'Saving…' : 'Add Rule'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
