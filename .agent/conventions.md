# Conventions

## Style

- No semicolons, single quotes, 2-space indentation, trailing commas in
  multiline literals — follow `eslint.config.js` (`js.configs.recommended` +
  `typescript-eslint` recommended) and match surrounding code; there is no
  Prettier config in this repo.
- Arrow functions for callbacks/handlers; `function` declarations for
  top-level module functions (see `syncService.ts`, `db.ts`).
- Interfaces (not `type`) for object shapes that model data (`Song`, `Tag`,
  `SongResponse`, `AppConfig`, ...). `type` is used for unions/aliases.
- Explicit return types on exported functions (e.g.
  `export function querySongs(...): Promise<SongResponse[]>`).

## The `api.ts` façade pattern

`src/api.ts` exports a single `api` object; every component imports `{ api }`
and nothing else from the data layer. When adding a feature:

1. Add the low-level logic to the appropriate module (`db.ts` for Dexie
   queries, `spotifyApi.ts` for new Spotify endpoints, etc.).
2. Expose it as a new method on `api` in `api.ts`, composing lower-level
   calls as needed (see `api.ignoreSong` for an example that touches both
   Dexie and Spotify).
3. Call `api.yourMethod()` from the component.

Do not import `db`, `spotifyApi`, `spotifyAuth`, `syncService`, or
`anthropicApi` directly into a component — this keeps all Spotify/IndexedDB
side effects auditable in one file.

## Error handling

- Throw `Error` with a user-readable message for conditions the UI should
  surface (e.g. `throw new Error('Spotify Client ID not configured — open
  Settings first')`). `App.tsx`'s `showError` catches these and renders a
  toast.
- Network/auth failures in background polling (e.g. the Spotify status
  poll in `App.tsx`) should fail soft — don't throw from `setInterval`
  callbacks; catch and degrade state instead.
- `localStorage`/`JSON.parse` reads are always wrapped in `try/catch`
  returning a safe default (see `settingsStore.getConfig`,
  `spotifyAuth.getStoredTokens`).

## Testing

- Framework: Vitest (`globals: true`, `environment: 'jsdom'`), Testing
  Library for components, `fake-indexeddb` for Dexie-backed tests (see
  `src/test/setup.ts`).
- One test file per source file, same base name, under `src/test/`
  (e.g. `db.ts` → `src/test/db.test.ts`).
- Run the full suite with `npm test` (single run, not watch) before
  finishing any change; CI and the pre-commit hook both run
  `npm run lint && npm test`.
- When changing `db.ts` query/join logic, add coverage for
  `missingCategories` computation and category ordering, since those are
  easy to silently break.
- When changing `syncService.ts` parsing (`parseCategoryAndValue`), add
  cases for: filter word as whole word only, multi-word tag values,
  unmatched category keyword (-> `Other`), and blacklist filtering.

## Config & secrets

- All user settings (`AppConfig` in `settingsStore.ts`) live in
  `localStorage` key `app_config`; add new fields to both the `AppConfig`
  interface and `DEFAULTS` so `getConfig()` keeps working for existing
  users (it merges `{...DEFAULTS, ...stored}`).
- Spotify tokens live in `localStorage` key `spotify_tokens`
  (`spotifyAuth.ts`); never log or expose `accessToken`/`refreshToken`.
- Anthropic API key is user-supplied via Settings and passed straight to
  `anthropicApi.ts` — never hard-code a key or proxy URL.
