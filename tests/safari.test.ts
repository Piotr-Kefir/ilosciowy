import { describe, expect, it } from 'vitest'
import { parseFixture } from './helpers'

// Safari nie ma ReadableStream[Symbol.asyncIterator] — symulujemy to w Node.
describe('zgodność z Safari (brak iteracji po ReadableStream)', () => {
  it('bez łatki parser się wywraca, z łatką czyta raport', async () => {
    const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>
    const original = proto[Symbol.asyncIterator]
    delete proto[Symbol.asyncIterator]
    try {
      const bez = await parseFixture('2026-03')
      expect(bez.ok).toBe(false)
      if (!bez.ok) expect(bez.errors.join()).toMatch(/not a function|not async iterable|is not iterable/)

      const { installReadableStreamAsyncIterator } = await import('../src/parser/streamPolyfill')
      installReadableStreamAsyncIterator()
      expect(typeof proto[Symbol.asyncIterator]).toBe('function')
      const z = await parseFixture('2026-03')
      expect(z.ok ? [] : z.errors).toEqual([])
    } finally {
      proto[Symbol.asyncIterator] = original
    }
  })
})
