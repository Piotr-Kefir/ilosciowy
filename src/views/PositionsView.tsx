import { useState } from 'react'
import { AssignForm, copyMappings, markUntracked } from '../components/AssignForm'
import { Badge } from '../components/Val'
import { analyzePositions, effectiveMappings, positionStatus } from '../domain/mapping'
import type { AppState, PosMapping } from '../domain/types'
import { fmtNum, fmtZl, monthLabel } from '../format'
import { normalizeName, splitPosKey } from '../parser/normalize'
import type { Updater } from '../store'

type Filter = 'wszystkie' | 'przypisana' | 'nieśledzona' | 'bez decyzji' | 'ten miesiąc'

/** „Produkty i przypisania”: wszystkie pozycje z kasy kiedykolwiek widziane. */
export function PositionsView({ state, update, miesiac }: { state: AppState; update: Updater; miesiac: string }) {
  const [filter, setFilter] = useState<Filter>('ten miesiąc')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const raport = state.months[miesiac]?.raport
  // Ta sama nazwa może wystąpić w grupie dwa razy (np. „Oat”) — sumujemy ilość i wartość po kluczu.
  const thisMonth = new Map<string, ReturnType<typeof analyzePositions>[number]>()
  for (const i of raport ? analyzePositions(state, raport.pozycje, miesiac) : []) {
    const prev = thisMonth.get(i.pozycja.posKey)
    thisMonth.set(
      i.pozycja.posKey,
      prev ? { ...prev, pozycja: { ...prev.pozycja, ilosc: prev.pozycja.ilosc + i.pozycja.ilosc, wartosc: prev.pozycja.wartosc + i.pozycja.wartosc } } : i,
    )
  }
  const keys = new Set([...Object.keys(state.seen), ...state.mappings.map((m) => m.posKey)])

  const rows = [...keys]
    .map((posKey) => {
      const { grupa, nazwa } = splitPosKey(posKey)
      return { posKey, grupa, nazwa: state.seen[posKey]?.ostatniaNazwaOryginalna ?? nazwa, status: positionStatus(state, posKey) }
    })
    .filter((r) => {
      if (q && !normalizeName(r.nazwa).includes(normalizeName(q))) return false
      if (filter === 'ten miesiąc') return thisMonth.has(r.posKey)
      if (filter !== 'wszystkie') return r.status === filter
      return true
    })
    .sort((a, b) => a.grupa - b.grupa || a.nazwa.localeCompare(b.nazwa, 'pl'))

  const pname = (id: string) => state.products.find((p) => p.id === id)?.nazwa ?? id
  const unit = (id: string) => state.products.find((p) => p.id === id)?.jednostka

  const patchMapping = (id: string, patch: Partial<PosMapping>) =>
    update((s) => ({ ...s, mappings: s.mappings.map((m) => (m.id === id ? { ...m, ...patch } : m)) }))
  const removeMapping = (id: string) => update((s) => ({ ...s, mappings: s.mappings.filter((m) => m.id !== id) }))

  return (
    <div>
      <h2>Pozycje z kasy i przypisania</h2>
      <p className="muted">
        Każda pozycja z raportu to „grupa + nazwa”. Przypisanie mówi, ile jednostek produktu schodzi na 1 sprzedaną sztukę i czy jej
        wartość liczy się jako przychód tego produktu (żeby nie liczyć przychodu podwójnie, np. affogato → lody + kawa).
      </p>
      <div className="filters">
        <input placeholder="Szukaj nazwy…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="ten miesiąc">w raporcie: {monthLabel(miesiac)}</option>
          <option value="wszystkie">wszystkie kiedykolwiek</option>
          <option value="przypisana">przypisane</option>
          <option value="bez decyzji">bez decyzji</option>
          <option value="nieśledzona">nieśledzone</option>
        </select>
        <span className="muted">{rows.length} pozycji</span>
      </div>
      <div className="table-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th>Gr.</th>
              <th>Nazwa w kasie</th>
              <th className="num">{monthLabel(miesiac)}</th>
              <th>Przypisanie</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const t = thisMonth.get(r.posKey)
              const explicit = state.mappings.filter((m) => m.posKey === r.posKey)
              const eff = effectiveMappings(state, r.posKey)
              return (
                <tr key={r.posKey} className={r.status === 'nieśledzona' ? 'dim' : undefined}>
                  <td>{r.grupa}</td>
                  <td>
                    {t?.nowa && <Badge kind="new">NOWE</Badge>} {r.nazwa}
                    {state.seen[r.posKey] && <div className="sub">od {state.seen[r.posKey].pierwszyMiesiac.split('-').reverse().join('.')}</div>}
                  </td>
                  <td className="num">
                    {t ? (
                      <>
                        {fmtNum(t.pozycja.ilosc, 0)} szt.
                        <div className="sub">{fmtZl(t.pozycja.wartosc)}</div>
                      </>
                    ) : (
                      ''
                    )}
                  </td>
                  <td>
                    {r.status === 'nieśledzona' && <span className="muted">nieśledzona</span>}
                    {r.status === 'bez decyzji' && <span className={t?.alarm ? 'text-red' : 'muted'}>bez decyzji</span>}
                    {explicit.map((m) => {
                      const j = unit(m.productId)
                      const g = j === 'kg'
                      return (
                        <div key={m.id} className="mapping">
                          <strong>{pname(m.productId)}</strong>:{' '}
                          {m.receptura ? (
                            <span title="Edytuj w zakładce „Receptury kawy”">{fmtNum(m.przelicznik * 1000, 1, true)} g</span>
                          ) : (
                            <input
                              className="short"
                              defaultValue={fmtNum(g ? m.przelicznik * 1000 : m.przelicznik, 4, true)}
                              aria-label="Przelicznik"
                              onBlur={(e) => {
                                const n = Number(e.target.value.replace(/\s/g, '').replace(',', '.'))
                                if (Number.isFinite(n)) patchMapping(m.id, { przelicznik: g ? n / 1000 : n })
                              }}
                            />
                          )}{' '}
                          {g ? 'g' : j} / szt.
                          <label className="check">
                            <input type="checkbox" checked={m.przychodTutaj} onChange={(e) => patchMapping(m.id, { przychodTutaj: e.target.checked })} />{' '}
                            przychód tutaj
                          </label>
                          {m.etykieta && <span className="muted"> ({m.etykieta})</span>}
                          {m.zalozenie && (
                            <Badge kind="assumption" title={m.zalozenie}>
                              założenie
                            </Badge>
                          )}
                          {m.zalozenie && (
                            <button type="button" className="link" onClick={() => patchMapping(m.id, { zalozenie: undefined })} title="Usuń plakietkę założenia">
                              potwierdzone
                            </button>
                          )}
                          <button type="button" className="link danger" onClick={() => removeMapping(m.id)}>
                            usuń
                          </button>
                        </div>
                      )
                    })}
                    {!explicit.length &&
                      eff.map((m) => (
                        <div key={m.productId} className="mapping">
                          <strong>{pname(m.productId)}</strong>: {fmtNum(m.przelicznik * 1000, 0)} g / szt.{' '}
                          <span className="muted">(reguła: {m.zrodlo.typ === 'reguła' ? m.zrodlo.rule.nazwa : ''})</span>
                        </div>
                      ))}
                    {t?.podpowiedz && (
                      <button type="button" onClick={() => copyMappings(update, t.podpowiedz!.posKey, r.posKey)}>
                        Przypisz jak w grupie {t.podpowiedz.posKey.split('|')[0]}
                      </button>
                    )}
                    {open === r.posKey && <AssignForm state={state} update={update} posKey={r.posKey} onDone={() => setOpen(null)} />}
                  </td>
                  <td className="actions-cell">
                    {open !== r.posKey && (
                      <button type="button" onClick={() => setOpen(r.posKey)}>
                        {explicit.length ? '+ produkt' : 'Śledź / przypisz'}
                      </button>
                    )}
                    {r.status === 'nieśledzona' ? (
                      <button type="button" onClick={() => markUntracked(update, r.posKey, false)}>
                        Cofnij „nieśledzone”
                      </button>
                    ) : (
                      !explicit.length && (
                        <button type="button" onClick={() => markUntracked(update, r.posKey, true)}>
                          Nieśledzone
                        </button>
                      )
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
