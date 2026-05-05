import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchPlaylistTracksWithPositions, removeTracksAtPositions } from '../spotifyApi'
import type { SpotifyTrackItemWithPosition } from '../spotifyApi'

export interface DuplicateEntry {
  uri: string
  title: string
  artist: string
  /** Position of this duplicate occurrence in the playlist */
  position: number
  /** When this duplicate was added */
  addedAt: string | null
  /** When the first (original) copy was added */
  originalAddedAt: string | null
}

interface Props {
  playlistId: string
  playlistName: string
  onRemoved: () => void
  onClose: () => void
}

function detectDuplicates(tracks: SpotifyTrackItemWithPosition[]): DuplicateEntry[] {
  const grouped = new Map<string, SpotifyTrackItemWithPosition[]>()
  for (const t of tracks) {
    const group = grouped.get(t.uri) ?? []
    group.push(t)
    grouped.set(t.uri, group)
  }

  const entries: DuplicateEntry[] = []
  for (const occurrences of grouped.values()) {
    if (occurrences.length < 2) continue
    // Sort: earliest addedAt first; if equal or null, lower position first
    const sorted = [...occurrences].sort((a, b) => {
      if (a.addedAt && b.addedAt) return a.addedAt.localeCompare(b.addedAt) || a.position - b.position
      if (a.addedAt) return -1
      if (b.addedAt) return 1
      return a.position - b.position
    })
    const original = sorted[0]
    for (const dup of sorted.slice(1)) {
      entries.push({
        uri: dup.uri,
        title: dup.title,
        artist: dup.artist,
        position: dup.position,
        addedAt: dup.addedAt,
        originalAddedAt: original.addedAt,
      })
    }
  }
  // Sort entries by title for display
  return entries.sort((a, b) => a.title.localeCompare(b.title))
}

function fmt(date: string | null): string {
  if (!date) return 'unknown date'
  return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function DuplicatesDialog({ playlistId, playlistName, onRemoved, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [duplicates, setDuplicates] = useState<DuplicateEntry[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchPlaylistTracksWithPositions(playlistId)
      .then(tracks => {
        const found = detectDuplicates(tracks)
        setDuplicates(found)
        setSelected(new Set(found.map(d => d.position)))
      })
      .catch(e => setLoadError(e instanceof Error ? e.message : 'Failed to scan playlist'))
      .finally(() => setLoading(false))
  }, [playlistId])

  const allSelected = duplicates.length > 0 && selected.size === duplicates.length
  const someSelected = selected.size > 0 && !allSelected

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(duplicates.map(d => d.position)))
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
      const toRemove = duplicates
        .filter(d => selected.has(d.position))
        .map(d => ({ uri: d.uri, position: d.position }))
      await removeTracksAtPositions(playlistId, toRemove)
      onRemoved()
      onClose()
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Failed to remove tracks')
    } finally {
      setRemoving(false)
    }
  }

  const useMemo_label = useMemo(() => {
    if (duplicates.length === 0) return 'No duplicates found'
    return `${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'} found`
  }, [duplicates.length])

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-2xl mx-4">

        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
          <div>
            <h2 className="text-lg font-semibold text-neutral-100">Duplicate Tracks</h2>
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
          {loading && <p className="text-sm text-neutral-400">Scanning for duplicates…</p>}
          {loadError && <p className="text-sm text-red-400">{loadError}</p>}

          {!loading && !loadError && (
            <>
              <p className="text-sm text-neutral-400 mb-3">{useMemo_label}</p>

              {duplicates.length > 0 && (
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
                    {duplicates.map(d => (
                      <label
                        key={`${d.uri}-${d.position}`}
                        className="flex items-start gap-3 px-2 py-2.5 cursor-pointer hover:bg-neutral-800 rounded transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(d.position)}
                          onChange={() => toggle(d.position)}
                          className="accent-blue-500 mt-0.5 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-neutral-100 truncate">{d.title}</div>
                          <div className="text-xs text-neutral-400 truncate">{d.artist}</div>
                        </div>
                        <div className="text-right shrink-0 text-xs text-neutral-500">
                          <div>Added: <span className="text-neutral-300">{fmt(d.addedAt)}</span></div>
                          <div>Original: <span className="text-neutral-400">{fmt(d.originalAddedAt)}</span></div>
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
            {duplicates.length > 0 && (
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
