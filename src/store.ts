import { get, set } from 'idb-keyval'
import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultState } from './domain/defaults'
import type { AppState } from './domain/types'

const KEY = 'ilosciowy-stan'

export type Updater = (f: (s: AppState) => AppState) => void

/** Uzupełnia stan wczytany z bazy lub kopii o pola dodane w nowszych wersjach. */
export function migrate(raw: unknown): AppState {
  const d = defaultState()
  const s = raw as Partial<AppState>
  if (!s || typeof s !== 'object' || !Array.isArray(s.products)) throw new Error('To nie jest kopia danych tej aplikacji.')
  return {
    ...d,
    ...s,
    settings: { ...d.settings, ...(s.settings ?? {}) },
    rules: s.rules ?? d.rules,
    seen: s.seen ?? d.seen,
    months: s.months ?? {},
    invoices: s.invoices ?? [],
    mappings: s.mappings ?? d.mappings,
    version: 1,
  }
}

export function useAppState(): {
  state: AppState | null
  update: Updater
  replace: (s: AppState) => void
  error?: string
  /** Kiedy ostatnio zapisano dane w przeglądarce. */
  savedAt?: Date
} {
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState<string>()
  const [savedAt, setSavedAt] = useState<Date>()
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    get(KEY)
      .then((raw) => setState(raw ? migrate(raw) : defaultState()))
      .catch((e: Error) => {
        setError(`Nie udało się otworzyć bazy w przeglądarce: ${e.message}`)
        setState(defaultState())
      })
  }, [])

  useEffect(() => {
    if (!state) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      set(KEY, state)
        .then(() => {
          setSavedAt(new Date())
          setError(undefined)
        })
        .catch((e: Error) => setError(`Nie udało się zapisać danych: ${e.message}`))
    }, 250)
  }, [state])

  const update: Updater = useCallback((f) => setState((s) => (s ? f(s) : s)), [])
  const replace = useCallback((s: AppState) => setState(s), [])
  return { state, update, replace, error, savedAt }
}

export function backupJson(state: AppState): string {
  return JSON.stringify({ aplikacja: 'ilosciowy', wersja: 1, utworzono: new Date().toISOString(), stan: state }, null, 1)
}

export function parseBackup(text: string): AppState {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('Plik nie jest poprawnym JSON-em.')
  }
  const d = data as { aplikacja?: string; stan?: unknown }
  if (d.aplikacja !== 'ilosciowy' || !d.stan) throw new Error('To nie jest kopia z aplikacji „Ilościowy”.')
  return migrate(d.stan)
}

export function downloadFile(name: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type Persistence = 'trwałe' | 'nietrwałe' | 'nieznane'

/**
 * Prosi przeglądarkę, żeby nie kasowała danych strony przy czyszczeniu miejsca
 * (Safari kasuje dane nieodwiedzanych stron po ~7 dniach, chyba że są na ekranie głównym).
 */
export async function requestPersistence(): Promise<Persistence> {
  try {
    if (!navigator.storage?.persist) return 'nieznane'
    if (await navigator.storage.persisted()) return 'trwałe'
    return (await navigator.storage.persist()) ? 'trwałe' : 'nietrwałe'
  } catch {
    return 'nieznane'
  }
}

export function isInstalledApp(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}
