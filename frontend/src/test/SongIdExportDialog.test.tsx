import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SongIdExportDialog from '../components/SongIdExportDialog'

vi.mock('../api', () => ({
  api: { getLastSongIdExportAt: vi.fn(), exportSongIds: vi.fn() },
}))
import { api } from '../api'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(api.getLastSongIdExportAt).mockReturnValue('2024-01-02T03:04:05.678Z')
  vi.mocked(api.exportSongIds).mockResolvedValue(['aaa', 'bbb'])
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
})

describe('SongIdExportDialog', () => {
  it('prefills with a second-precision datetime', () => {
    render(<SongIdExportDialog onClose={() => {}} />)
    expect((screen.getByLabelText(/discovered after/i) as HTMLInputElement).value).toMatch(/^2024-01-0[12] \d{2}:04:05$/)
  })

  it('prefills with now when nothing was exported yet', () => {
    vi.mocked(api.getLastSongIdExportAt).mockReturnValue('')
    render(<SongIdExportDialog onClose={() => {}} />)
    expect((screen.getByLabelText(/discovered after/i) as HTMLInputElement).value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('exports ids as txt and closes', async () => {
    const onClose = vi.fn()
    let blob: Blob | undefined
    vi.mocked(URL.createObjectURL).mockImplementation(b => { blob = b as Blob; return 'blob:x' })
    render(<SongIdExportDialog onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /export txt/i }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsText(blob!) })).toBe('aaa\nbbb\n')
  })

  it('defaults to 3 minimum tags and passes the value on', async () => {
    render(<SongIdExportDialog onClose={() => {}} />)
    const input = screen.getByLabelText(/minimum number of tags/i)
    expect(input).toHaveValue(3)
    await userEvent.clear(input)
    await userEvent.type(input, '5')
    await userEvent.click(screen.getByRole('button', { name: /export txt/i }))
    await waitFor(() => expect(api.exportSongIds).toHaveBeenCalledWith(expect.any(Date), 5))
  })

  it('rejects an invalid datetime', async () => {
    render(<SongIdExportDialog onClose={() => {}} />)
    const input = screen.getByLabelText(/discovered after/i)
    await userEvent.clear(input)
    await userEvent.type(input, 'garbage')
    await userEvent.click(screen.getByRole('button', { name: /export txt/i }))
    expect(await screen.findByText(/Use the format/)).toBeInTheDocument()
    expect(api.exportSongIds).not.toHaveBeenCalled()
  })
})
