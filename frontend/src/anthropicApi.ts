import type { CategoryResponse, CategorySuggestion, SongResponse } from './types'

const CLAUDE_API = 'https://api.anthropic.com/v1/messages'

export async function getSuggestions(
  song: SongResponse,
  categories: CategoryResponse[],
  artistGenres: string[],
  anthropicApiKey: string,
  proxyUrl?: string,
): Promise<CategorySuggestion[]> {
  const missingCategories = categories.filter(c =>
    song.missingCategories.includes(c.name) && c.tags.length > 0
  )
  if (missingCategories.length === 0) return []

  const prompt = buildPrompt(song, artistGenres, missingCategories)
  const targetUrl = proxyUrl || CLAUDE_API

  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'x-api-key': anthropicApiKey,
  }

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      // Prefill the assistant turn with '[' to force a JSON array response
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '[' },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`Claude API ${response.status}: ${await response.text()}`)
  }

  const data = await response.json()
  const textBlock = (data.content ?? []).find((b: { type: string }) => b.type === 'text')
  // Prepend the prefilled '[' — the API returns only the continuation
  const text = '[' + (textBlock?.text ?? '')

  return parseResponse(text)
}

function buildPrompt(song: SongResponse, genres: string[], missingCategories: CategoryResponse[]): string {
  let p = 'You are a music tagger. Based on the following track info, suggest the most fitting tags '
  p += 'per category from the available options. Only suggest tags that genuinely fit the music style.\n\n'
  p += `Song: "${song.title}" by "${song.artist}"\n`
  p += `Spotify genres: ${genres.length ? genres.join(', ') : 'unknown'}\n\n`
  p += 'Categories and available tags (id: value):\n'
  for (const cat of missingCategories) {
    if (cat.tags.length === 0) continue
    p += `- ${cat.name}: ${cat.tags.map(t => `${t.id}: ${t.value}`).join(', ')}\n`
  }
  p += '\nRespond ONLY with a valid JSON array, no prose, no markdown fences:\n'
  p += '[{"categoryId": N, "categoryName": "...", "suggestedTagIds": [id, ...]}, ...]\n'
  p += 'Return 1–3 tag IDs per category. Omit categories with no good match.'
  return p
}

function parseResponse(text: string): CategorySuggestion[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []
  try {
    const array = JSON.parse(text.substring(start, end + 1))
    if (!Array.isArray(array)) return []
    return array
      .filter(item =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.categoryId === 'number' &&
        Array.isArray(item.suggestedTagIds)
      )
      .map((item: { categoryId: number; categoryName: string; suggestedTagIds: number[] }) => ({
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        suggestedTagIds: item.suggestedTagIds.filter((id): id is number => typeof id === 'number'),
      }))
  } catch {
    return []
  }
}
