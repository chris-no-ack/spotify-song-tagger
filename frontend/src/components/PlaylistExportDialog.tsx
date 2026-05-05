import { useEffect, useState } from 'react'
import { zipSync, strToU8 } from 'fflate'
import { fetchAllPlaylists, fetchPlaylistTracks, getCurrentUserId } from '../spotifyApi'
import type { SpotifyPlaylist } from '../spotifyApi'

interface Props {
  onClose: () => void
}

function buildPayload(playlist: SpotifyPlaylist, tracks: Awaited<ReturnType<typeof fetchPlaylistTracks>>) {
  return {
    playlist: {
      id: playlist.id,
      name: playlist.name,
      ownerId: playlist.ownerId,
      exportedAt: new Date().toISOString(),
    },
    tracks: tracks.map(t => ({
      uri: t.uri,
      title: t.title,
      artist: t.artist,
      addedAt: t.addedAt,
    })),
    restoreHint: {
      endpoint: 'POST https://api.spotify.com/v1/playlists/{NEW_PLAYLIST_ID}/tracks',
      body: { uris: tracks.map(t => t.uri) },
      note: 'Spotify accepts max 100 URIs per request — split into batches if needed.',
    },
  }
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function PlaylistExportDialog({ onClose }: Props) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState('')
  const [search, setSearch] = useState('')
  const [onlyMine, setOnlyMine] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

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

  function toggleAll() {
    const allVisibleSelected = visiblePlaylists.every(p => selected.has(p.id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visiblePlaylists.forEach(p => next.delete(p.id))
      } else {
        visiblePlaylists.forEach(p => next.add(p.id))
      }
      return next
    })
  }

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  async function handleExport() {
    const toExport = playlists.filter(p => selected.has(p.id))
    if (toExport.length === 0) return

    setExportError('')
    setExporting(true)
    try {
      if (toExport.length === 1) {
        const playlist = toExport[0]
        const tracks = await fetchPlaylistTracks(playlist.tracksHref)
        const json = JSON.stringify(buildPayload(playlist, tracks), null, 2)
        const date = new Date().toISOString().slice(0, 10)
        triggerDownload(
          new Blob([json], { type: 'application/json' }),
          `playlist-backup-${safeName(playlist.name)}-${date}.json`,
        )
      } else {
        const date = new Date().toISOString().slice(0, 10)
        const files: Record<string, Uint8Array> = {}
        for (const playlist of toExport) {
          const tracks = await fetchPlaylistTracks(playlist.tracksHref)
          const json = JSON.stringify(buildPayload(playlist, tracks), null, 2)
          files[`playlist-backup-${safeName(playlist.name)}-${date}.json`] = strToU8(json)
        }
        const zipped = zipSync(files)
        triggerDownload(
          new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' }),
          `playlist-backup-${date}.zip`,
        )
      }
      onClose()
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const allVisibleSelected = visiblePlaylists.length > 0 && visiblePlaylists.every(p => selected.has(p.id))
  const someVisibleSelected = visiblePlaylists.some(p => selected.has(p.id)) && !allVisibleSelected

  const exportLabel = exporting
    ? 'Exporting…'
    : selected.size > 1
      ? `Export ZIP (${selected.size})`
      : 'Export JSON'

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-lg mx-4">

        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-100">Export Playlists</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4">
          {loading && (
            <p className="text-sm text-neutral-400">Loading playlists…</p>
          )}
          {loadError && (
            <p className="text-sm text-red-400">{loadError}</p>
          )}
          {!loading && !loadError && playlists.length === 0 && (
            <p className="text-sm text-neutral-400">No playlists found.</p>
          )}
          {!loading && playlists.length > 0 && (
            <div className="space-y-1">
              <input
                type="search"
                placeholder="Search playlists…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-1.5 border border-neutral-600 focus:outline-none focus:border-neutral-400 placeholder-neutral-500 mb-3"
              />
              <label className="flex items-center gap-2 mb-3 cursor-pointer text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={onlyMine}
                  onChange={e => setOnlyMine(e.target.checked)}
                  className="accent-blue-500"
                />
                Only my playlists
              </label>
              <label className="flex items-center gap-2 py-1 cursor-pointer text-sm text-neutral-300 border-b border-neutral-700 mb-2 pb-2">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={el => { if (el) el.indeterminate = someVisibleSelected }}
                  onChange={toggleAll}
                  className="accent-blue-500"
                />
                Select all
              </label>
              <div className="max-h-72 overflow-y-auto space-y-1">
                {visiblePlaylists.map(p => (
                  <label key={p.id} className="flex items-center gap-2 py-0.5 cursor-pointer text-sm text-neutral-200 hover:text-white">
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggle(p.id)}
                      className="accent-blue-500"
                    />
                    {p.name}
                  </label>
                ))}
                {visiblePlaylists.length === 0 && (
                  <p className="text-sm text-neutral-500 py-1">No playlists match your search.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {exportError && (
          <p className="px-6 pb-2 text-xs text-red-400">{exportError}</p>
        )}

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-700">
          <button
            onClick={onClose}
            className="text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-4 py-2 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || selected.size === 0}
            className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded transition-colors"
          >
            {exportLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
