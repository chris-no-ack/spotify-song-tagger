import { useEffect, useRef, useState } from 'react'
import { getAccessToken } from '../spotifyAuth'

export interface SpotifyPlayerState {
  position: number
  duration: number
  paused: boolean
  trackUri: string | null
}

export interface UseSpotifyPlayerResult {
  deviceId: string | null
  isReady: boolean
  playerState: SpotifyPlayerState | null
  stateTimestamp: number   // Date.now() when playerState was last received
}

export function useSpotifyPlayer(enabled: boolean): UseSpotifyPlayerResult {
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)
  const [playerState, setPlayerState] = useState<SpotifyPlayerState | null>(null)
  const [stateTimestamp, setStateTimestamp] = useState(0)
  const playerRef = useRef<Spotify.Player | null>(null)

  useEffect(() => {
    if (!enabled) return

    // Guard against React StrictMode double-invocation
    let cancelled = false

    function initPlayer() {
      if (cancelled) return

      const player = new window.Spotify.Player({
        name: 'SpotifyTagger',
        getOAuthToken: (cb) => {
          getAccessToken()
            .then(token => cb(token))
            .catch(console.error)
        },
        volume: 0.8,
      })

      player.addListener('ready', ({ device_id }) => {
        if (cancelled) return
        setDeviceId(device_id)
        setIsReady(true)
      })

      player.addListener('not_ready', () => {
        setIsReady(false)
      })

      player.addListener('player_state_changed', (state) => {
        if (!state || cancelled) return
        setPlayerState({
          position: state.position,
          duration: state.duration,
          paused: state.paused,
          trackUri: state.track_window?.current_track?.uri ?? null,
        })
        setStateTimestamp(Date.now())
      })

      player.addListener('initialization_error', ({ message }) =>
        console.error('Spotify init error:', message))
      // authentication_error fires due to an internal SDK scope check (web-playback)
      // that always returns 403 — it is harmless when the `streaming` scope is present
      player.addListener('authentication_error', ({ message }) =>
        console.warn('Spotify auth warning (usually harmless):', message))
      player.addListener('account_error', ({ message }) =>
        console.error('Spotify account error:', message))

      player.connect()
      playerRef.current = player
    }

    if (window.Spotify) {
      initPlayer()
    } else {
      window.onSpotifyWebPlaybackSDKReady = initPlayer
      const script = document.createElement('script')
      script.src = 'https://sdk.scdn.co/spotify-player.js'
      script.async = true
      document.body.appendChild(script)
    }

    return () => {
      cancelled = true
      playerRef.current?.disconnect()
      playerRef.current = null
      setIsReady(false)
      setDeviceId(null)
    }
  }, [enabled])

  return { deviceId, isReady, playerState, stateTimestamp }
}
