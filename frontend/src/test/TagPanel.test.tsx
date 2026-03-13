import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TagPanel from '../components/TagPanel'
import type { CategoryResponse, SongResponse } from '../types'

vi.mock('../api', () => ({
  api: {
    getSuggestions: vi.fn().mockResolvedValue([]),
    updateCategoryOrder: vi.fn().mockResolvedValue(undefined),
  },
}))

import { api } from '../api'
const mockApi = vi.mocked(api)

const song: SongResponse = {
  spotifyUri: 'spotify:track:abc',
  title: 'Test Song',
  artist: 'Test Artist',
  coverUrl: null,
  durationMs: 210000,
  discoveredDate: '2024-01-15',
  missingCategories: ['Mood'],
  tags: [{ id: 10, categoryName: 'Energy', value: 'High', playlistName: 'Dance High Energy' }],
}

const categories: CategoryResponse[] = [
  {
    id: 1,
    name: 'Energy',
    tags: [
      { id: 10, categoryName: 'Energy', value: 'High', playlistName: 'Dance High Energy' },
      { id: 11, categoryName: 'Energy', value: 'Low', playlistName: 'Dance Low Energy' },
    ],
  },
  {
    id: 2,
    name: 'Mood',
    tags: [
      { id: 20, categoryName: 'Mood', value: 'Happy', playlistName: 'Dance Happy Mood' },
      { id: 21, categoryName: 'Mood', value: 'Sad', playlistName: 'Dance Sad Mood' },
    ],
  },
]

describe('TagPanel', () => {
  beforeEach(() => {
    mockApi.getSuggestions.mockResolvedValue([])
  })

  it('displays song title and artist', async () => {
    render(<TagPanel song={song} categories={categories} onTagToggle={vi.fn()} onCategoriesReordered={vi.fn()} onIgnore={vi.fn()} />)
    expect(screen.getByText('Test Song')).toBeInTheDocument()
    expect(screen.getByText('Test Artist')).toBeInTheDocument()
  })

  it('renders tag buttons for all categories', async () => {
    render(<TagPanel song={song} categories={categories} onTagToggle={vi.fn()} onCategoriesReordered={vi.fn()} onIgnore={vi.fn()} />)
    expect(screen.getByRole('button', { name: /High/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Low/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Happy/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sad/ })).toBeInTheDocument()
  })

  it('calls onTagToggle with tagId and assigned=true when removing an assigned tag', async () => {
    const onTagToggle = vi.fn().mockResolvedValue(undefined)
    render(<TagPanel song={song} categories={categories} onTagToggle={onTagToggle} onCategoriesReordered={vi.fn()} onIgnore={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /High/ }))
    expect(onTagToggle).toHaveBeenCalledWith(10, true)
  })

  it('calls onTagToggle with assigned=false when assigning an unassigned tag', async () => {
    const onTagToggle = vi.fn().mockResolvedValue(undefined)
    render(<TagPanel song={song} categories={categories} onTagToggle={onTagToggle} onCategoriesReordered={vi.fn()} onIgnore={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /Low/ }))
    expect(onTagToggle).toHaveBeenCalledWith(11, false)
  })

  it('calls onIgnore when the ignore button is clicked', async () => {
    const onIgnore = vi.fn().mockResolvedValue(undefined)
    render(<TagPanel song={song} categories={categories} onTagToggle={vi.fn()} onCategoriesReordered={vi.fn()} onIgnore={onIgnore} />)
    await userEvent.click(screen.getByRole('button', { name: /Add to ignore list/i }))
    expect(onIgnore).toHaveBeenCalledWith('spotify:track:abc')
  })

  it('filters tags by search input', async () => {
    render(<TagPanel song={song} categories={categories} onTagToggle={vi.fn()} onCategoriesReordered={vi.fn()} onIgnore={vi.fn()} />)
    await userEvent.type(screen.getByPlaceholderText('Search tags…'), 'High')
    expect(screen.getByRole('button', { name: /High/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Low/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Happy/ })).not.toBeInTheDocument()
  })

  it('marks missing categories with a "missing" indicator', async () => {
    render(<TagPanel song={song} categories={categories} onTagToggle={vi.fn()} onCategoriesReordered={vi.fn()} onIgnore={vi.fn()} />)
    expect(screen.getByText('● missing')).toBeInTheDocument()
  })

  it('shows AI suggested tags with ✦ prefix when suggestions arrive', async () => {
    mockApi.getSuggestions.mockResolvedValue([
      { categoryId: 2, categoryName: 'Mood', suggestedTagIds: [20] },
    ])
    render(<TagPanel song={song} categories={categories} onTagToggle={vi.fn()} onCategoriesReordered={vi.fn()} onIgnore={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('✦ Happy')).toBeInTheDocument())
  })
})
