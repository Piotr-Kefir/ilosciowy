/** Czyste aktualizacje stanu (zwracają nowy obiekt, nie mutują wejścia). */
import type { PosReport } from '../parser/types'
import { STANY_31_07 } from './defaults'
import type { AppState, Invoice, MonthData, NumField, ProductEntry } from './types'

export function emptyMonth(miesiac: string): MonthData {
  return { miesiac, wpisy: {} }
}

export function getMonth(state: AppState, miesiac: string): MonthData {
  return state.months[miesiac] ?? emptyMonth(miesiac)
}

function withMonth(state: AppState, miesiac: string, f: (m: MonthData) => MonthData): AppState {
  return { ...state, months: { ...state.months, [miesiac]: f(getMonth(state, miesiac)) } }
}

/** Import raportu: nadpisuje raport miesiąca, nie rusza wpisów ręcznych; aktualizuje historię pozycji. */
export function importReport(state: AppState, report: PosReport, now = new Date().toISOString()): AppState {
  const m = report.miesiac
  const seen = { ...state.seen }
  for (const p of report.pozycje) {
    const s = seen[p.posKey]
    if (!s) seen[p.posKey] = { posKey: p.posKey, pierwszyMiesiac: m, ostatniaNazwaOryginalna: p.nazwa }
    else
      seen[p.posKey] = {
        ...s,
        pierwszyMiesiac: s.pierwszyMiesiac < m ? s.pierwszyMiesiac : m,
        ostatniaNazwaOryginalna: m >= s.pierwszyMiesiac ? p.nazwa : s.ostatniaNazwaOryginalna,
      }
  }
  return withMonth({ ...state, seen }, m, (mon) => ({ ...mon, raport: report, importedAt: now }))
}

export function setEntryField<K extends keyof ProductEntry>(
  state: AppState,
  miesiac: string,
  productId: string,
  field: K,
  value: ProductEntry[K] | undefined,
): AppState {
  return withMonth(state, miesiac, (mon) => {
    const e = { ...(mon.wpisy[productId] ?? {}) }
    if (value === undefined) delete e[field]
    else e[field] = value
    return { ...mon, wpisy: { ...mon.wpisy, [productId]: e } }
  })
}

export function setMonthField(
  state: AppState,
  miesiac: string,
  field: 'kgZWypalu' | 'kosztWypalu',
  value: NumField | undefined,
): AppState {
  return withMonth(state, miesiac, (mon) => {
    const n = { ...mon }
    if (value === undefined) delete n[field]
    else n[field] = value
    return n
  })
}

export function setMonthClosed(state: AppState, miesiac: string, closed: boolean, now = new Date().toISOString()): AppState {
  return withMonth(state, miesiac, (mon) => ({ ...mon, zamknietyAt: closed ? now : undefined }))
}

/** „Wczytaj stany z 31.07” — ustawia ręczny stan początkowy (nie nadpisuje już wpisanych). */
export function loadStany3107(state: AppState, miesiac: string): AppState {
  let s = state
  for (const [productId, f] of Object.entries(STANY_31_07)) {
    if (getMonth(s, miesiac).wpisy[productId]?.start) continue
    s = setEntryField(s, miesiac, productId, 'start', { ...f })
  }
  return s
}

export function upsertInvoice(state: AppState, inv: Invoice): AppState {
  const exists = state.invoices.some((i) => i.id === inv.id)
  return {
    ...state,
    invoices: exists ? state.invoices.map((i) => (i.id === inv.id ? inv : i)) : [...state.invoices, inv],
  }
}

export function deleteInvoice(state: AppState, id: string): AppState {
  return { ...state, invoices: state.invoices.filter((i) => i.id !== id) }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
