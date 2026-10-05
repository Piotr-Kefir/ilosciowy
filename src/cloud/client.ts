import { createClient } from '@supabase/supabase-js'
import { del, get, set } from 'idb-keyval'
import type { AppState } from '../domain/types'
import { SUPABASE_KEY, SUPABASE_URL } from './config'
import type { Cache, CacheRecord, Remote } from './sync'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'ilosciowy-auth', detectSessionInUrl: false },
})

const STATE_ID = 'kawiarnia'

export const supabaseRemote: Remote = {
  async load() {
    const { data, error } = await supabase.from('app_state').select('data, rev').eq('id', STATE_ID).maybeSingle()
    if (error) throw error
    return data
  },
  async save(expectedRev, state) {
    const { data, error } = await supabase.rpc('save_state', { p_expected_rev: expectedRev, p_data: state })
    if (error) throw error
    return (data as number | null) ?? null
  },
  async archive(state, note) {
    const { data: u } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('app_state_history')
      .insert({ state_id: STATE_ID, data: state, note, saved_by: u.user?.email })
    if (error) throw error
  },
}

/** Czy zalogowany e-mail jest na liście dozwolonych. */
export async function hasAccess(): Promise<boolean> {
  const { data, error } = await supabase.from('allowed_users').select('email').limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}

export interface HistoryEntry {
  id: number
  saved_at: string
  saved_by: string | null
  note: string | null
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  const { data, error } = await supabase
    .from('app_state_history')
    .select('id, saved_at, saved_by, note')
    .eq('state_id', STATE_ID)
    .order('saved_at', { ascending: false })
    .limit(60)
  if (error) throw error
  return data ?? []
}

export async function loadHistoryState(id: number): Promise<unknown> {
  const { data, error } = await supabase.from('app_state_history').select('data').eq('id', id).single()
  if (error) throw error
  return data.data
}

const CACHE_KEY = 'ilosciowy-cache'
/** Klucz z wersji sprzed chmury (dane tylko w przeglądarce). */
const LEGACY_KEY = 'ilosciowy-stan'

export function idbCache(migrate: (raw: unknown) => AppState): Cache {
  return {
    async get(): Promise<CacheRecord | undefined> {
      try {
        const rec = (await get(CACHE_KEY)) as CacheRecord | undefined
        if (rec?.state) return { ...rec, state: migrate(rec.state) }
        const legacy = await get(LEGACY_KEY)
        if (legacy) return { state: migrate(legacy), rev: undefined, dirty: false }
      } catch {
        /* uszkodzona lub niedostępna pamięć — zaczynamy od chmury */
      }
      return undefined
    },
    async set(rec) {
      try {
        await set(CACHE_KEY, rec)
        await del(LEGACY_KEY)
      } catch {
        /* chmura i tak ma dane */
      }
    },
  }
}

export async function clearLocalCache(): Promise<void> {
  try {
    await del(CACHE_KEY)
    await del(LEGACY_KEY)
  } catch {
    /* nic */
  }
}
