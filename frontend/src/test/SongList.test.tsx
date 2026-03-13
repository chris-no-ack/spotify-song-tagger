import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SongList from '../components/SongList'
import type { SongResponse } from '../types'

const makeSong = (n: number, missingCategories: string[] = []): SongResponse => ({
  spotifyUri: `spotify:track:${n}`,
  title: `Song ${n}`,
  artist: `Artist ${n}`,
  coverUrl: null,
  durationMs: null,
  discoveredDate: null,
  missingCategories,
  tags: [],
})

describe('SongList', () => {
  it('shows placeholder when list is empty', () => {
    render(<SongList songs={[]} selectedSong={null} onSelect={vi.fn()} />)
    expect(screen.getByText('No songs')).toBeInTheDocument()
  })

  it('renders one row per song', () => {
    const songs = [makeSong(1), makeSong(2), makeSong(3)]
    render(<SongList songs={songs} selectedSong={null} onSelect={vi.fn()} />)
    expect(screen.getByText('Song 1')).toBeInTheDocument()
    expect(screen.getByText('Song 2')).toBeInTheDocument()
    expect(screen.getByText('Song 3')).toBeInTheDocument()
  })

  it('calls onSelect with the clicked song', async () => {
    const onSelect = vi.fn()
    const songs = [makeSong(1), makeSong(2)]
    render(<SongList songs={songs} selectedSong={null} onSelect={onSelect} />)
    await userEvent.click(screen.getByText('Song 2'))
    expect(onSelect).toHaveBeenCalledWith(songs[1])
  })

  it('highlights the selected song', () => {
    const songs = [makeSong(1), makeSong(2)]
    const { container } = render(
      <SongList songs={songs} selectedSong={songs[0]} onSelect={vi.fn()} />
    )
    const buttons = container.querySelectorAll('button')
    expect(buttons[0].className).toContain('bg-neutral-700')
    expect(buttons[1].className).not.toContain('bg-neutral-700')
  })

  it('shows green check when no categories are missing', () => {
    render(<SongList songs={[makeSong(1, [])]} selectedSong={null} onSelect={vi.fn()} />)
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('shows red badge with count when categories are missing', () => {
    render(<SongList songs={[makeSong(1, ['Energy', 'Mood'])]} selectedSong={null} onSelect={vi.fn()} />)
    expect(screen.getByText('✗2')).toBeInTheDocument()
  })
})
