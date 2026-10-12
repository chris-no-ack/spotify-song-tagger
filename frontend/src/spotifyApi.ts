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

// Batched variant of addTrackToPlaylist — adds every URI in as few requests
// as possible (Spotify API limit: 100 URIs per POST) instead of one request
// per track.
export async function addTracksToPlaylist(spotifyUris: string[], playlistId: string): Promise<void> {
  const CHUNK_SIZE = 100
  for (let i = 0; i < spotifyUris.length; i += CHUNK_SIZE) {
    const chunk = spotifyUris.slice(i, i + CHUNK_SIZE)
    await spotifyFetch(`/playlists/${playlistId}/tracks`, {
      method: 'POST',
      body: JSON.stringify({ uris: chunk }),
    })
  }
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
        tracksHref: item.tracks?.href ?? item.items?.href,
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
  releaseDate: string | null  // "YYYY", "YYYY-MM", or "YYYY-MM-DD"
}

function parsePageItems(page: { items?: unknown[]; next?: string | null }): SpotifyTrackItem[] {
  const tracks: SpotifyTrackItem[] = []
  for (const item of page.items ?? []) {
    const entry = item as {
      track?: { uri?: string; name?: string; artists?: { name: string }[]; album?: { images?: { url: string }[]; release_date?: string }; duration_ms?: number }
      item?: { uri?: string; name?: string; artists?: { name: string }[]; album?: { images?: { url: string }[]; release_date?: string }; duration_ms?: number }
      added_at?: string
    }
    // Spotify returns track data under "track" (standard) or "item" (newer endpoint)
    const track = entry.track ?? entry.item
    if (!track?.uri) continue
    const artistNames = (track.artists ?? []).map(a => a.name)
    const images = track.album?.images ?? []
    tracks.push({
      uri: track.uri,
      title: track.name ?? 'Unknown',
      artist: artistNames.join(', ') || 'Unknown',
      coverUrl: images[0]?.url ?? null,
      durationMs: track.duration_ms ?? 0,
      addedAt: entry.added_at ?? null,
      releaseDate: track.album?.release_date ?? null,
    })
  }
  return tracks
}

export async function fetchPlaylistTracks(tracksHref: string): Promise<SpotifyTrackItem[]> {
  if (!tracksHref) {
    console.warn('[fetchPlaylistTracks] tracksHref is null/undefined — returning empty')
    return []
  }
  const result: SpotifyTrackItem[] = []
  let url: string | null = tracksHref
  let pageIndex = 0
  while (url) {
    const page: { items?: unknown[]; next?: string | null } = await spotifyFetch(url).then(r => r.json())
    const rawCount = page.items?.length ?? 0
    const parsed = parsePageItems(page)
    if (rawCount !== parsed.length) {
      console.warn(`[fetchPlaylistTracks] page ${pageIndex}: ${rawCount} raw items, ${parsed.length} parsed (${rawCount - parsed.length} skipped — likely local files or null tracks)`)
    }
    result.push(...parsed)
    url = page.next ?? null
    pageIndex++
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
  firstArtist: string
  /** Spotify artist IDs for every artist credited on the track */
  artistIds: string[]
}

export async function fetchPlaylistTracksWithPositions(playlistId: string): Promise<SpotifyTrackItemWithPosition[]> {
  const result: SpotifyTrackItemWithPosition[] = []
  let url: string | null = `${API_BASE}/playlists/${playlistId}/tracks`
  while (url) {
    const page = await spotifyFetch(url).then(r => r.json()) as { items?: unknown[]; next?: string | null; offset?: number }
    const pageOffset = page.offset ?? 0
    for (let i = 0; i < (page.items ?? []).length; i++) {
      const entry = (page.items ?? [])[i] as {
        track?: { uri?: string; name?: string; artists?: { name: string; id?: string }[]; album?: { images?: { url: string }[]; release_date?: string }; duration_ms?: number }
        item?: { uri?: string; name?: string; artists?: { name: string; id?: string }[]; album?: { images?: { url: string }[]; release_date?: string }; duration_ms?: number }
        added_at?: string
      }
      const track = entry.track ?? entry.item
      if (!track?.uri) continue
      const artistNames = (track.artists ?? []).map(a => a.name)
      const artistIds = (track.artists ?? []).map(a => a.id).filter((id): id is string => !!id)
      const images = track.album?.images ?? []
      result.push({
        uri: track.uri as string,
        title: track.name ?? 'Unknown',
        artist: artistNames.join(', ') || 'Unknown',
        firstArtist: artistNames[0] ?? 'Unknown',
        artistIds,
        coverUrl: images[0]?.url ?? null,
        durationMs: track.duration_ms ?? 0,
        addedAt: entry.added_at ?? null,
        releaseDate: track.album?.release_date ?? null,
        position: pageOffset + i,
      })
    }
    url = page.next ?? null
  }
  return result
}

// Lightweight fetch used to cross-reference ignore-list playlists against
// another playlist's tracks — only pulls track URIs, not full metadata.
export async function fetchPlaylistTrackUris(playlistId: string): Promise<Set<string>> {
  const uris = new Set<string>()
  let url: string | null = `${API_BASE}/playlists/${playlistId}/tracks?fields=items(track(uri)),next&limit=100`
  while (url) {
    const page = await spotifyFetch(url).then(r => r.json()) as { items?: { track?: { uri?: string } }[]; next?: string | null }
    for (const item of page.items ?? []) {
      if (item.track?.uri) uris.add(item.track.uri)
    }
    url = page.next ?? null
  }
  return uris
}

export async function removeTracksAtPositions(
  playlistId: string,
  items: { uri: string; position: number }[],
): Promise<void> {
  // Spotify's remove-tracks endpoint no longer honors per-occurrence removal
  // by position (the "positions" field was dropped from the API and is
  // ignored if sent) — it removes every occurrence of each listed URI. The
  // previous implementation sent a body built around "positions" with no
  // "uri"/"tracks" field at all, which doesn't match Spotify's documented
  // schema and could fail or behave unpredictably. Dedupe by URI instead and
  // send a single well-formed request per chunk (Spotify API limit: 100
  // items per DELETE) using { tracks: [{ uri }], snapshot_id }.
  const uniqueUris = Array.from(new Set(items.map(i => i.uri)))

  const CHUNK_SIZE = 100
  for (let i = 0; i < uniqueUris.length; i += CHUNK_SIZE) {
    const chunk = uniqueUris.slice(i, i + CHUNK_SIZE)

    // Re-fetch snapshot_id before each request since it changes after every mutation.
    const { snapshot_id } = await spotifyFetch(`/playlists/${playlistId}?fields=snapshot_id`)
      .then(r => r.json()) as { snapshot_id: string }

    await spotifyFetch(`/playlists/${playlistId}/tracks`, {
      method: 'DELETE',
      body: JSON.stringify({ tracks: chunk.map(uri => ({ uri })), snapshot_id }),
    })
  }
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
