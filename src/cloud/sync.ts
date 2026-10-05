/**
 * Synchronizacja stanu z chmurą. Chmura jest źródłem prawdy; lokalna pamięć (IndexedDB)
 * to kopia do pracy bez internetu. Każdy zapis podaje wersję (rev), od której wyszedł —
 * jeśli ktoś w międzyczasie zapisał nowszą, wygrywa chmura, a lokalna zmiana trafia do historii.
 */
import type { AppState } from '../domain/types'

export interface RemoteDoc {
  data: unknown
  rev: number
}

export interface Remote {
  load(): Promise<RemoteDoc | null>
  /** Zwraca nowy rev albo null przy konflikcie wersji. Rzuca przy braku sieci. */
  save(expectedRev: number, data: AppState): Promise<number | null>
  /** Odkłada wersję do historii w chmurze (np. lokalne dane sprzed synchronizacji). */
  archive(data: AppState, note: string): Promise<void>
}

export interface CacheRecord {
  state: AppState
  /** Wersja z chmury, z której wyszedł ten stan; undefined = dane sprzed synchronizacji. */
  rev?: number
  /** Są lokalne zmiany jeszcze niezapisane w chmurze. */
  dirty: boolean
}

export interface Cache {
  get(): Promise<CacheRecord | undefined>
  set(rec: CacheRecord): Promise<void>
}

export type SyncStatus =
  | { kind: 'zapisane'; at: Date }
  | { kind: 'zapisywanie' }
  | { kind: 'offline' }
  | { kind: 'błąd'; message: string }

export interface SyncCallbacks {
  /** Stan zmieniony z zewnątrz (chmura, konflikt) — UI ma go pokazać. */
  onRemoteState(state: AppState, info?: string): void
  onStatus(status: SyncStatus): void
}

/** Czy stan zawiera jakiekolwiek dane wpisane przez użytkownika. */
export function hasUserData(s: AppState): boolean {
  return Object.keys(s.months).length > 0 || s.invoices.length > 0
}

export class SyncEngine {
  private state!: AppState
  private rev = 0
  private dirty = false
  private saving = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private readonly remote: Remote
  private readonly cache: Cache
  private readonly migrate: (raw: unknown) => AppState
  private readonly cb: SyncCallbacks
  private readonly debounceMs: number
  private readonly retryMs: number

  constructor(
    remote: Remote,
    cache: Cache,
    migrate: (raw: unknown) => AppState,
    cb: SyncCallbacks,
    opts: { debounceMs?: number; retryMs?: number } = {},
  ) {
    this.remote = remote
    this.cache = cache
    this.migrate = migrate
    this.cb = cb
    this.debounceMs = opts.debounceMs ?? 800
    this.retryMs = opts.retryMs ?? 15000
  }

  get currentRev(): number {
    return this.rev
  }

  /** Uzgadnia lokalną kopię z chmurą. `fallback` — stan, gdy nie ma nic (domyślny katalog). */
  async start(fallback: AppState): Promise<AppState> {
    const cached = await this.cache.get()
    let remote: RemoteDoc | null
    try {
      remote = await this.remote.load()
    } catch {
      // Brak sieci: pracujemy na lokalnej kopii, zapis spróbuje się później.
      this.state = cached?.state ?? fallback
      this.rev = cached?.rev ?? 0
      this.dirty = cached?.dirty ?? false
      this.cb.onStatus({ kind: 'offline' })
      if (this.dirty || this.rev === 0) this.scheduleRetry()
      return this.state
    }

    if (!remote) {
      // Pierwsze uruchomienie z chmurą: wysyłamy to, co jest na urządzeniu.
      this.state = cached?.state ?? fallback
      this.rev = 0
      this.dirty = true
      await this.flush()
      return this.state
    }

    if (cached && cached.dirty && cached.rev === remote.rev) {
      // Niezapisane zmiany z pracy bez internetu, a w chmurze nic nowego — wysyłamy je.
      this.state = cached.state
      this.rev = cached.rev
      this.dirty = true
      await this.flush()
      return this.state
    }

    const remoteState = this.migrate(remote.data)
    if (
      cached &&
      (cached.dirty || cached.rev === undefined) &&
      hasUserData(cached.state) &&
      JSON.stringify(cached.state) !== JSON.stringify(remoteState)
    ) {
      // Lokalne dane różne od chmury — nie giną, trafiają do historii.
      const note =
        cached.rev === undefined
          ? 'Dane z urządzenia sprzed włączenia chmury'
          : 'Niezapisane zmiany z urządzenia (w chmurze była nowsza wersja)'
      try {
        await this.remote.archive(cached.state, note)
      } catch {
        /* historia jest dodatkiem — nie blokuje pracy */
      }
    }
    this.state = remoteState
    this.rev = remote.rev
    this.dirty = false
    await this.cache.set({ state: this.state, rev: this.rev, dirty: false })
    this.cb.onStatus({ kind: 'zapisane', at: new Date() })
    return this.state
  }

