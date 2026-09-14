import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PreambleBuilder from './PreambleBuilder.jsx'
import ParameterBuilder from './ParameterBuilder.jsx'
import RulesConfigurator from './RulesConfigurator.jsx'
import BehaviourDetector from './BehaviourDetector.jsx'
import OutputSchemaBuilder from './OutputSchemaBuilder.jsx'
import AssistedPrompt from './AssistedPrompt.jsx'
import PromptPreview from './PromptPreview.jsx'
import ValidationPanel from './ValidationPanel.jsx'
import { INITIAL_CONFIG } from './config.js'
import { validatePrompt, assemblePrompt } from './logic.js'
import { Field, TextInput, Select } from './ui.jsx'
import {
  listClients, listAiPrompts, getAiPrompt, createAiPrompt, updateAiPrompt, activateAiPrompt, deleteAiPrompt,
} from '../../api/client.js'
import {
  Save, Copy, Check, FileText, ScrollText, ListOrdered, ShieldX, ShieldAlert,
  ScanSearch, Braces, Wand2, GitBranch, ChevronRight, Layers, Upload,
  Building2, Database, Loader2, FilePlus2, Trash2, Radio, Power, Pencil,
} from 'lucide-react'

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const clone = (obj) => JSON.parse(JSON.stringify(obj))

