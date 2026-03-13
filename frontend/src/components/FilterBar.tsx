import { useState } from 'react'
import { api } from '../api'
import type { SyncProgress } from '../api'
import type { SpotifyStatus } from '../types'

interface Props {
  categories: string[]
  missingFilter: string
  onMissingFilterChange: (v: string) => void
  minMissing: number
  onMinMissingChange: (v: number) => void
  sort: 'discovered' | 'missing'
  onSortChange: (v: 'discovered' | 'missing') => void
  spotifyStatus: SpotifyStatus
  onLogout: () => void
  onSyncDone: () => void
  onOpenSettings: () => void
  shazamMode: boolean
  onShazamModeChange: (v: boolean) => void
  shazamConfigured: boolean
}

export default function FilterBar({ categories, missingFilter, onMissingFilterChange, minMissing, onMinMissingChange, sort, onSortChange, spotifyStatus, onLogout, onSyncDone, onOpenSettings, shazamMode, onShazamModeChange, shazamConfigured }: Props) {
  const [progress, setProgress] = useState<SyncProgress | null>(null)

  const handleSync = async () => {
    setProgress({ current: '', done: 0, total: 0 })
    try {
      await api.syncPlaylists(setProgress)
      onSyncDone()
    } finally {
      setProgress(null)
    }
  }

  const syncing = progress !== null

  return (
    <>
      {syncing && (
        <div className="flex items-center gap-3 px-4 py-2 bg-neutral-700 border-b border-neutral-600 text-xs text-neutral-300">
          <svg className="animate-spin h-3.5 w-3.5 text-green-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-neutral-400 shrink-0">
            {progress.total > 0 ? `${progress.done}/${progress.total}` : 'Connecting…'}
          </span>
          {progress.current && (
            <span className="truncate text-neutral-200">{progress.current}</span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 px-4 py-2 bg-neutral-800 border-b border-neutral-700 flex-wrap">
        <span className="text-sm font-semibold text-neutral-400">Missing:</span>
        <select
          value={missingFilter}
          onChange={e => onMissingFilterChange(e.target.value)}
          className="bg-neutral-700 text-neutral-100 text-sm rounded px-2 py-1 border border-neutral-600 focus:outline-none"
        >
          <option value="">All songs</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <span className="text-sm font-semibold text-neutral-400">Min missing:</span>
        <select
          aria-label="Min missing"
          value={minMissing}
          onChange={e => onMinMissingChange(Number(e.target.value))}
          className="bg-neutral-700 text-neutral-100 text-sm rounded px-2 py-1 border border-neutral-600 focus:outline-none"
        >
          <option value={0}>Any</option>
          {Array.from({ length: 11 }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>{n}+</option>
          ))}
        </select>

        <span className="text-sm font-semibold text-neutral-400">Sort:</span>
        <select
          aria-label="Sort"
          value={sort}
          onChange={e => onSortChange(e.target.value as 'discovered' | 'missing')}
          className="bg-neutral-700 text-neutral-100 text-sm rounded px-2 py-1 border border-neutral-600 focus:outline-none"
        >
          <option value="discovered">Discovered date</option>
          <option value="missing">Missing tags</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          {shazamConfigured && (
            <button
              onClick={() => onShazamModeChange(!shazamMode)}
              className={`text-xs px-2 py-1 rounded transition-colors ${shazamMode ? 'bg-orange-600 hover:bg-orange-500 text-white' : 'bg-neutral-600 hover:bg-neutral-500 text-neutral-200'}`}
              title="Toggle Shazam playlist mode"
            >
              ⚡ Shazam
            </button>
          )}
          <button
            onClick={onOpenSettings}
            className="text-xs bg-neutral-600 hover:bg-neutral-500 text-neutral-200 px-2 py-1 rounded transition-colors"
            title="Settings"
          >
            ⚙
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || shazamMode}
            className="text-xs bg-neutral-600 hover:bg-neutral-500 disabled:opacity-50 text-neutral-200 px-2 py-1 rounded transition-colors"
            title="Sync tags from Spotify playlists"
          >
            {syncing ? 'Syncing…' : '↻ Sync'}
          </button>
          {spotifyStatus.authenticated ? (
            <>
              <span className="text-xs text-green-400">
                ● Spotify{spotifyStatus.activeDevice ? `: ${spotifyStatus.activeDevice}` : ''}
              </span>
              <button
                onClick={async () => { await api.logout(); onLogout() }}
                className="text-xs bg-neutral-600 hover:bg-neutral-500 text-neutral-200 px-2 py-1 rounded transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={api.authSpotify}
              className="text-xs bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded transition-colors"
            >
              Connect Spotify
            </button>
          )}
        </div>
      </div>
    </>
  )
}