  /** Lokalna zmiana z UI. */
  edit(state: AppState): void {
    this.state = state
    this.dirty = true
    void this.cache.set({ state, rev: this.rev, dirty: true })
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.flush(), this.debounceMs)
  }

  /** Wysyła niezapisane zmiany od razu. */
  async flush(): Promise<void> {
    clearTimeout(this.timer)
    if (!this.dirty || this.saving) return
    this.saving = true
    this.cb.onStatus({ kind: 'zapisywanie' })
    const sent = this.state
    try {
      const newRev = await this.remote.save(this.rev, sent)
      if (newRev === null) {
        await this.resolveConflict(sent)
      } else {
        this.rev = newRev
        if (this.state === sent) this.dirty = false
        await this.cache.set({ state: this.state, rev: this.rev, dirty: this.dirty })
        this.cb.onStatus({ kind: 'zapisane', at: new Date() })
      }
    } catch {
      this.cb.onStatus({ kind: 'offline' })
      this.scheduleRetry()
    } finally {
      this.saving = false
    }
    // W trakcie zapisu przyszły nowe zmiany.
    if (this.dirty && this.state !== sent) await this.flush()
  }

  /** Powiadomienie (realtime), że w chmurze jest wersja `rev`. */
  async remoteChanged(rev: number): Promise<void> {
    if (rev <= this.rev || this.saving) return
    if (this.dirty) {
      // Mamy własne zmiany — zapis wykryje konflikt i rozstrzygnie.
      await this.flush()
      return
    }
    try {
      const remote = await this.remote.load()
      if (remote && remote.rev > this.rev) {
        this.state = this.migrate(remote.data)
        this.rev = remote.rev
        await this.cache.set({ state: this.state, rev: this.rev, dirty: false })
        this.cb.onRemoteState(this.state)
        this.cb.onStatus({ kind: 'zapisane', at: new Date() })
      }
    } catch {
      /* spróbujemy przy następnym powiadomieniu */
    }
  }

  stop(): void {
    clearTimeout(this.timer)
    clearTimeout(this.retryTimer)
  }

  private async resolveConflict(lost: AppState): Promise<void> {
    const remote = await this.remote.load()
    if (!remote) return
    try {
      await this.remote.archive(lost, 'Zmiana nadpisana przez zapis z innego urządzenia')
    } catch {
      /* jw. */
    }
    this.state = this.migrate(remote.data)
    this.rev = remote.rev
    this.dirty = false
    await this.cache.set({ state: this.state, rev: this.rev, dirty: false })
    this.cb.onRemoteState(
      this.state,
      'W tym samym czasie ktoś zapisał zmiany na innym urządzeniu. Wczytano najnowszą wersję — Twoja ostatnia zmiana jest w historii (zakładka „Kopia i historia”).',
    )
    this.cb.onStatus({ kind: 'zapisane', at: new Date() })
  }

  private scheduleRetry(): void {
    clearTimeout(this.retryTimer)
    this.retryTimer = setTimeout(() => {
      this.dirty = this.dirty || this.rev === 0
      void this.flush()
    }, this.retryMs)
  }
}
