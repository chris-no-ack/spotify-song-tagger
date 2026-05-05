import { useEffect, useState } from 'react'
import { fetchAllPlaylists, getCurrentUserId } from '../spotifyApi'
import type { SpotifyPlaylist } from '../spotifyApi'

interface Props {
  onSelect: (playlist: SpotifyPlaylist) => void
  onClose: () => void
}

export default function LiveEditPlaylistDialog({ onSelect, onClose }: Props) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([fetchAllPlaylists(), getCurrentUserId()])
      .then(([all, userId]) => {
        all.sort((a, b) => a.name.localeCompare(b.name))
        setPlaylists(all)
        setCurrentUserId(userId)
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Failed to load playlists'))
      .finally(() => setLoading(false))
  }, [])

  const visiblePlaylists = playlists
    .filter(p => !onlyMine || p.ownerId === currentUserId)
    .filter(p => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()))

  function handleConfirm() {
    const playlist = playlists.find(p => p.id === selectedId)
    if (playlist) onSelect(playlist)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-lg mx-4">

        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-100">Live Edit Playlist</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4">
          {loading && <p className="text-sm text-neutral-400">Loading playlists…</p>}
          {loadError && <p className="text-sm text-red-400">{loadError}</p>}
          {!loading && !loadError && playlists.length === 0 && (
            <p className="text-sm text-neutral-400">No playlists found.</p>
          )}
          {!loading && playlists.length > 0 && (
            <div className="space-y-3">
              <input
                type="search"
                placeholder="Search playlists…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-1.5 border border-neutral-600 focus:outline-none focus:border-neutral-400 placeholder-neutral-500"
              />
              <label className="flex items-center gap-2 cursor-pointer text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={onlyMine}
                  onChange={e => setOnlyMine(e.target.checked)}
                  className="accent-blue-500"
                />
                Only my playlists
              </label>
              <div className="max-h-72 overflow-y-auto space-y-0.5 border border-neutral-700 rounded">
                {visiblePlaylists.map(p => (
                  <label
                    key={p.id}
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm transition-colors ${
                      selectedId === p.id
                        ? 'bg-blue-600 text-white'
                        : 'text-neutral-200 hover:bg-neutral-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="playlist"
                      value={p.id}
                      checked={selectedId === p.id}
                      onChange={() => setSelectedId(p.id)}
                      className="sr-only"
                    />
                    {p.name}
                  </label>
                ))}
                {visiblePlaylists.length === 0 && (
                  <p className="text-sm text-neutral-500 px-3 py-2">No playlists match your search.</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-700">
          <button
            onClick={onClose}
            className="text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-4 py-2 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selectedId}
            className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded transition-colors"
          >
            Start Editing
          </button>
        </div>
      </div>
    </div>
  )
}
