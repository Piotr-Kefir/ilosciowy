/**
 * Safari nie umie iterować po ReadableStream (`for await (const x of stream)`),
 * a pdfjs tak czyta tekst stron i dekompresuje dane — bez tego Safari kończy się
 * błędem „undefined is not a function (near '...e of t...')”.
 * Ładowane w wątku głównym i w workerze pdfjs.
 */
export function installReadableStreamAsyncIterator(): boolean {
  const RS = globalThis.ReadableStream as unknown as { prototype: Record<symbol, unknown> } | undefined
  if (!RS || typeof RS.prototype[Symbol.asyncIterator] === 'function') return false
  RS.prototype[Symbol.asyncIterator] = async function* (this: ReadableStream) {
    const reader = this.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        yield value
      }
    } finally {
      reader.releaseLock()
    }
  }
  return true
}

installReadableStreamAsyncIterator()
