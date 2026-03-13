import { useState, useRef } from 'react'
import { getConfig, saveConfig } from '../settingsStore'
import type { AppConfig } from '../settingsStore'
import { getRedirectUri } from '../spotifyAuth'

interface Props {
  onClose: () => void
}

export default function SettingsScreen({ onClose }: Props) {
  const [cfg, setCfg] = useState<AppConfig>(getConfig)
  const [importError, setImportError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function update(partial: Partial<AppConfig>) {
    setCfg(prev => ({ ...prev, ...partial }))
  }

  function handleSave() {
    saveConfig(cfg)
    onClose()
  }

  function handleExport() {
    const payload = { version: 1, config: getConfig() }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dance-tagger-config-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportClick() {
    fileInputRef.current?.click()
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')

    const MAX_BYTES = 1024 * 1024 // 1 MB — config only
    if (file.size > MAX_BYTES) {
      setImportError('File too large (max 1 MB)')
      e.target.value = ''
      return
    }

    file.text().then(text => {
      try {
        const payload = JSON.parse(text)
        if (typeof payload !== 'object' || payload === null) throw new Error('Invalid config file')
        if (payload.version !== 1) throw new Error('Unknown config version')
        if ('data' in payload) throw new Error('This file contains song data — only config files are accepted')
        if (!payload.config) throw new Error('No config found in file')

        saveConfig(payload.config)
        setCfg({ ...getConfig(), ...payload.config })
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Import failed')
      }
    }).catch(() => setImportError('Could not read file'))

    e.target.value = ''
  }

  const redirectUri = getRedirectUri()

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-2xl mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-100">Settings</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100 text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-8">

          {/* Spotify */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">Spotify</h3>
            <label className="block space-y-1">
              <span className="text-xs text-neutral-400">Client ID</span>
              <input
                type="text"
                value={cfg.spotifyClientId}
                onChange={e => update({ spotifyClientId: e.target.value.trim() })}
                placeholder="e.g. a1b2c3d4e5f6..."
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-2 border border-neutral-600 focus:outline-none focus:border-neutral-400 font-mono"
              />
            </label>
            <div className="text-xs text-neutral-500 space-y-1">
              <p>
                Register at{' '}
                <span className="text-neutral-300">developer.spotify.com</span>
                {' '}→ Create App → add this Redirect URI:
              </p>
              <code className="block bg-neutral-800 px-2 py-1 rounded text-neutral-300 break-all">
                {redirectUri}
              </code>
            </div>
          </section>

          {/* Sync */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">Sync</h3>
            <label className="block space-y-1">
              <span className="text-xs text-neutral-400">Playlist name filter</span>
              <input
                type="text"
                value={cfg.playlistNameFilter}
                onChange={e => update({ playlistNameFilter: e.target.value })}
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-2 border border-neutral-600 focus:outline-none focus:border-neutral-400"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-neutral-400">Blacklisted playlist names (one per line)</span>
              <textarea
                rows={4}
                value={cfg.playlistNameBlacklist.join('\n')}
                onChange={e => update({
                  playlistNameBlacklist: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
                })}
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-2 border border-neutral-600 focus:outline-none focus:border-neutral-400 resize-y"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-neutral-400">Ignore playlist ID</span>
              <input
                type="text"
                value={cfg.ignorePlaylistId}
                onChange={e => update({ ignorePlaylistId: e.target.value.trim() })}
                placeholder="Spotify playlist ID for ignored songs"
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-2 border border-neutral-600 focus:outline-none focus:border-neutral-400 font-mono"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-neutral-400">Shazam playlist ID</span>
              <input
                type="text"
                value={cfg.shazamPlaylistId}
                onChange={e => update({ shazamPlaylistId: e.target.value.trim() })}
                placeholder="Spotify playlist ID for Shazam discoveries"
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-2 border border-neutral-600 focus:outline-none focus:border-neutral-400 font-mono"
              />
            </label>
          </section>

          {/* Categories */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">Categories</h3>
            <label className="block space-y-1">
              <span className="text-xs text-neutral-400">Category keywords (one per line, order = sort order)</span>
              <textarea
                rows={6}
                value={cfg.categoryNames.join('\n')}
                onChange={e => update({
                  categoryNames: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
                })}
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-2 border border-neutral-600 focus:outline-none focus:border-neutral-400 resize-y"
              />
            </label>
          </section>

          {/* AI Suggestions */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">AI Suggestions</h3>
            <label className="block space-y-1">
              <span className="text-xs text-neutral-400">Anthropic API key</span>
              <input
                type="password"
                value={cfg.anthropicApiKey}
                onChange={e => update({ anthropicApiKey: e.target.value.trim() })}
                placeholder="sk-ant-api03-…"
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-2 border border-neutral-600 focus:outline-none focus:border-neutral-400 font-mono"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-neutral-400">
                CORS proxy URL{' '}
                <span className="text-neutral-500">(optional — only needed if direct Anthropic calls fail)</span>
              </span>
              <input
                type="text"
                value={cfg.anthropicProxyUrl}
                onChange={e => update({ anthropicProxyUrl: e.target.value.trim() })}
                placeholder="https://your-proxy.workers.dev"
                className="w-full bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-2 border border-neutral-600 focus:outline-none focus:border-neutral-400 font-mono"
              />
            </label>
          </section>

          {/* Data */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">Data</h3>
            <div className="flex gap-3">
              <button
                onClick={handleExport}
                className="text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-4 py-2 rounded transition-colors"
              >
                Export JSON
              </button>
              <button
                onClick={handleImportClick}
                className="text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-4 py-2 rounded transition-colors"
              >
                Import JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>
            {importError && (
              <p className="text-xs text-red-400">{importError}</p>
            )}
          </section>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-700">
          <button
            onClick={onClose}
            className="text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-4 py-2 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
