import { useState } from 'react'
import type { CategoryResponse } from '../types'

interface Props {
  categories: CategoryResponse[]
  onConfirm: (tagIds: number[]) => void
  onCancel: () => void
}

export default function IgnoreReasonDialog({ categories, onConfirm, onCancel }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set())

  // Collect all tags whose value is "Ignore" — each represents an ignore-reason playlist
  const ignoreTags = categories.flatMap(c =>
    c.tags
      .filter(t => t.value.toLowerCase() === 'ignore')
      .map(t => ({ id: t.id, categoryName: c.name, playlistName: t.playlistName }))
  )

  function toggle(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg w-full max-w-sm">
        <div className="px-5 py-4 border-b border-neutral-700">
          <h2 className="text-base font-semibold text-neutral-100">Ignore reason</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Select one or more reasons, or leave empty to use the default ignore playlist.
          </p>
        </div>

        <div className="px-5 py-3 space-y-1 max-h-64 overflow-y-auto">
          {ignoreTags.length === 0 ? (
            <p className="text-sm text-neutral-500 py-2">
              No ignore-reason playlists found. The song will be added to the default ignore playlist.
            </p>
          ) : (
            ignoreTags.map(tag => (
              <label key={tag.id} className="flex items-center gap-3 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(tag.id)}
                  onChange={() => toggle(tag.id)}
                  className="accent-red-500"
                />
                <span className="text-sm text-neutral-200">{tag.categoryName}</span>
                <span className="text-xs text-neutral-500 ml-auto truncate">{tag.playlistName}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex justify-end gap-3 px-5 py-4 border-t border-neutral-700">
          <button
            onClick={onCancel}
            className="text-sm bg-neutral-700 hover:bg-neutral-600 text-neutral-200 px-4 py-2 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(Array.from(selected))}
            className="text-sm bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded transition-colors"
          >
            {selected.size > 0 ? `Ignore (${selected.size} reason${selected.size > 1 ? 's' : ''})` : 'Ignore'}
          </button>
        </div>
      </div>
    </div>
  )
}
