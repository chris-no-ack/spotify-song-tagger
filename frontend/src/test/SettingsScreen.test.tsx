import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import SettingsScreen from '../components/SettingsScreen'

vi.mock('../spotifyAuth', () => ({
  getRedirectUri: () => 'http://localhost:5173',
}))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('SettingsScreen', () => {
  it('renders the settings heading', () => {
    render(<SettingsScreen onClose={() => {}} />)
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders Export JSON and Import JSON buttons', () => {
    render(<SettingsScreen onClose={() => {}} />)
    expect(screen.getByRole('button', { name: /export json/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import json/i })).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const onClose = vi.fn()
    const { getByRole } = render(<SettingsScreen onClose={onClose} />)
    getByRole('button', { name: /cancel/i }).click()
    expect(onClose).toHaveBeenCalled()
  })
})

