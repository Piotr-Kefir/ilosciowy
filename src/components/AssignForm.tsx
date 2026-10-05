import { useState } from 'react'
import { newId } from '../domain/actions'
import { evalExpr } from '../domain/expr'
import type { AppState, PosMapping } from '../domain/types'
import type { Updater } from '../store'

/** Formularz „przypisz pozycję z kasy do produktu”. Dla produktów w kg przelicznik wpisuje się w gramach. */
export function AssignForm({ state, update, posKey, onDone }: { state: AppState; update: Updater; posKey: string; onDone?: () => void }) {
  const products = state.products.filter((p) => p.aktywny)
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [ile, setIle] = useState('')
  const [przychod, setPrzychod] = useState(!state.mappings.some((m) => m.posKey === posKey && m.przychodTutaj))
  const [err, setErr] = useState<string>()
  const product = products.find((p) => p.id === productId)
  const wGramach = product?.jednostka === 'kg'

  function save() {
    const r = evalExpr(ile)
    if (!r.ok) return setErr('Wpisz przelicznik')
    const przelicznik = wGramach ? r.value / 1000 : r.value
    const m: PosMapping = {
      id: newId(),
      posKey,
      productId,
      przelicznik,
      przychodTutaj: przychod,
      ...(product?.wypal ? { receptura: { typ: 'g' as const, g: r.value }, kategoriaKawy: 'ekspres' as const } : {}),
    }
    update((s) => ({
      ...s,
      mappings: [...s.mappings, m],
      seen: s.seen[posKey] ? { ...s.seen, [posKey]: { ...s.seen[posKey], niesledzona: undefined } } : s.seen,
    }))
    setIle('')
    setErr(undefined)
    onDone?.()
  }

  return (
    <span className="assign-form">
      <select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label="Produkt">
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nazwa}
          </option>
        ))}
      </select>
      <input
        className="short"
        value={ile}
        onChange={(e) => setIle(e.target.value)}
        placeholder={wGramach ? 'g / szt.' : `${product?.jednostka ?? ''} / szt.`}
        aria-label="Przelicznik"
        title={wGramach ? 'Ile gramów na jedną sztukę z kasy (np. 18)' : 'Ile jednostek produktu na jedną sztukę z kasy (np. 1 albo 0,2)'}
      />
      <span className="muted">{wGramach ? 'g' : product?.jednostka}</span>
      <label className="check" title="Wartość sprzedaży tej pozycji liczona jako przychód tego produktu">
        <input type="checkbox" checked={przychod} onChange={(e) => setPrzychod(e.target.checked)} /> przychód tutaj
      </label>
      <button type="button" onClick={save}>
        Przypisz
      </button>
      {err && <span className="hint err">{err}</span>}
    </span>
  )
}

export function markUntracked(update: Updater, posKey: string, untracked: boolean) {
  update((s) => {
    const prev = s.seen[posKey]
    const base = prev ?? { posKey, pierwszyMiesiac: '9999-12', ostatniaNazwaOryginalna: posKey.split('|')[1] }
    return { ...s, seen: { ...s.seen, [posKey]: { ...base, niesledzona: untracked ? true : undefined } } }
  })
}

export function copyMappings(update: Updater, fromKey: string, toKey: string) {
  update((s) => ({
    ...s,
    mappings: [...s.mappings, ...s.mappings.filter((m) => m.posKey === fromKey).map((m) => ({ ...m, id: newId(), posKey: toKey }))],
  }))
}
