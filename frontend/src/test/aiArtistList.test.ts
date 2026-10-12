import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getKnownAiArtists, _resetAiArtistListCache } from '../aiArtistList'

const CSV = 'artist,id\n'
  + 'Atomship,4PbKVheWA7ToOxOrqqzjol\n'
  + 'Smokey September,32PcXsAFr3ArYaHSYr8qGh\n'
  + 'Name, With Comma,abc123\n'

beforeEach(() => {
  _resetAiArtistListCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getKnownAiArtists', () => {
  it('parses artist names and IDs from the CSV, skipping the header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) }))
    const result = await getKnownAiArtists()
    expect(result.ids.has('4pbkvheWA7ToOxOrqqzjol'.toLowerCase())).toBe(true)
    expect(result.ids.has('unknown-id')).toBe(false)
    expect(result.names.has('atomship')).toBe(true)
    expect(result.names.has('smokey september')).toBe(true)
  })

  it('handles artist names containing commas by splitting on the last comma', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) }))
    const result = await getKnownAiArtists()
    expect(result.names.has('name, with comma')).toBe(true)
    expect(result.ids.has('abc123')).toBe(true)
  })

  it('caches the result so a second call does not re-fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) })
    vi.stubGlobal('fetch', fetchMock)
    await getKnownAiArtists()
    await getKnownAiArtists()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    await expect(getKnownAiArtists()).rejects.toThrow('500')
  })

  it('dedupes concurrent calls into a single fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(CSV) })
    vi.stubGlobal('fetch', fetchMock)
    const [a, b] = await Promise.all([getKnownAiArtists(), getKnownAiArtists()])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })
})
