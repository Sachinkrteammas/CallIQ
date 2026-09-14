import React from 'react'
import { Play, Pause, SkipBack, SkipForward, Volume2, Gauge } from 'lucide-react'

function fmt(sec) {
  sec = Math.max(0, Math.floor(sec || 0))
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatTime(sec) {
  return fmt(sec)
}

export default function AudioPlayer({
  duration,
  currentTime,
  playing,
  onToggle,
  onSeek,
  markers = [],
  volume,
  onVolume,
  rate,
  onRate,
}) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  const seekFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    onSeek && onSeek(Math.max(0, Math.min(duration, ratio * duration)))
  }

  const activeMarker = markers.find((m) => currentTime >= m.time && currentTime < m.time + 1)

  return (
    <div className="rounded-xl border border-[#E7E2D8] p-4">
      {/* Transport */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={onToggle}
          className="w-11 h-11 rounded-full bg-[#16213E] text-white flex items-center justify-center hover:bg-[#1B3157] transition shrink-0"
        >
          {playing ? <Pause size={19} /> : <Play size={19} className="ml-0.5" />}
        </button>
        <div className="flex items-center gap-1 text-[#6B7385]">
          <button onClick={() => onSeek && onSeek(Math.max(0, currentTime - 10))} className="p-1.5 hover:text-[#1D2433]"><SkipBack size={16} /></button>
          <button onClick={() => onSeek && onSeek(Math.min(duration, currentTime + 10))} className="p-1.5 hover:text-[#1D2433]"><SkipForward size={16} /></button>
        </div>

        {/* Waveform / progress */}
        <div className="flex-1">
          <div
            className="relative h-10 rounded-lg bg-[#F7F4EE] overflow-hidden cursor-pointer select-none"
            onMouseDown={seekFromEvent}
            title="Click to seek"
          >
            {/* waveform bars */}
            <div className="absolute inset-0 flex items-center gap-[2px] px-1 opacity-60">
              {Array.from({ length: 90 }).map((_, i) => {
                const h = 8 + ((i * 37) % 18) + ((i % 5) * 3)
                const start = i / 90
                const end = (i + 1) / 90
                const filled = pct >= start
                return (
                  <span
                    key={i}
                    style={{ height: `${h}px` }}
                    className={`flex-1 rounded-full ${filled ? 'bg-[#3457D5]/70' : 'bg-[#D8D2C4]'}`}
                  />
                )
              })}
            </div>

            {/* markers on the timeline */}
            {markers.map((m, i) => {
              const left = (m.time / duration) * 100
              const color = { green: '#1C9A6C', amber: '#C9862B', red: '#D14343', info: '#3457D5' }[m.level] || '#3457D5'
              return (
                <span
                  key={i}
                  onClick={(e) => { e.stopPropagation(); onSeek && onSeek(m.time) }}
                  title={`${m.label} (${fmt(m.time)})`}
                  className="absolute top-1/2 -translate-y-1/2 w-[3px] h-8 rounded-full cursor-pointer hover:scale-y-125 transition"
                  style={{ left: `${left}%`, background: color }}
                />
              )
            })}
          </div>
          <div className="flex justify-between text-[10px] text-[#6B7385] mt-1 font-medium">
            <span className={activeMarker ? 'font-bold text-[#1D2433]' : ''}>
              {fmt(currentTime)}{activeMarker ? ` · ${activeMarker.label}` : ''}
            </span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        {/* volume */}
        <div className="flex items-center gap-1.5 text-[#6B7385]">
          <Volume2 size={15} />
          <input
            type="range" min={0} max={1} step={0.01}
            value={volume}
            onChange={(e) => onVolume && onVolume(Number(e.target.value))}
            className="w-16 accent-[#3457D5]"
          />
        </div>

        {/* speed */}
        <button
          onClick={() => onRate && onRate(rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1)}
          className="flex items-center gap-1 text-xs font-semibold text-[#6B7385] hover:text-[#1D2433] px-2 py-1 rounded-lg border border-[#E7E2D8]"
        >
          <Gauge size={13} /> {rate}x
        </button>
      </div>
    </div>
  )
}
