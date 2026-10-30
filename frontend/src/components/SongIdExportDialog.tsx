import { useState } from 'react'
import { api } from '../api'

interface Props {
  onClose: () => void
}

const FORMAT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

function pad(n: number) {
  return String(n).padStart(2, '0')
}

export function formatLocal(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function parseLocal(value: string): Date | null {
  const v = value.trim()
  if (!FORMAT_RE.test(v)) return null
  const d = new Date(v.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

function initialValue() {
  const last = api.getLastSongIdExportAt()
  const d = last ? new Date(last) : new Date()
  return formatLocal(isNaN(d.getTime()) ? new Date() : d)
}

export default function SongIdExportDialog({ onClose }: Props) {
  const [since, setSince] = useState(initialValue)
  const [minTags, setMinTags] = useState('3')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    const date = parseLocal(since)
    if (!date) {
      setError('Use the format YYYY-MM-DD HH:MM:SS')
      return
    }
    const min = Number(minTags)
    if (!Number.isInteger(min) || min < 0) {
      setError('Minimum tags must be a whole number')
      return
    }
    setError('')
    setInfo('')
    setExporting(true)
    try {
      const ids = await api.exportSongIds(date, min)
      if (ids.length === 0) {
        setInfo('No songs with enough tags discovered after this time.')
        return
      }
      const blob = new Blob([ids.join('\n') + '\n'], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `song-ids-${since.replace(/[: ]/g, (c) => (c === ' ' ? '_' : '-'))}.txt`
      a.click()
      URL.revokeObjectURL(url)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-start justify-center overflow-y-auto py-8">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
          <h2 className="text-lg font-semibold text-neutral-100">Export Song IDs</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-100 text-xl leading-none" aria-label="Close">✕</button>
        </div>
        <div className="px-6 py-4 space-y-2">
          <label className="block text-sm text-neutral-300" htmlFor="song-id-since">
            Songs discovered after (local time)
          </label>
          <input
            id="song-id-since"
            type="text"
            value={since}
            onChange={e => setSince(e.target.value)}
            placeholder="YYYY-MM-DD HH:MM:SS"
            className="w-full bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-1.5 border border-neutral-600 focus:outline-none focus:border-neutral-400"
          />
          <label className="block text-sm text-neutral-300 pt-2" htmlFor="song-id-min-tags">
            Minimum number of tags
          </label>
          <input
            id="song-id-min-tags"
            type="number"
            min={0}
            value={minTags}
            onChange={e => setMinTags(e.target.value)}
            className="w-24 bg-neutral-800 text-neutral-100 text-sm rounded px-3 py-1.5 border border-neutral-600 focus:outline-none focus:border-neutral-400"
          />
          <p className="text-xs text-neutral-500">
            Ignored songs are never exported. One Spotify ID per line.
          </p>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {info && <p className="text-xs text-neutral-400">{info}</p>}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-700">
          <button onClick={onClose} className="text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-4 py-2 rounded transition-colors">Cancel</button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded transition-colors"
          >
            {exporting ? 'Exporting…' : 'Export TXT'}
          </button>
        </div>
      </div>
    </div>
  )
}
