import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PlaylistExportDialog from '../components/PlaylistExportDialog'
import type { SpotifyPlaylist, SpotifyTrackItem } from '../spotifyApi'

vi.mock('../spotifyApi', () => ({
  fetchAllPlaylists: vi.fn(),
  fetchPlaylistTracks: vi.fn(),
  getCurrentUserId: vi.fn(),
}))

import { fetchAllPlaylists, fetchPlaylistTracks, getCurrentUserId } from '../spotifyApi'
const mockFetchAllPlaylists = vi.mocked(fetchAllPlaylists)
const mockFetchPlaylistTracks = vi.mocked(fetchPlaylistTracks)
const mockGetCurrentUserId = vi.mocked(getCurrentUserId)

// ── fixtures ────────────────────────────────────────────────────────────────

const makePlaylists = (): SpotifyPlaylist[] => [
  { id: 'pl-b', name: 'Bachata',   tracksHref: 'https://api.spotify.com/v1/playlists/pl-b/tracks', ownerId: 'u1' },
  { id: 'pl-s', name: 'Salsa',     tracksHref: 'https://api.spotify.com/v1/playlists/pl-s/tracks', ownerId: 'u1' },
  { id: 'pl-a', name: 'Afrobeats', tracksHref: 'https://api.spotify.com/v1/playlists/pl-a/tracks', ownerId: 'u1' },
  { id: 'pl-f', name: 'Shared',    tracksHref: 'https://api.spotify.com/v1/playlists/pl-f/tracks', ownerId: 'other' },
]

const makeTracks = (): SpotifyTrackItem[] => [
  { uri: 'spotify:track:aaa', title: 'Track A', artist: 'Artist A', coverUrl: null, durationMs: 180000, addedAt: '2024-01-01' },
  { uri: 'spotify:track:bbb', title: 'Track B', artist: 'Artist B', coverUrl: null, durationMs: 200000, addedAt: '2024-02-01' },
]

// ── download capture helpers ─────────────────────────────────────────────────

async function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(blob)
  })
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

let capturedBlob: Blob | null = null
let capturedDownloadName: string | null = null

beforeEach(() => {
  capturedBlob = null
  capturedDownloadName = null
  vi.clearAllMocks()
  mockGetCurrentUserId.mockResolvedValue('u1')

  const originalCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = originalCreate(tag)
    if (tag === 'a') {
      vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {})
      Object.defineProperty(el, 'download', {
        set(v: string) { capturedDownloadName = v },
        get() { return capturedDownloadName ?? '' },
        configurable: true,
      })
    }
    return el
  })

  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
    capturedBlob = blob as Blob
    return 'blob:fake'
  })
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── tests ────────────────────────────────────────────────────────────────────

