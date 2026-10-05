import { newId } from '../domain/actions'
import type { AppState, Jednostka, Product } from '../domain/types'
import { fmtNum } from '../format'
import type { Updater } from '../store'

function parse(s: string): number | null {
  const n = Number(s.replace(/\s/g, '').replace(',', '.'))
  return s.trim() && Number.isFinite(n) ? n : null
}

/** Katalog śledzonych produktów i ustawienia progów. */
export function ProductsView({ state, update }: { state: AppState; update: Updater }) {
  const patch = (id: string, p: Partial<Product>) =>
    update((s) => ({ ...s, products: s.products.map((x) => (x.id === id ? { ...x, ...p } : x)) }))
  const products = [...state.products].sort((a, b) => a.kolejnosc - b.kolejnosc)

  return (
    <div>
      <h2>Śledzone produkty</h2>
      <p className="muted">
        Każdy produkt ma jedną jednostkę — w niej wpisuje się faktury, straty, pracowników i inwentaryzację. Produkty z tą samą „grupą
        w tabeli” dostają wiersz sumy (np. Drożdżówki razem).
      </p>
      <div className="table-scroll">
        <table className="grid">
          <thead>
            <tr>
              <th>Aktywny</th>
              <th>Nazwa</th>
              <th>Jednostka</th>
              <th>Grupa w tabeli</th>
              <th>Jednostka pomocnicza</th>
              <th>Kolejność</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <input type="checkbox" checked={p.aktywny} onChange={(e) => patch(p.id, { aktywny: e.target.checked })} />
                </td>
                <td>
                  <input defaultValue={p.nazwa} onBlur={(e) => e.target.value.trim() && patch(p.id, { nazwa: e.target.value.trim() })} />
                  {p.wypal && <div className="sub">bilans z wypałem</div>}
                </td>
                <td>
                  <select value={p.jednostka} onChange={(e) => patch(p.id, { jednostka: e.target.value as Jednostka })}>
                    <option value="kg">kg</option>
                    <option value="szt">szt</option>
                    <option value="butelka">butelka</option>
                  </select>
                </td>
                <td>
                  <input
                    className="mid"
                    defaultValue={p.grupaWidoku ?? ''}
                    placeholder="—"
                    onBlur={(e) => patch(p.id, { grupaWidoku: e.target.value.trim() || undefined })}
                  />
                </td>
                <td>
                  <input
                    className="mid"
                    defaultValue={p.jednostkaPomocnicza?.nazwa ?? ''}
                    placeholder="np. porcja"
                    onBlur={(e) => {
                      const nazwa = e.target.value.trim()
                      patch(p.id, { jednostkaPomocnicza: nazwa ? { nazwa, ile: p.jednostkaPomocnicza?.ile ?? 1 } : undefined })
                    }}
                  />{' '}
                  {p.jednostkaPomocnicza && (
                    <>
                      ={' '}
                      <input
                        className="short"
                        defaultValue={fmtNum(p.jednostkaPomocnicza.ile, 4, true)}
                        onBlur={(e) => {
                          const n = parse(e.target.value)
                          if (n !== null && p.jednostkaPomocnicza) patch(p.id, { jednostkaPomocnicza: { ...p.jednostkaPomocnicza, ile: n } })
                        }}
                      />{' '}
                      {p.jednostka}
                    </>
                  )}
                </td>
                <td>
                  <input
                    className="short"
                    defaultValue={p.kolejnosc}
                    onBlur={(e) => {
                      const n = parse(e.target.value)
                      if (n !== null) patch(p.id, { kolejnosc: n })
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => {
          const nazwa = window.prompt('Nazwa nowego produktu')?.trim()
          if (!nazwa) return
          update((s) => ({
            ...s,
            products: [
              ...s.products,
              { id: newId(), nazwa, jednostka: 'szt', aktywny: true, kolejnosc: Math.max(0, ...s.products.map((x) => x.kolejnosc)) + 1 },
            ],
          }))
        }}
      >
        + produkt
      </button>
      <p className="muted small">Po dodaniu produktu przypisz do niego pozycje z kasy w zakładce „Pozycje z kasy”.</p>

      <h2>Progi alarmu różnicy</h2>
      <p>
        Żółty powyżej{' '}
        <input
          className="short"
          defaultValue={fmtNum(state.settings.progZolty, 1, true)}
          onBlur={(e) => {
            const n = parse(e.target.value)
            if (n !== null) update((s) => ({ ...s, settings: { ...s.settings, progZolty: n } }))
          }}
        />{' '}
        %, czerwony powyżej{' '}
        <input
          className="short"
          defaultValue={fmtNum(state.settings.progCzerwony, 1, true)}
          onBlur={(e) => {
            const n = parse(e.target.value)
            if (n !== null) update((s) => ({ ...s, settings: { ...s.settings, progCzerwony: n } }))
          }}
        />{' '}
        % (różnica w stosunku do sprzedaży + pracowników).
      </p>
      <p>
        Grupy z kasy, w których nowa nieprzypisana pozycja daje czerwony baner:{' '}
        <input
          className="mid"
          defaultValue={state.settings.grupyAlarmowe.join(', ')}
          onBlur={(e) => {
            const g = e.target.value
              .split(/[,\s]+/)
              .map(Number)
              .filter((n) => Number.isInteger(n))
            update((s) => ({ ...s, settings: { ...s.settings, grupyAlarmowe: g } }))
          }}
        />{' '}
        <span className="muted">(oraz wszystko z „matcha” w nazwie)</span>
      </p>
    </div>
  )
}
