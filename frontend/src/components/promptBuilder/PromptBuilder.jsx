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
  listAiPrompts, getAiPrompt, createAiPrompt, updateAiPrompt, activateAiPrompt, deleteAiPrompt, getPipelineRun,
  testAiPrompt, testAiPromptAudio, listPromptDocuments, uploadPromptDocuments, generatePromptFromDocs,
  replacePromptDocument, deletePromptDocument,
} from '../../api/client.js'
import { useClientFilter } from '../ClientContext.jsx'
import { BookText, PlayCircle, AudioLines, X } from 'lucide-react'
import {
  Save, Copy, Check, FileText, ScrollText, ListOrdered, ShieldX, ShieldAlert,
  ScanSearch, Braces, Wand2, GitBranch, ChevronRight, Layers, Upload,
  Building2, Database, Loader2, FilePlus2, Trash2, Radio, Power, Pencil,
} from 'lucide-react'

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

const clone = (obj) => JSON.parse(JSON.stringify(obj))

const prettyKey = (value) => String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()

// Generated documents return flat "sections"; convert every section into a
// configurable parameter so the generated prompt is immediately usable.
const parametersFromSections = (sections) => {
  const list = Array.isArray(sections) ? sections : []
  const weights = list.map((s) => Math.max(1, Number(s.weight) || 10))
  const total = weights.reduce((sum, w) => sum + w, 0) || list.length || 1
  let used = 0
  return list.map((s, i) => {
    const weight = i === list.length - 1 ? 100 - used : Math.round((weights[i] / total) * 100)
    used += weight
    const name = s.label || prettyKey(s.key) || `Section ${i + 1}`
    const priority = ['critical', 'high'].includes(String(s.severity || '').toLowerCase()) ? 'important' : 'normal'
    return {
      id: uid(),
      name,
      description: s.question ? `Check: ${s.question}` : '',
      weight,
      priority,
      evaluationType: 'pass_partial_fail',
      questions: [{
        id: uid(),
        name,
        criteria: s.question || `Verify that the agent follows the ${name.toLowerCase()} process.`,
        weight: 100,
        priority,
        scoringType: 'pass_partial_fail',
        required: true,
        fatal: false,
        hardRule: false,
        evidenceRequired: true,
      }],
    }
  })
}

// Saved/generated configs may contain only a few keys — merge with defaults so
// every builder section and validator always has the shape it expects.
const normalizeConfig = (raw) => {
  const base = clone(INITIAL_CONFIG)
  if (!raw || typeof raw !== 'object') return base
  const cfg = { ...base, ...raw }
  cfg.preamble = { ...base.preamble, ...(raw.preamble && typeof raw.preamble === 'object' ? raw.preamble : {}) }
  cfg.outputSchema = { ...base.outputSchema, ...(raw.outputSchema && typeof raw.outputSchema === 'object' ? raw.outputSchema : {}) }
  ;['parameters', 'fatalRules', 'hardRules', 'behaviours'].forEach((key) => {
    cfg[key] = Array.isArray(raw[key]) ? raw[key] : base[key]
  })
  if ((!Array.isArray(raw.parameters) || raw.parameters.length === 0) && Array.isArray(raw.sections) && raw.sections.length) {
    cfg.parameters = parametersFromSections(raw.sections)
  }
  return cfg
}

