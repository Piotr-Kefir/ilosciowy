import { useState } from 'react'
import { NumInput } from '../components/NumInput'
import { deleteInvoice, newId, setEntryField, upsertInvoice } from '../domain/actions'
import { invoicesInMonth, lineQty } from '../domain/calc'
import type { AppState, Invoice, InvoiceLine } from '../domain/types'
import { fmtDate, fmtQty, fmtZl, monthLabel, unitLabel } from '../format'
import type { Updater } from '../store'

interface Props {
  state: AppState
  update: Updater
  miesiac: string
  /** Gdy otwarte z kolumny „Zakupy” — filtr na produkt i domyślny produkt nowej linii. */
  productId?: string
  onClose?: () => void
}

export function InvoicesPanel({ state, update, miesiac, productId, onClose }: Props) {
  const [editing, setEditing] = useState<Invoice | null>(null)
  const all = invoicesInMonth(state, miesiac).sort((a, b) => a.data.localeCompare(b.data))
  const list = productId ? all.filter((i) => i.linie.some((l) => l.productId === productId)) : all
  const product = state.products.find((p) => p.id === productId)
  const entry = productId ? state.months[miesiac]?.wpisy[productId] : undefined
  const pname = (id: string) => state.products.find((p) => p.id === id)?.nazwa ?? id

  function startNew() {
    const day = `${miesiac}-01`
    setEditing({
      id: newId(),
      numer: '',
      bezFaktury: false,
      data: day,
      miesiacRozliczenia: miesiac,
      linie: [{ id: newId(), productId: productId ?? state.products[0].id, ilosc: { expr: '', value: 0 }, kwotaBrutto: { expr: '', value: 0 } }],
    })
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>
          Faktury — {monthLabel(miesiac)}
          {product ? ` — ${product.nazwa}` : ''}
        </h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Zamknij">
            ✕
          </button>
        )}
      </div>
      {product && !product.wypal && (
        <label className="check">
          <input
            type="checkbox"
            checked={!!entry?.brakDostaw}
            onChange={(e) => update((s) => setEntryField(s, miesiac, product.id, 'brakDostaw', e.target.checked || undefined))}
          />{' '}
          W tym miesiącu nie było dostaw {product.nazwa.toLowerCase()} (zakupy = 0)
        </label>
      )}
      {product?.wypal && (
        <p className="muted">
          Ziarno z własnego wypału wpisuje się nad tabelą („kg z wypału”). Tu dodaj tylko dokupione ziarno — palone albo zielone (z
          ubytkiem na wypale).
        </p>
      )}
      {list.length === 0 && <p className="muted">Brak faktur{product ? ' na ten produkt' : ''} w tym miesiącu.</p>}
      {list.length > 0 && (
        <div className="table-scroll">
          <table className="grid">
            <thead>
              <tr>
                <th>Numer</th>
                <th>Data</th>
                <th>Dostawca</th>
                <th>Produkt</th>
                <th className="num">Ilość</th>
                <th className="num">Kwota brutto</th>
                <th className="num">Kaucja</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.flatMap((inv) =>
                inv.linie
                  .filter((l) => !productId || l.productId === productId)
                  .map((l, i) => {
                    const p = state.products.find((x) => x.id === l.productId)
                    return (
                      <tr key={l.id}>
                        <td>{i === 0 ? (inv.bezFaktury ? <em>bez faktury{inv.numer ? `: ${inv.numer}` : ''}</em> : inv.numer) : ''}</td>
                        <td>{i === 0 ? fmtDate(inv.data) : ''}</td>
                        <td>{i === 0 ? inv.dostawca : ''}</td>
                        <td>
                          {pname(l.productId)}
                          {l.zieloneZiarno && <span className="muted"> (zielone, −{l.ubytekWypalu ?? state.settings.ubytekWypalu}%)</span>}
                        </td>
                        <td className="num">
                          {p ? `${fmtQty(lineQty(state, l), p.jednostka)} ${unitLabel(p.jednostka)}` : l.ilosc.value}
                        </td>
                        <td className="num">{fmtZl(l.kwotaBrutto.value)}</td>
                        <td className="num">{l.kaucja ? fmtZl(l.kaucja.value) : ''}</td>
                        <td>
                          {i === 0 && (
                            <button type="button" onClick={() => setEditing(structuredClone(inv))}>
                              Edytuj
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  }),
              )}
            </tbody>
          </table>
        </div>
      )}
      {!editing && (
        <button type="button" className="primary" onClick={startNew}>
          + faktura
        </button>
      )}
      {editing && (
        <InvoiceForm
          state={state}
          inv={editing}
          onCancel={() => setEditing(null)}
          onSave={(inv) => {
            update((s) => upsertInvoice(s, inv))
            setEditing(null)
          }}
          onDelete={
            state.invoices.some((i) => i.id === editing.id)
              ? () => {
                  if (window.confirm('Usunąć tę fakturę?')) {
                    update((s) => deleteInvoice(s, editing.id))
                    setEditing(null)
                  }
                }
              : undefined
          }
        />
      )}
    </div>
  )
}

