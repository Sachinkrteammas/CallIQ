import React, { useState } from 'react'
import { assemblePrompt } from './logic.js'
import { Copy, Check, Download, RefreshCw, Eye } from 'lucide-react'

export default function PromptPreview({ config }) {
  const [copied, setCopied] = useState(false)
  const [mode, setMode] = useState('preview')

  const prompt = assemblePrompt(config)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
    } catch (e) {
      /* clipboard unavailable */
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const download = () => {
    const blob = new Blob([prompt], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(config.name || 'prompt').replace(/\s+/g, '_').toLowerCase()}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border border-[#E7E2D8] rounded-xl flex flex-col" style={{ height: '100%' }}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#E7E2D8] bg-white rounded-t-xl">
        <div className="flex items-center gap-2">
          <Eye size={15} className="text-[#3457D5]" />
          <span className="text-sm font-bold text-[#1D2433]">Assembled Prompt</span>
          <span className="text-[10px] text-[#6B7385]">auto-generated</span>
        </div>
        <div className="flex gap-1 bg-[#F7F4EE] border border-[#E7E2D8] rounded-lg p-0.5">
          {['preview', 'raw'].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition ${mode === m ? 'bg-white shadow-sm text-[#1D2433]' : 'text-[#6B7385]'}`}
            >
              {m === 'preview' ? 'Preview' : 'Raw'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-3 overflow-auto" style={{ minHeight: '400px', maxHeight: '70vh' }}>
        {mode === 'raw' ? (
          <textarea
            readOnly
            value={prompt}
            className="w-full h-full min-h-[380px] text-[11px] font-mono leading-relaxed text-[#1D2433] bg-[#F7F4EE] border border-[#E7E2D8] rounded-lg p-3 focus:outline-none resize-none"
          />
        ) : (
          <div className="text-[11px] leading-relaxed text-[#1D2433] bg-[#F7F4EE] border border-[#E7E2D8] rounded-lg p-3 whitespace-pre-wrap font-mono">
            {prompt}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-4 py-3 border-t border-[#E7E2D8] rounded-b-xl bg-white">
        <button
          onClick={copy}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition ${copied ? 'bg-[#1C9A6C] text-white' : 'bg-[#16213E] text-white hover:bg-[#1B3157]'}`}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy Prompt'}
        </button>
        <button
          onClick={download}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-white border border-[#E7E2D8] text-[#1D2433] hover:border-[#3457D5] hover:text-[#3457D5] transition"
        >
          <Download size={13} /> Export
        </button>
        <span className="ml-auto text-[10px] text-[#6B7385] font-medium flex items-center gap-1">
          <RefreshCw size={11} /> Updates as you configure
        </span>
      </div>
    </div>
  )
}
