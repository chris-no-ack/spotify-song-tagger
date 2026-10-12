import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import IgnoredSongsDialog from '../components/IgnoredSongsDialog'
import type { SpotifyTrackItemWithPosition } from '../spotifyApi'
import type { IgnoreList } from '../api'

vi.mock('../spotifyApi', () => ({
  fetchPlaylistTracksWithPositions: vi.fn(),
  fetchPlaylistTrackUris: vi.fn(),
  removeTracksAtPositions: vi.fn(),
}))

vi.mock('../api', () => ({
  api: {
    getIgnoreLists: vi.fn(),
  },
}))

import { fetchPlaylistTracksWithPositions, fetchPlaylistTrackUris, removeTracksAtPositions } from '../spotifyApi'
import { api } from '../api'

const mockFetchTracks = vi.mocked(fetchPlaylistTracksWithPositions)
const mockFetchUris = vi.mocked(fetchPlaylistTrackUris)
const mockRemove = vi.mocked(removeTracksAtPositions)
const mockGetIgnoreLists = vi.mocked(api.getIgnoreLists)

function makeTrack(overrides: Partial<SpotifyTrackItemWithPosition>): SpotifyTrackItemWithPosition {
  return {
    uri: 'spotify:track:aaa',
    title: 'Track A',
    artist: 'Artist A',
    firstArtist: 'Artist A',
    artistIds: [],
    coverUrl: null,
    durationMs: 180000,
    addedAt: '2024-01-01',
    releaseDate: null,
    position: 0,
    ...overrides,
  }
}

const oneIgnoreList: IgnoreList[] = [{ playlistId: 'ignore-1', label: 'Default' }]

beforeEach(() => {
  vi.clearAllMocks()
  mockRemove.mockResolvedValue(undefined)
})

