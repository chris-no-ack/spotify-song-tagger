import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// — Module under test is imported after mocks are set up —

describe('spotifyAuth', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── isAuthenticated ────────────────────────────────────────────────────────

  describe('isAuthenticated', () => {
    it('returns false when no tokens are stored', async () => {
      const { isAuthenticated } = await import('../spotifyAuth')
      expect(isAuthenticated()).toBe(false)
    })

    it('returns true when a refresh token is present', async () => {
      localStorage.setItem('spotify_tokens', JSON.stringify({
        accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3600_000,
      }))
      const { isAuthenticated } = await import('../spotifyAuth')
      expect(isAuthenticated()).toBe(true)
    })

    it('returns false when stored JSON is corrupt', async () => {
      localStorage.setItem('spotify_tokens', '{ bad }')
      const { isAuthenticated } = await import('../spotifyAuth')
      expect(isAuthenticated()).toBe(false)
    })
  })

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('removes stored tokens', async () => {
      localStorage.setItem('spotify_tokens', JSON.stringify({
        accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3600_000,
      }))
      const { logout, isAuthenticated } = await import('../spotifyAuth')
      logout()
      expect(isAuthenticated()).toBe(false)
      expect(localStorage.getItem('spotify_tokens')).toBeNull()
    })
  })

  // ── getAccessToken ─────────────────────────────────────────────────────────

  describe('getAccessToken', () => {
    it('throws when not authenticated', async () => {
      const { getAccessToken } = await import('../spotifyAuth')
      await expect(getAccessToken()).rejects.toThrow('Not authenticated')
    })

    it('returns the cached access token when it has not expired', async () => {
      localStorage.setItem('spotify_tokens', JSON.stringify({
        accessToken: 'valid-token', refreshToken: 'rt', expiresAt: Date.now() + 3600_000,
      }))
      const { getAccessToken } = await import('../spotifyAuth')
      expect(await getAccessToken()).toBe('valid-token')
    })

    it('refreshes and stores a new token when expired', async () => {
      localStorage.setItem('app_config', JSON.stringify({ spotifyClientId: 'client-x' }))
      localStorage.setItem('spotify_tokens', JSON.stringify({
        accessToken: 'old', refreshToken: 'rt-old', expiresAt: Date.now() - 1000,
      }))

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-token', refresh_token: 'rt-new', expires_in: 3600,
        }),
      }))

      const { getAccessToken } = await import('../spotifyAuth')
      const token = await getAccessToken()

      expect(token).toBe('new-token')
      const stored = JSON.parse(localStorage.getItem('spotify_tokens')!)
      expect(stored.accessToken).toBe('new-token')
      expect(stored.refreshToken).toBe('rt-new')
    })

    it('keeps old refresh token when Spotify omits it in the refresh response', async () => {
      localStorage.setItem('app_config', JSON.stringify({ spotifyClientId: 'client-x' }))
      localStorage.setItem('spotify_tokens', JSON.stringify({
        accessToken: 'old', refreshToken: 'rt-original', expiresAt: Date.now() - 1000,
      }))

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'refreshed', expires_in: 3600,
          // refresh_token intentionally omitted
        }),
      }))

      const { getAccessToken } = await import('../spotifyAuth')
      await getAccessToken()

      const stored = JSON.parse(localStorage.getItem('spotify_tokens')!)
      expect(stored.refreshToken).toBe('rt-original')
    })

    it('logs out and throws when the refresh request fails', async () => {
      localStorage.setItem('app_config', JSON.stringify({ spotifyClientId: 'client-x' }))
      localStorage.setItem('spotify_tokens', JSON.stringify({
        accessToken: 'old', refreshToken: 'rt', expiresAt: Date.now() - 1000,
      }))

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, text: () => Promise.resolve('Unauthorized') }))

      const { getAccessToken, isAuthenticated } = await import('../spotifyAuth')
      await expect(getAccessToken()).rejects.toThrow()
      expect(isAuthenticated()).toBe(false)
    })
  })

  // ── handleCallback ─────────────────────────────────────────────────────────

  describe('handleCallback', () => {
    it('returns false when no code is in the URL', async () => {
      Object.defineProperty(window, 'location', {
        value: { search: '', pathname: '/', href: 'http://localhost/' },
        writable: true,
      })
      const { handleCallback } = await import('../spotifyAuth')
      expect(await handleCallback()).toBe(false)
    })

    it('returns false when state does not match', async () => {
      sessionStorage.setItem('pkce_state', 'expected-state')
      sessionStorage.setItem('pkce_verifier', 'verifier')
      Object.defineProperty(window, 'location', {
        value: { search: '?code=abc&state=wrong-state', pathname: '/' },
        writable: true,
      })
      const { handleCallback } = await import('../spotifyAuth')
      expect(await handleCallback()).toBe(false)
    })

    it('exchanges code for tokens and stores them', async () => {
      sessionStorage.setItem('pkce_state', 'correct-state')
      sessionStorage.setItem('pkce_verifier', 'my-verifier')
      sessionStorage.setItem('pkce_expiry', String(Date.now() + 300_000))
      localStorage.setItem('app_config', JSON.stringify({ spotifyClientId: 'cid' }))
      Object.defineProperty(window, 'location', {
        value: { search: '?code=auth-code&state=correct-state', pathname: '/' },
        writable: true,
      })
      window.history.replaceState = vi.fn()

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-at', refresh_token: 'new-rt', expires_in: 3600,
        }),
      }))

      const { handleCallback, isAuthenticated } = await import('../spotifyAuth')
      const result = await handleCallback()

      expect(result).toBe(true)
      expect(isAuthenticated()).toBe(true)
      expect(sessionStorage.getItem('pkce_verifier')).toBeNull()
      expect(sessionStorage.getItem('pkce_state')).toBeNull()
    })
  })

  // ── getRedirectUri ─────────────────────────────────────────────────────────

  describe('getRedirectUri', () => {
    it('returns origin + pathname without trailing slash', async () => {
      Object.defineProperty(window, 'location', {
        value: { origin: 'https://example.com', pathname: '/app/' },
        writable: true,
      })
      const { getRedirectUri } = await import('../spotifyAuth')
      expect(getRedirectUri()).toBe('https://example.com/app')
    })

    it('returns origin + "/" when path is just "/"', async () => {
      Object.defineProperty(window, 'location', {
        value: { origin: 'http://localhost:5173', pathname: '/' },
        writable: true,
      })
      const { getRedirectUri } = await import('../spotifyAuth')
      expect(getRedirectUri()).toBe('http://localhost:5173/')
    })
  })
})