export default function PromptBuilder() {
  const [config, setConfig] = useState(clone(INITIAL_CONFIG))
  const [activeSection, setActiveSection] = useState('workflow')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const [clients, setClients] = useState([])
  const [clientId, setClientId] = useState('')
  const [prompts, setPrompts] = useState([])
  const [searchParams] = useSearchParams()
  const [promptId, setPromptId] = useState(searchParams.get('prompt') || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [promptStatus, setPromptStatus] = useState('')

  const val = useMemo(() => validatePrompt(config), [config])

  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  const notify = (text, kind = 'ok') => {
    setMsg({ text, kind })
    setTimeout(() => setMsg(null), 3500)
  }

  const refreshPrompts = useCallback(() => {
    listAiPrompts()
      .then(setPrompts)
      .catch(() => {})
  }, [])

  useEffect(() => {
    listClients()
      .then(setClients)
      .catch(() => {})
    refreshPrompts()
  }, [refreshPrompts])

  const loadPrompt = useCallback(async (id) => {
    try {
      const p = await getAiPrompt(id)
      const rawJson = p.prompt_json
      const cfg = rawJson && typeof rawJson === 'object' && Object.keys(rawJson).length
        ? rawJson
        : clone(INITIAL_CONFIG)
      setConfig(clone(cfg))
      setClientId(p.client_id ? String(p.client_id) : '')
      setPromptId(p.id)
      setPromptStatus(p.status || '')
      notify(`Loaded "${p.name}" ${p.version}`)
    } catch (e) {
      setPromptId('')
      notify(e.response?.data?.detail || 'Failed to load prompt', 'err')
    }
  }, [])

  // Load a prompt directly from the URL (?prompt=<id>)
  useEffect(() => {
    if (searchParams.get('prompt')) loadPrompt(searchParams.get('prompt'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clientOptions = [
    { value: '', label: 'Select client…' },
    ...clients.map((c) => ({ value: String(c.id), label: c.name })),
  ]

  const savedOptions = useMemo(() => {
    const list = clientId ? prompts.filter((p) => String(p.client_id) === String(clientId)) : prompts
    return [
      { value: '', label: list.length ? 'Load saved prompt…' : 'No saved prompts for this client' },
      ...list.map((p) => ({ value: String(p.id), label: `${p.name} (${p.version}) — ${p.status}${p.status === 'Active' ? ' ✓' : ''}` })),
    ]
  }, [prompts, clientId])

  const clientPrompts = useMemo(
    () => prompts.filter((p) => String(p.client_id) === String(clientId)),
    [prompts, clientId]
  )

  const handleLoad = (e) => {
    const id = e.target.value
    setPromptId(id)
    if (id) loadPrompt(id)
  }

  const handleNew = () => {
    setConfig(clone(INITIAL_CONFIG))
    setPromptId('')
    setClientId('')
    setPromptStatus('')
    setMsg(null)
  }

  const handleDelete = async () => {
    if (!promptId) return
    if (!window.confirm(`Delete the saved prompt #${promptId}?`)) return
    try {
      await deleteAiPrompt(promptId)
      handleNew()
      refreshPrompts()
      notify('Prompt deleted')
    } catch (e) {
      notify(e.response?.data?.detail || 'Delete failed', 'err')
    }
  }

  const handleSave = async () => {
    if (!clientId) {
      notify('Please choose a client before saving.', 'err')
      return
    }
    const currentStatus = promptStatus === 'Active' ? 'Active' : undefined
    const cfg = { ...config, status: currentStatus || (val.errors.length === 0 ? (config.status || 'Published') : 'Draft') }
    const payload = {
      client_id: Number(clientId),
      config: cfg,
      prompt_text: assemblePrompt(cfg),
      status: currentStatus,
    }
    setSaving(true)
    setMsg(null)
    try {
      const res = promptId ? await updateAiPrompt(promptId, payload) : await createAiPrompt(payload)
      setPromptId(res.id)
      setPromptStatus(res.status || '')
      setConfig((c) => ({ ...c, status: res.status || cfg.status }))
      refreshPrompts()
      setSaved(true)
      setTimeout(() => setSaved(false), 1800)
      notify(`Saved "${res.name}" ${res.version} for ${res.client_name || `client #${res.client_id}`}`)
    } catch (e) {
      notify(e.response?.data?.detail || 'Save failed', 'err')
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async () => {
    if (!promptId) {
      notify('Save the prompt before activating.', 'err')
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const res = await activateAiPrompt(promptId)
      setPromptStatus('Active')
      setConfig((c) => ({ ...c, status: 'Active' }))
      refreshPrompts()
      notify(`"${res.name}" is now the ACTIVE prompt for ${res.client_name || `client #${res.client_id}`}. The audit service will use it.`)
    } catch (e) {
      notify(e.response?.data?.detail || 'Activate failed', 'err')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateDefault = async () => {
    if (!clientId) {
      notify('Please choose a client first.', 'err')
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      const cfg = clone(INITIAL_CONFIG)
      const res = await createAiPrompt({
        client_id: Number(clientId),
        config: { ...cfg, status: 'Draft' },
        prompt_text: assemblePrompt(cfg),
      })
      const active = await activateAiPrompt(res.id)
      refreshPrompts()
      setPromptId(active.id)
      setPromptStatus('Active')
      setConfig((c) => ({ ...c, status: 'Active' }))
      notify(`Created and activated the default prompt for ${active.client_name || `client #${active.client_id}`}`)
    } catch (e) {
      notify(e.response?.data?.detail || 'Create default prompt failed', 'err')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (prompt) => {
    try {
      if (prompt.status === 'Active') {
        await updateAiPrompt(prompt.id, { config: {}, status: 'Draft' })
        if (String(prompt.id) === String(promptId)) {
          setPromptStatus('Draft')
          setConfig((c) => ({ ...c, status: 'Draft' }))
        }
        notify(`"${prompt.name}" ${prompt.version} deactivated (Draft)`)
      } else {
        const res = await activateAiPrompt(prompt.id)
        setPromptStatus('Active')
        setConfig((c) => ({ ...c, status: 'Active' }))
        notify(`"${res.name}" ${res.version} is now ACTIVE for ${res.client_name || `client #${res.client_id}`}. The audit service will use it.`)
      }
      refreshPrompts()
    } catch (e) {
      notify(e.response?.data?.detail || 'Toggle active failed', 'err')
    }
  }

  const handleAssistedRule = (gen) => {
    const target = config.parameters
    if (!Array.isArray(target) || !target[0]) return
    const question = {
      id: uid(),
      name: gen.rule,
      criteria: gen.criteria,
      weight: 0,
      priority: 'normal',
      scoringType: 'pass_partial_fail',
      required: true,
      fatal: false,
      hardRule: false,
      evidenceRequired: true,
    }
    setConfig((c) => ({
      ...c,
      parameters: c.parameters.map((p, i) =>
        i === 0 ? { ...p, questions: [...(p.questions || []), question] } : p
      ),
    }))
  }

  const handleCopyPrompt = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (e) { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const sections = [
    { id: 'workflow', label: 'Workflow', icon: GitBranch },
    { id: 'preamble', label: 'Preamble', icon: ScrollText },
    { id: 'parameters', label: 'Parameters', icon: ListOrdered },
    { id: 'rules', label: 'Fatal & Hard Rules', icon: ShieldX },
    { id: 'behaviour', label: 'Behaviours', icon: ScanSearch },
    { id: 'schema', label: 'Output Schema', icon: Braces },
    { id: 'assisted', label: 'Assisted Prompt', icon: Wand2 },
  ]

  const nav = (
    <div className="flex flex-wrap gap-1 bg-white border border-[#E7E2D8] rounded-xl p-1">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => setActiveSection(s.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition ${activeSection === s.id ? 'bg-[#16213E] text-white' : 'text-[#6B7385] hover:bg-[#F7F4EE]'}`}
        >
          <s.icon size={13} /> {s.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white border border-[#E7E2D8] rounded-xl p-5">
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-xl bg-[#3457D5] flex items-center justify-center text-white">
                <FileText size={18} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-[#1D2433] leading-tight">Prompt Builder</h1>
                <p className="text-[11px] text-[#6B7385]">Design, configure and assemble the AI call-quality evaluation prompt.</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 max-w-xl">
              <Field label="Prompt name">
                <TextInput value={config.name} onChange={(e) => update({ name: e.target.value })} />
              </Field>
              <Field label="Version / Status">
                <div className="flex gap-2">
                  <TextInput value={config.version} onChange={(e) => update({ version: e.target.value })} />
                  <Select
                    value={config.status}
                    onChange={(e) => update({ status: e.target.value })}
                    options={[
                      { value: 'Draft', label: 'Draft' },
                      { value: 'Published', label: 'Published' },
                      { value: 'Archived', label: 'Archived' },
                    ]}
                  />
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3 max-w-xl">
              <Field label="Client" required hint="Prompts are saved per client.">
                <Select value={clientId} onChange={(e) => setClientId(e.target.value)} options={clientOptions} />
              </Field>
              <Field label="Load saved prompt" hint={promptId ? `Editing prompt #${promptId}` : 'Pick an existing prompt to edit.'}>
                <Select value={promptId} onChange={handleLoad} options={savedOptions} />
              </Field>
            </div>
            <Field label="Description" className="mt-3 max-w-xl">
              <TextInput value={config.description} onChange={(e) => update({ description: e.target.value })} />
            </Field>
            {msg && (
              <div className={`mt-3 text-xs font-semibold px-3 py-2 rounded-lg max-w-xl ${msg.kind === 'err' ? 'bg-[#FBE9E9] text-[#D14343]' : 'bg-[#E7F7EF] text-[#1C9A6C]'}`}>
                {msg.text}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <div className="flex gap-2 justify-end">
              <button
                onClick={handleNew}
                title="Start a fresh prompt template"
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl border border-[#E7E2D8] text-[#1D2433] hover:border-[#3457D5] hover:text-[#3457D5] transition"
              >
                <FilePlus2 size={14} /> New
              </button>
              {promptId && (
                <button
                  onClick={handleDelete}
                  title="Delete this saved prompt"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl border border-[#E7E2D8] text-[#D14343] hover:bg-[#FBE9E9] hover:border-[#D14343]/40 transition"
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
              {promptId && promptStatus !== 'Active' && (
                <button
                  onClick={handleActivate}
                  disabled={saving}
                  title="Mark this prompt as the active prompt for this client (used by the AI audit service)"
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl transition ${saving ? 'opacity-60 cursor-wait' : 'bg-[#1C9A6C] text-white hover:bg-[#18885E]'}`}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />} Set as Active
                </button>
              )}
              {promptId && promptStatus === 'Active' && (
                <div
                  title="This prompt is the active prompt for this client and is used by the AI audit service"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl bg-[#E7F7EF] text-[#1C9A6C]"
                >
                  <Check size={14} /> Active
                </div>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl transition ${saved ? 'bg-[#1C9A6C] text-white' : 'bg-[#16213E] text-white hover:bg-[#1B3157]'} ${saving ? 'opacity-60 cursor-wait' : ''}`}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save & Publish'}
              </button>
              <button
                onClick={() => handleCopyPrompt(config.description)}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2.5 rounded-xl border transition ${copied ? 'border-[#1C9A6C] text-[#1C9A6C]' : 'border-[#E7E2D8] text-[#1D2433] hover:border-[#3457D5] hover:text-[#3457D5]'}`}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />} Copy
              </button>
            </div>
            <div className="flex items-center justify-end gap-1.5 text-[10px] text-[#6B7385] font-medium">
              {clientId && (
                <Building2 size={12} />
              )}
              <Layers size={12} />
              {config.parameters?.length || 0} parameters · {config.fatalRules?.length || 0} fatal · {config.hardRules?.length || 0} hard
            </div>
            {(clientId || promptId) && (
              <div className="flex items-center justify-end gap-1.5 text-[10px] text-[#3457D5] font-semibold">
                <Database size={12} />
                {promptId ? `Saved prompt #${promptId}` : 'New prompt (not saved yet)'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Per-client prompt versions */}
      <div className="bg-white border border-[#E7E2D8] rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-[#1D2433]">
              <Database size={15} className="text-[#3457D5]" />
              Prompts for {clients.find((c) => String(c.id) === String(clientId))?.name || 'selected client'}
            </div>
            <p className="text-[11px] text-[#6B7385]">
              Client-wise prompt versions. Activate one per client — the ACTIVE prompt is what the AI audit service uses.
            </p>
          </div>
        </div>
        {!clientId ? (
          <div className="text-xs text-[#6B7385]">Select a client above to manage its prompt versions.</div>
        ) : clientPrompts.length === 0 ? (
          <div className="flex items-center justify-between gap-3 border border-dashed border-[#E7E2D8] rounded-lg px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-[#1D2433]">No prompts saved for this client yet</div>
              <div className="text-[10px] text-[#6B7385]">Create a default QA audit prompt so this client's transcripts can be audited.</div>
            </div>
            <button
              onClick={handleCreateDefault}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl transition shrink-0 ${saving ? 'opacity-60 cursor-wait bg-[#16213E] text-white' : 'bg-[#16213E] text-white hover:bg-[#1B3157]'}`}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />} Create default &amp; activate
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {clientPrompts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 border border-[#E7E2D8] rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#1D2433] truncate">{p.name}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EEF1FE] text-[#3457D5]">{p.version}</span>
                    {p.status === 'Active' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-[#E7F7EF] text-[#1C9A6C]">
                        <Radio size={10} /> ACTIVE
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#F1F1F4] text-[#6B7385]">{p.status}</span>
                    )}
                    <span className="text-[10px] text-[#6B7385]">#{p.id}</span>
                  </div>
                </div>
                <button
                  onClick={() => loadPrompt(p.id)}
                  title="Edit this version"
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-[#E7E2D8] text-[#1D2433] hover:border-[#3457D5] hover:text-[#3457D5] transition"
                >
                  <Pencil size={12} /> Edit
                </button>
                {p.status === 'Active' ? (
                  <button
                    onClick={() => handleToggleActive(p)}
                    title="Deactivate this prompt version"
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-[#FBE9E9] text-[#D14343] hover:bg-[#FBE9E9] transition"
                  >
                    <Power size={12} /> Deactivate
                  </button>
                ) : (
                  <button
                    onClick={() => handleToggleActive(p)}
                    title="Activate this prompt version for this client"
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-[#1C9A6C] text-white hover:bg-[#18885E] transition"
                  >
                    <Radio size={12} /> Activate
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section nav */}
      {nav}

      {/* Validation banner when publishing */}
      {val.errors.length > 0 && activeSection === 'workflow' && (
        <div className="bg-[#FBE9E9] border border-[#D14343]/30 rounded-xl p-3">
          <div className="flex items-center gap-2 text-sm font-bold text-[#D14343] mb-1">
            Fix validation issues before publishing
          </div>
          <ul className="text-xs text-[#D14343] list-disc pl-5">
            {val.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Content */}
      <div className="space-y-5">
        {activeSection === 'workflow' && (
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2 space-y-4">
              <Card>
                <SectionHeading icon={GitBranch} title="Build Workflow" desc="Streamline how the evaluation prompt is constructed and tested." />
                <WorkflowSteps />
              </Card>
              <Card>
                <SectionHeading icon={ListOrdered} title="Quick summary" desc="Current state of your configured prompt sections." />
                <ConfigSummary config={config} onJump={setActiveSection} />
              </Card>
              <Card>
                <ValidationPanel config={config} />
              </Card>
            </div>
            <div className="col-span-1 space-y-4">
              <Card>
                <SectionHeading icon={ScrollText} title="Preamble preview" desc="Global instructions." />
                <p className="text-[11px] text-[#6B7385] whitespace-pre-wrap">{config.preamble?.objective}</p>
              </Card>
              <Card>
                <SectionHeading icon={ShieldAlert} title="Active rules" desc="Fatal and hard rules enabled." />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs"><span className="text-[#1D2433]">Fatal rules</span><span className="font-semibold text-[#D14343]">{config.fatalRules.filter((r) => r.enabled).length} active</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#1D2433]">Hard rules</span><span className="font-semibold text-[#C9862B]">{config.hardRules.filter((r) => r.enabled).length} active</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-[#1D2433]">Behaviours</span><span className="font-semibold text-[#3457D5]">{config.behaviours.filter((b) => b.enabled).length} enabled</span></div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeSection === 'preamble' && (
          <Card>
            <PreambleBuilder preamble={config.preamble} update={(p) => update({ preamble: p })} />
          </Card>
        )}

        {activeSection === 'parameters' && (
          <Card>
            <ParameterBuilder parameters={config.parameters} update={(parameters) => update({ parameters })} />
          </Card>
        )}

        {activeSection === 'rules' && (
          <div className="grid grid-cols-2 gap-5">
            <RulesConfigurator kind="fatal" rules={config.fatalRules} update={(fatalRules) => update({ fatalRules })} />
            <RulesConfigurator kind="hard" rules={config.hardRules} update={(hardRules) => update({ hardRules })} />
          </div>
        )}

        {activeSection === 'behaviour' && (
          <Card>
            <BehaviourDetector behaviours={config.behaviours} update={(behaviours) => update({ behaviours })} />
          </Card>
        )}

        {activeSection === 'schema' && (
          <Card>
            <OutputSchemaBuilder schema={config.outputSchema} update={(outputSchema) => update({ outputSchema })} />
          </Card>
        )}

        {activeSection === 'assisted' && (
          <Card>
            <AssistedPrompt onAddRule={handleAssistedRule} />
          </Card>
        )}
      </div>

      {/* Assembled prompt - always visible */}
      <PromptPreview config={config} />

      <div className="flex items-center gap-2 text-[11px] text-[#6B7385]">
        <GitBranch size={12} />
        Every change updates the configuration, re-runs validation and regenerates the prompt preview above.
      </div>
    </div>
  )
}

function Card({ children }) {
  return <div className="bg-white border border-[#E7E2D8] rounded-xl p-5">{children}</div>
}

function SectionHeading({ icon: Icon, title, desc }) {
  return (
    <div className="flex items-center gap-2.5 mb-3">
      <div className="w-8 h-8 rounded-lg bg-[#EEF1FE] flex items-center justify-center text-[#3457D5] shrink-0">
        <Icon size={15} />
      </div>
      <div>
        <h4 className="text-sm font-bold text-[#1D2433] leading-tight">{title}</h4>
        {desc && <p className="text-[11px] text-[#6B7385]">{desc}</p>}
      </div>
    </div>
  )
}

function WorkflowSteps() {
  const steps = [
    { n: 1, title: 'Define preamble', desc: 'Global role, scope and rules', icon: ScrollText },
    { n: 2, title: 'Configure parameters', desc: 'QA categories, weights and questions', icon: ListOrdered },
    { n: 3, title: 'Set fatal & hard rules', desc: 'Deterministic constraints', icon: ShieldX },
    { n: 4, title: 'Enable behaviour detection', desc: 'Positive & negative signals', icon: ScanSearch },
    { n: 5, title: 'Define output schema', desc: 'Structured JSON response', icon: Braces },
    { n: 6, title: 'Validate & publish', desc: 'Auto-generate final prompt', icon: Upload },
  ]
  return (
    <div className="space-y-1">
      {steps.map((s, i) => (
        <div key={s.n}>
          <div className="flex items-center gap-3 py-2">
            <div className="w-8 h-8 rounded-full bg-[#16213E] text-white flex items-center justify-center text-xs font-bold shrink-0">{s.n}</div>
            <div className="flex-1">
              <div className="text-xs font-semibold text-[#1D2433]">{s.title}</div>
              <div className="text-[10px] text-[#6B7385]">{s.desc}</div>
            </div>
            <s.icon size={14} className="text-[#3457D5]" />
          </div>
          {i < steps.length - 1 && <div className="ml-4 w-px h-4 bg-[#E7E2D8] ml-[15px]" />}
        </div>
      ))}
    </div>
  )
}

function ConfigSummary({ config, onJump }) {
  const items = [
    { key: 'preamble', label: 'Preamble', desc: config.preamble?.objective?.slice(0, 60) || '—' },
    { key: 'parameters', label: `Parameters (${config.parameters?.length || 0})`, desc: `${config.parameters?.reduce((s, p) => s + (p.questions?.length || 0), 0) || 0} total questions` },
    { key: 'rules', label: `Fatal & Hard Rules`, desc: `${config.fatalRules?.length || 0} fatal / ${config.hardRules?.length || 0} hard` },
    { key: 'behaviour', label: `Behaviours (${config.behaviours?.length || 0})`, desc: `${config.behaviours?.filter((b) => b.classification === 'positive').length || 0} positive / ${config.behaviours?.filter((b) => b.classification === 'negative').length || 0} negative` },
    { key: 'schema', label: 'Output Schema', desc: `${(config.outputSchema?.universalBase?.length || 0) + (config.outputSchema?.customFields?.length || 0)} fields` },
  ]
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onJump(it.key)}
          className="w-full flex items-center justify-between gap-3 border border-[#E7E2D8] rounded-lg px-3 py-2 text-left hover:border-[#3457D5]/40 hover:shadow-sm transition"
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold text-[#1D2433]">{it.label}</div>
            <div className="text-[10px] text-[#6B7385] truncate">{it.desc}</div>
          </div>
          <ChevronRight size={14} className="text-[#6B7385] shrink-0" />
        </button>
      ))}
    </div>
  )
}