describe('PlaylistExportDialog', () => {
  describe('loading', () => {
    it('shows loading state while fetching playlists', () => {
      mockFetchAllPlaylists.mockReturnValue(new Promise(() => {}))
      render(<PlaylistExportDialog onClose={() => {}} />)
      expect(screen.getByText(/loading playlists/i)).toBeInTheDocument()
    })

    it('shows error when fetchAllPlaylists fails', async () => {
      mockFetchAllPlaylists.mockRejectedValue(new Error('Network error'))
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument())
    })

    it('shows "No playlists found" when the account has none', async () => {
      mockFetchAllPlaylists.mockResolvedValue([])
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => expect(screen.getByText(/no playlists found/i)).toBeInTheDocument())
    })
  })

  describe('search', () => {
    it('renders a search input once playlists are loaded', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByPlaceholderText(/search playlists/i))
    })

    it('filters the visible playlist checkboxes as the user types', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.type(screen.getByPlaceholderText(/search playlists/i), 'sa')

      expect(screen.queryByLabelText('Afrobeats')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Bachata')).not.toBeInTheDocument()
      expect(screen.getByLabelText('Salsa')).toBeInTheDocument()
    })

    it('is case-insensitive', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.type(screen.getByPlaceholderText(/search playlists/i), 'BACH')

      expect(screen.getByLabelText('Bachata')).toBeInTheDocument()
      expect(screen.queryByLabelText('Salsa')).not.toBeInTheDocument()
    })

    it('shows a "no match" message when nothing matches', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.type(screen.getByPlaceholderText(/search playlists/i), 'zzz')

      expect(screen.getByText(/no playlists match/i)).toBeInTheDocument()
    })

    it('"Select all" only selects visible (filtered) playlists', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.type(screen.getByPlaceholderText(/search playlists/i), 'sa')
      await userEvent.click(screen.getByLabelText('Select all'))

      expect(screen.getByLabelText('Salsa')).toBeChecked()
      // clear search — the other two should NOT be selected
      await userEvent.clear(screen.getByPlaceholderText(/search playlists/i))
      expect(screen.getByLabelText('Afrobeats')).not.toBeChecked()
      expect(screen.getByLabelText('Bachata')).not.toBeChecked()
    })

    it('previously selected playlists stay selected after the search is cleared', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      await userEvent.type(screen.getByPlaceholderText(/search playlists/i), 'sa')
      await userEvent.clear(screen.getByPlaceholderText(/search playlists/i))

      expect(screen.getByLabelText('Bachata')).toBeChecked()
    })
  })
  describe('playlist list', () => {
    it('renders a checkbox for each playlist sorted alphabetically', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      const checkboxes = screen.getAllByRole('checkbox')
      // index 0 = "Only my playlists", index 1 = "Select all", rest = playlist checkboxes
      const labels = checkboxes.slice(2).map(cb => cb.closest('label')?.textContent?.trim())
      expect(labels).toEqual(['Afrobeats', 'Bachata', 'Salsa', 'Shared'])
    })

    it('all checkboxes are unchecked initially', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      const playlistCheckboxes = screen.getAllByRole('checkbox').slice(2)
      playlistCheckboxes.forEach(cb => expect(cb).not.toBeChecked())
    })

    it('Export button is disabled when nothing is selected', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))
      expect(screen.getByRole('button', { name: /export json/i })).toBeDisabled()
    })
  })

  describe('ownership filter', () => {
    it('shows "Only my playlists" checkbox', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Only my playlists'))
    })

    it('is unchecked by default (shows all playlists)', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      expect(screen.getByLabelText('Only my playlists')).not.toBeChecked()
      expect(screen.getByLabelText('Shared')).toBeInTheDocument()
    })

    it('hides foreign-owned playlists when checked', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.click(screen.getByLabelText('Only my playlists'))

      expect(screen.getByLabelText('Afrobeats')).toBeInTheDocument()
      expect(screen.getByLabelText('Bachata')).toBeInTheDocument()
      expect(screen.getByLabelText('Salsa')).toBeInTheDocument()
      expect(screen.queryByLabelText('Shared')).not.toBeInTheDocument()
    })

    it('restores foreign-owned playlists when unchecked again', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.click(screen.getByLabelText('Only my playlists'))
      await userEvent.click(screen.getByLabelText('Only my playlists'))

      expect(screen.getByLabelText('Shared')).toBeInTheDocument()
    })

    it('combines with the search filter', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.click(screen.getByLabelText('Only my playlists'))
      await userEvent.type(screen.getByPlaceholderText(/search playlists/i), 'sa')

      expect(screen.getByLabelText('Salsa')).toBeInTheDocument()
      expect(screen.queryByLabelText('Bachata')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Shared')).not.toBeInTheDocument()
    })
  })

  describe('Select all', () => {
    it('checks all playlists when "Select all" is clicked', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.click(screen.getByLabelText('Select all'))

      const playlistCheckboxes = screen.getAllByRole('checkbox').slice(2)
      playlistCheckboxes.forEach(cb => expect(cb).toBeChecked())
    })

    it('unchecks all when "Select all" is clicked again', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.click(screen.getByLabelText('Select all'))
      await userEvent.click(screen.getByLabelText('Select all'))

      const playlistCheckboxes = screen.getAllByRole('checkbox').slice(2)
      playlistCheckboxes.forEach(cb => expect(cb).not.toBeChecked())
    })
  })

  describe('Export button label', () => {
    it('shows "Export JSON" when exactly one playlist is selected', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Bachata'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      expect(screen.getByRole('button', { name: /export json/i })).toBeInTheDocument()
    })

    it('shows "Export ZIP (n)" when multiple playlists are selected', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Bachata'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      await userEvent.click(screen.getByLabelText('Salsa'))
      expect(screen.getByRole('button', { name: /export zip \(2\)/i })).toBeInTheDocument()
    })
  })

  describe('single JSON export', () => {
    it('calls fetchPlaylistTracks with the correct tracksHref', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      mockFetchPlaylistTracks.mockResolvedValue(makeTracks())

      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Bachata'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      await userEvent.click(screen.getByRole('button', { name: /export json/i }))

      await waitFor(() => expect(mockFetchPlaylistTracks).toHaveBeenCalledWith(
        'https://api.spotify.com/v1/playlists/pl-b/tracks',
      ))
    })

    it('downloads a JSON file with correct playlist and track data', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      mockFetchPlaylistTracks.mockResolvedValue(makeTracks())

      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Bachata'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      await userEvent.click(screen.getByRole('button', { name: /export json/i }))
      await waitFor(() => expect(capturedBlob).not.toBeNull())

      expect(capturedBlob!.type).toBe('application/json')
      const payload = JSON.parse(await readBlobText(capturedBlob!))
      expect(payload.playlist.id).toBe('pl-b')
      expect(payload.playlist.name).toBe('Bachata')
      expect(payload.tracks).toHaveLength(2)
      expect(payload.tracks[0].uri).toBe('spotify:track:aaa')
      expect(payload.restoreHint.body.uris).toEqual(['spotify:track:aaa', 'spotify:track:bbb'])
    })

    it('uses a sanitised playlist name in the filename', async () => {
      const playlist: SpotifyPlaylist = {
        id: 'pl-x', name: 'My Cool Playlist!',
        tracksHref: 'https://api.spotify.com/v1/playlists/pl-x/tracks', ownerId: 'u1',
      }
      mockFetchAllPlaylists.mockResolvedValue([playlist])
      mockFetchPlaylistTracks.mockResolvedValue([])

      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('My Cool Playlist!'))

      await userEvent.click(screen.getByLabelText('My Cool Playlist!'))
      await userEvent.click(screen.getByRole('button', { name: /export json/i }))
      await waitFor(() => expect(capturedDownloadName).not.toBeNull())

      expect(capturedDownloadName).toMatch(/^playlist-backup-My_Cool_Playlist_-\d{4}-\d{2}-\d{2}\.json$/)
    })

    it('closes the dialog after a successful export', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      mockFetchPlaylistTracks.mockResolvedValue([])
      const onClose = vi.fn()

      render(<PlaylistExportDialog onClose={onClose} />)
      await waitFor(() => screen.getByLabelText('Bachata'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      await userEvent.click(screen.getByRole('button', { name: /export json/i }))
      await waitFor(() => expect(onClose).toHaveBeenCalled())
    })
  })

  describe('multi-playlist ZIP export', () => {
    it('downloads a ZIP file when multiple playlists are selected', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      mockFetchPlaylistTracks.mockResolvedValue(makeTracks())

      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Bachata'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      await userEvent.click(screen.getByLabelText('Salsa'))
      await userEvent.click(screen.getByRole('button', { name: /export zip/i }))

      await waitFor(() => expect(capturedBlob).not.toBeNull())
      expect(capturedBlob!.type).toBe('application/zip')
    })

    it('ZIP filename contains the current date', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      mockFetchPlaylistTracks.mockResolvedValue([])

      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Bachata'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      await userEvent.click(screen.getByLabelText('Salsa'))
      await userEvent.click(screen.getByRole('button', { name: /export zip/i }))

      await waitFor(() => expect(capturedDownloadName).not.toBeNull())
      expect(capturedDownloadName).toMatch(/^playlist-backup-\d{4}-\d{2}-\d{2}\.zip$/)
    })

    it('calls fetchPlaylistTracks once per selected playlist', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      mockFetchPlaylistTracks.mockResolvedValue([])

      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Bachata'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      await userEvent.click(screen.getByLabelText('Salsa'))
      await userEvent.click(screen.getByRole('button', { name: /export zip/i }))

      await waitFor(() => expect(mockFetchPlaylistTracks).toHaveBeenCalledTimes(2))
      expect(mockFetchPlaylistTracks).toHaveBeenCalledWith('https://api.spotify.com/v1/playlists/pl-b/tracks')
      expect(mockFetchPlaylistTracks).toHaveBeenCalledWith('https://api.spotify.com/v1/playlists/pl-s/tracks')
    })

    it('ZIP content is non-empty bytes', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      mockFetchPlaylistTracks.mockResolvedValue(makeTracks())

      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Bachata'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      await userEvent.click(screen.getByLabelText('Salsa'))
      await userEvent.click(screen.getByRole('button', { name: /export zip/i }))

      await waitFor(() => expect(capturedBlob).not.toBeNull())
      const bytes = await readBlobBytes(capturedBlob!)
      // ZIP files start with PK (0x50 0x4B)
      expect(bytes[0]).toBe(0x50)
      expect(bytes[1]).toBe(0x4b)
    })
  })

  describe('error handling', () => {
    it('shows error and re-enables button when fetchPlaylistTracks fails', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      mockFetchPlaylistTracks.mockRejectedValue(new Error('API error'))

      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Bachata'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      await userEvent.click(screen.getByRole('button', { name: /export json/i }))

      await waitFor(() => expect(screen.getByText('API error')).toBeInTheDocument())
      expect(screen.getByRole('button', { name: /export json/i })).not.toBeDisabled()
    })
  })

  describe('loading state during export', () => {
    it('shows "Exporting…" and disables the button while exporting', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      let resolve!: (v: SpotifyTrackItem[]) => void
      mockFetchPlaylistTracks.mockReturnValue(new Promise(r => { resolve = r }))

      render(<PlaylistExportDialog onClose={() => {}} />)
      await waitFor(() => screen.getByLabelText('Bachata'))

      await userEvent.click(screen.getByLabelText('Bachata'))
      await userEvent.click(screen.getByRole('button', { name: /export json/i }))

      const btn = await screen.findByRole('button', { name: /exporting/i })
      expect(btn).toBeDisabled()

      resolve([])
    })
  })

  describe('cancel / close', () => {
    it('calls onClose when the ✕ button is clicked', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      const onClose = vi.fn()

      render(<PlaylistExportDialog onClose={onClose} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.click(screen.getByRole('button', { name: /close/i }))
      expect(onClose).toHaveBeenCalled()
    })

    it('calls onClose when the Cancel button is clicked', async () => {
      mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
      const onClose = vi.fn()

      render(<PlaylistExportDialog onClose={onClose} />)
      await waitFor(() => screen.getByLabelText('Afrobeats'))

      await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
      expect(onClose).toHaveBeenCalled()
    })
  })
})
