import { useRef, useState, useCallback, useEffect } from 'react'

function toSec(timeStr) {
  const parts = String(timeStr || '0:00').split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number.isNaN(parts[0]) ? 0 : parts[0]
}

export function useSimulatedAudio({ durationSec }) {
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [rate, setRate] = useState(1)

  const audioCtxRef = useRef(null)
  const rafRef = useRef(null)
  const lastTsRef = useRef(null)
  const currentRef = useRef(0)
  const durationRef = useRef(durationSec || 0)
  const playingRef = useRef(false)
  const rateRef = useRef(1)

  durationRef.current = durationSec || 0
  rateRef.current = rate

  const stopEngine = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    lastTsRef.current = null
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
    }
    audioCtxRef.current = null
  }, [])

  const tick = useCallback((ts) => {
    if (lastTsRef.current != null) {
      const delta = ((ts - lastTsRef.current) / 1000) * rateRef.current
      const next = Math.min(durationRef.current, currentRef.current + delta)
      currentRef.current = next
      setCurrentTime(next)
      if (next >= durationRef.current - 0.01) {
        playingRef.current = false
        setPlaying(false)
        stopEngine()
        return
      }
    }
    lastTsRef.current = ts
    rafRef.current = requestAnimationFrame(tick)
  }, [stopEngine])

  const startEngine = useCallback((from) => {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (Ctx && !audioCtxRef.current) {
      try {
        const ctx = new Ctx()
        audioCtxRef.current = ctx
        if (ctx.state === 'suspended') ctx.resume().catch(() => {})
        const gain = ctx.createGain()
        gain.gain.value = 0.035
        gain.connect(ctx.destination)
        const noise = ctx.createBufferSource()
        noise.buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
        const data = noise.buffer.getChannelData(0)
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
        noise.loop = true
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = 600
        filter.Q.value = 0.3
        noise.connect(filter)
        filter.connect(gain)
        noise.start()
      } catch (e) {
        /* audio unavailable */
      }
    }
    currentRef.current = from || currentRef.current
    lastTsRef.current = null
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  const play = useCallback(() => {
    if (currentRef.current >= durationRef.current - 0.01) {
      currentRef.current = 0
      setCurrentTime(0)
    }
    playingRef.current = true
    setPlaying(true)
    startEngine(currentRef.current)
  }, [startEngine])

  const pause = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
    stopEngine()
  }, [stopEngine])

  const toggle = useCallback(() => {
    if (playingRef.current) pause()
    else play()
  }, [play, pause])

  const seek = useCallback((time) => {
    const t = Math.max(0, Math.min(durationRef.current, Number(time) || 0))
    currentRef.current = t
    setCurrentTime(t)
    if (playingRef.current) startEngine(t)
  }, [startEngine])

  const seekAndPlay = useCallback((time) => {
    const t = Math.max(0, Math.min(durationRef.current, Number(time) || 0))
    currentRef.current = t
    setCurrentTime(t)
    play()
  }, [play])

  useEffect(() => {
    return () => stopEngine()
  }, [stopEngine])

  return {
    currentTime,
    duration: durationSec || 0,
    playing,
    volume,
    setVolume,
    rate,
    setRate,
    toggle,
    play,
    pause,
    seek,
    seekAndPlay,
    seekByTimestamp: (timeStr) => seekAndPlay(toSec(timeStr)),
  }
}