export default function PromptBuilder() {
  const [config, setConfig] = useState(clone(INITIAL_CONFIG))
  const assembledPrompt = useMemo(() => assemblePrompt(config), [config])
  const [activeSection, setActiveSection] = useState('workflow')
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  const { clients } = useClientFilter()
  const [clientId, setClientId] = useState('')
  const [prompts, setPrompts] = useState([])
  const [searchParams] = useSearchParams()
  const [promptId, setPromptId] = useState(searchParams.get('prompt') || '')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [promptStatus, setPromptStatus] = useState('')

  // Issue 1 & 5: prompt testing (transcript or audio) + document upload
  const [docs, setDocs] = useState([])
  const [testTranscript, setTestTranscript] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [audioFile, setAudioFile] = useState(null)
  const [audioTesting, setAudioTesting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generatedFromDocs, setGeneratedFromDocs] = useState(false)
  const [replacingDocId, setReplacingDocId] = useState(null)
  const [deletingDocId, setDeletingDocId] = useState(null)

  // A test is only valid for the prompt it was run against.
  useEffect(() => { setTestResult(null) }, [assembledPrompt])

  const loadDocs = useCallback(() => {
    if (!clientId) return
    listPromptDocuments(Number(clientId))
      .then((res) => setDocs(Array.isArray(res) ? res : (res?.files || [])))
      .catch(() => setDocs([]))
  }, [clientId])

  useEffect(() => { setTestResult(null); loadDocs() }, [loadDocs])

  const handleTestPrompt = async () => {
    if (!clientId) {
      notify('Choose a client first.', 'err')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testAiPrompt({
        client_id: Number(clientId),
        prompt_text: assembledPrompt,
        config,
        transcript: testTranscript.trim() || undefined,
        note: 'Live test — not saved.',
      })
      setTestResult({ ok: !!res?.ok, result: res?.result || {}, note: res?.note })
      if (!res?.ok) notify('Test completed with empty/invalid result — check LLM configuration', 'err')
    } catch (e) {
      setTestResult({ ok: false, error: e?.response?.data?.detail || e?.message, result: {} })
    } finally {
      setTesting(false)
    }
  }

  const handleAudioTest = async () => {
    if (!clientId) {
      notify('Choose a client first.', 'err')
      return
    }
    if (!audioFile) {
      notify('Choose an audio file first.', 'err')
      return
    }
    setAudioTesting(true)
    setTestResult(null)
    try {
      const res = await testAiPromptAudio({
        clientId: Number(clientId),
        file: audioFile,
        promptText: assembledPrompt,
        config,
        note: `Audio test — ${audioFile.name}`,
      })
      if (res?.transcript) setTestTranscript(res.transcript)
      setTestResult({ ok: !!res?.ok, result: res?.result || {}, note: res?.note, transcript: res?.transcript })
      if (!res?.ok) notify('Test completed with empty/invalid result — check LLM configuration', 'err')
    } catch (e) {
      setTestResult({ ok: false, error: e?.response?.data?.detail || e?.message, result: {} })
    } finally {
      setAudioTesting(false)
    }
  }

  const handleUploadDocs = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!clientId || files.length === 0) return
    setUploading(true)
    try {
      await uploadPromptDocuments(Number(clientId), files)
      notify(`Uploaded ${files.length} document(s). Generate a prompt from them or upload more.`)
      loadDocs()
    } catch (err) {
      notify(err?.response?.data?.detail || 'Upload failed', 'err')
    } finally {
      setUploading(false)
    }
  }

  const handleReplaceDoc = async (doc, event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !clientId) return
    setReplacingDocId(doc.id)
    try {
      const updated = await replacePromptDocument(Number(clientId), doc.id, file)
      notify(`Replaced "${doc.file_name}" with "${updated.file_name}". Extracted text was refreshed.`)
      loadDocs()
    } catch (err) {
      notify(err?.response?.data?.detail || 'Replace failed', 'err')
    } finally {
      setReplacingDocId(null)
    }
  }

  const handleDeleteDoc = async (doc) => {
    if (!clientId || !window.confirm(`Remove "${doc.file_name}" from this client's documents?`)) return
    setDeletingDocId(doc.id)
    try {
      await deletePromptDocument(Number(clientId), doc.id)
      notify(`Removed "${doc.file_name}"`)
      loadDocs()
    } catch (err) {
      notify(err?.response?.data?.detail || 'Delete failed', 'err')
    } finally {
      setDeletingDocId(null)
    }
  }

  const handleGenerateFromDocs = async () => {
    if (!clientId) { notify('Choose a client first.', 'err'); return }
    setGenerating(true)
    try {
      const res = await generatePromptFromDocs(Number(clientId))
      const generated = normalizeConfig({
        ...(res.name ? { name: res.name } : {}),
        ...(res.description ? { description: res.description } : {}),
        version: 'v1.0',
        status: 'Draft',
        sections: res.sections || [],
        parameters: res.parameters || [],
        generatedPromptText: res.generatedPromptText || res.prompt_text || '',
      })
      if (res.description) {
        generated.preamble = {
          ...generated.preamble,
          objective: `Audit the call against this process: ${res.description}`,
        }
      }
      setConfig(generated)
      setGeneratedFromDocs(true)
      setSaved(false)
      if (res.saved_id) {
        setPromptId(String(res.saved_id))
        setPromptStatus('Draft')
      }
      notify(
        res.fallback
          ? `Generated a fallback prompt from ${docs.length || 'uploaded'} document(s) — LLM analysis was unavailable. Review and customise it.`
          : `Generated prompt "${generated.name}" from ${docs.length || 'uploaded'} document(s). Review, customise and test it before activation.`,
        res.fallback ? 'err' : 'ok',
      )
      refreshPrompts()
    } catch (err) {
      notify(err?.response?.data?.detail || 'Generation failed', 'err')
    } finally {
      setGenerating(false)
    }
  }

  const val = useMemo(() => validatePrompt(config), [config])

  const focusStep = (elementId, sectionId) => {
    if (sectionId) setActiveSection(sectionId)
    window.requestAnimationFrame(() => {
      document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const flowSteps = [
    {
      title: 'Upload documents',
      desc: 'Add SOPs, FAQs and process guidelines (TXT, MD, PDF, DOCX, JSON).',
      done: docs.length > 0,
      onClick: () => focusStep('prompt-documents'),
    },
    {
      title: 'Generate prompt',
      desc: 'Analyse the documents and create a process-specific draft automatically.',
      done: generatedFromDocs,
      onClick: () => focusStep('prompt-documents'),
    },
    {
      title: 'Customise & validate',
      desc: 'Edit the generated sections, rules and instructions; clear all validation errors.',
      done: val.errors.length === 0 && (generatedFromDocs || (config.parameters?.length || 0) > 0),
      onClick: () => focusStep('prompt-builder-sections', 'workflow'),
    },
    {
      title: 'Review & test',
      desc: 'Review the assembled prompt, then test it with a transcript or call audio.',
      done: !!testResult?.ok,
      onClick: () => focusStep('prompt-testing'),
    },
    {
      title: 'Save & activate',
      desc: 'Save the prompt, then make it the active prompt for this client.',
      done: !!promptId && promptStatus === 'Active',
      onClick: () => focusStep('prompt-builder-header'),
    },
  ]
  const currentStepIndex = flowSteps.findIndex((s) => !s.done)

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
    refreshPrompts()
  }, [refreshPrompts])

  useEffect(() => {
    if (!clients.length) return
    if (!clients.some((c) => String(c.id) === String(clientId))) {
      setClientId(String(clients[0].id))
    }
  }, [clients, clientId])

  const loadPrompt = useCallback(async (id) => {
    try {
      const p = await getAiPrompt(id)
      const rawJson = p.prompt_json
      const cfg = rawJson && typeof rawJson === 'object' && Object.keys(rawJson).length
        ? normalizeConfig(rawJson)
        : clone(INITIAL_CONFIG)
      setConfig(cfg)
      setGeneratedFromDocs(!!cfg.generatedPromptText || (Array.isArray(cfg.sections) && cfg.sections.length > 0))
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

  const allowedClientIds = useMemo(() => new Set(clients.map((c) => String(c.id))), [clients])
  const scopedPrompts = useMemo(
    () => prompts.filter((p) => allowedClientIds.has(String(p.client_id))),
    [prompts, allowedClientIds],
  )

  const savedOptions = useMemo(() => {
    const list = clientId ? scopedPrompts.filter((p) => String(p.client_id) === String(clientId)) : scopedPrompts
    return [
      { value: '', label: list.length ? 'Load saved prompt…' : 'No saved prompts for this client' },
      ...list.map((p) => ({ value: String(p.id), label: `${p.name} (${p.version}) — ${p.status}${p.status === 'Active' ? ' ✓' : ''}` })),
    ]
  }, [scopedPrompts, clientId])

  const clientPrompts = useMemo(
    () => scopedPrompts.filter((p) => String(p.client_id) === String(clientId)),
    [scopedPrompts, clientId]
  )

  const handleLoad = (e) => {
    const id = e.target.value
    setPromptId(id)
    if (id) loadPrompt(id)
  }

  const handleNew = () => {
    setConfig(clone(INITIAL_CONFIG))
    setGeneratedFromDocs(false)
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

  const watchPipeline = (runId, clientId) => {
    if (!runId) return
    window.dispatchEvent(new CustomEvent('calliq:pipeline-start', {
      detail: { run_id: runId, client_id: clientId },
    }))
    const poll = async () => {
      try {
        const run = await getPipelineRun(runId)
        if (['completed', 'failed'].includes(run.status)) {
          window.dispatchEvent(new CustomEvent('calliq:pipeline-complete', { detail: run }))
        } else {
          window.setTimeout(poll, 2000)
        }
      } catch {
        // A transient polling error should not break the activation flow.
        window.setTimeout(poll, 3000)
      }
    }
    window.setTimeout(poll, 1500)
  }

  const handleActivate = async () => {
    if (!promptId) {
      notify('Save the prompt before activating.', 'err')
      return
    }
    if (val.errors.length > 0) {
      setActiveSection('workflow')
      notify('Fix the validation issues below before activation.', 'err')
      return
    }
    if (!testResult?.ok) {
      document.getElementById('prompt-testing')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      notify('Run a successful test against this prompt before activation.', 'err')
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
      watchPipeline(res.run_id, res.client_id)
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
      watchPipeline(active.run_id, active.client_id)
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
        const isCurrent = String(prompt.id) === String(promptId)
        if (!isCurrent || !testResult?.ok) {
          notify('Load this prompt and run a successful test before activating it.', 'err')
          return
        }
        const res = await activateAiPrompt(prompt.id)
        setPromptStatus('Active')
        setConfig((c) => ({ ...c, status: 'Active' }))
        notify(`"${res.name}" ${res.version} is now ACTIVE for ${res.client_name || `client #${res.client_id}`}. The audit service will use it.`)
        watchPipeline(res.run_id, res.client_id)
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
      <div id="prompt-builder-header" className="bg-white border border-[#E7E2D8] rounded-xl p-5">
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

      {/* Progress-driven prompt creation workflow */}
      <div className="bg-white border border-[#E7E2D8] rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#EEF1FE] flex items-center justify-center text-[#3457D5]"><ListOrdered size={14} /></div>
            <div>
              <div className="text-sm font-bold text-[#1D2433]">Prompt Creation — Step by Step</div>
              <div className="text-[10px] text-[#6B7385]">Click a step to jump to it. Completed steps are checked automatically.</div>
            </div>
          </div>
          <div className="text-[10px] font-semibold text-[#3457D5]">
            {currentStepIndex === -1 ? 'All steps complete' : `Step ${currentStepIndex + 1} of ${flowSteps.length}`}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {flowSteps.map((s, i) => (
            <button
              key={s.title}
              onClick={s.onClick}
              className={`text-left border rounded-xl p-3 transition hover:border-[#3457D5]/50 ${
                i === currentStepIndex ? 'border-[#3457D5] bg-[#EEF1FE]' : 'border-[#E7E2D8] bg-white'
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  s.done ? 'bg-[#1C9A6C] text-white' : i === currentStepIndex ? 'bg-[#3457D5] text-white' : 'bg-[#F1F1F4] text-[#6B7385]'
                }`}>
                  {s.done ? <Check size={12} /> : i + 1}
                </span>
                <span className={`text-xs font-semibold ${s.done ? 'text-[#1C9A6C]' : 'text-[#1D2433]'}`}>{s.title}</span>
              </div>
              <div className="text-[10px] text-[#6B7385] leading-snug">{s.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Issue 1 & 5: Documents + Test */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div id="prompt-documents" className="bg-white border border-[#E7E2D8] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-[#FFF7ED] flex items-center justify-center text-[#C9862B]"><BookText size={14} /></div>
            <div>
              <div className="text-sm font-bold text-[#1D2433]">Process Documents ({docs.length})</div>
              <div className="text-[10px] text-[#6B7385]">Upload SOPs, FAQs and guidelines. Replace or remove them at any time.</div>
            </div>
          </div>
          <input
            type="file"
            multiple
            accept=".txt,.md,.pdf,.docx,.json"
            onChange={handleUploadDocs}
            className="hidden"
            id="prompt-doc-upload"
          />
          <label htmlFor="prompt-doc-upload"
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-[#C9862B]/50 bg-[#FFF7ED] transition text-xs font-semibold text-[#C9862B] mb-3 ${
              uploading ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:border-[#C9862B]'
            }`}>
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            {uploading ? 'Uploading…' : 'Upload SOP / FAQ / guideline documents'}
          </label>
          <button
            onClick={handleGenerateFromDocs}
            disabled={generating || uploading || !clientId || docs.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#16213E] text-white text-xs font-semibold hover:bg-[#1B3157] transition disabled:opacity-50"
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <BookText size={13} />}
            {generating ? 'Analysing documents…' : 'Generate prompt from documents'}
          </button>
          <div className="max-h-64 overflow-y-auto mt-3 space-y-1.5">
            {docs.length === 0 && <div className="text-[10px] text-[#6B7385]">No documents uploaded yet — upload an SOP or FAQ to get a process-specific prompt.</div>}
            {docs.map((d) => (
              <div key={d.id} className="border border-[#E7E2D8] rounded-lg px-2.5 py-2">
                <div className="flex items-center gap-2 text-xs text-[#1D2433]">
                  <FileText size={12} className="text-[#3457D5] shrink-0" />
                  <span className="font-medium truncate">{d.file_name}</span>
                  <span className="text-[10px] text-[#6B7385]">{d.size_bytes ? `${(d.size_bytes / 1024).toFixed(0)} KB` : ''}</span>
                  <label
                    htmlFor={`replace-doc-${d.id}`}
                    className={`ml-auto inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border transition ${
                      replacingDocId === d.id ? 'opacity-50 pointer-events-none' : 'cursor-pointer border-[#E7E2D8] text-[#3457D5] hover:border-[#3457D5]'
                    }`}
                  >
                    <Pencil size={10} /> {replacingDocId === d.id ? 'Replacing…' : 'Replace'}
                  </label>
                  <input
                    id={`replace-doc-${d.id}`}
                    type="file"
                    accept=".txt,.md,.pdf,.docx,.json"
                    onChange={(e) => handleReplaceDoc(d, e)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteDoc(d)}
                    disabled={deletingDocId === d.id}
                    title="Remove this document"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border border-[#FBE9E9] text-[#D14343] hover:bg-[#FBE9E9] disabled:opacity-50"
                  >
                    <Trash2 size={10} /> {deletingDocId === d.id ? 'Removing…' : 'Remove'}
                  </button>
                </div>
                {d.preview && (
                  <details className="mt-1.5 text-[10px] text-[#6B7385]">
                    <summary className="cursor-pointer font-semibold">View extracted text</summary>
                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap bg-[#F7F4EE] rounded-lg p-2 mt-1">{d.preview}</pre>
                  </details>
                )}
              </div>
            ))}
          </div>
          {config.generatedPromptText && (
            <div className="mt-3 border-t border-[#E7E2D8] pt-3">
              <div className="text-[10px] font-semibold text-[#1D2433] mb-1">Generated process instructions (editable)</div>
              <textarea
                value={config.generatedPromptText}
                onChange={(e) => update({ generatedPromptText: e.target.value })}
                rows={5}
                placeholder="Instructions extracted from your SOPs and FAQs…"
                className="w-full px-3 py-2 rounded-xl border border-[#E7E2D8] text-xs resize-y focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
              />
              <div className="text-[10px] text-[#6B7385] mt-1">
                These instructions are included in the assembled prompt preview and saved with the prompt.
              </div>
            </div>
          )}
        </div>

        <div id="prompt-testing" className="bg-white border border-[#E7E2D8] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-7 h-7 rounded-lg bg-[#E7F7EF] flex items-center justify-center text-[#1C9A6C]"><PlayCircle size={14} /></div>
            <div>
              <div className="text-sm font-bold text-[#1D2433]">Prompt Testing</div>
              <div className="text-[10px] text-[#6B7385]">A successful test is required before activation.</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm,.aac"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="hidden"
              id="prompt-audio-upload"
            />
            <label
              htmlFor="prompt-audio-upload"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-[#1C9A6C]/50 bg-[#E7F7EF] cursor-pointer hover:border-[#1C9A6C] transition text-xs font-semibold text-[#1C9A6C]"
            >
              <AudioLines size={13} /> Upload call audio
            </label>
            {audioFile && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1D2433] bg-[#F7F4EE] border border-[#E7E2D8] rounded-lg px-2 py-1.5">
                <FileText size={11} className="text-[#1C9A6C]" />
                <span className="max-w-[160px] truncate">{audioFile.name}</span>
                <button type="button" onClick={() => setAudioFile(null)} title="Remove audio" className="text-[#6B7385] hover:text-[#D14343]">
                  <X size={12} />
                </button>
              </span>
            )}
            <span className="text-[10px] text-[#6B7385]">MP3 / WAV / M4A / OGG / WEBM · max 50 MB</span>
          </div>
          <div className="text-[10px] font-semibold text-[#6B7385] mb-1">Transcript (filled from audio — editable)</div>
          <textarea
            value={testTranscript}
            onChange={(e) => setTestTranscript(e.target.value)}
            placeholder="Paste a sample call transcript, or upload a call audio file above..."
            className="w-full px-3 py-2 rounded-xl border border-[#E7E2D8] text-xs resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={handleTestPrompt}
              disabled={testing || audioTesting || !clientId || !assembledPrompt.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#3457D5] text-white text-xs font-semibold hover:bg-[#2a45b0] transition disabled:opacity-50"
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
              Run Test
            </button>
            <button
              onClick={handleAudioTest}
              disabled={audioTesting || testing || !clientId || !audioFile || !assembledPrompt.trim()}
              title="Transcribe the uploaded audio with STT, then audit it with this prompt"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#1C9A6C] text-white text-xs font-semibold hover:bg-[#18885E] transition disabled:opacity-50"
            >
              {audioTesting ? <Loader2 size={13} className="animate-spin" /> : <AudioLines size={13} />}
              {audioTesting ? 'Transcribing & testing…' : 'Transcribe & Test Audio'}
            </button>
          </div>
          {testResult && (
            <div className="mt-4 space-y-2">
              {testResult.error && <div className="text-xs text-[#D14343] font-semibold">Error: {testResult.error}</div>}
              {testResult.transcript && (
                <div className="text-xs text-[#1D2433]">
                  <div className="font-semibold mb-1">Transcribed transcript:</div>
                  <div className="bg-[#F7F4EE] rounded-lg p-2 text-[10px] whitespace-pre-wrap max-h-24 overflow-y-auto">{testResult.transcript}</div>
                </div>
              )}
              {testResult.result && Object.keys(testResult.result).length > 0 && (
                <div className="text-xs text-[#1D2433]">
                  <div className="font-semibold mb-1">Output:</div>
                  <pre className="bg-[#F7F4EE] rounded-lg p-2 text-[10px] overflow-x-auto whitespace-pre-wrap max-h-40">{JSON.stringify(testResult.result, null, 2)}</pre>
                </div>
              )}
              {testResult.result?.summary && (
                <div className="text-xs text-[#1D2433]"><span className="font-semibold">Summary:</span> {testResult.result.summary}</div>
              )}
              {testResult.note && <div className="text-[10px] text-[#6B7385]">{testResult.note}</div>}
            </div>
          )}
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
      <div id="prompt-builder-sections">{nav}</div>

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
                <SectionHeading icon={GitBranch} title="Build Workflow" desc="Follow the five progress-driven steps at the top of this page." />
                <div className="text-xs text-[#6B7385]">
                  Start with documents, generate a draft, customise the sections, run a successful test, then save and activate. Each step is marked complete automatically.
                </div>
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
