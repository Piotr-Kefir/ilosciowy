import { describe, expect, it } from 'vitest'
import { SyncEngine, type CacheRecord, type Remote, type SyncStatus } from '../src/cloud/sync'
import { setEntryField } from '../src/domain/actions'
import { defaultState } from '../src/domain/defaults'
import type { AppState } from '../src/domain/types'
import { migrate } from '../src/store'

/** Udawana chmura z tą samą logiką wersji co funkcja save_state w bazie. */
class FakeRemote implements Remote {
  doc: { data: AppState; rev: number } | null = null
  archived: { data: AppState; note: string }[] = []
  online = true
  async load() {
    if (!this.online) throw new Error('offline')
    return this.doc ? { data: structuredClone(this.doc.data), rev: this.doc.rev } : null
  }
  async save(expected: number, data: AppState) {
    if (!this.online) throw new Error('offline')
    if (expected === 0) {
      if (this.doc) return null
      this.doc = { data: structuredClone(data), rev: 1 }
      return 1
    }
    if (!this.doc || this.doc.rev !== expected) return null
    this.doc = { data: structuredClone(data), rev: expected + 1 }
    return this.doc.rev
  }
  async archive(data: AppState, note: string) {
    this.archived.push({ data, note })
  }
}

class FakeCache {
  rec: CacheRecord | undefined
  async get() {
    return this.rec
  }
  async set(r: CacheRecord) {
    this.rec = r
  }
}

function engine(remote: FakeRemote, cache: FakeCache) {
  const events: { remote: AppState[]; info: string[]; status: SyncStatus[] } = { remote: [], info: [], status: [] }
  const e = new SyncEngine(
    remote,
    cache,
    migrate,
    {
      onRemoteState: (s, info) => {
        events.remote.push(s)
        if (info) events.info.push(info)
      },
      onStatus: (s) => events.status.push(s),
    },
    { debounceMs: 0, retryMs: 10_000 },
  )
  return { e, events }
}

const nf = (v: number) => ({ expr: String(v), value: v })
const withEnd = (s: AppState, v: number) => setEntryField(s, '2026-08', 'piwo', 'koniec', nf(v))

describe('synchronizacja z chmurą', () => {
  it('pierwsze uruchomienie: pusta chmura dostaje dane z urządzenia', async () => {
    const remote = new FakeRemote()
    const cache = new FakeCache()
    cache.rec = { state: withEnd(defaultState(), 400), dirty: false } // stare dane bez rev
    const { e } = engine(remote, cache)
    const s = await e.start(defaultState())
    expect(remote.doc?.rev).toBe(1)
    expect(remote.doc?.data.months['2026-08'].wpisy.piwo.koniec?.value).toBe(400)
    expect(s.months['2026-08'].wpisy.piwo.koniec?.value).toBe(400)
    expect(cache.rec).toMatchObject({ rev: 1, dirty: false })
  })

  it('drugie urządzenie ze starymi danymi: wygrywa chmura, lokalne dane idą do historii', async () => {
    const remote = new FakeRemote()
    remote.doc = { data: withEnd(defaultState(), 400), rev: 5 }
    const cache = new FakeCache()
    cache.rec = { state: withEnd(defaultState(), 123), dirty: false }
    const { e } = engine(remote, cache)
    const s = await e.start(defaultState())
    expect(s.months['2026-08'].wpisy.piwo.koniec?.value).toBe(400)
    expect(remote.archived).toHaveLength(1)
    expect(remote.archived[0].data.months['2026-08'].wpisy.piwo.koniec?.value).toBe(123)
    expect(e.currentRev).toBe(5)
  })

  it('edycja zapisuje się w chmurze z kolejną wersją', async () => {
    const remote = new FakeRemote()
    const cache = new FakeCache()
    const { e, events } = engine(remote, cache)
    const s0 = await e.start(defaultState())
    e.edit(withEnd(s0, 410))
    await e.flush()
    expect(remote.doc?.rev).toBe(2)
    expect(remote.doc?.data.months['2026-08'].wpisy.piwo.koniec?.value).toBe(410)
    expect(events.status.at(-1)?.kind).toBe('zapisane')
  })

  it('bez internetu: zmiany czekają w pamięci urządzenia i wysyłają się po powrocie sieci', async () => {
    const remote = new FakeRemote()
    const cache = new FakeCache()
    const { e, events } = engine(remote, cache)
    const s0 = await e.start(defaultState())
    remote.online = false
    e.edit(withEnd(s0, 420))
    await e.flush()
    expect(events.status.at(-1)?.kind).toBe('offline')
    expect(cache.rec).toMatchObject({ dirty: true, rev: 1 })

    // Aplikacja zamknięta i otwarta ponownie, już z internetem.
    remote.online = true
    const { e: e2 } = engine(remote, cache)
    const s = await e2.start(defaultState())
    expect(s.months['2026-08'].wpisy.piwo.koniec?.value).toBe(420)
    expect(remote.doc?.rev).toBe(2)
    expect(cache.rec?.dirty).toBe(false)
    e.stop()
  })

  it('konflikt: dwa urządzenia zapisują naraz — wygrywa pierwszy zapis, drugi trafia do historii', async () => {
    const remote = new FakeRemote()
    const a = engine(remote, new FakeCache())
    const b = engine(remote, new FakeCache())
    const s = await a.e.start(defaultState())
    await b.e.start(defaultState())

    a.e.edit(withEnd(s, 500))
    await a.e.flush()
    b.e.edit(withEnd(s, 600))
    await b.e.flush()

    expect(remote.doc?.data.months['2026-08'].wpisy.piwo.koniec?.value).toBe(500)
    expect(remote.archived.map((x) => x.data.months['2026-08'].wpisy.piwo.koniec?.value)).toEqual([600])
    expect(b.events.remote.at(-1)?.months['2026-08'].wpisy.piwo.koniec?.value).toBe(500)
    expect(b.events.info).toHaveLength(1)
  })

  it('powiadomienie z innego urządzenia wczytuje nowszą wersję', async () => {
    const remote = new FakeRemote()
    const a = engine(remote, new FakeCache())
    const b = engine(remote, new FakeCache())
    const s = await a.e.start(defaultState())
    await b.e.start(defaultState())
    a.e.edit(withEnd(s, 700))
    await a.e.flush()
    await b.e.remoteChanged(2)
    expect(b.events.remote.at(-1)?.months['2026-08'].wpisy.piwo.koniec?.value).toBe(700)
    expect(b.e.currentRev).toBe(2)
  })
})
