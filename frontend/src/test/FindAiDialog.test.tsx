import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FindAiDialog from '../components/FindAiDialog'
import type { SpotifyTrackItemWithPosition } from '../spotifyApi'
import type { KnownAiArtists } from '../aiArtistList'

vi.mock('../spotifyApi', () => ({
  fetchPlaylistTracksWithPositions: vi.fn(),
  removeTracksAtPositions: vi.fn(),
  addTracksToPlaylist: vi.fn(),
}))

vi.mock('../aiArtistList', () => ({
  getKnownAiArtists: vi.fn(),
}))

vi.mock('../settingsStore', () => ({
  getConfig: vi.fn(),
}))

import { fetchPlaylistTracksWithPositions, removeTracksAtPositions, addTracksToPlaylist } from '../spotifyApi'
import { getKnownAiArtists } from '../aiArtistList'
import { getConfig } from '../settingsStore'

const mockFetchTracks = vi.mocked(fetchPlaylistTracksWithPositions)
const mockRemove = vi.mocked(removeTracksAtPositions)
const mockAddTracks = vi.mocked(addTracksToPlaylist)
const mockGetKnownAiArtists = vi.mocked(getKnownAiArtists)
const mockGetConfig = vi.mocked(getConfig)

function makeTrack(overrides: Partial<SpotifyTrackItemWithPosition>): SpotifyTrackItemWithPosition {
  return {
    uri: 'spotify:track:aaa',
    title: 'Track A',
    artist: 'Artist A',
    firstArtist: 'Artist A',
    artistIds: ['artist-a-id'],
    coverUrl: null,
    durationMs: 180000,
    addedAt: '2024-01-01',
    releaseDate: null,
    position: 0,
    ...overrides,
  }
}

const emptyAiArtists: KnownAiArtists = { ids: new Set(), names: new Set() }

function baseConfig(overrides: Partial<ReturnType<typeof getConfig>> = {}) {
  return {
    spotifyClientId: '', playlistNameFilter: '', playlistNameBlacklist: [],
    ignorePlaylistId: '', aiIgnorePlaylistId: 'ai-playlist-1', shazamPlaylistId: '',
    anthropicApiKey: '', anthropicProxyUrl: '', categoryNames: [],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRemove.mockResolvedValue(undefined)
  mockAddTracks.mockResolvedValue(undefined)
  mockGetConfig.mockReturnValue(baseConfig())
})

