/**
 * A bounded async channel (default capacity 1): push() blocks once the buffer is
 * full, only resolving once the consuming async iterator has pulled an item to make
 * room. This is what keeps the zip-output path memory-flat (issue #10's "Memory
 * stays flat during a 100 file batch") the same way the directory-output path is -
 * at most `capacity` converted files are ever buffered waiting to be zipped, never
 * an array holding the whole batch.
 */
export class StreamingQueue<T> {
  private readonly buffer: T[] = []
  private closed = false
  private failure: { error: unknown } | null = null
  private readonly pullWaiters: Array<() => void> = []
  private readonly pushWaiters: Array<() => void> = []
  private readonly capacity: number

  constructor(capacity = 1) {
    this.capacity = capacity
  }

  /** Items currently buffered, waiting to be pulled. Never exceeds `capacity`. */
  get size(): number {
    return this.buffer.length
  }

  /** Resolves once `item` has a slot in the buffer - i.e. once an earlier item has
   *  been pulled to make room, when the buffer was full. Rejects immediately (rather
   *  than hanging) if fail() has already been called or is called while this push
   *  was waiting for room - a consumer-side failure (e.g. the zip build erroring
   *  out) must surface here, not leave the caller awaiting forever. */
  async push(item: T): Promise<void> {
    this.throwIfFailed()
    if (this.closed) throw new Error('Cannot push to a closed StreamingQueue.')
    while (this.buffer.length >= this.capacity) {
      await new Promise<void>((resolve) => this.pushWaiters.push(resolve))
      this.throwIfFailed()
    }
    this.buffer.push(item)
    this.pullWaiters.shift()?.()
  }

  // A separate method, not an inline `if (this.failure) throw ...`, so TypeScript's
  // control-flow narrowing of `this.failure` from the first call site doesn't leak
  // into the second one after the `await` above and (wrongly) treat it as unreachable.
  private throwIfFailed(): void {
    if (this.failure) throw this.failure.error
  }

  /** Signals no more items are coming. Safe to call once every push() has resolved. */
  close(): void {
    this.closed = true
    this.pullWaiters.splice(0).forEach((wake) => wake())
  }

  /** Aborts the queue: any push() currently waiting for room, or called after this,
   *  rejects with `error` instead of hanging, and the async iterator stops. Used
   *  when the consumer side fails (the zip build throwing partway through a batch)
   *  so a writer blocked on a full buffer finds out instead of deadlocking. */
  fail(error: unknown): void {
    this.failure = { error }
    this.pushWaiters.splice(0).forEach((wake) => wake())
    this.pullWaiters.splice(0).forEach((wake) => wake())
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<T> {
    while (true) {
      if (this.buffer.length === 0) {
        if (this.closed || this.failure) return
        await new Promise<void>((resolve) => this.pullWaiters.push(resolve))
        continue
      }
      const item = this.buffer.shift()!
      this.pushWaiters.shift()?.()
      yield item
    }
  }
}
