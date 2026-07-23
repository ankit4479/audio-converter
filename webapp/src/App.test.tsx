import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from './App'

describe('App', () => {
  it('renders the Setup screen by default, matching SetupView.swift', () => {
    render(<App />)
    expect(screen.getByText('Drag songs or folders here')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Choose Files or a Folder' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Convert' })).toBeDisabled()
  })
})
