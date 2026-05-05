import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_TAPS = 4     // keep only last 4 timestamps (→ 3 intervals → average)
const RESET_MS = 3000  // reset after 3 s of inactivity

export default function TapTempo() {
  const [bpm, setBpm] = useState<number | null>(null)
  const [active, setActive] = useState(false)
  const taps = useRef<number[]>([])
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleReset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
    resetTimer.current = setTimeout(() => {
      taps.current = []
      setBpm(null)
      setActive(false)
    }, RESET_MS)
  }, [])

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current)
  }, [])

  const handleTap = useCallback(() => {
    const now = Date.now()

    // If the gap is too long, start fresh
    if (taps.current.length > 0 && now - taps.current[taps.current.length - 1] > RESET_MS) {
      taps.current = []
      setBpm(null)
    }

    taps.current.push(now)
    if (taps.current.length > MAX_TAPS) taps.current = taps.current.slice(-MAX_TAPS)

    if (taps.current.length >= 2) {
      let sum = 0
      for (let i = 1; i < taps.current.length; i++) sum += taps.current[i] - taps.current[i - 1]
      const avg = sum / (taps.current.length - 1)
      setBpm(Math.round(60000 / avg))
    }

    setActive(true)
    scheduleReset()
  }, [scheduleReset])

  return (
    <button
      onClick={handleTap}
      className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-colors flex-shrink-0 select-none ${
        active
          ? 'border-green-600 text-green-400'
          : 'border-neutral-600 text-neutral-400 hover:border-neutral-400 hover:text-neutral-200'
      }`}
      title="Tap to measure BPM (average of last 4 taps)"
    >
      {/* Metronome symbol */}
      <svg width="13" height="14" viewBox="0 0 13 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <polygon points="2,13 11,13 8,1 5,1" stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
        <line x1="6.5" y1="13" x2="6.5" y2="4" stroke="currentColor" strokeWidth="1.2"/>
        <line x1="4" y1="9" x2="9" y2="6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span className="text-xs tabular-nums w-7 text-right">
        {bpm !== null ? bpm : '—'}
      </span>
    </button>
  )
}