describe('FindAiDialog', () => {
  describe('loading', () => {
    it('shows scanning message while loading', () => {
      mockFetchTracks.mockReturnValue(new Promise(() => {}))
      mockGetKnownAiArtists.mockResolvedValue(emptyAiArtists)
      render(<FindAiDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      expect(screen.getByText('Scanning for AI-generated tracks…')).toBeInTheDocument()
    })

    it('shows error when fetching the AI artist list fails', async () => {
      mockFetchTracks.mockResolvedValue([])
      mockGetKnownAiArtists.mockRejectedValue(new Error('Network error'))
      render(<FindAiDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument())
    })
  })

  describe('no AI ignore playlist configured', () => {
    it('shows a message instead of scanning', async () => {
      mockGetConfig.mockReturnValue(baseConfig({ aiIgnorePlaylistId: '' }))
      render(<FindAiDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText(/No AI ignore playlist configured/)).toBeInTheDocument())
      expect(mockFetchTracks).not.toHaveBeenCalled()
    })
  })

  describe('matching', () => {
    it('matches tracks by artist ID', async () => {
      mockFetchTracks.mockResolvedValue([
        makeTrack({ uri: 'spotify:track:aaa', title: 'Track A', artistIds: ['ai-id-1'], position: 0 }),
        makeTrack({ uri: 'spotify:track:bbb', title: 'Track B', artistIds: ['normal-id'], position: 1 }),
      ])
      mockGetKnownAiArtists.mockResolvedValue({ ids: new Set(['ai-id-1']), names: new Set() })
      render(<FindAiDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('1 AI-generated track found')).toBeInTheDocument())
      expect(screen.getByText('Track A')).toBeInTheDocument()
      expect(screen.queryByText('Track B')).not.toBeInTheDocument()
    })

    it('falls back to matching by artist name only when the track has no artist IDs at all', async () => {
      mockFetchTracks.mockResolvedValue([
        makeTrack({ uri: 'spotify:track:aaa', title: 'Track A', firstArtist: 'Known AI Act', artistIds: [], position: 0 }),
      ])
      mockGetKnownAiArtists.mockResolvedValue({ ids: new Set(), names: new Set(['known ai act']) })
      render(<FindAiDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('1 AI-generated track found')).toBeInTheDocument())
    })

    it('does not match by name when the track has a known artist ID that is not on the list (avoids false positives for same-named artists)', async () => {
      mockFetchTracks.mockResolvedValue([
        makeTrack({ uri: 'spotify:track:aaa', title: 'Churchyard', firstArtist: 'AURORA', artistIds: ['real-aurora-id'], position: 0 }),
      ])
      // "aurora" is a known AI act name, but this track's actual artist ID isn't on the list
      mockGetKnownAiArtists.mockResolvedValue({ ids: new Set(['some-other-ai-id']), names: new Set(['aurora']) })
      render(<FindAiDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('No known AI-generated artists found in this playlist')).toBeInTheDocument())
    })

    it('shows "No known AI-generated artists found" when nothing matches', async () => {
      mockFetchTracks.mockResolvedValue([makeTrack({})])
      mockGetKnownAiArtists.mockResolvedValue(emptyAiArtists)
      render(<FindAiDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('No known AI-generated artists found in this playlist')).toBeInTheDocument())
    })
  })

  describe('removal', () => {
    it('adds matched tracks to the AI ignore playlist and removes them from the current playlist', async () => {
      const user = userEvent.setup()
      const onRemoved = vi.fn()
      const onClose = vi.fn()
      mockFetchTracks.mockResolvedValue([makeTrack({ uri: 'spotify:track:aaa', artistIds: ['ai-id-1'], position: 0 })])
      mockGetKnownAiArtists.mockResolvedValue({ ids: new Set(['ai-id-1']), names: new Set() })
      render(<FindAiDialog playlistId="pl1" playlistName="My Playlist" onRemoved={onRemoved} onClose={onClose} />)
      await waitFor(() => screen.getByText('1 AI-generated track found'))
      await user.click(screen.getByRole('button', { name: /Remove/i }))
      expect(mockAddTracks).toHaveBeenCalledWith(['spotify:track:aaa'], 'ai-playlist-1')
      expect(mockRemove).toHaveBeenCalledWith('pl1', [{ uri: 'spotify:track:aaa', position: 0 }])
      expect(onRemoved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })

    it('shows error when removal fails', async () => {
      const user = userEvent.setup()
      mockFetchTracks.mockResolvedValue([makeTrack({ uri: 'spotify:track:aaa', artistIds: ['ai-id-1'], position: 0 })])
      mockGetKnownAiArtists.mockResolvedValue({ ids: new Set(['ai-id-1']), names: new Set() })
      mockRemove.mockRejectedValue(new Error('Remove failed'))
      render(<FindAiDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('1 AI-generated track found'))
      await user.click(screen.getByRole('button', { name: /Remove/i }))
      await waitFor(() => expect(screen.getByText('Remove failed')).toBeInTheDocument())
    })
  })

  describe('close', () => {
    it('calls onClose when X is clicked', async () => {
      const user = userEvent.setup()
      mockGetConfig.mockReturnValue(baseConfig({ aiIgnorePlaylistId: '' }))
      const onClose = vi.fn()
      render(<FindAiDialog playlistId="pl1" playlistName="My Playlist" onRemoved={vi.fn()} onClose={onClose} />)
      await waitFor(() => screen.getByText(/No AI ignore playlist configured/))
      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(onClose).toHaveBeenCalled()
    })
  })
})
