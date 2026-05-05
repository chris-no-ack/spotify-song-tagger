# Dance Tagger

A browser-based tool for tagging your Spotify music library. It syncs playlists from your Spotify account, lets you assign tags to songs across configurable categories, and uses Claude AI to suggest tags automatically.

Everything runs in the browser — no backend required. Data is stored locally in IndexedDB (via Dexie).

## How it works

**Playlist convention:** you maintain a set of Spotify playlists whose names follow the pattern `Dance <Value> <Category>` — e.g. `Dance High Energy`, `Dance Happy Mood`. The sync process reads these playlists and maps each song to its tags and categories.

**Tagging:** select a song from the list and toggle tags on/off. Toggling a tag adds or removes the song from the corresponding Spotify playlist in real time.

**AI suggestions:** if an Anthropic API key is configured, the app fetches the song's genre from Spotify and sends it to Claude, which suggests tags for any missing categories.

**Shazam mode:** if a Shazam playlist ID is configured, a toggle in the toolbar switches to that playlist so you can tag recently discovered songs and optionally remove them after.

## Setup

### 1. Spotify app

1. Go to [developer.spotify.com](https://developer.spotify.com) → Create App
2. Copy the **Client ID**
3. Add your app's URL as a Redirect URI (the exact value is shown in Settings once you enter the Client ID)
4. Required scopes are requested automatically during login

### 2. Configure the app

Open Settings (gear icon) and fill in:

| Field | Description |
|---|---|
| **Spotify Client ID** | From the Spotify Developer Dashboard |
| **Playlist name filter** | Word that prefixes all your tag playlists (default: `Dance`) |
| **Blacklisted playlist names** | Playlists to ignore during sync, one per line |
| **Ignore playlist ID** | Spotify playlist ID — songs added here are hidden from the main list |
| **Shazam playlist ID** | Spotify playlist ID for Shazam-discovered songs (optional) |
| **Anthropic API key** | Enables AI tag suggestions (`sk-ant-api03-…`) |
| **CORS proxy URL** | Only needed if direct Anthropic API calls are blocked by CORS |
| **Category keywords** | The category names used to parse playlist names, one per line |

### 3. Connect Spotify

Click **Connect Spotify** in the toolbar. You'll be redirected to Spotify for authorization and returned to the app automatically.

### 4. Sync

Click **Sync** to import your playlists and songs. The sync reads all playlists matching the filter word, parses their names into categories and tag values, and stores everything locally. Re-sync any time to pick up new playlists or songs.

## Playlist naming convention

Playlists are parsed as:

```
<filter> <value> <category>
```

Examples with filter word `Dance`:

| Playlist name | Category | Tag value |
|---|---|---|
| `Dance High Energy` | Energy | High |
| `Dance Happy Mood` | Mood | Happy |
| `Dance Dark Romantic Mood` | Mood | Dark Romantic |
| `Dance Summer Vibes` | Other | Summer Vibes |

- The filter word is stripped (case-insensitive, whole word only)
- The last word is matched against known category keywords
- If no category keyword matches, the tag goes into **Other**
- Playlists whose name equals only the filter word are ignored

## Development

```bash
cd frontend
npm install
npm run dev      # start dev server at http://127.0.0.1:5173
npm test         # run tests
npm run lint     # run ESLint
npm run build    # production build → dist/
```

A pre-commit hook runs `npm run lint` and `npm test` automatically.

## Data

All data lives in the browser:

- **IndexedDB** — songs, tags, categories, song–tag assignments (via Dexie)
- **localStorage** — settings and Spotify tokens

Use **Export JSON** in Settings to back up everything, and **Import JSON** to restore. Importing replaces all local data after confirmation.

## Playlist backup & restore

The **Playlist backup** control in Settings → Data lets you download a full snapshot of any Spotify playlist as a JSON file. This is useful if you want a local safety copy in case an online playlist gets accidentally modified or deleted.

### Exporting

1. Open **Settings** → scroll to **Data** → click **Load playlists**
2. Select the playlist you want to back up from the dropdown
3. Click **Export playlist** — a file named `playlist-backup-<name>-<date>.json` is downloaded

The file contains:
- `playlist` — id, name, ownerId, exportedAt timestamp
- `tracks` — array of `{ uri, title, artist, addedAt }` for every track
- `restoreHint` — pre-filled Spotify API call you can paste into curl (see below)

### Restoring with curl

1. **Create a new (empty) playlist** in Spotify, or find the ID of an existing target playlist.
2. **Get an access token** — log in via the app and copy the token from `localStorage` key `spotify_access_token`, or obtain one through the [Spotify API console](https://developer.spotify.com/console/).
3. **Add the tracks** — the backup file's `restoreHint.body.uris` contains the full list. Spotify accepts at most **100 URIs per request**, so split into batches if needed.

```bash
# Single batch (≤ 100 tracks)
curl -X POST "https://api.spotify.com/v1/playlists/{NEW_PLAYLIST_ID}/tracks" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"uris": ["spotify:track:abc123", "spotify:track:def456", ...]}'
```

For playlists with more than 100 tracks, repeat the request with successive slices of the `uris` array until all tracks are added.
