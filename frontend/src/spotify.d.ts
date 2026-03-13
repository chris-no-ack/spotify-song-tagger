interface Window {
  onSpotifyWebPlaybackSDKReady: () => void
  Spotify: typeof Spotify
}

declare namespace Spotify {
  interface PlayerOptions {
    name: string
    getOAuthToken: (cb: (token: string) => void) => void
    volume?: number
  }

  interface PlaybackState {
    position: number
    duration: number
    paused: boolean
    track_window: {
      current_track: {
        uri: string
        name: string
        artists: { name: string }[]
        album: { images: { url: string }[] }
      }
    }
  }

  interface WebPlaybackInstance {
    device_id: string
  }

  class Player {
    constructor(options: PlayerOptions)
    connect(): Promise<boolean>
    disconnect(): void
    addListener(event: 'ready', cb: (instance: WebPlaybackInstance) => void): void
    addListener(event: 'not_ready', cb: (instance: WebPlaybackInstance) => void): void
    addListener(event: 'player_state_changed', cb: (state: PlaybackState | null) => void): void
    addListener(event: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error', cb: (err: { message: string }) => void): void
    togglePlay(): Promise<void>
    seek(positionMs: number): Promise<void>
    getCurrentState(): Promise<PlaybackState | null>
    disconnect(): void
  }
}
