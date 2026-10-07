import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { fetchPlaylistTracksWithPositions, fetchPlaylistTrackUris, removeTracksAtPositions } from '../spotifyApi'

export interface IgnoredEntry {
  uri: string
  title: string
  artist: string
  /** Position of this track in the playlist being live-edited */
  position: number
  /** Labels of every ignore list this track was found in */
  reasons: string[]
}

interface Props {
  playlistId: string
  playlistName: string
  onRemoved: () => void
  onClose: () => void
}

export default function IgnoredSongsDialog({ playlistId, playlistName, onRemoved, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [noIgnoreLists, setNoIgnoreLists] = useState(false)
  const [ignored, setIgnored] = useState<IgnoredEntry[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        // Ignore lists are only looked up/loaded here, when the dialog is
        // actually opened — never preloaded elsewhere.
        const ignoreLists = await api.getIgnoreLists()
        if (ignoreLists.length === 0) {
          if (!cancelled) setNoIgnoreLists(true)
          return
        }

        const [currentTracks, ignoreSets] = await Promise.all([
          fetchPlaylistTracksWithPositions(playlistId),
          Promise.all(ignoreLists.map(l => fetchPlaylistTrackUris(l.playlistId))),
        ])

        const entries: IgnoredEntry[] = currentTracks
          .map(t => {
            const reasons = ignoreLists
              .filter((_, i) => ignoreSets[i].has(t.uri))
              .map(l => l.label)
            return reasons.length > 0
              ? { uri: t.uri, title: t.title, artist: t.artist, position: t.position, reasons }
              : null
          })
          .filter((e): e is IgnoredEntry => e !== null)
          .sort((a, b) => a.title.localeCompare(b.title))

        if (!cancelled) {
          setIgnored(entries)
          setSelected(new Set(entries.map(e => e.position)))
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

  const allSelected = ignored.length > 0 && selected.size === ignored.length
  const someSelected = selected.size > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(ignored.map(e => e.position)))
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
      const toRemove = ignored
        .filter(e => selected.has(e.position))
        .map(e => ({ uri: e.uri, position: e.position }))
      await removeTracksAtPositions(playlistId, toRemove)
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
            <h2 className="text-lg font-semibold text-neutral-100">Ignored Songs</h2>
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
          {loading && <p className="text-sm text-neutral-400">Scanning for ignored songs…</p>}
          {loadError && <p className="text-sm text-red-400">{loadError}</p>}

          {!loading && !loadError && noIgnoreLists && (
            <p className="text-sm text-neutral-500">
              No ignore lists configured — set a default ignore playlist in Settings, or add
              ignore-reason tags, to use this feature.
            </p>
          )}

          {!loading && !loadError && !noIgnoreLists && (
            <>
              <p className="text-sm text-neutral-400 mb-3">
                {ignored.length === 0
                  ? 'No ignored songs found in this playlist'
                  : `${ignored.length} ignored song${ignored.length === 1 ? '' : 's'} found`}
              </p>

              {ignored.length > 0 && (
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
                    {ignored.map(e => (
                      <label
                        key={`${e.uri}-${e.position}`}
                        className="flex items-start gap-3 px-2 py-2.5 cursor-pointer hover:bg-neutral-800 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(e.position)}
                          onChange={() => toggle(e.position)}
                          className="accent-blue-500 mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-neutral-100 truncate">{e.title}</div>
                          <div className="text-xs text-neutral-400 truncate">{e.artist}</div>
                        </div>
                        <div className="text-right shrink-0 text-xs text-neutral-500 max-w-[40%]">
                          {e.reasons.join(', ')}
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
            {ignored.length > 0 && (
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
