import type { SongResponse } from '../types'

interface Props {
  songs: SongResponse[]
  selectedSong: SongResponse | null
  onSelect: (song: SongResponse) => void
}

function MissingBadge({ count }: { count: number }) {
  if (count === 0) return <span className="text-green-400 text-xs">✓</span>
  return <span className="text-red-400 text-xs font-bold">✗{count}</span>
}

export default function SongList({ songs, selectedSong, onSelect }: Props) {
  return (
    <div className="divide-y divide-neutral-800">
      {songs.length === 0 && (
        <div className="px-4 py-6 text-neutral-500 text-sm text-center">No songs</div>
      )}
      {songs.map(song => (
        <button
          key={song.spotifyUri}
          onClick={() => onSelect(song)}
          className={`w-full text-left flex items-center gap-2 px-3 py-2 hover:bg-neutral-800 transition-colors ${
            selectedSong?.spotifyUri === song.spotifyUri ? 'bg-neutral-700' : ''
          }`}
        >
          {song.coverUrl ? (
            <img
              src={song.coverUrl}
              alt=""
              loading="lazy"
              className="w-10 h-10 rounded object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-neutral-700 flex-shrink-0 flex items-center justify-center text-neutral-500 text-lg">
              ♪
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{song.title}</div>
            <div className="text-xs text-neutral-400 truncate">{song.artist}</div>
          </div>
          <MissingBadge count={song.missingCategories.length} />
        </button>
      ))}
    </div>
  )
}
