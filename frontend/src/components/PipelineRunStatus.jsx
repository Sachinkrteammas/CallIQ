import React, { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Radio, RefreshCw, X } from 'lucide-react'
import { getPipelineRun } from '../api/client.js'

// Stage values written by backend/app/routers/ai_prompts.py::_run_pipeline_for_client
const STAGES = [
  { stage: 'fetching', label: 'Fetching calls', count: 'fetched' },
  { stage: 'transcribing', label: 'Transcribing recordings', count: 'transcribed' },
  { stage: 'auditing', label: 'Running AI audit', count: 'audited' },
]

export const pipelineStageLabel = (stage) => {
  if (stage === 'queued') return 'Queued'
  if (stage === 'done') return 'Wrapping up'
  return STAGES.find((s) => s.stage === stage)?.label || 'Starting'
}

const stageOrder = (stage, status) => {
  const index = STAGES.findIndex((s) => s.stage === stage)
  if (index !== -1) return index
  if (stage === 'done') return status === 'failed' ? STAGES.length - 1 : STAGES.length
  return 0
}

/**
 * Live status card for the fetch -> STT -> audit pipeline started by prompt
 * activation. Polls the run record so "transcribing" / "auditing" and the
 * processed counts keep updating while the user stays on the page.
 */
export default function PipelineRunStatus({ runId, pollMs = 2000, onComplete }) {
  const [run, setRun] = useState(null)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [now, setNow] = useState(Date.now())
  const onCompleteRef = useRef(onComplete)

  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])

  useEffect(() => {
    if (!runId) return undefined
    let cancelled = false
    let timer = null

    const refresh = async () => {
      try {
        const data = await getPipelineRun(runId)
        if (cancelled) return
        setRun(data)
        setUpdatedAt(Date.now())
        setError(null)
        window.dispatchEvent(new CustomEvent('calliq:pipeline-progress', { detail: data }))
        if (['completed', 'failed'].includes(data.status)) {
          window.dispatchEvent(new CustomEvent('calliq:pipeline-complete', { detail: data }))
          if (onCompleteRef.current) onCompleteRef.current(data)
          return
        }
        timer = window.setTimeout(refresh, pollMs)
      } catch (e) {
        if (cancelled) return
        setError('Status unavailable — retrying…')
        timer = window.setTimeout(refresh, Math.max(pollMs, 3000))
      }
    }

    refresh()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [runId, pollMs])

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(tick)
  }, [])

  if (!runId) return null

  const running = run && ['queued', 'running'].includes(run.status)
  const current = stageOrder(run?.stage, run?.status)
  const allDone = run?.status === 'completed'
  const secondsAgo = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null
  const updatedLabel = secondsAgo === null
    ? 'Connecting…'
    : secondsAgo < 5 ? 'Updated just now' : `Updated ${secondsAgo}s ago`

  return (
    <div className="rounded-xl border border-[#E7E2D8] bg-[#FCFBF8] px-4 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {running ? (
            <Loader2 size={14} className="animate-spin text-[#3457D5]" />
          ) : run?.status === 'failed' ? (
            <X size={14} className="text-[#D14343]" />
          ) : run?.status === 'completed' ? (
            <Check size={14} className="text-[#1C9A6C]" />
          ) : (
            <Radio size={14} className="text-[#6B7385]" />
          )}
          <span className="text-xs font-bold text-[#1D2433]">
            {running ? `Pipeline running · ${pipelineStageLabel(run?.stage)}…` :
              run?.status === 'failed' ? 'Pipeline finished with errors' :
                run?.status === 'completed' ? 'Pipeline completed' : 'Pipeline status'}
          </span>
          <span className="text-[10px] text-[#6B7385]">· Run #{runId}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-[#6B7385]">
          {running && <span className="w-1.5 h-1.5 rounded-full bg-[#1C9A6C] animate-pulse" />}
          {updatedLabel}
          <RefreshCw size={10} className={running ? 'animate-spin' : ''} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
        {STAGES.map((step, index) => {
          const done = allDone || index < current
          const active = running && index === current && run?.stage !== 'queued'
          const failed = run?.status === 'failed' && index === current
          const count = Number(run?.[step.count] || 0)
          return (
            <div key={step.stage} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border text-[11px] ${
              failed ? 'border-[#D14343]/40 bg-[#FBE9E9] text-[#D14343]' :
                done ? 'border-[#1C9A6C]/30 bg-[#E7F7EF] text-[#1C9A6C]' :
                  active ? 'border-[#3457D5]/40 bg-[#EEF1FE] text-[#3457D5]' :
                    'border-[#E7E2D8] text-[#6B7385]'
            }`}>
              {done ? <Check size={12} className="flex-shrink-0" /> :
                failed ? <X size={12} className="flex-shrink-0" /> :
                  active ? <Loader2 size={12} className="animate-spin flex-shrink-0" /> :
                    <span className="w-3 h-3 rounded-full border border-current flex-shrink-0" />}
              <span className="font-semibold truncate">{step.label}</span>
              {(done || active || failed) && count > 0 && (
                <span className="ml-auto font-bold">{count} calls</span>
              )}
            </div>
          )
        })}
      </div>

      {run?.status === 'failed' && run?.error && (
        <div className="mt-2 text-[11px] text-[#D14343] break-words">{run.error}</div>
      )}
      {error && <div className="mt-2 text-[11px] text-[#C9862B]">{error}</div>}
    </div>
  )
}
