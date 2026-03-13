import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSuggestions } from '../anthropicApi'
import type { SongResponse, CategoryResponse } from '../types'

const song: SongResponse = {
  spotifyUri: 'spotify:track:abc',
  title: 'Test Song',
  artist: 'Test Artist',
  coverUrl: null,
  durationMs: 200000,
  discoveredDate: '2024-01-01',
  missingCategories: ['Energy', 'Mood'],
  tags: [],
}

const categories: CategoryResponse[] = [
  {
    id: 1,
    name: 'Energy',
    tags: [
      { id: 10, categoryName: 'Energy', value: 'High', playlistName: 'Dance High Energy' },
      { id: 11, categoryName: 'Energy', value: 'Low', playlistName: 'Dance Low Energy' },
    ],
  },
  {
    id: 2,
    name: 'Mood',
    tags: [
      { id: 20, categoryName: 'Mood', value: 'Happy', playlistName: 'Dance Happy Mood' },
    ],
  },
]

const API_KEY = 'sk-ant-test'

// With assistant prefilling, the API returns the continuation after the '[' we sent.
// Helper: given the full JSON array, return only the continuation (drop leading '[').
function continuation(arr: unknown[]): string {
  return JSON.stringify(arr).slice(1)
}

function makeClaudeResponse(text: string, ok = true) {
  return {
    ok,
    status: ok ? 200 : 401,
    text: () => Promise.resolve('Unauthorized'),
    json: () => Promise.resolve({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text }],
    }),
  }
}

describe('anthropicApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns empty array when no categories are missing', async () => {
    const result = await getSuggestions(
      { ...song, missingCategories: [] },
      categories,
      [],
      API_KEY,
    )
    expect(result).toEqual([])
  })

  it('returns empty array when all missing categories have no tags', async () => {
    const emptyCats: CategoryResponse[] = [{ id: 3, name: 'Other', tags: [] }]
    const result = await getSuggestions(
      { ...song, missingCategories: ['Other'] },
      emptyCats,
      [],
      API_KEY,
    )
    expect(result).toEqual([])
  })

  it('parses a well-formed JSON response from Claude', async () => {
    const payload = [
      { categoryId: 1, categoryName: 'Energy', suggestedTagIds: [10] },
      { categoryId: 2, categoryName: 'Mood', suggestedTagIds: [20] },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeClaudeResponse(continuation(payload))))

    const result = await getSuggestions(song, categories, ['dance'], API_KEY)
    expect(result).toHaveLength(2)
    expect(result[0].categoryId).toBe(1)
    expect(result[0].suggestedTagIds).toEqual([10])
    expect(result[1].categoryName).toBe('Mood')
  })

  it('makes exactly one API call', async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeClaudeResponse(continuation([])))
    vi.stubGlobal('fetch', fetchMock)

    await getSuggestions(song, categories, [], API_KEY)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns empty array when response has no parseable content', async () => {
    // Continuation that yields '[not valid json' — parseResponse returns []
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeClaudeResponse('not valid json')))

    const result = await getSuggestions(song, categories, [], API_KEY)
    expect(result).toEqual([])
  })

  it('throws when the Claude API returns a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('Unauthorized'),
    }))

    await expect(getSuggestions(song, categories, [], API_KEY)).rejects.toThrow('Claude API 401')
  })

  it('uses the proxy URL when provided', async () => {
    const proxyUrl = 'https://my-proxy.workers.dev'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeClaudeResponse(continuation([]))))

    await getSuggestions(song, categories, [], API_KEY, proxyUrl)

    const [calledUrl] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(calledUrl).toBe(proxyUrl)
  })

  it('sends x-api-key header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeClaudeResponse(continuation([]))))

    await getSuggestions(song, categories, [], API_KEY)

    const [, calledOptions] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0]
    expect((calledOptions as RequestInit).headers).toMatchObject({ 'x-api-key': API_KEY })
  })

  it('prefills the assistant turn with [ to force JSON array output', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeClaudeResponse(continuation([]))))

    await getSuggestions(song, categories, [], API_KEY)

    const [, calledOptions] = (vi.mocked(fetch) as ReturnType<typeof vi.fn>).mock.calls[0]
    const body = JSON.parse((calledOptions as RequestInit).body as string)
    const messages: { role: string; content: string }[] = body.messages
    expect(messages.at(-1)).toEqual({ role: 'assistant', content: '[' })
  })

  it('filters out items missing required fields', async () => {
    const payload = [
      { categoryId: 1, categoryName: 'Energy', suggestedTagIds: [10] },
      { categoryName: 'Bad', suggestedTagIds: [99] }, // missing categoryId
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeClaudeResponse(continuation(payload))))

    const result = await getSuggestions(song, categories, [], API_KEY)
    expect(result).toHaveLength(1)
    expect(result[0].categoryId).toBe(1)
  })
})
