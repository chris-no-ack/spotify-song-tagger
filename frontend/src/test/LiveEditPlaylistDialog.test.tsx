import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LiveEditPlaylistDialog from '../components/LiveEditPlaylistDialog'
import type { SpotifyPlaylist } from '../spotifyApi'

vi.mock('../spotifyApi', () => ({
  fetchAllPlaylists: vi.fn(),
  getCurrentUserId: vi.fn(),
}))

import { fetchAllPlaylists, getCurrentUserId } from '../spotifyApi'
const mockFetchAllPlaylists = vi.mocked(fetchAllPlaylists)
const mockGetCurrentUserId = vi.mocked(getCurrentUserId)

const makePlaylists = (): SpotifyPlaylist[] => [
  { id: 'pl-b', name: 'Bachata',   tracksHref: 'https://api.spotify.com/v1/playlists/pl-b/tracks', ownerId: 'u1' },
  { id: 'pl-s', name: 'Salsa',     tracksHref: 'https://api.spotify.com/v1/playlists/pl-s/tracks', ownerId: 'u1' },
  { id: 'pl-a', name: 'Afrobeats', tracksHref: 'https://api.spotify.com/v1/playlists/pl-a/tracks', ownerId: 'u1' },
  { id: 'pl-f', name: 'Shared',    tracksHref: 'https://api.spotify.com/v1/playlists/pl-f/tracks', ownerId: 'other' },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCurrentUserId.mockResolvedValue('u1')
  mockFetchAllPlaylists.mockResolvedValue(makePlaylists())
})

describe('LiveEditPlaylistDialog', () => {
  describe('initial load', () => {
    it('shows loading indicator while fetching', () => {
      mockFetchAllPlaylists.mockReturnValue(new Promise(() => {}))
      render(<LiveEditPlaylistDialog onSelect={vi.fn()} onClose={vi.fn()} />)
      expect(screen.getByText('Loading playlists…')).toBeInTheDocument()
    })

    it('renders all playlists sorted alphabetically after load', async () => {
      render(<LiveEditPlaylistDialog onSelect={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('Afrobeats')).toBeInTheDocument())
      const items = screen.getAllByRole('radio')
      expect(items.map(r => (r as HTMLInputElement).value)).toEqual(['pl-a', 'pl-b', 'pl-s', 'pl-f'])
    })

    it('shows error message when loading fails', async () => {
      mockFetchAllPlaylists.mockRejectedValue(new Error('Network error'))
      render(<LiveEditPlaylistDialog onSelect={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument())
    })

    it('"Start Editing" button is disabled initially', async () => {
      render(<LiveEditPlaylistDialog onSelect={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('Afrobeats'))
      expect(screen.getByRole('button', { name: 'Start Editing' })).toBeDisabled()
    })
  })

  describe('selection', () => {
    it('enables "Start Editing" when a playlist is selected', async () => {
      const user = userEvent.setup()
      render(<LiveEditPlaylistDialog onSelect={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('Bachata'))
      await user.click(screen.getByText('Bachata'))
      expect(screen.getByRole('button', { name: 'Start Editing' })).not.toBeDisabled()
    })

    it('calls onSelect with the selected playlist when confirmed', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(<LiveEditPlaylistDialog onSelect={onSelect} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('Salsa'))
      await user.click(screen.getByText('Salsa'))
      await user.click(screen.getByRole('button', { name: 'Start Editing' }))
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'pl-s', name: 'Salsa' }))
    })

    it('does not call onSelect when cancelled', async () => {
      const user = userEvent.setup()
      const onSelect = vi.fn()
      render(<LiveEditPlaylistDialog onSelect={onSelect} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('Bachata'))
      await user.click(screen.getByText('Bachata'))
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('calls onClose when X button is clicked', async () => {
      const user = userEvent.setup()
      const onClose = vi.fn()
      render(<LiveEditPlaylistDialog onSelect={vi.fn()} onClose={onClose} />)
      await waitFor(() => screen.getByText('Bachata'))
      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(onClose).toHaveBeenCalled()
    })
  })

  describe('search', () => {
    it('filters visible playlists by name', async () => {
      const user = userEvent.setup()
      render(<LiveEditPlaylistDialog onSelect={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('Bachata'))
      await user.type(screen.getByPlaceholderText('Search playlists…'), 'sal')
      expect(screen.getByText('Salsa')).toBeInTheDocument()
      expect(screen.queryByText('Bachata')).not.toBeInTheDocument()
    })

    it('is case-insensitive', async () => {
      const user = userEvent.setup()
      render(<LiveEditPlaylistDialog onSelect={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('Afrobeats'))
      await user.type(screen.getByPlaceholderText('Search playlists…'), 'AFRO')
      expect(screen.getByText('Afrobeats')).toBeInTheDocument()
      expect(screen.queryByText('Bachata')).not.toBeInTheDocument()
    })

    it('shows empty message when no playlists match', async () => {
      const user = userEvent.setup()
      render(<LiveEditPlaylistDialog onSelect={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('Bachata'))
      await user.type(screen.getByPlaceholderText('Search playlists…'), 'zzz')
      expect(screen.getByText('No playlists match your search.')).toBeInTheDocument()
    })
  })

  describe('ownership filter', () => {
    it('shows all playlists by default', async () => {
      render(<LiveEditPlaylistDialog onSelect={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('Shared'))
      expect(screen.getByText('Shared')).toBeInTheDocument()
    })

    it('hides foreign playlists when "Only my playlists" is checked', async () => {
      const user = userEvent.setup()
      render(<LiveEditPlaylistDialog onSelect={vi.fn()} onClose={vi.fn()} />)
      await waitFor(() => screen.getByText('Shared'))
      await user.click(screen.getByLabelText('Only my playlists'))
      expect(screen.queryByText('Shared')).not.toBeInTheDocument()
      expect(screen.getByText('Bachata')).toBeInTheDocument()
    })
  })
})