function InvoiceForm({
  state,
  inv: initial,
  onSave,
  onCancel,
  onDelete,
}: {
  state: AppState
  inv: Invoice
  onSave: (i: Invoice) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [inv, setInv] = useState(initial)
  const [monthTouched, setMonthTouched] = useState(initial.miesiacRozliczenia !== initial.data.slice(0, 7))
  const [err, setErr] = useState<string>()
  const setLine = (id: string, patch: Partial<InvoiceLine>) =>
    setInv((v) => ({ ...v, linie: v.linie.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))

  function save() {
    if (!inv.bezFaktury && !inv.numer.trim()) return setErr('Wpisz numer faktury albo zaznacz „dostawa bez faktury”.')
    if (!inv.data) return setErr('Wybierz datę.')
    const linie = inv.linie.filter((l) => l.ilosc.expr.trim())
    if (!linie.length) return setErr('Dodaj co najmniej jedną linię z ilością.')
    onSave({ ...inv, linie })
  }

  return (
    <form
      className="invoice-form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="form-row">
        <label className="check">
          <input type="checkbox" checked={inv.bezFaktury} onChange={(e) => setInv({ ...inv, bezFaktury: e.target.checked })} /> dostawa
          bez faktury
        </label>
      </div>
      <div className="form-row">
        <label>
          {inv.bezFaktury ? 'Opis (opcjonalnie)' : 'Numer faktury'}
          <input value={inv.numer} onChange={(e) => setInv({ ...inv, numer: e.target.value })} />
        </label>
        <label>
          Data
          <input
            type="date"
            value={inv.data}
            onChange={(e) => {
              const data = e.target.value
              setInv({ ...inv, data, miesiacRozliczenia: monthTouched || !data ? inv.miesiacRozliczenia : data.slice(0, 7) })
            }}
          />
        </label>
        <label>
          Rozliczyć w miesiącu
          <input
            type="month"
            value={inv.miesiacRozliczenia}
            onChange={(e) => {
              setMonthTouched(true)
              setInv({ ...inv, miesiacRozliczenia: e.target.value })
            }}
          />
        </label>
        <label>
          Dostawca (opcjonalnie)
          <input value={inv.dostawca ?? ''} onChange={(e) => setInv({ ...inv, dostawca: e.target.value || undefined })} />
        </label>
      </div>
      <datalist id="produkty-lista">
        {state.products.map((p) => (
          <option key={p.id} value={p.nazwa} />
        ))}
      </datalist>
      {inv.linie.map((l) => {
        const p = state.products.find((x) => x.id === l.productId)
        return (
          <div className="form-row line" key={l.id}>
            <label>
              Produkt
              <ProductPicker state={state} value={l.productId} onChange={(productId) => setLine(l.id, { productId })} />
            </label>
            <label>
              Ilość {p && `(${l.zieloneZiarno ? 'kg zielonego' : p.jednostka})`}
              <NumInput value={l.ilosc.expr ? l.ilosc : undefined} onChange={(v) => setLine(l.id, { ilosc: v ?? { expr: '', value: 0 } })} decimals={3} />
            </label>
            <label>
              Kwota brutto zł
              <NumInput
                value={l.kwotaBrutto.expr ? l.kwotaBrutto : undefined}
                onChange={(v) => setLine(l.id, { kwotaBrutto: v ?? { expr: '', value: 0 } })}
              />
            </label>
            <label title="Kaucja za butelki/skrzynki — odejmowana od kosztu. Ujemna = zwrot kaucji.">
              Kaucja zł
              <NumInput value={l.kaucja} onChange={(v) => setLine(l.id, { kaucja: v })} placeholder="0" />
            </label>
            {p?.wypal && (
              <>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!!l.zieloneZiarno}
                    onChange={(e) => setLine(l.id, { zieloneZiarno: e.target.checked || undefined })}
                  />{' '}
                  zielone ziarno
                </label>
                {l.zieloneZiarno && (
                  <label>
                    Ubytek na wypale %
                    <input
                      className="short"
                      value={String(l.ubytekWypalu ?? state.settings.ubytekWypalu).replace('.', ',')}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(',', '.'))
                        if (Number.isFinite(n)) setLine(l.id, { ubytekWypalu: n })
                      }}
                    />
                  </label>
                )}
              </>
            )}
            {inv.linie.length > 1 && (
              <button type="button" onClick={() => setInv({ ...inv, linie: inv.linie.filter((x) => x.id !== l.id) })}>
                Usuń linię
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        onClick={() =>
          setInv({
            ...inv,
            linie: [...inv.linie, { id: newId(), productId: state.products[0].id, ilosc: { expr: '', value: 0 }, kwotaBrutto: { expr: '', value: 0 } }],
          })
        }
      >
        + linia (inny produkt)
      </button>
      {err && <p className="text-red">{err}</p>}
      <div className="actions">
        {onDelete && (
          <button type="button" className="danger" onClick={onDelete}>
            Usuń fakturę
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Anuluj
        </button>
        <button type="submit" className="primary">
          Zapisz
        </button>
      </div>
    </form>
  )
}

/** Wybór produktu z autouzupełnianiem (wpisz kilka liter nazwy). */
function ProductPicker({ state, value, onChange }: { state: AppState; value: string; onChange: (id: string) => void }) {
  const current = state.products.find((p) => p.id === value)
  const [text, setText] = useState(current?.nazwa ?? '')
  return (
    <input
      list="produkty-lista"
      value={text}
      onChange={(e) => {
        setText(e.target.value)
        const p = state.products.find((x) => x.nazwa.toLowerCase() === e.target.value.toLowerCase())
        if (p) onChange(p.id)
      }}
      onBlur={() => setText(state.products.find((p) => p.id === value)?.nazwa ?? '')}
    />
  )
}
