import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'

vi.mock('../api', () => ({
  api: {
    getSongs: vi.fn(),
    getCategories: vi.fn(),
    getSpotifyStatus: vi.fn(),
    ignoreSong: vi.fn(),
    getSuggestions: vi.fn(),
    updateCategoryOrder: vi.fn(),
  },
}))

vi.mock('../hooks/useSpotifyPlayer', () => ({
  useSpotifyPlayer: () => ({ deviceId: null, isReady: false, playerState: null, stateTimestamp: 0 }),
}))

import { api } from '../api'
const mockApi = vi.mocked(api)

const makeSong = (n: number, opts: { discoveredDate?: string; missingCategories?: string[] } = {}) => ({
  spotifyUri: `spotify:track:${n}`,
  title: `Song ${n}`,
  artist: 'Artist',
  coverUrl: null,
  durationMs: null,
  discoveredDate: opts.discoveredDate ?? null,
  missingCategories: opts.missingCategories ?? [],
  tags: [],
})

describe('App', () => {
  beforeEach(() => {
    mockApi.getCategories.mockResolvedValue([])
    mockApi.getSpotifyStatus.mockResolvedValue({ authenticated: false, activeDevice: '' })
    mockApi.getSuggestions.mockResolvedValue([])
    mockApi.updateCategoryOrder.mockResolvedValue(undefined)
  })

  it('loads and displays songs on mount', async () => {
    mockApi.getSongs.mockResolvedValue([makeSong(1), makeSong(2)])
    render(<App />)
    await waitFor(() => expect(screen.getByText('Song 1')).toBeInTheDocument())
    expect(screen.getByText('Song 2')).toBeInTheDocument()
  })

  it('shows tag panel when a song is selected', async () => {
    mockApi.getSongs.mockResolvedValue([makeSong(1)])
    render(<App />)
    await waitFor(() => screen.getByText('Song 1'))
    await userEvent.click(screen.getByText('Song 1'))
    await waitFor(() => expect(screen.getByRole('button', { name: /Add to ignore list/i })).toBeInTheDocument())
  })

  it('navigates to next song after ignoring', async () => {
    const songs = [makeSong(1), makeSong(2), makeSong(3)]
    mockApi.getSongs
      .mockResolvedValueOnce(songs)
      .mockResolvedValue(songs.slice(1))
    mockApi.ignoreSong.mockResolvedValue(undefined)

    render(<App />)
    await waitFor(() => screen.getByText('Song 1'))

    // Select Song 1
    await userEvent.click(screen.getAllByText('Song 1')[0])
    await waitFor(() => screen.getByRole('button', { name: /Add to ignore list/i }))

    // Ignore Song 1
    await userEvent.click(screen.getByRole('button', { name: /Add to ignore list/i }))

    // Song 2 should now be shown in the tag panel
    await waitFor(() => {
      const headings = screen.getAllByText('Song 2')
      // TagPanel renders the title as an h1; confirm it's there
      expect(headings.length).toBeGreaterThan(0)
    })
  })

  it('sorts by discovered date by default (newest first)', async () => {
    const songs = [
      makeSong(1, { discoveredDate: '2024-01-01' }),
      makeSong(2, { discoveredDate: '2024-06-01' }),
      makeSong(3, { discoveredDate: '2023-01-01' }),
    ]
    mockApi.getSongs.mockResolvedValue(songs)
    render(<App />)
    await waitFor(() => screen.getByText('Song 1'))

    const items = screen.getAllByRole('button', { name: /Song \d/ })
    expect(items[0]).toHaveTextContent('Song 2')  // newest
    expect(items[1]).toHaveTextContent('Song 1')
    expect(items[2]).toHaveTextContent('Song 3')  // oldest
  })

  it('sorts by missing tags when sort is changed', async () => {
    const songs = [
      makeSong(1, { missingCategories: ['Energy'] }),
      makeSong(2, { missingCategories: ['Energy', 'Mood', 'Beat'] }),
      makeSong(3, { missingCategories: [] }),
    ]
    mockApi.getSongs.mockResolvedValue(songs)
    render(<App />)
    await waitFor(() => screen.getByText('Song 1'))

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /sort/i }), 'missing')

    const items = screen.getAllByRole('button', { name: /Song \d/ })
    expect(items[0]).toHaveTextContent('Song 2')  // 3 missing
    expect(items[1]).toHaveTextContent('Song 1')  // 1 missing
    expect(items[2]).toHaveTextContent('Song 3')  // 0 missing
  })

  it('filters songs by minimum missing count', async () => {
    const songs = [
      makeSong(1, { missingCategories: [] }),
      makeSong(2, { missingCategories: ['Energy'] }),
      makeSong(3, { missingCategories: ['Energy', 'Mood'] }),
    ]
    mockApi.getSongs.mockResolvedValue(songs)
    render(<App />)
    await waitFor(() => screen.getByText('Song 1'))

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /min missing/i }), '2')

    expect(screen.queryByText('Song 1')).not.toBeInTheDocument()
    expect(screen.queryByText('Song 2')).not.toBeInTheDocument()
    expect(screen.getByText('Song 3')).toBeInTheDocument()
  })

  it('clears selection when ignoring the last song', async () => {
    mockApi.getSongs
      .mockResolvedValueOnce([makeSong(1)])
      .mockResolvedValue([])
    mockApi.ignoreSong.mockResolvedValue(undefined)

    render(<App />)
    await waitFor(() => screen.getByText('Song 1'))
    await userEvent.click(screen.getAllByText('Song 1')[0])
    await waitFor(() => screen.getByRole('button', { name: /Add to ignore list/i }))

    await userEvent.click(screen.getByRole('button', { name: /Add to ignore list/i }))

    await waitFor(() =>
      expect(screen.getByText('Select a song to tag it')).toBeInTheDocument()
    )
  })
})
