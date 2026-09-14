import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { Card, SectionTitle, ProgressBar, SeverityBadge } from '../components/shared.jsx'
import AudioPlayer from '../components/AudioPlayer.jsx'
import { useAudioPlayer } from '../hooks/useAudioPlayer.js'
import { getCallDetail } from '../api/client.js'
import { ArrowLeft, CheckCircle2, AlertTriangle, Search, Play, VolumeX, RefreshCw } from 'lucide-react'

const markerColor = { info: '#3457D5', amber: '#C9862B', red: '#D14343', green: '#1C9A6C' }

function toSec(str) {
  const p = String(str || '0:00').split(':').map(Number)
  return p.length === 2 ? p[0] * 60 + p[1] : (Number.isNaN(p[0]) ? 0 : p[0])
}

export default function CallDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [call, setCall] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [transcriptSearch, setTranscriptSearch] = useState('')
  const [activeLineId, setActiveLineId] = useState(null)
  const transcriptRef = useRef(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    getCallDetail(id)
      .then((d) => { setCall(d); setLoading(false) })
      .catch((e) => { setError(e.response?.data?.detail || e.message || 'Failed to load call'); setLoading(false) })
  }, [id])

  useEffect(() => { load() }, [load])

  const { currentTime, duration, playing, volume, rate, setVolume, setRate, toggle, seek, seekByTimestamp, unavailable } =
    useAudioPlayer({ src: call?.recording_path, durationSec: call?.duration_sec ?? 0 })

  const scoreEntries = useMemo(
    () => (call ? Object.entries(call.scores || {}).filter(([k]) => k !== 'overall') : []),
    [call],
  )

  const filteredTranscript = useMemo(
    () => (call?.transcript || []).filter((line) =>
      !transcriptSearch || (line.text || '').toLowerCase().includes(transcriptSearch.toLowerCase())
    ),
    [call, transcriptSearch],
  )

  // Determine which transcript line is currently "active" based on current time
  const activeIndex = useMemo(() => {
    if (!call) return -1
    let closest = -1
    call.transcript.forEach((line, i) => {
      if (toSec(line.time) <= currentTime + 0.5) closest = i
    })
    return closest
  }, [currentTime, call])

  // Auto-scroll active transcript line into view
  useEffect(() => {
    if (activeLineId == null) return
    const el = transcriptRef.current?.querySelector(`[data-line-id="${activeLineId}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeLineId])

  const highlightLine = (line) => {
    const key = `${line.speaker}-${line.time}`
    setActiveLineId(key)
    seekByTimestamp(line.time)
  }

  // map active index to highlighted line (respects live duration)
  const liveActiveKey = activeIndex >= 0 && call
    ? `${call.transcript[activeIndex].speaker}-${call.transcript[activeIndex].time}`
    : null

  const goTo = (label, timeStr) => {
    setActiveLineId(null)
    seekByTimestamp(timeStr)
  }

  const agent = call ? {
    id: call.agent_id || '—',
    name: call.agent_name || call.agent_id || 'Unknown Agent',
    team: call.team || '—',
    calls: call.agent_calls || 0,
    avg_score: call.scores?.overall ?? 0,
    risk: call.risk || 'Medium',
    coaching_assigned: call.coaching?.status || '—',
    compliance: call.scores?.compliance ?? 0,
  } : null

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw size={26} className="text-[#3457D5] animate-spin" />
      </div>
    )
  }

  if (error || !call) {
    return (
      <div className="flex flex-col items-center justify-center py-24 space-y-3">
        <p className="text-sm text-[#D14343] font-medium">{error || 'Call not found'}</p>
        <button onClick={load} className="text-xs font-semibold text-[#3457D5] hover:underline">Retry</button>
      </div>
    )
  }

  const effectiveDuration = call.duration_sec || duration || 0
  const durationLabel = `${Math.floor(effectiveDuration / 60)}m ${effectiveDuration % 60}s`

  return (
    <div className="space-y-6">
      <Link to="/calls" className="inline-flex items-center gap-1.5 text-sm text-[#6B7385] hover:text-[#1D2433] font-medium">
        <ArrowLeft size={15} /> Back to Call Explorer
      </Link>

      {/* Call Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-[#1D2433]">{call.id}</h2>
            <SeverityBadge level={call.risk} />
          </div>
          <p className="text-sm text-[#6B7385] mt-0.5">
            {call.agent_name} · {call.customer} · {call.queue} · {call.project} · {durationLabel}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate(`/coaching`)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[#E7E2D8] hover:border-[#3457D5] transition">
            Assign Coaching
          </button>
          <button onClick={() => navigate('/incidents')} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#D14343] text-white hover:opacity-90 transition">
            Report Incident
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          {/* Audio Player */}
          <Card className="!p-0">
            <AudioPlayer
              duration={duration}
              currentTime={currentTime}
              playing={playing}
              onToggle={toggle}
              onSeek={seek}
              markers={(call.timeline || []).map((ev) => ({ time: toSec(ev.time), label: ev.label, level: ev.level }))}
              volume={volume}
              onVolume={setVolume}
              rate={rate}
              onRate={setRate}
            />
            {call.recording_path && (
              <p className="px-4 pb-3 text-[10px] text-[#6B7385] break-all">
                Recording: {call.recording_path}
                {unavailable && <span className="text-[#C9862B]"> · (unreachable — simulating playback)</span>}
              </p>
            )}
          </Card>

          {/* AI Conversation Timeline */}
          <Card>
            <SectionTitle>AI Conversation Timeline</SectionTitle>
            <div className="flex text-xs gap-2 mb-3 text-[#6B7385]">
              <span>Click any event to jump &amp; play that segment</span>
            </div>
            <div className="relative pt-2 pb-2 px-2">
              <div className="absolute left-4 right-4 top-6 h-1 bg-[#F0EDE4] rounded-full" />
              <div className="flex justify-between relative">
                {(call.timeline || []).map((ev, i) => {
                  const next = i + 1 < call.timeline.length ? toSec(call.timeline[i + 1].time) : effectiveDuration
                  const isActive = currentTime >= toSec(ev.time) && currentTime < next
                  return (
                    <button
                      key={i}
                      onClick={() => goTo(ev.label, ev.time, ev.level)}
                      className="flex flex-col items-center relative group"
                      title={`Play ${ev.label} at ${ev.time}`}
                    >
                      <span className={`text-[10px] mb-1 ${isActive ? 'font-bold text-[#1D2433]' : 'text-[#6B7385]'}`}>{ev.time}</span>
                      <span
                        className={`w-4 h-4 rounded-full border-2 border-white shadow cursor-pointer z-10 transition-transform ${isActive ? 'scale-150' : 'group-hover:scale-125'}`}
                        style={{ background: markerColor[ev.level] }}
                      />
                      <span className={`text-[10px] font-medium mt-1 w-16 text-center ${isActive ? 'text-[#3457D5]' : 'text-[#1D2433]'}`}>{ev.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </Card>

          {/* Transcript */}
          <Card>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-[15px] font-semibold text-[#1D2433]">Transcript</h3>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#6B7385]" />
                  <input
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    placeholder="Search transcript..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg bg-[#F7F4EE] border border-[#E7E2D8] focus:outline-none focus:ring-2 focus:ring-[#3457D5]/30 w-48"
                  />
                </div>
              </div>
            </div>
            <div ref={transcriptRef} className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {filteredTranscript.map((line) => {
                const key = `${line.speaker}-${line.time}`
                const isActive = key === liveActiveKey || key === activeLineId
                const isSilence = !line.text || !line.text.trim()
                return (
                  <button
                    key={key}
                    data-line-id={key}
                    onClick={() => highlightLine(line)}
                    className={`w-full text-left flex ${line.speaker === 'agent' ? 'justify-start' : 'justify-end'} group`}
                    title={`Play from ${line.time}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm transition-all cursor-pointer ${
                        line.speaker === 'agent' ? 'bg-[#EEF1FE] text-[#1D2433]' : 'bg-[#F7F4EE] text-[#1D2433] border border-[#E7E2D8]'
                      } ${line.emotion === 'negative' || line.emotion === 'frustrated' ? 'ring-1 ring-[#D14343]/40' : ''} ${
                        isActive ? 'ring-2 ring-[#3457D5] shadow-md' : 'group-hover:ring-1 group-hover:ring-[#3457D5]/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold uppercase text-[#6B7385]">{line.speaker}</span>
                        <span className="text-[10px] text-[#6B7385]">{line.time}</span>
                        {(line.emotion === 'negative' || line.emotion === 'frustrated') && (
                          <span className="text-[10px] font-semibold text-[#D14343]">● {line.emotion}</span>
                        )}
                        {isActive && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-[#3457D5]">
                            {playing ? (<><Play size={10} /> playing</>) : (<><VolumeX size={10} /> paused</>)}
                          </span>
                        )}
                      </div>
                      {isSilence ? <span className="italic text-[#6B7385]">[silence]</span> : line.text}
                    </div>
                  </button>
                )
              })}
              {filteredTranscript.length === 0 && (
                <p className="text-xs text-[#6B7385] py-6 text-center">No transcript lines match your search.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          {/* AI Score */}
          <Card>
            <SectionTitle>AI Conversation Score</SectionTitle>
            <div className="text-center mb-4">
              <div className="text-4xl font-extrabold text-[#1D2433]">{call.scores?.overall ?? 0}<span className="text-lg">%</span></div>
              <div className="text-xs text-[#6B7385]">Overall Conversation Score</div>
            </div>
            {scoreEntries.map(([k, v]) => (
              <ProgressBar key={k} label={k.charAt(0).toUpperCase() + k.slice(1)} value={v || 0} />
            ))}
          </Card>

          {/* AI Detected Behaviours */}
          <Card>
            <SectionTitle>AI Detected Behaviours</SectionTitle>
            <p className="text-[10px] text-[#6B7385] mb-2">Click a detection to play its segment</p>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {(call.behaviours || []).length === 0 && (
                <p className="text-xs text-[#6B7385] py-4 text-center">No behaviours detected on this call.</p>
              )}
              {(call.behaviours || []).map((b, i) => {
                const time = toSec(b.timestamp)
                const isActive = Math.abs(currentTime - time) < 1
                return (
                  <button
                    key={i}
                    onClick={() => seekByTimestamp(b.timestamp)}
                    title={`Play ${b.label} at ${b.timestamp}`}
                    className={`w-full flex items-start gap-2 p-3 rounded-xl border transition text-left ${
                      isActive ? 'border-[#3457D5] bg-[#EEF1FE]/40' : 'border-[#E7E2D8] hover:border-[#3457D5]/30'
                    }`}
                  >
                    <span className="mt-0.5 shrink-0">
                      {b.severity === 'Critical' ? (
                        <AlertTriangle size={16} className="text-[#D14343]" />
                      ) : (
                        <CheckCircle2 size={16} className="text-[#C9862B]" />
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#1D2433]">{b.label}</span>
                        <span className="text-[9px] font-mono text-[#3457D5]">{b.timestamp}</span>
                      </span>
                      <span className="block text-xs text-[#6B7385] mt-0.5">Confidence {b.confidence}% · at {b.timestamp}</span>
                    </span>
                    <SeverityBadge level={b.severity} />
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Agent Details */}
          {agent && (
            <Card>
              <SectionTitle>Agent Details</SectionTitle>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#3457D5]/15 flex items-center justify-center text-sm font-bold text-[#3457D5]">{agent.id}</div>
                <div>
                  <div className="text-sm font-semibold text-[#1D2433]">{agent.name}</div>
                  <div className="text-[10px] text-[#6B7385]">{agent.team} · {agent.calls} calls</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-[#F7F4EE]">
                  <div className="text-[#6B7385]">Avg Score</div>
                  <div className="font-bold text-[#1D2433]">{agent.avg_score}%</div>
                </div>
                <div className="p-2 rounded-lg bg-[#F7F4EE]">
                  <div className="text-[#6B7385]">Risk</div>
                  <div className="font-bold"><SeverityBadge level={agent.risk} /></div>
                </div>
                <div className="p-2 rounded-lg bg-[#F7F4EE]">
                  <div className="text-[#6B7385]">Coaching</div>
                  <div className="font-bold text-[#1D2433]">{agent.coaching_assigned}</div>
                </div>
                <div className="p-2 rounded-lg bg-[#F7F4EE]">
                  <div className="text-[#6B7385]">Compliance</div>
                  <div className="font-bold text-[#1D2433]">{agent.compliance}%</div>
                </div>
              </div>
            </Card>
          )}

          {/* Coaching Recommendation */}
          {call.coaching && (
            <Card className="border-l-4 border-l-[#3457D5]">
              <SectionTitle>Coaching Recommendation</SectionTitle>
              <p className="text-xs text-[#6B7385] mb-2">{call.coaching.recommendation}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#1C9A6C]">{call.coaching.estimated_improvement}</span>
                <button onClick={() => navigate('/coaching')} className="text-xs font-semibold text-[#3457D5] hover:underline">Assign Training →</button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}