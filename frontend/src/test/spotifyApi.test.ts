import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchAllPlaylists, fetchPlaylistTrackUris, removeTracksAtPositions, addTracksToPlaylist } from '../spotifyApi'

vi.mock('../spotifyAuth', () => ({
  getAccessToken: vi.fn().mockResolvedValue('fake-token'),
}))

afterEach(() => {
  vi.restoreAllMocks()
})

function makeItem(id: string, name: string, ownerId = 'user1') {
  return {
    id,
    name,
    owner: { id: ownerId },
    tracks: { href: `https://api.spotify.com/v1/playlists/${id}/tracks` },
  }
}

function mockFetch(...pages: { items: ReturnType<typeof makeItem>[]; next: string | null }[]) {
  let call = 0
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    const page = pages[call++] ?? { items: [], next: null }
    return { ok: true, status: 200, json: async () => page } as Response
  })
}

describe('fetchAllPlaylists', () => {
  it('returns all playlists from a single page', async () => {
    mockFetch({ items: [makeItem('a', 'Alpha'), makeItem('b', 'Beta')], next: null })
    const result = await fetchAllPlaylists()
    expect(result.map(p => p.id)).toEqual(['a', 'b'])
  })

  it('follows pagination and merges all pages', async () => {
    mockFetch(
      { items: [makeItem('a', 'Alpha')], next: 'https://api.spotify.com/v1/me/playlists?offset=1' },
      { items: [makeItem('b', 'Beta')],  next: null },
    )
    const result = await fetchAllPlaylists()
    expect(result.map(p => p.id)).toEqual(['a', 'b'])
  })

  it('deduplicates playlists that appear on multiple pages', async () => {
    mockFetch(
      { items: [makeItem('a', 'Alpha'), makeItem('b', 'Beta')], next: 'https://api.spotify.com/v1/me/playlists?offset=2' },
      { items: [makeItem('b', 'Beta'), makeItem('c', 'Gamma')], next: null },
    )
    const result = await fetchAllPlaylists()
    expect(result.map(p => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('maps ownerId correctly', async () => {
    mockFetch({ items: [makeItem('a', 'Alpha', 'alice')], next: null })
    const result = await fetchAllPlaylists()
    expect(result[0].ownerId).toBe('alice')
  })
})

describe('fetchPlaylistTrackUris', () => {
  function mockTracksFetch(...pages: { items: { track?: { uri?: string } }[]; next: string | null }[]) {
    let call = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const page = pages[call++] ?? { items: [], next: null }
      return { ok: true, status: 200, json: async () => page } as Response
    })
  }

  it('returns a set of all track URIs on a single page', async () => {
    mockTracksFetch({
      items: [{ track: { uri: 'spotify:track:a' } }, { track: { uri: 'spotify:track:b' } }],
      next: null,
    })
    const result = await fetchPlaylistTrackUris('pl1')
    expect(result).toEqual(new Set(['spotify:track:a', 'spotify:track:b']))
  })

  it('follows pagination and merges all pages', async () => {
    mockTracksFetch(
      { items: [{ track: { uri: 'spotify:track:a' } }], next: 'https://api.spotify.com/v1/playlists/pl1/tracks?offset=1' },
      { items: [{ track: { uri: 'spotify:track:b' } }], next: null },
    )
    const result = await fetchPlaylistTrackUris('pl1')
    expect(result).toEqual(new Set(['spotify:track:a', 'spotify:track:b']))
  })

  it('skips items with a missing track uri', async () => {
    mockTracksFetch({
      items: [{ track: { uri: 'spotify:track:a' } }, { track: undefined }, {}],
      next: null,
    })
    const result = await fetchPlaylistTrackUris('pl1')
    expect(result).toEqual(new Set(['spotify:track:a']))
  })
})

describe('removeTracksAtPositions', () => {
  function mockDeleteFlow(snapshotIds: string[]) {
    let snapshotCall = 0
    const deleteBodies: unknown[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.method === 'DELETE') {
        deleteBodies.push(JSON.parse(init.body as string))
        return { ok: true, status: 200, json: async () => ({ snapshot_id: 'new' }) } as Response
      }
      // Snapshot-id lookup — a plain GET with no options
      return { ok: true, status: 200, json: async () => ({ snapshot_id: snapshotIds[snapshotCall++] }) } as Response
    })
    return deleteBodies
  }

  it('sends a single request with a well-formed { tracks: [{ uri }] } body', async () => {
    const deleteBodies = mockDeleteFlow(['snap1'])
    await removeTracksAtPositions('pl1', [
      { uri: 'spotify:track:a', position: 0 },
      { uri: 'spotify:track:b', position: 2 },
    ])
    expect(deleteBodies).toEqual([
      { tracks: [{ uri: 'spotify:track:a' }, { uri: 'spotify:track:b' }], snapshot_id: 'snap1' },
    ])
  })

  it('dedupes repeated URIs into a single entry', async () => {
    const deleteBodies = mockDeleteFlow(['snap1'])
    await removeTracksAtPositions('pl1', [
      { uri: 'spotify:track:a', position: 0 },
      { uri: 'spotify:track:a', position: 5 },
    ])
    expect(deleteBodies).toEqual([
      { tracks: [{ uri: 'spotify:track:a' }], snapshot_id: 'snap1' },
    ])
  })

  it('chunks more than 100 unique URIs into multiple requests', async () => {
    const items = Array.from({ length: 150 }, (_, i) => ({ uri: `spotify:track:${i}`, position: i }))
    const deleteBodies = mockDeleteFlow(['snap1', 'snap2'])
    await removeTracksAtPositions('pl1', items)
    expect(deleteBodies).toHaveLength(2)
    expect((deleteBodies[0] as { tracks: unknown[] }).tracks).toHaveLength(100)
    expect((deleteBodies[1] as { tracks: unknown[] }).tracks).toHaveLength(50)
  })
})

describe('addTracksToPlaylist', () => {
  it('sends a single POST request with all URIs', async () => {
    const postBodies: unknown[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      postBodies.push(JSON.parse(init!.body as string))
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })
    await addTracksToPlaylist(['spotify:track:a', 'spotify:track:b'], 'pl1')
    expect(postBodies).toEqual([{ uris: ['spotify:track:a', 'spotify:track:b'] }])
  })

  it('chunks more than 100 URIs into multiple requests', async () => {
    const uris = Array.from({ length: 150 }, (_, i) => `spotify:track:${i}`)
    const postBodies: unknown[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      postBodies.push(JSON.parse(init!.body as string))
      return { ok: true, status: 200, json: async () => ({}) } as Response
    })
    await addTracksToPlaylist(uris, 'pl1')
    expect(postBodies).toHaveLength(2)
    expect((postBodies[0] as { uris: string[] }).uris).toHaveLength(100)
    expect((postBodies[1] as { uris: string[] }).uris).toHaveLength(50)
  })
})
