import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BatchScheduler, type JobConverter } from '../engine/batchScheduler'
import type { AudioFile } from '../intake/audioFile'
import { OutputDestination } from '../output/OutputDestination'
import { ConvertView } from './ConvertView'

function audioFile(name: string): AudioFile {
  return {
    id: name,
    file: new File(['x'], name),
    relativePath: name,
    fileSize: 1,
    displayName: name,
  }
}

const SETTINGS = {
  codec: 'flac' as const,
  quality: 'best' as const,
  compression: 'balanced' as const,
  sampleRate: 'keepOriginal' as const,
  keepMetadata: true,
}

/** Drives a real BatchScheduler to a specific, fully-settled state so ConvertView
 *  can be rendered against real getters (completedCount, failedJobs, isFinished...)
 *  rather than a hand-built fake snapshot. */
async function runToCompletion(fileNames: string[], failNames: Set<string> = new Set()) {
  const createConverter = (): JobConverter => ({
    convert: async (_file, baseName) => {
      if (failNames.has(baseName)) throw new Error('corrupt file')
      return { blob: new Blob(['x']), fileName: 'ignored' }
    },
    dispose: () => {},
  })
  const scheduler = new BatchScheduler({ concurrency: fileNames.length, createConverter })
  await scheduler.run(fileNames.map(audioFile), SETTINGS)
  return scheduler
}

async function fakeZipDestination(): Promise<OutputDestination> {
  delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
  return (await OutputDestination.choose(3))!
}

describe('ConvertView - folder chip (ConvertView.swift:28-46)', () => {
  it('shows the destination label, truncated in the middle when long, with a title for the full text', async () => {
    window.showDirectoryPicker = vi.fn().mockResolvedValue({
      name: 'A Really Quite Long Music Folder Name For Testing Truncation',
    })
    const destination = (await OutputDestination.choose(1))!
    const scheduler = await runToCompletion(['a.wav'])

    render(
      <ConvertView
        scheduler={scheduler}
        destination={destination}
        codecLabel="FLAC"
        finalized={true}
        onChange={() => {}}
        onConvertMore={() => {}}
      />,
    )

    const fullLabel = destination.destinationLabel('FLAC')
    const shown = screen.getByTitle(fullLabel)
    expect(shown.textContent).not.toBe(fullLabel)
    expect(shown.textContent!.length).toBeLessThan(fullLabel.length)
    expect(shown.textContent).toContain('…')

    delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker
  })

  it('calls onChange when "Change" is clicked', async () => {
    const destination = await fakeZipDestination()
    const scheduler = await runToCompletion(['a.wav', 'b.wav', 'c.wav'])
    const onChange = vi.fn()

    render(
      <ConvertView
        scheduler={scheduler}
        destination={destination}
        codecLabel="FLAC"
        finalized={true}
        onChange={onChange}
        onConvertMore={() => {}}
      />,
    )
    fireEvent.click(screen.getByText('Change'))
    expect(onChange).toHaveBeenCalled()
  })
})

describe('ConvertView - progress block (ConvertView.swift:48-68)', () => {
  it('says "Converted N of M" once finished', async () => {
    const destination = await fakeZipDestination()
    const scheduler = await runToCompletion(['a.wav', 'b.wav'])

    render(
      <ConvertView
        scheduler={scheduler}
        destination={destination}
        codecLabel="FLAC"
        finalized={true}
        onChange={() => {}}
        onConvertMore={() => {}}
      />,
    )
    expect(screen.getByText('Converted 2 of 2')).toBeInTheDocument()
  })
})

describe('ConvertView - done card (ConvertView.swift:70-118)', () => {
  it('renders with 0 failures: no failure list, no failure count line', async () => {
    const destination = await fakeZipDestination()
    const scheduler = await runToCompletion(['a.wav', 'b.wav', 'c.wav'])

    render(
      <ConvertView
        scheduler={scheduler}
        destination={destination}
        codecLabel="FLAC"
        finalized={true}
        onChange={() => {}}
        onConvertMore={() => {}}
      />,
    )
    expect(screen.getByText('3 of 3 songs converted')).toBeInTheDocument()
    expect(screen.queryByText(/could not be converted/)).not.toBeInTheDocument()
  })

  it('renders with 3 failures: shows the count and each failure line', async () => {
    const destination = await fakeZipDestination()
    const names = ['a.wav', 'b.wav', 'c.wav', 'd.wav', 'e.wav']
    const scheduler = await runToCompletion(names, new Set(['a', 'b', 'c']))

    render(
      <ConvertView
        scheduler={scheduler}
        destination={destination}
        codecLabel="FLAC"
        finalized={true}
        onChange={() => {}}
        onConvertMore={() => {}}
      />,
    )
    expect(screen.getByText('2 of 5 songs converted')).toBeInTheDocument()
    expect(screen.getByText('3 could not be converted')).toBeInTheDocument()
    expect(screen.getByText('- a.wav, corrupt file')).toBeInTheDocument()
    expect(screen.queryByText(/and \d+ more/)).not.toBeInTheDocument()
  })

  it('renders with 12 failures: caps the list at 5 and shows "and N more"', async () => {
    const destination = await fakeZipDestination()
    const names = Array.from({ length: 12 }, (_, i) => `f${i}.wav`)
    const scheduler = await runToCompletion(
      names,
      new Set(names.map((n) => n.replace('.wav', ''))),
    )

    render(
      <ConvertView
        scheduler={scheduler}
        destination={destination}
        codecLabel="FLAC"
        finalized={true}
        onChange={() => {}}
        onConvertMore={() => {}}
      />,
    )
    expect(screen.getByText('0 of 12 songs converted')).toBeInTheDocument()
    expect(screen.getByText('12 could not be converted')).toBeInTheDocument()
    expect(screen.getByText('and 7 more')).toBeInTheDocument()
    expect(screen.getAllByText(/^- f\d+\.wav, /)).toHaveLength(5)
  })

  it('calls onConvertMore when "Convert More" is clicked', async () => {
    const destination = await fakeZipDestination()
    const scheduler = await runToCompletion(['a.wav'])
    const onConvertMore = vi.fn()

    render(
      <ConvertView
        scheduler={scheduler}
        destination={destination}
        codecLabel="FLAC"
        finalized={true}
        onChange={() => {}}
        onConvertMore={onConvertMore}
      />,
    )
    fireEvent.click(screen.getByText('Convert More'))
    expect(onConvertMore).toHaveBeenCalled()
  })

  it('labels the primary action per output mode and wires it to revealDestination', async () => {
    const destination = await fakeZipDestination()
    const revealSpy = vi.spyOn(destination, 'revealDestination').mockResolvedValue()
    const scheduler = await runToCompletion(['a.wav'])

    render(
      <ConvertView
        scheduler={scheduler}
        destination={destination}
        codecLabel="FLAC"
        finalized={true}
        onChange={() => {}}
        onConvertMore={() => {}}
      />,
    )
    const button = screen.getByText('Download Again')
    fireEvent.click(button)
    expect(revealSpy).toHaveBeenCalled()
  })
})
