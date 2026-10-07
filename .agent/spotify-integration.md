# Spotify Integration

## Auth: OAuth 2.0 PKCE (`spotifyAuth.ts`)

- Pure client-side PKCE flow (no client secret) — required since there's no
  backend.
- `startAuth()`: generates a `verifier`/`challenge` pair and random `state`,
  stashes them in `sessionStorage` (`pkce_verifier`, `pkce_state`,
  `pkce_expiry` — 5 minute TTL), then redirects to Spotify's `/authorize`.
- `getRedirectUri()` derives the redirect URI from `window.location`
  (origin + path, no trailing slash) — it **must** exactly match what's
  registered in the Spotify Developer Dashboard. Don't hard-code a redirect
  URI elsewhere.
- `handleCallback()` (called from `App.tsx` on mount when `?code=` is
  present): validates `state`, checks the expiry, clears PKCE session state
  *before* the first `await` (defends against React 18 StrictMode's
  double-invoked effects triggering a duplicate token exchange), exchanges
  the code for tokens, and stores them via `storeTokens()`.
- Tokens are stored in `localStorage` key `spotify_tokens`:
  `{ accessToken, refreshToken, expiresAt, grantedScopes }`.
- `isAuthenticated()` also checks that all `SCOPES` are present in
  `grantedScopes` — if the required scope list changes, existing users will
  be forced to re-auth automatically (don't special-case this manually).
- `getAccessToken()` auto-refreshes via the refresh-token grant when
  expired; on refresh failure it calls `logout()` and throws.

If you add a new Spotify endpoint that needs a new scope, add it to
`SCOPES` in `spotifyAuth.ts` — existing sessions will reauth automatically
via the scope check above.

## API calls (`spotifyApi.ts`)

- All functions take/derive a bearer token from `spotifyAuth.getAccessToken()`
  internally; callers in `api.ts` never handle tokens directly.
- Playlist/track fetches are paginated — look at `fetchAllPlaylists` /
  `fetchPlaylistTracks` / `streamPlaylistTracks` for the pagination pattern
  before adding new paginated endpoints. `streamPlaylistTracks` yields
  batches via callback rather than materializing the whole list, used by
  live-edit mode for large playlists.
- Respect Spotify's **100 items per request** cap on playlist add/remove
  endpoints — batch accordingly (see the README's curl restore example for
  the same constraint).

## Sync algorithm (`syncService.ts`)

Playlists are the source of truth for tags. Naming convention:

```
<FilterWord> <Value> <Category>
```

`parseCategoryAndValue(playlistName, filterWord, categoryKeywords)`:

1. Strip the filter word (whole-word, case-insensitive) from the name.
2. If nothing remains, the playlist is skipped (it's just the filter word).
3. Split off the **last word** of what remains; match it case-insensitively
   against the configured category keywords.
4. If it matches a keyword, that's the category and the rest is the tag
   value (fallback to the keyword itself if nothing remains before it).
5. If no keyword matches, the whole remainder is the tag value and the
   category is `Other`.

This function is a direct port of a previous backend implementation
(`PlaylistSyncService.parseCategoryAndValue` per the inline comment) — keep
behavior-preserving unless intentionally changing the parsing contract, and
update `.agent/domain-glossary.md` if you do.

Blacklisted playlist names (`config.playlistNameBlacklist`) are filtered out
before parsing, independent of the filter-word matching.
