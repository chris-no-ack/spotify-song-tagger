import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DuplicatesDialog from '../components/DuplicatesDialog'
import type { SpotifyTrackItemWithPosition } from '../spotifyApi'

vi.mock('../spotifyApi', () => ({
  fetchPlaylistTracksWithPositions: vi.fn(),
  removeTracksAtPositions: vi.fn(),
}))

import { fetchPlaylistTracksWithPositions, removeTracksAtPositions } from '../spotifyApi'
const mockFetch = vi.mocked(fetchPlaylistTracksWithPositions)
const mockRemove = vi.mocked(removeTracksAtPositions)

function makeTrack(overrides: Partial<SpotifyTrackItemWithPosition>): SpotifyTrackItemWithPosition {
  return {
    uri: 'spotify:track:aaa',
    title: 'Track A',
    artist: 'Artist A',
    coverUrl: null,
    durationMs: 180000,
    addedAt: '2024-01-01',
    position: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRemove.mockResolvedValue(undefined)
})

describe('DuplicatesDialog', () => {
  describe('loading', () => {
    it('shows scanning message while loading', () => {
      mockFetch.mockReturnValue(new Promise(() => {}))
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      expect(screen.getByText('Scanning for duplicates…')).toBeInTheDocument()
    })

    it('shows error when fetch fails', async () => {
      mockFetch.mockRejectedValue(new Error('API error'))
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('API error')).toBeInTheDocument())
    })
  })

  describe('no duplicates', () => {
    it('shows "No duplicates found" when all tracks are unique', async () => {
      mockFetch.mockResolvedValue([
        makeTrack({ uri: 'spotify:track:aaa', position: 0 }),
        makeTrack({ uri: 'spotify:track:bbb', title: 'Track B', position: 1 }),
      ])
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('No duplicates found')).toBeInTheDocument())
    })
  })

  describe('duplicates found', () => {
    const tracksWithDup = [
      makeTrack({ uri: 'spotify:track:aaa', title: 'Track A', position: 0, addedAt: '2024-01-01' }),
      makeTrack({ uri: 'spotify:track:bbb', title: 'Track B', position: 1, addedAt: '2024-02-01' }),
      makeTrack({ uri: 'spotify:track:aaa', title: 'Track A', position: 2, addedAt: '2024-03-01' }),
    ]

    it('shows the count of duplicates found', async () => {
      mockFetch.mockResolvedValue(tracksWithDup)
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('1 duplicate found')).toBeInTheDocument())
    })

    it('shows the duplicate track title and artist', async () => {
      mockFetch.mockResolvedValue(tracksWithDup)
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getAllByText('Track A').length).toBeGreaterThan(0))
      expect(screen.getByText('Artist A')).toBeInTheDocument()
    })

    it('shows addedAt and originalAddedAt dates', async () => {
      mockFetch.mockResolvedValue(tracksWithDup)
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('1 duplicate found'))
      // addedAt of the duplicate (position 2) is 2024-03-01
      expect(screen.getByText(/Mar/)).toBeInTheDocument()
      // originalAddedAt is 2024-01-01
      expect(screen.getByText(/Jan/)).toBeInTheDocument()
    })

    it('all duplicates are pre-selected', async () => {
      mockFetch.mockResolvedValue(tracksWithDup)
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('1 duplicate found'))
      const checkboxes = screen.getAllByRole('checkbox')
      // [0] = Select all, [1] = the duplicate checkbox
      expect((checkboxes[1] as HTMLInputElement).checked).toBe(true)
    })

    it('shows the correct newer occurrence as duplicate (not the original)', async () => {
      // position 0 is original (addedAt 2024-01-01), position 2 is duplicate (addedAt 2024-03-01)
      mockFetch.mockResolvedValue(tracksWithDup)
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('1 duplicate found'))
      // Should show "Added: Mar 1, 2024" for the duplicate
      expect(screen.getByText(/Mar 1/i, { exact: false })).toBeInTheDocument()
    })
  })

  describe('multiple duplicates of same song', () => {
    it('shows an entry for each duplicate occurrence', async () => {
      mockFetch.mockResolvedValue([
        makeTrack({ uri: 'spotify:track:aaa', position: 0, addedAt: '2024-01-01' }),
        makeTrack({ uri: 'spotify:track:aaa', position: 1, addedAt: '2024-02-01' }),
        makeTrack({ uri: 'spotify:track:aaa', position: 2, addedAt: '2024-03-01' }),
      ])
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('2 duplicates found')).toBeInTheDocument())
    })
  })

  describe('select all', () => {
    const tracksWithTwoDups = [
      makeTrack({ uri: 'spotify:track:aaa', title: 'Track A', position: 0, addedAt: '2024-01-01' }),
      makeTrack({ uri: 'spotify:track:aaa', title: 'Track A', position: 1, addedAt: '2024-02-01' }),
      makeTrack({ uri: 'spotify:track:bbb', title: 'Track B', position: 2, addedAt: '2024-01-15' }),
      makeTrack({ uri: 'spotify:track:bbb', title: 'Track B', position: 3, addedAt: '2024-03-01' }),
    ]

    it('unchecking "Select all" deselects all', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(tracksWithTwoDups)
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('2 duplicates found'))
      await user.click(screen.getByLabelText('Select all'))
      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.slice(1).forEach(cb => expect((cb as HTMLInputElement).checked).toBe(false))
    })

    it('checking "Select all" when none selected re-selects all', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(tracksWithTwoDups)
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('2 duplicates found'))
      // deselect all first
      await user.click(screen.getByLabelText('Select all'))
      // now re-select all
      await user.click(screen.getByLabelText('Select all'))
      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.slice(1).forEach(cb => expect((cb as HTMLInputElement).checked).toBe(true))
    })
  })

  describe('removal', () => {
    const tracksWithDup = [
      makeTrack({ uri: 'spotify:track:aaa', position: 0, addedAt: '2024-01-01' }),
      makeTrack({ uri: 'spotify:track:aaa', position: 2, addedAt: '2024-03-01' }),
    ]

    it('calls removeTracksAtPositions with the selected duplicates', async () => {
      const user = userEvent.setup()
      const onRemoved = vi.fn()
      const onClose = vi.fn()
      mockFetch.mockResolvedValue(tracksWithDup)
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={onRemoved} onClose={onClose} />)
      await waitFor(() => screen.getByText('1 duplicate found'))
      await user.click(screen.getByRole('button', { name: /Remove/i }))
      expect(mockRemove).toHaveBeenCalledWith('pl1', [{ uri: 'spotify:track:aaa', position: 2 }])
      expect(onRemoved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })

    it('does not remove deselected entries', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(tracksWithDup)
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('1 duplicate found'))
      // deselect the only duplicate
      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[1])
      await user.click(screen.getByRole('button', { name: /Remove/i }))
      expect(mockRemove).not.toHaveBeenCalled()
    })

    it('shows error when removal fails', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue(tracksWithDup)
      mockRemove.mockRejectedValue(new Error('Remove failed'))
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('1 duplicate found'))
      await user.click(screen.getByRole('button', { name: /Remove/i }))
      await waitFor(() => expect(screen.getByText('Remove failed')).toBeInTheDocument())
    })
  })

  describe('close', () => {
    it('calls onClose when X is clicked', async () => {
      const user = userEvent.setup()
      mockFetch.mockResolvedValue([])
      const onClose = vi.fn()
      render(<DuplicatesDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={onClose} />)
      await waitFor(() => screen.getByText('No duplicates found'))
      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(onClose).toHaveBeenCalled()
    })
  })
})
