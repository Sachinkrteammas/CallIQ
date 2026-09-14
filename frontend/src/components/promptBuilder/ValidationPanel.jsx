import React from 'react'
import { validatePrompt } from './logic.js'
import { AlertTriangle, CheckCircle, Info } from 'lucide-react'

export default function ValidationPanel({ config }) {
  const { errors, warnings } = validatePrompt(config)
  const isValid = errors.length === 0

  return (
    <div className="border border-[#E7E2D8] rounded-xl overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-2.5 ${isValid ? 'bg-[#E7F7EF]' : 'bg-[#FBE9E9]'}`}>
        {isValid ? (
          <CheckCircle size={15} className="text-[#1C9A6C]" />
        ) : (
          <AlertTriangle size={15} className="text-[#D14343]" />
        )}
        <span className={`text-xs font-bold ${isValid ? 'text-[#1C9A6C]' : 'text-[#D14343]'}`}>
          {isValid ? 'Configuration is valid' : `${errors.length} error${errors.length > 1 ? 's' : ''} to fix`}
        </span>
        <span className="ml-auto text-[10px] text-[#6B7385] font-medium">{warnings.length} warning{warnings.length === 1 ? '' : 's'}</span>
      </div>

      {(errors.length > 0 || warnings.length > 0) && (
        <div className="p-3 space-y-2">
          {errors.map((e, i) => (
            <div key={`e${i}`} className="flex items-start gap-2 text-xs text-[#D14343]">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>{e}</span>
            </div>
          ))}
          {warnings.map((w, i) => (
            <div key={`w${i}`} className="flex items-start gap-2 text-xs text-[#C9862B]">
              <Info size={13} className="mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
      {errors.length === 0 && warnings.length === 0 && (
        <p className="p-3 text-[11px] text-[#6B7385]">No validation issues detected.</p>
      )}
    </div>
  )
}
