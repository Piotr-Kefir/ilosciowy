import { normalizeName, splitPosKey } from '../parser/normalize'
import type { ReportPosition } from '../parser/types'
import type { AppState, KategoriaKawy, PosMapping, PosRule } from './types'

/** Przypisanie efektywne: jawne albo wynikające z reguły (np. torebki). */
export interface EffectiveMapping {
  posKey: string
  productId: string
  przelicznik: number
  przychodTutaj: boolean
  zalozenie?: string
  etykieta?: string
  kategoriaKawy?: KategoriaKawy
  zrodlo: { typ: 'przypisanie'; mapping: PosMapping } | { typ: 'reguła'; rule: PosRule }
}

/** Dla reguły zwraca przelicznik (gramy z nazwy → kg) albo null, jeśli nie pasuje. */
export function matchRule(rule: PosRule, posKey: string): number | null {
  const { grupa, nazwa } = splitPosKey(posKey)
  if (grupa !== rule.grupa) return null
  let re: RegExp
  try {
    re = new RegExp(rule.wzorzec)
  } catch {
    return null
  }
  const m = nazwa.match(re)
  if (!m) return null
  const g = Number((m[1] ?? '').replace(',', '.'))
  return Number.isFinite(g) && g > 0 ? g / 1000 : null
}

export function effectiveMappings(state: AppState, posKey: string): EffectiveMapping[] {
  if (state.seen[posKey]?.niesledzona) return []
  const explicit = state.mappings.filter((m) => m.posKey === posKey)
  if (explicit.length)
    return explicit.map((m) => ({
      posKey,
      productId: m.productId,
      przelicznik: m.przelicznik,
      przychodTutaj: m.przychodTutaj,
      zalozenie: m.zalozenie,
      etykieta: m.etykieta,
      kategoriaKawy: m.kategoriaKawy,
      zrodlo: { typ: 'przypisanie', mapping: m },
    }))
  for (const r of state.rules) {
    const p = matchRule(r, posKey)
    if (p !== null)
      return [
        {
          posKey,
          productId: r.productId,
          przelicznik: p,
          przychodTutaj: r.przychodTutaj,
          kategoriaKawy: r.kategoriaKawy,
          zrodlo: { typ: 'reguła', rule: r },
        },
      ]
  }
  return []
}

export type PositionStatus = 'przypisana' | 'nieśledzona' | 'bez decyzji'

export function positionStatus(state: AppState, posKey: string): PositionStatus {
  if (state.seen[posKey]?.niesledzona) return 'nieśledzona'
  return effectiveMappings(state, posKey).length ? 'przypisana' : 'bez decyzji'
}

/** Czy pozycja bez decyzji powinna trafić na czerwony baner (grupa kluczowa albo „matcha” w nazwie). */
export function isAlarmPosition(state: AppState, p: { grupa: number; posKey: string }): boolean {
  const { nazwa } = splitPosKey(p.posKey)
  return state.settings.grupyAlarmowe.includes(p.grupa) || nazwa.includes('matcha')
}

export interface NewPositionInfo {
  pozycja: ReportPosition
  nowa: boolean
  status: PositionStatus
  alarm: boolean
  /** Ta sama nazwa ma przypisanie w innej grupie — podpowiedź do skopiowania. */
  podpowiedz?: { posKey: string; mappings: PosMapping[] }
}

/** Analiza pozycji raportu: czy nowa (pierwszy raz w tym lub późniejszym miesiącu), status, alarm, podpowiedź. */
export function analyzePositions(
  state: AppState,
  pozycje: ReportPosition[],
  miesiac: string,
): NewPositionInfo[] {
  return pozycje.map((p) => {
    const s = state.seen[p.posKey]
    const nowa = !s || s.pierwszyMiesiac >= miesiac
    const status = positionStatus(state, p.posKey)
    let podpowiedz: NewPositionInfo['podpowiedz']
    if (status === 'bez decyzji') {
      const name = normalizeName(p.nazwa)
      const other = state.mappings.find((m) => m.posKey !== p.posKey && splitPosKey(m.posKey).nazwa === name)
      if (other)
        podpowiedz = { posKey: other.posKey, mappings: state.mappings.filter((m) => m.posKey === other.posKey) }
    }
    return { pozycja: p, nowa, status, alarm: status === 'bez decyzji' && isAlarmPosition(state, p), podpowiedz }
  })
}
