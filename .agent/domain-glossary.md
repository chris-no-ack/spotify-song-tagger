# Domain Glossary

- **Category** — a tagging dimension, e.g. `Energy`, `Mood`, `Genre`. The set
  of valid category names is user-configurable (`AppConfig.categoryNames`)
  and also defines **display order** (see `nameOrder` sort in `db.ts`).
  Dragging categories in the UI calls `api.updateCategoryOrder`, which just
  rewrites `categoryNames` in settings.
- **Tag** — a specific value within a category, e.g. category `Mood`, value
  `Happy`. Every tag is backed by exactly one Spotify playlist
  (`tag.spotifyPlaylistId`); the playlist's name is stored verbatim as
  `tag.playlistName`.
- **Other** — the fallback category used when a playlist's last word
  doesn't match any configured category keyword. Treated like any other
  category once created.
- **Filter word** — the required prefix word in every tag playlist's name
  (`AppConfig.playlistNameFilter`, default `Dance`). Playlists not
  containing this word (whole-word match) are ignored during sync.
- **Blacklist** — playlist names (`AppConfig.playlistNameBlacklist`)
  excluded from sync regardless of filter-word matching — e.g. a shared
  "Dance" playlist that isn't a tag playlist.
- **Ignore playlist** — a designated Spotify playlist
  (`AppConfig.ignorePlaylistId`) that songs get moved to when the user
  "ignores" them (`api.ignoreSong`), hiding them from the main list
  (`song.ignored = true`) and clearing their tag assignments.
- **Shazam playlist** — an optional playlist (`AppConfig.shazamPlaylistId`)
  toggled into view via the toolbar for tagging recently Shazam-discovered
  tracks; implemented via **live-edit mode**, not regular sync.
- **Live-edit mode** — a mode (`App.tsx` `liveEditMode` state) for tagging
  songs directly from an arbitrary Spotify playlist (picked via
  `LiveEditPlaylistDialog`) without first running a full sync. Songs are
  streamed via `api.getLivePlaylistSongs` and only persisted to Dexie
  on-demand (`api.ensureSongExists`) when the user actually assigns a tag.
- **Missing categories** — categories with no tag assigned to a song
  (`SongResponse.missingCategories`), computed in `buildSongResponse`
  (`db.ts`). Used for the "missing category" filter and AI suggestions
  (only missing categories are sent to Claude for suggestions).
- **Discovered date vs. release date** — `discoveredDate` is when the track
  was added to a playlist (`addedAt`); `releaseDate` is Spotify's album
  release date (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, kept as a string since
  precision varies).
