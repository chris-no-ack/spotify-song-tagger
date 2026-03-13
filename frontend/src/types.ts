export interface TagResponse {
  id: number
  categoryName: string
  value: string
  playlistName: string
}

export interface SongResponse {
  spotifyUri: string
  title: string
  artist: string
  coverUrl: string | null
  durationMs: number | null
  discoveredDate: string | null
  missingCategories: string[]
  tags: TagResponse[]
}

export interface CategoryResponse {
  id: number
  name: string
  tags: TagResponse[]
}

export interface SpotifyStatus {
  authenticated: boolean
  activeDevice: string
}

export interface CategorySuggestion {
  categoryId: number
  categoryName: string
  suggestedTagIds: number[]
}
