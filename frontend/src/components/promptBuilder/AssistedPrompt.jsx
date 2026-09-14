import React, { useState } from 'react'
import { TextArea, Field, IconBtn } from './ui.jsx'
import { Sparkles, Check, X, Plus, Wand2 } from 'lucide-react'

const uid = () => `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export default function AssistedPrompt({ onAddRule }) {
  const [input, setInput] = useState('')
  const [generated, setGenerated] = useState(null)
  const [thinking, setThinking] = useState(false)
  const [history, setHistory] = useState([])

  const generate = () => {
    if (!input.trim()) return
    setThinking(true)
    setGenerated(null)
    setTimeout(() => {
      const rule = {
        id: uid(),
        source: input.trim(),
        rule: `The agent must ${input.trim().replace(/\.$/, '').replace(/^(make sure the ai|make sure|ensure|the ai should|the ai must|check)[ ,]+/i, '').toLowerCase()} before proceeding to the next step.`,
        criteria: `Detect whether the agent confirmed the expected condition in the transcript before providing a resolution. Assign PASS if confirmed, PARTIAL if only partially confirmed, FAIL if omitted.`,
      }
      setGenerated(rule)
      setThinking(false)
    }, 900)
  }

  const accept = () => {
    if (generated) {
      onAddRule(generated)
      setHistory((h) => [{ ...generated, accepted: true }, ...h])
    }
    setGenerated(null)
    setInput('')
  }

  const reject = () => {
    setHistory((h) => [{ ...generated, accepted: false }, ...h])
    setGenerated(null)
    setInput('')
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-[#EEF1FE] flex items-center justify-center text-[#3457D5] shrink-0">
          <Wand2 size={15} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-[#1D2433]">Assisted Prompt</h4>
          <p className="text-[11px] text-[#6B7385]">Convert natural-language instructions into a structured rule.</p>
        </div>
      </div>

      <Field label="Describe the instruction in plain English">
        <div className="flex gap-2">
          <TextArea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. Make sure the AI checks whether the agent confirmed the customer's issue before providing a solution."
          />
          <button
            onClick={generate}
            disabled={!input.trim() || thinking}
            className="shrink-0 inline-flex items-center gap-1.5 bg-[#3457D5] text-white text-xs font-semibold px-3 py-2 rounded-lg hover:bg-[#2E4AB8] disabled:opacity-50 transition"
          >
            <Sparkles size={13} /> {thinking ? 'Generating...' : 'Generate'}
          </button>
        </div>
      </Field>

      {generated && (
        <div className="mt-3 border border-[#3457D5]/40 bg-[#EEF1FE]/40 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-[#3457D5]">Generated rule</span>
            <div className="flex gap-1.5">
              <button onClick={accept} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-[#1C9A6C] text-white px-2.5 py-1 rounded-lg hover:opacity-90">
                <Check size={12} /> Accept
              </button>
              <button onClick={reject} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-white border border-[#E7E2D8] text-[#6B7385] px-2.5 py-1 rounded-lg hover:border-[#D14343] hover:text-[#D14343]">
                <X size={12} /> Reject
              </button>
            </div>
          </div>
          <div className="text-xs font-medium text-[#1D2433] mb-1">{generated.rule}</div>
          <div className="text-[11px] text-[#6B7385]">{generated.criteria}</div>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#6B7385] mb-2">Assisted prompt history</div>
          <div className="space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-start gap-2 border border-[#E7E2D8] rounded-lg px-3 py-2">
                <span className={`mt-1 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${h.accepted ? 'bg-[#1C9A6C]' : 'bg-[#D14343]'}`}>
                  {h.accepted ? <Check size={10} className="text-white" /> : <X size={10} className="text-white" />}
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-[#1D2433]">{h.rule}</div>
                  <div className="text-[10px] text-[#6B7385] truncate">{h.source}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