describe('IgnoredSongsDialog', () => {
  describe('loading', () => {
    it('shows scanning message while loading', () => {
      mockGetIgnoreLists.mockReturnValue(new Promise(() => {}))
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      expect(screen.getByText('Scanning for ignored songs…')).toBeInTheDocument()
    })

    it('shows error when loading ignore lists fails', async () => {
      mockGetIgnoreLists.mockRejectedValue(new Error('DB error'))
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('DB error')).toBeInTheDocument())
    })

    it('shows error when fetching playlist tracks fails', async () => {
      mockGetIgnoreLists.mockResolvedValue(oneIgnoreList)
      mockFetchTracks.mockRejectedValue(new Error('API error'))
      mockFetchUris.mockResolvedValue(new Set())
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('API error')).toBeInTheDocument())
    })
  })

  describe('no ignore lists configured', () => {
    it('shows a message instead of scanning', async () => {
      mockGetIgnoreLists.mockResolvedValue([])
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText(/No ignore lists configured/)).toBeInTheDocument())
      expect(mockFetchTracks).not.toHaveBeenCalled()
      expect(mockFetchUris).not.toHaveBeenCalled()
    })
  })

  describe('no ignored songs found', () => {
    it('shows "No ignored songs found" when nothing matches', async () => {
      mockGetIgnoreLists.mockResolvedValue(oneIgnoreList)
      mockFetchTracks.mockResolvedValue([makeTrack({ uri: 'spotify:track:aaa' })])
      mockFetchUris.mockResolvedValue(new Set(['spotify:track:zzz']))
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('No ignored songs found in this playlist')).toBeInTheDocument())
    })
  })

  describe('ignored songs found', () => {
    it('shows the count and track info of matches', async () => {
      mockGetIgnoreLists.mockResolvedValue(oneIgnoreList)
      mockFetchTracks.mockResolvedValue([
        makeTrack({ uri: 'spotify:track:aaa', title: 'Track A', position: 0 }),
        makeTrack({ uri: 'spotify:track:bbb', title: 'Track B', position: 1 }),
      ])
      mockFetchUris.mockResolvedValue(new Set(['spotify:track:aaa']))
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('1 ignored song found')).toBeInTheDocument())
      expect(screen.getByText('Track A')).toBeInTheDocument()
      expect(screen.queryByText('Track B')).not.toBeInTheDocument()
    })

    it('shows the matching ignore list label(s) for each entry', async () => {
      mockGetIgnoreLists.mockResolvedValue([
        { playlistId: 'ignore-1', label: 'Default' },
        { playlistId: 'ignore-2', label: 'Bad Mix' },
      ])
      mockFetchTracks.mockResolvedValue([makeTrack({ uri: 'spotify:track:aaa', position: 0 })])
      mockFetchUris
        .mockResolvedValueOnce(new Set(['spotify:track:aaa']))
        .mockResolvedValueOnce(new Set(['spotify:track:aaa']))
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('1 ignored song found'))
      expect(screen.getByText('Default, Bad Mix')).toBeInTheDocument()
    })

    it('all matches are pre-selected', async () => {
      mockGetIgnoreLists.mockResolvedValue(oneIgnoreList)
      mockFetchTracks.mockResolvedValue([makeTrack({ uri: 'spotify:track:aaa', position: 0 })])
      mockFetchUris.mockResolvedValue(new Set(['spotify:track:aaa']))
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('1 ignored song found'))
      const checkboxes = screen.getAllByRole('checkbox')
      expect((checkboxes[1] as HTMLInputElement).checked).toBe(true)
    })
  })

  describe('select all', () => {
    const twoMatches = [
      makeTrack({ uri: 'spotify:track:aaa', title: 'Track A', position: 0 }),
      makeTrack({ uri: 'spotify:track:bbb', title: 'Track B', position: 1 }),
    ]

    it('unchecking "Select all" deselects all', async () => {
      const user = userEvent.setup()
      mockGetIgnoreLists.mockResolvedValue(oneIgnoreList)
      mockFetchTracks.mockResolvedValue(twoMatches)
      mockFetchUris.mockResolvedValue(new Set(['spotify:track:aaa', 'spotify:track:bbb']))
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('2 ignored songs found'))
      await user.click(screen.getByLabelText('Select all'))
      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.slice(1).forEach(cb => expect((cb as HTMLInputElement).checked).toBe(false))
    })

    it('checking "Select all" when none selected re-selects all', async () => {
      const user = userEvent.setup()
      mockGetIgnoreLists.mockResolvedValue(oneIgnoreList)
      mockFetchTracks.mockResolvedValue(twoMatches)
      mockFetchUris.mockResolvedValue(new Set(['spotify:track:aaa', 'spotify:track:bbb']))
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('2 ignored songs found'))
      await user.click(screen.getByLabelText('Select all'))
      await user.click(screen.getByLabelText('Select all'))
      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.slice(1).forEach(cb => expect((cb as HTMLInputElement).checked).toBe(true))
    })
  })

  describe('removal', () => {
    const oneMatch = [makeTrack({ uri: 'spotify:track:aaa', position: 0 })]

    it('calls removeTracksAtPositions with the selected matches, keeping them in the ignore list', async () => {
      const user = userEvent.setup()
      const onRemoved = vi.fn()
      const onClose = vi.fn()
      mockGetIgnoreLists.mockResolvedValue(oneIgnoreList)
      mockFetchTracks.mockResolvedValue(oneMatch)
      mockFetchUris.mockResolvedValue(new Set(['spotify:track:aaa']))
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={onRemoved} onClose={onClose} />)
      await waitFor(() => screen.getByText('1 ignored song found'))
      await user.click(screen.getByRole('button', { name: /Remove/i }))
      expect(mockRemove).toHaveBeenCalledWith('pl1', [{ uri: 'spotify:track:aaa', position: 0 }])
      expect(onRemoved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })

    it('does not remove deselected entries', async () => {
      const user = userEvent.setup()
      mockGetIgnoreLists.mockResolvedValue(oneIgnoreList)
      mockFetchTracks.mockResolvedValue(oneMatch)
      mockFetchUris.mockResolvedValue(new Set(['spotify:track:aaa']))
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('1 ignored song found'))
      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[1])
      await user.click(screen.getByRole('button', { name: /Remove/i }))
      expect(mockRemove).not.toHaveBeenCalled()
    })

    it('shows error when removal fails', async () => {
      const user = userEvent.setup()
      mockGetIgnoreLists.mockResolvedValue(oneIgnoreList)
      mockFetchTracks.mockResolvedValue(oneMatch)
      mockFetchUris.mockResolvedValue(new Set(['spotify:track:aaa']))
      mockRemove.mockRejectedValue(new Error('Remove failed'))
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('1 ignored song found'))
      await user.click(screen.getByRole('button', { name: /Remove/i }))
      await waitFor(() => expect(screen.getByText('Remove failed')).toBeInTheDocument())
    })
  })

  describe('close', () => {
    it('calls onClose when X is clicked', async () => {
      const user = userEvent.setup()
      mockGetIgnoreLists.mockResolvedValue([])
      const onClose = vi.fn()
      render(<IgnoredSongsDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={onClose} />)
      await waitFor(() => screen.getByText(/No ignore lists configured/))
      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(onClose).toHaveBeenCalled()
    })
  })
})
