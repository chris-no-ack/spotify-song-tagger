import { useEffect, useRef, useState } from 'react'
import { getConfig } from '../settingsStore'
import { getKnownAiArtists } from '../aiArtistList'
import { addTracksToPlaylist, fetchPlaylistTracksWithPositions, removeTracksAtPositions } from '../spotifyApi'

export interface AiMatchEntry {
  uri: string
  title: string
  artist: string
  /** Position of this track in the playlist being live-edited */
  position: number
}

interface Props {
  playlistId: string
  playlistName: string
  onRemoved: () => void
  onClose: () => void
}

export default function FindAiDialog({ playlistId, playlistName, onRemoved, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [noAiPlaylist, setNoAiPlaylist] = useState(false)
  const [matches, setMatches] = useState<AiMatchEntry[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const config = getConfig()
        if (!config.aiIgnorePlaylistId) {
          if (!cancelled) setNoAiPlaylist(true)
          return
        }

        const [tracks, knownAiArtists] = await Promise.all([
          fetchPlaylistTracksWithPositions(playlistId),
          getKnownAiArtists(),
        ])

        const found: AiMatchEntry[] = tracks
          .filter(t =>
            // Prefer the reliable Spotify artist ID; only fall back to a
            // name match when the track has no artist IDs at all, since
            // several distinct real artists share a name with an entry on
            // the known-AI-artist list (e.g. "Aurora").
            t.artistIds.length > 0
              ? t.artistIds.some(id => knownAiArtists.ids.has(id.toLowerCase()))
              : knownAiArtists.names.has(t.firstArtist.toLowerCase()),
          )
          .map(t => ({ uri: t.uri, title: t.title, artist: t.artist, position: t.position }))
          .sort((a, b) => a.title.localeCompare(b.title))

        if (!cancelled) {
          setMatches(found)
          setSelected(new Set(found.map(m => m.position)))
        }
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'Failed to scan playlist')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [playlistId])

  const allSelected = matches.length > 0 && selected.size === matches.length
  const someSelected = selected.size > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(matches.map(m => m.position)))
  }

  function toggle(position: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(position)) { next.delete(position) } else { next.add(position) }
      return next
    })
  }

  async function handleRemove() {
    if (selected.size === 0) return
    setRemoving(true)
    setRemoveError('')
    try {
      const config = getConfig()
      const toMove = matches.filter(m => selected.has(m.position))
      if (config.aiIgnorePlaylistId) {
        await addTracksToPlaylist(toMove.map(m => m.uri), config.aiIgnorePlaylistId)
      }
      await removeTracksAtPositions(playlistId, toMove.map(m => ({ uri: m.uri, position: m.position })))
      onRemoved()
      onClose()
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Failed to remove tracks')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-2xl mx-4">

        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">AI-Generated Tracks</h2>
            <p className="text-xs text-neutral-400 mt-0.5">{playlistName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4">
          {loading && <p className="text-sm text-neutral-400">Scanning for AI-generated tracks…</p>}
          {loadError && <p className="text-sm text-red-400">{loadError}</p>}

          {!loading && !loadError && noAiPlaylist && (
            <p className="text-sm text-neutral-500">
              No AI ignore playlist configured — set one in Settings to use this feature.
            </p>
          )}

          {!loading && !loadError && !noAiPlaylist && (
            <>
              <p className="text-sm text-neutral-400 mb-3">
                {matches.length === 0
                  ? 'No known AI-generated artists found in this playlist'
                  : `${matches.length} AI-generated track${matches.length === 1 ? '' : 's'} found`}
              </p>
              <p className="text-xs text-neutral-500 mb-3">
                Matched against a community-maintained list of known AI artists. Always spot-check
                before relying on it — it can miss artists or flag them incorrectly.
              </p>

              {matches.length > 0 && (
                <>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer text-sm text-neutral-300 border-b border-neutral-700 pb-2">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="accent-blue-500"
                    />
                    Select all
                  </label>

                  <div className="max-h-96 overflow-y-auto space-y-0">
                    {matches.map(m => (
                      <label
                        key={`${m.uri}-${m.position}`}
                        className="flex items-start gap-3 px-2 py-2.5 cursor-pointer hover:bg-neutral-800 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(m.position)}
                          onChange={() => toggle(m.position)}
                          className="accent-blue-500 mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-neutral-100 truncate">{m.title}</div>
                          <div className="text-xs text-neutral-400 truncate">{m.artist}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}

              {removeError && <p className="text-sm text-red-400 mt-3">{removeError}</p>}
            </>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-700">
          <span className="text-xs text-neutral-500">
            {selected.size > 0 ? `${selected.size} selected` : ''}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-4 py-2 rounded transition-colors"
            >
              Cancel
            </button>
            {matches.length > 0 && (
              <button
                onClick={handleRemove}
                disabled={selected.size === 0 || removing}
                className="text-sm bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded transition-colors"
              >
                {removing ? 'Removing…' : `Remove ${selected.size > 0 ? selected.size : ''} Selected`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
