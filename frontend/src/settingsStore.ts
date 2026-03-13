export interface AppConfig {
  spotifyClientId: string
  playlistNameFilter: string
  playlistNameBlacklist: string[]
  ignorePlaylistId: string
  shazamPlaylistId: string
  anthropicApiKey: string
  anthropicProxyUrl: string
  categoryNames: string[]
}

const STORAGE_KEY = 'app_config'

const DEFAULTS: AppConfig = {
  spotifyClientId: '',
  playlistNameFilter: 'Dance',
  playlistNameBlacklist: [],
  ignorePlaylistId: '',
  shazamPlaylistId: '',
  anthropicApiKey: '',
  anthropicProxyUrl: '',
  categoryNames: [
    'Energy', 'Mood', 'Beat', 'Genre', 'Instrument',
    'Language', 'Attribute', 'Complexity', 'Singer', 'Popularity', 'Year',
  ],
}

export function getConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveConfig(partial: Partial<AppConfig>): void {
  const current = getConfig()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...partial }))
}
