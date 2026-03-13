import { useEffect, useRef, useState } from 'react'
import type { SongResponse, SpotifyStatus } from '../types'
import { useSpotifyPlayer } from '../hooks/useSpotifyPlayer'
import { api } from '../api'

interface Props {
  song: SongResponse | null
  nextSong: SongResponse | null
  onNextSong: (song: SongResponse) => void
  spotifyStatus: SpotifyStatus
  onSongPlayed: () => void   // called after play so cover/duration gets refreshed
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export default function PlayerBar({ song, nextSong, onNextSong, spotifyStatus, onSongPlayed }: Props) {
  const { deviceId, isReady, playerState, stateTimestamp } =
    useSpotifyPlayer(spotifyStatus.authenticated)

  const isPlaying = playerState ? !playerState.paused : false
  const duration = song?.durationMs ?? playerState?.duration ?? 0
  const playerReady = spotifyStatus.authenticated && isReady

  // Uncontrolled slider — updated imperatively so React never fights drags
  const sliderRef = useRef<HTMLInputElement>(null)
  const isDragging = useRef(false)
  const [displayTime, setDisplayTime] = useState(0)

  // Keep latest values accessible inside the interval without re-creating it
  const playerStateRef = useRef(playerState)
  const stateTimestampRef = useRef(stateTimestamp)
  const durationRef = useRef(duration)
  useEffect(() => { playerStateRef.current = playerState }, [playerState])
  useEffect(() => { stateTimestampRef.current = stateTimestamp }, [stateTimestamp])
  useEffect(() => { durationRef.current = duration }, [duration])

  // Reset slider + label when the selected song changes, and clear the stale
  // playerState ref so the interval doesn't advance the old song's position
  // before the SDK reports the new track's state.
  useEffect(() => {
    playerStateRef.current = null
    setDisplayTime(0)
    if (sliderRef.current) sliderRef.current.value = '0'
  }, [song?.spotifyUri])

  // Sync slider + label when SDK fires a state event (seek, pause, new track)
  useEffect(() => {
    if (!playerState || isDragging.current) return
    setDisplayTime(playerState.position)
    if (sliderRef.current) sliderRef.current.value = String(Math.round(playerState.position))
  }, [playerState])

  // Advance slider + label every 500ms while playing
  useEffect(() => {
    const id = setInterval(() => {
      if (isDragging.current) return
      const state = playerStateRef.current
      if (!state || state.paused) return
      const pos = Math.min(
        state.position + (Date.now() - stateTimestampRef.current),
        durationRef.current,
      )
      setDisplayTime(pos)
      if (sliderRef.current) sliderRef.current.value = String(Math.round(pos))
    }, 500)
    return () => clearInterval(id)
  }, [])

  // Auto-play when selected song changes OR when player first becomes ready
  const lastAutoPlayUri = useRef<string | null>(null)
  useEffect(() => {
    if (!song || !playerReady || !deviceId) return
    if (lastAutoPlayUri.current === song.spotifyUri) return
    lastAutoPlayUri.current = song.spotifyUri
    startPlay(song.spotifyUri)
  }, [song?.spotifyUri, playerReady, deviceId])

  const startPlay = async (path: string) => {
    try {
      await api.play(path, deviceId ?? undefined)
      onSongPlayed()   // triggers song list reload → cover URL appears
    } catch (e) {
      console.error('Play failed:', e)
    }
  }

  const handlePlayPause = async () => {
    if (!song || !playerReady) return
    try {
      if (isPlaying) {
        await api.pause()
      } else if (playerState) {
        await api.resume()
      } else {
        await startPlay(song.spotifyUri)
      }
    } catch (e) {
      console.error('Play/pause failed:', e)
    }
  }

  const handleSeekStart = () => { isDragging.current = true }

  const handleSeekDrag = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDisplayTime(Number(e.target.value))
  }

  const handleSeekCommit = async (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    const pos = Number((e.target as HTMLInputElement).value)
    isDragging.current = false
    setDisplayTime(pos)
    await api.seek(pos)
  }

  const buttonTitle = !spotifyStatus.authenticated
    ? 'Connect Spotify to play'
    : !isReady ? 'Web player loading…'
    : isPlaying ? 'Pause' : 'Play'

  return (
    <div className="bg-neutral-800 border-t border-neutral-700 px-4 py-2">
      <div className="flex items-center gap-3 max-w-4xl mx-auto">
        <button
          onClick={handlePlayPause}
          disabled={!song || !playerReady}
          className="w-8 h-8 rounded-full bg-green-600 hover:bg-green-500 disabled:bg-neutral-600 disabled:cursor-not-allowed flex items-center justify-center text-sm flex-shrink-0 transition-colors"
          title={buttonTitle}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <div className="flex-shrink-0 w-32 min-w-0">
          {song ? (
            <>
              <div className="text-xs font-medium truncate">{song.title}</div>
              <div className="text-xs text-neutral-400 truncate">{song.artist}</div>
            </>
          ) : (
            <div className="text-xs text-neutral-500">No song selected</div>
          )}
        </div>

        <span className="text-xs text-neutral-400 flex-shrink-0 w-10 text-right">
          {formatTime(displayTime)}
        </span>

        <input
          ref={sliderRef}
          type="range"
          min={0}
          max={duration || 1}
          defaultValue={0}
          onMouseDown={handleSeekStart}
          onTouchStart={handleSeekStart}
          onChange={handleSeekDrag}
          onMouseUp={handleSeekCommit}
          onTouchEnd={handleSeekCommit}
          disabled={!playerReady}
          className="flex-1 h-1 accent-green-500 disabled:opacity-40"
        />

        <span className="text-xs text-neutral-400 flex-shrink-0 w-10">
          {duration ? formatTime(duration) : '--:--'}
        </span>

        <button
          onClick={() => nextSong && onNextSong(nextSong)}
          disabled={!nextSong}
          className="w-8 h-8 rounded-full bg-neutral-700 hover:bg-neutral-600 disabled:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-sm flex-shrink-0 transition-colors"
          title={nextSong ? `Next: ${nextSong.title}` : 'No next song'}
        >
          ⏭
        </button>

        <span className="text-xs flex-shrink-0 hidden sm:block">
          {spotifyStatus.authenticated && (
            isReady
              ? <span className="text-green-500">● Browser</span>
              : <span className="text-yellow-500">○ Loading…</span>
          )}
        </span>
      </div>
    </div>
  )
}
