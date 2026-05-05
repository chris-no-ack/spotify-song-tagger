import { getAccessToken } from './spotifyAuth'

const API_BASE = 'https://api.spotify.com/v1'

async function spotifyFetch(path: string, options?: RequestInit): Promise<Response> {
  const token = await getAccessToken()
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  if (!response.ok && response.status !== 204) {
    const text = await response.text().catch(() => '')
    throw new Error(`Spotify ${response.status}: ${text}`)
  }
  return response
}

// — Playback —

export async function play(spotifyUri: string, deviceId?: string): Promise<void> {
  const url = `/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`
  await spotifyFetch(url, {
    method: 'PUT',
    body: JSON.stringify({ uris: [spotifyUri] }),
  })
}

export async function pause(): Promise<void> {
  await spotifyFetch('/me/player/pause', { method: 'PUT' })
}

export async function resume(): Promise<void> {
  await spotifyFetch('/me/player/play', {
    method: 'PUT',
    body: JSON.stringify({}),
  })
}

export async function seek(positionMs: number): Promise<void> {
  await spotifyFetch(`/me/player/seek?position_ms=${positionMs}`, { method: 'PUT' })
}

export async function getActiveDeviceName(): Promise<string | null> {
  try {
    const response = await spotifyFetch('/me/player')
    if (response.status === 204) return null
    const data = await response.json()
    return data?.device?.name ?? null
  } catch {
    return null
  }
}

// — Playlists —

export async function addTrackToPlaylist(spotifyUri: string, playlistId: string): Promise<void> {
  await spotifyFetch(`/playlists/${playlistId}/tracks`, {
    method: 'POST',
    body: JSON.stringify({ uris: [spotifyUri] }),
  })
}

export async function removeTrackFromPlaylist(spotifyUri: string, playlistId: string): Promise<void> {
  await spotifyFetch(`/playlists/${playlistId}/tracks`, {
    method: 'DELETE',
    body: JSON.stringify({ tracks: [{ uri: spotifyUri }] }),
  })
}

// — Sync helpers —

export async function getCurrentUserId(): Promise<string> {
  const response = await spotifyFetch('/me')
  const data = await response.json()
  return data.id
}

export interface SpotifyPlaylist {
  id: string
  name: string
  tracksHref: string
  ownerId: string
}

export async function fetchAllPlaylists(): Promise<SpotifyPlaylist[]> {
  const result: SpotifyPlaylist[] = []
  const seen = new Set<string>()
  let url: string | null = `${API_BASE}/me/playlists?limit=50`
  while (url) {
    const response = await spotifyFetch(url)
    const page = await response.json()
    for (const item of page.items ?? []) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      result.push({
        id: item.id,
        name: item.name,
        tracksHref: item.tracks?.href,
        ownerId: item.owner?.id,
      })
    }
    url = page.next ?? null
  }
  return result
}

export interface SpotifyTrackItem {
  uri: string
  title: string
  artist: string
  coverUrl: string | null
  durationMs: number
  addedAt: string | null  // ISO 8601 timestamp, e.g. "2024-01-15T14:30:00Z"
}

function parsePageItems(page: { items?: unknown[]; next?: string | null }): SpotifyTrackItem[] {
  const tracks: SpotifyTrackItem[] = []
  for (const item of page.items ?? []) {
    const { track, added_at } = item as { track: { uri?: string; name?: string; artists?: { name: string }[]; album?: { images?: { url: string }[] }; duration_ms?: number }; added_at?: string }
    if (!track?.uri) continue
    const artistNames = (track.artists ?? []).map(a => a.name)
    const images = track.album?.images ?? []
    tracks.push({
      uri: track.uri,
      title: track.name ?? 'Unknown',
      artist: artistNames.join(', ') || 'Unknown',
      coverUrl: images[0]?.url ?? null,
      durationMs: track.duration_ms ?? 0,
      addedAt: added_at ?? null,
    })
  }
  return tracks
}

export async function fetchPlaylistTracks(tracksHref: string): Promise<SpotifyTrackItem[]> {
  const result: SpotifyTrackItem[] = []
  let url: string | null = tracksHref
  while (url) {
    const page: { items?: unknown[]; next?: string | null } = await spotifyFetch(url).then(r => r.json())
    result.push(...parsePageItems(page))
    url = page.next ?? null
  }
  return result
}

export async function streamPlaylistTracks(
  playlistId: string,
  onPage: (tracks: SpotifyTrackItem[]) => void,
): Promise<void> {
  let url: string | null = `${API_BASE}/playlists/${playlistId}/tracks`
  while (url) {
    const page: { items?: unknown[]; next?: string | null } = await spotifyFetch(url).then(r => r.json())
    const tracks = parsePageItems(page)
    if (tracks.length > 0) onPage(tracks)
    url = page.next ?? null
  }
}

export interface SpotifyTrackItemWithPosition extends SpotifyTrackItem {
  position: number
}

export async function fetchPlaylistTracksWithPositions(playlistId: string): Promise<SpotifyTrackItemWithPosition[]> {
  const result: SpotifyTrackItemWithPosition[] = []
  let url: string | null = `${API_BASE}/playlists/${playlistId}/tracks`
  while (url) {
    const page = await spotifyFetch(url).then(r => r.json()) as { items?: unknown[]; next?: string | null; offset?: number }
    const pageOffset = page.offset ?? 0
    for (let i = 0; i < (page.items ?? []).length; i++) {
      const item = (page.items ?? [])[i] as { track?: { uri?: string; name?: string; artists?: { name: string }[]; album?: { images?: { url: string }[] }; duration_ms?: number }; added_at?: string }
      if (!item.track?.uri) continue
      const track = item.track
      const artistNames = (track.artists ?? []).map(a => a.name)
      const images = track.album?.images ?? []
      result.push({
        uri: track.uri,
        title: track.name ?? 'Unknown',
        artist: artistNames.join(', ') || 'Unknown',
        coverUrl: images[0]?.url ?? null,
        durationMs: track.duration_ms ?? 0,
        addedAt: item.added_at ?? null,
        position: pageOffset + i,
      })
    }
    url = page.next ?? null
  }
  return result
}

export async function removeTracksAtPositions(
  playlistId: string,
  items: { uri: string; position: number }[],
): Promise<void> {
  // snapshot_id is required for Spotify to honour the positions array
  const { snapshot_id } = await spotifyFetch(`/playlists/${playlistId}?fields=snapshot_id`).then(r => r.json()) as { snapshot_id: string }

  const grouped = new Map<string, number[]>()
  for (const { uri, position } of items) {
    const positions = grouped.get(uri) ?? []
    positions.push(position)
    grouped.set(uri, positions)
  }
  const tracks = Array.from(grouped.entries()).map(([uri, positions]) => ({ uri, positions }))
  await spotifyFetch(`/playlists/${playlistId}/tracks`, {
    method: 'DELETE',
    body: JSON.stringify({ tracks, snapshot_id }),
  })
}


// — AI suggestion helpers —

export async function getTrackArtistId(trackId: string): Promise<string | null> {
  const response = await spotifyFetch(`/tracks/${trackId}`)
  const data = await response.json()
  return data.artists?.[0]?.id ?? null
}

export async function getArtistGenres(artistId: string): Promise<string[]> {
  const response = await spotifyFetch(`/artists/${artistId}`)
  const data = await response.json()
  return data.genres ?? []
}
