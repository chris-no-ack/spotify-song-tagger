import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchAllPlaylists } from '../spotifyApi'

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
