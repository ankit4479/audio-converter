import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConversionDemo } from './ConversionDemo'

describe('ConversionDemo', () => {
  it('shows a before and after file label', () => {
    render(<ConversionDemo />)
    expect(screen.getByText('MP3')).toBeInTheDocument()
    expect(screen.getByText('FLAC')).toBeInTheDocument()
  })
})
