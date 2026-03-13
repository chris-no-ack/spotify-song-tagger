import { getConfig } from './settingsStore'

const SCOPES = [
  'playlist-modify-public',
  'playlist-modify-private',
  'user-modify-playback-state',
  'user-read-playback-state',
  'playlist-read-private',
  'streaming',
  'user-read-email',
  'user-read-private',
].join(' ')

const TOKEN_KEY = 'spotify_tokens'

interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number  // ms since epoch
}

function base64url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(plain))
}

function generateVerifier(): string {
  const array = new Uint8Array(64)
  crypto.getRandomValues(array)
  return base64url(array.buffer)
}

export function getRedirectUri(): string {
  // Use current origin + path (without trailing slash) as the redirect URI.
  // This must match exactly what's registered in the Spotify Developer Dashboard.
  const { origin, pathname } = window.location
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  return `${origin}${path}`
}

export async function startAuth(): Promise<void> {
  const config = getConfig()
  if (!config.spotifyClientId) throw new Error('Spotify Client ID not configured — open Settings first')

  const verifier = generateVerifier()
  const challenge = base64url(await sha256(verifier))
  const state = base64url(crypto.getRandomValues(new Uint8Array(16)).buffer)

  const expiry = Date.now() + 5 * 60 * 1000 // 5-minute TTL
  sessionStorage.setItem('pkce_verifier', verifier)
  sessionStorage.setItem('pkce_state', state)
  sessionStorage.setItem('pkce_expiry', String(expiry))

  const params = new URLSearchParams({
    client_id: config.spotifyClientId,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  })

  window.location.href = `https://accounts.spotify.com/authorize?${params}`
}

export async function handleCallback(): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const state = params.get('state')
  if (!code) return false

  const storedState = sessionStorage.getItem('pkce_state')
  const expiry = Number(sessionStorage.getItem('pkce_expiry') ?? 0)

  if (state !== storedState) {
    console.warn('OAuth state mismatch — ignoring callback')
    sessionStorage.removeItem('pkce_verifier')
    sessionStorage.removeItem('pkce_state')
    sessionStorage.removeItem('pkce_expiry')
    return false
  }

  if (Date.now() > expiry) {
    console.warn('OAuth flow expired — please try connecting again')
    sessionStorage.removeItem('pkce_verifier')
    sessionStorage.removeItem('pkce_state')
    sessionStorage.removeItem('pkce_expiry')
    return false
  }

  const verifier = sessionStorage.getItem('pkce_verifier')
  if (!verifier) return false

  // Clear PKCE state synchronously before the first await so a concurrent
  // invocation (e.g. React 18 StrictMode double-effect) finds nothing and
  // returns false instead of making a second token-exchange request.
  sessionStorage.removeItem('pkce_verifier')
  sessionStorage.removeItem('pkce_state')
  sessionStorage.removeItem('pkce_expiry')
  window.history.replaceState({}, '', window.location.pathname)

  const config = getConfig()
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: getRedirectUri(),
      client_id: config.spotifyClientId,
      code_verifier: verifier,
    }),
  })

  if (!response.ok) {
    console.error('Token exchange failed:', await response.text())
    return false
  }

  const data = await response.json()
  storeTokens(data)
  return true
}

function storeTokens(data: { access_token: string; refresh_token: string; expires_in: number }) {
  const tokens: StoredTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  }
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
}

function getStoredTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function isAuthenticated(): boolean {
  const tokens = getStoredTokens()
  return tokens !== null && !!tokens.refreshToken
}

export async function getAccessToken(): Promise<string> {
  const tokens = getStoredTokens()
  if (!tokens) throw new Error('Not authenticated')

  if (Date.now() < tokens.expiresAt) return tokens.accessToken

  // Refresh expired token
  const config = getConfig()
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: config.spotifyClientId,
    }),
  })

  if (!response.ok) {
    logout()
    throw new Error('Token refresh failed — please reconnect Spotify')
  }

  const data = await response.json()
  storeTokens({
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? tokens.refreshToken,
    expires_in: data.expires_in,
  })
  return data.access_token
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
}
