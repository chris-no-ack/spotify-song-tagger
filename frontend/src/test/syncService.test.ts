import { describe, it, expect } from 'vitest'
import { parseCategoryAndValue } from '../syncService'

const FILTER = 'Dance'
const CATEGORIES = new Set(['Energy', 'Mood', 'Beat', 'Genre', 'Instrument', 'Language',
  'Attribute', 'Complexity', 'Singer', 'Popularity', 'Year'])

function parse(name: string) {
  return parseCategoryAndValue(name, FILTER, CATEGORIES)
}

describe('parseCategoryAndValue', () => {
  describe('standard category extraction', () => {
    it('extracts category from last word when it matches a keyword', () => {
      expect(parse('Dance High Energy')).toEqual({ category: 'Energy', value: 'High' })
    })

    it('extracts value as remainder before the category keyword', () => {
      expect(parse('Dance Happy Mood')).toEqual({ category: 'Mood', value: 'Happy' })
    })

    it('strips filter word and trims whitespace', () => {
      expect(parse('Dance Romantic Mood')).toEqual({ category: 'Mood', value: 'Romantic' })
    })

    it('handles multi-word values before the category', () => {
      expect(parse('Dance Dark Romantic Mood')).toEqual({ category: 'Mood', value: 'Dark Romantic' })
    })

    it('is case-insensitive for filter word', () => {
      expect(parse('dance High Energy')).toEqual({ category: 'Energy', value: 'High' })
      expect(parse('DANCE High Energy')).toEqual({ category: 'Energy', value: 'High' })
    })

    it('is case-insensitive for category keyword matching (category name uses keyword casing from the Set)', () => {
      // 'energy' matches 'Energy' in the Set → category uses the Set's casing
      expect(parse('Dance High energy')).toEqual({ category: 'Energy', value: 'High' })
    })

    it('handles filter word mid-name', () => {
      expect(parse('High Dance Energy')).toEqual({ category: 'Energy', value: 'High' })
    })
  })

  describe('single-word playlists (value = category)', () => {
    it('uses keyword as value when nothing remains after stripping', () => {
      // "Dance Energy" → stripped = "Energy", no remainder → value = "Energy"
      expect(parse('Dance Energy')).toEqual({ category: 'Energy', value: 'Energy' })
    })

    it('handles Ignore playlist', () => {
      // The ignore playlist: stripped = "Ignore", not a known category → Other
      expect(parse('Dance Ignore')).toEqual({ category: 'Other', value: 'Ignore' })
    })
  })

  describe('unknown category fallback', () => {
    it('falls back to Other when last word is not a known category', () => {
      expect(parse('Dance Summer Vibes')).toEqual({ category: 'Other', value: 'Summer Vibes' })
    })

    it('falls back to Other for completely unknown names', () => {
      expect(parse('Dance Special Set')).toEqual({ category: 'Other', value: 'Special Set' })
    })
  })

  describe('edge cases', () => {
    it('returns null when only the filter word remains', () => {
      expect(parse('Dance')).toBeNull()
    })

    it('returns null when filter occupies the entire name (case-insensitive)', () => {
      expect(parse('DANCE')).toBeNull()
    })

    it('collapses multiple spaces after stripping', () => {
      // "Dance  High  Energy" (extra spaces) → should normalize
      expect(parse('Dance  High  Energy')).toEqual({ category: 'Energy', value: 'High' })
    })

    it('handles filter word appearing multiple times', () => {
      expect(parse('Dance High Dance Energy')).toEqual({ category: 'Energy', value: 'High' })
    })

    it('handles filter word as whole word only (not substring)', () => {
      // "Sdance" should NOT have Dance stripped
      expect(parse('Sdance High Energy')).toEqual({ category: 'Energy', value: 'Sdance High' })
    })

    it('preserves correct value when category word appears in value', () => {
      // "Dance Mood Mood" → strips "Dance", gets "Mood Mood" → lastWord="Mood", remainder="Mood"
      expect(parse('Dance Mood Mood')).toEqual({ category: 'Mood', value: 'Mood' })
    })
  })

  describe('all default categories are extractable', () => {
    const categories = ['Energy', 'Mood', 'Beat', 'Genre', 'Instrument', 'Language',
      'Attribute', 'Complexity', 'Singer', 'Popularity', 'Year']

    for (const cat of categories) {
      it(`extracts ${cat}`, () => {
        const result = parse(`Dance Test ${cat}`)
        expect(result?.category).toBe(cat)
        expect(result?.value).toBe('Test')
      })
    }
  })
})
