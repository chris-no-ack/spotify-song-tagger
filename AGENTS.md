# Agent Instructions — Dance Tagger (SpotifyTaggerUI)

This file orients AI coding agents (Cursor, Claude, Copilot, etc.) working in this
repo. Read this first; it links to deeper docs in `.agent/` for specific topics.

## What this project is

A client-only, browser-based tool for tagging a Spotify music library with
custom categories/tags (e.g. Energy: High, Mood: Happy). Tags map 1:1 to
Spotify playlists following the convention `<FilterWord> <Value> <Category>`
(e.g. `Dance High Energy`). There is **no backend** — everything runs in the
browser. See the root `README.md` for the full user-facing feature description
and setup instructions; don't duplicate that content here.

## Repo layout

- `frontend/` — the entire application (Vite + React + TypeScript). This is
  the only code directory; all commands below run from here.
- `frontend/src/` — see `.agent/architecture.md` for a file-by-file map.
- `.github/workflows/deploy.yml` — CI: lint → test → build → deploy to GitHub
  Pages on push to `main`.
- `.git/hooks/pre-commit` (local, not versioned) runs `npm run lint && npm test`.

## Essential commands

Always run these from `frontend/`:

```bash
npm install      # install deps
npm run dev      # dev server at http://127.0.0.1:5173
npm test         # vitest run (single pass, not watch)
npm run lint     # eslint src/
npm run build    # tsc + vite build -> dist/
```

Before considering any change done, run `npm run lint` and `npm test` from
`frontend/` — both are required by CI and the pre-commit hook. There is no
separate typecheck script; `npm run build` runs `tsc` as part of the build.

## Core conventions

- **TypeScript everywhere**, strict-ish via `typescript-eslint` recommended
  rules (`frontend/eslint.config.js`). No `any` without good reason.
- **No semicolons, single quotes, 2-space indent** — match existing style
  exactly; there is no Prettier config, so mirror surrounding code.
- **State management**: plain React hooks (`useState`/`useEffect`/`useMemo`/
  `useCallback`) in `App.tsx`; no Redux/Zustand/Context for global state.
  Persistent data lives in Dexie (IndexedDB) or `localStorage`, not in a
  global store.
- **All cross-cutting logic goes through `src/api.ts`** — components call
  `api.xxx()`, never Dexie (`db.ts`), `spotifyApi.ts`, or `spotifyAuth.ts`
  directly. When adding a feature, add/extend a method on the `api` object
  rather than importing lower-level modules into components.
- **Naming**: `camelCase` for functions/variables, `PascalCase` for React
  components and types/interfaces, files named after their default export
  (components) or purpose (modules).
- Tests live beside the concern in `src/test/` as `<Name>.test.ts(x)`, using
  Vitest + Testing Library + `fake-indexeddb`. Add/update a test whenever you
  touch `db.ts`, `syncService.ts`, `spotifyApi.ts`, `spotifyAuth.ts`,
  `anthropicApi.ts`, or any component with user-visible logic.

## Deeper references

- `.agent/architecture.md` — module map, data flow, and the Dexie schema.
- `.agent/conventions.md` — style, error handling, and testing patterns with
  examples.
- `.agent/spotify-integration.md` — PKCE auth flow, playlist sync algorithm,
  and Spotify API usage/rate-limit notes.
- `.agent/domain-glossary.md` — the Category/Tag/Playlist naming convention
  and how parsing works.

## Things to avoid

- Don't introduce a backend/server — this app must keep working as a static
  site deployed to GitHub Pages (see `deploy.yml`).
- Don't add new global state libraries or CSS frameworks beyond Tailwind.
- Don't bypass `api.ts` by calling Dexie or Spotify modules straight from
  components.
- Don't commit secrets. The Anthropic API key and Spotify tokens are
  user-supplied and stored only in the browser (`localStorage`); never hard-
  code credentials or log them.
- Don't change the Dexie schema (`db.ts` `version(1).stores(...)`) without
  adding a new `version()` migration — existing users have local data.
