import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultState } from '../domain/defaults'
import type { AppState } from '../domain/types'
import { migrate } from '../store'
import { clearLocalCache, hasAccess, idbCache, supabase, supabaseRemote } from './client'
import { SyncEngine, type SyncStatus } from './sync'

export type Phase =
  | { kind: 'ładowanie' }
  | { kind: 'logowanie' }
  | { kind: 'nowe hasło' }
  | { kind: 'brak dostępu'; email: string }
  | { kind: 'błąd'; message: string }
  | { kind: 'gotowe'; email: string }

export type Updater = (f: (s: AppState) => AppState) => void

export interface CloudApp {
  phase: Phase
  state: AppState | null
  update: Updater
  replace: (s: AppState) => void
  status?: SyncStatus
  info?: string
  dismissInfo: () => void
  signOut: () => Promise<void>
  /** Po ustawieniu nowego hasła (link z maila). */
  recovered: () => Promise<void>
}

/** Stan aplikacji zapisywany w chmurze (Supabase) z lokalną kopią na czas braku internetu. */
export function useCloudApp(): CloudApp {
  const [phase, setPhase] = useState<Phase>({ kind: 'ładowanie' })
  const [state, setState] = useState<AppState | null>(null)
  const [status, setStatus] = useState<SyncStatus>()
  const [info, setInfo] = useState<string>()
  const stateRef = useRef<AppState | null>(null)
  const engineRef = useRef<SyncEngine | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const startedFor = useRef<string | null>(null)

  const teardown = useCallback(() => {
    engineRef.current?.stop()
    engineRef.current = null
    if (channelRef.current) void supabase.removeChannel(channelRef.current)
    channelRef.current = null
    startedFor.current = null
  }, [])

  const init = useCallback(
    async (email: string) => {
      if (startedFor.current === email) return
      startedFor.current = email
      setPhase({ kind: 'ładowanie' })
      try {
        if (!(await hasAccess())) {
          setPhase({ kind: 'brak dostępu', email })
          return
        }
      } catch {
        // Bez internetu nie sprawdzimy listy — pracujemy na lokalnej kopii (sesja jest ważna).
      }
      const engine = new SyncEngine(supabaseRemote, idbCache(migrate), migrate, {
        onRemoteState: (s, msg) => {
          stateRef.current = s
          setState(s)
          if (msg) setInfo(msg)
        },
        onStatus: setStatus,
      })
      engineRef.current = engine
      const s = await engine.start(defaultState())
      stateRef.current = s
      setState(s)
      setPhase({ kind: 'gotowe', email })

      channelRef.current = supabase
        .channel('app_state')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_state' }, (p) => {
          const rev = (p.new as { rev?: number } | null)?.rev
          if (typeof rev === 'number') void engine.remoteChanged(rev)
        })
        .subscribe()
    },
    [],
  )

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const email = session?.user.email
      if (event === 'PASSWORD_RECOVERY') {
        // Link „nie pamiętam hasła” z maila — najpierw nowe hasło, potem aplikacja.
        teardown()
        setPhase({ kind: 'nowe hasło' })
        return
      }
      if (email) {
        // Wywołanie poza callbackiem auth (zalecenie supabase-js — unika zakleszczeń).
        setTimeout(() => void init(email), 0)
      } else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        teardown()
        stateRef.current = null
        setState(null)
        setPhase({ kind: 'logowanie' })
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [init, teardown])

  useEffect(() => {
    const flush = () => void engineRef.current?.flush()
    const visible = () => {
      if (document.visibilityState === 'visible') void engineRef.current?.remoteChanged(Number.MAX_SAFE_INTEGER)
      else flush()
    }
    window.addEventListener('online', flush)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.removeEventListener('online', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])

  const update: Updater = useCallback((f) => {
    const cur = stateRef.current
    if (!cur) return
    const next = f(cur)
    if (next === cur) return
    stateRef.current = next
    setState(next)
    engineRef.current?.edit(next)
  }, [])

  const replace = useCallback((s: AppState) => update(() => s), [update])

  const recovered = useCallback(async () => {
    const { data } = await supabase.auth.getUser()
    if (data.user?.email) await init(data.user.email)
  }, [init])

  const signOut = useCallback(async () => {
    await engineRef.current?.flush()
    teardown()
    await clearLocalCache()
    await supabase.auth.signOut()
  }, [teardown])

  return { phase, state, update, replace, status, info, dismissInfo: () => setInfo(undefined), signOut, recovered }
}
