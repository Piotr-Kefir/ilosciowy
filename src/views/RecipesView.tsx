import { Badge } from '../components/Val'
import { przelicznikZReceptury } from '../domain/defaults'
import type { AppState, KategoriaKawy, PosMapping, Receptura } from '../domain/types'
import { fmtNum } from '../format'
import type { Updater } from '../store'

const KATEGORIE: KategoriaKawy[] = ['ekspres', 'przelew', 'cold brew', 'alternatywa', 'inne', 'bez ziarna']

function parse(s: string): number | null {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** „Receptury kawy”: ile ziarna schodzi na każdą pozycję z kasy. */
export function RecipesView({ state, update }: { state: AppState; update: Updater }) {
  const kawa = state.products.find((p) => p.wypal)
  if (!kawa) return <p>Brak produktu z wypałem (kawa) w katalogu.</p>
  const rows = state.mappings
    .filter((m) => m.productId === kawa.id)
    .sort((a, b) => KATEGORIE.indexOf(a.kategoriaKawy ?? 'inne') - KATEGORIE.indexOf(b.kategoriaKawy ?? 'inne') || a.posKey.localeCompare(b.posKey))

  const patch = (id: string, p: Partial<PosMapping>) =>
    update((s) => ({
      ...s,
      mappings: s.mappings.map((m) => {
        if (m.id !== id) return m
        const n = { ...m, ...p }
        return n.receptura ? { ...n, przelicznik: przelicznikZReceptury(n.receptura) } : n
      }),
    }))
  const setRec = (m: PosMapping, r: Receptura) => patch(m.id, { receptura: r })
  const nazwa = (posKey: string) => state.seen[posKey]?.ostatniaNazwaOryginalna ?? posKey.split('|')[1]

  return (
    <div>
      <h2>Receptury kawy</h2>
      <p className="muted">
        Ziarno na jedną sprzedaną sztukę. Napoje z ekspresu — gramy; przelewy i cold brew — ml napoju × g ziarna na litr. Nowe pozycje
        przypisuje się w zakładce „Pozycje z kasy”.
      </p>
      <div className="table-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th>Pozycja z kasy</th>
              <th>Kategoria</th>
              <th>Receptura</th>
              <th className="num">Ziarno / szt.</th>
              <th>Przychód do kawy</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const r = m.receptura ?? { typ: 'g' as const, g: m.przelicznik * 1000 }
              return (
                <tr key={m.id}>
                  <td>
                    {nazwa(m.posKey)} <span className="muted">(gr. {m.posKey.split('|')[0]})</span>
                    {m.zalozenie && (
                      <div>
                        <Badge kind="assumption" title={m.zalozenie}>
                          założenie
                        </Badge>{' '}
                        <span className="small muted">{m.zalozenie}</span>{' '}
                        <button type="button" className="link" onClick={() => patch(m.id, { zalozenie: undefined })}>
                          potwierdzone
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    <select value={m.kategoriaKawy ?? 'inne'} onChange={(e) => patch(m.id, { kategoriaKawy: e.target.value as KategoriaKawy })}>
                      {KATEGORIE.map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={r.typ}
                      onChange={(e) =>
                        setRec(m, e.target.value === 'g' ? { typ: 'g', g: 18 } : { typ: 'ml', ml: 220, gNaLitr: 60 })
                      }
                    >
                      <option value="g">gramy</option>
                      <option value="ml">ml × g/l</option>
                    </select>{' '}
                    {r.typ === 'g' ? (
                      <>
                        <input
                          className="short"
                          key={`${m.id}-g-${r.g}`}
                          defaultValue={fmtNum(r.g, 2, true)}
                          onBlur={(e) => {
                            const n = parse(e.target.value)
                            if (n !== null) setRec(m, { typ: 'g', g: n })
                          }}
                        />{' '}
                        g
                      </>
                    ) : (
                      <>
                        <input
                          className="short"
                          key={`${m.id}-ml-${r.ml}`}
                          defaultValue={fmtNum(r.ml, 0)}
                          onBlur={(e) => {
                            const n = parse(e.target.value)
                            if (n !== null) setRec(m, { ...r, ml: n })
                          }}
                        />{' '}
                        ml ×{' '}
                        <input
                          className="short"
                          key={`${m.id}-gl-${r.gNaLitr}`}
                          defaultValue={fmtNum(r.gNaLitr, 1, true)}
                          onBlur={(e) => {
                            const n = parse(e.target.value)
                            if (n !== null) setRec(m, { ...r, gNaLitr: n })
                          }}
                        />{' '}
                        g/l
                      </>
                    )}
                  </td>
                  <td className="num">{fmtNum(m.przelicznik * 1000, 1, true)} g</td>
                  <td>
                    <input type="checkbox" checked={m.przychodTutaj} onChange={(e) => patch(m.id, { przychodTutaj: e.target.checked })} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <h3>Torebki</h3>
      {state.rules
        .filter((r) => r.productId === kawa.id)
        .map((r) => (
          <p key={r.id}>
            {r.nazwa}: każda pozycja z grupy{' '}
            <input
              className="short"
              defaultValue={r.grupa}
              onBlur={(e) => {
                const n = parse(e.target.value)
                if (n !== null) update((s) => ({ ...s, rules: s.rules.map((x) => (x.id === r.id ? { ...x, grupa: n } : x)) }))
              }}
            />{' '}
            („Kawy w ziarnach”) z gramaturą na końcu nazwy (np. „Burundi 250g”) liczy się jako tyle gramów ziarna. Pozycję można
            wyłączyć, oznaczając ją jako nieśledzoną.
          </p>
        ))}

      <h3>Wypał</h3>
      <p>
        Domyślny ubytek na wypale (faktury na zielone ziarno):{' '}
        <input
          className="short"
          defaultValue={fmtNum(state.settings.ubytekWypalu, 1, true)}
          onBlur={(e) => {
            const n = parse(e.target.value)
            if (n !== null) update((s) => ({ ...s, settings: { ...s.settings, ubytekWypalu: n } }))
          }}
        />{' '}
        %
      </p>
    </div>
  )
}
