// Cross-references tracks against community-maintained lists of known
// AI-generated music artists on Spotify. There is no free official API for
// this, so we rely on a public GitHub-hosted CSV (artist name + Spotify
// artist ID) maintained by https://github.com/CennoxX/spotify-ai-blocker.
// The list is fetched lazily and cached in memory for the lifetime of the
// page — never preloaded alongside other app data.

const AI_ARTIST_LIST_URL = 'https://raw.githubusercontent.com/CennoxX/spotify-ai-blocker/main/SpotifyAiArtists.csv'

export interface KnownAiArtists {
  /** Lowercased Spotify artist IDs known to be AI-generated acts */
  ids: Set<string>
  /** Lowercased artist names, used as a fallback when an ID match isn't available */
  names: Set<string>
}

function parseCsv(text: string): KnownAiArtists {
  const ids = new Set<string>()
  const names = new Set<string>()
  const lines = text.split('\n')
  // First line is the "artist,id" header — skip it
  for (const line of lines.slice(1)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const lastComma = trimmed.lastIndexOf(',')
    if (lastComma === -1) continue
    const name = trimmed.slice(0, lastComma).trim()
    const id = trimmed.slice(lastComma + 1).trim()
    if (id) ids.add(id.toLowerCase())
    if (name) names.add(name.toLowerCase())
  }
  return { ids, names }
}

let cached: KnownAiArtists | null = null
let inflight: Promise<KnownAiArtists> | null = null

export async function getKnownAiArtists(): Promise<KnownAiArtists> {
  if (cached) return cached
  if (inflight) return inflight

  inflight = fetch(AI_ARTIST_LIST_URL)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to fetch AI artist list: ${res.status}`)
      const parsed = parseCsv(await res.text())
      cached = parsed
      return parsed
    })
    .finally(() => { inflight = null })

  return inflight
}

/** Test-only helper to reset the in-memory cache between test cases. */
export function _resetAiArtistListCache(): void {
  cached = null
  inflight = null
}
