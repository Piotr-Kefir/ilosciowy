import { useState } from 'react'
import { AssignForm, copyMappings, markUntracked } from '../components/AssignForm'
import { NumInput } from '../components/NumInput'
import { Badge, ValView } from '../components/Val'
import { loadStany3107, setEntryField, setMonthClosed, setMonthField } from '../domain/actions'
import { computeMonth, type CoffeeDetails, type GroupCalc, type ProductCalc, type Val } from '../domain/calc'
import { analyzePositions } from '../domain/mapping'
import type { AppState, Jednostka, Product, ProductEntry } from '../domain/types'
import { fmtDateTime, fmtNum, fmtPct, fmtQty, fmtSigned, fmtZl, monthLabel, unitLabel } from '../format'
import type { Updater } from '../store'
import { ImportBox } from './ImportDialog'
import { InvoicesPanel } from './InvoicesPanel'

interface Props {
  state: AppState
  update: Updater
  miesiac: string
  setMiesiac: (m: string) => void
  goToPositions: () => void
}

export function MonthView({ state, update, miesiac, setMiesiac, goToPositions }: Props) {
  const [invoiceFor, setInvoiceFor] = useState<string | null>(null)
  const month = state.months[miesiac]
  const calc = computeMonth(state, miesiac)
  const kawa = state.products.find((p) => p.wypal && p.aktywny)

  const info = month?.raport ? analyzePositions(state, month.raport.pozycje, miesiac) : []
  const alarmy = info.filter((i) => i.alarm)
  const noStarts = calc.produkty.every((c) => c.startZrodlo === 'brak')

  const setEntry = <K extends keyof ProductEntry>(productId: string, field: K, v: ProductEntry[K] | undefined) =>
    update((s) => setEntryField(s, miesiac, productId, field, v))

  return (
    <div className="month-view">
      <ImportBox state={state} update={update} onImported={setMiesiac} />

      {month?.raport ? (
        <p className="report-info">
          Raport z kasy: <strong>{month.raport.zakresTekst}</strong> · Ogółem <strong>{fmtZl(month.raport.ogolem)}</strong> · wczytany{' '}
          {fmtDateTime(month.importedAt)}
          {Math.abs(month.raport.ogolem - month.raport.razemWgGrup) > 0.01 && (
            <span className="muted">
              {' '}
              · „Razem wg grup” {fmtZl(month.raport.razemWgGrup)} (różnica w kasie{' '}
              {fmtSigned(fmtZl(month.raport.ogolem - month.raport.razemWgGrup), month.raport.ogolem - month.raport.razemWgGrup)})
            </span>
          )}
        </p>
      ) : (
        <p className="alert alert-grey">Brak raportu z kasy za {monthLabel(miesiac)}. Tabela pokaże tylko wpisy ręczne.</p>
      )}

      {alarmy.length > 0 && (
        <div className="alert alert-red">
          <strong>Nowe pozycje bez przypisania: przypisz albo oznacz jako nieśledzone.</strong>
          <p className="small">Inaczej np. nowy napój kawowy po cichu zaniży zużycie ziarna.</p>
          <ul className="alarm-list">
            {alarmy.map((i) => (
              <li key={i.pozycja.posKey}>
                <div>
                  {i.nowa && <Badge kind="new">NOWE</Badge>} <strong>{i.pozycja.nazwa}</strong>{' '}
                  <span className="muted">
                    (grupa {i.pozycja.grupa}, {fmtNum(i.pozycja.ilosc, 0)} szt., {fmtZl(i.pozycja.wartosc)})
                  </span>
                </div>
                <div className="alarm-actions">
                  {i.podpowiedz && (
                    <button type="button" onClick={() => copyMappings(update, i.podpowiedz!.posKey, i.pozycja.posKey)}>
                      Przypisz jak w grupie {i.podpowiedz.posKey.split('|')[0]}
                    </button>
                  )}
                  <AssignForm state={state} update={update} posKey={i.pozycja.posKey} />
                  <button type="button" onClick={() => markUntracked(update, i.pozycja.posKey, true)}>
                    Nieśledzone
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="link" onClick={goToPositions}>
            Wszystkie pozycje z kasy →
          </button>
        </div>
      )}

      <div className="month-toolbar">
        {kawa && (
          <>
            <label>
              Kawa: kg z wypału
              <NumInput
                value={month?.kgZWypalu}
                onChange={(v) => update((s) => setMonthField(s, miesiac, 'kgZWypalu', v))}
                decimals={3}
                placeholder="brak"
              />
            </label>
            <label>
              Koszt wypału zł <span className="muted">(opcjonalnie)</span>
              <NumInput
                value={month?.kosztWypalu}
                onChange={(v) => update((s) => setMonthField(s, miesiac, 'kosztWypalu', v))}
                placeholder="brak"
              />
            </label>
          </>
        )}
        {miesiac === '2026-08' && noStarts && (
          <button type="button" onClick={() => update((s) => loadStany3107(s, miesiac))}>
            Wczytaj stany z 31.07
          </button>
        )}
        <span className="spacer" />
        <button type="button" onClick={() => setInvoiceFor('')}>
          Faktury miesiąca
        </button>
        <button
          type="button"
          onClick={async () => {
            const { exportMonthXlsx } = await import('../export')
            exportMonthXlsx(state, miesiac)
          }}
        >
          Eksport .xlsx
        </button>
        {month?.zamknietyAt ? (
          <button type="button" onClick={() => update((s) => setMonthClosed(s, miesiac, false))} title={`Zamknięty ${fmtDateTime(month.zamknietyAt)}`}>
            ✓ Zamknięty — otwórz ponownie
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={() => update((s) => setMonthClosed(s, miesiac, true))}
            title="Oznacza miesiąc jako rozliczony (dalej można go poprawiać)"
          >
            Zamknij miesiąc
          </button>
        )}
      </div>

      {invoiceFor !== null && (
        <InvoicesPanel
          state={state}
          update={update}
          miesiac={miesiac}
          productId={invoiceFor || undefined}
          onClose={() => setInvoiceFor(null)}
        />
      )}

      <MonthTable state={state} miesiac={miesiac} calc={calc.produkty} grupy={calc.grupy} setEntry={setEntry} openInvoices={setInvoiceFor} />
      <p className="totals">
        Razem śledzone produkty: wydane <strong>{fmtZl(calc.sumy.wydane)}</strong> · wpłynęło{' '}
        <strong>
          <ValView v={calc.sumy.wplynelo} fmt={fmtZl} />
        </strong>
      </p>

      {calc.kawa && kawa && (
        <CoffeeSection
          details={calc.kawa}
          c={calc.produkty.find((p) => p.product.id === kawa.id)!}
          month={month}
        />
      )}
    </div>
  )
}

const q = (j: Jednostka) => (n: number) => fmtQty(n, j)

function MonthTable({
  state,
  miesiac,
  calc,
  grupy,
  setEntry,
  openInvoices,
}: {
  state: AppState
  miesiac: string
  calc: ProductCalc[]
  grupy: GroupCalc[]
  setEntry: <K extends keyof ProductEntry>(productId: string, field: K, v: ProductEntry[K] | undefined) => void
  openInvoices: (productId: string) => void
}) {
  const rows: ({ kind: 'p'; c: ProductCalc } | { kind: 'g'; g: GroupCalc })[] = []
  for (const c of calc) {
    rows.push({ kind: 'p', c })
    const g = c.product.grupaWidoku
    const last = calc.filter((x) => x.product.grupaWidoku === g).at(-1)
    if (g && last === c) rows.push({ kind: 'g', g: grupy.find((x) => x.nazwa === g)! })
  }
  return (
    <div className="table-scroll">
      <table className="grid month-table">
        <thead>
          <tr>
            <th className="sticky">Produkt</th>
            <th>Start</th>
            <th>Zakupy</th>
            <th>Sprzedaż kasa</th>
            <th>Pracownicy</th>
            <th>Straty</th>
            <th>Stan końcowy</th>
            <th>Różnica</th>
            <th>Wydane</th>
            <th>Wpłynęło</th>
            <th>Marża</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            r.kind === 'p' ? (
              <ProductRow key={r.c.product.id} state={state} miesiac={miesiac} c={r.c} setEntry={setEntry} openInvoices={openInvoices} />
            ) : (
              <GroupRow key={'g-' + r.g.nazwa} g={r.g} />
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}

function ProductRow({
  state,
  miesiac,
  c,
  setEntry,
  openInvoices,
}: {
  state: AppState
  miesiac: string
  c: ProductCalc
  setEntry: <K extends keyof ProductEntry>(productId: string, field: K, v: ProductEntry[K] | undefined) => void
  openInvoices: (productId: string) => void
}) {
  const p: Product = c.product
  const j = p.jednostka
  const e: ProductEntry = state.months[miesiac]?.wpisy[p.id] ?? {}
  const dec = j === 'kg' ? 3 : 2
  const etykiety = [...new Set(c.linie.map((l) => l.etykieta).filter(Boolean))]
  const zalozenia = [...new Set(c.linie.filter((l) => l.zalozenie).map((l) => `${l.nazwa}: ${l.zalozenie}`))]

  return (
    <tr>
      <th className="sticky product-name" scope="row">
        {p.nazwa} <span className="muted">[{unitLabel(j)}]</span>
        {zalozenia.length > 0 && (
          <div>
            <Badge kind="assumption" title={`Do potwierdzenia w zakładce „Receptury kawy”:\n${zalozenia.join('\n')}`}>
              założenie
            </Badge>
          </div>
        )}
      </th>
      <td>
        <NumInput
          value={e.start}
          onChange={(v) => setEntry(p.id, 'start', v)}
          decimals={dec}
          placeholder={c.start.ok ? fmtQty(c.start.v, j) : 'brak'}
          ariaLabel={`${p.nazwa}: stan początkowy`}
        />
        {!e.start && c.startZrodlo === 'poprzedni miesiąc' && <span className="hint">z poprzedniego miesiąca</span>}
        {c.startZrodlo === 'brak' && <span className="hint warn">brak stanu początkowego</span>}
      </td>
      <td>
        <button type="button" className="cell-button" onClick={() => openInvoices(p.id)}>
          <ValView v={c.zakupy} fmt={q(j)} />
        </button>
      </td>
      <td className="num">
        <ValView v={c.sprzedaz} fmt={q(j)} />
        <div className="sub">
          <ValView v={c.sprzedazZl} fmt={fmtZl} waitLabel="brak" />
        </div>
        {etykiety.length > 1 && (
          <div className="sub">
            {etykiety
              .map((et) => `${et} ${fmtQty(c.linie.filter((l) => l.etykieta === et).reduce((s, l) => s + l.ilJedn, 0), j)}`)
              .join(' · ')}
          </div>
        )}
      </td>
      <td>
        <NumInput
          value={e.pracownicyIlosc}
          onChange={(v) => setEntry(p.id, 'pracownicyIlosc', v)}
          decimals={dec}
          placeholder="0"
          pomocnicza={p.jednostkaPomocnicza}
          jednostka={unitLabel(j)}
          ariaLabel={`${p.nazwa}: pracownicy ilość`}
        />
        <NumInput
          value={e.pracownicyKwota}
          onChange={(v) => setEntry(p.id, 'pracownicyKwota', v)}
          placeholder="0 zł"
          ariaLabel={`${p.nazwa}: pracownicy kwota zł`}
          className="zl"
        />
      </td>
      <td>
        <NumInput
          value={e.straty}
          onChange={(v) => setEntry(p.id, 'straty', v)}
          decimals={dec}
          placeholder="0"
          pomocnicza={p.jednostkaPomocnicza}
          jednostka={unitLabel(j)}
          ariaLabel={`${p.nazwa}: straty`}
        />
      </td>
      <td>
        <NumInput
          value={e.koniec}
          onChange={(v) => setEntry(p.id, 'koniec', v)}
          decimals={dec}
          placeholder="brak"
          ariaLabel={`${p.nazwa}: stan końcowy`}
        />
      </td>
      <DiffCell roznica={c.roznica} pct={c.roznicaPct} zl={c.roznicaZl} alarm={c.alarm} j={j} oczekiwany={c.oczekiwany} />
      <td className="num">
        <ValView v={c.wydane} fmt={fmtZl} />
      </td>
      <td className="num">
        <ValView v={c.wplynelo} fmt={fmtZl} />
      </td>
      <td className="num">
        <ValView v={c.marza} fmt={fmtZl} compact />
        {c.marzaPct.ok && <div className="sub">{fmtPct(c.marzaPct.v)}</div>}
        {!c.cena.ok && c.zuzycie.ok && <div className="sub">brak ceny</div>}
      </td>
    </tr>
  )
}

function DiffCell({
  roznica,
  pct,
  zl,
  alarm,
  j,
  oczekiwany,
}: {
  roznica: Val
  pct: Val
  zl: Val
  alarm: ProductCalc['alarm']
  j: Jednostka
  oczekiwany?: Val
}) {
  return (
    <td className={`num diff diff-${alarm}`} title={oczekiwany?.ok ? `Oczekiwany stan końcowy: ${fmtQty(oczekiwany.v, j)}` : undefined}>
      {roznica.ok ? (
        <>
          <strong>
            {fmtSigned(fmtQty(roznica.v, j), roznica.v)} {unitLabel(j)}
          </strong>
          {pct.ok && <div className="sub">{fmtSigned(fmtPct(pct.v), pct.v)}</div>}
          <div className="sub">
            <ValView v={zl} fmt={(n) => fmtSigned(fmtZl(n), n)} waitLabel="zł: brak" />
          </div>
        </>
      ) : (
        <ValView v={roznica} fmt={() => null} />
      )}
    </td>
  )
}

function GroupRow({ g }: { g: GroupCalc }) {
  const j: Jednostka = 'szt'
  return (
    <tr className="group-row">
      <th className="sticky" scope="row">
        {g.nazwa} razem
      </th>
      <td className="num">
        <ValView v={g.start} fmt={q(j)} waitLabel="brak" />
      </td>
      <td className="num">
        <ValView v={g.zakupy} fmt={q(j)} waitLabel="brak" />
      </td>
      <td className="num">
        <ValView v={g.sprzedaz} fmt={q(j)} />
        <div className="sub">
          <ValView v={g.sprzedazZl} fmt={fmtZl} waitLabel="brak" />
        </div>
      </td>
      <td className="num">
        {fmtQty(g.pracIlosc, j)}
        <div className="sub">{fmtZl(g.pracKwota)}</div>
      </td>
      <td className="num">{fmtQty(g.straty, j)}</td>
      <td className="num">
        <ValView v={g.koniec} fmt={q(j)} waitLabel="brak" />
      </td>
      <DiffCell roznica={g.roznica} pct={g.roznicaPct} zl={g.roznicaZl} alarm={g.alarm} j={j} />
      <td className="num">
        <ValView v={g.wydane} fmt={fmtZl} />
      </td>
      <td className="num">
        <ValView v={g.wplynelo} fmt={fmtZl} />
      </td>
      <td className="num">
        <ValView v={g.marza} fmt={fmtZl} compact />
      </td>
    </tr>
  )
}

function CoffeeSection({ details: k, c, month }: { details: CoffeeDetails; c: ProductCalc; month?: AppState['months'][string] }) {
  const kg = (n: number) => `${fmtNum(n, 3)} kg`
  const row = (label: string, szt: number | null, v: number, note?: string) => (
    <tr key={label}>
      <td>
        {label}
        {note && <span className="muted"> — {note}</span>}
      </td>
      <td className="num">{szt === null ? '' : `${fmtNum(szt, 0)} szt.`}</td>
      <td className="num">{kg(v)}</td>
    </tr>
  )
  const zal = (cat: keyof CoffeeDetails['kategorie']) =>
    k.kategorie[cat].linie
      .filter((l) => l.zalozenie)
      .map((l) => (
        <Badge key={l.posKey} kind="assumption" title={l.zalozenie}>
          założenie: {l.nazwa}
        </Badge>
      ))

  return (
    <section className="coffee">
      <h2>Kawa – szczegóły</h2>
      <div className="coffee-grid">
        <table className="grid">
          <thead>
            <tr>
              <th>Pozycja</th>
              <th className="num">Ilość</th>
              <th className="num">Ziarno</th>
            </tr>
          </thead>
          <tbody>
            {row('Napoje z ekspresu', k.kategorie.ekspres.szt, k.kategorie.ekspres.kg, '18 g / szt.')}
            {k.kategorie.przelew.linie.map((l) => row(l.nazwa, l.ilosc, l.ilJedn, `${fmtNum(l.przelicznik * 1000, 1, true)} g / szt.`))}
            {k.kategorie['cold brew'].linie.map((l) => row(l.nazwa, l.ilosc, l.ilJedn, `${fmtNum(l.przelicznik * 1000, 1, true)} g / szt.`))}
            {k.kategorie.alternatywa.linie.map((l) => row(l.nazwa, l.ilosc, l.ilJedn, `${fmtNum(l.przelicznik * 1000, 0)} g / szt.`))}
            {k.kategorie.inne.linie.map((l) => row(l.nazwa, l.ilosc, l.ilJedn, `${fmtNum(l.przelicznik * 1000, 0)} g / szt.`))}
            {k.kategorie['bez ziarna'].linie.map((l) => row(l.nazwa, l.ilosc, 0, '0 g'))}
            <tr className="group-row">
              <td>Torebki</td>
              <td className="num">{fmtNum(k.torebkiSzt, 0)} szt.</td>
              <td className="num">{kg(k.torebkiKg)}</td>
            </tr>
            {k.torebki.map((t) => (
              <tr key={t.gramatura}>
                <td className="indent">{t.gramatura >= 1000 ? `${fmtNum(t.gramatura / 1000, 1, true)} kg` : `${t.gramatura} g`}</td>
                <td className="num">{fmtNum(t.szt, 0)} szt.</td>
                <td className="num">{kg((t.szt * t.gramatura) / 1000)}</td>
              </tr>
            ))}
            {row('Pracownicy', null, k.pracownicyKg)}
            {row('Straty', null, k.stratyKg)}
          </tbody>
        </table>
        <div>
          <dl className="kv">
            <dt>Zużycie teoretyczne</dt>
            <dd>
              <ValView v={k.zuzycieTeoretyczne} fmt={kg} />
              <div className="sub">sprzedaż z kasy + pracownicy + straty</div>
            </dd>
            <dt>Zużycie faktyczne</dt>
            <dd>
              <ValView v={k.zuzycieFaktyczne} fmt={kg} />
              <div className="sub">start + zakupy − stan końcowy</div>
            </dd>
            <dt>Różnica</dt>
            <dd>
              <ValView v={c.roznica} fmt={(n) => fmtSigned(kg(n), n)} />
            </dd>
            {!month?.kgZWypalu && (
              <>
                <dt>Ile musiało wyjść z wypału</dt>
                <dd>
                  <ValView v={k.wypalPotrzebny} fmt={kg} />
                  <div className="sub">żeby bilans wyszedł na zero (koniec − start + sprzedaż + pracownicy + straty − faktury)</div>
                </dd>
              </>
            )}
            <dt>Przychód z napojów</dt>
            <dd>{fmtZl(k.przychodNapoje)}</dd>
            <dt>Koszt ziarna / przychód z napojów</dt>
            <dd>
              <ValView v={k.kosztNapojowPct} fmt={fmtPct} />
            </dd>
            <dt>Cena ziarna</dt>
            <dd>
              <ValView v={c.cena} fmt={(n) => `${fmtZl(n)} / kg`} />
              {c.cena.ok && c.cenaZrodlo !== 'ten miesiąc' && <div className="sub">ostatnia znana ({c.cenaZrodlo})</div>}
            </dd>
          </dl>
          <div className="badges">
            {zal('cold brew')}
            {zal('alternatywa')}
            {zal('inne')}
          </div>
        </div>
      </div>
    </section>
  )
}
