import { describe, expect, it } from 'vitest'
import { StreamingQueue } from './streamingQueue'

describe('StreamingQueue', () => {
  it('yields items in the order they were pushed', async () => {
    const queue = new StreamingQueue<number>()
    const pushes = (async () => {
      await queue.push(1)
      await queue.push(2)
      await queue.push(3)
      queue.close()
    })()

    const received: number[] = []
    for await (const item of queue) received.push(item)
    await pushes

    expect(received).toEqual([1, 2, 3])
  })

  it('blocks a push once the buffer is full, until the consumer pulls to make room', async () => {
    const queue = new StreamingQueue<string>(1)
    const order: string[] = []

    const producer = (async () => {
      await queue.push('a')
      order.push('pushed a')
      await queue.push('b') // buffer already holds 'a' (capacity 1) - must block here
      order.push('pushed b')
      queue.close()
    })()

    // Give the producer a turn: push('a') should resolve (buffer has room), but
    // push('b') should not, since the buffer is now full and nothing has consumed yet.
    await Promise.resolve()
    await Promise.resolve()
    expect(order).toEqual(['pushed a'])

    const iterator = queue[Symbol.asyncIterator]()
    const first = await iterator.next()
    expect(first.value).toBe('a')

    // Pulling 'a' frees the one slot, so push('b') can now proceed.
    await producer
    expect(order).toEqual(['pushed a', 'pushed b'])

    const second = await iterator.next()
    expect(second.value).toBe('b')
    const third = await iterator.next()
    expect(third.done).toBe(true)
  })

  it('never buffers more than `capacity` items at once across a large batch', async () => {
    const queue = new StreamingQueue<number>(1)
    let maxSize = 0

    const producer = (async () => {
      for (let i = 0; i < 100; i++) {
        await queue.push(i)
        maxSize = Math.max(maxSize, queue.size)
      }
      queue.close()
    })()

    const received: number[] = []
    for await (const item of queue) {
      maxSize = Math.max(maxSize, queue.size)
      received.push(item)
    }
    await producer

    expect(received).toHaveLength(100)
    expect(maxSize).toBeLessThanOrEqual(1)
  })

  it('fail() rejects a push that is currently blocked waiting for room, instead of hanging it forever', async () => {
    const queue = new StreamingQueue<string>(1)
    await queue.push('a') // fills the one slot; nothing consumes it

    const stuckPush = queue.push('b')
    await Promise.resolve()
    await Promise.resolve()

    queue.fail(new Error('consumer exploded'))
    await expect(stuckPush).rejects.toThrow('consumer exploded')
  })

  it('rejects immediately if push is called after fail()', async () => {
    const queue = new StreamingQueue<number>()
    queue.fail(new Error('boom'))
    await expect(queue.push(1)).rejects.toThrow('boom')
  })

  it('stops the async iterator (without throwing through it) once fail() is called', async () => {
    const queue = new StreamingQueue<number>()
    const received: number[] = []
    const iterated = (async () => {
      for await (const item of queue) received.push(item)
    })()
    await Promise.resolve()
    queue.fail(new Error('boom'))
    await iterated
    expect(received).toEqual([])
  })

  it('throws if push is called after close', async () => {
    const queue = new StreamingQueue<number>()
    queue.close()
    await expect(queue.push(1)).rejects.toThrow()
  })

  it('an empty queue that is immediately closed yields nothing', async () => {
    const queue = new StreamingQueue<number>()
    queue.close()
    const received: number[] = []
    for await (const item of queue) received.push(item)
    expect(received).toEqual([])
  })
})
