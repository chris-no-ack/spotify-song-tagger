import { describe, it, expect, beforeEach } from 'vitest'
import { getConfig, saveConfig } from '../settingsStore'

describe('settingsStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('getConfig', () => {
    it('returns defaults when nothing is stored', () => {
      const cfg = getConfig()
      expect(cfg.spotifyClientId).toBe('')
      expect(cfg.playlistNameFilter).toBe('Dance')
      expect(cfg.playlistNameBlacklist).toEqual([])
      expect(cfg.ignorePlaylistId).toBe('')
      expect(cfg.anthropicApiKey).toBe('')
      expect(cfg.anthropicProxyUrl).toBe('')
      expect(cfg.categoryNames).toContain('Energy')
      expect(cfg.categoryNames).toContain('Mood')
      expect(cfg.categoryNames.length).toBeGreaterThan(0)
    })

    it('returns stored values after saveConfig', () => {
      saveConfig({ spotifyClientId: 'abc123', playlistNameFilter: 'Salsa' })
      const cfg = getConfig()
      expect(cfg.spotifyClientId).toBe('abc123')
      expect(cfg.playlistNameFilter).toBe('Salsa')
    })

    it('merges with defaults — unset keys keep their default', () => {
      saveConfig({ spotifyClientId: 'xyz' })
      const cfg = getConfig()
      expect(cfg.spotifyClientId).toBe('xyz')
      expect(cfg.playlistNameFilter).toBe('Dance')  // default preserved
    })

    it('returns defaults when stored JSON is corrupt', () => {
      localStorage.setItem('app_config', '{ bad json }}}')
      const cfg = getConfig()
      expect(cfg.playlistNameFilter).toBe('Dance')
    })
  })

  describe('saveConfig', () => {
    it('persists a partial update without overwriting unrelated keys', () => {
      saveConfig({ spotifyClientId: 'first' })
      saveConfig({ anthropicApiKey: 'sk-ant-xxx' })
      const cfg = getConfig()
      expect(cfg.spotifyClientId).toBe('first')
      expect(cfg.anthropicApiKey).toBe('sk-ant-xxx')
    })

    it('persists arrays correctly', () => {
      saveConfig({ playlistNameBlacklist: ['A', 'B', 'C'] })
      expect(getConfig().playlistNameBlacklist).toEqual(['A', 'B', 'C'])
    })

    it('overwrites a previously set key', () => {
      saveConfig({ spotifyClientId: 'old' })
      saveConfig({ spotifyClientId: 'new' })
      expect(getConfig().spotifyClientId).toBe('new')
    })

    it('persists categoryNames order', () => {
      const names = ['Mood', 'Energy', 'Genre']
      saveConfig({ categoryNames: names })
      expect(getConfig().categoryNames).toEqual(names)
    })
  })
})
