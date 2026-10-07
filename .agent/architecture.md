# Architecture

## Stack

- **Vite** + **React 18** + **TypeScript**, Tailwind CSS for styling.
- **Dexie** (IndexedDB wrapper) for persistent local storage of songs, tags,
  categories, and song-tag assignments.
- **Vitest** + Testing Library (+ `fake-indexeddb` for Dexie in tests) +
  `jsdom` environment.
- No server/backend of any kind; deployed as a static site to GitHub Pages.

## File map (`frontend/src/`)

| File | Responsibility |
|---|---|
| `main.tsx` | React entry point, mounts `<App />`. |
| `App.tsx` | Top-level component: owns all screen-level state (selected song, filters, dialogs, live-edit mode), wires `api.ts` calls to UI. |
| `api.ts` | **The single façade** every component calls. Combines Dexie queries (`db.ts`), Spotify calls (`spotifyApi.ts`/`spotifyAuth.ts`), sync (`syncService.ts`), and AI suggestions (`anthropicApi.ts`) into one object (`export const api = {...}`). |
| `db.ts` | Dexie schema (`SpotifyTaggerDB`) and all read queries that join `songs`/`tags`/`categories`/`songTags` into `SongResponse`/`CategoryResponse` shapes used by the UI. |
| `syncService.ts` | Reads Spotify playlists matching the configured filter word, parses each playlist name into `{category, value}` via `parseCategoryAndValue`, and upserts `tags`/`categories`/`songs`/`songTags` in Dexie. |
| `spotifyApi.ts` | Thin wrapper around the Spotify Web API (playlists, tracks, playback, artist genres). Always called with a bearer token from `spotifyAuth.ts`. |
| `spotifyAuth.ts` | OAuth 2.0 PKCE flow against Spotify: builds the auth URL, exchanges the code, refreshes tokens, stores them in `localStorage` under `spotify_tokens`. |
| `anthropicApi.ts` | Calls the Anthropic API (optionally via a CORS proxy) to suggest tags for a song's missing categories based on genre. |
| `settingsStore.ts` | Typed `AppConfig` persisted to `localStorage` under `app_config`, with `getConfig()`/`saveConfig()`. |
| `types.ts` | Shared response DTOs (`SongResponse`, `TagResponse`, `CategoryResponse`, `SpotifyStatus`, `CategorySuggestion`) — the contract between `db.ts`/`api.ts` and the UI. |
| `components/` | Presentational + mid-level stateful components (see below). |
| `hooks/useSpotifyPlayer.ts` | Wraps the Spotify Web Playback SDK for in-browser playback. |

## Components (`src/components/`)

- `FilterBar.tsx` — toolbar: category filter, sort, sync button, Spotify
  connect/logout, settings/export/live-edit entry points.
- `SongList.tsx` — left-hand scrollable list of songs.
- `TagPanel.tsx` — right-hand panel: shows the selected song's tags per
  category, toggle controls, AI suggestions, ignore/remove actions.
- `PlayerBar.tsx` — bottom playback bar using `useSpotifyPlayer`.
- `SettingsScreen.tsx` — modal for all `AppConfig` fields.
- `PlaylistExportDialog.tsx` — playlist backup/export-to-JSON flow.
- `LiveEditPlaylistDialog.tsx` — picks a Spotify playlist to "live edit"
  (tag songs not yet synced into Dexie, e.g. a Shazam playlist).
- `DuplicatesDialog.tsx` — finds/removes duplicate tracks in a live-edit
  playlist.
- `IgnoredSongsDialog.tsx` — finds tracks in a live-edit playlist that also
  appear on an ignore list (the default ignore playlist and/or ignore-reason
  tag playlists) and lets the user remove some/all from the current
  playlist only; ignore lists are resolved lazily via `api.getIgnoreLists()`
  only when this dialog opens, never preloaded.
- `IgnoreReasonDialog.tsx` — lets the user pick which tag(s) justify
  ignoring a song.
- `TapTempo.tsx` — standalone BPM tap-tempo helper widget.

## Data model (Dexie, `db.ts`)

```
songs:     spotifyUri (PK), title, artist, coverUrl, durationMs,
           discoveredDate, releaseDate, ignored
tags:      id (PK, auto), playlistName (unique), categoryId, tagValue,
           spotifyPlaylistId
categories: id (PK, auto), name (unique)
songTags:  [songUri+tagId] (PK), songUri, tagId   — many-to-many join table
```

- A **tag** always corresponds 1:1 to a Spotify playlist
  (`tag.spotifyPlaylistId`). Assigning/removing a tag on a song
  (`api.assignTag`/`api.removeTag`) adds/removes the track from that
  playlist in real time via `spotifyApi.ts`.
- **Schema versioning**: the Dexie schema is declared with
  `this.version(1).stores({...})` in the `SpotifyTaggerDB` constructor. Any
  change to field sets or indexes requires a new `this.version(N)` block
  (Dexie migration), not editing version 1 in place — existing users have
  data in IndexedDB already.

## Data flow (typical read)

1. Component calls e.g. `api.getSongs()`.
2. `api.ts` delegates to `querySongs()` in `db.ts`.
3. `db.ts` loads `categories`/`tags`/`songTags` (`loadJoinData`), builds a
   `SongResponse` per song (`buildSongResponse`), computing `missingCategories`
   as categories with no assigned tag.
4. Component renders from the returned `SongResponse[]`.

## Sync flow (`syncService.ts`)

1. Fetch all Spotify playlists for the current user (`fetchAllPlaylists`).
2. Filter out blacklisted names and ones not containing the configured
   filter word (default `Dance`).
3. For each remaining playlist, `parseCategoryAndValue` strips the filter
   word and matches the last word against `config.categoryNames`; if no
   match, the tag falls into category `Other`.
4. Upsert a `Category` (if needed) and `Tag` row per playlist, then fetch
   playlist tracks (`fetchPlaylistTracks`) and upsert `Song` + `SongTag` rows.
5. `onProgress` callback reports `{current, done, total}` for UI feedback.
