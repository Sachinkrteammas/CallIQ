import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, SectionTitle } from '../components/shared.jsx'
import { Settings, AlertTriangle, Sliders, FileText, Plus, Trash2, Check, X, Wand2 } from 'lucide-react'
import { useClientFilter } from '../components/ClientContext.jsx'
import {
  listAiPrompts, getAiPrompt, createAiPrompt, updateAiPrompt,
  activateAiPrompt, deleteAiPrompt
} from '../api/client.js'

const QUALITY_PARAMS = [
  { key: 'opening', label: 'Opening' },
  { key: 'customer_understanding', label: 'Customer Understanding' },
  { key: 'resolution_quality', label: 'Resolution Quality' },
  { key: 'communication', label: 'Communication' },
  { key: 'call_control', label: 'Call Control' },
  { key: 'process_adherence', label: 'Process Adherence' },
  { key: 'closing', label: 'Closing' },
]

const slugify = (value, fallback = 'param') =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback


export default function AIConfig() {
  const navigate = useNavigate()
  const { clientId, clients, setClientId, clientType } = useClientFilter()
  const [prompts, setPrompts] = useState([])
  const [selectedPrompt, setSelectedPrompt] = useState(null)
  const [promptDetail, setPromptDetail] = useState(null)
  const [loadingPrompts, setLoadingPrompts] = useState(false)
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const detailReq = useRef(0)

  const [form, setForm] = useState({
    scoring_mode: 'default',         // 'default' | 'custom'
    prompt_text: '',
    weights: {},                     // { opening: 20, communication: 20, ... }
    thresholds: {},                  // { opening: { green: 80, amber: 60 }, ... }
  })

  const applyDetail = (detail) => {
    setPromptDetail(detail)
    const rawParams = detail?.prompt_json?.parameters
    let weights = detail?.prompt_json?.weights || {}
    if ((!weights || Object.keys(weights).length === 0) && Array.isArray(rawParams)) {
      weights = Object.fromEntries(
        rawParams.map((p, i) => [
          slugify(p.name || p.id || `param_${i + 1}`),
          Number(p.weight) || 0,
        ])
      )
    }
    setForm({
      scoring_mode: detail?.prompt_json?.scoring_mode || 'default',
      prompt_text: detail?.prompt_text || '',
      weights,
      thresholds: detail?.prompt_json?.thresholds || {},
    })
  }

  // Mirror the saved Prompt Builder contract; fall back to the legacy 7 names.
  const configuredParams = (() => {
    const raw = promptDetail?.prompt_json?.parameters
    if (Array.isArray(raw) && raw.length) {
      return raw.map((p, i) => ({
        key: slugify(p.name || p.id || `param_${i + 1}`),
        label: p.name || p.id || `Parameter ${i + 1}`,
        weight: Number(p.weight) || 0,
      }))
    }
    return QUALITY_PARAMS.map((p) => ({ ...p, weight: 0 }))
  })()

  const loadPromptDetail = async (id) => {
    const req = ++detailReq.current
    try {
      const detail = await getAiPrompt(id)
      if (req === detailReq.current) applyDetail(detail)
    } catch (e) {
      if (req === detailReq.current) {
        setNotice({ type: 'error', text: e?.response?.data?.detail || 'Failed to load prompt version' })
      }
    }
  }

  useEffect(() => {
    // AI config is per-client; 'all' is not a valid prompt filter.
    if (!clientId || clientId === 'all') {
      detailReq.current += 1
      setPrompts([])
      setSelectedPrompt(null)
      setPromptDetail(null)
      setLoadingPrompts(false)
      return
    }
    let cancelled = false
    detailReq.current += 1
    setLoadingPrompts(true)
    setPrompts([])
    setSelectedPrompt(null)
    setPromptDetail(null)
    setNotice(null)
    listAiPrompts(clientId)
      .then((res) => {
        if (cancelled) return
        const list = res || []
        setPrompts(list)
        const active = list.find((p) => p.status === 'Active') || list[0]
        if (active) {
          setSelectedPrompt(active.id)
          return getAiPrompt(active.id).then((detail) => {
            if (!cancelled) applyDetail(detail)
          })
        }
        return null
      })
      .catch((e) => {
        if (!cancelled) {
          setPrompts([])
          setNotice({ type: 'error', text: e?.response?.data?.detail || 'Failed to load prompt versions' })
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPrompts(false)
      })
    return () => { cancelled = true }
  }, [clientId])

  const handleSelectPrompt = (e) => {
    const id = Number(e.target.value)
    if (!id) return
    setSelectedPrompt(id)
    setNotice(null)
    loadPromptDetail(id)
  }

  const handleCreatePrompt = async () => {
    if (!clientId || clientId === 'all') return
    setCreating(true); setNotice(null)
    try {
      const created = await createAiPrompt({
        client_id: clientId,
        config: {
          name: 'Default QA Audit Prompt',
          description: 'Default prompt created from AI Configuration.',
          version: 'v1.0',
          status: 'Draft',
          scoring_mode: 'default',
          weights: {},
          thresholds: {},
        },
        prompt_text: '',
      })
      const list = await listAiPrompts(clientId)
      setPrompts(list || [])
      setSelectedPrompt(created.id)
      applyDetail(created)
      setNotice({ type: 'success', text: 'Default prompt version created' })
    } catch (e) {
      setNotice({ type: 'error', text: e?.response?.data?.detail || 'Could not create prompt' })
    }
    setCreating(false)
  }

  const handleSave = async () => {
    if (!selectedPrompt || !promptDetail) return
    setSaving(true); setNotice(null)
    try {
      const updated = await updateAiPrompt(selectedPrompt, {
        config: {
          // Preserve name/version/description so saving does not rename the prompt.
          ...(promptDetail.prompt_json || {}),
          name: promptDetail.name || 'Untitled Prompt',
          description: promptDetail.description || '',
          version: promptDetail.version || 'v1.0',
          scoring_mode: form.scoring_mode,
          weights: form.weights,
          thresholds: form.thresholds,
        },
        prompt_text: form.prompt_text,
      })
      applyDetail(updated)
      setPrompts((prev) => prev.map((p) => (
        p.id === updated.id
          ? { ...p, name: updated.name, version: updated.version, status: updated.status, updated_at: updated.updated_at }
          : p
      )))
      setNotice({ type: 'success', text: 'Configuration saved' })
    } catch (e) {
      setNotice({ type: 'error', text: e?.response?.data?.detail || 'Save failed' })
    }
    setSaving(false)
  }

  const handleActivate = async () => {
    if (!selectedPrompt) return
    try {
      const updated = await activateAiPrompt(selectedPrompt)
      applyDetail(updated)
      const list = await listAiPrompts(clientId)
      setPrompts(list || [])
      setNotice({ type: 'success', text: 'Prompt activated' })
    } catch (e) {
      setNotice({ type: 'error', text: e?.response?.data?.detail || 'Activation failed' })
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1D2433]">AI Configuration</h1>
          <p className="text-xs text-[#6B7385] mt-0.5">
            {clientType} · Scoring, weights, thresholds, prompt
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/prompt-builder')}
            className="text-xs font-semibold px-4 py-2 rounded-lg border border-[#3457D5] text-[#3457D5] hover:bg-[#EEF1FE]">
            <Wand2 size={12} className="inline mr-1" /> Prompt Builder
          </button>
          <button onClick={handleActivate} disabled={saving || creating || !selectedPrompt || !promptDetail}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-[#1C9A6C] text-white hover:opacity-90 disabled:opacity-50">
            <Check size={12} className="inline mr-1" /> Activate
          </button>
          <button onClick={handleSave} disabled={saving || creating || !selectedPrompt || !promptDetail}
            className="text-xs font-semibold px-4 py-2 rounded-lg bg-[#3457D5] text-white hover:opacity-90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Config'}
          </button>
        </div>
      </div>

      {notice && (
        <div className={`text-xs font-semibold px-3 py-2 rounded-lg ${
          notice.type === 'success' ? 'bg-[#E7F7EF] text-[#1C9A6C]' : 'bg-[#FBE9E9] text-[#D14343]'
        }`}>{notice.text}</div>
      )}

      {/* Client + Prompt Selector */}
      <Card>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Client</label>
            <select value={clientId ?? 'all'}
              onChange={(e) => setClientId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              className="w-full mt-1 text-xs border border-[#E7E2D8] rounded-lg px-2 py-2 bg-white">
              <option value="all">Select client…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-[#6B7385] uppercase">Prompt Version</label>
            <select value={selectedPrompt ?? ''} onChange={handleSelectPrompt}
              disabled={!clientId || clientId === 'all' || loadingPrompts || prompts.length === 0}
              className="w-full mt-1 text-xs border border-[#E7E2D8] rounded-lg px-2 py-2 bg-white disabled:bg-[#F7F4EE] disabled:text-[#6B7385]">
              {loadingPrompts ? (
                <option value="">Loading versions…</option>
              ) : prompts.length === 0 ? (
                <option value="">
                  {!clientId || clientId === 'all' ? 'Select a client first' : 'No prompt versions'}
                </option>
              ) : (
                prompts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.version ? ` (${p.version})` : ''} — {p.status}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
        {!loadingPrompts && clientId && clientId !== 'all' && prompts.length === 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-[#6B7385]">
            <span>This client has no prompt versions yet. Create a default one to get started.</span>
            <button onClick={handleCreatePrompt} disabled={creating}
              className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#3457D5] text-white hover:opacity-90 disabled:opacity-50">
              <Plus size={12} className="inline mr-1" /> {creating ? 'Creating...' : 'Create Default Prompt'}
            </button>
          </div>
        )}
      </Card>

      {/* Scoring Mode */}
      <Card>
        <h3 className="text-sm font-bold mb-3">1. Scoring Mode</h3>
        <div className="grid grid-cols-2 gap-3">
          {['default', 'custom'].map((mode) => (
            <button key={mode} onClick={() => setForm((p) => ({ ...p, scoring_mode: mode }))}
              className={`text-left p-4 rounded-xl border transition ${
                form.scoring_mode === mode
                  ? 'border-[#3457D5] bg-[#EEF1FE]'
                  : 'border-[#E7E2D8] hover:border-[#3457D5]/40'
              }`}>
              <div className="text-sm font-bold text-[#1D2433] mb-1">
                {mode === 'default' ? 'Default Scoring' : 'Custom Scoring'}
              </div>
              <div className="text-[10px] text-[#6B7385]">
                {mode === 'default'
                  ? `Use our standard weight distribution across ${configuredParams.length} parameters`
                  : 'Define your own weights and thresholds per parameter'}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {/* Weights + Thresholds (only if custom) */}
      {form.scoring_mode === 'custom' && (
        <Card>
          <h3 className="text-sm font-bold mb-3">2. Parameter Weights & Thresholds</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] text-[#6B7385] font-semibold uppercase border-b">
                  <th className="py-2 pr-3">Parameter</th>
                  <th className="py-2 pr-2">Weight (%)</th>
                  <th className="py-2 pr-2">TQ ≥</th>
                  <th className="py-2 pr-2">MQ ≥</th>
                  <th className="py-2">BQ &lt;</th>
                </tr>
              </thead>
              <tbody>
                {configuredParams.map((p) => (
                  <tr key={p.key} className="border-b border-[#E7E2D8]/60">
                    <td className="py-2 pr-3 font-semibold">{p.label}</td>
                    <td className="py-2 pr-2">
                      <input type="number" min="0" max="100"
                        value={form.weights[p.key] ?? p.weight ?? 15}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          weights: { ...prev.weights, [p.key]: Number(e.target.value) },
                        }))}
                        className="w-16 border rounded px-2 py-1 text-xs" />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" min="0" max="100"
                        value={form.thresholds[p.key]?.green || 80}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          thresholds: {
                            ...prev.thresholds,
                            [p.key]: { ...(prev.thresholds[p.key] || {}), green: Number(e.target.value) },
                          },
                        }))}
                        className="w-16 border rounded px-2 py-1 text-xs" />
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" min="0" max="100"
                        value={form.thresholds[p.key]?.amber || 60}
                        onChange={(e) => setForm((prev) => ({
                          ...prev,
                          thresholds: {
                            ...prev.thresholds,
                            [p.key]: { ...(prev.thresholds[p.key] || {}), amber: Number(e.target.value) },
                          },
                        }))}
                        className="w-16 border rounded px-2 py-1 text-xs" />
                    </td>
                    <td className="py-2">
                      <span className="text-[10px] text-[#6B7385]">
                        &lt; {form.thresholds[p.key]?.amber || 60}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 text-[10px] text-[#6B7385]">
            Total weight: {Object.values(form.weights).reduce((a, b) => a + (b || 0), 0)}%
            {Object.values(form.weights).reduce((a, b) => a + (b || 0), 0) !== 100 && (
              <span className="text-[#D14343] ml-1">⚠️ Should equal 100%</span>
            )}
          </div>
        </Card>
      )}

      {/* Prompt Text */}
      <Card>
        <h3 className="text-sm font-bold mb-3">3. Prompt Text</h3>
        <textarea value={form.prompt_text}
          onChange={(e) => setForm((p) => ({ ...p, prompt_text: e.target.value }))}
          rows={12}
          placeholder="Enter client-specific prompt here. AI will use this to audit transcripts."
          className="w-full text-xs border border-[#E7E2D8] rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30 font-mono" />
        <div className="text-[10px] text-[#6B7385] mt-1">
          {form.prompt_text.length} characters
        </div>
      </Card>

      {/* Notification Settings Link */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#1D2433]">AI Notification Rules</h3>
            <p className="text-[11px] text-[#6B7385] mt-0.5">
              Moved to Settings → Notifications for better organization
            </p>
          </div>
          <a href="/settings?tab=notifications"
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-[#3457D5] text-white hover:opacity-90">
            Go to Settings →
          </a>
        </div>
      </Card>
    </div>
  )
}