import { useEffect, useRef, useState, useCallback } from 'react'

function toSec(timeStr) {
  const parts = String(timeStr || '0:00').split(':').map(Number)
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return Number.isNaN(parts[0]) ? 0 : parts[0]
}

export function useAudioPlayer({ src, durationSec = 0 }) {
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(Number(durationSec) || 0)
  const [volume, setVolume] = useState(0.8)
  const [rate, setRate] = useState(1)
  const [unavailable, setUnavailable] = useState(!src)

  const audioRef = useRef(null)
  const rafRef = useRef(null)
  const lastTsRef = useRef(null)
  const currentRef = useRef(0)
  const playingRef = useRef(false)
  const durationRef = useRef(Number(durationSec) || 0)
  const rateRef = useRef(1)
  const simRef = useRef(false)

  durationRef.current = Number(durationSec) || 0
  rateRef.current = rate

  // Load the real recording
  useEffect(() => {
    if (!src) {
      setUnavailable(true)
      return
    }
    const audio = new Audio(src)
    audio.preload = 'metadata'
    audio.volume = volume
    audio.playbackRate = rate
    audioRef.current = audio
    setUnavailable(false)
    simRef.current = false

    const onMeta = () => {
      if (audio.duration && isFinite(audio.duration)) {
        durationRef.current = audio.duration
        setDuration(audio.duration)
      }
    }
    const onTime = () => {
      currentRef.current = audio.currentTime
      setCurrentTime(audio.currentTime)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnd = () => {
      setPlaying(false)
      playingRef.current = false
    }
    const onError = () => {
      setUnavailable(true)
      simRef.current = true
    }

    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('durationchange', onMeta)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('error', onError)

    return () => {
      audio.pause()
      audio.src = ''
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('durationchange', onMeta)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('error', onError)
      audioRef.current = null
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      simRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate
  }, [rate])

  // Simulated clock — used as a fallback when the recording cannot be played
  const stopSim = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    lastTsRef.current = null
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
        stopSim()
        return
      }
    }
    lastTsRef.current = ts
    rafRef.current = requestAnimationFrame(tick)
  }, [stopSim])

  const startSim = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    lastTsRef.current = null
    rafRef.current = requestAnimationFrame(tick)
  }, [tick])

  const play = useCallback(() => {
    if (!src || simRef.current) {
      if (currentRef.current >= durationRef.current - 0.01) {
        currentRef.current = 0
        setCurrentTime(0)
      }
      playingRef.current = true
      setPlaying(true)
      startSim()
      return
    }
    if (audioRef.current) {
      audioRef.current.play().catch(() => {
        simRef.current = true
        playingRef.current = true
        setPlaying(true)
        startSim()
      })
    }
  }, [src, startSim])

  const pause = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
    stopSim()
    if (audioRef.current && !simRef.current) audioRef.current.pause()
  }, [stopSim])

  const toggle = useCallback(() => {
    if (playingRef.current) pause()
    else play()
  }, [play, pause])

  const seek = useCallback((t) => {
    const clamped = Math.max(0, Math.min(durationRef.current, Number(t) || 0))
    currentRef.current = clamped
    setCurrentTime(clamped)
    if (audioRef.current && !simRef.current) {
      try {
        audioRef.current.currentTime = clamped
      } catch (e) {
        /* ignore */
      }
    } else if (simRef.current && playingRef.current) {
      startSim()
    }
  }, [startSim])

  const seekAndPlay = useCallback((t) => {
    seek(t)
    play()
  }, [seek, play])

  useEffect(() => () => stopSim(), [stopSim])

  return {
    currentTime,
    duration,
    playing,
    volume,
    setVolume,
    rate,
    setRate,
    unavailable,
    toggle,
    play,
    pause,
    seek,
    seekAndPlay,
    seekByTimestamp: (timeStr) => seekAndPlay(toSec(timeStr)),
  }
}